// mascot.js — Mascota animada que vive en pantalla, te habla y te recuerda.

import { h } from './ui.js';

let els = null;
let hideTimer = null;

// Monta (o actualiza) la mascota. onTap se llama al tocarla.
export function mountMascot({ name = 'Pancho', emoji = '🦊', onTap } = {}) {
  if (els) {
    setMascot(name, emoji);
    if (onTap) els.onTap = onTap;
    showMascot();
    return els;
  }
  const bubble = h('div', { class: 'mascot-bubble' });
  const body = h('div', { class: 'mascot-body' }, emoji);
  const wrap = h('div', { class: 'mascot' }, [bubble, body]);
  els = { wrap, bubble, body, name, emoji, onTap };
  body.addEventListener('click', () => els.onTap && els.onTap());
  document.body.appendChild(wrap);
  return els;
}

export function setMascot(name, emoji) {
  if (!els) return;
  els.name = name;
  els.emoji = emoji;
  els.body.textContent = emoji;
}

// Muestra un globo de diálogo y hace rebotar a la mascota.
export function mascotSay(text, { emoji = '', duration = 6000 } = {}) {
  if (!els) return;
  showMascot();
  els.bubble.textContent = emoji ? `${emoji} ${text}` : text;
  els.bubble.classList.add('show');
  // reinicia la animación de rebote
  els.body.classList.remove('bounce');
  void els.body.offsetWidth;
  els.body.classList.add('bounce');
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => els.bubble.classList.remove('show'), duration);
}

export function showMascot() {
  if (els) els.wrap.style.display = 'flex';
}

export function hideMascot() {
  if (els) els.wrap.style.display = 'none';
}
