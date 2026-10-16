# Passala Conciergerie — Site vitrine conciergerie

Site vitrine multi-pages pour **Passala Conciergerie**, conciergerie haut de gamme dédiée à la gestion de maisons et villas en Provence. Le site est pensé en priorité pour convaincre les **propriétaires de maisons/villas** de confier leur bien à la conciergerie.

> **Rebranding (2026) :** le site s'appelait auparavant « La Clef Provençale ». Il a été intégralement renommé **Passala Conciergerie**, avec le nouveau logo fourni par le client (clé dorée, rameaux d'olivier et de lavande sur fond marine) et une refonte complète de la charte graphique vers un style **luxe discret sur fond clair** (voir section Palette ci-dessous).

## 🎯 Objectif principal
La page d'accueil est construite comme un tunnel de conversion complet :
1. Hero avec promesse forte + CTA
2. Douleurs du propriétaire (temps, dégradation, revenus, distance) — chaque carte illustrée d'une photo classe et cohérente avec son texte
3. Bande photo panoramique Provence (lavande)
4. Fonctionnement en 3 étapes (Estimation & optimisation / Mise en valeur / Gestion complète), illustré par une photo pleine largeur
5. Réassurance (biens gérés, message de confiance)
6. CTA final

## ✅ Fonctionnalités actuellement implémentées

