// Datos de demostración para probar la app rápidamente.
import { replaceAll, DEFAULT_TEMPLATE } from './store.js';

function enHoras(h) {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + h);
  return d.toISOString();
}

export function cargarDemo() {
  const pacientes = [
    { id: 'p1', nombre: 'María González', telefono: '+56 9 8765 4321', email: 'maria.gonzalez@example.cl', rut: '12.345.678-9', notas: 'Prefiere horario de mañana.' },
    { id: 'p2', nombre: 'Juan Pérez', telefono: '+56 9 1122 3344', email: 'juanp@example.cl', rut: '', notas: '' },
    { id: 'p3', nombre: 'Camila Rojas', telefono: '+56 9 5566 7788', email: '', rut: '9.876.543-2', notas: 'Control post-operatorio.' },
    { id: 'p4', nombre: 'Diego Silva', telefono: '+56 9 4433 2211', email: 'diego.silva@example.cl', rut: '', notas: '' },
  ];

  const citas = [
    { id: 'c1', pacienteId: 'p1', fechaHora: enHoras(3), profesional: 'Dra. Fuentes', motivo: 'Control general', estado: 'agendada', recordatorioEnviado: false },
    { id: 'c2', pacienteId: 'p2', fechaHora: enHoras(6), profesional: 'Dr. Muñoz', motivo: 'Consulta dental', estado: 'confirmada', recordatorioEnviado: true, recordatorioEnviadoAt: new Date().toISOString() },
    { id: 'c3', pacienteId: 'p3', fechaHora: enHoras(26), profesional: 'Dra. Fuentes', motivo: 'Control post-operatorio', estado: 'agendada', recordatorioEnviado: false },
    { id: 'c4', pacienteId: 'p4', fechaHora: enHoras(50), profesional: 'Klga. Torres', motivo: 'Kinesiología', estado: 'agendada', recordatorioEnviado: false },
    { id: 'c5', pacienteId: 'p1', fechaHora: enHoras(-24), profesional: 'Dra. Fuentes', motivo: 'Examen', estado: 'atendida', recordatorioEnviado: true },
  ];

  replaceAll({
    version: 1,
    config: {
      clinica: 'Centro Médico Los Aromos',
      telefonoClinica: '+56 2 2345 6789',
      codigoPais: '56',
      horasAntes: 24,
      canalPreferido: 'whatsapp',
      plantilla: DEFAULT_TEMPLATE,
    },
    pacientes,
    citas,
  });
}
