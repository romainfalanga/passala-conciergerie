// Passala Conciergerie — Calendrier de disponibilité (client + admin)
// Rouge = indisponible (table "availability"), Vert = disponible.
// L'admin gère les indisponibilités via admin-calendrier.html ; ce fichier
// lit la table "availability" pour construire un calendrier visuel.

const MONTH_NAMES_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const DAY_NAMES_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

function pad2(n) { return String(n).padStart(2, '0'); }
function dateKey(y, m, d) { return `${y}-${pad2(m + 1)}-${pad2(d)}`; }
function todayKey() { const t = new Date(); return dateKey(t.getFullYear(), t.getMonth(), t.getDate()); }

async function fetchUnavailableDates(propertyId) {
  const res = await fetch('tables/availability?limit=1000');
  const json = await res.json();
  const set = new Set();
  (json.data || []).forEach(row => {
    if (!row.deleted && row.property_id === propertyId && row.status === 'Indisponible' && row.date) {
      set.add(row.date);
    }
  });
  return set;
}

/**
 * Crée un widget de calendrier interactif (2 mois affichés, navigation).
 * options.selectable = true => mode client, clic sélectionne une plage (arrivée/départ)
 * options.onRangeChange(checkin, checkout) => callback quand la plage change
 * options.selectable = false => mode admin en lecture, clic sur un jour appelle options.onDayClick(dateStr)
 */
