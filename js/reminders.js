// reminders.js — Horarios de comidas/agua, notificaciones y alarmas en-app.

import { getSettings, setSettings, getLog, todayKey } from './store.js';

let waterTimer = null;
let mealTimers = [];
let onAlarm = () => {};
let onReminder = () => {};

export function setAlarmHandler(fn) { onAlarm = fn; }

// Handler que reacciona dentro de la app cuando se dispara un recordatorio
// programado (por ejemplo, para que la mascota hable). type: 'meal' | 'water'.
export function setReminderHandler(fn) { onReminder = fn; }

export function notificationsSupported() {
  return 'Notification' in window;
}

export async function requestNotifications() {
  if (!notificationsSupported()) return 'unsupported';
  try {
    const perm = await Notification.requestPermission();
    setSettings({ notificationsEnabled: perm === 'granted' });
    return perm;
  } catch {
    return 'denied';
  }
}

// Intenta mostrar una notificación del sistema. Devuelve true si lo logró.
async function showSystem(title, body) {
  if (!(notificationsSupported() && Notification.permission === 'granted')) return false;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      reg.showNotification(title, { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: title });
      return true;
    }
    new Notification(title, { body, icon: 'icons/icon-192.png' });
    return true;
  } catch {
    return false;
  }
}

// Notificación puntual (botón de prueba): sistema o, si no, alarma en-app.
export async function notify(title, body) {
  const ok = await showSystem(title, body);
  if (!ok) onAlarm(title, body);
}

// Dispara un recordatorio programado: reacciona dentro de la app (mascota)
// y además intenta una notificación del sistema (para PWA en segundo plano).
export async function fireReminder(type, title, body) {
  onReminder(type, title, body);
  await showSystem(title, body);
}

function parseTime(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

// Ventana de una comida: ±60 min respecto a su hora programada.
export function mealWindow(meal) {
  const center = parseTime(meal.time);
  return {
    start: new Date(center.getTime() - 60 * 60000),
    end: new Date(center.getTime() + 60 * 60000),
    center,
  };
}

export function isWithinMealWindow(meal, when = new Date()) {
  const { start, end } = mealWindow(meal);
  return when >= start && when <= end;
}

// Próxima comida pendiente del día (para mostrar en Inicio).
export function nextMeal() {
  const settings = getSettings();
  const log = getLog();
  const now = new Date();
  const pending = settings.meals
    .filter((m) => !log.mealsHit[m.id])
    .map((m) => ({ meal: m, center: parseTime(m.time) }))
    .filter((x) => x.center >= now)
    .sort((a, b) => a.center - b.center);
  return pending[0]?.meal || null;
}

// (Re)programa los recordatorios para el resto del día actual.
export function scheduleReminders() {
  clearTimers();
  const settings = getSettings();
  const now = new Date();

  // Comidas
  settings.meals.forEach((meal) => {
    const t = parseTime(meal.time);
    const delay = t - now;
    if (delay > 0) {
      const id = setTimeout(() => {
        fireReminder('meal', `${meal.emoji} Hora de ${meal.name}`, 'Registra tu comida para ganar puntos por comer a tiempo.');
      }, delay);
      mealTimers.push(id);
    }
  });

  // Agua: cada N horas dentro de horario diurno (08:00–22:00)
  const intervalMs = (settings.waterIntervalHours || 2) * 3600000;
  function scheduleNextWater() {
    const h = new Date().getHours();
    const delay = h >= 8 && h < 22 ? intervalMs : intervalMs; // siempre programa; el aviso decide
    waterTimer = setTimeout(() => {
      const hour = new Date().getHours();
      if (hour >= 8 && hour < 22) {
        const log = getLog();
        const goalMl = settings.waterGoalGlasses * settings.glassMl;
        if (log.water < goalMl) {
          fireReminder('water', '💧 Hora de tomar agua', `Llevas ${Math.round(log.water / settings.glassMl)} de ${settings.waterGoalGlasses} vasos. ¡Sigue así!`);
        }
      }
      scheduleNextWater();
    }, delay);
  }
  scheduleNextWater();
}

export function clearTimers() {
  mealTimers.forEach(clearTimeout);
  mealTimers = [];
  if (waterTimer) { clearTimeout(waterTimer); waterTimer = null; }
}
