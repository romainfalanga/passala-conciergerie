// Passala Conciergerie — chargement dynamique des biens depuis la Table API

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
  "Grande salle de réception": "fa-champagne-glasses",
  "Télévision": "fa-tv",
  "Parking intérieur privé": "fa-square-parking",
  "Balcon": "fa-umbrella-beach",
  "Balcon / terrasse": "fa-umbrella-beach",
  "Animaux acceptés": "fa-paw",
  "Entièrement rénové": "fa-sparkles",
  "Wifi": "fa-wifi"
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
        <div class="meta">
          <span><i class="fa-solid fa-user-group"></i> ${p.capacity} pers.</span>
          <span><i class="fa-solid fa-bed"></i> ${p.bedrooms} ch.</span>
          <span><i class="fa-solid fa-bath"></i> ${p.bathrooms} sdb</span>
          <span><i class="fa-solid fa-ruler-combined"></i> ${p.surface} m²</span>
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

    // Titre simple, sans filtres par type
    const filterBar = document.getElementById('filter-bar');
    if (filterBar) {
      filterBar.innerHTML = '<h2 class="filter-bar-title">Tous nos biens</h2>';
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
    document.title = p.name + ' — ' + p.location + ' | Passala Conciergerie';

    const amenities = (p.amenities || []).map(a => `<li><i class="fa-solid ${amenityIcon(a)}"></i> ${a}</li>`).join('');

    root.innerHTML = `
      <div class="container property-detail-top">
        <h1 class="property-title">${p.name}</h1>

        ${ratingsHTML(p)}

        ${propertyGalleryHTML(p)}

        <div class="property-layout">
          <div>
            <p>${p.description || p.short_description}</p>

            <h3 style="margin-top:36px;margin-bottom:12px;">Équipements &amp; prestations</h3>
            <ul class="amenity-list" style="margin-bottom:0;">${amenities}</ul>
          </div>

          <aside>
            <div class="sticky-card booking-card">
              ${p.direct_booking ? `
              <h3>Réserver ce logement</h3>
              <button type="button" class="btn btn-primary btn-block btn-book-now" onclick="openBookingModal('${p.id}', '${(p.name || '').replace(/'/g, "\\'")}')"><i class="fa-solid fa-calendar-check"></i> Réserver directement</button>
              <p class="booking-card-note">Réservation directe, sans commission de plateforme</p>
              ${p.booking_url ? `<a href="${p.booking_url}" target="_blank" rel="noopener" class="btn btn-outline btn-block" style="margin-top:10px;font-size:0.85rem;">${p.booking_label || 'Voir aussi sur Airbnb'} <i class="fa-solid fa-arrow-up-right-from-square"></i></a>` : ''}
              ` : p.booking_url ? `
              <h3>Réserver ce bien</h3>
              <p class="price-note">${p.price_note || ''}</p>
              <a href="${p.booking_url}" target="_blank" rel="noopener" class="btn btn-primary btn-block">${p.booking_label || 'Réserver en ligne'} <i class="fa-solid fa-arrow-up-right-from-square"></i></a>
              <p style="font-size:0.88rem;margin-top:18px;">Vous possédez un bien comparable ? Confiez-le nous et bénéficiez du même niveau d'exigence.</p>
              <a href="contact.html" class="btn btn-outline btn-block">Demander mon étude gratuite</a>
              ` : `
              <h3>Intéressé par un bien similaire ?</h3>
              <p class="price-note">${p.price_note || ''}</p>
              <p style="font-size:0.92rem;">Vous possédez une maison ou une villa comparable ? Confiez-la nous et bénéficiez du même niveau d'exigence.</p>
              <a href="contact.html" class="btn btn-primary btn-block">Demander mon étude gratuite</a>
              <a href="tel:+33744896602" class="btn btn-outline btn-block" style="margin-top:12px;"><i class="fa-solid fa-phone"></i> 07 44 89 66 02</a>
              `}
            </div>
          </aside>
        </div>
      </div>
      <br><br>

      ${p.direct_booking ? bookingModalHTML(p) : ''}
    `;

    if (p.direct_booking) initBookingModal(p);
  } catch (e) {
    root.innerHTML = '<div class="container text-center" style="padding:120px 0;"><h2>Erreur de chargement</h2><p>Merci de réessayer plus tard.</p></div>';
    console.error(e);
  }
}

