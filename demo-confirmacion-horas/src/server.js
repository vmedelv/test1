'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const store = require('./store');
const { createDomain } = require('./core');

const domain = createDomain(store);
const { DomainError } = domain;

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PORT = Number(process.env.PORT) || 8788;

// Sin pacientes no hay nada que demostrar: si la base está vacía se carga
// el escenario de ejemplo (equivalente a `node src/seed.js`).
if (!store.db.pacientes.length) {
  domain.seedDemo();
  console.log('Base vacía: se cargó el escenario de demostración.');
}

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

// Router simple: patrones tipo "/api/citas/:id/gestionar" contra un pathname.
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

// ---------- Actualización en tiempo real (SSE) ----------
// Cada mutación (avance de reloj, respuesta de paciente, gestión manual...)
// notifica a todas las pantallas abiertas para que se refresquen — el
// equivalente demo del WebSocket/SSE descrito en §4 de la propuesta.

const sseClients = new Set();

function broadcast() {
  for (const res of sseClients) res.write('data: update\n\n');
}

setInterval(() => {
  for (const res of sseClients) res.write(': ping\n\n');
}, 30_000).unref();

// ---------- Rutas API ----------

route('GET', '/api/dashboard', () => domain.dashboard());
route('GET', '/api/pacientes', () => domain.pacientes());
route('GET', '/api/pacientes/:id/inbox', (params) => domain.inbox(params.id));
route('GET', '/api/maestro', () => domain.maestro());
route('GET', '/api/kpis', () => domain.kpis());

route('POST', '/api/reloj/avanzar', (params, body) => domain.avanzarReloj(body.horas));
route('POST', '/api/sincronizar', () => domain.sincronizarAhora());
route('POST', '/api/seed', () => domain.seedDemo());
route('POST', '/api/mensajes/:id/responder', (params, body) => domain.responderMensaje(params.id, body.accion));
route('POST', '/api/citas/:id/gestionar', (params, body) => domain.gestionar(params.id, body));
route('POST', '/api/citas/:id/reenviar', (params, body) => domain.reenviar(params.id, body.canal));
route('POST', '/api/maestro/citas', (params, body) => domain.crearCitaMaestro(body));
route('POST', '/api/maestro/citas/:id/mover', (params, body) => domain.moverCitaMaestro(params.id, body.horas));
route('POST', '/api/maestro/citas/:id/cancelar', (params) => domain.cancelarCitaMaestro(params.id));

// ---------- Páginas ----------

const pageRoutes = {
  '/': 'index.html',
  '/paciente': 'paciente.html',
  '/sismaule': 'sismaule.html',
  '/kpis': 'kpis.html',
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  if (req.method === 'GET' && pathname === '/api/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write('retry: 3000\n\n');
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  for (const r of routes) {
    if (r.method !== req.method) continue;
    const params = matchPattern(r.pattern, pathname);
    if (!params) continue;
    try {
      const body = req.method === 'POST' ? await readJsonBody(req) : {};
      const result = r.handler(params, body);
      sendJson(res, 200, result === undefined ? { ok: true } : result);
      if (req.method === 'POST') broadcast();
    } catch (err) {
      if (err instanceof DomainError) {
        sendJson(res, err.status, { error: err.message });
      } else {
        console.error(err);
        sendJson(res, 500, { error: 'Error interno.' });
      }
    }
    return;
  }

  if (req.method === 'GET') {
    if (pageRoutes[pathname]) {
      sendFile(res, path.join(PUBLIC_DIR, pageRoutes[pathname]));
      return;
    }
    const safe = path.normalize(pathname).replace(/^([/\\.])+/, '');
    const filePath = path.join(PUBLIC_DIR, safe);
    if (filePath.startsWith(PUBLIC_DIR) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      sendFile(res, filePath);
      return;
    }
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('No encontrado');
});

server.listen(PORT, () => {
  console.log(`Demo de confirmación de horas en http://localhost:${PORT}`);
});
