/**
 * Suite de verificación de slidedown con Playwright.
 *
 * Uso: npm test   (o: node test/verify.mjs)
 *
 * Recorre el deck raíz (slides.md) y todos los samples/, navega por cada
 * diapositiva y comprueba estructura, geometría, diagramas y ausencia de
 * errores de consola. Genera capturas por diapositiva en test/screenshots/.
 *
 * Sale con código 0 si todo pasa, o distinto de 0 si algo falla.
 */
import { chromium } from 'playwright';
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// FRAMEWORK = framework/ (lib, theme, samples, test)
const FRAMEWORK = path.resolve(__dirname, '..');
// PRESENTATION = raíz del proyecto (slides.md, index.html, custom.css, img/)
const PRESENTATION = path.resolve(FRAMEWORK, '..');
const SHOTS_DIR = path.join(__dirname, 'screenshots');
const PORT = 8923;

let pass = 0;
let fail = 0;
const failures = [];

function ok(name, extra = '') {
  pass++;
  console.log(`  PASS  ${name}${extra ? '  — ' + extra : ''}`);
}
function ko(name, extra = '') {
  fail++;
  failures.push(name + (extra ? ': ' + extra : ''));
  console.log(`  FAIL  ${name}${extra ? '  — ' + extra : ''}`);
}
function check(cond, name, extra) {
  cond ? ok(name, extra) : ko(name, extra);
}

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/') p = '/index.html';
      if (p.includes('..')) { res.writeHead(403); res.end(); return; }
      // /framework/* -> framework/, el resto -> presentación (raíz del proyecto)
      let base = PRESENTATION;
      let rel = p;
      if (p.startsWith('/framework/')) {
        base = FRAMEWORK;
        rel = p.slice('/framework'.length);
      }
      const file = path.join(base, rel);
      if (!file.startsWith(base) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); res.end('not found'); return;
      }
      const ext = path.extname(file);
      const types = { '.html': 'text/html', '.md': 'text/plain', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };
      res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

/* Puerto libre para no chocar con el servidor de la suite (PORT) */
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
}

function waitForHttp(url, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    function attempt() {
      const req = http.get(url, (res) => { res.resume(); res.statusCode === 200 ? resolve() : retry(); });
      req.on('error', retry);
    }
    function retry() {
      if (Date.now() - t0 > timeoutMs) return reject(new Error('el servidor dev no responde: ' + url));
      setTimeout(attempt, 150);
    }
    attempt();
  });
}

/* ---- verificación del servidor dev con autoreload (test/serve.mjs) ----
   Arranca serve.mjs en un puerto libre, abre la presentación y comprueba:
   conexión SSE, recarga suave al editar slides.md (sin recarga completa,
   conservando la diapositiva actual y renderizando el markdown nuevo) y
   recarga completa al cambiar CSS. Restaura los ficheros editados. */
