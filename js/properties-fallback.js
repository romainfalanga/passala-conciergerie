// Passala Conciergerie — Données de secours (lecture seule)
//
// POURQUOI CE FICHIER EXISTE :
// Le site utilise normalement l'API "tables/properties" fournie par la plateforme
// Genspark (base Cloudflare D1 après un Hosted Deploy, ou aperçu Genspark).
// Si le site est publié tel quel sur un hébergeur qui ne connaît pas cette API
// (ex. Netlify, qui sert uniquement les fichiers statiques du dépôt GitHub), les
// appels à "tables/properties" échouent (404 / page HTML au lieu de JSON) et la
// page "Nos biens" affichait à tort "Aucun bien à afficher pour le moment."
//
// Ce fichier contient une copie statique des biens, utilisée UNIQUEMENT en secours
// si l'appel à l'API tables/* échoue. Tant que l'API fonctionne (aperçu Genspark ou
// Hosted Deploy), ce fichier n'est jamais utilisé : les vraies données de la table
// restent la source de vérité.
//
// ⚠️ IMPORTANT : si vous ajoutez, modifiez ou supprimez un bien dans la table
// "properties", pensez à répercuter le changement ici pour que la version publiée
// sur Netlify reste à jour. C'est une limite inhérente à l'hébergement sur un
// serveur qui n'a pas de base de données réelle branchée dessus.
const PROPERTIES_FALLBACK = [
  {
    "id": "le-cosi",
    "name": "Le Cosi",
    "type": "Studio",
    "location": "Six-Fours-les-Plages",
    "capacity": 2,
    "bedrooms": 1,
    "bathrooms": 1,
    "surface": 25,
    "short_description": "Studio idéal pour un couple, entièrement rénové, à deux pas des plages de Six-Fours-les-Plages.",
    "description": "Le Cosi est un studio lumineux entièrement refait à neuf, idéal pour les couples, amis ou voyageurs d'affaires. Il dispose d'un coin salon, d'un espace nuit séparé, d'une cuisine équipée, d'une salle de bain et d'un balcon. Profitez du Wifi, de la TV et d'une place de parking privé. Idéalement situé à proximité des plages, des restaurants et des attractions touristiques. Les animaux de compagnie sont les bienvenus.",
    "amenities": ["Wifi", "Télévision", "Cuisine équipée", "Parking intérieur privé", "Balcon", "Animaux acceptés"],
    "image_main": "images/le-cosi-salon.jpg",
    "image_gallery_1": "images/le-cosi-cuisine.jpg",
    "image_gallery_2": "images/le-cosi-chambre.jpg",
    "image_gallery_3": "images/le-cosi-sdb.jpg",
    "image_gallery_4": "images/le-cosi-balcon.jpg",
    "featured": false,
    "price_note": "Réservation directe, réponse sous 24h",
    "booking_url": "https://www.airbnb.fr/rooms/1195368552455371664?unique_share_id=073f26dc-8908-4ac9-97e6-847ddd6d88ff&viralityEntryPoint=1&s=76",
    "booking_label": "Réserver sur Airbnb",
    "booking_url_2": "https://www.booking.com/hotel/fr/le-cosi-six-fours-les-plages.fr.html",
    "booking_label_2": "Réserver sur Booking",
    "direct_booking": true,
    "accepts_pets": true,
    "rating_airbnb": null,
    "rating_airbnb_count": null,
    "rating_booking": null,
    "rating_booking_count": null
  }
];
