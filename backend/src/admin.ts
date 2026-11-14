// Routes de l'espace administrateur (toutes protégées par une session).
import { type Bindings, addDays, bookingReference, fail, int, json, nightsBetween, now, offsetParam, rateLimit, readJson, sha256, slugify, stay, str, today } from './lib';
import { createSession, requireAdmin, sessionCookie, sessionToken, setPassword, verifyLogin } from './auth';
import { estimate, loadProperties, loadProperty, propertyFields, view, type PhotoRow } from './properties';
import { emailReady, sendEmails } from './email';

const TRANSITIONS: Record<string, string[]> = {
  pending: ['confirmed', 'rejected'],
  confirmed: ['cancelled'],
  rejected: ['pending'],
  cancelled: ['pending']
};
const SOURCES = ['airbnb', 'booking', 'telephone', 'autre'];
const PHOTO_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

const BOOKING_SELECT = `SELECT b.id,b.reference,b.property_id,p.name AS property_name,b.checkin,b.checkout,b.guests,b.pets,b.full_name,b.email,b.phone,b.message,
  b.source,b.status,b.estimated_total,b.admin_note,b.version,b.created_at,b.updated_at,b.decided_at,
  (SELECT COUNT(*) FROM occupancy o WHERE o.property_id=b.property_id AND o.date>=b.checkin AND o.date<b.checkout AND (o.booking_id IS NULL OR o.booking_id!=b.id)) AS blocked_nights,
  (SELECT COUNT(*) FROM bookings x WHERE x.property_id=b.property_id AND x.id!=b.id AND x.status='pending' AND x.checkin<b.checkout AND x.checkout>b.checkin) AS overlapping_requests
  FROM bookings b JOIN properties p ON p.id=b.property_id`;

