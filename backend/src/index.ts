// Passala Conciergerie — API (Cloudflare Worker + D1 + R2).
// Le site est servi par Netlify, qui relaie /api/* vers ce Worker (voir scripts/build-site.mjs).
import { type Bindings, HttpError, fail, json, now } from './lib';
import { publicRoute } from './public';
import { adminRoute } from './admin';
import { sendEmails } from './email';

async function route(request: Request, env: Bindings, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url), path = url.pathname.replace(/\/+$/, '');
  return (await publicRoute(request, env, ctx, url, path)) ?? (await adminRoute(request, env, ctx, url, path)) ?? fail(404, 'Ressource introuvable.');
}

function errorResponse(error: unknown, request: Request) {
  if (error instanceof HttpError) return json({ error: error.message }, error.status);
  const message = error instanceof Error ? error.message + ' ' + String((error as { cause?: unknown }).cause ?? '') : '';
  if (/dates_unavailable|UNIQUE constraint failed: occupancy/.test(message)) {
    return json({ error: 'Ces dates sont déjà occupées (réservation confirmée ou dates bloquées).' }, 409);
  }
  console.error(JSON.stringify({ event: 'api_error', path: new URL(request.url).pathname, message: message.slice(0, 300) }));
  return json({ error: 'Service momentanément indisponible. Réessayez dans quelques instants.' }, 503);
}

/** Origines exactes, ou motif « https://*--site.netlify.app » pour les aperçus Netlify. */
function originAllowed(origin: string, list: string[]) {
  return list.some(entry => {
    if (entry === origin) return true;
    if (!entry.startsWith('https://*--')) return false;
    const suffix = entry.slice(9); // « --site.netlify.app »
    if (!origin.endsWith(suffix)) return false;
    // Préfixe sans double tiret : l'aperçu appartient bien à ce site Netlify.
    return /^https:\/\/[a-z0-9]+(-[a-z0-9]+)*$/.test(origin.slice(0, -suffix.length));
  });
}

export default {
  async fetch(request: Request, env: Bindings, ctx: ExecutionContext) {
    const origin = request.headers.get('Origin');
    const allowedList = env.ALLOWED_ORIGINS.split(',').map(v => v.trim());
    const headers: Record<string, string> = { 'X-Content-Type-Options': 'nosniff', Vary: 'Origin' };
    if (origin && originAllowed(origin, allowedList)) Object.assign(headers, { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true' });
    let response: Response;
    try {
      if (origin && !originAllowed(origin, allowedList)) fail(403, 'Origine non autorisée.');
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Idempotency-Key, X-Passala-Request, X-Photo-Alt' } });
      }
      // Protection CSRF : toute écriture doit porter cet en-tête, impossible à poser depuis un formulaire tiers.
      if (!['GET', 'HEAD'].includes(request.method) && request.headers.get('X-Passala-Request') !== '1') fail(403, 'Requête non autorisée.');
      response = await route(request, env, ctx);
    } catch (error) {
      response = errorResponse(error, request);
    }
    const result = new Response(response.body, response);
    for (const [key, value] of Object.entries(headers)) result.headers.set(key, value);
    if (!result.headers.has('Cache-Control')) result.headers.set('Cache-Control', 'no-store');
    return result;
  },

  async scheduled(_event: ScheduledController, env: Bindings, ctx: ExecutionContext) {
    ctx.waitUntil(Promise.all([
      sendEmails(env),
      env.DB.batch([
        env.DB.prepare('DELETE FROM sessions WHERE expires_at<?').bind(now()),
        env.DB.prepare('DELETE FROM rate_limits WHERE expires_at<?').bind(now())
      ])
    ]));
  }
};