function ratingsHTML(p) {
  const items = [];
  if (p.rating_airbnb) {
    items.push(`
      <div class="rating-chip">
        <i class="fa-brands fa-airbnb"></i>
        <span class="rating-platform">Airbnb</span>
        <span class="rating-value">${p.rating_airbnb}<small>/5</small></span>
        ${p.rating_airbnb_count ? `<span class="rating-count">(${p.rating_airbnb_count} avis)</span>` : ''}
      </div>`);
  }
  if (p.rating_booking) {
    items.push(`
      <div class="rating-chip">
        <i class="fa-solid fa-star"></i>
        <span class="rating-platform">Booking.com</span>
        <span class="rating-value">${p.rating_booking}<small>/10</small></span>
        ${p.rating_booking_count ? `<span class="rating-count">(${p.rating_booking_count} avis)</span>` : ''}
      </div>`);
  }
  if (!items.length) return '';
  return `<div class="ratings-row">${items.join('')}</div>`;
}

function propertyGalleryHTML(p) {
  // Toutes les photos, sans doublon (au cas où image_main serait aussi listée en galerie)
  const all = [p.image_main, p.image_gallery_1, p.image_gallery_2, p.image_gallery_3, p.image_gallery_4]
    .filter(Boolean)
    .filter((src, i, arr) => arr.indexOf(src) === i);

  const count = all.length;
  const main = all[0];
  const thumbs = all.slice(1, 5);

  const thumbsHTML = thumbs.map((src, i) => `
      <a href="${src}" target="_blank" rel="noopener" class="thumb-photo"><img src="${src}" alt="${p.name} — vue ${i + 2}" loading="lazy"></a>`).join('');

  return `
    <div class="property-gallery count-${Math.min(count, 4) || 1}">
      <a href="${main}" target="_blank" rel="noopener" class="main-photo"><img src="${main}" alt="${p.name} — vue principale"></a>
      ${thumbsHTML}
    </div>`;
}

function bookingModalHTML(p) {
  return `
    <div id="booking-modal-overlay" class="booking-modal-overlay">
      <div class="booking-modal">
        <button type="button" class="booking-modal-close" id="booking-modal-close" aria-label="Fermer"><i class="fa-solid fa-xmark"></i></button>
        <span class="eyebrow">Réservation directe</span>
        <h3 id="booking-modal-title">Réserver — ${p.name}</h3>
        <div id="booking-calendar" style="margin-bottom:22px;"></div>
        <form id="booking-form">
          <input type="hidden" id="bk_checkin" name="checkin">
          <input type="hidden" id="bk_checkout" name="checkout">
          <div class="form-row">
            <div class="field">
              <label for="bk_guests">Voyageurs <span class="req">*</span></label>
              <input type="number" id="bk_guests" name="guests" min="1" max="${p.capacity || 10}" value="2" required>
            </div>
            <div class="field" style="display:flex;align-items:flex-end;">
              <div class="checkbox-field" style="margin-bottom:20px;">
                <input type="checkbox" id="bk_pets" name="pets">
                <label for="bk_pets">Je voyage avec un animal</label>
              </div>
            </div>
          </div>
          <div class="form-row">
            <div class="field">
              <label for="bk_name">Nom &amp; prénom <span class="req">*</span></label>
              <input type="text" id="bk_name" name="full_name" required placeholder="Jean Dupont">
            </div>
            <div class="field">
              <label for="bk_phone">Téléphone <span class="req">*</span></label>
              <input type="tel" id="bk_phone" name="phone" required placeholder="06 12 34 56 78">
            </div>
          </div>
          <div class="field">
            <label for="bk_email">Adresse email <span class="req">*</span></label>
            <input type="email" id="bk_email" name="email" required placeholder="vous@exemple.fr">
          </div>
          <div class="field">
            <label for="bk_message">Message (optionnel)</label>
            <textarea id="bk_message" name="message" placeholder="Heure d'arrivée, questions particulières…"></textarea>
          </div>
          <button type="submit" class="btn btn-primary btn-block" id="booking-submit-btn">
            <i class="fa-solid fa-paper-plane"></i> Envoyer ma demande de réservation
          </button>
          <div id="booking-form-feedback"></div>
        </form>
      </div>
    </div>`;
}