function createAvailabilityCalendar(container, opts) {
  const options = Object.assign({
    propertyId: null,
    selectable: true,
    monthsToShow: 2,
    onRangeChange: null,
    onDayClick: null,
    unavailable: new Set()
  }, opts || {});

  let viewYear, viewMonth;
  const now = new Date();
  viewYear = now.getFullYear();
  viewMonth = now.getMonth();

  let rangeStart = null;
  let rangeEnd = null;

  function isPast(y, m, d) {
    return dateKey(y, m, d) < todayKey();
  }

  function isUnavailable(key) {
    return options.unavailable.has(key);
  }

  function isInRange(key) {
    if (!rangeStart) return false;
    const end = rangeEnd || rangeStart;
    const lo = rangeStart <= end ? rangeStart : end;
    const hi = rangeStart <= end ? end : rangeStart;
    return key >= lo && key <= hi;
  }

  function hasUnavailableBetween(startKey, endKey) {
    const lo = startKey <= endKey ? startKey : endKey;
    const hi = startKey <= endKey ? endKey : startKey;
    for (const d of options.unavailable) {
      if (d > lo && d < hi) return true;
    }
    return false;
  }

  function renderMonth(y, m) {
    const firstDay = new Date(y, m, 1);
    // Lundi = 0 ... Dimanche = 6
    let startOffset = (firstDay.getDay() + 6) % 7;
    const daysInMonth = new Date(y, m + 1, 0).getDate();

    let cells = '';
    for (let i = 0; i < startOffset; i++) cells += `<span class="cal-cell cal-empty"></span>`;

    for (let d = 1; d <= daysInMonth; d++) {
      const key = dateKey(y, m, d);
      const past = isPast(y, m, d);
      const unavail = isUnavailable(key);
      const selected = isInRange(key);
      const isStart = rangeStart === key;
      const isEnd = (rangeEnd || rangeStart) === key && rangeEnd;

      let cls = 'cal-cell cal-day';
      if (past) cls += ' cal-past';
      else if (unavail) cls += ' cal-unavailable';
      else cls += ' cal-available';
      if (selected && !past) cls += ' cal-selected';
      if (isStart) cls += ' cal-range-start';
      if (isEnd) cls += ' cal-range-end';

      const disabledAttr = (past || (unavail && options.selectable)) ? 'data-disabled="1"' : '';
      cells += `<button type="button" class="${cls}" data-date="${key}" ${disabledAttr}>${d}</button>`;
    }

    return `
      <div class="cal-month">
        <div class="cal-month-title">${MONTH_NAMES_FR[m]} ${y}</div>
        <div class="cal-weekdays">${DAY_NAMES_FR.map(d => `<span>${d}</span>`).join('')}</div>
        <div class="cal-grid">${cells}</div>
      </div>`;
  }

  function render() {
    let monthsHTML = '';
    let y = viewYear, m = viewMonth;
    for (let i = 0; i < options.monthsToShow; i++) {
      monthsHTML += renderMonth(y, m);
      m++;
      if (m > 11) { m = 0; y++; }
    }

    container.innerHTML = `
      <div class="cal-widget">
        <div class="cal-nav">
          <button type="button" class="cal-nav-btn" id="cal-prev" aria-label="Mois précédent"><i class="fa-solid fa-chevron-left"></i></button>
          <div class="cal-legend">
            <span class="cal-legend-item"><i class="cal-dot cal-dot-green"></i> Disponible</span>
            <span class="cal-legend-item"><i class="cal-dot cal-dot-red"></i> Indisponible</span>
          </div>
          <button type="button" class="cal-nav-btn" id="cal-next" aria-label="Mois suivant"><i class="fa-solid fa-chevron-right"></i></button>
        </div>
        <div class="cal-months">${monthsHTML}</div>
        ${options.selectable ? `<p class="cal-range-summary" id="cal-range-summary">Sélectionnez votre date d'arrivée, puis votre date de départ.</p>` : ''}
      </div>`;

    container.querySelector('#cal-prev').addEventListener('click', () => {
      viewMonth--; if (viewMonth < 0) { viewMonth = 11; viewYear--; }
      render();
    });
    container.querySelector('#cal-next').addEventListener('click', () => {
      viewMonth++; if (viewMonth > 11) { viewMonth = 0; viewYear++; }
      render();
    });

    container.querySelectorAll('.cal-day').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-date');
        if (btn.getAttribute('data-disabled') === '1') {
          if (!options.selectable && options.onDayClick) options.onDayClick(key, isUnavailable(key));
          return;
        }
        if (options.selectable) {
          handleSelect(key);
        } else if (options.onDayClick) {
          options.onDayClick(key, isUnavailable(key));
        }
      });
    });
  }

  function handleSelect(key) {
    if (!rangeStart || (rangeStart && rangeEnd)) {
      // Nouvelle sélection
      rangeStart = key;
      rangeEnd = null;
    } else {
      // On a un rangeStart, on choisit la fin
      if (key === rangeStart) {
        rangeStart = null; rangeEnd = null;
      } else if (hasUnavailableBetween(rangeStart, key)) {
        // Un jour indisponible est compris dans la plage : on repart avec cette date comme nouveau départ
        rangeStart = key;
        rangeEnd = null;
      } else if (key < rangeStart) {
        rangeEnd = rangeStart;
        rangeStart = key;
      } else {
        rangeEnd = key;
      }
    }
    render();
    const summary = container.querySelector('#cal-range-summary');
    if (summary) {
      if (rangeStart && rangeEnd) {
        summary.innerHTML = `Arrivée le <strong>${formatFr(rangeStart)}</strong> — Départ le <strong>${formatFr(rangeEnd)}</strong>`;
      } else if (rangeStart) {
        summary.innerHTML = `Arrivée le <strong>${formatFr(rangeStart)}</strong> — sélectionnez votre date de départ`;
      } else {
        summary.innerHTML = `Sélectionnez votre date d'arrivée, puis votre date de départ.`;
      }
    }
    if (options.onRangeChange) options.onRangeChange(rangeStart, rangeEnd);
  }

  function formatFr(key) {
    const [y, m, d] = key.split('-').map(Number);
    return `${d} ${MONTH_NAMES_FR[m - 1]} ${y}`;
  }

  function refreshUnavailable(newSet) {
    options.unavailable = newSet;
    render();
  }

  function getRange() {
    return { checkin: rangeStart, checkout: rangeEnd };
  }

  function jumpTo(y, m) {
    viewYear = y; viewMonth = m; render();
  }

  render();

  return { refreshUnavailable, getRange, jumpTo, render };
}
