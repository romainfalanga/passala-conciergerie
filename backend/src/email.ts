// Envoi des emails depuis la file d'attente (email_outbox), via Resend.
import { type Bindings, euros, now } from './lib';

type Outbox = { id: string; audience: string; event: string; payload: string; attempts: number };

export const emailReady = (env: Bindings) => Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);
/** Les alertes à l'équipe exigent en plus une adresse de réception. */
export const notifyReady = (env: Bindings) => Boolean(emailReady(env) && env.NOTIFY_EMAIL);

const frDate = (value: unknown) => {
  const [y, m, d] = String(value).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
};

function content(row: Outbox, env: Bindings): { to: string; subject: string; text: string } {
  const p = JSON.parse(row.payload) as Record<string, string | number | null>;
  if (row.event === 'lead.created') {
    return { to: env.NOTIFY_EMAIL!, subject: `Nouvelle demande propriétaire — ${p.city}`, text: `${p.name}\n${p.email}\n${p.phone}\n${p.property_type} à ${p.city}\n\n${p.message || ''}\n\nÀ traiter dans l'espace admin.` };
  }
  const titles: Record<string, string> = {
    'booking.pending': 'Demande de réservation reçue',
    'booking.confirmed': 'Réservation confirmée',
    'booking.rejected': 'Demande de réservation non retenue',
    'booking.cancelled': 'Réservation annulée'
  };
  const title = titles[row.event] || 'Mise à jour de votre réservation';
  const total = p.estimated_total !== null && p.estimated_total !== undefined ? `\nMontant estimé : ${euros(Number(p.estimated_total))}` : '';
  const details = `Logement : ${p.property}\nArrivée : ${frDate(p.checkin)}\nDépart : ${frDate(p.checkout)}\nVoyageurs : ${p.guests}${total}\nRéférence : ${p.reference}`;
  if (row.audience === 'admin') {
    return { to: env.NOTIFY_EMAIL!, subject: `Nouvelle demande ${p.reference} — ${p.property}`, text: `${p.name}\n${p.email}\n${p.phone}\n\n${details}\n\n${p.message || ''}\n\nValidez ou refusez la demande depuis l'espace admin.` };
  }
  const bodies: Record<string, string> = {
    'booking.pending': 'Nous avons bien reçu votre demande. Elle ne vaut pas encore confirmation : notre équipe vérifie les disponibilités et revient vers vous sous 24 h.',
    'booking.confirmed': 'Bonne nouvelle : votre séjour est confirmé. Nous vous recontacterons quelques jours avant votre arrivée pour organiser la remise des clés.',
    'booking.rejected': 'Nous sommes désolés, nous ne pouvons pas donner suite à votre demande pour ces dates. N\'hésitez pas à nous contacter pour trouver une autre période.',
    'booking.cancelled': 'Votre réservation a été annulée. Pour toute question, contactez-nous.'
  };
  return { to: String(p.email), subject: `${title} — ${p.property}`, text: `Bonjour ${p.name},\n\n${bodies[row.event] || ''}\n\n${details}\n\nPassala Conciergerie — 07 44 89 66 02` };
}

export async function sendEmails(env: Bindings) {
  if (!emailReady(env)) return;
  try {
    // L'idempotence Resend dure 24 h : au-delà, on arrête les nouvelles tentatives automatiques.
    await env.DB.prepare("UPDATE email_outbox SET state='failed',last_error='expired' WHERE state IN ('pending','sending') AND created_at<? AND lease_until<?").bind(now() - 23 * 3600, now()).run();
    for (let i = 0; i < 10; i++) {
      const lease = now() + 120;
      const row = await env.DB.prepare("UPDATE email_outbox SET state='sending',lease_until=?,attempts=attempts+1 WHERE id=(SELECT id FROM email_outbox WHERE state IN ('pending','sending') AND next_attempt<=? AND lease_until<? ORDER BY created_at,id LIMIT 1) RETURNING *")
        .bind(lease, now(), now()).first<Outbox>();
      if (!row) break;
      if (row.audience === 'admin' && !env.NOTIFY_EMAIL) {
        // Pas d'adresse d'alerte configurée : on n'envoie pas, sans compter d'échec.
        await env.DB.prepare("UPDATE email_outbox SET state='sent',sent_at=?,lease_until=0,last_error='no_recipient' WHERE id=? AND lease_until=?").bind(now(), row.id, lease).run();
        continue;
      }
      try {
        const message = content(row, env);
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST', signal: AbortSignal.timeout(15000),
          headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `passala/${row.id}` },
          body: JSON.stringify({ from: env.EMAIL_FROM, to: [message.to], subject: message.subject, text: message.text, ...(env.NOTIFY_EMAIL ? { reply_to: env.NOTIFY_EMAIL } : {}) })
        });
        await response.body?.cancel();
        if (!response.ok) throw new Error(`resend_${response.status}`);
        await env.DB.prepare("UPDATE email_outbox SET state='sent',sent_at=?,lease_until=0,last_error=NULL WHERE id=? AND lease_until=?").bind(now(), row.id, lease).run();
      } catch (error) {
        await env.DB.prepare("UPDATE email_outbox SET state=?,next_attempt=?,lease_until=0,last_error=? WHERE id=? AND lease_until=?")
          .bind(row.attempts >= 12 ? 'failed' : 'pending', now() + Math.min(3600, 60 * 2 ** Math.min(row.attempts, 6)), error instanceof Error ? error.message.slice(0, 80) : 'delivery_failed', row.id, lease).run();
      }
    }
  } catch { console.error(JSON.stringify({ event: 'email_outbox_unavailable' })); }
}
