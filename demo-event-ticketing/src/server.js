'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const domain = require('./domain');
const { DomainError } = domain;
const qr = require('./qr');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PORT = Number(process.env.PORT) || 8787;

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

// Router muy simple: patrones tipo "/api/orders/:id" contra un pathname.
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

// ---------- Paginas (HTML servido tal cual; el JS del cliente lee el slug/id de location.pathname) ----------

const pageRoutes = {
  '/': 'index.html',
  '/admin': 'admin.html',
  '/checkin': 'checkin.html',
};
const pagePatterns = [
  { pattern: '/e/:slug', file: 'event.html' },
  { pattern: '/pay/:orderId', file: 'pay.html' },
  { pattern: '/orders/:id', file: 'order.html' },
  { pattern: '/tickets/:id', file: 'ticket.html' },
];

// ---------- API: eventos ----------

route('GET', '/api/events', () => ({ status: 200, body: domain.listEvents() }));

route('POST', '/api/events', async (req) => {
  const input = await readJsonBody(req);
  const event = domain.createEvent(input);
  return { status: 201, body: event };
});

route('POST', '/api/events/:id/publish', (req, params) => {
  const event = domain.publishEvent(params.id);
  return { status: 200, body: event };
});

route('GET', '/api/events/:id/stats', (req, params) => ({ status: 200, body: domain.eventStats(params.id) }));

route('GET', '/api/public/events/:slug', (req, params) => {
  const event = domain.getEventBySlug(params.slug);
  return { status: 200, body: domain.publicEventView(event) };
});

route('POST', '/api/public/events/:slug/checkout', async (req, params) => {
  const input = await readJsonBody(req);
  const order = domain.checkout(params.slug, input);
  return { status: 201, body: { order, payUrl: `/pay/${order.id}` } };
});

// ---------- API: ordenes / pago (simulado) ----------

function withQr(ticket) {
  return { ...ticket, qrDataUrl: qr.dataUrlFor(ticket.code) };
}

route('GET', '/api/orders/:id', (req, params) => {
  const order = domain.getOrder(params.id);
  const event = domain.getEventById(order.eventId);
  const tickets = order.status === 'paid' ? domain.ticketsForOrder(order.id).map(withQr) : [];
  return { status: 200, body: { order, event: domain.publicEventView(event), tickets } };
});

route('POST', '/api/orders/:id/confirm', async (req, params) => {
  const input = await readJsonBody(req);
  const { order, tickets } = domain.confirmOrder(params.id, input.gateway);
  return { status: 200, body: { order, tickets: tickets.map(withQr) } };
});

route('POST', '/api/orders/:id/cancel', (req, params) => {
  const order = domain.cancelOrder(params.id);
  return { status: 200, body: order };
});

// ---------- API: tickets ----------

route('GET', '/api/tickets/:id', (req, params) => {
  const ticket = domain.getTicket(params.id);
  const event = domain.getEventById(ticket.eventId);
  return {
    status: 200,
    body: { ticket: withQr(ticket), event: domain.publicEventView(event) },
  };
});

// ---------- API: check-in ----------

route('POST', '/api/checkin/scan', async (req) => {
  const input = await readJsonBody(req);
  const result = domain.scanCheckin(input);
  return { status: 200, body: result };
});

route('GET', '/api/checkin/events', () => ({
  status: 200,
  body: domain.listEvents().filter((e) => e.status === 'published').map(domain.publicEventView),
}));

// ---------- Server ----------

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    if (pathname.startsWith('/api/')) {
      for (const r of routes) {
        if (r.method !== req.method) continue;
        const params = matchPattern(r.pattern, pathname);
        if (!params) continue;
        const result = await r.handler(req, params, url);
        sendJson(res, result.status, result.body);
        return;
      }
      sendJson(res, 404, { error: 'Ruta de API no encontrada.' });
      return;
    }

    if (req.method === 'GET') {
      if (pageRoutes[pathname]) {
        sendFile(res, path.join(PUBLIC_DIR, pageRoutes[pathname]));
        return;
      }
      for (const p of pagePatterns) {
        if (matchPattern(p.pattern, pathname)) {
          sendFile(res, path.join(PUBLIC_DIR, p.file));
          return;
        }
      }
      // assets estaticos (css/js) por ruta directa dentro de /public
      const safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
      const candidate = path.join(PUBLIC_DIR, safePath);
      if (candidate.startsWith(PUBLIC_DIR) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        sendFile(res, candidate);
        return;
      }
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('No encontrado');
  } catch (err) {
    if (err instanceof DomainError) {
      sendJson(res, err.status, { error: err.message });
    } else {
      console.error(err);
      sendJson(res, 500, { error: 'Error interno del servidor.' });
    }
  }
});

server.listen(PORT, () => {
  console.log(`Demo de ticketing corriendo en http://localhost:${PORT}`);
});
