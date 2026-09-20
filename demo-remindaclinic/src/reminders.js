'use strict';

// Motor de recordatorios de RemindaClinic.
// Programa avisos automaticos para cada cita y los "envia" cuando llega su hora.
// En este demo "enviar" significa dejar el mensaje en una bandeja de salida
// (outbox) que se puede ver en la UI; en produccion aqui irian SMS / email /
// WhatsApp reales.

const store = require('./store');

// Cuanto antes de la cita se manda cada aviso.
const OFFSETS = [
  { hoursBefore: 24, kind: 'confirmacion' }, // "confirma tu hora"
  { hoursBefore: 2, kind: 'recordatorio' },  // "es hoy / en un rato"
];

const CHANNEL_LABEL = { sms: 'SMS', email: 'Email', whatsapp: 'WhatsApp' };

function pad(n) {
  return String(n).padStart(2, '0');
}

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

// Programa (en estado "pendiente") los recordatorios de una cita recien creada.
function planForAppointment(appt, prof) {
  const base = apptDateTime(appt);
  for (const off of OFFSETS) {
    const when = new Date(base.getTime() - off.hoursBefore * 3600 * 1000);
    store.db.reminders.push({
      id: store.id('rem'),
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

// Cancela los recordatorios pendientes de una cita (p.ej. al anularla).
function cancelForAppointment(apptId) {
  let n = 0;
  for (const r of store.db.reminders) {
    if (r.appointmentId === apptId && r.status === 'pendiente') {
      r.status = 'cancelado';
      n += 1;
    }
  }
  return n;
}

// Procesa los recordatorios cuya hora ya llego: los marca como enviados.
// Devuelve los recordatorios recien enviados (para mostrarlos en la UI).
function processDue(now = new Date()) {
  const sent = [];
  const byAppt = new Map(store.db.appointments.map((a) => [a.id, a]));
  for (const r of store.db.reminders) {
    if (r.status !== 'pendiente') continue;
    const appt = byAppt.get(r.appointmentId);
    if (!appt || appt.status === 'cancelada') {
      // La cita ya no existe o fue anulada: no tiene sentido enviar.
      r.status = 'cancelado';
      continue;
    }
    if (new Date(r.scheduledFor) <= now) {
      r.status = 'enviado';
      r.sentAt = isoLocal(now);
      sent.push(r);
    }
  }
  if (sent.length) store.persist();
  return sent;
}

function listReminders(filter = {}) {
  let list = store.db.reminders.slice();
  if (filter.status) list = list.filter((r) => r.status === filter.status);
  if (filter.appointmentId) list = list.filter((r) => r.appointmentId === filter.appointmentId);
  list.sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));

  const byAppt = new Map(store.db.appointments.map((a) => [a.id, a]));
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
  for (const r of store.db.reminders) {
    acc[r.status] = (acc[r.status] || 0) + 1;
  }
  return acc;
}

module.exports = {
  OFFSETS,
  planForAppointment,
  cancelForAppointment,
  processDue,
  listReminders,
  stats,
};
