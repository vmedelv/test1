// app.js — Arranque, router y vistas de la aplicación.

import * as store from './store.js';
import * as calc from './calc.js';
import * as game from './gamify.js';
import * as charts from './charts.js';
import * as reminders from './reminders.js';
import { FOODS } from './foods.js';
import { EXERCISES } from './exercises.js';
import { h, clear, toast, celebrate, confetti, modal, randomMotivation } from './ui.js';

const app = document.getElementById('app');
const nav = document.getElementById('nav');

let currentTab = 'inicio';

// ---------- Utilidades ----------
function award(points, msg, emoji) {
  game.addPoints(points);
  toast(msg, { points, emoji });
}

function activeDay() {
  // Marca el día como activo y actualiza racha (una vez al hacer la primera acción).
  const { newBadges } = game.updateStreak();
  newBadges.forEach((b) => setTimeout(() => celebrate(b), 400));
}

function checkBadges() {
  const profile = store.getProfile();
  const badges = game.checkProgressBadges(profile);
  badges.forEach((b, i) => setTimeout(() => celebrate(b), 400 + i * 300));
}

function waterGoalMl() {
  const s = store.getSettings();
  return s.waterGoalGlasses * s.glassMl;
}

function consumedCalories(log = store.getLog()) {
  return log.food.reduce((sum, f) => sum + f.kcal, 0);
}

function burnedCalories(log = store.getLog()) {
  return log.exercise.reduce((sum, e) => sum + (e.kcal || 0), 0);
}

function exerciseMinutes(log = store.getLog()) {
  return log.exercise.reduce((sum, e) => sum + (e.minutes || 0), 0);
}

// ---------- Arranque ----------
function start() {
  reminders.setAlarmHandler((title, body) => toast(`${title} — ${body}`, { emoji: '🔔' }));
  if (!store.getProfile()) {
    renderOnboarding();
  } else {
    renderShell();
    reminders.scheduleReminders();
  }
}

// ====================================================================
// ONBOARDING
// ====================================================================
function renderOnboarding() {
  nav.style.display = 'none';
  clear(app);

  const form = { sex: 'h', age: 30, height: 170, weight: 80, goal: 70, activity: 'ligero', pace: 0.5 };

  const view = h('div', { class: 'onboarding' }, [
    h('div', { class: 'ob-hero' }, [
      h('div', { class: 'ob-logo' }, '🏆'),
      h('h1', {}, 'Mi Reto Saludable'),
      h('p', { class: 'muted' }, 'Cuenta calorías, gana puntos y baja de peso como un juego.'),
    ]),
    field('Sexo', segmented([
      { v: 'h', label: '♂ Hombre' }, { v: 'm', label: '♀ Mujer' },
    ], form.sex, (v) => form.sex = v)),
    numberField('Edad', form.age, 'años', (v) => form.age = v),
    numberField('Altura', form.height, 'cm', (v) => form.height = v),
    numberField('Peso actual', form.weight, 'kg', (v) => form.weight = v),
    numberField('Peso meta', form.goal, 'kg', (v) => form.goal = v),
    field('Nivel de actividad', selectField(
      calc.ACTIVITY_OPTIONS.map((o) => ({ v: o.id, label: `${o.label} — ${o.desc}` })),
      form.activity, (v) => form.activity = v)),
    field('Ritmo de pérdida', selectField(
      calc.PACE_OPTIONS.map((o) => ({ v: o.id, label: `${o.label} — ${o.desc}` })),
      form.pace, (v) => form.pace = parseFloat(v))),
    h('button', { class: 'btn primary big', onClick: () => finishOnboarding(form) }, 'Empezar 🚀'),
    h('p', { class: 'muted tiny center' }, 'Tus datos se guardan solo en tu teléfono.'),
  ]);
  app.appendChild(view);
}

function finishOnboarding(form) {
  if (!form.age || !form.height || !form.weight || !form.goal) {
    toast('Completa todos los campos', { emoji: '⚠️' });
    return;
  }
  const profile = {
    sex: form.sex,
    age: Number(form.age),
    heightCm: Number(form.height),
    weightKg: Number(form.weight),
    startWeight: Number(form.weight),
    goalKg: Number(form.goal),
    activity: form.activity,
    pace: form.pace,
  };
  store.setProfile(profile);
  // Registra el peso inicial como primer punto de progreso.
  const log = store.getLog();
  log.weight = profile.weightKg;
  store.commit();
  renderShell();
  reminders.scheduleReminders();
  setTimeout(() => {
    confetti();
    toast('¡Bienvenido! Tu meta diaria está lista', { emoji: '🎯' });
  }, 300);
}

// ====================================================================
// SHELL + NAV
// ====================================================================
const TABS = [
  { id: 'inicio', label: 'Inicio', icon: '🏠' },
  { id: 'comer', label: 'Comer', icon: '🍽️' },
  { id: 'agua', label: 'Agua', icon: '💧' },
  { id: 'ejercicio', label: 'Ejercicio', icon: '🏃' },
  { id: 'progreso', label: 'Progreso', icon: '📈' },
];