- **Page d'accueil (`index.html`)** — 100% orientée conversion propriétaires de maisons/villas, avec CTA multiples vers la page contact.
- **Nos biens (`nos-biens.html`)** — grille dynamique des biens gérés, chargée depuis la table `properties`. **1 seul bien actuellement en base : « Le Cosi »**, le studio du client à Six-Fours-les-Plages (vraies photos et description fournies par le client), avec **réservation directe sur le site** via un bouton « Réserver directement » (les 4 biens de démonstration précédents ont été retirés à la demande du client). Bande photo réduite à 2 visuels sous le hero.
- **Réservation directe sans plateforme externe** — sur la fiche d'un bien dont `direct_booking` est activé, un bouton « Réserver directement » ouvre une fenêtre modale avec un **calendrier de disponibilité visuel** (voir ci-dessous), le nombre de voyageurs, la case « animal », les coordonnées et un message ; la demande est enregistrée dans la table `booking_requests` et vous pouvez confirmer le séjour vous-même (par téléphone/email), **sans commission de plateforme**. ⚠️ Un site statique ne peut pas gérer un paiement en ligne sécurisé automatique : c'est une demande de réservation à confirmer manuellement, pas un système de paiement automatique.
- **Espace propriétaire unique (`admin-espace.html`)** — une seule page protégée regroupe désormais tout ce qui était auparavant réparti sur deux pages :
  - **Calendrier de disponibilité (rouge/vert)** : côté client, dans la fenêtre de réservation d'un bien, un calendrier sur 2 mois affiche chaque jour en **vert (disponible)** ou **rouge (indisponible)** ; le client clique sur une date d'arrivée puis une date de départ (les jours indisponibles ne sont pas sélectionnables). Côté propriétaire, `admin-espace.html` permet de choisir un bien puis de **cliquer directement sur les jours** pour les basculer disponible ⇄ indisponible ; chaque clic met à jour immédiatement la table `availability`, ce qui met aussitôt à jour le calendrier vu par les clients.
  - **Notes Airbnb & Booking** : toujours sur `admin-espace.html`, un second bloc permet de saisir manuellement la note et le nombre d'avis du bien sélectionné sur Airbnb (/5) et sur Booking (/10). Ces valeurs s'affichent automatiquement sous forme de badges sur la fiche du bien (`bien.html`), juste sous le titre. ⚠️ Un site statique ne peut pas récupérer ces notes automatiquement (Airbnb/Booking n'offrent pas d'API publique et bloquent les appels navigateur/CORS) — la mise à jour reste manuelle, à faire de temps en temps depuis cette page.
  - Sélectionner un bien dans le menu déroulant met à jour **simultanément** les deux blocs (calendrier + notes), pour éviter de devoir choisir le bien deux fois.
  - 🔒 **Page protégée par connexion** : `admin-espace.html` n'est pas listée dans le menu et nécessite d'être **connecté** pour y accéder (règle d'accès `authenticated` appliquée uniquement à cette page ; le reste du site — accueil, fiches biens, calendrier public, formulaires, API des tables — reste accessible à tous). Un visiteur non connecté qui ouvre ce lien sera invité à se connecter. Les anciennes pages `admin-calendrier.html` et `admin-notes.html` ont été supprimées et fusionnées ici.
- **Fiche bien (`bien.html?id=...`)** — page générique alimentée dynamiquement par la table `properties` : chaque bien dispose de sa propre URL et de sa propre page complète (galerie, description, équipements, capacité, CTA).
- **Partenaires (`partenaires.html`)** — page simplifiée présentant le réseau de partenaires locaux (sans badges « eyebrow », textes allégés). La grille dynamique de partenaires (table `partners`) a été retirée à la demande du client ; la table reste disponible si vous souhaitez la réafficher plus tard. Une section **« Nos pressings partenaires »** met en avant deux pressings réels (cartes avec icône, description et lien externe vers leur site) :
  - [Lavabio](https://lavabio.fr/) — pressing écologique
  - [Pressing Porte Azur](https://pressing-porte-azur.fr/) — pressing traditionnel
- **À propos (`a-propos.html`)** — présentation de la fondatrice (Camille Servan) : badge de formation, titre, texte de présentation personnel et citation, **sans photo** (contenu uniquement textuel, centré sous le titre de la page) et un bouton de contact.
- **Contact (`contact.html`)** — formulaire complet (nom, téléphone, email, type de bien, ville, statut location saisonnière, message, consentement RGPD) qui :
  - enregistre chaque demande dans la table `leads` (consultable à tout moment) ;
  - propose un lien `mailto:` pré-rempli en secours vers `contact@passala-conciergerie.fr`.
- **Nettoyage (`nettoyage.html`)** — page dédiée au service de ménage/nettoyage, accessible via un menu déroulant « Nettoyage » (Service / Tarif / Devis) présent dans la navigation de toutes les pages :
  - `#service` : 3 catégories de prestations (ménage courant & entretien régulier, nettoyage spécialisé canapés/matelas, nettoyage après déménagement/location), présentées sous forme de cartes épurées empilées **en colonne** (une carte sous l'autre) sans icône décorative (accent fin en or en haut de carte, listes à puces avec petits badges ronds dorés) + section « Pourquoi nous choisir » (fond marine, tarifs transparents, qualité professionnelle, flexibilité) + encart sur l'avantage fiscal (Avance Immédiate / Crédit d'Impôt 50 %, réservé aux particuliers) ;
  - `#tarif` : grille de tarifs détaillée par catégorie (ménage horaire, vitres, canapés/fauteuils, matelas, tapis/moquette au m², déménagement/état des lieux au m²) ; note rapide en bas de grille rappelant que les professionnels sont sur devis personnalisé ;
  - `#devis` : bandeau CTA « Devis et diagnostic gratuits » précisant que les professionnels sont exclusivement servis sur devis personnalisé adapté à leur activité et volumes.
  - Contenu construit à partir d'une analyse du site de référence **Lorclean.fr** (même activité, même numéro de téléphone), adapté au ton et à la charte graphique de Passala Conciergerie. **Les tarifs affichés reprennent ceux de Lorclean.fr à titre indicatif — à valider/ajuster avec vous avant publication définitive.**
- Header/footer cohérents sur toutes les pages, menu entièrement responsive (menu plein écran centré sur mobile, sans bug d'affichage). **Bannière « Passala · Conciergerie »** tout en haut du site : une bande marine pleine largeur, au-dessus de la barre de navigation, avec un vrai texte (pas une image composite) flanqué d'une icône rameau d'olivier à gauche et d'une icône rameau de lavande à droite, le tout sur une seule ligne, centré, sans déformation ni encadré visible. La barre de navigation classique reste juste en dessous. Le logo original est repris en grand format dans le footer.
- **Design épuré, chic et lumineux** : fond ivoire clair, accent unique en or/laiton, bleu marine profond repris du logo pour le header/footer/bandeaux CTA, touches très sobres de lavande et vert olivier. Typographie Playfair Display + Jost. Aucune couleur criarde ni pattern « template IA » : une seule teinte signature sombre et un seul accent métallique, dans l'esprit d'une maison de luxe.
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
| Nettoyage | `nettoyage.html` (`#service`, `#tarif`, `#devis`) | Service de nettoyage/ménage : prestations, tarifs détaillés, devis gratuit |

## 🔑 Identité de marque

- **Nom** : Passala Conciergerie
- **Logo footer** : `images/logo-passala.png` — fichier fourni par le client, non retouché, intégré en grand format dans le footer de toutes les pages **sauf la page d'accueil** (`index.html`), où il a été retiré à la demande du client et remplacé par le nom de la marque en texte stylisé.
- **Bannière header** : plus d'image composite — une bande marine dédiée tout en haut de chaque page affiche un vrai texte HTML « Passala · Conciergerie » (police Playfair Display, italique, or, taille renforcée), flanqué de deux icônes reprenant **exactement les rameaux du logo original** (extraits directement du fichier fourni par le client) : `images/icon-olive-branch-v6.png` à gauche (tige dorée, feuilles vertes, olives dorées) et `images/icon-lavender-branch-v6.png` à droite (tige dorée, fleurs violettes), qui se fondent dans le fond marine grâce à un effet de fusion CSS (`mix-blend-mode: lighten`), sans aucun encadré visible.
- **Menu mobile** : le bouton hamburger est aligné à droite de la barre de navigation (plus jamais centré sous le nom du site) et ouvre un panneau qui glisse depuis le côté droit de l'écran.
- **Éléments visuels du logo** : clé dorée, rameau d'olivier et rameau de lavande — ces éléments ont inspiré la palette du site (voir plus bas).

## 🗄️ Données & stockage (Table API)

### Table `properties` (les biens gérés)
`id`, `name`, `type` (dont `Studio`), `location`, `capacity`, `bedrooms`, `bathrooms`, `surface`, `short_description`, `description`, `amenities` (array), `image_main`, `image_gallery_1` à `image_gallery_4`, `featured`, `price_note`, `booking_url` (lien externe secondaire, optionnel), `booking_label`, **`direct_booking`** (bool — active le bouton « Réserver directement » et le formulaire modal sur la fiche du bien), **`accepts_pets`** (bool — affiche « Animaux acceptés »).

**1 seul bien actuellement en base : « Le Cosi »** — studio du client à Six-Fours-les-Plages, pour 2 personnes, animaux acceptés. **Vraies photos fournies par le client** (salon, cuisine, chambre, salle de bain, terrasse) et description rédigée à partir de ses informations réelles. `direct_booking` est activé : la fiche affiche un bouton « Réserver directement » qui ouvre un formulaire de demande de réservation (dates, voyageurs, animal, coordonnées). **Pour ajouter un nouveau bien : il suffit d'ajouter une ligne dans cette table, la page `bien.html?id=...` s'occupe du reste automatiquement.**

### Table `booking_requests` (les demandes de réservation directe)
`id`, `property_id`, `property_name`, `checkin`, `checkout`, `guests`, `pets`, `full_name`, `email`, `phone`, `message`, `status` (Nouvelle / Confirmée / Refusée / Clôturée)

Chaque soumission du formulaire de réservation directe (bouton « Réserver directement » sur une fiche bien) crée une ligne ici. À consulter régulièrement pour confirmer les séjours par téléphone/email — il n'y a pas de paiement en ligne automatique (limite d'un site statique, voir plus haut). **Après confirmation d'une réservation, pensez à bloquer les dates correspondantes sur `admin-calendrier.html`** (table `availability`) pour que le calendrier public reste à jour.

### Table `availability` (le calendrier de disponibilité)
`id`, `property_id`, `date` (AAAA-MM-JJ), `status` (`Indisponible`), `note` (optionnel)

Une ligne = un jour rendu indisponible pour un bien donné (l'absence de ligne pour une date = disponible par défaut). Gérée depuis `admin-calendrier.html` (clic pour bloquer/débloquer un jour) et lue en temps réel par le calendrier affiché aux clients dans la fenêtre de réservation de `bien.html`.

### Table `partners` (les partenaires) — non affichée actuellement
`id`, `name`, `category`, `description`, `website`

Cette table existe toujours mais n'est plus affichée sur `partenaires.html` (la grille dynamique a été retirée à la demande du client, page volontairement simplifiée). La section « Pressings partenaires » utilise un badge de catégorie coloré (« PRESSING », forme d'étiquette large) suivi de liens en forme de pilule blanche vers chaque pressing.

### Table `leads` (les demandes de contact)
`id`, `full_name`, `email`, `phone`, `property_type`, `city`, `already_rented`, `message`, `consent`, `status`

Chaque soumission du formulaire de contact crée une ligne ici. Le champ `status` (Nouveau / Contacté / Qualifié / Clos) permet de suivre le traitement des leads.

## ❌ Non implémenté / à décider avec vous

- **Envoi d'email automatique instantané** (nécessite un service tiers type EmailJS, voir plus haut).
- **Interface d'administration** pour consulter/traiter les leads directement depuis le site (actuellement consultation via la table `leads`).
- **Paiement en ligne et blocage de calendrier en temps réel** pour « Le Cosi » — non réalisable sur un site 100% statique (nécessite un prestataire de paiement type Stripe avec clés secrètes côté serveur). La réservation directe actuelle est une **demande** à confirmer manuellement (table `booking_requests`).
- **Portrait de la fondatrice** et **vrai contenu** des pages Partenaires / À propos (actuellement meublés avec du contenu crédible mais fictif, comme convenu).
- **Email de contact** (`contact@passala-conciergerie.fr` est un exemple à remplacer par le vrai email si différent). Le téléphone `07 44 89 66 02` est le vrai numéro, déjà intégré partout sur le site.
- Pages légales complètes (mentions légales, politique de confidentialité RGPD détaillée) — seule une mention de consentement basique est présente sur le formulaire.
- **Tarifs de la page Nettoyage à valider** : ils reprennent ceux affichés sur Lorclean.fr (site de référence pour la même activité) à titre indicatif — à confirmer/ajuster avec les tarifs réels de Passala Conciergerie avant publication.

## 🎨 Palette de couleurs « Passala » (luxe discret, tons clairs)

Palette entièrement redéfinie à partir des couleurs du logo fourni, pour un rendu chic sur fond clair (le site reste clair ; seuls le header, le footer et les bandeaux CTA reprennent le marine du logo) :

| Usage | Couleur | Inspiration (logo) |
|---|---|---|
| Fond général | Ivoire `#faf6ee` | Fond clair de la marque |
| Fond alterne / bandes | Sable clair `#f1e8d8` | — |
| Teinte signature sombre (header, footer, CTA) | Marine profond `#0e1f37` → `#1c3350` | Fond du logo |
| Accent métallique unique | Or / laiton `#c9a962` → `#a3803f` | Clé et rameau d'olivier dorés du logo |
| Touche très sobre | Lavande `#8b7aab` | Rameau de lavande du logo |
| Touche très sobre | Vert olivier `#6f8f7c` | Rameau d'olivier du logo |
| Texte principal | Encre marine `#16243a` | — |

Contrairement à l'ancienne charte (multicolore, une couleur différente par carte), chaque page n'utilise plus qu'une seule teinte signature sombre (le marine) et un seul accent métallique (l'or) pour les icônes, bordures et boutons — la lavande et l'olivier ne servent qu'en touches très ponctuelles (ex. cartes « valeurs »). Objectif : un rendu épuré, immédiatement identifiable comme haut de gamme, à l'opposé des sites « template IA » multicolores.

## 🖼️ Images

`roussillon-ocres.jpg`, `calanque-sormiou.jpg` (Cap Canaille, Cassis), `tournesols-valensole.jpg`, `facade-couleurs-provence.jpg`, `volets-bleus.jpg`, `aix-fontaine-rotonde.jpg` (ruelle fleurie d'Aix) — photos Provence intégrées dans les cartes, bandes photo et blocs image/texte de toutes les pages. `images/logo-passala.png` est le nouveau logo de marque, intégré dans le header et le footer.

## 🚀 Prochaines étapes recommandées

1. Confirmer l'adresse email définitive (`contact@passala-conciergerie.fr` est provisoire) et l'intégrer partout si différente.
2. Valider/corriger le contenu des pages À propos et Partenaires avec les vraies informations.
3. Remplacer les photos placeholder par les vraies photos des biens et de la fondatrice.
4. Décider si un envoi d'email automatique (EmailJS) est nécessaire en plus de l'enregistrement des leads.
5. Ajouter de nouveaux biens au fur et à mesure via la table `properties`.
6. Une fois validé, publier le site via l'onglet **Publish**.

## 🌐 Déploiement

Pour rendre le site accessible en ligne, direction l'onglet **Publish** du projet : il gère automatiquement le déploiement et vous fournit l'URL publique.
