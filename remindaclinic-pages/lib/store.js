'use strict';
/* Persistencia 100% en el navegador (localStorage). Version estatica para
 * GitHub Pages del demo demo-remindaclinic/ (que usa un backend Node).
 * Los datos viven solo en el navegador de cada visitante: no hay servidor
 * compartido. Ver README de esta carpeta.
 *
 * Envuelto en un IIFE: los scripts se cargan con <script src> planos (sin
 * type="module"), asi que comparten scope global; el IIFE evita choques de
 * nombres entre lib/store.js, lib/domain.js y lib/reminders.js. */
(function () {

const KEY = 'remindaclinic_db_v1';

function emptyDb() {
  return { professionals: [], appointments: [], reminders: [] };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyDb();
    return { ...emptyDb(), ...JSON.parse(raw) };
  } catch (e) {
    return emptyDb();
  }
}

const db = load();

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch (e) {
    /* almacenamiento lleno o bloqueado: el demo sigue en memoria */
  }
}

function randHex(n) {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function id(prefix) {
  return `${prefix}_${randHex(6)}`;
}

// Codigo corto humano-legible para identificar una cita.
function bookingCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin caracteres ambiguos
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += alphabet[bytes[i] % alphabet.length];
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

window.Store = {
  get db() { return db; },
  persist,
  id,
  bookingCode,
  slugify,
  resetAll,
};

})();
