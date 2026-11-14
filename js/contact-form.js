// Passala Conciergerie — formulaire de contact propriétaire.
// La demande est enregistrée dans la base (table leads) et apparaît dans l'espace admin.
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('contact-form');
  if (!form) return;
  const feedback = document.getElementById('form-feedback');
  const submit = document.getElementById('submit-btn');
  let identity = null;

  const show = (type, html) => { feedback.className = type; feedback.innerHTML = html; feedback.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); };

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const data = {
      full_name: form.full_name.value.trim(), email: form.email.value.trim(), phone: form.phone.value.trim(),
      property_type: form.property_type.value, city: form.city.value.trim(), message: form.message.value.trim(),
      consent: form.consent.checked, website: form.website?.value || ''
    };
    if (!data.full_name || !data.email || !data.phone || !data.property_type || !data.city || !data.consent) {
      return show('error', 'Merci de remplir tous les champs obligatoires (*) et d\'accepter la mention de consentement.');
    }
    identity = Passala.requestIdentity(data, identity);
    submit.disabled = true;
    submit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Envoi en cours…';
    try {
      await Passala.send('/contact', 'POST', data, { 'Idempotency-Key': identity.key });
      show('success', `Merci ${Passala.escape(data.full_name.split(' ')[0])} ! Votre demande a bien été enregistrée. Notre équipe revient vers vous sous 24 h.`);
      form.reset();
      identity = null;
    } catch (error) {
      show('error', `${Passala.escape(error.message)} Vous pouvez aussi nous écrire à <a href="mailto:contact@passala-conciergerie.fr">contact@passala-conciergerie.fr</a> ou appeler le 07 44 89 66 02.`);
    } finally {
      submit.disabled = false;
      submit.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Envoyer ma demande';
    }
  });
});
