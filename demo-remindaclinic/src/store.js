'use strict';

// Persistencia muy simple en un archivo JSON (data/db.json).
// Sin dependencias externas: todo el "estado" de la clinica vive aqui.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

function emptyDb() {
  return { professionals: [], appointments: [], reminders: [] };
}

function load() {
  if (!fs.existsSync(DB_PATH)) {
    return emptyDb();
  }
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    if (!raw.trim()) return emptyDb();
    const parsed = JSON.parse(raw);
    // Tolerancia ante bases antiguas / incompletas.
    return Object.assign(emptyDb(), parsed);
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

// Codigo corto humano-legible para identificar una cita (lo que se manda por SMS).
function bookingCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin caracteres ambiguos
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += alphabet[crypto.randomInt(alphabet.length)];
    if (i === 2) out += '-';
  }
  return out;
}

function slugify(text) {
  return String(text)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60) || id('p');
}

function resetAll() {
  const fresh = emptyDb();
  db.professionals = fresh.professionals;
  db.appointments = fresh.appointments;
  db.reminders = fresh.reminders;
  persist();
}

module.exports = {
  get db() {
    return db;
  },
  persist,
  id,
  bookingCode,
  slugify,
  resetAll,
};