async function testAutoreload(browser) {
  const slidesMd = path.join(PRESENTATION, 'slides.md');
  const customCss = path.join(PRESENTATION, 'custom.css');
  const originalMd = fs.readFileSync(slidesMd, 'utf8');
  const originalCss = fs.readFileSync(customCss, 'utf8');

  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const proc = spawn(process.execPath, [path.join(FRAMEWORK, 'test', 'serve.mjs'), '--port', String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
  const out = [];
  proc.stdout.on('data', (d) => out.push(d));
  proc.stderr.on('data', (d) => out.push(d));

  const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  const failsBefore = fail;

  try {
    await waitForHttp(`${base}/index.html`);
    await page.goto(`${base}/index.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.querySelectorAll('.sd-slide').length > 0, null, { timeout: 15000 });

    await page.waitForFunction(() => window.__sdLive === true, null, { timeout: 8000 });
    check(true, 'cliente autoreload conectado (SSE)');

    const total0 = await page.evaluate(() => document.querySelectorAll('.sd-slide').length);

    // ir a la diapositiva 2 y marcar la ventana para distinguir
    // recarga suave (marca viva) de recarga completa (marca perdida)
    await page.evaluate(() => {
      document.querySelector('sd-deck')._show(1, 0, { noAnim: true });
      window.__noFullReload = true;
    });

    // --- editar slides.md: nueva diapositiva marcadora al final ---
    fs.writeFileSync(slidesMd, originalMd.replace(/\s*$/, '\n\n---\n\n<!-- slide: layout=section -->\n# AUTORELOAD_OK\n'));
    // esperar al re-render completo: nº de slides Y contador ya actualizados
    // (evita leer el contador a mitad de _load, antes de _show)
    await page.waitForFunction((n) => {
      const c = document.querySelector('.sd-counter');
      return document.querySelectorAll('.sd-slide').length === n + 1 && !!c && c.textContent.trim() === `2 / ${n + 1}`;
    }, total0, { timeout: 15000 });
    check(await page.evaluate(() => window.__noFullReload === true), 'md cambiado → recarga suave (sin recarga completa)');
    check(await page.evaluate(() => !document.querySelector('.sd-error')), 'recarga suave sin errores de render');
    const counter = await page.evaluate(() => document.querySelector('.sd-counter').textContent.trim());
    check(counter === `2 / ${total0 + 1}`, 'diapositiva actual conservada', counter);
    const markerRendered = await page.evaluate(() => {
      const ss = document.querySelectorAll('.sd-slide');
      const last = ss[ss.length - 1];
      return !!last && last.textContent.includes('AUTORELOAD_OK');
    });
    check(markerRendered, 'markdown nuevo renderizado en la última slide');

    // --- restaurar slides.md ---
    fs.writeFileSync(slidesMd, originalMd);
    await page.waitForFunction((n) => document.querySelectorAll('.sd-slide').length === n, total0, { timeout: 15000 });
    check(true, 'restauración de slides.md aplicada');

    // --- cambiar custom.css → recarga completa (la marca desaparece) ---
    fs.writeFileSync(customCss, originalCss + '\n/* autoreload-check */\n');
    await page.waitForFunction(() => window.__noFullReload === undefined, null, { timeout: 15000 });
    check(true, 'css cambiado → recarga completa');

    check(errs.length === 0, 'sin errores de consola durante autoreload', errs[0] || '');
  } catch (e) {
    ko('autoreload', e.message);
  } finally {
    fs.writeFileSync(slidesMd, originalMd);
    fs.writeFileSync(customCss, originalCss);
    await page.close();
    proc.kill();
    if (fail > failsBefore) console.log('[serve.mjs]\n' + out.join(''));
  }
}

/* ---- verificación de varias presentaciones .md en la raíz ----
   El framework permite cargar cualquier .md de la raíz con ?md=<archivo>
   (index.html?md=tema1.md). Se comprueba en navegador (override del src del
   deck) y en el CLI de export (node test/export-pdf.mjs tema1.md → tema1.pdf).
   Se crea un .md temporal en la raíz y se elimina al terminar. */
async function testMdDecks(browser) {
  const testMd = path.join(PRESENTATION, '_sd_verify_test.md');
  const mdContent = '# Prueba ?md=\n\nPrimera diapositiva\n\n---\n\n<!-- slide: layout=section -->\n## Segunda ?md=\n';
  const exportOut = path.join(__dirname, 'pdf', 'verify-md.pdf');
  fs.writeFileSync(testMd, mdContent);
  const failsBefore = fail;
  let page = null;
  let out = [];
  try {
    // --- navegador: index.html?md=<archivo> ---
    page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errs = [];
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    await page.goto(`http://127.0.0.1:${PORT}/index.html?md=${encodeURIComponent('_sd_verify_test.md')}`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.querySelectorAll('.sd-slide').length > 0, null, { timeout: 15000 });
    const total = await page.evaluate(() => document.querySelectorAll('.sd-slide').length);
    check(total === 2, '?md= carga el .md elegido', `${total} slides`);
    const txt = await page.evaluate(() => document.body.textContent);
    check(txt.includes('Prueba ?md=') && txt.includes('Segunda ?md='), '?md= renderiza el contenido del .md');
    check(errs.length === 0, '?md= sin errores de consola', errs[0] || '');
    await page.close();
    page = null;

    // --- CLI: export-pdf.mjs con un .md de la raíz ---
    const port = await freePort();
    const proc = spawn(process.execPath, [path.join(FRAMEWORK, 'test', 'export-pdf.mjs'), '_sd_verify_test.md', '--out', exportOut, '--port', String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
    proc.stdout.on('data', (d) => out.push(d));
    proc.stderr.on('data', (d) => out.push(d));
    const code = await new Promise((resolve) => proc.on('close', resolve));
    check(code === 0, 'export-pdf <archivo.md> termina sin error', code === 0 ? '' : out.join(''));
    if (code === 0 && fs.existsSync(exportOut)) {
      const bytes = fs.readFileSync(exportOut);
      check(bytes.subarray(0, 4).toString() === '%PDF', 'export-pdf <archivo.md> cabecera %PDF');
      try {
        const { PDFDocument } = await import('pdf-lib');
        const doc = await PDFDocument.load(bytes);
        check(doc.getPageCount() === 2, 'export-pdf <archivo.md> nº páginas', `${doc.getPageCount()} vs 2`);
      } catch (e) {
        ko('export-pdf <archivo.md> inspección con pdf-lib', e.message);
      }
    }
  } catch (e) {
    ko('?md= / export-pdf <archivo.md>', e.message);
  } finally {
    try { fs.unlinkSync(testMd); } catch (e) {}
    try { if (page) await page.close(); } catch (e) {}
    if (fail > failsBefore) console.log('[?md=]\n' + out.join(''));
  }
}

function findDecks() {
  const decks = [];
  // presentación raíz (slides.md + index.html del proyecto)
  if (fs.existsSync(path.join(PRESENTATION, 'slides.md'))) {
    decks.push({ name: 'RAÍZ (slides.md)', url: `http://127.0.0.1:${PORT}/index.html` });
  }
  // samples del framework (framework/samples/*)
  const samplesDir = path.join(FRAMEWORK, 'samples');
  if (fs.existsSync(samplesDir)) {
    for (const d of fs.readdirSync(samplesDir)) {
      const p = path.join(samplesDir, d);
      if (fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, 'index.html'))) {
        decks.push({ name: `samples/${d}`, url: `http://127.0.0.1:${PORT}/framework/samples/${d}/index.html` });
      }
    }
  }
  return decks;
}

async function inspectSlide(page, idx, total) {
  const r = await page.evaluate(({ idx }) => {
    const s = document.querySelector(`.sd-slide[data-idx="${idx}"]`);
    if (!s) return { err: 'slide no encontrada' };
    const results = { layout: s.dataset.layout, transition: s.dataset.transition, notes: s.dataset.notes || '', slideId: s.id || '' };

    // --- Errores de render ---
    results.hasErrorBox = !!s.querySelector('.sd-error, .sd-diagram-error');

    // --- Fondo de diapositiva (bg=) ---
    results.bg = { applied: false, loaded: false, src: null };
    const bgImage = s.style.backgroundImage || '';
    const urlMatch = bgImage.match(/url\(["']?([^"')]+)["']?\)/);
    if (urlMatch) {
      results.bg.applied = true;
      results.bg.src = urlMatch[1];
      // comprobar que la imagen de fondo carga (no rota)
      const im = new Image();
      im.src = urlMatch[1];
      results.bg.loaded = im.complete && im.naturalWidth > 0;
    }

    // --- Markdown crudo sin parsear dentro de columnas ---
    results.rawColMd = (() => {
      let n = 0;
      s.querySelectorAll('.col').forEach((c) => {
        for (const child of c.children) {
          if (child.nodeType === 1 && /^##|^###|^- |^:::/.test(child.textContent.trim())) n++;
        }
      });
      return n;
    })();

    // --- Columnas agrupadas ---
    results.colGroups = [];
    s.querySelectorAll('.sd-cols').forEach((wrap) => {
      const count = wrap.dataset.count;
      const cols = wrap.querySelectorAll(':scope > .col');
      const g = { count, ncols: cols.length, rects: [] };
      if (cols.length >= 2) {
        const r0 = cols[0].getBoundingClientRect();
        const r1 = cols[1].getBoundingClientRect();
        g.rects = [Math.round(r0.left), Math.round(r1.left), Math.round(r0.top), Math.round(r1.top)];
        g.sideBySide = r1.left >= r0.right - 1;
        g.inDocumentOrder = r0.left < r1.left;
        g.sameRow = Math.abs(r0.top - r1.top) <= 1;
      }
      // contenido parseado dentro de cada col
      g.parsed = true;
      cols.forEach((c) => {
        for (const child of c.children) {
          if (child.nodeType === 1 && /^##|^###|^- |^:::/.test(child.textContent.trim())) g.parsed = false;
        }
      });
      results.colGroups.push(g);
    });

    // --- Cajas con posicionamiento libre ---
    results.boxes = [];
    s.querySelectorAll('.textbox, .box, [class*="pos-"]').forEach((b) => {
      if (!b.classList.contains('col') && !b.classList.contains('sd-cols')) {
        const r = b.getBoundingClientRect();
        results.boxes.push({ el: b, cls: b.className, id: b.id || null, l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) });
      }
    });
    // solapes entre cajas posicionadas, excluyendo cajas anidadas (descendientes)
    results.overlaps = [];
    const pos = results.boxes.filter((b) => b.w > 0 && b.h > 0);
    const isNested = (b) => pos.some((o) => o.el !== b.el && o.el.contains(b.el));
    for (let i = 0; i < pos.length; i++) {
      for (let j = i + 1; j < pos.length; j++) {
        const a = pos[i], b = pos[j];
        if (isNested(a) || isNested(b)) continue;
        const ox = Math.min(a.l + a.w, b.l + b.w) - Math.max(a.l, b.l);
        const oy = Math.min(a.t + a.h, b.t + b.h) - Math.max(a.t, b.t);
        if (ox > 5 && oy > 5) results.overlaps.push(`${a.id || a.cls} ↔ ${b.id || b.cls}`);
      }
    }

    // --- ¿Algo pisa el título? (cajas o SVG de flechas sobre h1/h2) ---
    results.titleOverlaps = [];
    const titles = Array.from(s.querySelectorAll('h1, h2'));
    if (titles.length) {
      const titleRects = titles.map((t) => {
        const r = t.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
      });
      const overlapsTitle = (r) => titleRects.some((tr) => {
        const ox = Math.min(r.right, tr.right) - Math.max(r.left, tr.left);
        const oy = Math.min(r.bottom, tr.bottom) - Math.max(r.top, tr.top);
        return ox > 8 && oy > 8;
      });
      // cajas posicionadas (no anidadas, con fondo visible)
      pos.forEach((b) => {
        if (isNested(b)) return;
        const r = { left: b.l, top: b.t, right: b.l + b.w, bottom: b.t + b.h };
        if (overlapsTitle(r)) results.titleOverlaps.push(`caja ${b.id || b.cls}`);
      });
      // contenedores de flechas: su SVG no debe cubrir el título
      s.querySelectorAll('.arrow svg').forEach((svg) => {
        const r = svg.getBoundingClientRect();
        if (overlapsTitle({ left: r.left, top: r.top, right: r.right, bottom: r.bottom })) {
          results.titleOverlaps.push(`svg de flecha`);
        }
      });
    }

    // --- Flechas ::: arrow ::: ---
    results.arrows = [];
    s.querySelectorAll('.arrow[data-from][data-to]').forEach((a) => {
      const from = s.querySelector('#' + CSS.escape(a.dataset.from));
      const to = s.querySelector('#' + CSS.escape(a.dataset.to));
      const path = a.querySelector('svg path[marker-end]');
      let geom = null;
      if (path && from && to) {
        const nums = path.getAttribute('d').match(/-?\d+(?:\.\d+)?/g).map(Number);
        const start = { x: nums[0], y: nums[1] };
        const n = nums.length;
        const end = { x: nums[n - 2], y: nums[n - 1] };
        // El SVG de la flecha cubre su contenedor de referencia (slide o
        // canvas). Las coordenadas del path son relativas a ese contenedor.
        // Para verificar que la flecha coincide con la caja en pantalla,
        // traducimos a coordenadas absolutas: rect del SVG + path.
        const svgRect = a.querySelector('svg').getBoundingClientRect();
        const startAbs = { x: svgRect.left + start.x, y: svgRect.top + start.y };
        const endAbs = { x: svgRect.left + end.x, y: svgRect.top + end.y };
        // rect absoluto de las cajas (en pantalla)
        const raAbs = from.getBoundingClientRect();
        const rbAbs = to.getBoundingClientRect();
        // tolerancia (subdivisión aproxima el borde)
        const TOL = 35;
        const onEdgeStart =
          startAbs.x <= raAbs.left + TOL || startAbs.x >= raAbs.right - TOL ||
          startAbs.y <= raAbs.top + TOL || startAbs.y >= raAbs.bottom - TOL;
        const onEdgeEnd =
          endAbs.x <= rbAbs.left + TOL || endAbs.x >= rbAbs.right - TOL ||
          endAbs.y <= rbAbs.top + TOL || endAbs.y >= rbAbs.bottom - TOL;
        // el punto debe estar cerca de la caja (para detectar desplazamientos
        // del SVG que hagan que la flecha no coincida con las cajas)
        const nearStartBox =
          startAbs.x >= raAbs.left - TOL && startAbs.x <= raAbs.right + TOL &&
          startAbs.y >= raAbs.top - TOL && startAbs.y <= raAbs.bottom + TOL;
        const nearEndBox =
          endAbs.x >= rbAbs.left - TOL && endAbs.x <= rbAbs.right + TOL &&
          endAbs.y >= rbAbs.top - TOL && endAbs.y <= rbAbs.bottom + TOL;
        const cxA = raAbs.left + raAbs.width / 2, cyA = raAbs.top + raAbs.height / 2;
        const cxB = rbAbs.left + rbAbs.width / 2, cyB = rbAbs.top + rbAbs.height / 2;
        const distStart = Math.hypot(startAbs.x - cxA, startAbs.y - cyA);
        const distEnd = Math.hypot(endAbs.x - cxB, endAbs.y - cyB);
        // Orientación de la punta (tangente final en la misma dirección que
        // centro-origen -> centro-destino)
        const c2x = nums[n - 4], c2y = nums[n - 3];
        const tEndX = end.x - c2x, tEndY = end.y - c2y;
        const dirX = cxB - cxA, dirY = cyB - cyA;
        const dot = tEndX * dirX + tEndY * dirY;
        geom = {
          onEdgeStart, onEdgeEnd, nearStartBox, nearEndBox,
          distStart, distEnd, tipPointsForward: dot > 0
        };
      }
      results.arrows.push({
        from: a.dataset.from,
        to: a.dataset.to,
        fromExists: !!from,
        toExists: !!to,
        hasSvg: !!path,
        geom
      });
    });

    // --- Mermaid ---
    results.mermaid = { count: s.querySelectorAll('sd-diagram[type="mermaid"]').length, ok: true };
    s.querySelectorAll('sd-diagram[type="mermaid"]').forEach((d) => {
      if (!d.querySelector('svg')) results.mermaid.ok = false;
    });

    // --- Fragments ---
    results.fragCount = s.querySelectorAll('.fragment').length;

    // --- Imágenes ---
    results.images = [];
    s.querySelectorAll('img').forEach((img) => {
      const r = img.getBoundingClientRect();
      const sr = s.getBoundingClientRect();
      // ¿la imagen está dentro de una caja posicionada (textbox/box)?
      const box = img.closest('.textbox, .box');
      let boxOverflow = false;
      if (box) {
        const br = box.getBoundingClientRect();
        // la imagen no debe desbordar los límites de su caja
        boxOverflow = r.right > br.right + 2 || r.left < br.left - 2 || r.bottom > br.bottom + 2;
      }
      results.images.push({
        src: img.getAttribute('src'),
        loaded: img.complete && img.naturalWidth > 0,
        broken: img.complete && img.naturalWidth === 0,
        inBox: !!box,
        boxOverflow,
        overflowX: r.right > sr.right + 1 || r.left < sr.left - 1,
        overflowY: r.bottom > sr.bottom + 1
      });
    });

    // --- Truncado (todo cabe) — sagrado ---
    // OJO: el marco va escalado (--sd-scale), así que getBoundingClientRect()
    // devuelve px de pantalla y clientHeight/scrollHeight px de layout.
    // Convertimos todo a px de layout con ratio = sr.height / clientHeight.
    results.trunc = { trunc: false, lastOut: false, imgOut: false, scale: 1, needed: 0, available: 0 };
    const content = s.querySelector('.sd-content');
    if (content) {
      const cs = getComputedStyle(s);
      const sr = s.getBoundingClientRect();
      const ratio = s.clientHeight ? (sr.height / s.clientHeight) : 1;
      const availLayout = s.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      const neededLayout = content.scrollHeight; // layout px, ya incluye efecto de zoom en hijos
      // altura visual del contenido llevada a px de layout (rect está en pantalla)
      const neededVisualLayout = content.getBoundingClientRect().height / ratio / (content.style.zoom ? parseFloat(content.style.zoom) : 1);
      let scale = 1;
      const zoomVal = content.style.zoom || getComputedStyle(content).zoom;
      if (zoomVal && zoomVal !== 'normal' && !isNaN(parseFloat(zoomVal))) scale = parseFloat(zoomVal);
      else {
        const v = content.style.getPropertyValue('--sd-content-scale') || getComputedStyle(content).getPropertyValue('--sd-content-scale');
        if (v && !isNaN(parseFloat(v))) scale = parseFloat(v);
      }
      results.trunc.needed = Math.round(neededVisualLayout);
      results.trunc.available = Math.round(availLayout);
      results.trunc.scale = Number(scale.toFixed(2));
      // Trunc si aun tras el zoom el contenido lógico no cabe en el área útil
      results.trunc.trunc = neededVisualLayout > availLayout + 4;
      const last = content.lastElementChild;
      if (last) {
        const r = last.getBoundingClientRect();
        const padBottomScreen = parseFloat(cs.paddingBottom) * ratio;
        results.trunc.lastOut = r.bottom > sr.bottom - padBottomScreen + 4;
      }
      s.querySelectorAll('img').forEach(img => {
        const r = img.getBoundingClientRect();
        if (r.bottom > sr.bottom + 2 || r.right > sr.right + 2) results.trunc.imgOut = true;
      });
    }

    results.boxes = results.boxes.map(({ el, ...rest }) => rest);

    return results;
  }, { idx });

  const name = `[${idx + 1}/${total}] ${r.layout || '?'}`;
  if (r.err) { ko(name + ' — carga', r.err); return; }
  check(!r.hasErrorBox, name + ' — sin caja de error', r.hasErrorBox ? 'hay sd-error' : '');
  if (r.bg.applied) {
    check(r.bg.loaded, name + ' — fondo de diapositiva cargó', r.bg.src || '(sin src)');
  }
  check(r.rawColMd === 0, name + ' — cols sin markdown crudo', r.rawColMd ? `${r.rawColMd} bloque(s) crudo(s)` : '');
  if (r.slideId) {
    check(/^[a-zA-Z][\w-]*$/.test(r.slideId), name + ' — id de slide válido', r.slideId);
  }
  for (const g of r.colGroups) {
    const gn = `${name} — col(s) ${g.count}`;
    check(g.ncols === Number(g.count), gn + ' nº de cols', `${g.ncols} != ${g.count}`);
    if (g.ncols >= 2) {
      check(g.sideBySide, gn + ' lado a lado', g.rects.join(','));
      check(g.inDocumentOrder, gn + ' en orden', g.rects.join(','));
      check(g.sameRow, gn + ' misma fila', g.rects.join(','));
    }
    check(g.parsed, gn + ' contenido parseado');
  }
  check(r.overlaps.length === 0, name + ' — sin solapes de cajas', r.overlaps.length ? r.overlaps.join('; ') : '');
  check(r.titleOverlaps.length === 0, name + ' — nada pisa el título', r.titleOverlaps.length ? r.titleOverlaps.join('; ') : '');
  for (const a of r.arrows) {
    check(a.fromExists && a.toExists, name + ' — flecha targets válidos', `${a.from}→${a.to}`);
    check(a.hasSvg, name + ' — flecha con SVG', `${a.from}→${a.to}`);
    if (a.geom) {
      check(a.geom.onEdgeStart, name + ' — flecha sale del borde', `${a.from} (d=${a.geom.distStart.toFixed(0)})`);
      check(a.geom.onEdgeEnd, name + ' — flecha llega al borde', `${a.to} (d=${a.geom.distEnd.toFixed(0)})`);
      check(a.geom.distStart > 10, name + ' — flecha no sale del centro', `${a.from} d=${a.geom.distStart.toFixed(0)}`);
      check(a.geom.distEnd > 10, name + ' — flecha no llega al centro', `${a.to} d=${a.geom.distEnd.toFixed(0)}`);
      check(a.geom.tipPointsForward, name + ' — punta bien orientada', `${a.from}→${a.to}`);
      check(a.geom.nearStartBox, name + ' — flecha coincide con caja origen', `${a.from}`);
      check(a.geom.nearEndBox, name + ' — flecha coincide con caja destino', `${a.to}`);
    }
  }
  check(r.mermaid.ok, name + ' — mermaid renderizado', r.mermaid.count ? `${r.mermaid.count} diagrama(s)` : '');
  for (const im of r.images) {
    check(im.loaded && !im.broken, name + ' — imagen cargada', im.src || '(sin src)');
    check(!im.overflowX && !im.overflowY, name + ' — imagen sin desborde', im.src || '(sin src)');
    if (im.inBox) {
      check(!im.boxOverflow, name + ' — imagen dentro de caja sin desborde', im.src || '(sin src)');
    }
  }
  // Sagrada: todo cabe sin truncado (visual: nada sale de la diapositiva)
  check(!r.trunc.lastOut && !r.trunc.imgOut, name + ' — sin truncado (todo cabe)', `scale ${r.trunc.scale} needed ${r.trunc.needed} avail ${r.trunc.available}${r.trunc.lastOut?' lastOut':''}${r.trunc.imgOut?' imgOut':''}`);
}

async function run() {
  const server = await serve();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });

  const consoleErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));

  fs.mkdirSync(SHOTS_DIR, { recursive: true });

  for (const deck of findDecks()) {
    console.log(`\n=== ${deck.name} ===`);
    consoleErrors.length = 0;
    await page.goto(deck.url, { waitUntil: 'load' });
    await page.waitForFunction(() => document.querySelectorAll('.sd-slide').length > 0, null, { timeout: 15000 });

    // el custom.css de la presentación debe estar enlazado (capa de overrides)
    const hasCustomCss = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
        .some((l) => (l.getAttribute('href') || '').includes('custom.css'));
    });
    check(hasCustomCss, `— custom.css enlazado`, deck.name);

    const total = await page.evaluate(() => document.querySelectorAll('.sd-slide').length);
    for (let i = 0; i < total; i++) {
      // activar diapositiva i (sin animación, geometría estable)
      await page.evaluate((idx) => {
        const deck = document.querySelector('sd-deck');
        deck._show(idx, 0, { noAnim: true });
      }, i);
      await page.waitForTimeout(60);
      // esperar a que cualquier diagrama mermaid de esta diapositiva termine
      // de renderizarse (render asíncrono) antes de inspeccionar
      await page.waitForFunction(() => {
        const s = document.querySelector('.sd-slide.sd-active');
        if (!s) return true;
        const ds = s.querySelectorAll('sd-diagram[type="mermaid"]');
        if (!ds.length) return true;
        return Array.from(ds).every((d) => d.dataset.rendered === '1' || !!d.querySelector('.sd-diagram-error'));
      }, null, { timeout: 15000 }).catch(() => {});
      // esperar a que las imágenes de la diapositiva activa terminen de cargar
      await page.waitForFunction(() => {
        const s = document.querySelector('.sd-slide.sd-active');
        if (!s) return true;
        const imgs = Array.from(s.querySelectorAll('img'));
        return imgs.every((i) => i.complete);
      }, null, { timeout: 10000 }).catch(() => {});
      // esperar a que highlight.js termine (carga perezosa)
      await page.waitForFunction(() => {
        const s = document.querySelector('.sd-slide.sd-active');
        if (!s) return true;
        const codes = s.querySelectorAll('pre code');
        if (!codes.length) return true;
        // si no hay hljs aún, puede que no haya código que resaltar; esperar a que cargue o timeout
        if (!window.hljs) return false;
        return Array.from(codes).every((c) => c.classList.contains('hljs'));
      }, null, { timeout: 8000 }).catch(() => {});
      // esperar a que auto-fit termine (todo cabe sin truncado) — unidades consistentes
      await page.waitForFunction(() => {
        const s = document.querySelector('.sd-slide.sd-active');
        if (!s) return true;
        const c = s.querySelector('.sd-content');
        if (!c) return true;
        const cs = getComputedStyle(s);
        const sr = s.getBoundingClientRect();
        const ratio = s.clientHeight ? (sr.height / s.clientHeight) : 1;
        const availScreen = (s.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)) * ratio;
        return c.getBoundingClientRect().height <= availScreen + 4;
      }, null, { timeout: 5000 }).catch(() => {});
      // pequeño margen para que el listener 'load' redibuje las flechas
      await page.waitForTimeout(60);
      await inspectSlide(page, i, total);
      const slug = deck.name.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
      await page.screenshot({ path: path.join(SHOTS_DIR, `${slug}_${String(i).padStart(2, '0')}.png`) });
    }
    check(consoleErrors.length === 0, `— sin errores de consola (${total} diapos)`, consoleErrors.length ? consoleErrors[0] : '');
  }

  // ---- verificación autoreload (servidor dev: npm run serve) ----
  await testAutoreload(browser);

  // ---- verificación de varias presentaciones .md en la raíz (?md=) ----
  console.log('\n=== Varias presentaciones .md en la raíz (?md=) ===');
  await testMdDecks(browser);

  // ---- verificación PDF vector (pixel-perfect con texto) ----
  console.log('\n=== PDF export (vector) ===');
  try {
    const pdfOut = path.join(__dirname, 'pdf', 'verify-vector.pdf');
    fs.mkdirSync(path.dirname(pdfOut), { recursive: true });
    const pdfPage = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const rootUrl = `http://127.0.0.1:${PORT}/index.html`;
    await pdfPage.goto(rootUrl, { waitUntil: 'load' });
    await pdfPage.waitForFunction(() => document.querySelectorAll('.sd-slide').length > 0, null, { timeout: 15000 });
    await pdfPage.evaluate(() => {
      const d = document.querySelector('sd-deck');
      if (d) d._slides.forEach((s) => s.querySelectorAll('.fragment').forEach((f) => f.classList.add('sd-revealed')));
    });
    await pdfPage.waitForFunction(() => {
      const ds = document.querySelectorAll('sd-diagram[type="mermaid"]');
      if (ds.length && !Array.from(ds).every((d) => d.dataset.rendered === '1' || !!d.querySelector('.sd-diagram-error'))) return false;
      if (!Array.from(document.querySelectorAll('img')).every((i) => i.complete)) return false;
      const codes = document.querySelectorAll('pre code');
      if (codes.length && !window.hljs) return false;
      if (codes.length && !Array.from(codes).every((c) => c.classList.contains('hljs'))) return false;
      return true;
    }, null, { timeout: 20000 }).catch(() => {});
    // esperar auto-fit para PDF (unidades consistentes pantalla/layout)
    await pdfPage.waitForFunction(() => {
      return Array.from(document.querySelectorAll('.sd-slide')).every(s => {
        const c = s.querySelector('.sd-content');
        if (!c) return true;
        const cs = getComputedStyle(s);
        const sr = s.getBoundingClientRect();
        const ratio = s.clientHeight ? (sr.height / s.clientHeight) : 1;
        const availScreen = (s.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)) * ratio;
        return c.getBoundingClientRect().height <= availScreen + 4;
      });
    }, null, { timeout: 10000 }).catch(() => {});
    await pdfPage.waitForTimeout(120);
    await pdfPage.pdf({ path: pdfOut, width: '1280px', height: '720px', printBackground: true, preferCSSPageSize: true, margin: { top: '0', right: '0', bottom: '0', left: '0' } });
    const pdfBytes = fs.readFileSync(pdfOut);
    check(pdfBytes.length > 5000, 'PDF vector generado', `${(pdfBytes.length / 1024).toFixed(0)} KB`);
    check(pdfBytes.subarray(0, 4).toString() === '%PDF', 'PDF vector cabecera %PDF');
    try {
      const { PDFDocument } = await import('pdf-lib');
      const doc = await PDFDocument.load(pdfBytes);
      const nPages = doc.getPageCount();
      const expected = await pdfPage.evaluate(() => document.querySelectorAll('.sd-slide').length);
      check(nPages === expected, 'PDF vector nº páginas', `${nPages} vs ${expected} slides`);
      if (nPages > 0) {
        const p0 = doc.getPage(0);
        const w = p0.getWidth(), h = p0.getHeight();
        // 1280px CSS a 96dpi = 960pt (72dpi PDF). Chromium convierte px→pt así.
        // Aceptar ambos si el usuario ajusta @page, pero exigir 16:9.
        const dimOk = (Math.abs(w - 960) < 2 && Math.abs(h - 540) < 2) || (Math.abs(w - 1280) < 2 && Math.abs(h - 720) < 2);
        const ratioOk = Math.abs(w / h - 16 / 9) < 0.01;
        check(dimOk && ratioOk, 'PDF vector tamaño página 1280×720 px (960×540 pt)', `${w.toFixed(0)}×${h.toFixed(0)}`);
      }
    } catch (e) {
      ko('PDF vector inspección con pdf-lib', e.message);
    }
    await pdfPage.close();
  } catch (e) {
    ko('PDF vector export', e.message);
  }

  await browser.close();
  server.close();

  console.log(`\n=== Resultado: ${pass} PASS / ${fail} FAIL ===`);
  if (failures.length) {
    console.log('\nFallos:');
    failures.forEach((f) => console.log('  ✗ ' + f));
    process.exit(1);
  }
}

run().catch((e) => { console.error('Error fatal:', e); process.exit(2); });
