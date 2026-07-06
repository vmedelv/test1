'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

function emptyDb() {
  return { events: [], orders: [], tickets: [] };
}

function load() {
  if (!fs.existsSync(DB_PATH)) {
    return emptyDb();
  }
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    if (!raw.trim()) return emptyDb();
    return JSON.parse(raw);
  } catch (err) {
    console.error('No se pudo leer data/db.json, se parte de una base vacia:', err.message);
    return emptyDb();
  }
}

let db = load();

function persist() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
}

function id(prefix) {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

// Codigo corto de ticket, tipo humano-legible (lo que iria bajo el QR real).
function ticketCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin caracteres ambiguos
  let out = '';
  for (let i = 0; i < 10; i++) {
    out += alphabet[crypto.randomInt(alphabet.length)];
    if (i === 3 || i === 6) out += '-';
  }
  return out;
}

function slugify(text) {
  return String(text)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60) || id('e');
}

function resetAll() {
  const fresh = emptyDb();
  db.events = fresh.events;
  db.orders = fresh.orders;
  db.tickets = fresh.tickets;
  persist();
}

module.exports = { db, persist, id, ticketCode, slugify, resetAll };
