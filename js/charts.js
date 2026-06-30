// charts.js — Gráficos en SVG sin dependencias externas.

const NS = 'http://www.w3.org/2000/svg';

function el(tag, attrs = {}) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

// Gráfico de líneas para la evolución del peso.
// data: [{ date:'YYYY-MM-DD', kg:Number }], goal: Number|null
export function weightChart(data, goal) {
  const W = 320, H = 180, padL = 36, padR = 12, padT = 14, padB = 24;
  const svg = el('svg', {
    viewBox: `0 0 ${W} ${H}`,
    width: '100%',
    preserveAspectRatio: 'xMidYMid meet',
    class: 'chart',
  });

  if (!data.length) {
    const t = el('text', { x: W / 2, y: H / 2, 'text-anchor': 'middle', class: 'chart-empty' });
    t.textContent = 'Aún no hay registros de peso';
    svg.appendChild(t);
    return svg;
  }

  const kgs = data.map((d) => d.kg);
  let min = Math.min(...kgs, goal ?? Infinity);
  let max = Math.max(...kgs, goal ?? -Infinity);
  if (min === max) { min -= 1; max += 1; }
  const range = max - min;
  min -= range * 0.1;
  max += range * 0.1;

  const x = (i) => padL + (i / Math.max(1, data.length - 1)) * (W - padL - padR);
  const y = (kg) => padT + (1 - (kg - min) / (max - min)) * (H - padT - padB);

  // Eje Y (min/max)
  [min, (min + max) / 2, max].forEach((val) => {
    const yy = y(val);
    svg.appendChild(el('line', { x1: padL, y1: yy, x2: W - padR, y2: yy, class: 'grid' }));
    const t = el('text', { x: padL - 4, y: yy + 3, 'text-anchor': 'end', class: 'axis' });
    t.textContent = val.toFixed(1);
    svg.appendChild(t);
  });

  // Línea de meta
  if (goal != null) {
    const gy = y(goal);
    svg.appendChild(el('line', { x1: padL, y1: gy, x2: W - padR, y2: gy, class: 'goal-line' }));
    const t = el('text', { x: W - padR, y: gy - 4, 'text-anchor': 'end', class: 'goal-label' });
    t.textContent = `meta ${goal}`;
    svg.appendChild(t);
  }

  // Línea de datos
  const pts = data.map((d, i) => `${x(i)},${y(d.kg)}`).join(' ');
  svg.appendChild(el('polyline', { points: pts, class: 'line' }));

  // Puntos
  data.forEach((d, i) => {
    svg.appendChild(el('circle', { cx: x(i), cy: y(d.kg), r: 3, class: 'dot' }));
  });

  return svg;
}

// Gráfico de barras genérico para series semanales.
// data: [{ label:'L', value:Number }], target opcional dibuja una línea.
export function barChart(data, { target = null, unit = '', color = 'var(--accent)' } = {}) {
  const W = 320, H = 160, padL = 28, padR = 10, padT = 14, padB = 22;
  const svg = el('svg', {
    viewBox: `0 0 ${W} ${H}`,
    width: '100%',
    preserveAspectRatio: 'xMidYMid meet',
    class: 'chart',
  });

  const values = data.map((d) => d.value);
  const max = Math.max(...values, target ?? 0, 1);
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const barW = (innerW / data.length) * 0.6;
  const gap = (innerW / data.length) * 0.4;

  const y = (v) => padT + (1 - v / max) * innerH;

  if (target != null) {
    const ty = y(target);
    svg.appendChild(el('line', { x1: padL, y1: ty, x2: W - padR, y2: ty, class: 'goal-line' }));
  }

  data.forEach((d, i) => {
    const bx = padL + i * (barW + gap) + gap / 2;
    const by = y(d.value);
    svg.appendChild(el('rect', {
      x: bx, y: by, width: barW, height: padT + innerH - by,
      rx: 3, fill: color, class: 'bar',
    }));
    const lt = el('text', { x: bx + barW / 2, y: H - 8, 'text-anchor': 'middle', class: 'axis' });
    lt.textContent = d.label;
    svg.appendChild(lt);
    if (d.value > 0) {
      const vt = el('text', { x: bx + barW / 2, y: by - 3, 'text-anchor': 'middle', class: 'bar-val' });
      vt.textContent = Math.round(d.value);
      svg.appendChild(vt);
    }
  });

  return svg;
}

// Anillo de progreso (consumido vs objetivo de calorías).
export function ring(value, target, { label = '', sub = '' } = {}) {
  const size = 160, stroke = 14, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const ratio = target > 0 ? Math.min(1, value / target) : 0;
  const over = target > 0 && value > target;
  const svg = el('svg', { viewBox: `0 0 ${size} ${size}`, width: '160', height: '160', class: 'ring' });
  svg.appendChild(el('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', 'stroke-width': stroke, class: 'ring-bg' }));
  const fg = el('circle', {
    cx: size / 2, cy: size / 2, r, fill: 'none', 'stroke-width': stroke,
    'stroke-linecap': 'round',
    'stroke-dasharray': c,
    'stroke-dashoffset': c * (1 - ratio),
    transform: `rotate(-90 ${size / 2} ${size / 2})`,
    stroke: over ? 'var(--danger)' : 'var(--accent)',
  });
  svg.appendChild(fg);
  const big = el('text', { x: size / 2, y: size / 2 - 2, 'text-anchor': 'middle', class: 'ring-big' });
  big.textContent = label;
  svg.appendChild(big);
  const small = el('text', { x: size / 2, y: size / 2 + 20, 'text-anchor': 'middle', class: 'ring-sub' });
  small.textContent = sub;
  svg.appendChild(small);
  return svg;
}
