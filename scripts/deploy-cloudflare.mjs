// This script runs inside GitHub Actions. It never exports or prints secret values.
import { readFile, writeFile, appendFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
const account = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
if (!token || !account) throw new Error('Ajoutez CLOUDFLARE_API_TOKEN et CLOUDFLARE_ACCOUNT_ID aux secrets Actions du dépôt.');
if (!/^[a-f0-9]{32}$/i.test(account)) throw new Error('CLOUDFLARE_ACCOUNT_ID doit contenir uniquement les 32 caractères de l’identifiant du compte.');
process.env.CLOUDFLARE_API_TOKEN = token;
process.env.CLOUDFLARE_ACCOUNT_ID = account;
const name = 'passala-reservations';
const base = `/accounts/${account}`;
async function api(path, method = 'GET', body) {
  const response = await fetch('https://api.cloudflare.com/client/v4' + base + path, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(`Cloudflare ${method} ${path}: ${result.errors?.map(e => `${e.code}: ${e.message}`).join('; ') || response.status}`);
  return result.result;
}
const config = JSON.parse(await readFile('backend/wrangler.jsonc', 'utf8'));
// Always scope every request and Wrangler operation to the account from the repository secret.
let databases;
try {
  databases = await api('/d1/database?name=' + name);
} catch (error) {
  // Read-only diagnostics: never print token IDs, account data, or full responses.
  const checks = [
    ['Jeton utilisateur', '/user/tokens/verify'],
    ['Jeton du compte cible', base + '/tokens/verify'],
    ['Accès Workers du compte cible', base + '/workers/scripts']
  ];
  let verified = false;
  for (const [label, path] of checks) {
    if (label === 'Jeton du compte cible' && verified) continue;
    try {
      const response = await fetch('https://api.cloudflare.com/client/v4' + path, {
        headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000)
      });
      const result = await response.json();
      const state = ['active', 'disabled', 'expired'].includes(result.result?.status) ? result.result.status : '';
      if (state === 'active' && result.success) verified = true;
      const codes = result.errors?.map(e => Number(e.code)).filter(Number.isFinite).join(',') || '';
      console.log(`${label}: HTTP ${response.status}, ${result.success ? 'autorisé' : 'refusé'}${state ? ', ' + state : ''}${codes ? ', codes ' + codes : ''}`);
    } catch { console.log(`${label}: diagnostic indisponible`); }
  }
  throw error;
}
let database = databases.find(db => db.name === name);
if (!database) database = await api('/d1/database', 'POST', { name, jurisdiction: 'eu' });
config.account_id = account;
config.d1_databases[0].database_id = database.uuid;
const configPath = 'backend/wrangler.deploy.json';
await writeFile(configPath, JSON.stringify(config, null, 2), { mode: 0o600 });
function wrangler(args, input) {
  const result = spawnSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', ...args, '--config', configPath], { env: { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false' }, input, stdio: input ? ['pipe', 'inherit', 'inherit'] : 'inherit' });
  if (result.status !== 0) throw new Error('Commande Wrangler échouée : ' + args.slice(0, 3).join(' '));
}
try {
  wrangler(['d1', 'migrations', 'apply', 'DB', '--remote']);
  wrangler(['deploy']);
  const secrets = {};
  for (const key of ['ADMIN_PASSWORD', 'RESEND_API_KEY', 'EMAIL_FROM', 'NOTIFY_EMAIL']) if (process.env[key]) secrets[key] = process.env[key];
  if (secrets.ADMIN_PASSWORD && secrets.ADMIN_PASSWORD.length < 16) throw new Error('ADMIN_PASSWORD doit faire au moins 16 caractères.');
  if (Object.keys(secrets).length) wrangler(['secret', 'bulk'], JSON.stringify(secrets));
  const boundSecrets = await api(`/workers/scripts/${name}/secrets`);
  const names = new Set(boundSecrets.map(s => s.name));
  const subdomain = await api('/workers/subdomain');
  const origin = `https://${name}.${subdomain.subdomain}.workers.dev`;
  console.log(`PASSALA_API_ORIGIN=${origin}`);
  let healthy = false;
  for (let attempt = 0; attempt < 8; attempt++) {
    try { const r = await fetch(origin + '/api/health', { signal: AbortSignal.timeout(10000) }); healthy = r.ok && (await r.json()).ok === true; } catch { /* DNS propagation or first deployment */ }
    if (healthy) break;
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  if (!healthy) throw new Error('API déployée, mais le contrôle de santé a échoué. Vérifiez la disponibilité du sous-domaine workers.dev.');
  const summary = `## Passala — Cloudflare\n\nAPI : ${origin}\n\nBase D1 : ${name}\n\nAdministration : ${names.has('ADMIN_PASSWORD') ? 'configurée' : 'ajouter le secret ADMIN_PASSWORD (16 caractères minimum), puis relancer le workflow'}\n\nEmails : ${['RESEND_API_KEY','EMAIL_FROM','NOTIFY_EMAIL'].every(k => names.has(k)) ? 'configurés' : 'ajouter RESEND_API_KEY, EMAIL_FROM et NOTIFY_EMAIL pour activer les notifications'}\n\nNetlify : définir PASSALA_API_ORIGIN sur l’URL de l’API ci-dessus, puis publier le site.\n\nLe calendrier initial reste fermé jusqu’à la vérification des réservations existantes dans l’administration.\n`;
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
  console.log('Déploiement Cloudflare et vérification terminés.');
} finally { await rm(configPath, { force: true }); }
