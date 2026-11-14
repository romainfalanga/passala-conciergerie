// Crée (ou réinitialise) un compte administrateur.
// Usage : npm run admin:create -- email@exemple.fr [mot-de-passe]
// Sans mot de passe, un mot de passe aléatoire est généré et affiché une seule fois.
// La commande produit le SQL puis l'exécute sur la base distante via Wrangler.
import { webcrypto as crypto, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const [email, given] = process.argv.slice(2);
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Indiquez un email : npm run admin:create -- email@exemple.fr');
const password = given || randomBytes(18).toString('base64url');
if (password.length < 12) throw new Error('Le mot de passe doit contenir au moins 12 caractères.');

const salt = randomBytes(16).toString('hex');
const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
const hash = Buffer.from(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: 100000 }, key, 256)).toString('hex');
const quote = v => `'${String(v).replace(/'/g, "''")}'`;
const sql = `INSERT INTO admin_users(id,email,password_hash,salt,iterations) VALUES (${quote(crypto.randomUUID())},${quote(email.toLowerCase())},${quote(hash)},${quote(salt)},100000)
ON CONFLICT(email) DO UPDATE SET password_hash=excluded.password_hash, salt=excluded.salt, iterations=excluded.iterations;
DELETE FROM sessions WHERE user_id=(SELECT id FROM admin_users WHERE email=${quote(email.toLowerCase())});`;

if (process.env.PRINT_SQL_ONLY) { console.log(sql); process.exit(0); }
const result = spawnSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'd1', 'execute', 'DB', '--remote', '--command', sql, '--config', 'backend/wrangler.jsonc'], { stdio: 'inherit' });
if (result.status !== 0) throw new Error('Échec de l\'écriture en base. Vérifiez votre connexion Wrangler (npx wrangler login).');
console.log(`\nCompte administrateur prêt : ${email}${given ? '' : `\nMot de passe : ${password}\n(à changer depuis l'onglet Réglages de l'espace admin)`}`);
