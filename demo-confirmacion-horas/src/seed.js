'use strict';

// Reinicia data/db.json y reproduce el escenario de demostración
// (~30 horas simuladas de operación). Ver api.seedDemo() en core.js.

const store = require('./store');
const { createDomain } = require('./core');

const domain = createDomain(store);
const estado = domain.seedDemo();

console.log('Escenario de demo cargado.');
console.log(`Reloj simulado: ${new Date(estado.simNow).toISOString()}`);
console.log(`Pacientes: ${store.db.pacientes.length} — Citas: ${store.db.citas.length} — Mensajes: ${store.db.mensajes.length}`);