export async function adminRoute(request: Request, env: Bindings, ctx: ExecutionContext, url: URL, path: string): Promise<Response | null> {
  const method = request.method;
  if (!path.startsWith('/api/admin/')) return null;

  // ───── Connexion ─────
  if (method === 'POST' && path === '/api/admin/login') {
    const data = await readJson(request);
    const email = str(data, 'email', 254).toLowerCase(), password = str(data, 'password', 256);
    await rateLimit(request, env, 'login-ip', 10, 900);
    await rateLimit(request, env, 'login-email', 10, 900, email);
    const user = await verifyLogin(env, email, password);
    return json({ authenticated: true, email: user.email }, 200, { 'Set-Cookie': await createSession(env, user.id) });
  }

  const user = await requireAdmin(request, env);

  if (method === 'GET' && path === '/api/admin/session') return json({ authenticated: true, email: user.email, email_configured: emailReady(env) });

  if (method === 'POST' && path === '/api/admin/logout') {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha256(sessionToken(request))).run();
    return json({ authenticated: false }, 200, { 'Set-Cookie': sessionCookie('', 0) });
  }

  if (method === 'POST' && path === '/api/admin/password') {
    const data = await readJson(request);
    await rateLimit(request, env, 'password', 5, 900, user.id);
    await verifyLogin(env, user.email, str(data, 'current', 256));
    await setPassword(env, user.id, str(data, 'password', 256));
    return json({ changed: true }, 200, { 'Set-Cookie': sessionCookie('', 0) });
  }

  // ───── Tableau de bord ─────
  if (method === 'GET' && path === '/api/admin/dashboard') {
    const t = today(), monthStart = t.slice(0, 8) + '01';
    const next = new Date(Date.parse(monthStart + 'T00:00:00Z')); next.setUTCMonth(next.getUTCMonth() + 1);
    const monthEnd = next.toISOString().slice(0, 10), days = nightsBetween(monthStart, monthEnd);
    const [counts, arrivals, departures, current, occupancy, revenue, published] = await env.DB.batch([
      env.DB.prepare(`SELECT (SELECT COUNT(*) FROM bookings WHERE status='pending') AS pending,
        (SELECT COUNT(*) FROM leads WHERE status='new') AS new_leads,
        (SELECT COUNT(*) FROM email_outbox WHERE state='failed') AS failed_emails`),
      env.DB.prepare(`${BOOKING_SELECT} WHERE b.status='confirmed' AND b.checkin>=? AND b.checkin<? ORDER BY b.checkin LIMIT 20`).bind(t, addDays(t, 30)),
      env.DB.prepare(`${BOOKING_SELECT} WHERE b.status='confirmed' AND b.checkout>=? AND b.checkout<? ORDER BY b.checkout LIMIT 20`).bind(t, addDays(t, 14)),
      env.DB.prepare(`${BOOKING_SELECT} WHERE b.status='confirmed' AND b.checkin<=? AND b.checkout>? ORDER BY b.checkout`).bind(t, t),
      env.DB.prepare('SELECT COUNT(*) AS nights FROM occupancy o JOIN properties p ON p.id=o.property_id WHERE p.published=1 AND o.booking_id IS NOT NULL AND o.date>=? AND o.date<?').bind(monthStart, monthEnd),
      env.DB.prepare("SELECT COALESCE(SUM(estimated_total),0) AS total, COUNT(*) AS count FROM bookings WHERE status='confirmed' AND checkin>=? AND checkin<?").bind(monthStart, monthEnd),
      env.DB.prepare('SELECT COUNT(*) AS n FROM properties WHERE published=1')
    ]);
    const c = counts.results[0] as Record<string, number>;
    const props = (published.results[0] as { n: number }).n;
    const nights = (occupancy.results[0] as { nights: number }).nights;
    const rev = revenue.results[0] as { total: number; count: number };
    return json({
      today: t, month: monthStart.slice(0, 7),
      pending: c.pending, new_leads: c.new_leads, failed_emails: c.failed_emails, email_configured: emailReady(env),
      occupancy_rate: props ? Math.round((nights / (props * days)) * 100) : 0,
      month_revenue: rev.total, month_bookings: rev.count,
      arrivals: arrivals.results, departures: departures.results, in_house: current.results
    });
  }

  // ───── Réservations ─────
  if (method === 'GET' && path === '/api/admin/bookings') {
    const where: string[] = [], binds: unknown[] = [];
    const status = url.searchParams.get('status') || '';
    if (status) { if (!TRANSITIONS[status]) fail(400, 'Statut invalide.'); where.push('b.status=?'); binds.push(status); }
    const pid = url.searchParams.get('property_id') || '';
    if (pid) { where.push('b.property_id=?'); binds.push(pid); }
    const period = url.searchParams.get('period') || '';
    if (period === 'upcoming') { where.push('b.checkout>=?'); binds.push(today()); }
    if (period === 'past') { where.push('b.checkout<?'); binds.push(today()); }
    const q = (url.searchParams.get('q') || '').trim().slice(0, 80);
    if (q) { where.push('(b.full_name LIKE ? OR b.email LIKE ? OR b.reference LIKE ? OR b.phone LIKE ?)'); const like = `%${q.replace(/[%_]/g, '')}%`; binds.push(like, like, like, like); }
    const offset = offsetParam(url);
    const order = period === 'past' ? 'b.checkin DESC' : "CASE b.status WHEN 'pending' THEN 0 ELSE 1 END, b.checkin";
    const rows = await env.DB.prepare(`${BOOKING_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${order}, b.id LIMIT 51 OFFSET ?`).bind(...binds, offset).all();
    return json({ data: rows.results.slice(0, 50), has_more: rows.results.length > 50 });
  }

  if (method === 'POST' && path === '/api/admin/bookings') {
    // Réservation saisie à la main (Airbnb, Booking, téléphone…) : confirmée immédiatement.
    const data = await readJson(request);
    const { property } = await loadProperty(env, str(data, 'property_id', 100), { publishedOnly: false });
    const range = stay(data.checkin, data.checkout, { future: false, max: 365 });
    const source = str(data, 'source', 20);
    if (!SOURCES.includes(source)) fail(400, 'Origine invalide.');
    const guests = int(data, 'guests', 1, 30) as number;
    const total = data.estimated_total === undefined || data.estimated_total === null ? estimate(property, range.nights) : int(data, 'estimated_total', 0, 100_000_000);
    const id = crypto.randomUUID(), reference = bookingReference();
    await env.DB.batch([
      env.DB.prepare('INSERT INTO bookings(id,reference,property_id,checkin,checkout,guests,pets,full_name,email,phone,message,source,estimated_total,admin_note) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .bind(id, reference, property.id, range.checkin, range.checkout, guests, data.pets === true ? 1 : 0, str(data, 'full_name', 120),
          str(data, 'email', 254, false).toLowerCase(), str(data, 'phone', 40, false), '', source, total, str(data, 'admin_note', 2000, false)),
      env.DB.prepare("UPDATE bookings SET status='confirmed',version=version+1,decided_at=unixepoch() WHERE id=?").bind(id)
    ]);
    return json({ id, reference }, 201);
  }

  if (method === 'PATCH' && path.startsWith('/api/admin/bookings/')) {
    const id = decodeURIComponent(path.slice(20)), data = await readJson(request);
    const version = int(data, 'version', 1, 1_000_000) as number;
    const current = await env.DB.prepare('SELECT status,checkout FROM bookings WHERE id=?').bind(id).first<{ status: string; checkout: string }>() || fail(404, 'Réservation introuvable.');
    const status = data.status === undefined ? current.status : str(data, 'status', 20);
    if (status !== current.status && !TRANSITIONS[current.status]?.includes(status)) fail(400, 'Changement de statut non autorisé.');
    if (status === 'confirmed' && current.checkout <= today()) fail(400, 'Impossible de confirmer un séjour déjà terminé.');
    const note = data.admin_note === undefined ? null : str(data, 'admin_note', 2000, false);
    const changed = await env.DB.prepare(`UPDATE bookings SET status=?, admin_note=COALESCE(?,admin_note), version=version+1, updated_at=unixepoch(),
        decided_at=CASE WHEN ?!=status THEN unixepoch() ELSE decided_at END WHERE id=? AND version=? RETURNING id`)
      .bind(status, note, status, id, version).first();
    if (!changed) fail(409, 'Cette réservation a été modifiée entre-temps. Actualisez la liste.');
    ctx.waitUntil(sendEmails(env));
    return json(await env.DB.prepare(`${BOOKING_SELECT} WHERE b.id=?`).bind(id).first());
  }

  // ───── Calendrier ─────
  if (method === 'GET' && path === '/api/admin/calendar') {
    const { property } = await loadProperty(env, url.searchParams.get('property_id') || '', { publishedOnly: false });
    const from = url.searchParams.get('from') || addDays(today(), -31), to = url.searchParams.get('to') || addDays(today(), 400);
    stay(from, to, { future: false, max: 800 });
    const [nights, requests] = await env.DB.batch([
      env.DB.prepare('SELECT o.date,o.note,o.booking_id,b.reference,b.full_name,b.source FROM occupancy o LEFT JOIN bookings b ON b.id=o.booking_id WHERE o.property_id=? AND o.date>=? AND o.date<? ORDER BY o.date').bind(property.id, from, to),
      env.DB.prepare("SELECT id,reference,full_name,checkin,checkout FROM bookings WHERE property_id=? AND status='pending' AND checkout>? AND checkin<? ORDER BY checkin").bind(property.id, from, to)
    ]);
    return json({ nights: nights.results, pending: requests.results });
  }

  if ((method === 'POST' || method === 'DELETE') && path === '/api/admin/blocks') {
    const data = await readJson(request);
    const { property } = await loadProperty(env, str(data, 'property_id', 100), { publishedOnly: false });
    const range = stay(data.checkin, data.checkout, { future: false, max: 365 });
    if (method === 'DELETE') {
      const result = await env.DB.prepare('DELETE FROM occupancy WHERE property_id=? AND booking_id IS NULL AND date>=? AND date<?').bind(property.id, range.checkin, range.checkout).run();
      return json({ released: result.meta.changes });
    }
    const note = str(data, 'note', 250, false), statements = [];
    for (let d = range.checkin; d < range.checkout; d = addDays(d, 1)) statements.push(env.DB.prepare('INSERT INTO occupancy(property_id,date,note) VALUES (?,?,?)').bind(property.id, d, note));
    await env.DB.batch(statements);
    return json({ blocked: statements.length }, 201);
  }

  // ───── Biens ─────
  if (method === 'GET' && path === '/api/admin/properties') {
    const { properties, photos } = await loadProperties(env, { publishedOnly: false });
    return json({ data: properties.map(p => view(p, photos, true)) });
  }

  if (method === 'POST' && path === '/api/admin/properties') {
    const data = await readJson(request), fields = propertyFields(data);
    if (!fields.name) fail(400, 'Le nom du bien est obligatoire.');
    let id = slugify(String(fields.name));
    for (let i = 2; await env.DB.prepare('SELECT 1 FROM properties WHERE id=?').bind(id).first(); i++) id = `${slugify(String(fields.name)).slice(0, 55)}-${i}`;
    const cols = Object.keys(fields);
    await env.DB.prepare(`INSERT INTO properties(id,${cols.join(',')}) VALUES (?,${cols.map(() => '?').join(',')})`).bind(id, ...Object.values(fields)).run();
    const { property, photos } = await loadProperty(env, id, { publishedOnly: false });
    return json(view(property, photos, true), 201);
  }

  const photoMatch = path.match(/^\/api\/admin\/properties\/([a-z0-9-]+)\/photos(\/order)?$/);
  if (photoMatch) {
    const { property } = await loadProperty(env, photoMatch[1], { publishedOnly: false });
    if (method === 'POST' && !photoMatch[2]) {
      const type = (request.headers.get('content-type') || '').split(';')[0].trim(), ext = PHOTO_TYPES[type];
      if (!ext) fail(415, 'Format accepté : JPEG, PNG ou WebP.');
      if (Number(request.headers.get('content-length') || 0) > MAX_PHOTO_BYTES) fail(413, 'Photo trop lourde (10 Mo maximum).');
      const body = await request.arrayBuffer();
      if (!body.byteLength || body.byteLength > MAX_PHOTO_BYTES) fail(413, 'Photo vide ou trop lourde (10 Mo maximum).');
      const count = await env.DB.prepare('SELECT COUNT(*) AS n, COALESCE(MAX(position),-1) AS last FROM property_photos WHERE property_id=?').bind(property.id).first<{ n: number; last: number }>();
      if (count && count.n >= 30) fail(400, 'Maximum 30 photos par bien.');
      const id = crypto.randomUUID(), key = `properties/${property.id}/${id}.${ext}`;
      await env.PHOTOS.put(key, body, { httpMetadata: { contentType: type } });
      const alt = (request.headers.get('X-Photo-Alt') || '').slice(0, 200);
      await env.DB.prepare('INSERT INTO property_photos(id,property_id,url,r2_key,alt,position) VALUES (?,?,?,?,?,?)')
        .bind(id, property.id, `/api/photos/${key}`, key, decodeURIComponent(alt) || property.name, (count?.last ?? -1) + 1).run();
      return json({ id, url: `/api/photos/${key}` }, 201);
    }
    if (method === 'PUT' && photoMatch[2]) {
      const data = await readJson(request), ids = data.ids;
      if (!Array.isArray(ids) || ids.some(i => typeof i !== 'string')) fail(400, 'Ordre invalide.');
      await env.DB.batch((ids as string[]).map((pid, i) => env.DB.prepare('UPDATE property_photos SET position=? WHERE id=? AND property_id=?').bind(i, pid, property.id)));
      return json({ saved: true });
    }
  }

  if (path.startsWith('/api/admin/photos/')) {
    const id = decodeURIComponent(path.slice(18));
    const photo = await env.DB.prepare('SELECT * FROM property_photos WHERE id=?').bind(id).first<PhotoRow>() || fail(404, 'Photo introuvable.');
    if (method === 'DELETE') {
      if (photo.r2_key) await env.PHOTOS.delete(photo.r2_key);
      await env.DB.prepare('DELETE FROM property_photos WHERE id=?').bind(id).run();
      return json({ deleted: true });
    }
    if (method === 'PATCH') {
      const data = await readJson(request);
      await env.DB.prepare('UPDATE property_photos SET alt=? WHERE id=?').bind(str(data, 'alt', 200, false), id).run();
      return json({ saved: true });
    }
  }

  if (path.startsWith('/api/admin/properties/')) {
    const id = decodeURIComponent(path.slice(22));
    const { property } = await loadProperty(env, id, { publishedOnly: false });
    if (method === 'PATCH') {
      const data = await readJson(request), version = int(data, 'version', 1, 1_000_000), fields = propertyFields(data);
      const cols = Object.keys(fields);
      const updated = await env.DB.prepare(`UPDATE properties SET ${cols.map(c => c + '=?').concat('version=version+1', 'updated_at=unixepoch()').join(',')} WHERE id=? AND version=? RETURNING id`)
        .bind(...Object.values(fields), property.id, version).first();
      if (!updated) fail(409, 'La fiche a été modifiée entre-temps. Rechargez-la avant de réessayer.');
      const fresh = await loadProperty(env, id, { publishedOnly: false });
      return json(view(fresh.property, fresh.photos, true));
    }
    if (method === 'DELETE') {
      const used = await env.DB.prepare('SELECT COUNT(*) AS n FROM bookings WHERE property_id=?').bind(id).first<{ n: number }>();
      if (used && used.n > 0) fail(409, 'Ce bien a un historique de réservations : dépubliez-le plutôt que de le supprimer.');
      const photos = await env.DB.prepare('SELECT r2_key FROM property_photos WHERE property_id=? AND r2_key IS NOT NULL').bind(id).all<{ r2_key: string }>();
      if (photos.results.length) await env.PHOTOS.delete(photos.results.map(p => p.r2_key));
      await env.DB.prepare('DELETE FROM properties WHERE id=?').bind(id).run();
      return json({ deleted: true });
    }
  }

  // ───── Contacts propriétaires ─────
  if (method === 'GET' && path === '/api/admin/leads') {
    const status = url.searchParams.get('status') || '', offset = offsetParam(url);
    if (status && !['new', 'contacted', 'closed'].includes(status)) fail(400, 'Statut invalide.');
    const rows = await env.DB.prepare(`SELECT id,full_name,email,phone,property_type,city,message,status,created_at FROM leads ${status ? 'WHERE status=?' : ''} ORDER BY created_at DESC,id LIMIT 51 OFFSET ?`)
      .bind(...(status ? [status] : []), offset).all();
    return json({ data: rows.results.slice(0, 50), has_more: rows.results.length > 50 });
  }
  if (path.startsWith('/api/admin/leads/')) {
    const id = decodeURIComponent(path.slice(17));
    if (method === 'PATCH') {
      const data = await readJson(request), status = str(data, 'status', 20);
      if (!['new', 'contacted', 'closed'].includes(status)) fail(400, 'Statut invalide.');
      const changed = await env.DB.prepare('UPDATE leads SET status=? WHERE id=? RETURNING id,status').bind(status, id).first();
      return json(changed || fail(404, 'Demande introuvable.'));
    }
    if (method === 'DELETE') {
      await env.DB.prepare('DELETE FROM leads WHERE id=?').bind(id).run();
      return json({ deleted: true });
    }
  }

  // ───── Emails ─────
  if (method === 'GET' && path === '/api/admin/emails') {
    const [counts, failed] = await env.DB.batch([
      env.DB.prepare('SELECT state,COUNT(*) AS count FROM email_outbox GROUP BY state'),
      env.DB.prepare("SELECT id,event,audience,attempts,last_error,created_at FROM email_outbox WHERE state='failed' ORDER BY created_at DESC LIMIT 20")
    ]);
    return json({ configured: emailReady(env), counts: counts.results, failed: failed.results });
  }
  if (method === 'POST' && path === '/api/admin/emails/retry') {
    const result = await env.DB.prepare("UPDATE email_outbox SET state='pending',attempts=0,next_attempt=?,created_at=?,last_error=NULL WHERE state='failed'").bind(now(), now()).run();
    ctx.waitUntil(sendEmails(env));
    return json({ requeued: result.meta.changes });
  }

  return null;
}
