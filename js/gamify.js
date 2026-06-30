// gamify.js — Puntos, niveles, rachas y logros.

import { getGame, setGame, getAllLogs, getLog, todayKey, dateFromKey } from './store.js';

// Puntos por acción
export const POINTS = {
  logMeal: 10,        // registrar una comida
  mealOnTime: 15,     // comida dentro de su ventana horaria
  waterGlass: 5,      // cada vaso de agua
  waterGoal: 25,      // alcanzar la meta diaria de agua
  logExercise: 20,    // registrar ejercicio
  exerciseGoal: 30,   // cumplir minutos de ejercicio del día
  logWeight: 15,      // pesarse
  underTarget: 40,    // terminar el día dentro del objetivo calórico
};

// Niveles: umbral acumulado de puntos -> título
export const LEVELS = [
  { min: 0, title: 'Principiante', emoji: '🌱' },
  { min: 200, title: 'Constante', emoji: '🌿' },
  { min: 500, title: 'Enfocado', emoji: '💪' },
  { min: 1000, title: 'Imparable', emoji: '🔥' },
  { min: 2000, title: 'Atleta', emoji: '🏅' },
  { min: 3500, title: 'Maestro', emoji: '👑' },
  { min: 5500, title: 'Leyenda', emoji: '🏆' },
];

export const BADGES = [
  { id: 'first_meal', name: 'Primera comida', emoji: '🍽️', desc: 'Registraste tu primera comida' },
  { id: 'first_water', name: 'Hidratado', emoji: '💧', desc: 'Tomaste tu primer vaso de agua' },
  { id: 'first_exercise', name: 'En movimiento', emoji: '🏃', desc: 'Registraste tu primer ejercicio' },
  { id: 'first_weight', name: 'Punto de partida', emoji: '⚖️', desc: 'Registraste tu peso' },
  { id: 'water_goal', name: 'Meta de agua', emoji: '🌊', desc: 'Cumpliste la meta diaria de agua' },
  { id: 'streak_3', name: 'Racha de 3', emoji: '⚡', desc: '3 días seguidos activo' },
  { id: 'streak_7', name: 'Semana perfecta', emoji: '🗓️', desc: '7 días seguidos activo' },
  { id: 'streak_30', name: 'Un mes', emoji: '🌟', desc: '30 días seguidos activo' },
  { id: 'lost_1kg', name: 'Primer kilo', emoji: '🎉', desc: 'Bajaste tu primer kilo' },
  { id: 'lost_5kg', name: 'Cinco kilos', emoji: '🚀', desc: 'Bajaste 5 kilos' },
  { id: 'points_1000', name: 'Mil puntos', emoji: '💎', desc: 'Acumulaste 1000 puntos' },
];

export function levelFor(points) {
  let current = LEVELS[0];
  let next = null;
  for (let i = 0; i < LEVELS.length; i++) {
    if (points >= LEVELS[i].min) {
      current = LEVELS[i];
      next = LEVELS[i + 1] || null;
    }
  }
  const progress = next
    ? Math.min(1, (points - current.min) / (next.min - current.min))
    : 1;
  return { current, next, progress };
}

// Suma puntos y devuelve el total nuevo.
export function addPoints(amount) {
  const game = getGame();
  const points = game.points + amount;
  setGame({ points });
  return points;
}

// Marca un logro como desbloqueado (si no lo estaba). Devuelve el badge si es nuevo.
export function unlock(badgeId) {
  const game = getGame();
  if (game.badges.includes(badgeId)) return null;
  const badge = BADGES.find((b) => b.id === badgeId);
  if (!badge) return null;
  setGame({ badges: [...game.badges, badgeId] });
  return badge;
}

// Actualiza la racha de días activos. Un día "cuenta" si tuvo alguna actividad.
// Devuelve { streak, newBadges:[] }.
export function updateStreak() {
  const game = getGame();
  const today = todayKey();
  if (game.lastActiveDate === today) {
    return { streak: game.streak, newBadges: [] };
  }

  let streak;
  if (game.lastActiveDate) {
    const last = dateFromKey(game.lastActiveDate);
    const now = dateFromKey(today);
    const diffDays = Math.round((now - last) / 86400000);
    streak = diffDays === 1 ? game.streak + 1 : 1;
  } else {
    streak = 1;
  }

  const bestStreak = Math.max(streak, game.bestStreak || 0);
  setGame({ streak, bestStreak, lastActiveDate: today });

  const newBadges = [];
  if (streak >= 3) { const b = unlock('streak_3'); if (b) newBadges.push(b); }
  if (streak >= 7) { const b = unlock('streak_7'); if (b) newBadges.push(b); }
  if (streak >= 30) { const b = unlock('streak_30'); if (b) newBadges.push(b); }
  return { streak, newBadges };
}

// Revisa logros relacionados con pérdida de peso y puntos. Devuelve badges nuevos.
export function checkProgressBadges(profile) {
  const newBadges = [];
  const game = getGame();

  if (game.points >= 1000) { const b = unlock('points_1000'); if (b) newBadges.push(b); }

  // Pérdida de peso respecto al peso inicial del perfil.
  const weights = weightSeries();
  if (profile && weights.length) {
    const start = profile.startWeight ?? weights[0].kg;
    const current = weights[weights.length - 1].kg;
    const lost = start - current;
    if (lost >= 1) { const b = unlock('lost_1kg'); if (b) newBadges.push(b); }
    if (lost >= 5) { const b = unlock('lost_5kg'); if (b) newBadges.push(b); }
  }
  return newBadges;
}

// Serie de pesos ordenada por fecha: [{ date, kg }]
export function weightSeries() {
  const logs = getAllLogs();
  return Object.keys(logs)
    .filter((k) => logs[k].weight != null)
    .sort()
    .map((k) => ({ date: k, kg: logs[k].weight }));
}
