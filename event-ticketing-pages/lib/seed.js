'use strict';
/* Si el navegador del visitante no tiene datos todavia, siembra un evento
 * de ejemplo publicado para que el sitio no se vea vacio en la primera
 * visita. Se ejecuta una sola vez (persistido en localStorage). */
(function seedIfEmpty() {
  if (window.Store.db.events.length > 0) return;
  const event = window.Domain.createEvent({
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
  window.Domain.publishEvent(event.id);
})();