function renderShell() {
  nav.style.display = 'flex';
  clear(nav);
  TABS.forEach((t) => {
    nav.appendChild(h('button', {
      class: 'nav-btn' + (t.id === currentTab ? ' active' : ''),
      onClick: () => go(t.id),
    }, [
      h('span', { class: 'nav-icon' }, t.icon),
      h('span', { class: 'nav-label' }, t.label),
    ]));
  });
  renderTab();
}

function go(tab) {
  currentTab = tab;
  [...nav.children].forEach((c, i) => c.classList.toggle('active', TABS[i].id === tab));
  renderTab();
  app.scrollTop = 0;
  window.scrollTo(0, 0);
}

function renderTab() {
  clear(app);
  const views = {
    inicio: renderHome,
    comer: renderEat,
    agua: renderWater,
    ejercicio: renderExercise,
    progreso: renderProgress,
    ajustes: renderSettings,
  };
  (views[currentTab] || renderHome)();
}

// ====================================================================
// INICIO (Dashboard)
// ====================================================================
function renderHome() {
  const g = store.getGame();
  const profile = store.getProfile();
  const log = store.getLog();
  const target = calc.calorieTarget(profile);
  const consumed = consumedCalories(log);
  const burned = burnedCalories(log);
  const net = consumed - burned;
  const lvl = game.levelFor(g.points);

  const view = h('div', { class: 'view' });

  // Cabecera con saludo + ajustes
  view.appendChild(h('div', { class: 'home-head' }, [
    h('div', {}, [
      h('div', { class: 'greeting' }, saludo()),
      h('div', { class: 'muted' }, randomMotivation()),
    ]),
    h('button', { class: 'icon-btn', onClick: () => { currentTab = 'ajustes'; renderTab(); } }, '⚙️'),
  ]));

  // Tarjeta de nivel / puntos / racha
  view.appendChild(h('div', { class: 'card level-card' }, [
    h('div', { class: 'level-top' }, [
      h('span', { class: 'level-emoji' }, lvl.current.emoji),
      h('div', {}, [
        h('div', { class: 'level-title' }, `Nivel: ${lvl.current.title}`),
        h('div', { class: 'muted tiny' }, lvl.next ? `${g.points} / ${lvl.next.min} pts para ${lvl.next.title}` : `${g.points} pts · ¡máximo nivel!`),
      ]),
      h('div', { class: 'streak-pill' }, `🔥 ${g.streak}`),
    ]),
    progressBar(lvl.progress),
  ]));

  // Anillo de calorías
  const remaining = target - net;
  view.appendChild(h('div', { class: 'card center-card' }, [
    charts.ring(net, target, {
      label: `${Math.max(0, remaining)}`,
      sub: remaining >= 0 ? 'kcal restantes' : `${-remaining} de más`,
    }),
    h('div', { class: 'ring-legend' }, [
      legend('Meta', `${target}`, 'var(--muted)'),
      legend('Comido', `${consumed}`, 'var(--accent)'),
      legend('Quemado', `${burned}`, 'var(--green)'),
    ]),
  ]));

  // Resumen rápido del día
  const s = store.getSettings();
  const glasses = Math.round(log.water / s.glassMl);
  view.appendChild(h('div', { class: 'quick-grid' }, [
    quickStat('💧', `${glasses}/${s.waterGoalGlasses}`, 'vasos', () => go('agua')),
    quickStat('🏃', `${exerciseMinutes(log)}`, 'min activo', () => go('ejercicio')),
    quickStat('🍽️', `${log.food.length}`, 'comidas', () => go('comer')),
    quickStat('⚖️', log.weight ? `${log.weight}` : '—', 'peso kg', () => go('progreso')),
  ]));

  // Próxima comida / recordatorio
  const next = reminders.nextMeal();
  if (next) {
    view.appendChild(h('div', { class: 'card reminder-card' }, [
      h('span', { class: 'big-emoji' }, next.emoji),
      h('div', {}, [
        h('div', { class: 'bold' }, `Próxima comida: ${next.name}`),
        h('div', { class: 'muted tiny' }, `Programada para las ${next.time}`),
      ]),
    ]));
  }

  // Reto diario
  view.appendChild(dailyChallengeCard(log, target, net));

  // Logros recientes
  view.appendChild(badgesStrip(g.badges));

  app.appendChild(view);
}

