// ui.js — Helpers de render: elementos, toasts, modales, confeti motivacional.

export function h(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (v === true) node.setAttribute(k, '');
    else if (v !== false && v != null) node.setAttribute(k, v);
  }
  const kids = Array.isArray(children) ? children : [children];
  for (const c of kids) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

const MOTIVATION = [
  '¡Vas increíble! 💪',
  'Cada paso cuenta 👏',
  '¡Sigue así, lo estás logrando! 🔥',
  'Tu yo del futuro te lo agradece 🙌',
  'Constancia > perfección ⭐',
  '¡Imparable! 🚀',
  'Pequeños hábitos, grandes cambios 🌱',
];

export function randomMotivation() {
  return MOTIVATION[Math.floor(Math.random() * MOTIVATION.length)];
}

let toastContainer = null;
export function toast(message, { points = 0, emoji = '' } = {}) {
  if (!toastContainer) {
    toastContainer = h('div', { class: 'toast-container' });
    document.body.appendChild(toastContainer);
  }
  const t = h('div', { class: 'toast' }, [
    emoji ? h('span', { class: 'toast-emoji' }, emoji) : null,
    h('span', { class: 'toast-msg' }, message),
    points ? h('span', { class: 'toast-points' }, `+${points}`) : null,
  ]);
  toastContainer.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, 2600);
}

// Modal de logro desbloqueado con confeti.
export function celebrate(badge) {
  const overlay = h('div', { class: 'modal-overlay' });
  const card = h('div', { class: 'badge-modal' }, [
    h('div', { class: 'badge-emoji-big' }, badge.emoji),
    h('div', { class: 'badge-title' }, '¡Logro desbloqueado!'),
    h('div', { class: 'badge-name' }, badge.name),
    h('div', { class: 'badge-desc' }, badge.desc),
    h('button', { class: 'btn primary', onClick: () => overlay.remove() }, '¡Genial!'),
  ]);
  overlay.appendChild(card);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  confetti();
}

export function confetti() {
  const colors = ['#f59e0b', '#22c55e', '#3b82f6', '#ef4444', '#a855f7'];
  const layer = h('div', { class: 'confetti-layer' });
  for (let i = 0; i < 40; i++) {
    const piece = h('div', { class: 'confetti' });
    piece.style.left = Math.random() * 100 + 'vw';
    piece.style.background = colors[i % colors.length];
    piece.style.animationDelay = Math.random() * 0.5 + 's';
    piece.style.transform = `rotate(${Math.random() * 360}deg)`;
    layer.appendChild(piece);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 2500);
}

// Modal genérico con contenido y acciones.
export function modal(titleText, contentNode, actions = []) {
  const overlay = h('div', { class: 'modal-overlay' });
  const card = h('div', { class: 'modal-card' }, [
    h('div', { class: 'modal-head' }, [
      h('h3', {}, titleText),
      h('button', { class: 'modal-close', onClick: () => overlay.remove() }, '✕'),
    ]),
    h('div', { class: 'modal-body' }, contentNode),
    actions.length ? h('div', { class: 'modal-actions' }, actions) : null,
  ]);
  overlay.appendChild(card);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  return overlay;
}
