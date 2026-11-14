// Outils partagés : erreurs HTTP, validation, dates, sécurité.

export type Bindings = Env & {
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  NOTIFY_EMAIL?: string;
};

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export const fail = (status: number, message: string): never => { throw new HttpError(status, message); };
export const json = (data: unknown, status = 200, headers: HeadersInit = {}) => Response.json(data, { status, headers });
export const now = () => Math.floor(Date.now() / 1000);

export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export const addDays = (date: string, days: number) => new Date(Date.parse(date + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10);
export const nightsBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

export const hex = (bytes: ArrayBuffer | Uint8Array) => Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)).map(b => b.toString(16).padStart(2, '0')).join('');
export const sha256 = async (value: string) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
export const randomHex = (n: number) => hex(crypto.getRandomValues(new Uint8Array(n)));

export type Input = Record<string, unknown>;

export function str(data: Input, key: string, max: number, required = true): string {
  const value = data[key];
  if ((value === undefined || value === null) && !required) return '';
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) return fail(400, `Champ invalide : ${key}.`);
  return value.trim();
}
export function int(data: Input, key: string, min: number, max: number, nullable = false): number | null {
  const value = data[key];
  if (nullable && (value === null || value === '' || value === undefined)) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) return fail(400, `Nombre invalide : ${key}.`);
  return value;
}
export function num(data: Input, key: string, min: number, max: number): number | null {
  const value = data[key];
  if (value === null || value === '' || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) return fail(400, `Valeur invalide : ${key}.`);
  return value;
}
export const bool = (data: Input, key: string) => (data[key] === true ? 1 : 0);

export function url(data: Input, key: string): string {
  const value = str(data, key, 500, false);
  if (!value) return '';
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:') throw new Error();
    return parsed.href;
  } catch { return fail(400, `Lien invalide : ${key} (https:// requis).`); }
}

export function dateValue(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fail(400, 'Date invalide.');
  const parsed = new Date(value + 'T00:00:00Z');
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return fail(400, 'Date invalide.');
  return value;
}

/** Période de séjour. `future` impose une arrivée à partir d'aujourd'hui. */
export function stay(start: unknown, end: unknown, { future = true, max = 90 } = {}) {
  const checkin = dateValue(start), checkout = dateValue(end);
  const count = nightsBetween(checkin, checkout);
  if (count < 1 || count > max) fail(400, `La période doit compter entre 1 et ${max} nuits.`);
  if (future && (checkin < today() || checkout > addDays(today(), 731))) fail(400, 'Choisissez une période future, dans les deux prochaines années.');
  return { checkin, checkout, nights: count };
}

export function contact(data: Input) {
  const full_name = str(data, 'full_name', 120), email = str(data, 'email', 254).toLowerCase(), phone = str(data, 'phone', 40);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^[+\d().\s-]{6,40}$/.test(phone)) fail(400, 'Vérifiez votre email et votre téléphone.');
  if (data.consent !== true) fail(400, 'Votre accord est nécessaire pour traiter cette demande.');
  if (data.website) fail(400, 'Demande non valide.');
  return { full_name, email, phone, message: str(data, 'message', 3000, false) };
}

export async function readJson(request: Request, limit = 32768): Promise<Input> {
  if (!request.headers.get('content-type')?.startsWith('application/json')) return fail(415, 'Format JSON requis.');
  const text = await readLimited(request, limit);
  try {
    const result: unknown = JSON.parse(text);
    if (!result || typeof result !== 'object' || Array.isArray(result)) return fail(400, 'Demande non valide.');
    return result as Input;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    return fail(400, 'JSON invalide.');
  }
}
async function readLimited(request: Request, limit: number): Promise<string> {
  const reader = request.body?.getReader();
  if (!reader) return fail(400, 'Demande vide.');
  const decoder = new TextDecoder();
  let size = 0, text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); return fail(413, 'Demande trop volumineuse.'); }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

/** Adresse du visiteur : Netlify relaie la requête, il transmet l'IP d'origine dans x-nf-client-connection-ip. */
export const clientIp = (request: Request) => [request.headers.get('CF-Connecting-IP'), request.headers.get('x-nf-client-connection-ip')].filter(Boolean).join('|') || 'unknown';

export async function rateLimit(request: Request, env: Bindings, action: string, limit: number, seconds: number, subject?: string) {
  const window = Math.floor(now() / seconds);
  const key = `${action}:${window}:${await sha256(subject ?? clientIp(request))}`;
  const result = await env.DB.prepare('INSERT INTO rate_limits(key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count')
    .bind(key, (window + 1) * seconds).first<{ count: number }>();
  if (!result || result.count > limit) fail(429, 'Trop de tentatives. Merci de patienter avant de réessayer.');
}

export function requestKey(request: Request): string {
  const key = request.headers.get('Idempotency-Key') || '';
  if (!/^[a-zA-Z0-9-]{20,100}$/.test(key)) return fail(400, 'Identifiant de demande manquant. Rechargez la page.');
  return key;
}

export function offsetParam(url: URL) {
  return Math.max(0, Math.min(100000, Math.floor(Number(url.searchParams.get('offset')) || 0)));
}

const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function bookingReference() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return 'PAS-' + Array.from(bytes, b => REF_ALPHABET[b % REF_ALPHABET.length]).join('');
}

export function slugify(value: string) {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'bien';
}

export function euros(cents: number | null | undefined) {
  if (cents === null || cents === undefined) return '';
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}