function dailyChallengeCard(log, target, net) {
  const s = store.getSettings();
  const tasks = [
    { done: log.food.length > 0, text: 'Registrar una comida' },
    { done: log.water >= waterGoalMl(), text: `Tomar ${s.waterGoalGlasses} vasos de agua` },
    { done: exerciseMinutes(log) >= s.exerciseGoalMin, text: `${s.exerciseGoalMin} min de ejercicio` },
    { done: net <= target && log.food.length > 0, text: 'Quedar dentro de la meta de calorías' },
  ];
  const done = tasks.filter((t) => t.done).length;
  return h('div', { class: 'card' }, [
    h('div', { class: 'card-title' }, `🎯 Reto del día (${done}/${tasks.length})`),
    h('div', { class: 'checklist' }, tasks.map((t) =>
      h('div', { class: 'check-item' + (t.done ? ' done' : '') }, [
        h('span', { class: 'check-box' }, t.done ? '✓' : ''),
        h('span', {}, t.text),
      ]))),
  ]);
}

function badgesStrip(unlocked) {
  return h('div', { class: 'card' }, [
    h('div', { class: 'card-title' }, '🏅 Logros'),
    h('div', { class: 'badges-strip' }, game.BADGES.map((b) => {
      const got = unlocked.includes(b.id);
      return h('div', { class: 'badge-chip' + (got ? '' : ' locked'), title: b.desc }, [
        h('span', { class: 'badge-emoji' }, got ? b.emoji : '🔒'),
        h('span', { class: 'badge-chip-name' }, b.name),
      ]);
    })),
  ]);
}

// ====================================================================
// COMER (Calorías)
// ====================================================================
function renderEat() {
  const profile = store.getProfile();
  const log = store.getLog();
  const target = calc.calorieTarget(profile);
  const consumed = consumedCalories(log);
  const view = h('div', { class: 'view' });

  view.appendChild(pageTitle('🍽️ Comer', `${consumed} / ${target} kcal hoy`));
  view.appendChild(h('div', { class: 'card' }, progressBar(target ? consumed / target : 0, consumed > target ? 'var(--danger)' : 'var(--accent)')));

  // Botón añadir
  view.appendChild(h('button', { class: 'btn primary', onClick: () => openAddFood() }, '＋ Agregar comida'));

  // Lista de comidas registradas hoy, agrupadas por momento
  const s = store.getSettings();
  const groups = {};
  s.meals.forEach((m) => groups[m.id] = []);
  groups['otro'] = [];
  log.food.forEach((f, idx) => {
    (groups[f.mealId] || groups['otro']).push({ ...f, idx });
  });

  const labelFor = (id) => s.meals.find((m) => m.id === id)?.name || 'Otro';
  const emojiFor = (id) => s.meals.find((m) => m.id === id)?.emoji || '🍴';

  Object.keys(groups).forEach((mealId) => {
    const items = groups[mealId];
    if (!items.length) return;
    const sub = items.reduce((sum, f) => sum + f.kcal, 0);
    view.appendChild(h('div', { class: 'card' }, [
      h('div', { class: 'meal-head' }, [
        h('span', {}, `${emojiFor(mealId)} ${labelFor(mealId)}`),
        h('span', { class: 'muted' }, `${sub} kcal`),
      ]),
      ...items.map((f) => h('div', { class: 'food-row' }, [
        h('div', {}, [
          h('div', {}, f.name),
          h('div', { class: 'muted tiny' }, f.portion || ''),
        ]),
        h('div', { class: 'food-right' }, [
          h('span', { class: 'kcal' }, `${f.kcal}`),
          h('button', { class: 'del-btn', onClick: () => removeFood(f.idx) }, '✕'),
        ]),
      ])),
    ]));
  });

  if (!log.food.length) {
    view.appendChild(emptyState('🍎', 'Aún no registras comidas hoy', 'Toca "Agregar comida" para empezar.'));
  }

  app.appendChild(view);
}

function removeFood(idx) {
  const log = store.getLog();
  log.food.splice(idx, 1);
  store.commit();
  renderTab();
}

