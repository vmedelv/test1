'use strict';

// Servidor HTTP de RemindaClinic. Sin dependencias externas (solo Node).
// Sirve la UI estatica de /public y una pequena API JSON en /api.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const domain = require('./domain');
const reminders = require('./reminders');
const { DomainError } = domain;

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PORT = Number(process.env.PORT) || 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function sendFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('No encontrado');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 1_000_000) {
        reject(new DomainError('Cuerpo de la solicitud demasiado grande.', 413));
        req.destroy();
        return;
      }
      raw += chunk;
    });
    req.on('end', () => {
      if (!raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(new DomainError('JSON invalido en el cuerpo de la solicitud.'));
      }
    });
    req.on('error', reject);
  });
}

// Router simple: patrones tipo "/api/appointments/:id".
function matchPattern(pattern, pathname) {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = pathname.split('/').filter(Boolean);
  if (patternParts.length !== pathParts.length) return null;
  const params = {};
  for (let i = 0; i < patternParts.length; i++) {
    const p = patternParts[i];
    if (p.startsWith(':')) {
      params[p.slice(1)] = decodeURIComponent(pathParts[i]);
    } else if (p !== pathParts[i]) {
      return null;
    }
  }
  return params;
}

const routes = [];
function route(method, pattern, handler) {
  routes.push({ method, pattern, handler });
}

// --- Profesionales ---
route('GET', '/api/professionals', () => domain.listProfessionals());
route('POST', '/api/professionals', (ctx) => domain.createProfessional(ctx.body));
route('GET', '/api/professionals/:id/slots', (ctx) => {
  const date = ctx.query.get('date') || domain.todayStr();
  return domain.slotsFor(ctx.params.id, date);
});

// --- Citas ---
route('GET', '/api/appointments', (ctx) => domain.listAppointments({
  professionalId: ctx.query.get('professionalId') || undefined,
  date: ctx.query.get('date') || undefined,
  status: ctx.query.get('status') || undefined,
}));
route('POST', '/api/appointments', (ctx) => domain.createAppointment(ctx.body));
route('GET', '/api/appointments/:id', (ctx) => domain.publicAppointment(domain.getAppointment(ctx.params.id)));
route('POST', '/api/appointments/:id/confirm', (ctx) => domain.confirmAppointment(ctx.params.id));
route('POST', '/api/appointments/:id/cancel', (ctx) => domain.cancelAppointment(ctx.params.id));
route('POST', '/api/appointments/:id/status', (ctx) => domain.setStatus(ctx.params.id, ctx.body.status));

// --- Busqueda por codigo (paciente) ---
route('GET', '/api/lookup', (ctx) => {
  const code = ctx.query.get('code');
  if (!code) throw new DomainError('Falta el codigo de la cita.');
  return domain.getAppointmentByCode(code);
});

// --- Recordatorios ---
route('GET', '/api/reminders', (ctx) => reminders.listReminders({
  status: ctx.query.get('status') || undefined,
  appointmentId: ctx.query.get('appointmentId') || undefined,
}));
route('POST', '/api/reminders/process', () => {
  const sent = reminders.processDue(new Date());
  return { sent: sent.length, reminders: reminders.listReminders() };
});

// --- Resumen para el panel ---
route('GET', '/api/summary', () => {
  const appts = domain.listAppointments();
  const byStatus = {};
  for (const a of appts) byStatus[a.status] = (byStatus[a.status] || 0) + 1;
  return {
    today: domain.todayStr(),
    professionals: domain.listProfessionals().length,
    appointments: appts.length,
    byStatus,
    reminders: reminders.stats(),
  };
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  // API
  if (pathname.startsWith('/api/')) {
    try {
      const match = routes.find((r) => r.method === req.method && matchPattern(r.pattern, pathname));
      if (!match) throw new DomainError('Ruta no encontrada.', 404);
      const params = matchPattern(match.pattern, pathname);
      const body = req.method === 'GET' ? {} : await readJsonBody(req);
      const result = await match.handler({ params, query: url.searchParams, body, req });
      sendJson(res, 200, result);
    } catch (err) {
      if (err instanceof DomainError) {
        sendJson(res, err.status || 400, { error: err.message });
      } else {
        console.error('Error interno:', err);
        sendJson(res, 500, { error: 'Error interno del servidor.' });
      }
    }
    return;
  }

  // Estaticos
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const safe = path.normalize(rel).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, safe);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Prohibido');
    return;
  }
  sendFile(res, filePath);
});

// Procesa recordatorios vencidos al arrancar y cada 30 segundos.
function tick() {
  try {
    const sent = reminders.processDue(new Date());
    if (sent.length) console.log(`Recordatorios enviados: ${sent.length}`);
  } catch (err) {
    console.error('Error procesando recordatorios:', err.message);
  }
}

if (require.main === module) {
  tick();
  setInterval(tick, 30_000);
  server.listen(PORT, () => {
    console.log(`RemindaClinic escuchando en http://localhost:${PORT}`);
  });
}

module.exports = { server };
