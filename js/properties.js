// La Clef Provençale — chargement dynamique des biens depuis la Table API

const AMENITY_ICONS = {
  "Piscine à débordement": "fa-water-ladder",
  "Piscine à débordement chauffée": "fa-water-ladder",
  "Piscine chauffée": "fa-water-ladder",
  "Piscine 18m": "fa-water-ladder",
  "Climatisation": "fa-snowflake",
  "Wifi haut débit": "fa-wifi",
  "Wifi fibre": "fa-wifi",
  "Parking privé": "fa-square-parking",
  "Jardin paysager": "fa-seedling",
  "Cuisine d'été": "fa-utensils",
  "Court de tennis": "fa-table-tennis-paddle-ball",
  "Salle de sport": "fa-dumbbell",
  "Cave à vin": "fa-wine-bottle",
  "Sécurité 24/7": "fa-shield-halved",
  "Service de conciergerie sur place": "fa-concierge-bell",
  "Vue mer panoramique": "fa-mountain-sun",
  "Accès direct sentier des Calanques": "fa-person-hiking",
  "Domotique": "fa-house-signal",
  "Ménage hôtelier inclus": "fa-broom",
  "Pool house": "fa-umbrella-beach",
  "Terrain de pétanque": "fa-baseball",
  "Vignoble privé": "fa-wine-glass",
  "Grande salle de réception": "fa-champagne-glasses"
};

function amenityIcon(name) {
  return AMENITY_ICONS[name] || 'fa-circle-check';
}

async function fetchProperties() {
  const res = await fetch('tables/properties?limit=100');
  const json = await res.json();
  return (json.data || []).filter(p => !p.deleted);
}

async function fetchProperty(id) {
  const res = await fetch('tables/properties/' + encodeURIComponent(id));
  if (!res.ok) return null;
  return await res.json();
}

function propertyCardHTML(p) {
  return `
    <article class="property-card" data-type="${p.type}">
      <a href="bien.html?id=${encodeURIComponent(p.id)}" class="thumb">
        <span class="tag">${p.type}</span>
        <img src="${p.image_main}" alt="${p.name} — ${p.location}" loading="lazy">
      </a>
      <div class="body">
        <h3><a href="bien.html?id=${encodeURIComponent(p.id)}">${p.name}</a></h3>
        <div class="location"><i class="fa-solid fa-location-dot"></i> ${p.location}</div>
        <p>${p.short_description}</p>
        <div class="meta">
          <span><i class="fa-solid fa-user-group"></i> ${p.capacity} pers.</span>
          <span><i class="fa-solid fa-bed"></i> ${p.bedrooms} ch.</span>
          <span><i class="fa-solid fa-bath"></i> ${p.bathrooms} sdb</span>
        </div>
        <a href="bien.html?id=${encodeURIComponent(p.id)}" class="btn btn-outline btn-block">Découvrir ce bien</a>
      </div>
    </article>`;
}

async function renderPropertiesGrid() {
  const grid = document.getElementById('properties-grid');
  if (!grid) return;
  try {
    const properties = await fetchProperties();
    if (!properties.length) {
      grid.innerHTML = '<p class="text-center">Aucun bien à afficher pour le moment.</p>';
      return;
    }
    grid.innerHTML = properties.map(propertyCardHTML).join('');

    // Filtres par type
    const filterBar = document.getElementById('filter-bar');
    if (filterBar) {
      const types = Array.from(new Set(properties.map(p => p.type)));
      filterBar.innerHTML = '<button class="filter-btn active" data-filter="all">Tous les biens</button>' +
        types.map(t => `<button class="filter-btn" data-filter="${t}">${t}</button>`).join('');
      filterBar.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          filterBar.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const filter = btn.dataset.filter;
          grid.querySelectorAll('.property-card').forEach(card => {
            card.style.display = (filter === 'all' || card.dataset.type === filter) ? '' : 'none';
          });
        });
      });
    }
  } catch (e) {
    grid.innerHTML = '<p class="text-center">Impossible de charger les biens pour le moment. Merci de réessayer plus tard.</p>';
    console.error(e);
  }
}

