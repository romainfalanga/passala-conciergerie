// Passala Conciergerie — pages « Nos biens » et « Fiche bien ».
// Toutes les données viennent de l'API (base Cloudflare D1), gérée depuis l'espace admin.

const AMENITY_ICONS = {
  'wifi': 'fa-wifi', 'télévision': 'fa-tv', 'tv': 'fa-tv', 'cuisine': 'fa-utensils', 'parking': 'fa-square-parking',
  'balcon': 'fa-umbrella-beach', 'terrasse': 'fa-umbrella-beach', 'animaux': 'fa-paw', 'piscine': 'fa-water-ladder',
  'climatisation': 'fa-snowflake', 'jardin': 'fa-seedling', 'lave-linge': 'fa-soap', 'lave-vaisselle': 'fa-sink',
  'vue mer': 'fa-mountain-sun', 'plage': 'fa-umbrella-beach', 'barbecue': 'fa-fire', 'ascenseur': 'fa-elevator',
  'chauffage': 'fa-temperature-arrow-up', 'linge': 'fa-bed', 'ménage': 'fa-broom', 'bébé': 'fa-baby'
};
function amenityIcon(name) {
  const lower = String(name).toLowerCase();
  const match = Object.keys(AMENITY_ICONS).find(k => lower.includes(k));
  return match ? AMENITY_ICONS[match] : 'fa-circle-check';
}

const esc = v => Passala.escape(v);
const safeUrl = v => Passala.url(v);
const PLACEHOLDER = 'images/interior-provencal.jpg';

function propertyCardHTML(p) {
  const href = 'bien.html?id=' + encodeURIComponent(p.id);
  const cover = p.photos[0];
  const meta = [
    `<span><i class="fa-solid fa-user-group"></i> ${esc(p.capacity)} pers.</span>`,
    p.bedrooms !== null ? `<span><i class="fa-solid fa-bed"></i> ${esc(p.bedrooms)} ch.</span>` : '',
    p.bathrooms !== null ? `<span><i class="fa-solid fa-bath"></i> ${esc(p.bathrooms)} sdb</span>` : '',
    p.surface !== null ? `<span><i class="fa-solid fa-ruler-combined"></i> ${esc(p.surface)} m²</span>` : ''
  ].join('');
  const price = p.nightly_price !== null ? `<p class="card-price">À partir de <strong>${Passala.euros(p.nightly_price)}</strong> / nuit</p>` : '';
  return `
    <article class="property-card" data-type="${esc(p.type)}">
      <a href="${href}" class="thumb">
        <span class="tag">${esc(p.type)}</span>
        <img src="${safeUrl(cover?.url) || PLACEHOLDER}" alt="${esc(cover?.alt || p.name)}" loading="lazy">
      </a>
      <div class="body">
        <h3><a href="${href}">${esc(p.name)}</a></h3>
        ${p.location ? `<div class="location"><i class="fa-solid fa-location-dot"></i> ${esc(p.location)}</div>` : ''}
        ${p.short_description ? `<p class="card-summary">${esc(p.short_description)}</p>` : ''}
        <div class="meta">${meta}</div>
        ${price}
        <a href="${href}" class="btn btn-outline btn-block">Découvrir ce bien</a>
      </div>
    </article>`;
}

async function renderPropertiesGrid() {
  const grid = document.getElementById('properties-grid');
  if (!grid) return;
  document.getElementById('filter-bar')?.remove();
  try {
    const { data } = await Passala.api('/properties');
    grid.innerHTML = data.length
      ? data.map(propertyCardHTML).join('')
      : '<p class="text-center">Aucun bien à afficher pour le moment.</p>';
  } catch (error) {
    grid.innerHTML = '<p class="text-center">Impossible de charger les biens pour le moment. Merci de réessayer plus tard.</p>';
    console.error(error);
  }
}

function message(root, title, text) {
  root.innerHTML = `<div class="container text-center" style="padding:120px 0;"><h2>${esc(title)}</h2>${text ? `<p>${esc(text)}</p>` : ''}<a href="nos-biens.html" class="btn btn-primary">Voir tous nos biens</a></div>`;
}

