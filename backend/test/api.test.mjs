import { before, beforeEach, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { webcrypto as crypto } from 'node:crypto';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { splitSql } from '../../scripts/sql.mjs';

let mf, db, cookie;
const origin = 'https://passalaconciergerie.com';
const admin = { email: 'admin@example.com', password: 'mot-de-passe-de-test-1234' };
const day = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const guest = (start = 10, end = 13, extra = {}) => ({ property_id: 'le-cosi', checkin: day(start), checkout: day(end), guests: 2, pets: false, full_name: 'Client Test', email: 'client@example.com', phone: '0600000000', message: 'Bonjour', consent: true, ...extra });

async function call(path, { method = 'GET', data, auth = false, key, headers = {}, body } = {}) {
  const h = { Origin: origin, 'CF-Connecting-IP': '192.0.2.1', ...(auth ? { Cookie: cookie } : {}), ...(method !== 'GET' ? { 'X-Passala-Request': '1' } : {}), ...(data ? { 'Content-Type': 'application/json' } : {}), ...(key ? { 'Idempotency-Key': key } : {}), ...headers };
  const response = await mf.dispatchFetch(origin + '/api' + path, { method, headers: h, body: data ? JSON.stringify(data) : body });
  const type = response.headers.get('content-type') || '';
  return { status: response.status, headers: response.headers, data: type.includes('json') ? await response.json() : await response.arrayBuffer() };
}
const book = (start, end, extra) => call('/bookings', { method: 'POST', data: guest(start, end, extra), key: crypto.randomUUID() });
const bookingByRef = ref => db.prepare('SELECT * FROM bookings WHERE reference=?').bind(ref).first();
const setStatus = (id, status, version) => call('/admin/bookings/' + id, { method: 'PATCH', auth: true, data: { status, version } });

async function pbkdf2(password, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: 100000 }, key, 256);
  return Buffer.from(bits).toString('hex');
}

before(async () => {
  await build({ entryPoints: ['backend/src/index.ts'], bundle: true, format: 'esm', platform: 'browser', outfile: 'backend/test/worker-bundle.mjs', logLevel: 'error' });
  mf = new Miniflare(convertV4MiniflareOptions({ modules: true, scriptPath: 'backend/test/worker-bundle.mjs', compatibilityDate: '2026-10-16', d1Databases: ['DB'], r2Buckets: ['PHOTOS'], bindings: { ALLOWED_ORIGINS: origin } }));
  db = await mf.getD1Database('DB');
  for (const file of (await readdir('backend/migrations')).sort()) {
    for (const statement of splitSql(await readFile('backend/migrations/' + file, 'utf8'))) await db.prepare(statement).run();
  }
  await db.prepare('INSERT INTO admin_users(id,email,password_hash,salt,iterations) VALUES (?,?,?,?,100000)').bind('u1', admin.email, await pbkdf2(admin.password, 'sel-test'), 'sel-test').run();
});
beforeEach(async () => {
  await db.batch(['DELETE FROM occupancy', 'DELETE FROM bookings', 'DELETE FROM leads', 'DELETE FROM email_outbox', 'DELETE FROM sessions', 'DELETE FROM rate_limits', 'UPDATE properties SET nightly_price=NULL, cleaning_fee=0, min_nights=1, direct_booking=1, published=1'].map(s => db.prepare(s)));
  const login = await call('/admin/login', { method: 'POST', data: admin });
  assert.equal(login.status, 200, JSON.stringify(login.data));
  cookie = login.headers.get('set-cookie').split(';')[0];
});
after(async () => { await mf?.dispose(); });

