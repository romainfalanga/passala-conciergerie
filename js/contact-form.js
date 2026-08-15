// La Clef Provençale — gestion du formulaire de contact
// Enregistre la demande dans la table "leads" (base du site) et propose
// un envoi mail direct (mailto) en secours, l'envoi automatique via Resend
// n'étant pas réalisable depuis un site 100% statique côté navigateur.

document.addEventListener('DOMContentLoaded', function () {
  const form = document.getElementById('contact-form');
  if (!form) return;

  const feedback = document.getElementById('form-feedback');
  const submitBtn = document.getElementById('submit-btn');

  form.addEventListener('submit', async function (e) {
    e.preventDefault();

    const data = {
      full_name: form.full_name.value.trim(),
      email: form.email.value.trim(),
      phone: form.phone.value.trim(),
      property_type: form.property_type.value,
      city: form.city.value.trim(),
      already_rented: form.already_rented.value,
      message: form.message.value.trim(),
      consent: form.consent.checked,
      status: 'Nouveau'
    };

    // Validation simple
    if (!data.full_name || !data.email || !data.phone || !data.property_type || !data.city || !data.consent) {
      showFeedback('error', 'Merci de remplir tous les champs obligatoires (*) et d\'accepter la mention de consentement.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Envoi en cours…';

    try {
      const res = await fetch('tables/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (!res.ok) throw new Error('Erreur serveur');

      showFeedback('success', 'Merci ' + data.full_name.split(' ')[0] + ' ! Votre demande a bien été enregistrée. Notre équipe revient vers vous sous 24h. Vous pouvez aussi nous écrire directement en cliquant ci-dessous.');
      addMailtoFallback(data);
      form.reset();
    } catch (err) {
      console.error(err);
      showFeedback('error', 'Une erreur est survenue lors de l\'envoi. Merci de réessayer, ou de nous écrire directement à contact@laclefprovencale.fr.');
      addMailtoFallback(data);
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Envoyer ma demande';
    }
  });

  function showFeedback(type, text) {
    feedback.className = type;
    feedback.innerHTML = text;
    feedback.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function addMailtoFallback(data) {
    const subject = encodeURIComponent('Demande d\'étude — ' + data.property_type + ' à ' + data.city);
    const body = encodeURIComponent(
      'Nom : ' + data.full_name + '\n' +
      'Téléphone : ' + data.phone + '\n' +
      'Email : ' + data.email + '\n' +
      'Type de bien : ' + data.property_type + '\n' +
      'Ville / secteur : ' + data.city + '\n' +
      'Déjà loué en saisonnier : ' + data.already_rented + '\n\n' +
      'Message :\n' + (data.message || '(aucun message)')
    );
    const mailtoLink = 'mailto:contact@laclefprovencale.fr?subject=' + subject + '&body=' + body;
    const existing = document.getElementById('mailto-fallback');
    if (existing) existing.remove();
    const link = document.createElement('a');
    link.id = 'mailto-fallback';
    link.href = mailtoLink;
    link.className = 'btn btn-outline btn-block';
    link.style.marginTop = '14px';
    link.innerHTML = '<i class="fa-solid fa-envelope"></i> Ou envoyer ce récapitulatif par email';
    feedback.after(link);
  }
});
