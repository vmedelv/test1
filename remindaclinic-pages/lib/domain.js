'use strict';
/* Reglas de negocio (version navegador). Espejo de
 * demo-remindaclinic/src/domain.js usando window.Store y window.Reminders. */
(function () {

const Store = window.Store;
const Reminders = window.Reminders;

class DomainError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'DomainError';
    this.status = status;
  }
}

const APPOINTMENT_STATUSES = ['reservada', 'confirmada', 'cancelada', 'atendida', 'no_asistio'];

function pad(n) { return String(n).padStart(2, '0'); }
function toDate(dateStr, timeStr) { return new Date(`${dateStr}T${timeStr}:00`); }
function isoLocal(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
}
function todayStr() { return isoLocal(new Date()).slice(0, 10); }
function minutesOf(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
function timeOf(min) { return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`; }

function requireStr(value, field, max = 200) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new DomainError(`El campo "${field}" es obligatorio.`);
  }
  const v = value.trim();
  if (v.length > max) throw new DomainError(`El campo "${field}" es demasiado largo.`);
  return v;
}

function normalizePhone(value) {
  const v = requireStr(value, 'telefono', 30);
  const digits = v.replace(/[^\d+]/g, '');
  if (digits.replace(/\D/g, '').length < 8) throw new DomainError('El telefono no parece valido.');
  return digits;
}

function normalizeEmail(value) {
  if (value === undefined || value === null || String(value).trim() === '') return '';
  const v = String(value).trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new DomainError('El email no parece valido.');
  return v.toLowerCase();
}

function isDateStr(v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v); }
function isTimeStr(v) { return typeof v === 'string' && /^\d{2}:\d{2}$/.test(v); }

function publicProfessional(p) {
  return {
    id: p.id, slug: p.slug, name: p.name, specialty: p.specialty,
    color: p.color, slotMinutes: p.slotMinutes, days: p.days, blocks: p.blocks,
  };
}

function listProfessionals() {
  return Store.db.professionals.map(publicProfessional);
}

function getProfessional(profId) {
  const p = Store.db.professionals.find((x) => x.id === profId || x.slug === profId);
  if (!p) throw new DomainError('Profesional no encontrado.', 404);
  return p;
}

function createProfessional(input) {
  const name = requireStr(input.name, 'nombre');
  const specialty = requireStr(input.specialty, 'especialidad');
  const slotMinutes = Number(input.slotMinutes) || 30;
  if (![15, 20, 30, 45, 60].includes(slotMinutes)) {
    throw new DomainError('La duracion de la hora debe ser 15, 20, 30, 45 o 60 minutos.');
  }
  const days = Array.isArray(input.days) && input.days.length
    ? input.days.map(Number).filter((d) => d >= 0 && d <= 6)
    : [1, 2, 3, 4, 5];
  const blocks = Array.isArray(input.blocks) && input.blocks.length
    ? input.blocks : [['09:00', '13:00'], ['15:00', '18:00']];
  for (const b of blocks) {
    if (!Array.isArray(b) || !isTimeStr(b[0]) || !isTimeStr(b[1]) || minutesOf(b[0]) >= minutesOf(b[1])) {
      throw new DomainError('Los bloques horarios son invalidos.');
    }
  }
  const prof = {
    id: Store.id('prof'), slug: Store.slugify(name), name, specialty,
    color: input.color || '#2563eb', slotMinutes, days, blocks,
  };
  Store.db.professionals.push(prof);
  Store.persist();
  return publicProfessional(prof);
}

function slotsFor(profId, dateStr) {
  const prof = getProfessional(profId);
  if (!isDateStr(dateStr)) throw new DomainError('Fecha invalida (use YYYY-MM-DD).');
  const weekday = toDate(dateStr, '12:00').getDay();
  const working = prof.days.includes(weekday);
  const taken = new Set(
    Store.db.appointments
      .filter((a) => a.professionalId === prof.id && a.date === dateStr && a.status !== 'cancelada')
      .map((a) => a.time),
  );
  const now = new Date();
  const slots = [];
  if (working) {
    for (const [from, to] of prof.blocks) {
      for (let m = minutesOf(from); m + prof.slotMinutes <= minutesOf(to); m += prof.slotMinutes) {
        const time = timeOf(m);
        const past = toDate(dateStr, time) <= now;
        slots.push({ time, taken: taken.has(time), past, available: !taken.has(time) && !past });
      }
    }
  }
  return { professional: publicProfessional(prof), date: dateStr, weekday, working, slots };
}

function publicAppointment(a) {
  const prof = Store.db.professionals.find((p) => p.id === a.professionalId);
  return {
    id: a.id, code: a.code, professionalId: a.professionalId,
    professionalName: prof ? prof.name : '(desconocido)',
    specialty: prof ? prof.specialty : '', color: prof ? prof.color : '#888',
    patientName: a.patientName, patientPhone: a.patientPhone, patientEmail: a.patientEmail,
    date: a.date, time: a.time, durationMin: a.durationMin, reason: a.reason,
    channel: a.channel, status: a.status, createdAt: a.createdAt,
    reminders: Store.db.reminders
      .filter((r) => r.appointmentId === a.id)
      .sort((x, y) => x.scheduledFor.localeCompare(y.scheduledFor)),
  };
}

function getAppointment(apptId) {
  const a = Store.db.appointments.find((x) => x.id === apptId);
  if (!a) throw new DomainError('Cita no encontrada.', 404);
  return a;
}

function getAppointmentByCode(code) {
  const c = String(code || '').trim().toUpperCase();
  const a = Store.db.appointments.find((x) => x.code === c);
  if (!a) throw new DomainError('No existe una cita con ese codigo.', 404);
  return publicAppointment(a);
}

function listAppointments(filter) {
  filter = filter || {};
  let list = Store.db.appointments.slice();
  if (filter.professionalId) list = list.filter((a) => a.professionalId === filter.professionalId);
  if (filter.date) list = list.filter((a) => a.date === filter.date);
  if (filter.status) list = list.filter((a) => a.status === filter.status);
  list.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  return list.map(publicAppointment);
}

function createAppointment(input) {
  const prof = getProfessional(input.professionalId);
  if (!isDateStr(input.date)) throw new DomainError('Fecha invalida (use YYYY-MM-DD).');
  if (!isTimeStr(input.time)) throw new DomainError('Hora invalida (use HH:MM).');
  const grid = slotsFor(prof.id, input.date);
  const slot = grid.slots.find((s) => s.time === input.time);
  if (!slot) throw new DomainError('Esa hora no esta en la agenda del profesional.');
  if (slot.past) throw new DomainError('Esa hora ya paso.');
  if (slot.taken) throw new DomainError('Esa hora ya fue reservada por otro paciente.', 409);

  const channel = ['sms', 'email', 'whatsapp'].includes(input.channel) ? input.channel : 'sms';
  const patientEmail = normalizeEmail(input.patientEmail);
  if (channel === 'email' && !patientEmail) {
    throw new DomainError('Para recordatorios por email debes ingresar un email.');
  }

  const appt = {
    id: Store.id('appt'), code: Store.bookingCode(), professionalId: prof.id,
    patientName: requireStr(input.patientName, 'nombre del paciente'),
    patientPhone: normalizePhone(input.patientPhone), patientEmail,
    date: input.date, time: input.time, durationMin: prof.slotMinutes,
    reason: (input.reason ? String(input.reason).trim() : '').slice(0, 300),
    channel, status: 'reservada', createdAt: isoLocal(new Date()),
  };
  Store.db.appointments.push(appt);
  Reminders.planForAppointment(appt, prof);
  Store.persist();
  return publicAppointment(appt);
}

function setStatus(apptId, status) {
  if (!APPOINTMENT_STATUSES.includes(status)) throw new DomainError(`Estado invalido: ${status}.`);
  const appt = getAppointment(apptId);
  appt.status = status;
  if (status === 'cancelada') Reminders.cancelForAppointment(appt.id);
  Store.persist();
  return publicAppointment(appt);
}

function confirmAppointment(apptId) {
  const appt = getAppointment(apptId);
  if (appt.status === 'cancelada') throw new DomainError('La cita esta cancelada.');
  appt.status = 'confirmada';
  Store.persist();
  return publicAppointment(appt);
}

function cancelAppointment(apptId) { return setStatus(apptId, 'cancelada'); }

function summary() {
  const appts = listAppointments();
  const byStatus = {};
  for (const a of appts) byStatus[a.status] = (byStatus[a.status] || 0) + 1;
  return {
    today: todayStr(),
    professionals: listProfessionals().length,
    appointments: appts.length,
    byStatus,
    reminders: Reminders.stats(),
  };
}

window.Domain = {
  DomainError, APPOINTMENT_STATUSES, todayStr,
  listProfessionals, getProfessional, createProfessional, publicProfessional,
  slotsFor,
  listAppointments, getAppointment, getAppointmentByCode, publicAppointment,
  createAppointment, setStatus, confirmAppointment, cancelAppointment,
  summary,
};

})();
