'use strict';
/* Igual que demo-event-ticketing/src/qr.js: NO es un QR real (ISO/IEC
 * 18004), es un patron visual determinista (mismo texto -> mismo dibujo).
 * El codigo alfanumerico del ticket es el dato real que valida el acceso.
 * Aqui se usa un hash sincrono simple en vez de Web Crypto (que es async)
 * para poder generar la imagen sin await en el resto de las paginas. */
(function () {

function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function svgFor(text, { size = 240, modules = 25 } = {}) {
  const rnd = mulberry32(hashSeed(text));
  const cell = size / modules;
  const grid = Array.from({ length: modules }, () => new Array(modules).fill(0));
  for (let y = 0; y < modules; y++) {
    for (let x = 0; x < modules; x++) grid[y][x] = rnd() < 0.5 ? 0 : 1;
  }

  const finder = (ox, oy) => {
    for (let y = 0; y < 7; y++) {
      for (let x = 0; x < 7; x++) {
        const border = x === 0 || x === 6 || y === 0 || y === 6;
        const core = x >= 2 && x <= 4 && y >= 2 && y <= 4;
        grid[oy + y][ox + x] = border || core ? 1 : 0;
      }
    }
  };
  finder(0, 0);
  finder(modules - 7, 0);
  finder(0, modules - 7);

  let rects = '';
  for (let y = 0; y < modules; y++) {
    for (let x = 0; x < modules; x++) {
      if (grid[y][x]) {
        rects += `<rect x="${(x * cell).toFixed(2)}" y="${(y * cell).toFixed(2)}" width="${cell.toFixed(2)}" height="${cell.toFixed(2)}"/>`;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="Codigo de acceso ${text}">` +
    `<rect width="${size}" height="${size}" fill="#ffffff"/>` +
    `<g fill="#111111">${rects}</g>` +
    `</svg>`;
}

function dataUrlFor(text, opts) {
  const svg = svgFor(text, opts);
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

window.QR = { svgFor, dataUrlFor };

})();
