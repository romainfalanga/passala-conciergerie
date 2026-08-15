# La Clef Provençale — Site vitrine conciergerie

Site vitrine multi-pages pour **La Clef Provençale**, conciergerie haut de gamme dédiée à la gestion de maisons et villas en Provence. Le site est pensé en priorité pour convaincre les **propriétaires de maisons/villas** de confier leur bien à la conciergerie.

## 🎯 Objectif principal
La page d'accueil est construite comme un tunnel de conversion complet :
1. Hero avec promesse forte + double CTA
2. Douleurs du propriétaire (temps, dégradation, revenus, distance) — chaque carte illustrée d'une photo
3. Bande photo panoramique PACA (ocres du Luberon, Cap Canaille, tournesols, lavande)
4. Fonctionnement en 4 étapes, illustré par 2 photos (mas & bastide)
5. Bénéfices concrets — chaque carte illustrée d'une photo
6. Réassurance (biens gérés, témoignage)
7. CTA final

## ✅ Fonctionnalités actuellement implémentées

- **Page d'accueil (`index.html`)** — 100% orientée conversion propriétaires de maisons/villas, avec CTA multiples vers la page contact.
- **Nos biens (`nos-biens.html`)** — grille dynamique des biens gérés, chargée depuis la table `properties`, avec filtres par type de bien (Villa / Mas / Bastide…).
- **Fiche bien (`bien.html?id=...`)** — page générique alimentée dynamiquement par la table `properties` : chaque bien dispose de sa propre URL et de sa propre page complète (galerie, description, équipements, capacité, CTA).
- **Partenaires (`partenaires.html`)** — grille de partenaires chargée depuis la table `partners`, meublée avec 6 partenaires-types (ménage, photo, piscine/jardin, juridique, sécurité, conciergerie premium). **À compléter/valider avec les vrais partenaires.**
- **À propos (`a-propos.html`)** — présentation de la fondatrice (Camille Servan), valeurs de l'entreprise, timeline du parcours. **Contenu à valider/corriger avec les vraies informations.**
- **Contact (`contact.html`)** — formulaire complet (nom, téléphone, email, type de bien, ville, statut location saisonnière, message, consentement RGPD) qui :
  - enregistre chaque demande dans la table `leads` (consultable à tout moment) ;
  - propose un lien `mailto:` pré-rempli en secours vers `contact@laclefprovencale.fr`.