function openAddFood() {
  const s = store.getSettings();
  // Determina la comida sugerida según la hora actual.
  const suggested = s.meals.find((m) => reminders.isWithinMealWindow(m))?.id || s.meals[0].id;
  const sel = { mealId: suggested, name: '', kcal: '', portion: '' };

  const searchResults = h('div', { class: 'search-results' });
  const renderResults = (q) => {
    clear(searchResults);
    const matches = (q ? FOODS.filter((f) => f.name.toLowerCase().includes(q.toLowerCase())) : FOODS).slice(0, 12);
    matches.forEach((f) => {
      searchResults.appendChild(h('div', { class: 'result-row', onClick: () => {
        sel.name = f.name; sel.kcal = f.kcal; sel.portion = f.portion;
        nameInput.value = f.name; kcalInput.value = f.kcal; portionInput.value = f.portion;
      } }, [
        h('span', {}, f.name),
        h('span', { class: 'muted' }, `${f.kcal} kcal`),
      ]));
    });
  };

  const searchInput = h('input', { class: 'input', type: 'text', placeholder: '🔍 Buscar alimento...', oninput: (e) => renderResults(e.target.value) });
  const nameInput = h('input', { class: 'input', type: 'text', placeholder: 'Nombre' });
  const kcalInput = h('input', { class: 'input', type: 'number', inputmode: 'numeric', placeholder: 'Calorías (kcal)' });
  const portionInput = h('input', { class: 'input', type: 'text', placeholder: 'Porción (opcional)' });

  const mealSelect = selectField(
    s.meals.map((m) => ({ v: m.id, label: `${m.emoji} ${m.name}` })).concat([{ v: 'otro', label: '🍴 Otro' }]),
    sel.mealId, (v) => sel.mealId = v);

  renderResults('');

  const content = h('div', {}, [
    h('label', { class: 'fld-label' }, 'Momento'),
    mealSelect,
    searchInput,
    searchResults,
    h('div', { class: 'divider' }, 'o ingresa manualmente'),
    nameInput, kcalInput, portionInput,
  ]);

  const overlay = modal('Agregar comida', content, [
    h('button', { class: 'btn', onClick: () => overlay.remove() }, 'Cancelar'),
    h('button', { class: 'btn primary', onClick: () => {
      const name = nameInput.value.trim();
      const kcal = parseInt(kcalInput.value, 10);
      if (!name || !kcal) { toast('Falta nombre o calorías', { emoji: '⚠️' }); return; }
      addFood({ mealId: sel.mealId, name, kcal, portion: portionInput.value.trim() });
      overlay.remove();
    } }, 'Guardar'),
  ]);
}

function addFood({ mealId, name, kcal, portion }) {
  const log = store.getLog();
  log.food.push({ mealId, name, kcal, portion, t: Date.now() });

  // Puntos: registrar + bonus si es la primera vez de esa comida y dentro de ventana.
  let pts = game.POINTS.logMeal;
  let msg = 'Comida registrada';
  const meal = store.getSettings().meals.find((m) => m.id === mealId);
  if (meal && !log.mealsHit[mealId] && reminders.isWithinMealWindow(meal)) {
    pts += game.POINTS.mealOnTime;
    msg = '¡A tiempo! Comida puntual';
  }
  if (meal) log.mealsHit[mealId] = true;
  store.commit();

  activeDay();
  award(pts, msg, '🍽️');
  game.unlock('first_meal') && setTimeout(() => celebrate(game.BADGES.find((b) => b.id === 'first_meal')), 300);
  checkBadges();
  renderTab();
}

// ====================================================================
// AGUA
// ====================================================================
function renderWater() {
  const s = store.getSettings();
  const log = store.getLog();
  const goalMl = waterGoalMl();
  const glasses = Math.round(log.water / s.glassMl);
  const view = h('div', { class: 'view' });

  view.appendChild(pageTitle('💧 Agua', `${glasses} / ${s.waterGoalGlasses} vasos`));

  // Vasos visuales
  const grid = h('div', { class: 'water-grid' });
  for (let i = 0; i < s.waterGoalGlasses; i++) {
    grid.appendChild(h('div', {
      class: 'glass' + (i < glasses ? ' filled' : ''),
      onClick: () => setWaterGlasses(i + 1 <= glasses ? i : i + 1),
    }, i < glasses ? '💧' : ''));
  }
  view.appendChild(h('div', { class: 'card' }, [
    grid,
    h('div', { class: 'muted center tiny' }, `${Math.round(log.water)} ml de ${goalMl} ml`),
  ]));

  view.appendChild(h('div', { class: 'btn-row' }, [
    h('button', { class: 'btn primary', onClick: () => addWater(s.glassMl) }, `＋ 1 vaso (${s.glassMl} ml)`),
    h('button', { class: 'btn', onClick: () => addWater(-s.glassMl) }, '－ Quitar'),
  ]));

  view.appendChild(h('div', { class: 'card info-card' }, [
    h('span', { class: 'big-emoji' }, '⏰'),
    h('div', {}, [
      h('div', { class: 'bold' }, `Recordatorio cada ${s.waterIntervalHours} h`),
      h('div', { class: 'muted tiny' }, store.getSettings().notificationsEnabled
        ? 'Te avisaremos cuando sea hora de hidratarte.'
        : 'Activa las notificaciones en Ajustes para recibir avisos.'),
    ]),
  ]));

  app.appendChild(view);
}

function setWaterGlasses(n) {
  const s = store.getSettings();
  const log = store.getLog();
  const before = log.water;
  log.water = Math.max(0, n * s.glassMl);
  store.commit();
  if (log.water > before) handleWaterGain(before, log.water);
  else { store.commit(); renderTab(); }
}

function addWater(deltaMl) {
  const log = store.getLog();
  const before = log.water;
  log.water = Math.max(0, log.water + deltaMl);
  store.commit();
  if (deltaMl > 0) handleWaterGain(before, log.water);
  else renderTab();
}