async function renderPropertyDetail() {
  const root = document.getElementById('property-detail');
  if (!root) return;
  const id = new URLSearchParams(location.search).get('id');
  if (!id) return message(root, 'Bien introuvable', 'Merci de sélectionner un bien depuis la page « Nos biens ».');
  let p;
  try {
    p = await Passala.api('/properties/' + encodeURIComponent(id));
  } catch (error) {
    return error.status === 404 ? message(root, 'Ce bien n\'est plus disponible') : message(root, 'Erreur de chargement', 'Merci de réessayer plus tard.');
  }
  document.title = `${p.name}${p.location ? ' - ' + p.location : ''} | Passala Conciergerie`;

  const facts = [
    `<li><i class="fa-solid fa-user-group"></i> ${esc(p.capacity)} voyageurs</li>`,
    p.bedrooms !== null ? `<li><i class="fa-solid fa-bed"></i> ${esc(p.bedrooms)} chambre${p.bedrooms > 1 ? 's' : ''}</li>` : '',
    p.bathrooms !== null ? `<li><i class="fa-solid fa-bath"></i> ${esc(p.bathrooms)} salle${p.bathrooms > 1 ? 's' : ''} de bain</li>` : '',
    p.surface !== null ? `<li><i class="fa-solid fa-ruler-combined"></i> ${esc(p.surface)} m²</li>` : '',
    p.location ? `<li><i class="fa-solid fa-location-dot"></i> ${esc(p.location)}</li>` : ''
  ].join('');
  const amenities = p.amenities.map(a => `<li><i class="fa-solid ${amenityIcon(a)}"></i> ${esc(a)}</li>`).join('');
  const description = esc(p.description || p.short_description).replace(/\n+/g, '</p><p>');

  root.innerHTML = `
    <div class="container property-detail-top">
      <h1 class="property-title">${esc(p.name)}</h1>
      ${ratingsHTML(p)}
      ${galleryHTML(p)}
      <div class="property-layout">
        <div>
          <ul class="amenity-list property-facts">${facts}</ul>
          <p>${description}</p>
          ${amenities ? `<h3 style="margin-top:36px;margin-bottom:12px;">Équipements &amp; prestations</h3><ul class="amenity-list" style="margin-bottom:0;">${amenities}</ul>` : ''}
        </div>
        <aside><div class="sticky-card booking-card">${bookingCardHTML(p)}</div></aside>
      </div>
    </div>
    <br><br>
    ${p.direct_booking ? bookingModalHTML(p) : ''}`;

  root.querySelector('.btn-book-now')?.addEventListener('click', openBookingModal);
  if (p.direct_booking) initBookingModal(p);
}

function bookingCardHTML(p) {
  const links = [
    p.airbnb_url ? `<a href="${safeUrl(p.airbnb_url)}" target="_blank" rel="noopener" class="btn btn-outline btn-block" style="margin-top:10px;font-size:0.85rem;">Voir sur Airbnb <i class="fa-solid fa-arrow-up-right-from-square"></i></a>` : '',
    p.booking_url ? `<a href="${safeUrl(p.booking_url)}" target="_blank" rel="noopener" class="btn btn-outline btn-block" style="margin-top:10px;font-size:0.85rem;">Voir sur Booking.com <i class="fa-solid fa-arrow-up-right-from-square"></i></a>` : ''
  ].join('');
  const price = p.nightly_price !== null
    ? `<p class="booking-card-price"><strong>${Passala.euros(p.nightly_price)}</strong> / nuit${p.cleaning_fee ? `<br><small>+ ${Passala.euros(p.cleaning_fee)} de ménage</small>` : ''}</p>`
    : '';
  if (p.direct_booking) {
    return `
      <h3>Réserver ce logement</h3>
      ${price}
      <button type="button" class="btn btn-primary btn-block btn-book-now"><i class="fa-solid fa-calendar-check"></i> Demander une réservation</button>
      ${[p.price_note, p.min_nights > 1 ? `${p.min_nights} nuits minimum` : ''].filter(Boolean).length ? `<p class="booking-card-note">${esc([p.price_note, p.min_nights > 1 ? `${p.min_nights} nuits minimum` : ''].filter(Boolean).join(' · '))}</p>` : ''}
      ${links}`;
  }
  return `
    <h3>${links ? 'Réserver ce bien' : 'Intéressé par ce bien ?'}</h3>
    ${price}
    ${p.price_note ? `<p class="price-note">${esc(p.price_note)}</p>` : ''}
    ${links}
    <a href="tel:+33744896602" class="btn btn-outline btn-block" style="margin-top:12px;"><i class="fa-solid fa-phone"></i> 07 44 89 66 02</a>`;
}

