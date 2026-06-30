// reminders.js — Horarios de comidas/agua, notificaciones y alarmas en-app.

import { getSettings, setSettings, getLog, todayKey } from './store.js';

let waterTimer = null;
let mealTimers = [];
let onAlarm = () => {};

export function setAlarmHandler(fn) { onAlarm = fn; }

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

// Muestra una notificación (vía service worker si está activo) o cae en alarma en-app.
export async function notify(title, body) {
  const canNotify = notificationsSupported() && Notification.permission === 'granted';
  if (canNotify) {
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      if (reg) {
        reg.showNotification(title, { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: title });
        return;
      }
      new Notification(title, { body, icon: 'icons/icon-192.png' });
      return;
    } catch {
      /* cae a alarma en-app */
    }
  }
  onAlarm(title, body); // toast dentro de la app
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
        notify(`${meal.emoji} Hora de ${meal.name}`, 'Registra tu comida para ganar puntos por comer a tiempo.');
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
          notify('💧 Hora de tomar agua', `Llevas ${Math.round(log.water / settings.glassMl)} de ${settings.waterGoalGlasses} vasos. ¡Sigue así!`);
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
