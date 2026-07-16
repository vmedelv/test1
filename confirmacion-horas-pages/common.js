'use strict';

// Helpers compartidos — versión 100% cliente para GitHub Pages. En vez de
// hablar con una API por fetch + SSE (como public/common.js de la versión
// Node), App.api despacha directamente a las reglas de negocio
// (lib/core.js) sobre localStorage (lib/store.js). Las páginas usan
// exactamente el mismo código en ambas versiones.

const Domain = ConfirmaCore.createDomain(Store);
if (!Store.db.pacientes.length) Domain.seedDemo();

const App = (() => {
  const listeners = new Set();
  const RUTAS = [
    ['GET', /^\/api\/dashboard$/, () => Domain.dashboard()],
    ['GET', /^\/api\/pacientes$/, () => Domain.pacientes()],
    ['GET', /^\/api\/pacientes\/([^/]+)\/inbox$/, (m) => Domain.inbox(m[1])],
    ['GET', /^\/api\/maestro$/, () => Domain.maestro()],
    ['GET', /^\/api\/kpis$/, () => Domain.kpis()],
    ['POST', /^\/api\/reloj\/avanzar$/, (m, b) => Domain.avanzarReloj(b.horas)],
    ['POST', /^\/api\/sincronizar$/, () => Domain.sincronizarAhora()],
    ['POST', /^\/api\/seed$/, () => Domain.seedDemo()],
    ['POST', /^\/api\/mensajes\/([^/]+)\/responder$/, (m, b) => Domain.responderMensaje(m[1], b.accion)],
    ['POST', /^\/api\/citas\/([^/]+)\/gestionar$/, (m, b) => Domain.gestionar(m[1], b)],
    ['POST', /^\/api\/citas\/([^/]+)\/reenviar$/, (m, b) => Domain.reenviar(m[1], b.canal)],
    ['POST', /^\/api\/maestro\/citas$/, (m, b) => Domain.crearCitaMaestro(b)],
    ['POST', /^\/api\/maestro\/citas\/([^/]+)\/mover$/, (m, b) => Domain.moverCitaMaestro(m[1], b.horas)],
    ['POST', /^\/api\/maestro\/citas\/([^/]+)\/cancelar$/, (m) => Domain.cancelarCitaMaestro(m[1])],
  ];
  return {
    api(method, path, body) {
      return Promise.resolve().then(() => {
        for (const [m, re, fn] of RUTAS) {
          if (m !== method) continue;
          const match = path.match(re);
          if (!match) continue;
          const result = fn(match, body || {});
          if (method === 'POST') listeners.forEach((cb) => cb());
          return result;
        }
        throw new Error(`Ruta no implementada: ${method} ${path}`);
      });
    },
    subscribe(cb) {
      listeners.add(cb);
      // Cambios hechos desde OTRA pestaña: cuando persist() escribe en
      // localStorage llega un evento storage; se recarga para releer la base.
      window.addEventListener('storage', (e) => {
        if (e.key === 'demo-confirmacion-horas') location.reload();
      });
    },
  };
})();

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