function ratingsHTML(p) {
  const chip = (icon, platform, value, max, count) => value === null ? '' : `
    <div class="rating-chip">
      <i class="${icon}"></i>
      <span class="rating-platform">${platform}</span>
      <span class="rating-value">${esc(value)}<small>/${max}</small></span>
      ${count ? `<span class="rating-count">(${esc(count)} avis)</span>` : ''}
    </div>`;
  const items = chip('fa-brands fa-airbnb', 'Airbnb', p.rating_airbnb, 5, p.rating_airbnb_count) + chip('fa-solid fa-star', 'Booking.com', p.rating_booking, 10, p.rating_booking_count);
  return items.trim() ? `<div class="ratings-row">${items}</div>` : '';
}

function galleryHTML(p) {
  const photos = p.photos.length ? p.photos : [{ url: PLACEHOLDER, alt: p.name }];
  const [main, ...rest] = photos;
  const thumbs = rest.slice(0, 4).map(ph => `<a href="${safeUrl(ph.url)}" target="_blank" rel="noopener" class="thumb-photo"><img src="${safeUrl(ph.url)}" alt="${esc(ph.alt || p.name)}" loading="lazy"></a>`).join('');
  return `
    <div class="property-gallery count-${Math.min(photos.length, 4)}">
      <a href="${safeUrl(main.url)}" target="_blank" rel="noopener" class="main-photo"><img src="${safeUrl(main.url)}" alt="${esc(main.alt || p.name)}"></a>
      ${thumbs}
    </div>`;
}

function bookingModalHTML(p) {
  return `
    <div id="booking-modal-overlay" class="booking-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="booking-modal-title">
      <div class="booking-modal">
        <button type="button" class="booking-modal-close" id="booking-modal-close" aria-label="Fermer"><i class="fa-solid fa-xmark"></i></button>
        <span class="eyebrow">Demande de réservation</span>
        <h3 id="booking-modal-title">Réserver ${esc(p.name)}</h3>
        <div id="booking-calendar" style="margin-bottom:14px;"></div>
        <div id="booking-quote" class="booking-quote" hidden></div>
        <form id="booking-form" novalidate>
          <div class="form-row">
            <div class="field">
              <label for="bk_guests">Voyageurs <span class="req">*</span></label>
              <input type="number" id="bk_guests" name="guests" min="1" max="${esc(p.capacity)}" value="${Math.min(2, p.capacity)}" required>
            </div>
            ${p.accepts_pets ? `
            <div class="field" style="display:flex;align-items:flex-end;">
              <div class="checkbox-field" style="margin-bottom:20px;">
                <input type="checkbox" id="bk_pets" name="pets">
                <label for="bk_pets">Je voyage avec un animal</label>
              </div>
            </div>` : ''}
          </div>
          <div class="form-row">
            <div class="field">
              <label for="bk_name">Nom &amp; prénom <span class="req">*</span></label>
              <input type="text" id="bk_name" name="full_name" required maxlength="120" autocomplete="name" placeholder="Jean Dupont">
            </div>
            <div class="field">
              <label for="bk_phone">Téléphone <span class="req">*</span></label>
              <input type="tel" id="bk_phone" name="phone" required maxlength="40" autocomplete="tel" placeholder="06 12 34 56 78">
            </div>
          </div>
          <div class="field">
            <label for="bk_email">Adresse email <span class="req">*</span></label>
            <input type="email" id="bk_email" name="email" required maxlength="254" autocomplete="email" placeholder="vous@exemple.fr">
          </div>
          <div class="field">
            <label for="bk_message">Message (optionnel)</label>
            <textarea id="bk_message" name="message" maxlength="3000" placeholder="Heure d'arrivée, questions particulières…"></textarea>
          </div>
          <input type="text" name="website" tabindex="-1" autocomplete="off" class="hp-field" aria-hidden="true">
          <div class="checkbox-field">
            <input type="checkbox" id="bk_consent" name="consent" required>
            <label for="bk_consent">J'accepte que mes informations soient utilisées pour traiter ma demande de réservation. <span class="req">*</span></label>
          </div>
          <button type="submit" class="btn btn-primary btn-block" id="booking-submit-btn">
            <i class="fa-solid fa-paper-plane"></i> Envoyer ma demande
          </button>
          <p class="booking-card-note">Votre demande ne vaut pas confirmation : nous vous répondons sous 24 h. Aucun paiement en ligne.</p>
          <div id="booking-form-feedback" role="status"></div>
        </form>
      </div>
    </div>`;
}