function handleWaterGain(before, after) {
  const goal = waterGoalMl();
  activeDay();
  award(game.POINTS.waterGlass, '¡Bien hidratado!', '💧');
  if (before < goal && after >= goal) {
    award(game.POINTS.waterGoal, '¡Meta de agua cumplida!', '🌊');
    game.unlock('water_goal') && setTimeout(() => celebrate(game.BADGES.find((b) => b.id === 'water_goal')), 300);
  }
  game.unlock('first_water') && setTimeout(() => celebrate(game.BADGES.find((b) => b.id === 'first_water')), 300);
  checkBadges();
  renderTab();
}

// ====================================================================
// EJERCICIO
// ====================================================================
function renderExercise() {
  const s = store.getSettings();
  const log = store.getLog();
  const mins = exerciseMinutes(log);
  const burned = burnedCalories(log);
  const view = h('div', { class: 'view' });

  view.appendChild(pageTitle('🏃 Ejercicio', `${mins} min · ${burned} kcal quemadas`));
  view.appendChild(h('div', { class: 'card' }, [
    h('div', { class: 'meal-head' }, [
      h('span', {}, `Meta diaria: ${s.exerciseGoalMin} min`),
      h('span', { class: 'muted' }, `${Math.min(100, Math.round(mins / s.exerciseGoalMin * 100))}%`),
    ]),
    progressBar(s.exerciseGoalMin ? mins / s.exerciseGoalMin : 0, 'var(--green)'),
  ]));

  view.appendChild(h('button', { class: 'btn primary', onClick: () => openAddExercise() }, '＋ Registrar ejercicio'));

  if (!log.exercise.length) {
    view.appendChild(emptyState('💪', 'Aún no registras ejercicio hoy', 'Cada minuto cuenta. ¡Vamos!'));
  } else {
    view.appendChild(h('div', { class: 'card' }, log.exercise.map((e, idx) =>
      h('div', { class: 'food-row' }, [
        h('div', {}, [
          h('div', {}, `${e.emoji || '🏃'} ${e.name}`),
          h('div', { class: 'muted tiny' }, `${e.minutes} min`),
        ]),
        h('div', { class: 'food-right' }, [
          h('span', { class: 'kcal green' }, `${e.kcal} kcal`),
          h('button', { class: 'del-btn', onClick: () => removeExercise(idx) }, '✕'),
        ]),
      ]))));
  }

  app.appendChild(view);
}

function removeExercise(idx) {
  const log = store.getLog();
  log.exercise.splice(idx, 1);
  store.commit();
  renderTab();
}

function openAddExercise() {
  const profile = store.getProfile();
  const sel = { ex: EXERCISES[0], minutes: 30 };

  const list = h('div', { class: 'chip-grid' });
  EXERCISES.forEach((e) => {
    const chip = h('button', { class: 'ex-chip', onClick: () => {
      sel.ex = e;
      [...list.children].forEach((c) => c.classList.remove('selected'));
      chip.classList.add('selected');
      updatePreview();
    } }, [h('span', {}, e.emoji), h('span', { class: 'tiny' }, e.name)]);
    if (e === sel.ex) chip.classList.add('selected');
    list.appendChild(chip);
  });

  const minInput = h('input', { class: 'input', type: 'number', inputmode: 'numeric', value: 30, placeholder: 'Minutos', oninput: (e) => { sel.minutes = parseInt(e.target.value, 10) || 0; updatePreview(); } });
  const preview = h('div', { class: 'preview-cal' });
  function updatePreview() {
    const kcal = calc.exerciseCalories({ met: sel.ex.met, weightKg: profile.weightKg, minutes: sel.minutes });
    preview.textContent = `≈ ${kcal} kcal quemadas`;
  }
  updatePreview();

  const content = h('div', {}, [
    h('label', { class: 'fld-label' }, 'Tipo de ejercicio'),
    list,
    h('label', { class: 'fld-label' }, 'Duración (minutos)'),
    minInput,
    preview,
  ]);

  const overlay = modal('Registrar ejercicio', content, [
    h('button', { class: 'btn', onClick: () => overlay.remove() }, 'Cancelar'),
    h('button', { class: 'btn primary', onClick: () => {
      if (!sel.minutes || sel.minutes <= 0) { toast('Indica los minutos', { emoji: '⚠️' }); return; }
      addExercise(sel.ex, sel.minutes);
      overlay.remove();
    } }, 'Guardar'),
  ]);
}

function addExercise(ex, minutes) {
  const profile = store.getProfile();
  const log = store.getLog();
  const kcal = calc.exerciseCalories({ met: ex.met, weightKg: profile.weightKg, minutes });
  const beforeMin = exerciseMinutes(log);
  log.exercise.push({ name: ex.name, emoji: ex.emoji, minutes, kcal, t: Date.now() });
  store.commit();

  activeDay();
  let pts = game.POINTS.logExercise;
  let msg = '¡Ejercicio registrado!';
  const goal = store.getSettings().exerciseGoalMin;
  if (beforeMin < goal && beforeMin + minutes >= goal) {
    pts += game.POINTS.exerciseGoal;
    msg = '¡Meta de ejercicio cumplida!';
  }
  award(pts, msg, '🏃');
  game.unlock('first_exercise') && setTimeout(() => celebrate(game.BADGES.find((b) => b.id === 'first_exercise')), 300);
  checkBadges();
  renderTab();
}

