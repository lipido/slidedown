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
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
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
      const file = path.join(ROOT, p);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); res.end('not found'); return;
      }
      const ext = path.extname(file);
      const types = { '.html': 'text/html', '.md': 'text/plain', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };
      res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

function findDecks() {
  const decks = [];
  if (fs.existsSync(path.join(ROOT, 'slides.md'))) decks.push({ name: 'RAÍZ (slides.md)', url: `http://127.0.0.1:${PORT}/index.html` });
  const samplesDir = path.join(ROOT, 'samples');
  if (fs.existsSync(samplesDir)) {
    for (const d of fs.readdirSync(samplesDir)) {
      const p = path.join(samplesDir, d);
      if (fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, 'index.html'))) {
        decks.push({ name: `samples/${d}`, url: `http://127.0.0.1:${PORT}/samples/${d}/index.html` });
      }
    }
  }
  return decks;
}

async function inspectSlide(page, idx, total) {
  const r = await page.evaluate(({ idx }) => {
    const s = document.querySelector(`.sd-slide[data-idx="${idx}"]`);
    if (!s) return { err: 'slide no encontrada' };
    const results = { layout: s.dataset.layout, transition: s.dataset.transition, notes: s.dataset.notes || '' };

    // --- Errores de render ---
    results.hasErrorBox = !!s.querySelector('.sd-error, .sd-diagram-error');

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

    // --- Flechas ::: arrow ::: ---
    results.arrows = [];
    s.querySelectorAll('.arrow[data-from][data-to]').forEach((a) => {
      results.arrows.push({
        from: a.dataset.from,
        to: a.dataset.to,
        fromExists: !!s.querySelector('#' + CSS.escape(a.dataset.from)),
        toExists: !!s.querySelector('#' + CSS.escape(a.dataset.to)),
        hasSvg: !!a.querySelector('svg path[marker-end]')
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
      results.images.push({
        src: img.getAttribute('src'),
        loaded: img.complete && img.naturalWidth > 0,
        broken: img.complete && img.naturalWidth === 0,
        overflowX: r.right > sr.right + 1 || r.left < sr.left - 1,
        overflowY: r.bottom > sr.bottom + 1
      });
    });

    results.boxes = results.boxes.map(({ el, ...rest }) => rest);

    return results;
  }, { idx });

  const name = `[${idx + 1}/${total}] ${r.layout || '?'}`;
  if (r.err) { ko(name + ' — carga', r.err); return; }
  check(!r.hasErrorBox, name + ' — sin caja de error', r.hasErrorBox ? 'hay sd-error' : '');
  check(r.rawColMd === 0, name + ' — cols sin markdown crudo', r.rawColMd ? `${r.rawColMd} bloque(s) crudo(s)` : '');
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
  for (const a of r.arrows) {
    check(a.fromExists && a.toExists, name + ' — flecha targets válidos', `${a.from}→${a.to}`);
    check(a.hasSvg, name + ' — flecha con SVG', `${a.from}→${a.to}`);
  }
  check(r.mermaid.ok, name + ' — mermaid renderizado', r.mermaid.count ? `${r.mermaid.count} diagrama(s)` : '');
  for (const im of r.images) {
    check(im.loaded && !im.broken, name + ' — imagen cargada', im.src || '(sin src)');
    check(!im.overflowX && !im.overflowY, name + ' — imagen sin desborde', im.src || '(sin src)');
  }
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
      await inspectSlide(page, i, total);
      const slug = deck.name.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
      await page.screenshot({ path: path.join(SHOTS_DIR, `${slug}_${String(i).padStart(2, '0')}.png`) });
    }
    check(consoleErrors.length === 0, `— sin errores de consola (${total} diapos)`, consoleErrors.length ? consoleErrors[0] : '');
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