async function renderPropertyDetail() {
  const root = document.getElementById('property-detail');
  if (!root) return;
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  if (!id) {
    root.innerHTML = '<div class="container text-center" style="padding:120px 0;"><h2>Bien introuvable</h2><p>Merci de sélectionner un bien depuis la page « Nos biens ».</p><a href="nos-biens.html" class="btn btn-primary">Voir tous nos biens</a></div>';
    return;
  }
  try {
    const p = await fetchProperty(id);
    if (!p || p.deleted) {
      root.innerHTML = '<div class="container text-center" style="padding:120px 0;"><h2>Ce bien n\'est plus disponible</h2><a href="nos-biens.html" class="btn btn-primary">Voir tous nos biens</a></div>';
      return;
    }
    document.title = p.name + ' — ' + p.location + ' | La Clef Provençale';

    const amenities = (p.amenities || []).map(a => `<li><i class="fa-solid ${amenityIcon(a)}"></i> ${a}</li>`).join('');

    root.innerHTML = `
      <section class="property-hero">
        <div class="hero-bg" style="background-image:url('${p.image_main}');"></div>
        <div class="container property-hero-content">
          <span class="tag" style="display:inline-block;margin-bottom:16px;padding:6px 16px;border-radius:100px;font-size:0.78rem;font-weight:700;text-transform:uppercase;">${p.type}</span>
          <h1>${p.name}</h1>
          <p style="color:#efe9df;font-size:1.1rem;"><i class="fa-solid fa-location-dot"></i> ${p.location}</p>
        </div>
      </section>

      <div class="container">
        <div class="property-gallery">
          <img src="${p.image_main}" alt="${p.name} — vue principale">
          <div class="side">
            <img src="${p.image_gallery_1 || p.image_main}" alt="${p.name} — vue 2">
            <img src="${p.image_gallery_2 || p.image_main}" alt="${p.name} — vue 3">
          </div>
        </div>

        <div class="breadcrumb" style="margin-top:40px;">
          <a href="nos-biens.html">Nos biens</a> / ${p.name}
        </div>

        <div class="property-layout">
          <div>
            <span class="eyebrow">Présentation</span>
            <h2>${p.name}</h2>
            <p>${p.description || p.short_description}</p>

            <h3 style="margin-top:36px;">Équipements &amp; prestations</h3>
            <ul class="amenity-list">${amenities}</ul>

            <div class="meta" style="gap:28px;margin-top:10px;">
              <span><i class="fa-solid fa-user-group"></i> ${p.capacity} personnes</span>
              <span><i class="fa-solid fa-bed"></i> ${p.bedrooms} chambres</span>
              <span><i class="fa-solid fa-bath"></i> ${p.bathrooms} salles de bain</span>
              <span><i class="fa-solid fa-ruler-combined"></i> ${p.surface} m²</span>
            </div>
          </div>

          <aside>
            <div class="sticky-card">
              <h3>Intéressé par un bien similaire ?</h3>
              <p class="price-note">${p.price_note || ''}</p>
              <p style="font-size:0.92rem;">Vous possédez une maison ou une villa comparable ? Confiez-la nous et bénéficiez du même niveau d'exigence.</p>
              <a href="contact.html" class="btn btn-primary btn-block">Demander mon étude gratuite</a>
              <a href="tel:+33744896602" class="btn btn-outline btn-block" style="margin-top:12px;"><i class="fa-solid fa-phone"></i> 07 44 89 66 02</a>
            </div>
          </aside>
        </div>
      </div>
      <br><br>
    `;
  } catch (e) {
    root.innerHTML = '<div class="container text-center" style="padding:120px 0;"><h2>Erreur de chargement</h2><p>Merci de réessayer plus tard.</p></div>';
    console.error(e);
  }
}
