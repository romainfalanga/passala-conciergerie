document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('contact-form');
  if (!form) return;
  const feedback = document.getElementById('form-feedback'), button = document.getElementById('submit-btn');
  let identity;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const data = Object.fromEntries(new FormData(form));
    data.consent = form.consent.checked;
    identity = Passala.requestIdentity(data, identity);
    button.disabled = true;
    button.textContent = 'Enregistrement…';
    try {
      const result = await Passala.api('/contact', { method: 'POST', headers: { 'Idempotency-Key': identity.key }, body: identity.payload });
      feedback.className = 'success';
      feedback.textContent = `Votre demande est enregistrée. Notre équipe vous recontactera. Référence : ${result.id.slice(0, 8)}.`;
      identity = null; form.reset();
    } catch (error) {
      feedback.className = 'error';
      feedback.textContent = `${error.message} Vous pouvez aussi nous appeler au 07 44 89 66 02.`;
    } finally {
      button.disabled = false; button.textContent = 'Envoyer ma demande';
      feedback.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  });
});
