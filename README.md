# Passala Conciergerie

Site vitrine et plateforme de réservation directe de **Passala Conciergerie** (Provence).

## Architecture

```
Navigateur ──► passalaconciergerie.com (Netlify : domaine + pages statiques)
                    │  /api/*  (relais transparent, voir dist/_redirects)
                    ▼
             Worker Cloudflare « passala-api »
                    ├── D1 « passala-conciergerie »  (biens, réservations, contacts, comptes admin)
                    └── R2 « passala-photos »        (photos envoyées depuis l'admin)
```

- **Netlify** garde le nom de domaine et sert les fichiers HTML/CSS/JS/images. Au build, `scripts/build-site.mjs` génère `dist/_redirects`, qui relaie `/api/*` vers le Worker. Le navigateur ne parle qu'à `passalaconciergerie.com` : pas de CORS, cookies de session sur le même domaine.
- **Cloudflare** porte toute la logique et les données. URL directe de l'API : `https://passala-api.romainfalanga83.workers.dev`.

## Pages

| Page | Rôle |
|---|---|
| `index.html`, `nettoyage.html`, `partenaires.html`, `a-propos.html` | Pages vitrines |
| `nos-biens.html` | Grille des biens **publiés** (`GET /api/properties`) |
| `bien.html?id=…` | Fiche d'un bien, calendrier de disponibilité, estimation du prix et **demande de réservation** |
| `contact.html` | Formulaire propriétaire (enregistré comme « contact » dans l'admin) |
| `admin-espace.html` | **Espace admin** (non référencé, accès par identifiant + mot de passe) |

## Fonctionnement des réservations

1. Le voyageur choisit ses dates sur la fiche du bien et envoie une **demande** (aucun paiement en ligne). Il reçoit une référence `PAS-XXXXXX`.
2. La demande apparaît dans l'admin, onglet **Réservations › À traiter**. Elle **ne bloque pas** les dates : plusieurs demandes peuvent viser la même période, l'admin le voit (« autres demandes qui se chevauchent »).
3. L'admin **confirme** ou **refuse**. La confirmation bloque toutes les nuits en une seule opération atomique. Si une nuit a été prise entre-temps, la confirmation échoue sans rien modifier.
4. Une réservation confirmée peut être **annulée**, ce qui libère les nuits. Une demande refusée ou annulée peut être remise en attente.
5. Les réservations prises ailleurs (Airbnb, Booking, téléphone) se saisissent avec **Ajouter une réservation** : elles sont confirmées immédiatement et bloquent les dates.

Le jour du départ n'est jamais occupé : un voyageur peut arriver le jour où un autre part.

## Espace admin

| Onglet | Contenu |
|---|---|
| Tableau de bord | Demandes à traiter, taux d'occupation du mois, montant confirmé, voyageurs présents, arrivées et départs |
| Réservations | Filtres (statut, bien, période, recherche), confirmer / refuser / annuler, notes internes, saisie manuelle |
| Calendrier | Trois mois par bien : réservé, bloqué, demandes en attente. Sélection d'une période pour **bloquer** ou **libérer** des nuits |
| Biens | Créer, modifier, publier/dépublier, supprimer un bien. Tarifs (prix/nuit, ménage, nuits minimum), équipements, liens et notes Airbnb/Booking, **photos** (envoi, ordre, suppression) |
| Contacts | Demandes des propriétaires : nouveau / contacté / clôturé |
| Réglages | État des emails automatiques, changement de mot de passe |

### Créer ou réinitialiser un compte admin

```bash
npx wrangler login
npm run admin:create -- prenom@exemple.fr
```

Le mot de passe généré s'affiche une seule fois. Il se change ensuite dans **Réglages**.

## Données (D1)

Schéma complet : `backend/migrations/0001_schema.sql`. Les montants sont stockés en centimes, les dates au format `AAAA-MM-JJ`.

- `properties` et `property_photos` : fiches des biens et photos ordonnées.
- `bookings` : demandes et réservations (statut, origine, montant estimé figé au moment de la demande, note interne, numéro de version contre les modifications concurrentes).
- `occupancy` : une ligne par nuit occupée. La clé `(bien, date)` rend toute double réservation impossible. Les déclencheurs SQL remplissent et vident cette table à la confirmation et à l'annulation.
- `leads` : contacts propriétaires.
- `admin_users`, `sessions` : comptes (mot de passe PBKDF2-SHA256) et sessions (cookie HttpOnly, 12 h).
- `email_outbox` : file d'emails avec reprise automatique.
- `rate_limits` : limitation des envois et des tentatives de connexion.

## Emails automatiques (optionnels)

Avec [Resend](https://resend.com), ajoutez au Worker trois secrets : `RESEND_API_KEY`, `EMAIL_FROM` (adresse d'un domaine vérifié) et `NOTIFY_EMAIL` (adresse qui reçoit les alertes). Vous pouvez aussi les définir dans les secrets GitHub Actions du dépôt.

- **Voyageur** : accusé de réception de la demande, puis confirmation, refus ou annulation (uniquement pour les demandes faites sur le site).
- **Admin** : alerte à chaque nouvelle demande de réservation et à chaque nouveau contact propriétaire.

Sans ces secrets, tout fonctionne mais aucun email n'est envoyé.

## Développement et déploiement

```bash
npm ci
npm run types   # types du Worker
npm run check   # TypeScript
npm test        # tests de l'API (Miniflare : D1 et R2 locaux)
```

- **Tests** : le workflow `.github/workflows/cloudflare.yml` lance la vérification TypeScript et les tests à chaque pull request et à chaque push sur `main`.
- **API** : `npm run deploy:api` applique les migrations D1 et déploie le Worker. Pour un déploiement automatique depuis GitHub, créez la variable de dépôt `CLOUDFLARE_AUTODEPLOY=true` et un secret `CLOUDFLARE_API_TOKEN` valable sur le compte de `backend/wrangler.jsonc`, avec les droits Workers Scripts, D1 et R2 en édition.
- **Site** : Netlify construit avec `npm run build`. La variable `PASSALA_API_ORIGIN` (dans `netlify.toml`) pointe vers le Worker.
- **Nouvelle migration** : ajoutez `backend/migrations/0003_….sql`. Elle sera appliquée au prochain déploiement.