// ====================================================================
// PROGRESO
// ====================================================================
function renderProgress() {
  const profile = store.getProfile();
  const series = game.weightSeries();
  const view = h('div', { class: 'view' });

  view.appendChild(pageTitle('📈 Progreso', 'Tu evolución'));

  // Resumen
  const start = profile.startWeight ?? (series[0]?.kg || profile.weightKg);
  const current = series.length ? series[series.length - 1].kg : profile.weightKg;
  const lost = +(start - current).toFixed(1);
  const toGoal = +(current - profile.goalKg).toFixed(1);
  const totalToLose = start - profile.goalKg;
  const pct = totalToLose > 0 ? Math.max(0, Math.min(100, Math.round((lost / totalToLose) * 100))) : 0;

  view.appendChild(h('div', { class: 'stat-row' }, [
    statBox(`${current}`, 'kg actual'),
    statBox(`${lost >= 0 ? '−' : '+'}${Math.abs(lost)}`, 'kg perdidos', lost >= 0 ? 'var(--green)' : 'var(--danger)'),
    statBox(`${toGoal > 0 ? toGoal : 0}`, 'kg a la meta'),
  ]));

  view.appendChild(h('div', { class: 'card' }, [
    h('div', { class: 'meal-head' }, [
      h('span', {}, '🎯 Hacia tu meta'),
      h('span', { class: 'muted' }, `${pct}%`),
    ]),
    progressBar(pct / 100, 'var(--green)'),
    h('div', { class: 'muted tiny center' }, `De ${start} kg a ${profile.goalKg} kg`),
  ]));

  // Botón registrar peso
  view.appendChild(h('button', { class: 'btn primary', onClick: () => openAddWeight(current) }, '⚖️ Registrar peso de hoy'));

  // Gráfico de peso
  view.appendChild(h('div', { class: 'card' }, [
    h('div', { class: 'card-title' }, 'Evolución del peso'),
    charts.weightChart(series, profile.goalKg),
  ]));

  // Gráfico de calorías últimos 7 días
  view.appendChild(h('div', { class: 'card' }, [
    h('div', { class: 'card-title' }, 'Calorías (últimos 7 días)'),
    charts.barChart(weekSeries((log) => consumedCalories(log)), { target: calc.calorieTarget(profile), color: 'var(--accent)' }),
  ]));

  // Gráfico de minutos de ejercicio últimos 7 días
  view.appendChild(h('div', { class: 'card' }, [
    h('div', { class: 'card-title' }, 'Ejercicio (min, últimos 7 días)'),
    charts.barChart(weekSeries((log) => exerciseMinutes(log)), { target: store.getSettings().exerciseGoalMin, color: 'var(--green)' }),
  ]));

  app.appendChild(view);
}

function weekSeries(fn) {
  const days = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
  const out = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = store.todayKey(d);
    const log = store.getAllLogs()[key];
    out.push({ label: days[d.getDay()], value: log ? fn(log) : 0 });
  }
  return out;
}

function openAddWeight(current) {
  const input = h('input', { class: 'input', type: 'number', inputmode: 'decimal', step: '0.1', value: current, placeholder: 'Peso en kg' });
  const content = h('div', {}, [
    h('label', { class: 'fld-label' }, 'Peso de hoy (kg)'),
    input,
  ]);
  const overlay = modal('Registrar peso', content, [
    h('button', { class: 'btn', onClick: () => overlay.remove() }, 'Cancelar'),
    h('button', { class: 'btn primary', onClick: () => {
      const kg = parseFloat(input.value);
      if (!kg || kg <= 0) { toast('Ingresa un peso válido', { emoji: '⚠️' }); return; }
      saveWeight(kg);
      overlay.remove();
    } }, 'Guardar'),
  ]);
}

function saveWeight(kg) {
  const log = store.getLog();
  const isNew = log.weight == null;
  log.weight = kg;
  // Actualiza el peso del perfil para cálculos de calorías.
  const profile = store.getProfile();
  profile.weightKg = kg;
  store.setProfile(profile);
  store.commit();

  activeDay();
  if (isNew) award(game.POINTS.logWeight, '¡Peso registrado!', '⚖️');
  game.unlock('first_weight') && isNew && setTimeout(() => celebrate(game.BADGES.find((b) => b.id === 'first_weight')), 300);
  checkBadges();
  renderTab();
}

