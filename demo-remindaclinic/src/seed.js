'use strict';

// Puebla la base con datos de ejemplo: profesionales, citas repartidas en los
// proximos dias y, por lo tanto, recordatorios (algunos ya vencidos -> se
// enviaran en el primer "tick" del servidor, otros pendientes).
//
//   node src/seed.js      (o: npm run seed:reset)

const store = require('./store');
const domain = require('./domain');

function pad(n) {
  return String(n).padStart(2, '0');
}

function dateOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const PROFESSIONALS = [
  {
    name: 'Dra. Carolina Rojas', specialty: 'Medicina General',
    color: '#2563eb', slotMinutes: 30, days: [1, 2, 3, 4, 5],
    blocks: [['09:00', '13:00'], ['15:00', '18:00']],
  },
  {
    name: 'Dr. Matias Fuentes', specialty: 'Nutricion',
    color: '#16a34a', slotMinutes: 45, days: [1, 3, 5],
    blocks: [['10:00', '13:00']],
  },
  {
    name: 'Dra. Valentina Soto', specialty: 'Dermatologia',
    color: '#db2777', slotMinutes: 20, days: [2, 4, 6],
    blocks: [['09:00', '12:00'], ['16:00', '19:00']],
  },
];

const PATIENTS = [
  { patientName: 'Juan Perez', patientPhone: '+56912345678', patientEmail: 'juan.perez@example.cl', channel: 'sms', reason: 'Control anual' },
  { patientName: 'Maria Gonzalez', patientPhone: '+56987654321', patientEmail: 'maria.g@example.cl', channel: 'whatsapp', reason: 'Dolor de cabeza persistente' },
  { patientName: 'Pedro Munoz', patientPhone: '+56955512345', patientEmail: 'pedro.munoz@example.cl', channel: 'email', reason: 'Revision de examenes' },
  { patientName: 'Camila Torres', patientPhone: '+56944498765', patientEmail: 'camila.torres@example.cl', channel: 'sms', reason: 'Plan de alimentacion' },
  { patientName: 'Diego Silva', patientPhone: '+56933321654', patientEmail: '', channel: 'whatsapp', reason: 'Lunar sospechoso' },
  { patientName: 'Fernanda Lopez', patientPhone: '+56922210987', patientEmail: 'fer.lopez@example.cl', channel: 'sms', reason: 'Primera consulta' },
  { patientName: 'Ignacio Vera', patientPhone: '+56911102938', patientEmail: 'ignacio.vera@example.cl', channel: 'email', reason: 'Seguimiento tratamiento' },
  { patientName: 'Antonia Reyes', patientPhone: '+56966677889', patientEmail: 'antonia.reyes@example.cl', channel: 'whatsapp', reason: 'Control de rutina' },
];

function run() {
  store.resetAll();

  const profs = PROFESSIONALS.map((p) => domain.createProfessional(p));
  console.log(`Profesionales creados: ${profs.length}`);

  let patientIx = 0;
  let created = 0;
  const targetPerProf = 3;

  for (const prof of profs) {
    let booked = 0;
    // Busca huecos en los proximos 7 dias hasta completar la cuota.
    for (let offset = 0; offset <= 7 && booked < targetPerProf; offset++) {
      const date = dateOffset(offset);
      const grid = domain.slotsFor(prof.id, date);
      const free = grid.slots.filter((s) => s.available);
      // Toma horas alternadas para que la agenda no quede toda pegada.
      for (let i = 0; i < free.length && booked < targetPerProf; i += 2) {
        const patient = PATIENTS[patientIx % PATIENTS.length];
        patientIx += 1;
        try {
          const appt = domain.createAppointment({
            professionalId: prof.id,
            date,
            time: free[i].time,
            ...patient,
          });
          created += 1;
          booked += 1;
          // Confirma algunas citas para variar los estados de la agenda.
          if (created % 3 === 0) domain.confirmAppointment(appt.id);
        } catch (err) {
          // Hueco tomado en una carrera improbable: seguimos.
        }
      }
    }
  }

  console.log(`Citas creadas: ${created}`);
  console.log(`Recordatorios programados: ${store.db.reminders.length}`);
  console.log('Listo. Arranca el servidor con: npm start');
}

if (require.main === module) {
  run();
}

module.exports = { run };
