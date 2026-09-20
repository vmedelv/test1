'use strict';
/* Motor de recordatorios (version navegador). Programa avisos para cada cita
 * y los "envia" (los deja en la bandeja) cuando llega su hora. Espejo de
 * demo-remindaclinic/src/reminders.js pero usando window.Store. */
(function () {

const Store = window.Store;

const OFFSETS = [
  { hoursBefore: 24, kind: 'confirmacion' },
  { hoursBefore: 2, kind: 'recordatorio' },
];

const CHANNEL_LABEL = { sms: 'SMS', email: 'Email', whatsapp: 'WhatsApp' };

function pad(n) { return String(n).padStart(2, '0'); }

function isoLocal(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
}

function apptDateTime(appt) {
  return new Date(`${appt.date}T${appt.time}:00`);
}

function humanDate(appt) {
  const dias = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
  const d = apptDateTime(appt);
  return `${dias[d.getDay()]} ${pad(d.getDate())}-${pad(d.getMonth() + 1)} a las ${appt.time}`;
}

function messageFor(appt, prof, kind) {
  const cuando = humanDate(appt);
  const quien = prof ? `${prof.name} (${prof.specialty})` : 'tu profesional';
  if (kind === 'confirmacion') {
    return `Hola ${appt.patientName}: tienes hora con ${quien} el ${cuando}. ` +
      `Responde CONFIRMAR o entra a tu cita ${appt.code} para confirmar o reagendar. - RemindaClinic`;
  }
  return `Recordatorio: tu hora con ${quien} es ${cuando}. ` +
    `Codigo ${appt.code}. Si no puedes asistir, avisanos para liberar el cupo. - RemindaClinic`;
}

function planForAppointment(appt, prof) {
  const base = apptDateTime(appt);
  for (const off of OFFSETS) {
    const when = new Date(base.getTime() - off.hoursBefore * 3600 * 1000);
    Store.db.reminders.push({
      id: Store.id('rem'),
      appointmentId: appt.id,
      channel: appt.channel,
      kind: off.kind,
      hoursBefore: off.hoursBefore,
      scheduledFor: isoLocal(when),
      status: 'pendiente',
      sentAt: null,
      message: messageFor(appt, prof, off.kind),
    });
  }
}

function cancelForAppointment(apptId) {
  let n = 0;
  for (const r of Store.db.reminders) {
    if (r.appointmentId === apptId && r.status === 'pendiente') {
      r.status = 'cancelado';
      n += 1;
    }
  }
  return n;
}

// Procesa los recordatorios vencidos: los marca como enviados. Devuelve los
// recien enviados. Se llama al cargar la pagina y cada 30 s (ver common.js).
function processDue(now) {
  now = now || new Date();
  const sent = [];
  const byAppt = new Map(Store.db.appointments.map((a) => [a.id, a]));
  for (const r of Store.db.reminders) {
    if (r.status !== 'pendiente') continue;
    const appt = byAppt.get(r.appointmentId);
    if (!appt || appt.status === 'cancelada') { r.status = 'cancelado'; continue; }
    if (new Date(r.scheduledFor) <= now) {
      r.status = 'enviado';
      r.sentAt = isoLocal(now);
      sent.push(r);
    }
  }
  if (sent.length) Store.persist();
  return sent;
}

function listReminders(filter) {
  filter = filter || {};
  let list = Store.db.reminders.slice();
  if (filter.status) list = list.filter((r) => r.status === filter.status);
  if (filter.appointmentId) list = list.filter((r) => r.appointmentId === filter.appointmentId);
  list.sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));

  const byAppt = new Map(Store.db.appointments.map((a) => [a.id, a]));
  return list.map((r) => {
    const appt = byAppt.get(r.appointmentId);
    return {
      id: r.id,
      appointmentId: r.appointmentId,
      code: appt ? appt.code : '',
      patientName: appt ? appt.patientName : '(cita eliminada)',
      channel: r.channel,
      channelLabel: CHANNEL_LABEL[r.channel] || r.channel,
      kind: r.kind,
      hoursBefore: r.hoursBefore,
      scheduledFor: r.scheduledFor,
      status: r.status,
      sentAt: r.sentAt,
      message: r.message,
    };
  });
}

function stats() {
  const acc = { pendiente: 0, enviado: 0, cancelado: 0 };
  for (const r of Store.db.reminders) acc[r.status] = (acc[r.status] || 0) + 1;
  return acc;
}

window.Reminders = {
  OFFSETS,
  planForAppointment,
  cancelForAppointment,
  processDue,
  listReminders,
  stats,
};

})();
