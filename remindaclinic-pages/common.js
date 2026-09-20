'use strict';
/* Utilidades compartidas por las paginas de la version estatica de RemindaClinic.
 * Se carga DESPUES de lib/*.js, asi que al ejecutarse ya existen los globales
 * Store / Domain / Reminders / Seed. */

// Siembra (si hace falta) y procesa recordatorios vencidos ANTES de que corra
// el script en linea de cada pagina.
try {
  window.Seed.ensureSeeded();
  window.Reminders.processDue();
} catch (e) {
  console.error('Error inicializando el demo:', e);
}

// Reprocesa recordatorios cada 30 s (equivalente al "tick" del servidor Node).
setInterval(() => {
  try {
    const sent = window.Reminders.processDue();
    if (sent.length && typeof window.onRemindersSent === 'function') window.onRemindersSent(sent);
  } catch (e) { /* nada */ }
}, 30000);

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c === null || c === undefined) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

let toastTimer = null;
function toast(message, isError = false) {
  let t = document.querySelector('.toast');
  if (!t) { t = el('div', { class: 'toast' }); document.body.appendChild(t); }
  t.textContent = message;
  t.className = 'toast show' + (isError ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast'; }, 2800);
}

const DIAS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const DIAS_CORTO = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];

function fmtDate(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  return `${DIAS[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}-${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function statusBadge(status) {
  return el('span', { class: `badge ${status}` }, status.replace('_', ' '));
}

// Boton "Reiniciar demo" (borra los datos de este navegador y vuelve a sembrar).
function resetDemo() {
  if (!confirm('¿Reiniciar el demo? Se borrarán las citas guardadas en este navegador.')) return;
  window.Seed.run();
  location.reload();
}

function markNav() {
  const here = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('header.topbar nav a').forEach((a) => {
    const href = a.getAttribute('href');
    if (href === here || (here === '' && href === 'index.html')) a.classList.add('active');
  });
  const rb = document.getElementById('resetDemo');
  if (rb) rb.addEventListener('click', resetDemo);
}

document.addEventListener('DOMContentLoaded', markNav);