test('les données privées exigent une session ; cookie protégé ; CSRF et origines refusés', async () => {
  assert.equal((await call('/admin/bookings')).status, 401);
  const login = await call('/admin/login', { method: 'POST', data: admin });
  assert.match(login.headers.get('set-cookie'), /HttpOnly; Secure; SameSite=Strict/);
  assert.equal((await call('/admin/login', { method: 'POST', data: { ...admin, password: 'mauvais-mot-de-passe' } })).status, 401);
  assert.equal((await call('/admin/blocks', { method: 'POST', auth: true, data: {}, headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await call('/admin/blocks', { method: 'POST', auth: true, data: {}, headers: { 'X-Passala-Request': '' } })).status, 403);
  assert.equal((await call('/admin/session', { auth: true })).status, 200);
  await call('/admin/logout', { method: 'POST', auth: true, data: {} });
  assert.equal((await call('/admin/session', { auth: true })).status, 401);
});

test('le site public ne voit que les biens publiés, avec leurs photos', async () => {
  const list = await call('/properties');
  assert.equal(list.data.data.length, 1);
  assert.equal(list.data.data[0].photos.length, 5);
  assert.equal(list.data.data[0].published, undefined, 'les champs admin ne fuient pas');
  await db.prepare('UPDATE properties SET published=0').run();
  assert.equal((await call('/properties')).data.data.length, 0);
  assert.equal((await call('/properties/le-cosi')).status, 404);
  assert.equal((await book()).status, 404);
});

test('une demande reste en attente jusqu\'à validation, puis bloque les dates', async () => {
  const r = await book(10, 13);
  assert.equal(r.status, 201);
  assert.match(r.data.reference, /^PAS-[A-Z0-9]{6}$/);
  assert.equal((await call('/availability?property_id=le-cosi')).data.dates.length, 0, 'une demande ne bloque rien');
  const b = await bookingByRef(r.data.reference);
  const ok = await setStatus(b.id, 'confirmed', b.version);
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.deepEqual((await call('/availability?property_id=le-cosi')).data.dates, [day(10), day(11), day(12)]);
  assert.equal((await book(12, 14)).status, 409, 'nouvelle demande sur des nuits confirmées refusée');
  assert.equal((await book(13, 15)).status, 201, 'le jour du départ reste libre');
  const cancel = await setStatus(b.id, 'cancelled', ok.data.version);
  assert.equal(cancel.status, 200);
  assert.equal((await call('/availability?property_id=le-cosi')).data.dates.length, 0, 'l\'annulation libère les nuits');
});

test('deux demandes qui se chevauchent : une seule peut être confirmée', async () => {
  const a = await bookingByRef((await book(10, 13)).data.reference);
  const b = await bookingByRef((await book(11, 14, { email: 'autre@example.com' })).data.reference);
  const list = await call('/admin/bookings?status=pending', { auth: true });
  assert.ok(list.data.data.every(x => x.overlapping_requests === 1), 'le conflit est signalé');
  const results = await Promise.all([setStatus(a.id, 'confirmed', 1), setStatus(b.id, 'confirmed', 1)]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE status='confirmed'").first()).n, 1);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM occupancy').first()).n, 3);
});

test('transitions de statut contrôlées et verrouillage optimiste', async () => {
  const b = await bookingByRef((await book()).data.reference);
  assert.equal((await setStatus(b.id, 'cancelled', 1)).status, 400, 'pending → cancelled interdit');
  assert.equal((await setStatus(b.id, 'rejected', 1)).status, 200);
  assert.equal((await setStatus(b.id, 'confirmed', 1)).status, 400, 'rejected → confirmed interdit');
  assert.equal((await setStatus(b.id, 'pending', 1)).status, 409, 'version périmée');
});

test('emails : voyageur + admin à la demande, voyageur à la décision', async () => {
  const b = await bookingByRef((await book()).data.reference);
  await setStatus(b.id, 'confirmed', 1);
  const events = (await db.prepare('SELECT event,audience FROM email_outbox ORDER BY id').all()).results.map(r => `${r.event}:${r.audience}`).sort();
  assert.deepEqual(events, ['booking.confirmed:guest', 'booking.pending:admin', 'booking.pending:guest']);
});

test('prix estimé, durée minimale, capacité et animaux', async () => {
  await db.prepare("UPDATE properties SET nightly_price=8000, cleaning_fee=3000, min_nights=2, accepts_pets=0").run();
  const quote = await call(`/quote?property_id=le-cosi&checkin=${day(10)}&checkout=${day(13)}`);
  assert.equal(quote.data.total, 27000);
  assert.equal((await book(10, 11)).status, 400, 'minimum 2 nuits');
  assert.equal((await book(10, 12, { guests: 3 })).status, 400, 'capacité dépassée');
  assert.equal((await book(10, 12, { pets: true })).status, 400, 'animaux refusés');
  const ok = await book(10, 13);
  assert.equal(ok.data.estimated_total, 27000);
  await db.prepare('UPDATE properties SET accepts_pets=1').run();
});

test('idempotence : un double clic ne crée qu\'une demande', async () => {
  const key = crypto.randomUUID();
  const [a, b] = await Promise.all([call('/bookings', { method: 'POST', data: guest(), key }), call('/bookings', { method: 'POST', data: guest(), key })]);
  assert.equal(a.data.reference, b.data.reference);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM bookings').first()).n, 1);
  assert.equal((await call('/bookings', { method: 'POST', data: guest(20, 22), key })).status, 409);
});

test('réservation manuelle (Airbnb) confirmée directement, sans email au voyageur', async () => {
  const r = await call('/admin/bookings', { method: 'POST', auth: true, data: { property_id: 'le-cosi', checkin: day(30), checkout: day(33), guests: 2, full_name: 'Voyageur Airbnb', source: 'airbnb' } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal((await bookingByRef(r.data.reference)).status, 'confirmed');
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM email_outbox').first()).n, 0);
  const clash = await call('/admin/bookings', { method: 'POST', auth: true, data: { property_id: 'le-cosi', checkin: day(31), checkout: day(32), guests: 1, full_name: 'X', source: 'booking' } });
  assert.equal(clash.status, 409);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM bookings').first()).n, 1, 'aucune ligne partielle');
});

test('blocage manuel de dates et libération', async () => {
  assert.equal((await call('/admin/blocks', { method: 'POST', auth: true, data: { property_id: 'le-cosi', checkin: day(40), checkout: day(43), note: 'Travaux' } })).status, 201);
  assert.equal((await book(41, 44)).status, 409);
  assert.equal((await call('/admin/blocks', { method: 'DELETE', auth: true, data: { property_id: 'le-cosi', checkin: day(40), checkout: day(43) } })).data.released, 3);
  assert.equal((await book(41, 44)).status, 201);
});

test('gestion complète d\'un bien : création, modification, photo, suppression', async () => {
  const created = await call('/admin/properties', { method: 'POST', auth: true, data: { name: 'Villa Les Pins', type: 'Villa', capacity: 8, amenities: ['Piscine', 'Wifi'], nightly_price: 25000 } });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  assert.equal(created.data.id, 'villa-les-pins');
  assert.equal(created.data.published, false);
  assert.equal((await call('/properties/villa-les-pins')).status, 404, 'brouillon invisible');
  const upd = await call('/admin/properties/villa-les-pins', { method: 'PATCH', auth: true, data: { version: 1, published: true, location: 'Sanary-sur-Mer' } });
  assert.equal(upd.status, 200);
  assert.equal((await call('/admin/properties/villa-les-pins', { method: 'PATCH', auth: true, data: { version: 1, name: 'X' } })).status, 409);
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  const up = await call('/admin/properties/villa-les-pins/photos', { method: 'POST', auth: true, body: jpeg, headers: { 'Content-Type': 'image/jpeg' } });
  assert.equal(up.status, 201, JSON.stringify(up.data));
  const photo = await mf.dispatchFetch(origin + up.data.url);
  assert.equal(photo.status, 200);
  assert.match(photo.headers.get('cache-control'), /immutable/);
  assert.equal((await call('/properties/villa-les-pins')).data.photos.length, 1);
  assert.equal((await call('/admin/properties/villa-les-pins', { method: 'DELETE', auth: true })).status, 200);
  assert.equal((await mf.dispatchFetch(origin + up.data.url)).status, 404, 'photo supprimée de R2');
});

test('formulaire de contact et suivi des leads', async () => {
  const r = await call('/contact', { method: 'POST', key: crypto.randomUUID(), data: { full_name: 'Propriétaire', email: 'p@example.com', phone: '0611111111', property_type: 'Villa / Maison', city: 'Bandol', message: '', consent: true } });
  assert.equal(r.status, 201);
  const leads = await call('/admin/leads', { auth: true });
  assert.equal(leads.data.data.length, 1);
  assert.equal((await call('/admin/leads/' + leads.data.data[0].id, { method: 'PATCH', auth: true, data: { status: 'contacted' } })).data.status, 'contacted');
  const dash = await call('/admin/dashboard', { auth: true });
  assert.equal(dash.status, 200);
  assert.equal(dash.data.new_leads, 0);
});

test('changement de mot de passe ferme les sessions', async () => {
  const next = 'nouveau-mot-de-passe-5678';
  assert.equal((await call('/admin/password', { method: 'POST', auth: true, data: { current: admin.password, password: next } })).status, 200);
  assert.equal((await call('/admin/session', { auth: true })).status, 401);
  const login = await call('/admin/login', { method: 'POST', data: { email: admin.email, password: next } });
  assert.equal(login.status, 200);
  cookie = login.headers.get('set-cookie').split(';')[0];
  await call('/admin/password', { method: 'POST', auth: true, data: { current: next, password: admin.password } });
});
