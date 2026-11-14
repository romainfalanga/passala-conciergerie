// Authentification administrateur : comptes en base, mots de passe PBKDF2, sessions par cookie HttpOnly.
import { type Bindings, fail, hex, now, randomHex, sha256 } from './lib';

const ITERATIONS = 100000; // maximum accepté par Workers pour PBKDF2
const SESSION_SECONDS = 12 * 3600;
const COOKIE = 'passala_session';

export async function hashPassword(password: string, salt: string, iterations = ITERATIONS) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations }, key, 256);
  return hex(bits);
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

type User = { id: string; email: string; password_hash: string; salt: string; iterations: number };

export async function verifyLogin(env: Bindings, email: string, password: string) {
  const user = await env.DB.prepare('SELECT * FROM admin_users WHERE email=?').bind(email).first<User>();
  // Calcul effectué même si le compte n'existe pas, pour ne pas révéler son existence.
  const computed = await hashPassword(password, user?.salt || 'absent', user?.iterations || ITERATIONS);
  if (!user || !safeEqual(computed, user.password_hash)) return fail(401, 'Identifiant ou mot de passe incorrect.');
  return user;
}

export async function createSession(env: Bindings, userId: string) {
  const token = randomHex(32);
  await env.DB.batch([
    env.DB.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES (?,?,?)').bind(await sha256(token), userId, now() + SESSION_SECONDS),
    env.DB.prepare('UPDATE admin_users SET last_login_at=unixepoch() WHERE id=?').bind(userId)
  ]);
  return sessionCookie(token, SESSION_SECONDS);
}

export const sessionCookie = (value: string, age: number) => `${COOKIE}=${value}; Path=/api/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;

export function sessionToken(request: Request) {
  return request.headers.get('cookie')?.split(';').map(v => v.trim()).find(v => v.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1) || '';
}

export async function requireAdmin(request: Request, env: Bindings) {
  const token = sessionToken(request);
  if (!/^[a-f0-9]{64}$/.test(token)) return fail(401, 'Connectez-vous pour accéder à cet espace.');
  const user = await env.DB.prepare('SELECT u.id,u.email FROM sessions s JOIN admin_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?')
    .bind(await sha256(token), now()).first<{ id: string; email: string }>();
  return user || fail(401, 'Votre session a expiré. Connectez-vous à nouveau.');
}

export async function setPassword(env: Bindings, userId: string, password: string) {
  if (password.length < 12) fail(400, 'Le mot de passe doit contenir au moins 12 caractères.');
  const salt = randomHex(16);
  const passwordHash = await hashPassword(password, salt);
  await env.DB.batch([
    env.DB.prepare('UPDATE admin_users SET password_hash=?,salt=?,iterations=? WHERE id=?').bind(passwordHash, salt, ITERATIONS, userId),
    // Toutes les autres sessions sont fermées après un changement de mot de passe.
    env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(userId)
  ]);
}