// ====================================================================
// AJUSTES
// ====================================================================
function renderSettings() {
  const profile = store.getProfile();
  const s = store.getSettings();
  const view = h('div', { class: 'view' });

  view.appendChild(h('div', { class: 'home-head' }, [
    h('button', { class: 'icon-btn', onClick: () => go('inicio') }, '←'),
    h('div', { class: 'greeting' }, '⚙️ Ajustes'),
    h('span', {}),
  ]));

  // Notificaciones
  const notifStatus = !reminders.notificationsSupported()
    ? 'No soportadas en este navegador'
    : Notification.permission === 'granted' ? 'Activadas ✓'
    : Notification.permission === 'denied' ? 'Bloqueadas (revisa permisos del navegador)'
    : 'Desactivadas';
  view.appendChild(h('div', { class: 'card' }, [
    h('div', { class: 'card-title' }, '🔔 Notificaciones'),
    h('div', { class: 'muted tiny' }, `Estado: ${notifStatus}`),
    h('button', { class: 'btn primary', onClick: async () => {
      const perm = await reminders.requestNotifications();
      if (perm === 'granted') {
        reminders.scheduleReminders();
        reminders.notify('🎉 ¡Notificaciones activadas!', 'Te recordaremos comer y beber agua.');
      } else if (perm === 'unsupported') {
        toast('Tu navegador no soporta notificaciones', { emoji: '⚠️' });
      } else {
        toast('Permiso no concedido', { emoji: '⚠️' });
      }
      renderTab();
    } }, 'Activar notificaciones'),
    h('div', { class: 'ios-tip' }, '📱 En iPhone: abre esta web en Safari, toca Compartir → "Agregar a inicio". Luego ábrela desde el ícono para recibir avisos.'),
  ]));

  // Metas
  view.appendChild(h('div', { class: 'card' }, [
    h('div', { class: 'card-title' }, '🎯 Metas'),
    settingNumber('Meta de agua (vasos)', s.waterGoalGlasses, (v) => store.setSettings({ waterGoalGlasses: v })),
    settingNumber('Tamaño del vaso (ml)', s.glassMl, (v) => store.setSettings({ glassMl: v })),
    settingNumber('Recordatorio de agua (horas)', s.waterIntervalHours, (v) => { store.setSettings({ waterIntervalHours: v }); reminders.scheduleReminders(); }),
    settingNumber('Meta de ejercicio (min/día)', s.exerciseGoalMin, (v) => store.setSettings({ exerciseGoalMin: v })),
  ]));

  // Horario de comidas
  view.appendChild(h('div', { class: 'card' }, [
    h('div', { class: 'card-title' }, '⏰ Horario de comidas'),
    ...s.meals.map((m) => h('div', { class: 'meal-time-row' }, [
      h('span', {}, `${m.emoji} ${m.name}`),
      h('input', { class: 'time-input', type: 'time', value: m.time, onchange: (e) => {
        m.time = e.target.value;
        store.setSettings({ meals: s.meals });
        reminders.scheduleReminders();
      } }),
    ])),
  ]));

  // Perfil
  view.appendChild(h('div', { class: 'card' }, [
    h('div', { class: 'card-title' }, '👤 Perfil'),
    settingNumber('Edad', profile.age, (v) => { profile.age = v; store.setProfile(profile); }),
    settingNumber('Altura (cm)', profile.heightCm, (v) => { profile.heightCm = v; store.setProfile(profile); }),
    settingNumber('Peso meta (kg)', profile.goalKg, (v) => { profile.goalKg = v; store.setProfile(profile); }),
    field('Actividad', selectField(
      calc.ACTIVITY_OPTIONS.map((o) => ({ v: o.id, label: o.label })),
      profile.activity, (v) => { profile.activity = v; store.setProfile(profile); })),
    field('Ritmo', selectField(
      calc.PACE_OPTIONS.map((o) => ({ v: o.id, label: o.label })),
      profile.pace, (v) => { profile.pace = parseFloat(v); store.setProfile(profile); })),
  ]));

  // Resumen calculado
  const bmiVal = calc.bmi(profile);
  const bmiCat = calc.bmiCategory(bmiVal);
  view.appendChild(h('div', { class: 'card' }, [
    h('div', { class: 'card-title' }, '📊 Tus números'),
    infoRow('Metabolismo basal (BMR)', `${calc.bmr(profile)} kcal`),
    infoRow('Gasto total (TDEE)', `${calc.tdee(profile)} kcal`),
    infoRow('Meta calórica diaria', `${calc.calorieTarget(profile)} kcal`),
    infoRow('IMC', h('span', { style: `color:${bmiCat.color};font-weight:700` }, `${bmiVal} · ${bmiCat.label}`)),
  ]));

  // Datos
  view.appendChild(h('div', { class: 'card' }, [
    h('div', { class: 'card-title' }, '💾 Datos'),
    h('div', { class: 'btn-row' }, [
      h('button', { class: 'btn', onClick: exportData }, '⬇️ Exportar'),
      h('button', { class: 'btn', onClick: importData }, '⬆️ Importar'),
    ]),
    h('button', { class: 'btn danger', onClick: confirmReset }, '🗑️ Borrar todo y reiniciar'),
  ]));

  app.appendChild(view);
}