- Header/footer cohérents sur toutes les pages, menu entièrement responsive (menu plein écran centré sur mobile, sans bug d'affichage).
- **Design épuré mais flashy et vivant « PACA »** : palette multicolore inspirée du Sud (ocre/terracotta du Luberon, turquoise méditerranéen, jaune tournesol, lavande, rose bougainvillier), boutons en dégradé, bordures et icônes colorées par carte, typographie Playfair Display + Jost.
- **Photos intégrées dans toutes les zones auparavant « texte seul »** : chaque carte « problématique » / « bénéfice » a sa photo, bandes photo panoramiques (mosaïque 4 images) sur l'accueil et la page Nos biens, blocs image/texte côte à côte sur Partenaires et À propos — pour un ratio image/texte équilibré, sur desktop comme sur mobile.

## ⚠️ Point important — Envoi d'email automatique (Resend)

Un site 100% statique ne peut **pas** appeler l'API Resend directement depuis le navigateur (la clé secrète serait exposée publiquement, et Resend bloque ces appels côté navigateur par sécurité). La solution mise en place :
- **Chaque demande est enregistrée dans la table `leads`** de la base du site — vous pouvez la consulter à tout moment (aucune perte de lead).
- **Un lien `mailto:` pré-rempli** est proposé après l'envoi pour transmettre immédiatement le récapitulatif par email si besoin.

👉 Si vous souhaitez un **envoi automatique instantané** vers votre boîte mail à chaque nouvelle demande, il faudra créer un compte gratuit sur un service compatible navigateur (ex. **EmailJS**) et me fournir les identifiants publics : je pourrai alors brancher l'envoi automatique par-dessus l'enregistrement actuel.

## 🔗 Pages du site

| Page | Chemin | Description |
|---|---|---|
| Accueil | `index.html` | Page de conversion principale (propriétaires) |
| Nos biens | `nos-biens.html` | Liste filtrable des biens gérés |
| Fiche bien | `bien.html?id={id}` | Détail d'un bien (id = identifiant du bien dans la table `properties`) |
| Partenaires | `partenaires.html` | Réseau de partenaires |
| À propos | `a-propos.html` | Fondatrice, valeurs, histoire |
| Contact | `contact.html` | Formulaire de demande d'étude |

## 🗄️ Données & stockage (Table API)

### Table `properties` (les biens gérés)
`id`, `name`, `type`, `location`, `capacity`, `bedrooms`, `bathrooms`, `surface`, `short_description`, `description`, `amenities` (array), `image_main`, `image_gallery_1`, `image_gallery_2`, `featured`, `price_note`

4 biens actuellement en base : Le Mas des Lavandes (Gordes), La Bastide des Oliviers (Aix-en-Provence), Villa Horizon (Cassis), Mas des Vignes (Bonnieux). **Pour ajouter un bien : il suffit d'ajouter une ligne dans cette table, la page `bien.html?id=...` s'occupe du reste automatiquement.**

### Table `partners` (les partenaires)
`id`, `name`, `category`, `description`, `website`

6 partenaires placeholder en base, à remplacer/compléter avec les vrais partenaires de La Clef Provençale.

### Table `leads` (les demandes de contact)
`id`, `full_name`, `email`, `phone`, `property_type`, `city`, `already_rented`, `message`, `consent`, `status`

Chaque soumission du formulaire de contact crée une ligne ici. Le champ `status` (Nouveau / Contacté / Qualifié / Clos) permet de suivre le traitement des leads.

## ❌ Non implémenté / à décider avec vous

- **Envoi d'email automatique instantané** (nécessite un service tiers type EmailJS, voir plus haut).
- **Interface d'administration** pour consulter/traiter les leads directement depuis le site (actuellement consultation via la table `leads`).
- **Vraies photos** des biens, du portrait de la fondatrice, et **vrai contenu** des pages Partenaires / À propos (actuellement meublés avec du contenu crédible mais fictif, comme convenu).
- **Email de contact** (`contact@laclefprovencale.fr` est un exemple à remplacer par le vrai email). Le téléphone `07 44 89 66 02` est le vrai numéro, déjà intégré partout sur le site.
- Pages légales complètes (mentions légales, politique de confidentialité RGPD détaillée) — seule une mention de consentement basique est présente sur le formulaire.

## 🎨 Palette de couleurs "PACA flashy"

| Usage | Couleur | Inspiration |
|---|---|---|
| Accent principal (CTA, boutons) | Terracotta `#e8541e` | Ocres du Luberon / Roussillon |
| Accent secondaire | Turquoise `#0ea5a0` | Calanques & Méditerranée |
| Accent tertiaire | Lavande `#7c5ba6` | Champs de lavande du Vaucluse |
| Touche vive | Jaune doré `#f5b700` | Tournesols de Valensole |
| Touche vive | Rose bougainvillier `#e8437a` | Façades et villages du littoral |

Chaque section clé (cartes, icônes, bordures, bandes CTA) pioche dans cette palette pour un rendu mémorable et énergique, sans jamais sacrifier la lisibilité ni le côté haut de gamme.

## 🖼️ Nouvelles images PACA ajoutées

`roussillon-ocres.jpg`, `calanque-sormiou.jpg` (Cap Canaille, Cassis), `tournesols-valensole.jpg`, `facade-couleurs-provence.jpg`, `volets-bleus.jpg`, `aix-fontaine-rotonde.jpg` (ruelle fleurie d'Aix) — intégrées dans les cartes, bandes photo et blocs image/texte de toutes les pages.

## 🚀 Prochaines étapes recommandées

1. Valider/corriger le contenu des pages À propos et Partenaires avec les vraies informations.
2. Remplacer les photos placeholder par les vraies photos des biens et de la fondatrice.
3. Fournir les vraies coordonnées (téléphone, email, adresse) à intégrer partout sur le site.
4. Décider si un envoi d'email automatique (EmailJS) est nécessaire en plus de l'enregistrement des leads.
5. Ajouter de nouveaux biens au fur et à mesure via la table `properties`.
6. Une fois validé, publier le site via l'onglet **Publish**.

## 🌐 Déploiement

Pour rendre le site accessible en ligne, direction l'onglet **Publish** du projet : il gère automatiquement le déploiement et vous fournit l'URL publique.
