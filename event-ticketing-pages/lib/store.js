'use strict';
/* Persistencia 100% en el navegador (localStorage). Version estatica para
 * GitHub Pages del demo de demo-event-ticketing/ (que usa un backend Node).
 * Los datos viven solo en el navegador de cada visitante: no hay servidor
 * compartido, asi que "organizador" y "comprador" solo se ven entre si si
 * usan el mismo navegador/dispositivo. Ver README de esta carpeta.
 *
 * Envuelto en un IIFE: estos scripts se cargan con <script src> planos
 * (sin type="module"), asi que todos comparten un mismo scope lexico
 * global. Sin el IIFE, un `const db` aca choca con el `const db` del
 * destructuring en domain.js. */
(function () {

const KEY = 'ticketing_demo_db_v1';

function emptyDb() {
  return { events: [], orders: [], tickets: [] };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyDb();
    const parsed = JSON.parse(raw);
    return { ...emptyDb(), ...parsed };
  } catch (e) {
    return emptyDb();
  }
}

const db = load();

function persist() {
  localStorage.setItem(KEY, JSON.stringify(db));
}

function randHex(n) {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function id(prefix) {
  return `${prefix}_${randHex(6)}`;
}

function ticketCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < 10; i++) {
    out += alphabet[bytes[i] % alphabet.length];
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
  db.events = [];
  db.orders = [];
  db.tickets = [];
  persist();
}

window.Store = { db, persist, id, ticketCode, slugify, resetAll };

})();
