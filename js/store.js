// store.js — Persistencia y modelo de datos (localStorage)
// Toda la app lee/escribe el estado a través de este módulo.

const KEY = 'mipeso_v1';

const DEFAULT_STATE = {
  version: 1,
  profile: null, // se completa en el onboarding
  settings: {
    units: 'metric',
    waterGoalGlasses: 8,
    glassMl: 250,
    waterIntervalHours: 2,
    // Horario de comidas (HH:MM). Cada comida tiene una ventana de +-60 min.
    meals: [
      { id: 'desayuno', name: 'Desayuno', time: '08:00', emoji: '🍳' },
      { id: 'media_manana', name: 'Media mañana', time: '11:00', emoji: '🍎' },
      { id: 'almuerzo', name: 'Almuerzo', time: '13:30', emoji: '🍽️' },
      { id: 'merienda', name: 'Merienda', time: '17:00', emoji: '🥜' },
      { id: 'cena', name: 'Cena', time: '20:30', emoji: '🍲' },
    ],
    exerciseGoalMin: 30,
    notificationsEnabled: false,
  },
  logs: {}, // { 'YYYY-MM-DD': { food:[], water:0, exercise:[], weight:null, mealsHit:{} } }
  game: {
    points: 0,
    streak: 0,
    bestStreak: 0,
    lastActiveDate: null,
    badges: [], // ids de logros desbloqueados
  },
  meta: {
    createdAt: null,
  },
};

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    return migrate(parsed);
  } catch (e) {
    console.warn('No se pudo leer el estado, se reinicia:', e);
    return structuredClone(DEFAULT_STATE);
  }
}

function migrate(s) {
  // Mezcla superficial con los valores por defecto para tolerar versiones viejas.
  const merged = structuredClone(DEFAULT_STATE);
  if (s.profile) merged.profile = s.profile;
  if (s.settings) merged.settings = { ...merged.settings, ...s.settings };
  if (s.logs) merged.logs = s.logs;
  if (s.game) merged.game = { ...merged.game, ...s.game };
  if (s.meta) merged.meta = { ...merged.meta, ...s.meta };
  return merged;
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.error('No se pudo guardar:', e);
  }
}

// ---- Helpers de fecha ----
export function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function dateFromKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// ---- API pública ----
export function getState() {
  return state;
}

export function getProfile() {
  return state.profile;
}

export function setProfile(profile) {
  state.profile = profile;
  if (!state.meta.createdAt) state.meta.createdAt = new Date().toISOString();
  persist();
}

export function getSettings() {
  return state.settings;
}

export function setSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  persist();
}

export function getGame() {
  return state.game;
}

export function setGame(patch) {
  state.game = { ...state.game, ...patch };
  persist();
}

// Devuelve (creando si falta) el log de un día.
export function getLog(key = todayKey()) {
  if (!state.logs[key]) {
    state.logs[key] = { food: [], water: 0, exercise: [], weight: null, mealsHit: {} };
  }
  return state.logs[key];
}

export function getAllLogs() {
  return state.logs;
}

export function saveLog(key, log) {
  state.logs[key] = log;
  persist();
}

// Persiste cambios hechos sobre el objeto devuelto por getLog().
export function commit() {
  persist();
}

export function resetAll() {
  state = structuredClone(DEFAULT_STATE);
  persist();
}

export function exportData() {
  return JSON.stringify(state, null, 2);
}

export function importData(json) {
  const parsed = JSON.parse(json);
  state = migrate(parsed);
  persist();
}
