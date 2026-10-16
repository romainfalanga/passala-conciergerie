// Dates represent occupied nights. A booked arrival can be a previous guest's departure.
const MONTH_NAMES_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const DAY_NAMES_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
function pad2(n) { return String(n).padStart(2, '0'); }
function dateKey(y, m, d) { return `${y}-${pad2(m + 1)}-${pad2(d)}`; }
function todayKey() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
function nextDay(key, offset = 1) { return new Date(Date.parse(key + 'T00:00:00Z') + offset * 86400000).toISOString().slice(0, 10); }
async function fetchUnavailableDates(propertyId) {
  const result = await Passala.api('/availability?property_id=' + encodeURIComponent(propertyId));
  return new Set(result.dates);
}
function createAvailabilityCalendar(container, opts = {}) {
  const options = { selectable: true, monthsToShow: 2, unavailable: new Set(), ...opts };
  const [year, month] = todayKey().split('-').map(Number);
  let viewYear = year, viewMonth = month - 1, start = null, end = null;
  const limit = nextDay(todayKey(), 731);
  const format = key => new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(key + 'T00:00:00Z'));
  function freeRange(a, b) {
    if (!a || !b || b <= a || a < todayKey() || b > limit || (Date.parse(b) - Date.parse(a)) / 86400000 > 90) return false;
    for (const date of options.unavailable) if (date >= a && date < b) return false;
    return true;
  }
  function notify() { if (options.onRangeChange) options.onRangeChange(start, end); }
  function renderMonth(y, m) {
    const offset = (new Date(y, m, 1).getDay() + 6) % 7;
    let cells = '<span class="cal-cell cal-empty"></span>'.repeat(offset);
    for (let d = 1; d <= new Date(y, m + 1, 0).getDate(); d++) {
      const key = dateKey(y, m, d), unavailable = options.unavailable.has(key);
      const past = key < todayKey(), outside = key >= limit;
      const departure = options.selectable && start && !end && freeRange(start, key);
      const disabled = past || (options.selectable && ((unavailable || outside) && !departure));
      const selected = start && key >= start && key <= (end || start);
      const cls = ['cal-cell cal-day', past || outside ? 'cal-past' : unavailable ? 'cal-unavailable' : 'cal-available', selected ? 'cal-selected' : '', key === start ? 'cal-range-start' : '', key === end ? 'cal-range-end' : '', unavailable && departure ? 'cal-departure' : ''].join(' ');
      const label = `${format(key)} — ${unavailable ? 'nuit indisponible' : 'nuit disponible'}${unavailable && departure ? ', départ possible' : ''}`;
      cells += `<button type="button" class="${cls}" data-date="${key}" ${disabled ? 'disabled' : ''} aria-label="${label}" aria-pressed="${Boolean(selected)}">${d}</button>`;
    }
    return `<div class="cal-month"><div class="cal-month-title">${MONTH_NAMES_FR[m]} ${y}</div><div class="cal-weekdays">${DAY_NAMES_FR.map(d => `<span>${d}</span>`).join('')}</div><div class="cal-grid">${cells}</div></div>`;
  }
  function render() {
    let months = '', y = viewYear, m = viewMonth;
    for (let i = 0; i < options.monthsToShow; i++) { months += renderMonth(y, m); if (++m > 11) { m = 0; y++; } }
    const summary = end ? `Arrivée le ${format(start)} — départ le ${format(end)}` : start ? `Arrivée le ${format(start)} — choisissez votre départ.` : 'Sélectionnez votre arrivée, puis votre départ (90 nuits maximum).';
    container.innerHTML = `<div class="cal-widget"><div class="cal-nav"><button type="button" class="cal-nav-btn" data-nav="-1" aria-label="Mois précédent" ${viewYear === year && viewMonth === month - 1 ? 'disabled' : ''}>‹</button><div class="cal-legend"><span class="cal-legend-item"><i class="cal-dot cal-dot-green"></i> Libre</span><span class="cal-legend-item"><i class="cal-dot cal-dot-red"></i> Nuit occupée</span></div><button type="button" class="cal-nav-btn" data-nav="1" aria-label="Mois suivant" ${dateKey(viewYear, viewMonth, 1) >= limit.slice(0, 7) + '-01' ? 'disabled' : ''}>›</button></div><div class="cal-months">${months}</div>${options.selectable ? `<p class="cal-range-summary" aria-live="polite">${summary}</p>` : ''}</div>`;
    container.querySelectorAll('[data-nav]').forEach(button => button.addEventListener('click', () => {
      const d = new Date(viewYear, viewMonth + Number(button.dataset.nav), 1); viewYear = d.getFullYear(); viewMonth = d.getMonth(); render();
    }));
    container.querySelectorAll('[data-date]').forEach(button => button.addEventListener('click', () => {
      const key = button.dataset.date;
      if (!options.selectable) { options.onDayClick?.(key, options.unavailable.has(key)); return; }
      if (start && !end && freeRange(start, key)) end = key;
      else if (!options.unavailable.has(key)) { start = key === start ? null : key; end = null; }
      render(); notify();
    }));
  }
  render();
  return {
    refreshUnavailable(set) { options.unavailable = set; if (end && !freeRange(start, end) || start && !end && set.has(start)) { start = null; end = null; notify(); } render(); },
    getRange() { return { checkin: start, checkout: end }; },
    reset() { start = null; end = null; render(); notify(); },
    jumpTo(y, m) { viewYear = y; viewMonth = m; render(); }, render
  };
}
