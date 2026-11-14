// Routes publiques : biens, disponibilités, demandes de réservation, contact, photos.
import { type Bindings, addDays, bookingReference, contact, fail, int, json, rateLimit, readJson, requestKey, sha256, stay, str, today } from './lib';
import { estimate, loadProperties, loadProperty, view } from './properties';
import { sendEmails } from './email';

export async function publicRoute(request: Request, env: Bindings, ctx: ExecutionContext, url: URL, path: string): Promise<Response | null> {
  const method = request.method;

  if (method === 'GET' && path === '/api/health') {
    await env.DB.prepare('SELECT 1').first();
    return json({ ok: true });
  }

  if (method === 'GET' && path === '/api/properties') {
    const { properties, photos } = await loadProperties(env, { publishedOnly: true });
    return json({ data: properties.map(p => view(p, photos)) });
  }

  if (method === 'GET' && path.startsWith('/api/properties/')) {
    const { property, photos } = await loadProperty(env, decodeURIComponent(path.slice(16)), { publishedOnly: true });
    return json(view(property, photos));
  }

  if (method === 'GET' && path === '/api/availability') {
    const { property } = await loadProperty(env, url.searchParams.get('property_id') || '', { publishedOnly: true });
    const from = today(), to = addDays(from, 731);
    const rows = await env.DB.prepare('SELECT date FROM occupancy WHERE property_id=? AND date>=? AND date<? ORDER BY date').bind(property.id, from, to).all<{ date: string }>();
    return json({ dates: rows.results.map(r => r.date), from, to, min_nights: property.min_nights });
  }

  if (method === 'GET' && path === '/api/quote') {
    const { property } = await loadProperty(env, url.searchParams.get('property_id') || '', { publishedOnly: true });
    const range = stay(url.searchParams.get('checkin'), url.searchParams.get('checkout'));
    return json({ nights: range.nights, nightly_price: property.nightly_price, cleaning_fee: property.cleaning_fee, total: estimate(property, range.nights), min_nights: property.min_nights });
  }

  if (method === 'POST' && path === '/api/bookings') {
    const data = await readJson(request), key = requestKey(request);
    const { property } = await loadProperty(env, str(data, 'property_id', 100), { publishedOnly: true });
    if (!property.direct_booking) fail(400, 'Ce logement ne se réserve pas directement sur le site. Contactez-nous.');
    const person = contact(data), range = stay(data.checkin, data.checkout);
    if (range.nights < property.min_nights) fail(400, `Ce logement se réserve pour ${property.min_nights} nuits minimum.`);
    const guests = int(data, 'guests', 1, property.capacity) as number, pets = data.pets === true ? 1 : 0;
    if (pets && !property.accepts_pets) fail(400, 'Les animaux ne sont pas acceptés dans ce logement.');

    const fingerprint = await sha256(JSON.stringify({ ...person, checkin: range.checkin, checkout: range.checkout, guests, pets, property_id: property.id }));
    const existing = await env.DB.prepare('SELECT id,reference,request_hash FROM bookings WHERE request_key=?').bind(key).first<{ id: string; reference: string; request_hash: string }>();
    if (existing) {
      if (existing.request_hash !== fingerprint) fail(409, 'Cette demande a déjà été envoyée. Rechargez la page.');
      return json({ reference: existing.reference, received: true });
    }
    await rateLimit(request, env, 'booking-ip', 20, 3600);
    await rateLimit(request, env, 'booking-email', 5, 3600, person.email);

    const id = crypto.randomUUID(), reference = bookingReference(), total = estimate(property, range.nights);
    try {
      await env.DB.prepare('INSERT INTO bookings(id,reference,request_key,request_hash,property_id,checkin,checkout,guests,pets,full_name,email,phone,message,source,estimated_total) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .bind(id, reference, key, fingerprint, property.id, range.checkin, range.checkout, guests, pets, person.full_name, person.email, person.phone, person.message, 'site', total).run();
    } catch (error) {
      const duplicate = await env.DB.prepare('SELECT reference,request_hash FROM bookings WHERE request_key=?').bind(key).first<{ reference: string; request_hash: string }>();
      if (duplicate?.request_hash === fingerprint) return json({ reference: duplicate.reference, received: true });
      throw error;
    }
    ctx.waitUntil(sendEmails(env));
    return json({ reference, received: true, estimated_total: total }, 201);
  }

  if (method === 'POST' && path === '/api/contact') {
    const data = await readJson(request), person = contact(data), key = requestKey(request);
    const property_type = str(data, 'property_type', 80), city = str(data, 'city', 120);
    const fingerprint = await sha256(JSON.stringify({ ...person, property_type, city }));
    const existing = await env.DB.prepare('SELECT id,request_hash FROM leads WHERE request_key=?').bind(key).first<{ id: string; request_hash: string }>();
    if (existing) {
      if (existing.request_hash !== fingerprint) fail(409, 'Cette demande a déjà été envoyée. Rechargez la page.');
      return json({ received: true });
    }
    await rateLimit(request, env, 'contact-ip', 10, 3600);
    await rateLimit(request, env, 'contact-email', 3, 3600, person.email);
    await env.DB.prepare('INSERT INTO leads(id,request_key,request_hash,full_name,email,phone,property_type,city,message) VALUES (?,?,?,?,?,?,?,?,?)')
      .bind(crypto.randomUUID(), key, fingerprint, person.full_name, person.email, person.phone, property_type, city, person.message).run();
    ctx.waitUntil(sendEmails(env));
    return json({ received: true }, 201);
  }

  if ((method === 'GET' || method === 'HEAD') && path.startsWith('/api/photos/')) {
    const key = decodeURIComponent(path.slice(12));
    if (!/^properties\/[a-z0-9-]+\/[a-f0-9-]{36}\.(jpg|png|webp)$/.test(key)) fail(404, 'Photo introuvable.');
    const object = await env.PHOTOS.get(key);
    if (!object) return fail(404, 'Photo introuvable.');
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    return new Response(method === 'HEAD' ? null : object.body, { headers });
  }

  return null;
}

