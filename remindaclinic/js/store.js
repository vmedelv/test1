// Persistencia y modelo de datos de RemindaClinic.
// Todo se guarda en localStorage bajo una sola clave.

const KEY = 'remindaclinic.v1';

const DEFAULT_TEMPLATE =
  'Hola {nombre}, le recordamos su cita en {clinica} el {fecha} a las {hora}' +
  ' con {profesional}. Motivo: {motivo}. Para confirmar responda SÍ, o llame' +
  ' al {telefonoClinica} para reagendar.';

const DEFAULTS = {
  version: 1,
  config: {
    clinica: 'Mi Clínica',
    telefonoClinica: '+56 2 2345 6789',
    codigoPais: '56', // Chile por defecto
    horasAntes: 24,
    canalPreferido: 'whatsapp', // whatsapp | sms | email
    plantilla: DEFAULT_TEMPLATE,
  },
  pacientes: [],
  citas: [],
};

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const data = JSON.parse(raw);
    // Merge defensivo por si el esquema creció.
    return {
      ...structuredClone(DEFAULTS),
      ...data,
      config: { ...DEFAULTS.config, ...(data.config || {}) },
      pacientes: data.pacientes || [],
      citas: data.citas || [],
    };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

function persist() {
  localStorage.setItem(KEY, JSON.stringify(state));
}

function uid() {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  );
}

// --- Config ---
export function getConfig() {
  return { ...state.config };
}

export function updateConfig(patch) {
  state.config = { ...state.config, ...patch };
  persist();
  return getConfig();
}

// --- Pacientes ---
export function getPacientes() {
  return [...state.pacientes].sort((a, b) =>
    a.nombre.localeCompare(b.nombre, 'es')
  );
}

export function getPaciente(id) {
  return state.pacientes.find((p) => p.id === id) || null;
}

export function savePaciente(p) {
  if (p.id) {
    const i = state.pacientes.findIndex((x) => x.id === p.id);
    if (i >= 0) state.pacientes[i] = { ...state.pacientes[i], ...p };
  } else {
    p = { ...p, id: uid(), createdAt: new Date().toISOString() };
    state.pacientes.push(p);
  }
  persist();
  return p;
}

export function deletePaciente(id) {
  state.pacientes = state.pacientes.filter((p) => p.id !== id);
  // Las citas del paciente quedan huérfanas -> se eliminan también.
  state.citas = state.citas.filter((c) => c.pacienteId !== id);
  persist();
}

// --- Citas ---
export function getCitas() {
  return [...state.citas].sort((a, b) =>
    a.fechaHora.localeCompare(b.fechaHora)
  );
}

export function getCita(id) {
  return state.citas.find((c) => c.id === id) || null;
}

export function saveCita(c) {
  if (c.id) {
    const i = state.citas.findIndex((x) => x.id === c.id);
    if (i >= 0) state.citas[i] = { ...state.citas[i], ...c };
  } else {
    c = {
      estado: 'agendada',
      recordatorioEnviado: false,
      ...c,
      id: uid(),
      createdAt: new Date().toISOString(),
    };
    state.citas.push(c);
  }
  persist();
  return c;
}

export function deleteCita(id) {
  state.citas = state.citas.filter((c) => c.id !== id);
  persist();
}

export function setEstadoCita(id, estado) {
  const c = getCita(id);
  if (c) {
    c.estado = estado;
    persist();
  }
  return c;
}

export function marcarRecordada(id, enviado = true) {
  const c = getCita(id);
  if (c) {
    c.recordatorioEnviado = enviado;
    c.recordatorioEnviadoAt = enviado ? new Date().toISOString() : null;
    persist();
  }
  return c;
}

// --- Datos (export / import / reset) ---
export function exportData() {
  return JSON.stringify(state, null, 2);
}

export function importData(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  if (!data || typeof data !== 'object') throw new Error('JSON inválido');
  state = {
    ...structuredClone(DEFAULTS),
    ...data,
    config: { ...DEFAULTS.config, ...(data.config || {}) },
    pacientes: data.pacientes || [],
    citas: data.citas || [],
  };
  persist();
}

export function replaceAll(next) {
  state = next;
  persist();
}

export function resetAll() {
  state = structuredClone(DEFAULTS);
  persist();
}

export function currentState() {
  return state;
}

export { DEFAULT_TEMPLATE };
