// Passala Conciergerie — chargement dynamique des biens depuis l’API Cloudflare

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
  return (await Passala.api('/properties')).data;
}
async function fetchProperty(id) {
  try { return await Passala.api('/properties/' + encodeURIComponent(id)); }
  catch (error) { if (error.status === 404) return null; throw error; }
}
const escapeHTML = value => Passala.escape(value);
const safeURL = value => Passala.url(value);

function propertyCardHTML(p) {
  return `
    <article class="property-card" data-type="${escapeHTML(p.type)}">
      <a href="bien.html?id=${encodeURIComponent(p.id)}" class="thumb">
        <span class="tag">${escapeHTML(p.type)}</span>
        <img src="${safeURL(p.image_main)}" alt="${escapeHTML(p.name)} — ${escapeHTML(p.location)}" loading="lazy">
      </a>
      <div class="body">
        <h3><a href="bien.html?id=${encodeURIComponent(p.id)}">${escapeHTML(p.name)}</a></h3>
        <div class="location"><i class="fa-solid fa-location-dot"></i> ${escapeHTML(p.location)}</div>
        <div class="meta">
          <span><i class="fa-solid fa-user-group"></i> ${escapeHTML(p.capacity)} pers.</span>
          ${p.bedrooms == null ? '' : `<span><i class="fa-solid fa-bed"></i> ${escapeHTML(p.bedrooms)} ch.</span>`}
          ${p.bathrooms == null ? '' : `<span><i class="fa-solid fa-bath"></i> ${escapeHTML(p.bathrooms)} sdb</span>`}
          ${p.surface == null ? '' : `<span><i class="fa-solid fa-ruler-combined"></i> ${escapeHTML(p.surface)} m²</span>`}
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

    const amenities = (p.amenities || []).map(a => `<li><i class="fa-solid ${amenityIcon(a)}"></i> ${escapeHTML(a)}</li>`).join('');

    root.innerHTML = `
      <div class="container property-detail-top">
        <h1 class="property-title">${escapeHTML(p.name)}</h1>

        ${ratingsHTML(p)}

        ${propertyGalleryHTML(p)}

        <div class="property-layout">
          <div>
            <p>${escapeHTML(p.description || p.short_description)}</p>

            <h3 style="margin-top:36px;margin-bottom:12px;">Équipements &amp; prestations</h3>
            <ul class="amenity-list" style="margin-bottom:0;">${amenities}</ul>
          </div>

          <aside>
            <div class="sticky-card booking-card">
              ${p.direct_booking ? `
              <h3>Réserver ce logement</h3>
              <button type="button" class="btn btn-primary btn-block btn-book-now" id="open-booking-modal"><i class="fa-solid fa-calendar-check"></i> Réserver directement</button>
              <p class="booking-card-note">Réservation directe, sans commission de plateforme</p>
              ${p.booking_url ? `<a href="${safeURL(p.booking_url)}" target="_blank" rel="noopener" class="btn btn-outline btn-block" style="margin-top:10px;font-size:0.85rem;">${escapeHTML(p.booking_label || 'Voir aussi sur Airbnb')} <i class="fa-solid fa-arrow-up-right-from-square"></i></a>` : ''}
              ` : p.booking_url ? `
              <h3>Réserver ce bien</h3>
              <p class="price-note">${escapeHTML(p.price_note || '')}</p>
              <a href="${safeURL(p.booking_url)}" target="_blank" rel="noopener" class="btn btn-primary btn-block">${escapeHTML(p.booking_label || 'Réserver en ligne')} <i class="fa-solid fa-arrow-up-right-from-square"></i></a>
              <p style="font-size:0.88rem;margin-top:18px;">Vous possédez un bien comparable ? Confiez-le nous et bénéficiez du même niveau d'exigence.</p>
              <a href="contact.html" class="btn btn-outline btn-block">Demander mon étude gratuite</a>
              ` : `
              <h3>Intéressé par un bien similaire ?</h3>
              <p class="price-note">${escapeHTML(p.price_note || '')}</p>
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

    if (p.direct_booking) { document.getElementById('open-booking-modal').addEventListener('click', openBookingModal); initBookingModal(p); }
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
        <span class="rating-value">${escapeHTML(p.rating_airbnb)}<small>/5</small></span>
        ${p.rating_airbnb_count ? `<span class="rating-count">(${escapeHTML(p.rating_airbnb_count)} avis)</span>` : ''}
      </div>`);
  }
  if (p.rating_booking) {
    items.push(`
      <div class="rating-chip">
        <i class="fa-solid fa-star"></i>
        <span class="rating-platform">Booking.com</span>
        <span class="rating-value">${escapeHTML(p.rating_booking)}<small>/10</small></span>
        ${p.rating_booking_count ? `<span class="rating-count">(${escapeHTML(p.rating_booking_count)} avis)</span>` : ''}
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
      <a href="${safeURL(src)}" target="_blank" rel="noopener" class="thumb-photo"><img src="${safeURL(src)}" alt="${escapeHTML(p.name)} — vue ${i + 2}" loading="lazy"></a>`).join('');

  return `
    <div class="property-gallery count-${Math.min(count, 4) || 1}">
      <a href="${safeURL(main)}" target="_blank" rel="noopener" class="main-photo"><img src="${safeURL(main)}" alt="${escapeHTML(p.name)} — vue principale"></a>
      ${thumbsHTML}
    </div>`;
}

