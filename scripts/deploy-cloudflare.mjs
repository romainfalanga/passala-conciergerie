// Déploiement de l'API Passala sur Cloudflare (lancé par GitHub Actions, ou à la main).
// Étapes : migrations D1 → déploiement du Worker → secrets d'emails (si fournis) → contrôle de santé.
// N'affiche jamais la valeur d'un secret.
import { spawnSync } from 'node:child_process';

const config = 'backend/wrangler.jsonc';
const health = process.env.PASSALA_API_ORIGIN || 'https://passala-api.romainfalanga83.workers.dev';
if (process.env.CLOUDFLARE_API_TOKEN) process.env.CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN.trim().replace(/^(?:Authorization:\s*)?Bearer\s+/i, '');

function wrangler(args, input) {
  const result = spawnSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', ...args, '--config', config], {
    env: { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false' }, input, stdio: input ? ['pipe', 'inherit', 'inherit'] : 'inherit'
  });
  if (result.status !== 0) throw new Error('Commande Wrangler échouée : ' + args.slice(0, 3).join(' '));
}

wrangler(['d1', 'migrations', 'apply', 'DB', '--remote']);
wrangler(['deploy']);

const secrets = {};
for (const key of ['RESEND_API_KEY', 'EMAIL_FROM', 'NOTIFY_EMAIL']) if (process.env[key]) secrets[key] = process.env[key];
if (Object.keys(secrets).length) wrangler(['secret', 'bulk'], JSON.stringify(secrets));

let healthy = false;
for (let attempt = 0; attempt < 8 && !healthy; attempt++) {
  try { const r = await fetch(health + '/api/health', { signal: AbortSignal.timeout(10000) }); healthy = r.ok && (await r.json()).ok === true; } catch { /* propagation */ }
  if (!healthy) await new Promise(resolve => setTimeout(resolve, 5000));
}
if (!healthy) throw new Error('API déployée, mais le contrôle de santé a échoué.');
console.log(`API Passala déployée et opérationnelle : ${health}`);
