/**
 * Export PDF pixel-perfect de slidedown.
 *
 * Uso:
 *   npm run pdf              -> exporta la presentación raíz a slides.pdf
 *   npm run pdf -- <deck>    -> exporta un sample (ej: samples/02-diagrams)
 *   node test/export-pdf.mjs --help
 *
 * Opciones:
 *   --out <path>   Ruta de salida (por defecto: <deck>/slides.pdf)
 *   --raster       Modo raster: screenshots PNG + pdf-lib (píxel literal,
 *                  sin texto vectorial). Por defecto es vector (page.pdf
 *                  con texto seleccionable, réplica fiel de pantalla).
 *
 * Requisitos: conda activate slidedown && npm install (playwright + pdf-lib)
 * Genera un PDF de 1280×720 pt por diapositiva (fragmentos todos revelados).
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRAMEWORK = path.resolve(__dirname, '..');
const PRESENTATION = path.resolve(FRAMEWORK, '..');
const DEFAULT_PORT = 8924;

// ---- args ----
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Uso: node test/export-pdf.mjs [deck] [opciones]

  deck              Carpeta del deck (ej: samples/02-diagrams). Por defecto: raíz.
  --out <path>      Ruta de salida del PDF.
  --raster          Modo raster (screenshots PNG). Por defecto: vector (page.pdf).
  --port <n>        Puerto del servidor estático (por defecto ${DEFAULT_PORT}).

Ejemplos:
  npm run pdf
  npm run pdf -- samples/02-diagrams
  node test/export-pdf.mjs --out /tmp/mi.pdf --raster
`);
  process.exit(0);
}

let deckArg = null;
let outArg = null;
let raster = false;
let port = DEFAULT_PORT;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--raster') raster = true;
  else if (a === '--out' && args[i + 1]) { outArg = args[++i]; }
  else if (a === '--port' && args[i + 1]) { port = parseInt(args[++i], 10); }
  else if (!a.startsWith('--') && !deckArg) deckArg = a;
  else if (!a.startsWith('--') && !outArg) outArg = a; // compat: segundo posicional como out
}

// ---- resolver deck ----
function resolveDeck(arg) {
  if (!arg || arg === '.' || arg === 'root' || arg === 'RAIZ') {
    return {
      name: 'RAÍZ (slides.md)',
      urlPath: '/index.html',
      dir: PRESENTATION,
      outDefault: path.join(PRESENTATION, 'slides.pdf'),
    };
  }
  // normalizar: samples/02-diagrams  -> framework/samples/02-diagrams
  let rel = arg.replace(/^\//, '').replace(/\/$/, '');
  if (!rel.startsWith('samples/') && !rel.startsWith('framework/samples/')) {
    // si es una ruta relativa a PRESENTATION que tiene index.html, usarla
    const tryP = path.join(PRESENTATION, rel);
    if (fs.existsSync(path.join(tryP, 'index.html'))) {
      return { name: rel, urlPath: `/${rel}/index.html`, dir: tryP, outDefault: path.join(tryP, 'slides.pdf') };
    }
    throw new Error(`Deck no encontrado: ${arg}. Usa "samples/<nombre>" o deja vacío para la raíz.`);
  }
  if (rel.startsWith('framework/')) rel = rel.slice('framework/'.length);
  // rel = samples/02-diagrams
  const dir = path.join(FRAMEWORK, rel);
  if (!fs.existsSync(path.join(dir, 'index.html'))) throw new Error(`Deck no encontrado: ${dir}/index.html`);
  return {
    name: rel,
    urlPath: `/framework/${rel}/index.html`,
    dir,
    outDefault: path.join(dir, 'slides.pdf'),
  };
}

const deck = resolveDeck(deckArg);
const outPath = outArg ? path.resolve(outArg) : deck.outDefault;

// ---- servidor estático (igual que verify.mjs) ----
function serve(p) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let urlPath = decodeURIComponent(req.url.split('?')[0]);
      if (urlPath === '/') urlPath = '/index.html';
      if (urlPath.includes('..')) { res.writeHead(403); res.end(); return; }
      let base = PRESENTATION;
      let rel = urlPath;
      if (urlPath.startsWith('/framework/')) {
        base = FRAMEWORK;
        rel = urlPath.slice('/framework'.length);
      }
      const file = path.join(base, rel);
      if (!file.startsWith(base) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); res.end('not found: ' + urlPath); return;
      }
      const ext = path.extname(file);
      const types = { '.html': 'text/html', '.md': 'text/plain', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.woff2': 'font/woff2', '.woff': 'font/woff' };
      res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(p, '127.0.0.1', () => resolve(server));
  });
}

async function waitForSlideReady(page) {
  await page.waitForFunction(() => document.querySelectorAll('.sd-slide').length > 0, null, { timeout: 15000 });
  // esperar mermaid e imágenes de la slide activa
  await page.waitForFunction(() => {
    const s = document.querySelector('.sd-slide.sd-active');
    if (!s) return true;
    const ds = s.querySelectorAll('sd-diagram[type="mermaid"]');
    if (ds.length && !Array.from(ds).every((d) => d.dataset.rendered === '1' || !!d.querySelector('.sd-diagram-error'))) return false;
    const imgs = Array.from(s.querySelectorAll('img'));
    if (!imgs.every((i) => i.complete)) return false;
    return true;
  }, null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(80);
}

async function prepareSlide(page, idx) {
  await page.evaluate((i) => {
    const d = document.querySelector('sd-deck');
    // _show con noAnim deja solo la slide activa visible, sin z-index de leaving
    d._show(i, 0, { noAnim: true });
    // revelar todos los fragmentos (PDF estático = estado final)
    const total = d._fragStats[i] || 0;
    if (total > 0) {
      d._fragIndex = total;
      d._applyFragments(d._slides[i]);
    }
  }, idx);
  await waitForSlideReady(page);
}

async function exportVector(page, out) {
  const url = `http://127.0.0.1:${port}${deck.urlPath}`;
  console.log(`→ ${deck.name}  ${url}`);
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelectorAll('.sd-slide').length > 0, null, { timeout: 15000 });

  const total = await page.evaluate(() => document.querySelectorAll('.sd-slide').length);
  console.log(`  ${total} diapositivas, preparando (fragmentos revelados)...`);
  // activar la primera para que el DOM esté listo, luego recorrer todas revelando
  // fragmentos antes de imprimir. page.pdf pagina según print.css (break-after:page),
  // así que basta con revelar todas a la vez vía JS en la página.
  await page.evaluate(() => {
    const d = document.querySelector('sd-deck');
    if (!d) return;
    // revelar todos los fragmentos de todas las slides para el print
    d._slides.forEach((s, i) => {
      const tot = d._fragStats[i] || 0;
      if (tot > 0) {
        // simular que esa slide estuvo activa con todos revelados: marcar .sd-revealed
        s.querySelectorAll('.fragment').forEach((f) => f.classList.add('sd-revealed'));
      }
    });
  });

  // asegurar que todas las imágenes y mermaid de todo el deck están listas
  await page.waitForFunction(() => {
    const ds = document.querySelectorAll('sd-diagram[type="mermaid"]');
    if (ds.length && !Array.from(ds).every((d) => d.dataset.rendered === '1' || !!d.querySelector('.sd-diagram-error'))) return false;
    const imgs = Array.from(document.querySelectorAll('img'));
    if (!imgs.every((i) => i.complete)) return false;
    return true;
  }, null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(120);

  // page.pdf respeta @page { size:1280px 720px } de print.css
  await page.pdf({
    path: out,
    width: '1280px',
    height: '720px',
    printBackground: true,
    preferCSSPageSize: true,
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
  });
  console.log(`  PDF vector escrito: ${out}`);
  return total;
}

async function exportRaster(page, out) {
  const { PDFDocument } = await import('pdf-lib');
  const url = `http://127.0.0.1:${port}${deck.urlPath}`;
  console.log(`→ ${deck.name} (raster)  ${url}`);
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelectorAll('.sd-slide').length > 0, null, { timeout: 15000 });
  const total = await page.evaluate(() => document.querySelectorAll('.sd-slide').length);
  console.log(`  ${total} diapositivas, capturando a 1280×720...`);

  const pdfDoc = await PDFDocument.create();
  for (let i = 0; i < total; i++) {
    await prepareSlide(page, i);
    const slide = page.locator(`.sd-slide[data-idx="${i}"]`);
    const png = await slide.screenshot({ type: 'png' });
    const img = await pdfDoc.embedPng(png);
    const pg = pdfDoc.addPage([1280, 720]);
    pg.drawImage(img, { x: 0, y: 0, width: 1280, height: 720 });
    console.log(`    [${i + 1}/${total}] capturada`);
  }
  const bytes = await pdfDoc.save();
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, bytes);
  console.log(`  PDF raster escrito: ${out}`);
  return total;
}

async function main() {
  const server = await serve(port);
  // viewport exacto 1280×720 → --sd-scale = 1, sin escalado
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  try {
    const n = raster ? await exportRaster(page, outPath) : await exportVector(page, outPath);
    const st = fs.statSync(outPath);
    console.log(`\nHecho: ${n} páginas, ${(st.size / 1024).toFixed(0)} KB → ${outPath}`);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((e) => { console.error('Error export PDF:', e); process.exit(1); });
