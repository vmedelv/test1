'use strict';

const crypto = require('crypto');

/*
 * Generador de una imagen "tipo QR" para la demo.
 *
 * Nota importante: este NO es un encoder QR real (ISO/IEC 18004). Instalar
 * una libreria (ej. `qrcode` de npm) esta bloqueado en este sandbox porque el
 * registro de paquetes no es alcanzable desde esta sesion (egress policy).
 * En vez de reimplementar Reed-Solomon a ciegas y sin forma de verificar que
 * el resultado sea realmente escaneable, se genera un patron determinista
 * (mismo texto -> siempre el mismo dibujo) con la estetica de un QR, y el
 * codigo alfanumerico real del ticket se muestra siempre junto a la imagen
 * y es el dato que efectivamente valida el check-in (por escritura manual o
 * pegado del codigo). En una implementacion productiva, este modulo se
 * reemplaza por una libreria real de QR sin tocar el resto del sistema.
 */
function svgFor(text, { size = 240, modules = 25 } = {}) {
  const cell = size / modules;
  const bits = [];
  let seed = crypto.createHash('sha256').update(text).digest();
  let seedIdx = 0;
  const nextBit = () => {
    if (seedIdx >= seed.length * 8) {
      seed = crypto.createHash('sha256').update(seed).digest();
      seedIdx = 0;
    }
    const byte = seed[Math.floor(seedIdx / 8)];
    const bit = (byte >> (seedIdx % 8)) & 1;
    seedIdx++;
    return bit;
  };

  const grid = Array.from({ length: modules }, () => new Array(modules).fill(0));
  for (let y = 0; y < modules; y++) {
    for (let x = 0; x < modules; x++) {
      grid[y][x] = nextBit();
    }
  }

  // Patrones "finder" en las esquinas, como en un QR real, para que se lea
  // visualmente como un codigo QR aunque el contenido no sea un QR valido.
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
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

module.exports = { svgFor, dataUrlFor };
