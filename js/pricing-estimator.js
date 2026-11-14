// Passala Conciergerie — Simulateur de budget (page Nettoyage)
// Calcule un total estimatif à partir des prestations cochées / sélectionnées
// (ménage régulier en €/h x nombre d'heures, autres prestations en prix fixe).

document.addEventListener('DOMContentLoaded', function () {
  const box = document.getElementById('estimator-box');
  if (!box) return;

  const listEl = document.getElementById('estimator-list');
  const totalEl = document.getElementById('estimator-total-value');
  const hoursField = document.getElementById('menage-hours-field');
  const hoursInput = document.getElementById('menage-hours');
  const menageRadios = document.querySelectorAll('.estimator-menage');
  const itemCheckboxes = document.querySelectorAll('.estimator-item');
  const frequenceHint = document.getElementById('menage-frequence-hint');

  function currentMenageRadio() {
    return Array.from(menageRadios).find(r => r.checked) || null;
  }

  function updateHoursFieldVisibility() {
    const selected = currentMenageRadio();
    hoursField.style.display = selected ? 'flex' : 'none';
    if (frequenceHint) {
      if (selected) {
        const weeksPerYear = parseFloat(selected.getAttribute('data-weeks')) || 52;
        const interventionsPerMonth = weeksPerYear / 12;
        frequenceHint.textContent = 'Soit environ ' + formatNumber(interventionsPerMonth) + ' interventions par mois en moyenne sur l\'année (certains mois comptent 5 semaines, le calcul est donc lissé sur 12 mois).';
      } else {
        frequenceHint.textContent = '';
      }
    }
  }

  function recalculate() {
    const lines = [];
    let total = 0;

    // Ménage régulier : tarif horaire x heures par intervention x nombre d'interventions/mois.
    // Un mois ne fait pas toujours exactement 4 semaines (certains mois en comptent 5) :
    // on mensualise donc sur une base annuelle, comme pour un forfait mensuel réel :
    //   coût mensuel = tarif horaire × heures × (nb de semaines travaillées/an ÷ 12)
    // Hebdomadaire (1×/semaine) = 52 passages/an ÷ 12 mois
    // Bimensuel (1×/2 semaines) = 26 passages/an ÷ 12 mois
    const menage = currentMenageRadio();
    if (menage) {
      const rate = parseFloat(menage.value) || 0;
      let hours = parseFloat(hoursInput.value);
      if (!hours || hours <= 0) hours = 1;
      const weeksPerYear = parseFloat(menage.getAttribute('data-weeks')) || 52;
      const interventionsPerMonth = weeksPerYear / 12;
      const lineTotal = rate * hours * interventionsPerMonth;
      lines.push({
        label: menage.getAttribute('data-label') + ' (≈ ' + formatNumber(interventionsPerMonth) + ' interventions/mois × ' + hours + ' h × ' + rate + ' €/h)',
        amount: lineTotal
      });
      total += lineTotal;
    }

    // Prestations à prix fixe (vitres, canapés, matelas…)
    itemCheckboxes.forEach(function (cb) {
      if (cb.checked) {
        const price = parseFloat(cb.getAttribute('data-price')) || 0;
        lines.push({ label: cb.getAttribute('data-label'), amount: price });
        total += price;
      }
    });

    // Rendu de la liste
    if (!lines.length) {
      listEl.innerHTML = '<li class="estimator-empty">Aucune prestation sélectionnée pour le moment.</li>';
    } else {
      listEl.innerHTML = lines.map(function (l) {
        return '<li><span>' + l.label + '</span><span>' + formatPrice(l.amount) + '</span></li>';
      }).join('');
    }

    totalEl.textContent = formatPrice(total);
    updateHoursFieldVisibility();
  }

  function formatPrice(n) {
    // Pas de décimales inutiles (ex: 50 € plutôt que 50.00 €)
    const rounded = Math.round(n * 100) / 100;
    const str = (rounded % 1 === 0) ? rounded.toFixed(0) : rounded.toFixed(2).replace('.', ',');
    return str + ' €';
  }

  function formatNumber(n) {
    const rounded = Math.round(n * 100) / 100;
    return (rounded % 1 === 0) ? rounded.toFixed(0) : rounded.toFixed(2).replace('.', ',');
  }

  menageRadios.forEach(function (r) { r.addEventListener('change', recalculate); });
  itemCheckboxes.forEach(function (cb) { cb.addEventListener('change', recalculate); });
  if (hoursInput) hoursInput.addEventListener('input', recalculate);

  recalculate();
});
