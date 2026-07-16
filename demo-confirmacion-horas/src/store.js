'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

function emptyDb() {
  return {
    simNow: 0,
    lastSyncAt: null,
    folioSeq: 1000,
    pacientes: [],
    maestro: [],
    citas: [],
    mensajes: [],
  };
}

function load() {
  if (!fs.existsSync(DB_PATH)) return emptyDb();
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    if (!raw.trim()) return emptyDb();
    return Object.assign(emptyDb(), JSON.parse(raw));
  } catch (err) {
    console.error('No se pudo leer data/db.json, se parte de una base vacia:', err.message);
    return emptyDb();
  }
}

const db = load();

function persist() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
}

function id(prefix) {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

module.exports = { db, persist, id };