function openBookingModal() {
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
  const form = document.getElementById('booking-form');
  const feedback = document.getElementById('booking-form-feedback');
  const submit = document.getElementById('booking-submit-btn');
  const quoteBox = document.getElementById('booking-quote');
  let range = { checkin: null, checkout: null }, identity = null, calendar = null;

  document.getElementById('booking-modal-close').addEventListener('click', closeBookingModal);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeBookingModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeBookingModal(); });

  const show = (type, html) => { feedback.className = type; feedback.innerHTML = html; feedback.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); };

  async function updateQuote() {
    quoteBox.hidden = true;
    if (!range.checkin || !range.checkout) return;
    const nights = Math.round((Date.parse(range.checkout) - Date.parse(range.checkin)) / 86400000);
    if (nights < p.min_nights) {
      quoteBox.hidden = false;
      quoteBox.innerHTML = `<i class="fa-solid fa-circle-info"></i> Ce logement se réserve pour ${p.min_nights} nuits minimum.`;
      return;
    }
    if (p.nightly_price === null) {
      quoteBox.hidden = false;
      quoteBox.innerHTML = `${nights} nuit${nights > 1 ? 's' : ''} · tarif communiqué avec notre réponse.`;
      return;
    }
    try {
      const q = await Passala.api(`/quote?property_id=${encodeURIComponent(p.id)}&checkin=${range.checkin}&checkout=${range.checkout}`);
      quoteBox.hidden = false;
      quoteBox.innerHTML = `${q.nights} nuit${q.nights > 1 ? 's' : ''} × ${Passala.euros(q.nightly_price)}${q.cleaning_fee ? ` + ménage ${Passala.euros(q.cleaning_fee)}` : ''} = <strong>${Passala.euros(q.total)}</strong> <small>(estimation)</small>`;
    } catch { /* le devis est indicatif */ }
  }

  async function loadCalendar() {
    const container = document.getElementById('booking-calendar');
    let unavailable = new Set();
    try { unavailable = await fetchUnavailableDates(p.id); } catch (error) { show('error', esc(error.message)); }
    if (calendar) return calendar.refreshUnavailable(unavailable);
    calendar = createAvailabilityCalendar(container, {
      selectable: true, monthsToShow: 2, unavailable,
      onRangeChange(checkin, checkout) { range = { checkin, checkout }; updateQuote(); }
    });
  }
  loadCalendar();

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const data = {
      property_id: p.id, checkin: range.checkin, checkout: range.checkout,
      guests: parseInt(form.guests.value, 10) || 1, pets: Boolean(form.pets?.checked),
      full_name: form.full_name.value.trim(), email: form.email.value.trim(), phone: form.phone.value.trim(),
      message: form.message.value.trim(), consent: form.consent.checked, website: form.website.value
    };
    if (!data.checkin || !data.checkout) return show('error', 'Sélectionnez vos dates d\'arrivée et de départ dans le calendrier.');
    if (!data.full_name || !data.email || !data.phone) return show('error', 'Merci de remplir tous les champs obligatoires (*).');
    if (!data.consent) return show('error', 'Merci d\'accepter l\'utilisation de vos informations pour traiter la demande.');

    identity = Passala.requestIdentity(data, identity);
    submit.disabled = true;
    submit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Envoi en cours…';
    try {
      const result = await Passala.send('/bookings', 'POST', data, { 'Idempotency-Key': identity.key });
      show('success', `Merci ${esc(data.full_name.split(' ')[0])} ! Votre demande <strong>${esc(result.reference)}</strong> pour « ${esc(p.name)} » du ${esc(Passala.frDate(data.checkin))} au ${esc(Passala.frDate(data.checkout))} a bien été envoyée. Nous revenons vers vous sous 24 h pour la confirmer.`);
      form.reset();
      identity = null;
    } catch (error) {
      show('error', esc(error.message) + (error.status === 409 ? '' : ' Vous pouvez aussi nous appeler au 07 44 89 66 02.'));
      if (error.status === 409) loadCalendar();
    } finally {
      submit.disabled = false;
      submit.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Envoyer ma demande';
    }
  });
}
