(() => {
  const $ = id => document.getElementById(id), e = Passala.escape;
  const labels = { pending: 'À confirmer', confirmed: 'Confirmée', rejected: 'Refusée', cancelled: 'Annulée', new: 'Nouveau', contacted: 'Contacté', closed: 'Clos' };
  const fmt = value => new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value + 'T00:00:00Z'));
  let properties = [], calendar, occupancy = [], bookingsOffset = 0, leadsOffset = 0, busy = false;
  const current = () => properties.find(p => p.id === $('property-select').value);
  function feedback(message, type = 'success') { $('feedback').textContent = message; $('feedback').className = type; }
  function showLogin() { $('dashboard').hidden = true; $('logout').hidden = true; $('login-panel').hidden = false; $('booking-list').replaceChildren(); $('lead-list').replaceChildren(); }
  async function operate(task) {
    if (busy) return;
    busy = true;
    const inputs = [...document.querySelectorAll('button,select')].map(el => [el, el.disabled]);
    inputs.forEach(([el]) => { el.disabled = true; });
    try { await task(); }
    catch (error) { feedback(error.message, 'error'); if (error.status === 401) showLogin(); }
    finally { inputs.forEach(([el, disabled]) => { el.disabled = disabled; }); busy = false; }
  }
  function fillProperty() {
    const p = current(), form = $('property-form');
    if (!p) return;
    for (const element of form.elements) {
      if (!element.name) continue;
      if (element.type === 'checkbox') element.checked = Boolean(p[element.name]);
      else element.value = p[element.name] ?? '';
    }
    $('calendar-ready').checked = p.calendar_ready;
    $('calendar-status').textContent = p.calendar_ready ? 'Le calendrier est ouvert aux demandes de réservation.' : 'Le calendrier reste fermé tant que les réservations et blocages existants n’ont pas été vérifiés.';
  }
  async function loadCalendar() {
    const result = await Passala.api('/admin/calendar?property_id=' + encodeURIComponent(current().id));
    occupancy = result.data;
    const unavailable = new Set(occupancy.map(row => row.date));
    if (calendar) calendar.refreshUnavailable(unavailable);
    else calendar = createAvailabilityCalendar($('admin-calendar'), { selectable: false, unavailable, onDayClick: key => operate(async () => {
      const occupied = occupancy.find(row => row.date === key);
      if (occupied?.booking_id) { feedback('Cette nuit appartient à un séjour confirmé. Annulez ce séjour depuis Réservations pour la libérer.', 'error'); return; }
      if (!confirm(occupied ? `Libérer la nuit du ${fmt(key)} ?` : `Bloquer la nuit du ${fmt(key)} ?`)) return;
      await Passala.api('/admin/blocks', { method: occupied ? 'DELETE' : 'POST', body: JSON.stringify({ property_id: current().id, checkin: key, checkout: nextDay(key), note: '' }) });
      await loadCalendar(); feedback(occupied ? 'Nuit libérée.' : 'Nuit bloquée.');
    }) });
  }
  function bookingCard(b) {
    const buttons = b.status === 'pending' ? [['confirmed', 'Confirmer'], ['rejected', 'Refuser']] : b.status === 'confirmed' ? [['cancelled', 'Annuler la réservation']] : [];
    const article = document.createElement('article'); article.className = 'request-card';
    article.innerHTML = `<div class="request-top"><div><h3>${e(b.full_name)}</h3><p>${e(fmt(b.checkin))} → ${e(fmt(b.checkout))}</p></div><span class="status status-${e(b.status)}">${e(labels[b.status])}</span></div><div class="request-details"><p>${e(b.guests)} voyageur(s)${b.pets ? ' · Avec animal' : ''}</p><p><a href="mailto:${encodeURIComponent(b.email)}">${e(b.email)}</a> · ${e(b.phone)}</p></div>${b.message ? `<p class="request-message">${e(b.message)}</p>` : ''}<p class="request-ref">Réf. ${e(b.id.slice(0, 8))}</p><div class="request-actions"></div>`;
    for (const [status, text] of buttons) {
      const button = document.createElement('button'); button.className = status === 'confirmed' ? 'btn btn-primary' : 'btn btn-outline'; button.textContent = text;
      button.addEventListener('click', () => operate(async () => {
        if (!confirm(`${text} pour ${b.full_name}, du ${fmt(b.checkin)} au ${fmt(b.checkout)} ?`)) return;
        await Passala.api('/admin/bookings/' + b.id, { method: 'PATCH', body: JSON.stringify({ status, version: b.version }) });
        await loadBookings(); await loadCalendar(); await emailStatus(); feedback('Réservation mise à jour.');
      })); article.querySelector('.request-actions').append(button);
    }
    return article;
  }
  async function loadBookings(more = false) {
    const offset = more ? bookingsOffset : 0;
    const result = await Passala.api(`/admin/bookings?property_id=${encodeURIComponent(current().id)}&offset=${offset}`);
    if (!more) $('booking-list').replaceChildren();
    result.data.forEach(b => $('booking-list').append(bookingCard(b)));
    if (!more && !result.data.length) $('booking-list').innerHTML = '<p class="empty-state">Aucune demande pour ce logement pour le moment.</p>';
    bookingsOffset = offset + result.data.length; $('more-bookings').hidden = !result.has_more;
  }
  async function loadLeads(more = false) {
    const offset = more ? leadsOffset : 0, result = await Passala.api('/admin/leads?offset=' + offset);
    if (!more) $('lead-list').replaceChildren();
    for (const lead of result.data) {
      const article = document.createElement('article'); article.className = 'request-card';
      article.innerHTML = `<div class="request-top"><h3>${e(lead.full_name)}</h3><span class="status">${e(labels[lead.status])}</span></div><p>${e(lead.property_type)} · ${e(lead.city)}</p><p><a href="mailto:${encodeURIComponent(lead.email)}">${e(lead.email)}</a> · ${e(lead.phone)}</p><p class="request-message">${e(lead.message || 'Aucun message complémentaire.')}</p><div class="request-actions"></div>`;
      for (const status of ['new', 'contacted', 'closed'].filter(s => s !== lead.status)) {
        const button = document.createElement('button'); button.className = 'btn btn-outline'; button.textContent = 'Marquer : ' + labels[status];
        button.addEventListener('click', () => operate(async () => { await Passala.api('/admin/leads/' + lead.id, { method: 'PATCH', body: JSON.stringify({ status }) }); await loadLeads(); feedback('Contact mis à jour.'); })); article.querySelector('.request-actions').append(button);
      }
      $('lead-list').append(article);
    }
    if (!more && !result.data.length) $('lead-list').innerHTML = '<p class="empty-state">Aucune demande de contact pour le moment.</p>';
    leadsOffset = offset + result.data.length; $('more-leads').hidden = !result.has_more;
  }
  async function emailStatus() {
    const result = await Passala.api('/admin/emails'), failed = result.counts.find(row => row.state === 'failed')?.count || 0, queued = result.counts.filter(row => ['pending', 'sending'].includes(row.state)).reduce((n, row) => n + row.count, 0);
    $('email-status').textContent = result.configured ? `Notifications email activées. ${queued} en attente${failed ? ` · ${failed} à vérifier : contactez les voyageurs concernés depuis les fiches de réservation` : ''}.` : 'Notifications email non configurées. Les demandes sont enregistrées ici ; contactez les voyageurs par téléphone ou email après traitement.';
  }
  async function refresh() {
    const selected = $('property-select').value;
    properties = (await Passala.api('/properties')).data;
    $('property-select').replaceChildren(...properties.map(p => { const option = document.createElement('option'); option.value = p.id; option.textContent = p.name; return option; }));
    if (properties.some(p => p.id === selected)) $('property-select').value = selected;
    fillProperty();
    if (current()) { await loadBookings(); await loadCalendar(); }
    await loadLeads(); await emailStatus();
  }
  async function enter() { $('login-panel').hidden = true; $('dashboard').hidden = false; $('logout').hidden = false; await refresh(); }
  $('login-form').addEventListener('submit', event => { event.preventDefault(); operate(async () => { await Passala.api('/admin/login', { method: 'POST', body: JSON.stringify({ password: $('password').value }) }); $('login-form').reset(); feedback(''); await enter(); }); });
  $('logout').addEventListener('click', () => operate(async () => { await Passala.api('/admin/logout', { method: 'POST', body: '{}' }); showLogin(); feedback('Vous êtes déconnecté.'); }));
  $('refresh').addEventListener('click', () => operate(refresh));
  $('property-select').addEventListener('change', () => operate(async () => { fillProperty(); await loadBookings(); await loadCalendar(); }));
  $('more-bookings').addEventListener('click', () => operate(() => loadBookings(true)));
  $('more-leads').addEventListener('click', () => operate(() => loadLeads(true)));
  document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => { document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b === button)); document.querySelectorAll('[data-panel]').forEach(panel => { panel.hidden = panel.dataset.panel !== button.dataset.tab; }); }));
  $('save-calendar-ready').addEventListener('click', () => operate(async () => {
    const p = current(), ready = $('calendar-ready').checked;
    if (ready && !p.calendar_ready && !confirm('Avez-vous bien reporté toutes les réservations existantes et toutes les nuits indisponibles ?')) return;
    const updated = await Passala.api('/admin/properties/' + p.id, { method: 'PATCH', body: JSON.stringify({ version: p.version, calendar_ready: ready }) });
    properties = properties.map(item => item.id === p.id ? updated : item); fillProperty(); feedback(ready ? 'Le calendrier est ouvert aux demandes.' : 'Les demandes sont suspendues pour ce logement.');
  }));
  $('block-form').addEventListener('submit', event => { event.preventDefault(); operate(async () => {
    const data = Object.fromEntries(new FormData($('block-form'))); data.property_id = current().id;
    await Passala.api('/admin/blocks', { method: 'POST', body: JSON.stringify(data) }); $('block-form').reset(); await loadCalendar(); feedback('Toutes les nuits de la période ont été bloquées.');
  }); });
  $('property-form').addEventListener('submit', event => { event.preventDefault(); operate(async () => {
    const p = current(), form = $('property-form'), data = Object.fromEntries(new FormData(form));
    data.capacity = Number(data.capacity); data.accepts_pets = form.accepts_pets.checked; data.version = p.version;
    for (const field of ['surface', 'bedrooms', 'bathrooms', 'rating_airbnb', 'rating_booking', 'rating_airbnb_count', 'rating_booking_count']) data[field] = data[field] === '' ? null : Number(data[field]);
    const updated = await Passala.api('/admin/properties/' + p.id, { method: 'PATCH', body: JSON.stringify(data) });
    properties = properties.map(item => item.id === p.id ? updated : item); fillProperty(); $('property-select').selectedOptions[0].textContent = updated.name; feedback('Fiche enregistrée.');
  }); });
  $('block-start').min = todayKey(); $('block-end').min = nextDay(todayKey());
  operate(async () => { try { await Passala.api('/admin/session'); await enter(); } catch (error) { if (error.status !== 401) feedback(error.message, 'error'); showLogin(); } });
})();
