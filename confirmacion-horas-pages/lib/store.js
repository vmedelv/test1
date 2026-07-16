'use strict';

// Persistencia en localStorage — versión 100% cliente para GitHub Pages.
// Misma interfaz que src/store.js de la versión Node: { db, persist, id }.
(function () {
  const KEY = 'demo-confirmacion-horas';

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

  let db;
  try {
    db = Object.assign(emptyDb(), JSON.parse(localStorage.getItem(KEY) || 'null') || {});
  } catch (e) {
    console.error('No se pudo leer localStorage, se parte de una base vacía:', e.message);
    db = emptyDb();
  }

  let seq = 0;
  window.Store = {
    db,
    persist() {
      localStorage.setItem(KEY, JSON.stringify(db));
    },
    id(prefix) {
      seq += 1;
      return `${prefix}_${Date.now().toString(36)}${seq.toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    },
  };
})();
