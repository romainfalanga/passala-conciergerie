# Passala Conciergerie

Site vitrine HTML/CSS/JavaScript hébergé sur Netlify. Les disponibilités, demandes de réservation et contacts sont conservés dans Cloudflare D1 et servis par un Worker.

## Fonctionnement

- Le visiteur choisit ses dates, ses voyageurs et envoie une **demande**. Aucun paiement n'est encaissé.
- Une demande `pending` ne bloque pas les nuits. L'administrateur la confirme ou la refuse.
- La confirmation prend toutes les nuits `[arrivée, départ[` en une seule transaction SQL. Une clé unique `(property_id,date)` empêche deux confirmations ou un blocage manuel d'occuper la même nuit. Une confirmation concurrente perdante retourne HTTP 409 et ne change rien.
- L'annulation libère uniquement les nuits de cette réservation. Un départ peut coïncider avec l'arrivée du séjour suivant.
- Les réservations externes doivent être reportées manuellement dans Disponibilités. **Pas de synchronisation Airbnb/Booking dans cette version.**
- L'administration `/admin-espace.html` utilise une session serveur de 8 heures dans un cookie HttpOnly/Secure/SameSite. Les API privées vérifient la session ; masquer la page ne constitue pas la protection.
- Les emails sont enregistrés dans une file D1 dans la même transaction que la demande. Resend est appelé après l'enregistrement ; un cron réessaie toutes les 5 minutes. Aucun email n'est envoyé sans configuration complète. Les réessais s'arrêtent avant les 24 heures de validité de l'idempotence Resend : les échecs doivent alors être traités manuellement.

## Mise en service

Dans GitHub → Settings → Secrets and variables → Actions → Repository secrets :

| Nom | Utilisation |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Jeton du **compte Cloudflare cible**, avec les droits Workers et D1 nécessaires |
| `CLOUDFLARE_ACCOUNT_ID` | Identifiant du **même compte** ; aucun identifiant personnel n'est codé en dur |
| `ADMIN_PASSWORD` | Mot de passe privé pour l'administration, 16 à 256 caractères ; utiliser un mot de passe aléatoire |
| `RESEND_API_KEY` | Facultatif au déploiement ; nécessaire aux notifications email |
| `EMAIL_FROM` | Expéditeur autorisé sur un domaine vérifié dans Resend, par exemple `Passala <reservations@votre-domaine.fr>` |
| `NOTIFY_EMAIL` | Adresse réelle qui doit recevoir les demandes |

`EMAIL_FROM` et `NOTIFY_EMAIL` peuvent également être des variables Actions. Les deux secrets Cloudflare ne sont disponibles que dans GitHub Actions : ils ne sont jamais copiés dans le site ou les réponses API.

1. Le workflow **Cloudflare reservations** installe les dépendances figées, génère les types, vérifie le code, exécute les tests, crée la base D1 en juridiction UE si elle n'existe pas, applique les migrations et déploie `passala-reservations`.
2. Le résumé Actions fournit l'URL publique du Worker. `PASSALA_API_ORIGIN` est définie dans `[build.environment]` de `netlify.toml` avec l'URL du Worker déployé. Cette URL est publique et ne contient aucun secret ; si le Worker change, mettre à jour cette valeur. Publier le site : `npm run build` produit uniquement les fichiers publics dans `dist/`, ainsi qu'un proxy `/api/*` vers le Worker. Le nom de domaine du site reste chez Netlify.
3. Ouvrir `/admin-espace.html` et se connecter avec `ADMIN_PASSWORD`.
4. Compléter la fiche **Le Cosi** et saisir tous les séjours existants dans **Disponibilités**. Cocher la vérification des dates puis enregistrer pour ouvrir le calendrier public.
5. Après ajout ou modification d'un secret GitHub, relancer le workflow depuis Actions → Cloudflare reservations → Run workflow. Les secrets Worker déjà existants sont conservés lorsqu'ils ne sont pas fournis.

Sans `ADMIN_PASSWORD`, l'administration reste verrouillée. Sans Resend, les demandes restent consultables dans l'administration et les notifications sont en attente. Le formulaire n'affirme pas qu'un email a été envoyé.

### Données de l'ancien site

L'export initial référence une « Table API » absente du dépôt et du déploiement Netlify. Aucun ancien enregistrement de réservation, calendrier ou note n'a été récupéré. La migration reprend uniquement les faits connus du README (Le Cosi, studio à Six-Fours, 2 voyageurs, animaux acceptés) et ses cinq photos. Les surfaces, notes, équipements supplémentaires, prix et descriptions détaillées doivent être complétés à partir des données réelles.

**Le calendrier initial est fermé**, afin de ne pas annoncer des nuits libres sans vérification de l'existant. Réappliquer les migrations ne réinitialise pas les réservations ni la fiche.

## Développement et vérification

Node.js 24 :

```sh
npm ci --ignore-scripts
npm run types
npm run check
npm test
npx wrangler d1 migrations apply DB --local --config backend/wrangler.jsonc
npm run dev:api
```

Les tests utilisent une instance locale Miniflare/D1, des identités fictives et aucun envoi d'email réel. Ils vérifient l'authentification, le CSRF, les validations serveur, l'idempotence, les confirmations concurrentes, le jour de départ, les annulations, les blocages et la persistance sans Resend.

Pour servir le site localement avec son API, utiliser un proxy local `/api` vers le Worker. Le mode local n'utilise pas les secrets Actions ni la base distante. Les fichiers `.dev.vars*` sont exclus de Git. Le type `Env` est généré depuis `backend/wrangler.jsonc`.

## Organisation

- `backend/src/index.ts` : API publique, administration, sessions et notifications.
- `backend/migrations/` : tables, contraintes, déclencheurs et fiche initiale.
- `backend/test/` : tests d'intégrité des réservations sur D1 local.
- `js/api.js`, `js/properties.js`, `js/availability-calendar.js` : réservation publique.
- `admin-espace.html`, `js/admin.js`, `css/admin.css` : administration.
- `js/contact-form.js` : demandes de contact.
- `scripts/deploy-cloudflare.mjs` : provisionnement et déploiement depuis Actions.
- `scripts/build-site.mjs`, `netlify.toml` : publication et routage Netlify.

## Exploitation

Les données publiques se limitent aux fiches et dates occupées ; les coordonnées ne sont renvoyées qu'à l'administration. Les requêtes sont paramétrées, les données affichées échappées et les mutations contrôlées côté serveur. Les sessions et compteurs de limitation expirés sont nettoyés. Les confirmations administrateur utilisent aussi un numéro de version pour éviter d'écraser une décision prise dans un autre onglet.

L'hébergement Netlify et le compte Cloudflare sont indépendants. Le connecteur Cloudflare personnel de l'assistant ne doit pas servir pour les ressources de ce projet : seul le compte des secrets GitHub est utilisé.

Les anciennes adresses email, tarifs et mentions des pages commerciales doivent être validés par le propriétaire. L'adresse de notification n'est jamais déduite du contenu provisoire du site. Aucun paiement, compte voyageur ou synchronisation de plateforme n'est ajouté.
