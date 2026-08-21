/**
 * Generador de imágenes placeholder (PNG) para los samples.
 *
 * Uso: npm run gen-assets
 *
 * Crea PNGs de color sólido (sin dependencias, encoder mínimo) en las
 * carpetas img/ de los samples y en la raíz. Se ejecuta una vez y los
 * PNG resultantes se versionan en git para que el clonado funcione sin
 * ejecutar nada.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

/* ---------- encoder PNG mínimo ---------- */
function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

/** Genera un PNG RGBA de color sólido. color: [r,g,b]. */
function solidPng(width, height, color, radius = 0) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const [r, g, b] = color;
  const raw = Buffer.alloc(height * (1 + width * 4));
  let p = 0;
  for (let y = 0; y < height; y++) {
    raw[p++] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      let a = 255;
      if (radius > 0) {
        const cx = Math.min(x, width - 1 - x);
        const cy = Math.min(y, height - 1 - y);
        const dx = Math.max(0, cx - (radius - 1));
        const dy = Math.max(0, cy - (radius - 1));
        if (dx > 0 || dy > 0) a = 0; // fuera del radio -> transparente
      }
      raw[p++] = r; raw[p++] = g; raw[p++] = b; raw[p++] = a;
    }
  }
  const idat = zlib.deflateSync(raw);
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

/* ---------- definición de assets ---------- */
const assets = [
  // sample 00-layouts: imágenes para el ejemplo columna+imagen
  { file: 'samples/00-layouts/img/foto.png', w: 800, h: 600, color: [91, 91, 214], radius: 40 },
  { file: 'samples/00-layouts/img/grafico.png', w: 800, h: 600, color: [240, 162, 50], radius: 40 },
  // sample 02-diagrams: imagen dentro de columna
  { file: 'samples/02-diagrams/img/diagrama.png', w: 700, h: 500, color: [46, 158, 91], radius: 30 },
  // sample 02-diagrams: iconos para cajas de infografía
  { file: 'samples/02-diagrams/img/icon-servidor.png', w: 160, h: 160, color: [91, 91, 214], radius: 32 },
  { file: 'samples/02-diagrams/img/icon-cliente.png', w: 160, h: 160, color: [46, 158, 91], radius: 32 },
  { file: 'samples/02-diagrams/img/icon-consulta.png', w: 160, h: 160, color: [240, 162, 50], radius: 32 },
  // presentación raíz (../ = raíz del proyecto): imagen de ejemplo de slides.md
  { file: '../img/foto.png', w: 900, h: 600, color: [123, 123, 245], radius: 44 },
];

let count = 0;
for (const a of assets) {
  const target = path.join(ROOT, a.file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, solidPng(a.w, a.h, a.color, a.radius));
  console.log(`✓ ${a.file} (${a.w}x${a.h})`);
  count++;
}
console.log(`\nGenerados ${count} placeholder(s).`);
