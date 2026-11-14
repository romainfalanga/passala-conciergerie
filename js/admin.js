// Passala Conciergerie — espace d'administration.
// Toutes les opérations passent par l'API protégée (/api/admin/*) : session HttpOnly, base Cloudflare D1.
(() => {
  const $ = id => document.getElementById(id);
  const esc = v => Passala.escape(v);
  const api = (path, opts) => Passala.api(path, opts);
  const send = (path, method, data) => Passala.send(path, method, data);

  const STATUS = { pending: 'En attente', confirmed: 'Confirmée', rejected: 'Refusée', cancelled: 'Annulée' };
  const SOURCE = { site: 'Site', airbnb: 'Airbnb', booking: 'Booking.com', telephone: 'Téléphone', autre: 'Autre' };
  const LEAD_STATUS = { new: 'Nouveau', contacted: 'Contacté', closed: 'Clôturé' };
  const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

  let properties = [];
  let currentTab = 'dashboard';

  // ───────── Utilitaires ─────────
  let toastTimer;
  function toast(text, type = 'success') {
    const el = $('toast');
    el.textContent = text;
    el.className = 'toast ' + type;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, type === 'error' ? 7000 : 3500);
  }
  async function run(button, fn) {
    if (button) button.disabled = true;
    try { return await fn(); }
    catch (error) {
      if (error.status === 401) { showLogin(); toast('Votre session a expiré. Reconnectez-vous.', 'error'); }
      else toast(error.message, 'error');
    } finally { if (button) button.disabled = false; }
  }
  const nights = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
  const addDays = (key, n) => new Date(Date.parse(key + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
  const shortDate = key => Passala.frDate(key, { day: 'numeric', month: 'short' });
  const toCents = v => (v === '' || v === null || v === undefined) ? null : Math.round(Number(v) * 100);
  const fromCents = v => (v === null || v === undefined) ? '' : (v / 100).toString();
  const intOrNull = v => (v === '' ? null : Number(v));
  const fillPropertySelects = () => {
    document.querySelectorAll('.property-select').forEach(select => {
      const keep = select.value;
      const all = select.dataset.all ? `<option value="">${esc(select.dataset.all)}</option>` : '';
      select.innerHTML = all + properties.map(p => `<option value="${esc(p.id)}">${esc(p.name)}${p.published ? '' : ' (brouillon)'}</option>`).join('');
      if ([...select.options].some(o => o.value === keep)) select.value = keep;
    });
  };

  // ───────── Session ─────────
  function showLogin() {
    $('app-view').hidden = true; $('admin-user').hidden = true; $('login-view').hidden = false;
    $('login-email').focus();
  }
  async function enter(session) {
    $('login-view').hidden = true; $('app-view').hidden = false; $('admin-user').hidden = false;
    $('admin-email').textContent = session.email;
    await loadProperties();
    const tab = location.hash.slice(1);
    showTab(document.querySelector(`[data-tab="${tab}"]`) ? tab : 'dashboard');
  }
  $('login-form').addEventListener('submit', e => {
    e.preventDefault();
    $('login-error').textContent = '';
    run(e.submitter, async () => {
      try {
        const session = await send('/admin/login', 'POST', { email: $('login-email').value.trim(), password: $('login-password').value });
        $('login-form').reset();
        await enter(session);
      } catch (error) { $('login-error').textContent = error.message; }
    });
  });
  $('logout').addEventListener('click', () => run($('logout'), async () => { await send('/admin/logout', 'POST', {}); showLogin(); }));

  // ───────── Onglets ─────────
  const loaders = { dashboard: loadDashboard, bookings: () => loadBookings(), calendar: loadCalendar, properties: renderPropertyList, leads: () => loadLeads(), account: loadAccount };
  function showTab(name) {
    currentTab = name;
    document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('[data-panel]').forEach(p => { p.hidden = p.dataset.panel !== name; });
    history.replaceState(null, '', '#' + name);
    run(null, loaders[name]);
  }
  document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
  document.querySelectorAll('[data-goto]').forEach(b => b.addEventListener('click', () => showTab(b.dataset.goto)));

  function setBadge(id, n) { const el = $(id); el.hidden = !n || n === '0'; el.textContent = n; }

  // ───────── Tableau de bord ─────────
  function miniBooking(b, kind) {
    const when = kind === 'departure' ? `Départ ${shortDate(b.checkout)}` : kind === 'arrival' ? `Arrivée ${shortDate(b.checkin)}` : `Jusqu'au ${shortDate(b.checkout)}`;
    return `<div class="mini-row"><div><strong>${esc(b.full_name)}</strong><span>${esc(b.property_name)} · ${b.guests} pers. · ${esc(SOURCE[b.source])}</span></div><span class="mini-date">${when}</span></div>`;
  }
  async function loadDashboard() {
    const d = await api('/admin/dashboard');
    $('kpi-pending').textContent = d.pending;
    $('kpi-occupancy').textContent = d.occupancy_rate + ' %';
    $('kpi-revenue').textContent = Passala.euros(d.month_revenue) || '0 €';
    $('kpi-revenue-sub').textContent = `${d.month_bookings} séjour${d.month_bookings > 1 ? 's' : ''} en ${MONTHS[Number(d.month.slice(5)) - 1]}`;
    $('kpi-leads').textContent = d.new_leads;
    setBadge('badge-pending', d.pending); setBadge('badge-leads', d.new_leads);
    const empty = text => `<p class="empty">${text}</p>`;
    $('dash-inhouse').innerHTML = d.in_house.map(b => miniBooking(b, 'current')).join('') || empty('Aucun voyageur actuellement.');
    $('dash-arrivals').innerHTML = d.arrivals.map(b => miniBooking(b, 'arrival')).join('') || empty('Aucune arrivée prévue.');
    $('dash-departures').innerHTML = d.departures.map(b => miniBooking(b, 'departure')).join('') || empty('Aucun départ prévu.');
    const alerts = [];
    if (d.pending) alerts.push(`<div class="alert alert-warn"><i class="fa-solid fa-bell"></i> <span>${d.pending} demande${d.pending > 1 ? 's' : ''} de réservation attend${d.pending > 1 ? 'ent' : ''} votre réponse.</span> <button type="button" class="btn btn-primary" data-goto-inline="bookings">Traiter</button></div>`);
    if (!d.email_configured) alerts.push('<div class="alert"><i class="fa-solid fa-envelope"></i> <span>Les emails automatiques ne sont pas encore activés : pensez à prévenir les voyageurs vous-même. Voir l\'onglet Réglages.</span></div>');
    if (d.failed_emails) alerts.push(`<div class="alert alert-error"><i class="fa-solid fa-triangle-exclamation"></i> <span>${d.failed_emails} email(s) n'ont pas pu être envoyés.</span> <button type="button" class="btn btn-outline" data-goto-inline="account">Voir</button></div>`);
    $('dash-alerts').innerHTML = alerts.join('');
    $('dash-alerts').querySelectorAll('[data-goto-inline]').forEach(b => b.addEventListener('click', () => showTab(b.dataset.gotoInline)));
  }

  // ───────── Réservations ─────────
  let bookingOffset = 0, bookingTimer;
  const filters = $('booking-filters');
  filters.addEventListener('change', () => loadBookings());
  filters.addEventListener('input', e => { if (e.target.name === 'q') { clearTimeout(bookingTimer); bookingTimer = setTimeout(() => loadBookings(), 300); } });
  filters.addEventListener('submit', e => e.preventDefault());
  $('booking-more').addEventListener('click', () => run($('booking-more'), () => loadBookings(true)));

  async function loadBookings(more = false) {
    bookingOffset = more ? bookingOffset + 50 : 0;
    const params = new URLSearchParams(new FormData(filters));
    params.set('offset', bookingOffset);
    for (const [k, v] of [...params]) if (!v && k !== 'offset') params.delete(k);
    const result = await api('/admin/bookings?' + params);
    const html = result.data.map(bookingCard).join('');
    if (more) $('booking-list').insertAdjacentHTML('beforeend', html);
    else $('booking-list').innerHTML = html || '<div class="empty-state"><i class="fa-regular fa-calendar"></i><p>Aucune réservation pour ces critères.</p></div>';
    $('booking-more').hidden = !result.has_more;
    if (filters.status.value === 'pending' && !more) setBadge('badge-pending', result.data.length + (result.has_more ? '+' : ''));
  }

  function bookingCard(b) {
    const n = nights(b.checkin, b.checkout);
    const warnings = [];
    if (b.status === 'pending' && b.blocked_nights) warnings.push(`<p class="warn"><i class="fa-solid fa-triangle-exclamation"></i> ${b.blocked_nights} nuit(s) de cette période sont déjà occupées : la confirmation est impossible.</p>`);
    if (b.status === 'pending' && b.overlapping_requests) warnings.push(`<p class="warn soft"><i class="fa-solid fa-code-merge"></i> ${b.overlapping_requests} autre(s) demande(s) en attente sur des dates qui se chevauchent.</p>`);
    const actions = {
      pending: `<button type="button" class="btn btn-primary" data-action="confirmed"><i class="fa-solid fa-check"></i> Confirmer</button><button type="button" class="btn btn-outline" data-action="rejected"><i class="fa-solid fa-xmark"></i> Refuser</button>`,
      confirmed: `<button type="button" class="btn btn-outline danger" data-action="cancelled"><i class="fa-solid fa-ban"></i> Annuler la réservation</button>`,
      rejected: `<button type="button" class="btn btn-outline" data-action="pending"><i class="fa-solid fa-rotate-left"></i> Remettre en attente</button>`,
      cancelled: `<button type="button" class="btn btn-outline" data-action="pending"><i class="fa-solid fa-rotate-left"></i> Remettre en attente</button>`
    }[b.status];
    return `
      <article class="request-card status-border-${b.status}" data-id="${esc(b.id)}" data-version="${b.version}" data-ref="${esc(b.reference)}" data-source="${esc(b.source)}" data-name="${esc(b.full_name)}">
        <div class="request-top">
          <div>
            <span class="request-ref">${esc(b.reference)} · ${esc(SOURCE[b.source])} · reçue le ${new Date(b.created_at * 1000).toLocaleDateString('fr-FR')}</span>
            <h3>${esc(b.full_name)}</h3>
            <p class="request-property"><i class="fa-solid fa-house"></i> ${esc(b.property_name)}</p>
          </div>
          <span class="status status-${b.status}">${STATUS[b.status]}</span>
        </div>
        <div class="request-grid">
          <div><span>Séjour</span><strong>${esc(Passala.frDate(b.checkin))} → ${esc(Passala.frDate(b.checkout))}</strong><small>${n} nuit${n > 1 ? 's' : ''}</small></div>
          <div><span>Voyageurs</span><strong>${b.guests}${b.pets ? ' + animal' : ''}</strong></div>
          <div><span>Montant estimé</span><strong>${b.estimated_total !== null ? Passala.euros(b.estimated_total) : '—'}</strong></div>
          <div><span>Contact</span>${b.phone ? `<a href="tel:${esc(b.phone.replace(/[^+\d]/g, ''))}">${esc(b.phone)}</a>` : ''}${b.email ? `<a href="mailto:${esc(b.email)}?subject=${encodeURIComponent('Votre réservation ' + b.reference)}">${esc(b.email)}</a>` : ''}${!b.phone && !b.email ? '—' : ''}</div>
        </div>
        ${b.message ? `<p class="request-message">${esc(b.message)}</p>` : ''}
        ${warnings.join('')}
        <div class="note-row"><input type="text" class="note-input" maxlength="2000" placeholder="Note interne (visible uniquement ici)" value="${esc(b.admin_note)}"><button type="button" class="btn btn-outline" data-action="note">Enregistrer la note</button></div>
        <div class="request-actions">${actions}</div>
      </article>`;
  }

  $('booking-list').addEventListener('click', e => {
    const button = e.target.closest('[data-action]');
    if (!button) return;
    const card = button.closest('.request-card'), action = button.dataset.action;
    const body = { version: Number(card.dataset.version) };
    if (action === 'note') body.admin_note = card.querySelector('.note-input').value;
    else {
      const fromSite = card.dataset.source === 'site';
      const questions = {
        confirmed: `Confirmer la réservation ${card.dataset.ref} de ${card.dataset.name} ? Les dates seront bloquées${fromSite ? ' et le voyageur prévenu par email' : ''}.`,
        rejected: `Refuser la demande ${card.dataset.ref} ?${fromSite ? ' Le voyageur sera prévenu par email.' : ''}`,
        cancelled: `Annuler la réservation ${card.dataset.ref} ? Les dates seront libérées${fromSite ? ' et le voyageur prévenu par email' : ''}.`,
        pending: `Remettre la demande ${card.dataset.ref} en attente ?`
      };
      if (!confirm(questions[action])) return;
      body.status = action;
      body.admin_note = card.querySelector('.note-input').value;
    }
    run(button, async () => {
      const updated = await send('/admin/bookings/' + encodeURIComponent(card.dataset.id), 'PATCH', body);
      toast(action === 'note' ? 'Note enregistrée.' : `Réservation ${updated.reference} : ${STATUS[updated.status].toLowerCase()}.`);
      if (action === 'note') { card.dataset.version = updated.version; return; }
      await loadBookings();
    });
  });

  // Réservation manuelle
  $('manual-open').addEventListener('click', () => { $('manual-form').hidden = false; $('manual-form').scrollIntoView({ behavior: 'smooth' }); });
  $('manual-cancel').addEventListener('click', () => { $('manual-form').hidden = true; });
  $('manual-form').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target, data = Object.fromEntries(new FormData(f));
    data.guests = Number(data.guests);
    data.estimated_total = toCents(data.estimated_total);
    run(e.submitter, async () => {
      const r = await send('/admin/bookings', 'POST', data);
      toast(`Réservation ${r.reference} enregistrée et dates bloquées.`);
      f.reset(); f.hidden = true;
      filters.status.value = 'confirmed';
      await loadBookings();
    });
  });

  // ───────── Calendrier ─────────
  let calStart = (() => { const t = new Date(); return new Date(Date.UTC(t.getFullYear(), t.getMonth(), 1)); })();
  let calData = { nights: new Map(), pending: [] }, selection = null;
  $('cal-property').addEventListener('change', () => { selection = null; run(null, loadCalendar); });
  $('acal-prev').addEventListener('click', () => { calStart.setUTCMonth(calStart.getUTCMonth() - 1); run(null, loadCalendar); });
  $('acal-next').addEventListener('click', () => { calStart.setUTCMonth(calStart.getUTCMonth() + 1); run(null, loadCalendar); });

  const monthKey = (date, offset) => { const d = new Date(date); d.setUTCMonth(d.getUTCMonth() + offset); return d.toISOString().slice(0, 10); };

  async function loadCalendar() {
    const pid = $('cal-property').value;
    if (!pid) { $('admin-calendar').innerHTML = '<p class="empty">Ajoutez d\'abord un bien.</p>'; return; }
    const from = monthKey(calStart, 0), to = monthKey(calStart, 3);
    const r = await api(`/admin/calendar?property_id=${encodeURIComponent(pid)}&from=${from}&to=${to}`);
    calData = { nights: new Map(r.nights.map(n => [n.date, n])), pending: r.pending };
    renderCalendar();
  }

  function renderCalendar() {
    const today = new Date().toISOString().slice(0, 10);
    let html = '';
    for (let m = 0; m < 3; m++) {
      const first = monthKey(calStart, m), [y, mo] = first.split('-').map(Number);
      const days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
      const offset = (new Date(first + 'T00:00:00Z').getUTCDay() + 6) % 7;
      let cells = '<span></span>'.repeat(offset);
      for (let d = 1; d <= days; d++) {
        const key = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const night = calData.nights.get(key);
        const pending = calData.pending.filter(p => p.checkin <= key && key < p.checkout);
        let cls = 'acal-day', title = 'Libre', label = '';
        if (night?.booking_id) { cls += ' booked'; title = `${night.reference} · ${night.full_name} (${SOURCE[night.source]})`; if (key === night.date && !calData.nights.get(addDays(key, -1))?.booking_id) label = night.full_name.split(' ')[0]; }
        else if (night) { cls += ' blocked'; title = 'Bloqué' + (night.note ? ' : ' + night.note : ''); }
        if (pending.length) { cls += ' has-pending'; title += ` · ${pending.length} demande(s) en attente`; }
        if (key < today) cls += ' past';
        if (key === today) cls += ' today';
        if (selection && key >= selection.start && key <= (selection.end || selection.start)) cls += ' selected';
        cells += `<button type="button" class="${cls}" data-date="${key}" title="${esc(title)}"><span>${d}</span>${label ? `<small>${esc(label)}</small>` : ''}</button>`;
      }
      html += `<div class="acal-month"><h4>${MONTHS[mo - 1]} ${y}</h4><div class="acal-week">${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(d => `<span>${d}</span>`).join('')}</div><div class="acal-grid">${cells}</div></div>`;
    }
    $('admin-calendar').innerHTML = html;
    renderSelection();
  }

  $('admin-calendar').addEventListener('click', e => {
    const day = e.target.closest('.acal-day');
    if (!day) return;
    const key = day.dataset.date, night = calData.nights.get(key);
    if (night?.booking_id) {
      selection = null; renderCalendar();
      $('cal-selection').innerHTML = `<strong>${esc(night.full_name)}</strong> · ${esc(night.reference)} · ${esc(SOURCE[night.source])} <button type="button" class="btn btn-outline" id="cal-open-booking">Voir la réservation</button>`;
      $('cal-open-booking').addEventListener('click', () => { filters.status.value = ''; filters.period.value = ''; filters.q.value = night.reference; showTab('bookings'); });
      return;
    }
    if (!selection || selection.end) selection = { start: key, end: null };
    else if (key < selection.start) selection = { start: key, end: selection.start };
    else selection.end = key;
    renderCalendar();
  });

  function renderSelection() {
    const box = $('cal-selection');
    if (!selection) { box.innerHTML = 'Cliquez sur un premier jour puis sur un dernier jour pour sélectionner des nuits à bloquer ou libérer. Cliquez sur une nuit réservée pour voir la réservation.'; return; }
    const end = selection.end || selection.start, count = nights(selection.start, end) + 1;
    box.innerHTML = `
      <div class="sel-info">Du <strong>${esc(Passala.frDate(selection.start))}</strong> au <strong>${esc(Passala.frDate(end))}</strong> inclus · ${count} nuit${count > 1 ? 's' : ''}${selection.end ? '' : ' <em>(cliquez sur un dernier jour pour étendre)</em>'}</div>
      <div class="sel-actions">
        <input type="text" id="block-note" maxlength="250" placeholder="Motif (travaux, usage personnel…)">
        <button type="button" class="btn btn-primary" id="block-add"><i class="fa-solid fa-lock"></i> Bloquer</button>
        <button type="button" class="btn btn-outline" id="block-remove"><i class="fa-solid fa-lock-open"></i> Libérer</button>
        <button type="button" class="btn btn-outline" id="block-clear">Annuler</button>
      </div>`;
    const payload = () => ({ property_id: $('cal-property').value, checkin: selection.start, checkout: addDays(end, 1) });
    $('block-add').addEventListener('click', e => run(e.currentTarget, async () => { const r = await send('/admin/blocks', 'POST', { ...payload(), note: $('block-note').value }); toast(`${r.blocked} nuit(s) bloquée(s).`); selection = null; await loadCalendar(); }));
    $('block-remove').addEventListener('click', e => run(e.currentTarget, async () => { const r = await send('/admin/blocks', 'DELETE', payload()); toast(r.released ? `${r.released} nuit(s) libérée(s).` : 'Aucun blocage manuel sur cette période (les réservations s\'annulent depuis l\'onglet Réservations).', r.released ? 'success' : 'info'); selection = null; await loadCalendar(); }));
    $('block-clear').addEventListener('click', () => { selection = null; renderCalendar(); });
  }

  // ───────── Biens ─────────
  let editing = null;
  async function loadProperties() {
    properties = (await api('/admin/properties')).data;
    fillPropertySelects();
  }
  function renderPropertyList() {
    $('property-list').innerHTML = properties.map(p => `
      <button type="button" class="property-admin-card ${editing?.id === p.id ? 'active' : ''}" data-id="${esc(p.id)}">
        <img src="${Passala.url(p.photos[0]?.url) || 'images/interior-provencal.jpg'}" alt="">
        <span><strong>${esc(p.name)}</strong><small>${esc(p.type)}${p.location ? ' · ' + esc(p.location) : ''}</small>
        <em class="status ${p.published ? 'status-confirmed' : ''}">${p.published ? 'Publié' : 'Brouillon'}</em></span>
      </button>`).join('') || '<div class="empty-state"><p>Aucun bien pour l\'instant.</p></div>';
  }
  $('property-list').addEventListener('click', e => {
    const card = e.target.closest('[data-id]');
    if (card) openProperty(properties.find(p => p.id === card.dataset.id));
  });
  $('property-new').addEventListener('click', () => openProperty(null));
  $('property-close').addEventListener('click', () => { editing = null; $('property-form').hidden = true; renderPropertyList(); });

  function openProperty(p) {
    editing = p;
    const f = $('property-form');
    f.reset();
    f.hidden = false;
    $('pf-title').textContent = p ? p.name : 'Nouveau bien';
    $('pf-view').hidden = !p;
    if (p) $('pf-view').href = 'bien.html?id=' + encodeURIComponent(p.id);
    $('property-delete').hidden = !p;
    $('photo-section').hidden = !p;
    const values = p || { type: 'Appartement', capacity: 2, min_nights: 1, cleaning_fee: 0, amenities: [] };
    for (const el of f.elements) {
      if (!el.name || !(el.name in values) && el.type !== 'checkbox') continue;
      const v = values[el.name];
      if (el.type === 'checkbox') el.checked = Boolean(v);
      else if (el.name === 'amenities') el.value = (v || []).join('\n');
      else if (['nightly_price', 'cleaning_fee'].includes(el.name)) el.value = fromCents(v);
      else el.value = v ?? '';
    }
    renderPhotos();
    renderPropertyList();
    f.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function propertyPayload(f) {
    const v = name => f.elements[name].value.trim();
    return {
      name: v('name'), type: v('type'), location: v('location'),
      capacity: Number(v('capacity')), bedrooms: intOrNull(v('bedrooms')), bathrooms: intOrNull(v('bathrooms')), surface: intOrNull(v('surface')),
      short_description: v('short_description'), description: v('description'),
      amenities: v('amenities').split('\n').map(s => s.trim()).filter(Boolean),
      published: f.elements.published.checked, direct_booking: f.elements.direct_booking.checked, accepts_pets: f.elements.accepts_pets.checked,
      nightly_price: toCents(v('nightly_price')), cleaning_fee: toCents(v('cleaning_fee')) || 0, min_nights: Number(v('min_nights') || 1),
      price_note: v('price_note'), airbnb_url: v('airbnb_url'), booking_url: v('booking_url'),
      rating_airbnb: v('rating_airbnb') === '' ? null : Number(v('rating_airbnb')), rating_airbnb_count: intOrNull(v('rating_airbnb_count')),
      rating_booking: v('rating_booking') === '' ? null : Number(v('rating_booking')), rating_booking_count: intOrNull(v('rating_booking_count'))
    };
  }

  $('property-form').addEventListener('submit', e => {
    e.preventDefault();
    const data = propertyPayload(e.target);
    run(e.submitter, async () => {
      const saved = editing
        ? await send('/admin/properties/' + encodeURIComponent(editing.id), 'PATCH', { ...data, version: editing.version })
        : await send('/admin/properties', 'POST', data);
      toast(editing ? 'Fiche enregistrée.' : 'Bien créé. Ajoutez maintenant ses photos, puis publiez-le.');
      await loadProperties();
      openProperty(properties.find(p => p.id === saved.id));
    });
  });

  $('property-delete').addEventListener('click', e => {
    if (!editing || !confirm(`Supprimer définitivement « ${editing.name} » et ses photos ?`)) return;
    run(e.currentTarget, async () => {
      await send('/admin/properties/' + encodeURIComponent(editing.id), 'DELETE', {});
      toast('Bien supprimé.');
      editing = null; $('property-form').hidden = true;
      await loadProperties(); renderPropertyList();
    });
  });

  function renderPhotos() {
    const photos = editing?.photos || [];
    $('photo-grid').innerHTML = photos.map((ph, i) => `
      <figure class="photo-item" data-id="${esc(ph.id)}">
        <img src="${Passala.url(ph.url)}" alt="${esc(ph.alt)}">
        ${i === 0 ? '<span class="photo-cover">Principale</span>' : ''}
        <figcaption>
          <button type="button" data-photo="left" aria-label="Avancer" ${i === 0 ? 'disabled' : ''}><i class="fa-solid fa-arrow-left"></i></button>
          <button type="button" data-photo="right" aria-label="Reculer" ${i === photos.length - 1 ? 'disabled' : ''}><i class="fa-solid fa-arrow-right"></i></button>
          <button type="button" data-photo="delete" aria-label="Supprimer"><i class="fa-solid fa-trash"></i></button>
        </figcaption>
      </figure>`).join('') || '<p class="empty">Aucune photo.</p>';
  }
  async function refreshEditing() {
    await loadProperties();
    editing = properties.find(p => p.id === editing.id);
    renderPhotos(); renderPropertyList();
  }
  $('photo-grid').addEventListener('click', e => {
    const button = e.target.closest('[data-photo]');
    if (!button || !editing) return;
    const id = button.closest('.photo-item').dataset.id, ids = editing.photos.map(p => p.id), i = ids.indexOf(id);
    run(button, async () => {
      if (button.dataset.photo === 'delete') {
        if (!confirm('Supprimer cette photo ?')) return;
        await send('/admin/photos/' + encodeURIComponent(id), 'DELETE', {});
      } else {
        const j = button.dataset.photo === 'left' ? i - 1 : i + 1;
        [ids[i], ids[j]] = [ids[j], ids[i]];
        await send(`/admin/properties/${encodeURIComponent(editing.id)}/photos/order`, 'PUT', { ids });
      }
      await refreshEditing();
    });
  });

  /** Réduit la photo à 2000 px de côté au maximum, en JPEG, avant l'envoi. */
  async function shrink(file) {
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
      if (scale === 1 && file.size < 2.5 * 1024 * 1024) return file;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      return await new Promise(resolve => canvas.toBlob(b => resolve(b || file), 'image/jpeg', 0.86));
    } catch { return file; }
  }
  $('photo-input').addEventListener('change', e => {
    const files = [...e.target.files];
    e.target.value = '';
    if (!files.length || !editing) return;
    run(null, async () => {
      for (const [i, file] of files.entries()) {
        toast(`Envoi de la photo ${i + 1} sur ${files.length}…`, 'info');
        const blob = await shrink(file);
        await api(`/admin/properties/${encodeURIComponent(editing.id)}/photos`, { method: 'POST', body: blob, headers: { 'Content-Type': blob.type || file.type, 'X-Photo-Alt': encodeURIComponent(editing.name) } });
      }
      toast(files.length > 1 ? `${files.length} photos ajoutées.` : 'Photo ajoutée.');
      await refreshEditing();
    });
  });

  // ───────── Contacts ─────────
  let leadOffset = 0;
  $('lead-status').addEventListener('change', () => run(null, () => loadLeads()));
  $('lead-more').addEventListener('click', () => run($('lead-more'), () => loadLeads(true)));
  async function loadLeads(more = false) {
    leadOffset = more ? leadOffset + 50 : 0;
    const status = $('lead-status').value;
    const r = await api(`/admin/leads?offset=${leadOffset}${status ? '&status=' + status : ''}`);
    const html = r.data.map(l => `
      <article class="request-card" data-id="${esc(l.id)}">
        <div class="request-top">
          <div><span class="request-ref">Reçu le ${new Date(l.created_at * 1000).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}</span><h3>${esc(l.full_name)}</h3><p class="request-property"><i class="fa-solid fa-house"></i> ${esc(l.property_type)} · ${esc(l.city)}</p></div>
          <span class="status status-lead-${l.status}">${LEAD_STATUS[l.status]}</span>
        </div>
        <p class="request-contact"><a href="tel:${esc(l.phone.replace(/[^+\d]/g, ''))}"><i class="fa-solid fa-phone"></i> ${esc(l.phone)}</a> <a href="mailto:${esc(l.email)}"><i class="fa-solid fa-envelope"></i> ${esc(l.email)}</a></p>
        ${l.message ? `<p class="request-message">${esc(l.message)}</p>` : ''}
        <div class="request-actions">
          ${Object.entries(LEAD_STATUS).filter(([k]) => k !== l.status).map(([k, label]) => `<button type="button" class="btn btn-outline" data-lead="${k}">Marquer « ${label.toLowerCase()} »</button>`).join('')}
          <button type="button" class="btn btn-outline danger" data-lead="delete"><i class="fa-solid fa-trash"></i> Supprimer</button>
        </div>
      </article>`).join('');
    if (more) $('lead-list').insertAdjacentHTML('beforeend', html);
    else $('lead-list').innerHTML = html || '<div class="empty-state"><i class="fa-regular fa-envelope"></i><p>Aucun contact dans cette catégorie.</p></div>';
    $('lead-more').hidden = !r.has_more;
    if (status === 'new' && !more) setBadge('badge-leads', r.data.length + (r.has_more ? '+' : ''));
  }
  $('lead-list').addEventListener('click', e => {
    const button = e.target.closest('[data-lead]');
    if (!button) return;
    const id = button.closest('[data-id]').dataset.id, action = button.dataset.lead;
    if (action === 'delete' && !confirm('Supprimer définitivement ce contact ?')) return;
    run(button, async () => {
      if (action === 'delete') await send('/admin/leads/' + encodeURIComponent(id), 'DELETE', {});
      else await send('/admin/leads/' + encodeURIComponent(id), 'PATCH', { status: action });
      toast('Contact mis à jour.');
      await loadLeads();
    });
  });

  // ───────── Réglages ─────────
  async function loadAccount() {
    const r = await api('/admin/emails');
    const count = state => r.counts.find(c => c.state === state)?.count || 0;
    $('email-status').innerHTML = r.configured
      ? `<p class="ok"><i class="fa-solid fa-circle-check"></i> Activés : les voyageurs reçoivent un email à la demande et à chaque décision.</p>
         ${r.notify_configured ? '<p class="ok"><i class="fa-solid fa-circle-check"></i> Vous êtes alerté par email des nouvelles demandes et des nouveaux contacts.</p>' : '<p class="warn"><i class="fa-solid fa-circle-info"></i> Alertes à l\'équipe désactivées : aucune adresse de réception (secret NOTIFY_EMAIL) n\'est configurée. Pensez à consulter cet espace.</p>'}
         <p>${count('sent')} envoyé(s) · ${count('pending') + count('sending')} en file · ${count('failed')} en échec</p>
         ${count('failed') ? '<button type="button" class="btn btn-outline" id="email-retry"><i class="fa-solid fa-rotate"></i> Relancer les envois en échec</button>' : ''}`
      : '<p class="warn"><i class="fa-solid fa-circle-info"></i> Non activés. Les demandes sont bien enregistrées ici, mais aucun email n\'est envoyé. Pour les activer, ajoutez au Worker Cloudflare les secrets RESEND_API_KEY et EMAIL_FROM (et NOTIFY_EMAIL pour recevoir les alertes).</p>';
    $('email-retry')?.addEventListener('click', e => run(e.currentTarget, async () => { const x = await send('/admin/emails/retry', 'POST', {}); toast(`${x.requeued} email(s) relancé(s).`); await loadAccount(); }));
  }
  $('password-form').addEventListener('submit', e => {
    e.preventDefault();
    run(e.submitter, async () => {
      await send('/admin/password', 'POST', { current: $('pw-current').value, password: $('pw-new').value });
      e.target.reset();
      showLogin();
      toast('Mot de passe changé. Reconnectez-vous avec le nouveau mot de passe.');
    });
  });

  // ───────── Démarrage ─────────
  (async () => {
    try { await enter(await api('/admin/session')); }
    catch (error) { showLogin(); if (error.status !== 401) toast(error.message, 'error'); }
  })();
})();
