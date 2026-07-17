// Helpers de UI: creación de elementos, toasts y modal genérico.

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k === 'dataset') {
      Object.assign(node.dataset, v);
    } else {
      node.setAttribute(k, v);
    }
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

let toastTimer;
export function toast(msg, tipo = 'ok') {
  let t = document.getElementById('toast');
  if (!t) {
    t = el('div', { id: 'toast', class: 'toast' });
    document.body.append(t);
  }
  t.textContent = msg;
  t.className = `toast toast--${tipo} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = 'toast'), 2800);
}

// Modal genérico. `render(close)` devuelve el contenido del cuerpo.
export function modal(titulo, render) {
  const overlay = el('div', { class: 'overlay' });
  const close = () => overlay.remove();
  const body = el('div', { class: 'modal-body' });
  const card = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' }, [
    el('div', { class: 'modal-head' }, [
      el('h2', { text: titulo }),
      el('button', { class: 'icon-btn', 'aria-label': 'Cerrar', text: '✕', onClick: close }),
    ]),
    body,
  ]);
  body.append(render(close));
  overlay.append(card);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') {
      close();
      document.removeEventListener('keydown', esc);
    }
  });
  document.body.append(overlay);
  const first = card.querySelector('input, select, textarea, button');
  if (first) first.focus();
  return { close, card };
}

export function confirmar(mensaje) {
  return new Promise((resolve) => {
    const { close } = modal('Confirmar', (cerrar) => {
      const wrap = el('div', {}, [
        el('p', { text: mensaje, class: 'confirm-msg' }),
        el('div', { class: 'row end gap' }, [
          el('button', { class: 'btn ghost', text: 'Cancelar', onClick: () => { cerrar(); resolve(false); } }),
          el('button', { class: 'btn danger', text: 'Eliminar', onClick: () => { cerrar(); resolve(true); } }),
        ]),
      ]);
      return wrap;
    });
    void close;
  });
}

export function copiar(texto) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(texto).then(
      () => toast('Copiado al portapapeles'),
      () => toast('No se pudo copiar', 'err')
    );
  }
  const ta = el('textarea', {});
  ta.value = texto;
  document.body.append(ta);
  ta.select();
  try {
    document.execCommand('copy');
    toast('Copiado al portapapeles');
  } catch {
    toast('No se pudo copiar', 'err');
  }
  ta.remove();
}
