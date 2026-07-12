'use strict';
/* Puerto al navegador de demo-event-ticketing/src/domain.js. Misma logica
 * de negocio; la unica diferencia es que usa window.Store (localStorage)
 * en vez de un archivo JSON en el servidor. */
(function () {

const { db, persist, id, ticketCode, slugify } = window.Store;

class DomainError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function pickColor(seedText) {
  const palette = ['#5b4dd6', '#0f766e', '#b45309', '#be185d', '#1d4ed8', '#15803d'];
  let sum = 0;
  for (const ch of String(seedText)) sum += ch.charCodeAt(0);
  return palette[sum % palette.length];
}

function createEvent(input) {
  const title = String(input.title || '').trim();
  if (!title) throw new DomainError('El evento necesita un titulo.');
  if (!Array.isArray(input.ticketTypes) || input.ticketTypes.length === 0) {
    throw new DomainError('Agrega al menos un tipo de entrada.');
  }

  let slugBase = slugify(input.slug || title);
  let slug = slugBase;
  let n = 2;
  while (db.events.some((e) => e.slug === slug)) slug = `${slugBase}-${n++}`;

  const ticketTypes = input.ticketTypes.map((tt) => {
    const name = String(tt.name || '').trim();
    if (!name) throw new DomainError('Cada tipo de entrada necesita un nombre.');
    const price = Number(tt.price);
    const stock = Number(tt.stock);
    if (!Number.isFinite(price) || price < 0) throw new DomainError(`Precio invalido para "${name}".`);
    if (!Number.isInteger(stock) || stock < 0) throw new DomainError(`Stock invalido para "${name}".`);
    return { id: id('tt'), name, price, stock, reserved: 0, sold: 0 };
  });

  const promoCodes = (Array.isArray(input.promoCodes) ? input.promoCodes : [])
    .filter((p) => p && p.code)
    .map((p) => ({
      code: String(p.code).trim().toUpperCase(),
      percentOff: Math.min(100, Math.max(0, Number(p.percentOff) || 0)),
      maxUses: Number.isInteger(Number(p.maxUses)) ? Number(p.maxUses) : null,
      used: 0,
    }));

  const event = {
    id: id('evt'),
    slug,
    title,
    description: String(input.description || ''),
    type: ['in_person', 'online', 'hybrid'].includes(input.type) ? input.type : 'in_person',
    venueName: String(input.venueName || ''),
    startsAt: input.startsAt || null,
    timezone: input.timezone || 'America/Santiago',
    coverColor: input.coverColor || pickColor(title),
    status: 'draft',
    ticketTypes,
    promoCodes,
    createdAt: new Date().toISOString(),
  };

  db.events.push(event);
  persist();
  return event;
}

function listEvents() {
  return [...db.events].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

function getEventById(eventId) {
  const event = db.events.find((e) => e.id === eventId);
  if (!event) throw new DomainError('Evento no encontrado.', 404);
  return event;
}

function getEventBySlug(slug) {
  const event = db.events.find((e) => e.slug === slug);
  if (!event) throw new DomainError('Evento no encontrado.', 404);
  return event;
}

function publishEvent(eventId) {
  const event = getEventById(eventId);
  event.status = 'published';
  persist();
  return event;
}

function availability(event) {
  return event.ticketTypes.map((tt) => ({
    id: tt.id,
    name: tt.name,
    price: tt.price,
    stock: tt.stock,
    sold: tt.sold,
    reserved: tt.reserved,
    available: Math.max(0, tt.stock - tt.reserved - tt.sold),
  }));
}

function publicEventView(event) {
  return {
    id: event.id,
    slug: event.slug,
    title: event.title,
    description: event.description,
    type: event.type,
    venueName: event.venueName,
    startsAt: event.startsAt,
    timezone: event.timezone,
    coverColor: event.coverColor,
    status: event.status,
    ticketTypes: availability(event),
  };
}

const RESERVATION_TTL_MS = 15 * 60 * 1000;

function releaseReservation(order) {
  for (const item of order.items) {
    const tt = db.events.find((e) => e.id === order.eventId)?.ticketTypes.find((t) => t.id === item.ticketTypeId);
    if (tt) tt.reserved = Math.max(0, tt.reserved - item.qty);
  }
}

function sweepExpiredReservations(event) {
  const now = Date.now();
  for (const order of db.orders) {
    if (order.eventId !== event.id) continue;
    if (order.status !== 'pending') continue;
    if (now - new Date(order.createdAt).getTime() > RESERVATION_TTL_MS) {
      releaseReservation(order);
      order.status = 'expired';
    }
  }
}

function checkout(slug, input) {
  const event = getEventBySlug(slug);
  if (event.status !== 'published') throw new DomainError('Este evento no esta disponible para venta.');
  sweepExpiredReservations(event);

  const buyerName = String(input.buyerName || '').trim();
  const buyerEmail = String(input.buyerEmail || '').trim();
  if (!buyerName || !buyerEmail) throw new DomainError('Nombre y correo del comprador son obligatorios.');

  const items = Array.isArray(input.items) ? input.items.filter((i) => Number(i.qty) > 0) : [];
  if (items.length === 0) throw new DomainError('Selecciona al menos una entrada.');

  let subtotal = 0;
  const resolvedItems = [];
  for (const line of items) {
    const tt = event.ticketTypes.find((t) => t.id === line.ticketTypeId);
    if (!tt) throw new DomainError('Tipo de entrada invalido.');
    const qty = Math.floor(Number(line.qty));
    const available = tt.stock - tt.reserved - tt.sold;
    if (qty > available) throw new DomainError(`Solo quedan ${available} entrada(s) de "${tt.name}".`);
    resolvedItems.push({ ticketTypeId: tt.id, name: tt.name, qty, unitPrice: tt.price });
    subtotal += qty * tt.price;
  }

  let discount = 0;
  let appliedPromo = null;
  if (input.promoCode) {
    const code = String(input.promoCode).trim().toUpperCase();
    const promo = event.promoCodes.find((p) => p.code === code);
    if (!promo) throw new DomainError('Codigo promocional invalido.');
    if (promo.maxUses !== null && promo.used >= promo.maxUses) throw new DomainError('Codigo promocional agotado.');
    discount = Math.round(subtotal * (promo.percentOff / 100));
    appliedPromo = promo.code;
  }

  for (const line of resolvedItems) {
    const tt = event.ticketTypes.find((t) => t.id === line.ticketTypeId);
    tt.reserved += line.qty;
  }

  const order = {
    id: id('ord'),
    eventId: event.id,
    buyerName,
    buyerEmail,
    items: resolvedItems,
    subtotal,
    discount,
    promoCode: appliedPromo,
    total: Math.max(0, subtotal - discount),
    status: 'pending',
    gateway: null,
    createdAt: new Date().toISOString(),
    paidAt: null,
  };
  db.orders.push(order);
  persist();
  return order;
}

function getOrder(orderId) {
  const order = db.orders.find((o) => o.id === orderId);
  if (!order) throw new DomainError('Orden no encontrada.', 404);
  return order;
}

function confirmOrder(orderId, gateway) {
  const order = getOrder(orderId);
  if (order.status !== 'pending') throw new DomainError(`La orden ya esta en estado "${order.status}".`);

  const event = getEventById(order.eventId);
  const promo = order.promoCode ? event.promoCodes.find((p) => p.code === order.promoCode) : null;
  if (promo) promo.used += 1;

  const tickets = [];
  for (const line of order.items) {
    const tt = event.ticketTypes.find((t) => t.id === line.ticketTypeId);
    tt.reserved = Math.max(0, tt.reserved - line.qty);
    tt.sold += line.qty;
    for (let i = 0; i < line.qty; i++) {
      const ticket = {
        id: id('tkt'),
        orderId: order.id,
        eventId: event.id,
        ticketTypeId: tt.id,
        ticketTypeName: tt.name,
        code: ticketCode(),
        attendeeName: order.buyerName,
        status: 'valid',
        checkedInAt: null,
        checkedInBy: null,
      };
      db.tickets.push(ticket);
      tickets.push(ticket);
    }
  }

  order.status = 'paid';
  order.gateway = gateway === 'flow' ? 'flow' : 'webpay_plus';
  order.paidAt = new Date().toISOString();
  persist();
  return { order, tickets };
}

function cancelOrder(orderId) {
  const order = getOrder(orderId);
  if (order.status !== 'pending') throw new DomainError(`No se puede cancelar una orden en estado "${order.status}".`);
  releaseReservation(order);
  order.status = 'cancelled';
  persist();
  return order;
}

function ticketsForOrder(orderId) {
  return db.tickets.filter((t) => t.orderId === orderId);
}

function getTicket(ticketId) {
  const ticket = db.tickets.find((t) => t.id === ticketId);
  if (!ticket) throw new DomainError('Ticket no encontrado.', 404);
  return ticket;
}

function scanCheckin({ code, eventSlug, staff }) {
  const normalized = String(code || '').trim().toUpperCase();
  if (!normalized) throw new DomainError('Ingresa un codigo.');

  const event = eventSlug ? getEventBySlug(eventSlug) : null;
  const ticket = db.tickets.find((t) => t.code === normalized);

  if (!ticket) return { outcome: 'not_found' };
  if (event && ticket.eventId !== event.id) return { outcome: 'wrong_event', ticket };
  if (ticket.status === 'used') return { outcome: 'already_used', ticket };
  if (ticket.status === 'cancelled') return { outcome: 'cancelled', ticket };

  ticket.status = 'used';
  ticket.checkedInAt = new Date().toISOString();
  ticket.checkedInBy = staff || 'staff-demo';
  persist();
  return { outcome: 'valid', ticket };
}

function eventStats(eventId) {
  const event = getEventById(eventId);
  const orders = db.orders.filter((o) => o.eventId === eventId);
  const tickets = db.tickets.filter((t) => t.eventId === eventId);

  const paidOrders = orders.filter((o) => o.status === 'paid');
  const revenue = paidOrders.reduce((sum, o) => sum + o.total, 0);
  const checkedIn = tickets.filter((t) => t.status === 'used').length;

  return {
    event: publicEventView(event),
    totals: {
      ordersPaid: paidOrders.length,
      ordersPending: orders.filter((o) => o.status === 'pending').length,
      revenue,
      ticketsSold: tickets.length,
      ticketsCheckedIn: checkedIn,
      attendanceRate: tickets.length ? Math.round((checkedIn / tickets.length) * 100) : 0,
    },
    byTicketType: availability(event),
    recentOrders: [...orders].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 20),
  };
}

window.Domain = {
  DomainError,
  createEvent,
  listEvents,
  getEventById,
  getEventBySlug,
  publishEvent,
  publicEventView,
  checkout,
  getOrder,
  confirmOrder,
  cancelOrder,
  ticketsForOrder,
  getTicket,
  scanCheckin,
  eventStats,
};

})();
