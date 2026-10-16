import { before, beforeEach, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';

let mf, db, cookie;
const origin = 'https://passalaconciergerie.com';
const password = 'test-only-administrator-password';
const day = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const guest = (start = 10, end = 13) => ({ property_id: 'le-cosi', checkin: day(start), checkout: day(end), guests: 2, pets: false, full_name: 'Client de test', email: 'test@example.com', phone: '0600000000', message: '<script>test</script>', consent: true });
async function call(path, { method = 'GET', data, admin = false, key, headers = {} } = {}) {
  const response = await mf.dispatchFetch(origin + '/api' + path, { method, headers: { Origin: origin, 'CF-Connecting-IP': '192.0.2.1', ...(admin ? { Cookie: cookie } : {}), ...(data ? { 'Content-Type': 'application/json', 'X-Passala-Request': '1' } : {}), ...(key ? { 'Idempotency-Key': key } : {}), ...headers }, body: data ? JSON.stringify(data) : undefined });
  return { status: response.status, headers: response.headers, data: await response.json() };
}
async function book(start = 10, end = 13, key = crypto.randomUUID()) { return call('/bookings', { method: 'POST', data: guest(start, end), key }); }
async function status(id, state, version = 1) { return call('/admin/bookings/' + id, { method: 'PATCH', admin: true, data: { status: state, version } }); }

before(async () => {
  await build({ entryPoints: ['backend/src/index.ts'], bundle: true, format: 'esm', platform: 'browser', external: ['node:*'], outfile: 'backend/test/worker-bundle.mjs' });
  mf = new Miniflare({ modules: true, scriptPath: 'backend/test/worker-bundle.mjs', compatibilityDate: '2026-07-30', compatibilityFlags: ['nodejs_compat'], d1Databases: ['DB'], bindings: { ALLOWED_ORIGINS: origin, ADMIN_PASSWORD: password } });
  db = await mf.getD1Database('DB');
  for (const file of (await readdir('backend/migrations')).sort()) {
    const sql = await readFile('backend/migrations/' + file, 'utf8');
    // D1's exec splits by newline. Preserve trigger bodies as a single statement.
    const lines = sql.replace(/^--.*$/gm, '').split(/;\s*(?=CREATE |INSERT INTO properties|$)/);
    for (const statement of lines) if (statement.trim()) await db.prepare(statement.trim()).run();
  }
});
beforeEach(async () => {
  await db.batch(['DELETE FROM bookings', 'DELETE FROM occupancy', 'DELETE FROM leads', 'DELETE FROM email_outbox', 'DELETE FROM sessions', 'DELETE FROM rate_limits', 'UPDATE properties SET calendar_ready=1'].map(sql => db.prepare(sql)));
  const login = await call('/admin/login', { method: 'POST', data: { password } });
  assert.equal(login.status, 200, JSON.stringify(login.data)); cookie = login.headers.get('set-cookie').split(';')[0];
});
after(async () => { await mf?.dispose(); });

test('private data requires a session; login cookies are protected; CSRF is rejected', async () => {
  assert.equal((await call('/admin/bookings?property_id=le-cosi')).status, 401);
  assert.equal((await call('/bookings')).status, 404);
  const login = await call('/admin/login', { method: 'POST', data: { password } });
  assert.match(login.headers.get('set-cookie'), /HttpOnly; Secure; SameSite=Strict/);
  assert.equal((await call('/admin/blocks', { method: 'POST', admin: true, data: {}, headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await call('/admin/blocks', { method: 'POST', admin: true, data: {}, headers: { 'X-Passala-Request': '' } })).status, 403);
  assert.equal((await call('/admin/session', { admin: true })).status, 200);
  await call('/admin/logout', { method: 'POST', admin: true, data: {} });
  assert.equal((await call('/admin/session', { admin: true })).status, 401);
});
test('a calendar cannot accept requests before existing reservations are reviewed', async () => {
  await db.prepare('UPDATE properties SET calendar_ready=0').run();
  assert.equal((await call('/availability?property_id=le-cosi')).status, 503);
  assert.equal((await book()).status, 503);
});
test('simultaneous confirmation has one winner and no partial occupation', async () => {
  const a = await book(), b = await book(11, 14);
  assert.equal(a.status, 201); assert.equal(b.status, 201);
  const confirmed = await Promise.all([status(a.data.id, 'confirmed'), status(b.data.id, 'confirmed')]);
  assert.deepEqual(confirmed.map(r => r.status).sort(), [200, 409]);
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE status='confirmed'").first()).n, 1);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM occupancy').first()).n, 3);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM email_outbox').first()).n, 6);
});
test('checkout remains available, confirmed nights block new requests, cancellation releases them', async () => {
  const a = await book(); assert.equal((await status(a.data.id, 'confirmed')).status, 200);
  const availability = await call('/availability?property_id=le-cosi');
  assert.deepEqual(availability.data.dates, [day(10), day(11), day(12)]);
  assert.equal(JSON.stringify(availability.data).includes('Client'), false);
  assert.equal((await book(12, 15)).status, 409);
  const adjacent = await book(13, 15); assert.equal(adjacent.status, 201);
  assert.equal((await status(adjacent.data.id, 'confirmed')).status, 200);
  assert.equal((await status(a.data.id, 'cancelled', 2)).status, 200);
  assert.deepEqual((await call('/availability?property_id=le-cosi')).data.dates, [day(13), day(14)]);
});
test('double clicks and retries create one request and one pair of notifications', async () => {
  const key = crypto.randomUUID(), results = await Promise.all([book(10, 13, key), book(10, 13, key)]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 201]);
  assert.equal(results[0].data.id, results[1].data.id);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM bookings').first()).n, 1);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM email_outbox').first()).n, 2);
  assert.equal((await book(11, 14, key)).status, 409);
});
test('manual blocks are atomic and cannot erase a confirmed booking', async () => {
  const a = await book(12, 14); await status(a.data.id, 'confirmed');
  const block = await call('/admin/blocks', { method: 'POST', admin: true, data: { property_id: 'le-cosi', checkin: day(10), checkout: day(13) } });
  assert.equal(block.status, 409);
  assert.deepEqual((await call('/availability?property_id=le-cosi')).data.dates, [day(12), day(13)]);
  await call('/admin/blocks', { method: 'DELETE', admin: true, data: { property_id: 'le-cosi', checkin: day(10), checkout: day(14) } });
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM occupancy').first()).n, 2);
  assert.equal((await call('/admin/blocks', { method: 'POST', admin: true, data: { property_id: 'le-cosi', checkin: day(20), checkout: day(22), note: 'Airbnb' } })).status, 200);
  assert.equal((await book(20, 21)).status, 409);
});
test('stale admin updates cannot overwrite a more recent decision', async () => {
  const a = await book(); await status(a.data.id, 'confirmed');
  assert.equal((await status(a.data.id, 'rejected', 1)).status, 409);
  assert.equal((await db.prepare('SELECT status FROM bookings WHERE id=?').bind(a.data.id).first()).status, 'confirmed');
});
test('invalid dates, guests, consent and excessive bodies are rejected on the server', async () => {
  for (const change of [{ checkout: day(10) }, { checkin: '2027-02-30' }, { guests: 3 }, { guests: 1.5 }, { consent: false }, { email: '<bad>' }, { checkin: day(-1) }, { message: 'x'.repeat(4000) }]) {
    assert.equal((await call('/bookings', { method: 'POST', data: { ...guest(), ...change }, key: crypto.randomUUID() })).status, 400);
  }
  assert.equal((await call('/bookings', { method: 'POST', data: { ...guest(), message: 'x'.repeat(18000) }, key: crypto.randomUUID() })).status, 413);
});
test('requests persist even with email unconfigured; no public contact listing exists', async () => {
  const key = crypto.randomUUID(), data = { full_name: 'Contact', email: 'owner@example.com', phone: '0600000000', message: 'Question', property_type: 'Appartement', city: 'Bandol', consent: true };
  const lead = await call('/contact', { method: 'POST', data, key }); assert.equal(lead.status, 201);
  assert.equal((await call('/contact', { method: 'POST', data, key })).status, 200);
  assert.equal((await call('/contact')).status, 404);
  assert.equal((await call('/admin/leads', { admin: true })).data.data.length, 1);
  const notifications = await call('/admin/emails', { admin: true });
  assert.equal(notifications.data.configured, false); assert.equal(notifications.data.counts[0].state, 'pending');
});
