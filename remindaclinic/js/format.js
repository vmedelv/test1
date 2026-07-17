// Formato de fechas, teléfonos y plantillas de mensaje.

const fFecha = new Intl.DateTimeFormat('es-CL', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});
const fFechaCorta = new Intl.DateTimeFormat('es-CL', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
const fHora = new Intl.DateTimeFormat('es-CL', {
  hour: '2-digit',
  minute: '2-digit',
});

export function fechaLarga(iso) {
  return capitalizar(fFecha.format(new Date(iso)));
}

export function fechaCorta(iso) {
  return fFechaCorta.format(new Date(iso));
}

export function hora(iso) {
  return fHora.format(new Date(iso));
}

export function fechaHora(iso) {
  return `${fechaLarga(iso)} · ${hora(iso)}`;
}

function capitalizar(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Devuelve el valor de un <input type="datetime-local"> a partir de un ISO,
// en hora local (sin la Z de UTC).
export function isoToLocalInput(iso) {
  const d = new Date(iso);
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

// Normaliza un teléfono a solo dígitos con código de país, apto para wa.me.
// Si el número parte con 0 se asume nacional y se antepone el código de país.
export function telefonoWa(telefono, codigoPais = '56') {
  let d = (telefono || '').replace(/[^\d+]/g, '');
  if (d.startsWith('+')) return d.slice(1);
  d = d.replace(/\D/g, '');
  if (d.startsWith(codigoPais)) return d;
  d = d.replace(/^0+/, '');
  return codigoPais + d;
}

// Rellena la plantilla con los datos de la cita.
export function construirMensaje(plantilla, ctx) {
  return plantilla.replace(/\{(\w+)\}/g, (m, k) =>
    ctx[k] != null ? String(ctx[k]) : m
  );
}

// Estados y etiquetas legibles.
export const ESTADOS = {
  agendada: 'Agendada',
  confirmada: 'Confirmada',
  atendida: 'Atendida',
  cancelada: 'Cancelada',
  no_asistio: 'No asistió',
};

// Comparadores de fecha para "hoy".
export function esMismoDia(iso, ref = new Date()) {
  const d = new Date(iso);
  return (
    d.getFullYear() === ref.getFullYear() &&
    d.getMonth() === ref.getMonth() &&
    d.getDate() === ref.getDate()
  );
}

export function inicioDeHoy() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