function confirmReset() {
  const content = h('div', {}, h('p', {}, '¿Seguro que quieres borrar todos tus datos y empezar de cero? Esta acción no se puede deshacer.'));
  const overlay = modal('Borrar todo', content, [
    h('button', { class: 'btn', onClick: () => overlay.remove() }, 'Cancelar'),
    h('button', { class: 'btn danger', onClick: () => {
      store.resetAll();
      overlay.remove();
      currentTab = 'inicio';
      start();
    } }, 'Sí, borrar'),
  ]);
}

function exportData() {
  const data = store.exportData();
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: `mireto-${store.todayKey()}.json` });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast('Datos exportados', { emoji: '⬇️' });
}

function importData() {
  const input = h('input', { type: 'file', accept: 'application/json' });
  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        store.importData(reader.result);
        toast('Datos importados', { emoji: '✅' });
        currentTab = 'inicio';
        start();
      } catch {
        toast('Archivo inválido', { emoji: '⚠️' });
      }
    };
    reader.readAsText(file);
  });
  input.click();
}

// ====================================================================
// Componentes reutilizables
// ====================================================================
function saludo() {
  const hr = new Date().getHours();
  if (hr < 12) return '¡Buenos días! ☀️';
  if (hr < 19) return '¡Buenas tardes! 🌤️';
  return '¡Buenas noches! 🌙';
}

function pageTitle(title, sub) {
  return h('div', { class: 'page-title' }, [
    h('h2', {}, title),
    sub ? h('div', { class: 'muted' }, sub) : null,
  ]);
}

function field(label, control) {
  return h('div', { class: 'fld' }, [h('label', { class: 'fld-label' }, label), control]);
}

function numberField(label, value, unit, onChange) {
  const input = h('input', { class: 'input', type: 'number', inputmode: 'decimal', value, oninput: (e) => onChange(e.target.value) });
  return h('div', { class: 'fld' }, [
    h('label', { class: 'fld-label' }, label),
    h('div', { class: 'input-unit' }, [input, h('span', { class: 'unit' }, unit)]),
  ]);
}

function segmented(options, current, onChange) {
  const wrap = h('div', { class: 'segmented' });
  options.forEach((o) => {
    const btn = h('button', { class: 'seg' + (o.v === current ? ' active' : ''), onClick: () => {
      [...wrap.children].forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
      onChange(o.v);
    } }, o.label);
    wrap.appendChild(btn);
  });
  return wrap;
}

function selectField(options, current, onChange) {
  const sel = h('select', { class: 'input select', onchange: (e) => onChange(e.target.value) });
  options.forEach((o) => {
    const opt = h('option', { value: o.v }, o.label);
    if (String(o.v) === String(current)) opt.selected = true;
    sel.appendChild(opt);
  });
  return sel;
}

function progressBar(ratio, color = 'var(--accent)') {
  const pct = Math.max(0, Math.min(100, ratio * 100));
  return h('div', { class: 'progress' }, [
    h('div', { class: 'progress-fill', style: `width:${pct}%;background:${color}` }),
  ]);
}

function legend(label, value, color) {
  return h('div', { class: 'legend-item' }, [
    h('span', { class: 'legend-dot', style: `background:${color}` }),
    h('div', {}, [h('div', { class: 'legend-val' }, value), h('div', { class: 'legend-label' }, label)]),
  ]);
}

function quickStat(emoji, value, label, onClick) {
  return h('button', { class: 'quick-stat', onClick }, [
    h('span', { class: 'qs-emoji' }, emoji),
    h('span', { class: 'qs-value' }, value),
    h('span', { class: 'qs-label' }, label),
  ]);
}

function statBox(value, label, color) {
  return h('div', { class: 'stat-box' }, [
    h('div', { class: 'stat-val', style: color ? `color:${color}` : '' }, value),
    h('div', { class: 'stat-label' }, label),
  ]);
}

function infoRow(label, value) {
  return h('div', { class: 'info-row' }, [
    h('span', { class: 'muted' }, label),
    typeof value === 'string' ? h('span', { class: 'bold' }, value) : value,
  ]);
}

function settingNumber(label, value, onChange) {
  return h('div', { class: 'setting-row' }, [
    h('span', {}, label),
    h('input', { class: 'mini-input', type: 'number', inputmode: 'decimal', value, onchange: (e) => {
      const v = parseFloat(e.target.value);
      if (!isNaN(v)) onChange(v);
    } }),
  ]);
}

function emptyState(emoji, title, sub) {
  return h('div', { class: 'empty' }, [
    h('div', { class: 'empty-emoji' }, emoji),
    h('div', { class: 'bold' }, title),
    h('div', { class: 'muted tiny' }, sub),
  ]);
}

// ---------- Service worker ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW falló:', e));
  });
}

// Reprograma recordatorios al volver a la app.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && store.getProfile()) reminders.scheduleReminders();
});

start();