function bookingModalHTML(p) {
  return `
    <div id="booking-modal-overlay" class="booking-modal-overlay">
      <div class="booking-modal" role="dialog" aria-modal="true" aria-labelledby="booking-modal-title" tabindex="-1">
        <button type="button" class="booking-modal-close" id="booking-modal-close" aria-label="Fermer"><i class="fa-solid fa-xmark"></i></button>
        <span class="eyebrow">Réservation directe</span>
        <h3 id="booking-modal-title">Réserver — ${escapeHTML(p.name)}</h3>
        <div id="booking-calendar" style="margin-bottom:22px;"></div>
        <form id="booking-form">
          <p>Votre séjour sera confirmé après validation par notre équipe. Une demande ne bloque pas les dates.</p>
          <div class="form-honeypot" aria-hidden="true"><label>Site web<input name="website" tabindex="-1" autocomplete="off"></label></div>
          <input type="hidden" id="bk_checkin" name="checkin">
          <input type="hidden" id="bk_checkout" name="checkout">
          <div class="form-row">
            <div class="field">
              <label for="bk_guests">Voyageurs <span class="req">*</span></label>
              <input type="number" id="bk_guests" name="guests" min="1" max="${p.capacity || 10}" value="${Math.min(2, p.capacity)}" required>
            </div>
            <div class="field" style="display:flex;align-items:flex-end;">
              <div class="checkbox-field" style="margin-bottom:20px;">
                <input type="checkbox" id="bk_pets" name="pets" ${p.accepts_pets ? '' : 'disabled'}>
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
          <div class="checkbox-field"><input type="checkbox" id="bk_consent" name="consent" required><label for="bk_consent">J’accepte que mes coordonnées soient utilisées pour traiter ma demande de séjour.</label></div>
          <button type="submit" class="btn btn-primary btn-block" id="booking-submit-btn">
            <i class="fa-solid fa-paper-plane"></i> Envoyer ma demande de réservation
          </button>
          <div id="booking-form-feedback"></div>
        </form>
      </div>
    </div>`;
}

let bookingCalendarLoader;
function openBookingModal() {
  const overlay = document.getElementById('booking-modal-overlay');
  if (!overlay) return;
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  overlay.querySelector('.booking-modal').focus();
  bookingCalendarLoader?.();
}
function closeBookingModal() {
  document.getElementById('booking-modal-overlay')?.classList.remove('open');
  document.body.style.overflow = '';
  document.getElementById('open-booking-modal')?.focus();
}
function initBookingModal(p) {
  const overlay = document.getElementById('booking-modal-overlay'), form = document.getElementById('booking-form');
  const container = document.getElementById('booking-calendar'), button = document.getElementById('booking-submit-btn'), feedback = document.getElementById('booking-form-feedback');
  let calendar, identity, available = false, loading = false, submitting = false;
  button.disabled = true;
  function show(type, message) { feedback.className = type; feedback.textContent = message; }
  async function loadCalendar() {
    if (loading || submitting) return;
    loading = true; available = false; button.disabled = true;
    try {
      const unavailable = await fetchUnavailableDates(p.id);
      if (calendar) calendar.refreshUnavailable(unavailable);
      else calendar = createAvailabilityCalendar(container, {
        unavailable,
        onRangeChange(checkin, checkout) { form.checkin.value = checkin || ''; form.checkout.value = checkout || ''; }
      });
      available = true;
    } catch (error) {
      calendar = null;
      form.checkin.value = ''; form.checkout.value = '';
      container.textContent = error.message;
      const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'btn btn-outline'; retry.textContent = 'Actualiser les disponibilités'; retry.addEventListener('click', loadCalendar); container.append(document.createElement('br'), retry);
    } finally { loading = false; button.disabled = !available || submitting; }
  }
  bookingCalendarLoader = loadCalendar;
  document.getElementById('booking-modal-close').addEventListener('click', closeBookingModal);
  overlay.addEventListener('click', event => { if (event.target === overlay) closeBookingModal(); });
  document.addEventListener('keydown', event => {
    if (!overlay.classList.contains('open')) return;
    if (event.key === 'Escape') closeBookingModal();
    if (event.key === 'Tab') {
      const items = [...overlay.querySelectorAll('button:not([disabled]),input:not([type="hidden"]):not([disabled]):not([tabindex="-1"]),textarea,a[href]')].filter(el => el.getClientRects().length);
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === overlay.querySelector('.booking-modal'))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  });
  window.addEventListener('focus', () => { if (overlay.classList.contains('open')) loadCalendar(); });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!available || submitting || !form.reportValidity()) return;
    const data = {
      property_id: p.id, checkin: form.checkin.value, checkout: form.checkout.value,
      guests: Number(form.guests.value), pets: form.pets.checked,
      full_name: form.full_name.value.trim(), email: form.email.value.trim(), phone: form.phone.value.trim(),
      message: form.message.value.trim(), consent: form.consent.checked, website: form.website.value
    };
    if (!data.checkin || !data.checkout) { show('error', 'Choisissez une date d’arrivée et une date de départ.'); return; }
    identity = Passala.requestIdentity(data, identity);
    submitting = true; button.disabled = true; button.textContent = 'Enregistrement…';
    let refresh = false;
    try {
      const result = await Passala.api('/bookings', { method: 'POST', headers: { 'Idempotency-Key': identity.key }, body: identity.payload });
      show('success', `Votre demande pour ${p.name} a bien été enregistrée (référence ${result.id.slice(0, 8)}). Notre équipe vous contactera pour confirmer le séjour. Les dates ne sont pas bloquées avant cette confirmation.`);
      form.reset(); form.guests.value = Math.min(2, p.capacity); calendar?.reset(); identity = null; refresh = true;
    } catch (error) { show('error', error.message); refresh = error.status === 409; }
    finally { submitting = false; button.disabled = !available; button.textContent = 'Envoyer ma demande de réservation'; if (refresh) await loadCalendar(); }
  });
}
