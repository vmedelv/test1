'use strict';

// Helpers compartidos por todas las páginas del demo (versión servidor:
// habla con la API por fetch y se suscribe a actualizaciones por SSE).

const App = {
  async api(method, path, body) {
    const res = await fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Error de servidor.');
    return data;
  },
  subscribe(cb) {
    // ?static desactiva la suscripción en vivo (útil para capturas de
    // pantalla o pruebas: un stream SSE abierto congela el tiempo virtual
    // de un navegador headless).
    if (new URLSearchParams(location.search).has('static')) return;
    const es = new EventSource('/api/stream');
    es.onmessage = () => cb();
  },
};

const CANAL_META = {
  sms: { label: 'SMS', icon: '📱' },
  whatsapp: { label: 'WhatsApp', icon: '💬' },
  email: { label: 'Email', icon: '✉️' },
  ivr: { label: 'IVR', icon: '📞' },
};

const ESTADO_META = {
  AGENDADA: { label: 'Agendada (sin notificar)', cls: '' },
  NOTIFICADA: { label: 'Notificada', cls: 'accent' },
  CONFIRMADA: { label: 'Confirmada', cls: 'ok' },
  CANCELADA: { label: 'Cancelada', cls: 'danger' },
  REPROGRAMACION_SOLICITADA: { label: 'Solicita reprogramar', cls: 'warn' },
  REPROGRAMADA: { label: 'Reprogramada', cls: '' },
  SIN_RESPUESTA: { label: 'Sin respuesta', cls: 'warn' },
  GESTION_MANUAL: { label: 'En gestión manual', cls: 'danger' },
  INUBICABLE: { label: 'Inubicable', cls: 'danger' },
};

const RESULTADO_META = {
  ATENDIDA: { label: 'Atendida', cls: 'ok' },
  NSP: { label: 'No se presentó', cls: 'danger' },
};

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function fmtFecha(ms) {
  if (!ms) return '—';
  try {
    return new Intl.DateTimeFormat('es-CL', {
      weekday: 'short', day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit',
      timeZone: 'America/Santiago',
    }).format(new Date(ms));
  } catch (e) {
    return new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
  }
}

function fmtRestante(horas) {
  if (horas == null) return '';
  if (horas < 0) return 'pasada';
  if (horas < 48) return `en ${Math.round(horas)} h`;
  return `en ${Math.floor(horas / 24)} d ${Math.round(horas % 24)} h`;
}

function pct(x, digits = 0) {
  return x == null ? '—' : `${(x * 100).toFixed(digits)}%`;
}

function estadoBadge(cita) {
  if (cita.resultadoFinal) {
    const r = RESULTADO_META[cita.resultadoFinal];
    return `<span class="badge ${r.cls}">${r.label}</span>`;
  }
  const e = ESTADO_META[cita.estado] || { label: cita.estado, cls: '' };
  return `<span class="badge ${e.cls}">${e.label}</span>`;
}

function canalChips(canales) {
  return `<span class="chips">${(canales || [])
    .map((c) => `<span class="chip">${CANAL_META[c] ? CANAL_META[c].icon + ' ' + CANAL_META[c].label : escapeHtml(c)}</span>`)
    .join('')}</span>`;
}

function notice(container, kind, text) {
  container.innerHTML = `<div class="notice ${kind}">${escapeHtml(text)}</div>`;
}
