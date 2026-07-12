'use strict';

// Reinicia los datos de la demo y crea un evento de ejemplo ya publicado,
// util para partir de un estado conocido al mostrar el demo.
const { resetAll } = require('./store');
const domain = require('./domain');

resetAll();

const event = domain.createEvent({
  title: 'DevChile Summit 2026',
  description: 'Conferencia de un dia sobre desarrollo de software, con charlas, talleres y networking.',
  type: 'in_person',
  venueName: 'Centro de Eventos Vino Bello, Santiago',
  startsAt: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
  ticketTypes: [
    { name: 'General', price: 15000, stock: 100 },
    { name: 'Estudiante', price: 8000, stock: 40 },
    { name: 'VIP (con workshop)', price: 35000, stock: 15 },
  ],
  promoCodes: [{ code: 'EARLYBIRD', percentOff: 20, maxUses: 30 }],
});
domain.publishEvent(event.id);

console.log(`Datos reiniciados. Evento de ejemplo publicado: /e/${event.slug}`);