function openBookingModal(propertyId, propertyName) {
  const overlay = document.getElementById('booking-modal-overlay');
  if (!overlay) return;
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeBookingModal() {
  const overlay = document.getElementById('booking-modal-overlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  document.body.style.overflow = '';
}

async function initBookingModal(p) {
  const overlay = document.getElementById('booking-modal-overlay');
  const closeBtn = document.getElementById('booking-modal-close');
  const form = document.getElementById('booking-form');
  if (!overlay || !form) return;

  closeBtn.addEventListener('click', closeBookingModal);
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) closeBookingModal();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeBookingModal();
  });

  // Calendrier de disponibilité (rouge = indisponible, vert = disponible)
  const calContainer = document.getElementById('booking-calendar');
  if (calContainer && typeof createAvailabilityCalendar === 'function') {
    let unavailable = new Set();
    try { unavailable = await fetchUnavailableDates(p.id); } catch (e) { console.error(e); }
    createAvailabilityCalendar(calContainer, {
      propertyId: p.id,
      selectable: true,
      monthsToShow: 2,
      unavailable: unavailable,
      onRangeChange: function (checkin, checkout) {
        form.checkin.value = checkin || '';
        form.checkout.value = checkout || '';
      }
    });
  }

  const feedback = document.getElementById('booking-form-feedback');
  const submitBtn = document.getElementById('booking-submit-btn');

  form.addEventListener('submit', async function (e) {
    e.preventDefault();

    const data = {
      property_id: p.id,
      property_name: p.name,
      checkin: form.checkin.value,
      checkout: form.checkout.value,
      guests: parseInt(form.guests.value, 10) || 1,
      pets: form.pets.checked,
      full_name: form.full_name.value.trim(),
      email: form.email.value.trim(),
      phone: form.phone.value.trim(),
      message: form.message.value.trim(),
      status: 'Nouvelle'
    };

    if (!data.checkin || !data.checkout || !data.full_name || !data.email || !data.phone) {
      showBookingFeedback('error', 'Merci de remplir tous les champs obligatoires (*).');
      return;
    }
    if (new Date(data.checkout) <= new Date(data.checkin)) {
      showBookingFeedback('error', 'La date de départ doit être postérieure à la date d\'arrivée.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Envoi en cours…';

    try {
      const res = await fetch('tables/booking_requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error('Erreur serveur');

      showBookingFeedback('success', 'Merci ' + data.full_name.split(' ')[0] + ' ! Votre demande de réservation pour « ' + p.name + ' » a bien été enregistrée. Nous vous confirmons votre séjour sous 24h par téléphone ou email.');
      form.reset();
      form.guests.value = 2;
    } catch (err) {
      console.error(err);
      showBookingFeedback('error', 'Une erreur est survenue lors de l\'envoi. Merci de réessayer, ou de nous appeler directement au 07 44 89 66 02.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Envoyer ma demande de réservation';
    }
  });

  function showBookingFeedback(type, text) {
    feedback.className = type;
    feedback.innerHTML = text;
    feedback.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}
