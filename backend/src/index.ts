import { timingSafeEqual } from 'node:crypto';

type Bindings = Env & { ADMIN_PASSWORD?: string; RESEND_API_KEY?: string; EMAIL_FROM?: string; NOTIFY_EMAIL?: string };
type Property = { id: string; name: string; capacity: number; accepts_pets: number; calendar_ready: number; data: string; version: number };
type Booking = { id: string; request_hash: string; property_id: string; checkin: string; checkout: string; status: string; version: number };
type Outbox = { id: string; audience: string; event: string; payload: string; attempts: number; lease_until: number };
class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
const fail = (status: number, message: string): never => { throw new HttpError(status, message); };
const json = (data: unknown, status = 200, headers: HeadersInit = {}) => Response.json(data, { status, headers });
const now = () => Math.floor(Date.now() / 1000);
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const addDays = (date: string, days: number) => new Date(Date.parse(date + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10);
const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))).map(b => b.toString(16).padStart(2, '0')).join('');
const propertyView = (p: Property) => ({ ...JSON.parse(p.data), id: p.id, name: p.name, capacity: p.capacity, accepts_pets: Boolean(p.accepts_pets), calendar_ready: Boolean(p.calendar_ready), version: p.version });

function str(data: Record<string, unknown>, key: string, max: number, required = true): string {
  const value = data[key];
  if (value === undefined && !required) return '';
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) fail(400, `Champ invalide : ${key}.`);
  return (value as string).trim();
}
function integer(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) fail(400, 'Nombre invalide.');
  return value as number;
}
function dateValue(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fail(400, 'Date invalide.');
  const parsed = new Date(value + 'T00:00:00Z');
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) fail(400, 'Date invalide.');
  return value;
}
function dates(start: unknown, end: unknown, max = 90) {
  const checkin = dateValue(start), checkout = dateValue(end);
  const count = (Date.parse(checkout) - Date.parse(checkin)) / 86400000;
  if (checkin < today() || checkout > addDays(today(), 731) || count < 1 || count > max) fail(400, `Choisissez une période future de 1 à ${max} jours, dans les deux prochaines années.`);
  return { checkin, checkout };
}
function contact(data: Record<string, unknown>) {
  const full_name = str(data, 'full_name', 120), email = str(data, 'email', 254).toLowerCase(), phone = str(data, 'phone', 40);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^[+\d().\s-]{6,40}$/.test(phone)) fail(400, 'Vérifiez votre email et votre téléphone.');
  if (data.consent !== true) fail(400, 'Votre accord est nécessaire pour traiter cette demande.');
  if (data.website) fail(400, 'Demande non valide.');
  return { full_name, email, phone, message: str(data, 'message', 3000, false) };
}
async function readBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.startsWith('application/json')) return fail(415, 'Format JSON requis.');
  const reader = request.body?.getReader();
  if (!reader) return fail(400, 'Demande vide.');
  let size = 0, text = '';
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 16384) { await reader.cancel(); return fail(413, 'Demande trop volumineuse.'); }
    text += decoder.decode(value, { stream: true });
  }
  try {
    const result: unknown = JSON.parse(text + decoder.decode());
    if (!result || typeof result !== 'object' || Array.isArray(result)) return fail(400, 'Demande non valide.');
    return result as Record<string, unknown>;
  } catch { return fail(400, 'JSON invalide.'); }
}
async function rateLimit(request: Request, env: Bindings, action: string, limit: number, seconds: number) {
  const window = Math.floor(now() / seconds);
  const key = `${action}:${window}:${await hash(request.headers.get('CF-Connecting-IP') || 'unknown')}`;
  const result = await env.DB.prepare('INSERT INTO rate_limits(key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(key, (window + 1) * seconds).first<{ count: number }>();
  if (!result || result.count > limit) fail(429, 'Trop de tentatives. Merci de patienter avant de réessayer.');
}
function requestKey(request: Request): string {
  const key = request.headers.get('Idempotency-Key') || '';
  if (!/^[a-zA-Z0-9-]{20,100}$/.test(key)) return fail(400, 'Identifiant de demande manquant. Rechargez la page.');
  return key;
}
async function property(env: Bindings, id: string) {
  return await env.DB.prepare('SELECT * FROM properties WHERE id=?').bind(id).first<Property>() || fail(404, 'Bien introuvable.');
}
function sessionToken(request: Request) {
  return request.headers.get('cookie')?.split(';').map(v => v.trim()).find(v => v.startsWith('passala_session='))?.slice(16) || '';
}
const cookie = (value: string, age: number) => `passala_session=${value}; Path=/api/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;
async function requireAdmin(request: Request, env: Bindings) {
  if (!env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < 16) fail(503, 'La connexion administrateur doit être configurée.');
  const token = sessionToken(request);
  if (!/^[a-f0-9]{64}$/.test(token)) fail(401, 'Connectez-vous pour accéder à cet espace.');
  const session = await env.DB.prepare('SELECT credential_tag FROM sessions WHERE token_hash=? AND expires_at>?').bind(await hash(token), now()).first<{ credential_tag: string }>();
  if (!session || session.credential_tag !== await hash(env.ADMIN_PASSWORD!)) fail(401, 'Votre session a expiré. Connectez-vous à nouveau.');
}
function emailReady(env: Bindings) { return Boolean(env.RESEND_API_KEY && env.EMAIL_FROM && env.NOTIFY_EMAIL); }

async function route(request: Request, env: Bindings, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url), path = url.pathname.replace(/\/$/, ''), method = request.method;
  if (method === 'GET' && path === '/api/health') {
    await env.DB.prepare('SELECT 1').first();
    return json({ ok: true });
  }
  if (method === 'GET' && path === '/api/properties') {
    const rows = await env.DB.prepare('SELECT * FROM properties ORDER BY name').all<Property>();
    return json({ data: rows.results.map(propertyView) });
  }
  if (method === 'GET' && path.startsWith('/api/properties/')) return json(propertyView(await property(env, decodeURIComponent(path.slice(16)))));
  if (method === 'GET' && path === '/api/availability') {
    const p = await property(env, url.searchParams.get('property_id') || '');
    if (!p.calendar_ready) fail(503, 'Les disponibilités sont en cours de vérification. Contactez-nous au 07 44 89 66 02.');
    const range = dates(url.searchParams.get('from') || today(), url.searchParams.get('to') || addDays(today(), 731), 731);
    const rows = await env.DB.prepare('SELECT date FROM occupancy WHERE property_id=? AND date>=? AND date<? ORDER BY date').bind(p.id, range.checkin, range.checkout).all<{ date: string }>();
    return json({ dates: rows.results.map(r => r.date), from: range.checkin, to: range.checkout });
  }
  if (method === 'POST' && path === '/api/bookings') {
    const data = await readBody(request), key = requestKey(request);
    const p = await property(env, str(data, 'property_id', 100));
    const person = contact(data), range = dates(data.checkin, data.checkout);
    const guests = integer(data.guests, 1, p.capacity), pets = data.pets === true ? 1 : 0;
    if (pets && !p.accepts_pets) fail(400, 'Les animaux ne sont pas acceptés dans ce logement.');
    const fingerprint = await hash(JSON.stringify({ ...person, ...range, guests, pets, property_id: p.id }));
    const existing = await env.DB.prepare('SELECT id,request_hash FROM bookings WHERE request_key=?').bind(key).first<Booking>();
    if (existing) {
      if (existing.request_hash !== fingerprint) fail(409, 'Cette demande a déjà été utilisée. Rechargez la page.');
      return json({ id: existing.id, received: true });
    }
    if (!p.calendar_ready) fail(503, 'Le calendrier doit être vérifié avant de recevoir des demandes. Contactez-nous par téléphone.');
    await rateLimit(request, env, 'booking-total', 120, 3600);
    await rateLimit(request, env, 'booking:' + await hash(person.email), 5, 3600);
    const id = crypto.randomUUID();
    try {
      await env.DB.prepare('INSERT INTO bookings(id,request_key,request_hash,property_id,checkin,checkout,guests,pets,full_name,email,phone,message) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
        .bind(id, key, fingerprint, p.id, range.checkin, range.checkout, guests, pets, person.full_name, person.email, person.phone, person.message).run();
    } catch (error) {
      const duplicate = await env.DB.prepare('SELECT id,request_hash FROM bookings WHERE request_key=?').bind(key).first<Booking>();
      if (duplicate?.request_hash === fingerprint) return json({ id: duplicate.id, received: true });
      throw error;
    }
    ctx.waitUntil(sendEmails(env));
    return json({ id, received: true }, 201);
  }
  if (method === 'POST' && path === '/api/contact') {
    const data = await readBody(request), person = contact(data), key = requestKey(request);
    const property_type = str(data, 'property_type', 80), city = str(data, 'city', 120);
    const fingerprint = await hash(JSON.stringify({ ...person, property_type, city }));
    const existing = await env.DB.prepare('SELECT id,request_hash FROM leads WHERE request_key=?').bind(key).first<{ id: string; request_hash: string }>();
    if (existing) {
      if (existing.request_hash !== fingerprint) fail(409, 'Identifiant déjà utilisé. Rechargez la page.');
      return json({ id: existing.id, received: true });
    }
    await rateLimit(request, env, 'contact-total', 60, 3600);
    await rateLimit(request, env, 'contact:' + await hash(person.email), 3, 3600);
    const id = crypto.randomUUID();
    try {
      await env.DB.prepare('INSERT INTO leads(id,request_key,request_hash,full_name,email,phone,property_type,city,message,consent) VALUES (?,?,?,?,?,?,?,?,?,1)')
        .bind(id, key, fingerprint, person.full_name, person.email, person.phone, property_type, city, person.message).run();
    } catch (error) {
      const duplicate = await env.DB.prepare('SELECT id,request_hash FROM leads WHERE request_key=?').bind(key).first<{ id: string; request_hash: string }>();
      if (duplicate?.request_hash === fingerprint) return json({ id: duplicate.id, received: true });
      throw error;
    }
    ctx.waitUntil(sendEmails(env));
    return json({ id, received: true }, 201);
  }
  if (method === 'POST' && path === '/api/admin/login') {
    if (!env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < 16) fail(503, 'Ajoutez un mot de passe administrateur dans la configuration du déploiement.');
    await rateLimit(request, env, 'login', 5, 900);
    const data = await readBody(request), password = str(data, 'password', 256);
    if (!timingSafeEqual(new TextEncoder().encode(await hash(password)), new TextEncoder().encode(await hash(env.ADMIN_PASSWORD!)))) fail(401, 'Mot de passe incorrect.');
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b => b.toString(16).padStart(2, '0')).join('');
    await env.DB.prepare('INSERT INTO sessions(token_hash,credential_tag,expires_at) VALUES (?,?,?)').bind(await hash(token), await hash(env.ADMIN_PASSWORD!), now() + 28800).run();
    return json({ authenticated: true }, 200, { 'Set-Cookie': cookie(token, 28800) });
  }
  if (path.startsWith('/api/admin/')) {
    await requireAdmin(request, env);
    if (method === 'GET' && path === '/api/admin/session') return json({ authenticated: true, email_configured: emailReady(env) });
    if (method === 'POST' && path === '/api/admin/logout') {
      await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await hash(sessionToken(request))).run();
      return json({ authenticated: false }, 200, { 'Set-Cookie': cookie('', 0) });
    }
    if (method === 'GET' && path === '/api/admin/bookings') {
      const id = url.searchParams.get('property_id') || '';
      const offset = Math.max(0, Math.min(100000, Number(url.searchParams.get('offset')) || 0));
      const rows = await env.DB.prepare('SELECT b.*, p.name AS property_name FROM bookings b JOIN properties p ON p.id=b.property_id WHERE b.property_id=? ORDER BY b.created_at DESC,b.id LIMIT 101 OFFSET ?').bind(id, offset).all();
      return json({ data: rows.results.slice(0, 100), has_more: rows.results.length > 100 });
    }
    if (method === 'PATCH' && path.startsWith('/api/admin/bookings/')) {
      const id = decodeURIComponent(path.slice(20)), data = await readBody(request), status = str(data, 'status', 20);
      if (!['pending', 'confirmed', 'rejected', 'cancelled'].includes(status)) fail(400, 'Statut invalide.');
      const version = integer(data.version, 1, 1000000);
      const current = await env.DB.prepare('SELECT * FROM bookings WHERE id=?').bind(id).first<Booking>() || fail(404, 'Réservation introuvable.');
      if (status === 'confirmed' && current.checkin < today()) fail(400, 'Impossible de confirmer un séjour passé.');
      const changed = await env.DB.prepare('UPDATE bookings SET status=?, version=version+1,updated_at=unixepoch() WHERE id=? AND version=? RETURNING id,status,version').bind(status, id, version).first();
      if (!changed) fail(409, 'Cette réservation a été modifiée. Actualisez la liste.');
      ctx.waitUntil(sendEmails(env));
      return json(changed);
    }
    if (method === 'GET' && path === '/api/admin/calendar') {
      const p = await property(env, url.searchParams.get('property_id') || '');
      const rows = await env.DB.prepare('SELECT date,booking_id,note FROM occupancy WHERE property_id=? AND date>=? ORDER BY date').bind(p.id, today()).all();
      return json({ data: rows.results, calendar_ready: Boolean(p.calendar_ready) });
    }
    if ((method === 'POST' || method === 'DELETE') && path === '/api/admin/blocks') {
      const data = await readBody(request), p = await property(env, str(data, 'property_id', 100)), range = dates(data.checkin, data.checkout);
      if (method === 'DELETE') {
        await env.DB.prepare('DELETE FROM occupancy WHERE property_id=? AND booking_id IS NULL AND date>=? AND date<?').bind(p.id, range.checkin, range.checkout).run();
      } else {
        const note = str(data, 'note', 250, false), statements = [];
        for (let date = range.checkin; date < range.checkout; date = addDays(date, 1)) statements.push(env.DB.prepare('INSERT INTO occupancy(property_id,date,note) VALUES (?,?,?)').bind(p.id, date, note));
        await env.DB.batch(statements);
      }
      return json({ saved: true });
    }
    if (method === 'PATCH' && path.startsWith('/api/admin/properties/')) {
      const p = await property(env, decodeURIComponent(path.slice(22))), input = await readBody(request);
      const version = integer(input.version, 1, 1000000), data = JSON.parse(p.data);
      const name = input.name === undefined ? p.name : str(input, 'name', 120);
      const capacity = input.capacity === undefined ? p.capacity : integer(input.capacity, 1, 30);
      for (const field of ['description', 'short_description', 'location']) if (input[field] !== undefined) data[field] = str(input, field, field === 'description' ? 5000 : 250);
      for (const [field, max] of Object.entries({ rating_airbnb: 5, rating_booking: 10, rating_airbnb_count: 1000000, rating_booking_count: 1000000, surface: 10000, bedrooms: 30, bathrooms: 30 })) {
        if (input[field] === undefined) continue;
        const value = input[field];
        if (value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max || ((field.endsWith('_count') || ['bedrooms', 'bathrooms'].includes(field)) && !Number.isInteger(value)))) fail(400, `Valeur invalide : ${field}.`);
        data[field] = value;
      }
      const ready = input.calendar_ready === undefined ? p.calendar_ready : input.calendar_ready === true ? 1 : 0;
      const pets = input.accepts_pets === undefined ? p.accepts_pets : input.accepts_pets === true ? 1 : 0;
      const updated = await env.DB.prepare('UPDATE properties SET name=?,capacity=?,calendar_ready=?,accepts_pets=?,data=?,version=version+1 WHERE id=? AND version=? RETURNING *').bind(name, capacity, ready, pets, JSON.stringify(data), p.id, version).first<Property>();
      if (!updated) fail(409, 'La fiche a été modifiée. Rechargez-la avant de réessayer.');
      return json(propertyView(updated!));
    }
    if (method === 'GET' && path === '/api/admin/leads') {
      const offset = Math.max(0, Math.min(100000, Number(url.searchParams.get('offset')) || 0));
      const rows = await env.DB.prepare('SELECT id,full_name,email,phone,property_type,city,message,status,created_at FROM leads ORDER BY created_at DESC,id LIMIT 101 OFFSET ?').bind(offset).all();
      return json({ data: rows.results.slice(0, 100), has_more: rows.results.length > 100 });
    }
    if (method === 'PATCH' && path.startsWith('/api/admin/leads/')) {
      const data = await readBody(request), status = str(data, 'status', 20);
      if (!['new', 'contacted', 'closed'].includes(status)) fail(400, 'Statut invalide.');
      const changed = await env.DB.prepare('UPDATE leads SET status=? WHERE id=? RETURNING id,status').bind(status, decodeURIComponent(path.slice(17))).first();
      if (!changed) fail(404, 'Demande introuvable.');
      return json(changed);
    }
    if (method === 'GET' && path === '/api/admin/emails') {
      return json({ configured: emailReady(env), counts: (await env.DB.prepare('SELECT state,COUNT(*) AS count FROM email_outbox GROUP BY state').all()).results });
    }
  }
  return fail(404, 'Ressource introuvable.');
}

function emailContent(row: Outbox): { subject: string; text: string; email: string } {
  const p = JSON.parse(row.payload) as Record<string, string | number>;
  if (row.event === 'lead.created') return { email: String(p.email), subject: 'Nouvelle demande de contact — Passala', text: `${p.name}\n${p.email}\n${p.phone}\n${p.property_type} à ${p.city}\n\n${p.message}` };
  const labels: Record<string, string> = { 'booking.pending': 'Demande de réservation reçue', 'booking.confirmed': 'Réservation confirmée', 'booking.rejected': 'Demande de réservation refusée', 'booking.cancelled': 'Réservation annulée' };
  const label = labels[row.event] || 'Mise à jour de votre réservation';
  const intro = row.audience === 'guest' ? `Bonjour ${p.name},\n\n${label} pour ${p.property}.` : `${label} — ${p.property}\n${p.name}\n${p.email}\n${p.phone}`;
  const pending = row.event === 'booking.pending' ? '\nCette demande ne vaut pas confirmation. Les dates restent disponibles jusqu’à validation par notre équipe.' : '';
  return { email: String(p.email), subject: `${label} — ${p.property}`, text: `${intro}\nArrivée : ${p.checkin}\nDépart : ${p.checkout}\nVoyageurs : ${p.guests}\nRéférence : ${p.id}${pending}\n\n${row.audience === 'admin' ? p.message || '' : 'Passala Conciergerie — 07 44 89 66 02'}` };
}

async function sendEmails(env: Bindings) {
  if (!emailReady(env)) return;
  try {
    // Resend idempotency lasts 24 h. Stop automatic retries before that window ends.
    await env.DB.prepare("UPDATE email_outbox SET state='failed',last_error='manual_review_required' WHERE state IN ('pending','sending') AND created_at<? AND lease_until<?").bind(now() - 23 * 3600, now()).run();
    for (let i = 0; i < 10; i++) {
      const lease = now() + 120;
      const row = await env.DB.prepare("UPDATE email_outbox SET state='sending',lease_until=?,attempts=attempts+1 WHERE id=(SELECT id FROM email_outbox WHERE (state='pending' OR state='sending') AND next_attempt<=? AND lease_until<? ORDER BY created_at,id LIMIT 1) RETURNING *").bind(lease, now(), now()).first<Outbox>();
      if (!row) break;
      try {
        const message = emailContent(row);
        const result = await fetch('https://api.resend.com/emails', {
          method: 'POST', signal: AbortSignal.timeout(15000),
          headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `passala/${row.id}` },
          body: JSON.stringify({ from: env.EMAIL_FROM, to: [row.audience === 'guest' ? message.email : env.NOTIFY_EMAIL], subject: message.subject, text: message.text })
        });
        await result.body?.cancel();
        if (!result.ok) throw new Error(`resend_${result.status}`);
        await env.DB.prepare("UPDATE email_outbox SET state='sent',sent_at=?,lease_until=0,last_error=NULL WHERE id=? AND lease_until=?").bind(now(), row.id, lease).run();
      } catch {
        await env.DB.prepare("UPDATE email_outbox SET state=?,next_attempt=?,lease_until=0,last_error='delivery_failed' WHERE id=? AND lease_until=?")
          .bind(row.attempts >= 12 ? 'failed' : 'pending', now() + Math.min(3600, 60 * 2 ** Math.min(row.attempts, 6)), row.id, lease).run();
      }
    }
  } catch { console.error(JSON.stringify({ event: 'email_outbox_unavailable' })); }
}

export default {
  async fetch(request: Request, env: Bindings, ctx: ExecutionContext) {
    const origin = request.headers.get('Origin');
    const allowed = env.ALLOWED_ORIGINS.split(',').map(v => v.trim());
    const headers: Record<string, string> = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', Vary: 'Origin' };
    if (origin && allowed.includes(origin)) Object.assign(headers, { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true' });
    let response: Response;
    try {
      if (origin && !allowed.includes(origin)) fail(403, 'Origine non autorisée.');
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Idempotency-Key, X-Passala-Request' } });
      if (!['GET', 'HEAD'].includes(request.method) && request.headers.get('X-Passala-Request') !== '1') fail(403, 'Requête non autorisée.');
      response = await route(request, env, ctx);
    } catch (error) {
      if (error instanceof HttpError) response = json({ error: error.message }, error.status);
      else if (error instanceof Error && /dates_unavailable|UNIQUE constraint failed: occupancy/.test(error.message)) response = json({ error: 'Ces dates sont déjà occupées. Actualisez le calendrier et choisissez une autre période.' }, 409);
      else { console.error(JSON.stringify({ event: 'api_error', path: new URL(request.url).pathname })); response = json({ error: 'Service momentanément indisponible. Réessayez dans quelques instants.' }, 503); }
    }
    const result = new Response(response.body, response);
    for (const [key, value] of Object.entries(headers)) result.headers.set(key, value);
    return result;
  },
  async scheduled(_event: ScheduledController, env: Bindings, ctx: ExecutionContext) {
    ctx.waitUntil(Promise.all([
      sendEmails(env),
      env.DB.batch([env.DB.prepare('DELETE FROM sessions WHERE expires_at<?').bind(now()), env.DB.prepare('DELETE FROM rate_limits WHERE expires_at<?').bind(now())])
    ]));
  }
};
