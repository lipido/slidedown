/**
 * Servidor de desarrollo de slidedown con autoreload.
 *
 * Uso (desde framework/):
 *   npm run serve                  # http://localhost:8000
 *   npm run serve -- --port 9000   # otro puerto
 *
 * Sirve la presentación (raíz del proyecto) y el framework igual que un
 * servidor estático (con caché desactivada) y además vigila los ficheros
 * de la presentación: al guardar cambios avisa al navegador por SSE.
 *
 *   - *.md  → recarga suave del deck (SdDeck.reload(): re-renderiza el
 *             markdown conservando la diapositiva actual)
 *   - resto → recarga completa (CSS, HTML, JS, imágenes)
 *
 * Cero dependencias: node:http + fs.watch + EventSource del navegador.
 * El cliente se inyecta en los HTML servidos, así que index.html y los
 * samples quedan intactos y siguen funcionando con cualquier otro servidor.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// FRAMEWORK = framework/ · PRESENTATION = raíz del proyecto (la presentación)
const FRAMEWORK = path.resolve(__dirname, '..');
const PRESENTATION = path.resolve(FRAMEWORK, '..');

/* ------------------------- argumentos CLI ------------------------- */
function argPort(def) {
  const i = process.argv.indexOf('--port');
  if (i !== -1 && process.argv[i + 1] && !isNaN(parseInt(process.argv[i + 1], 10))) {
    return parseInt(process.argv[i + 1], 10);
  }
  return def;
}
const PORT = argPort(8000);
const DEBOUNCE_MS = 150;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

/* --------------------- cliente inyectado (SSE) --------------------- */
const LIVE_CLIENT = `<script>(function(){
if (!window.EventSource || window.__sdLiveReloadReady) return;
window.__sdLiveReloadReady = true;
var es = new EventSource('/__sd_sse');
window.__sdLive = false;
es.onopen = function () { window.__sdLive = true; };
es.onmessage = function (e) {
  var f = String(e.data || '').split('?')[0];
  if (/\\.md$/i.test(f)) {
    var d = document.querySelector('sd-deck[src]');
    if (d && typeof d.reload === 'function') { d.reload(); return; }
  }
  location.reload();
};
})();</script>`;

function injectLiveClient(html) {
  if (html.indexOf('__sd_sse') !== -1) return html;
  const idx = html.toLowerCase().lastIndexOf('</body>');
  if (idx === -1) return html + LIVE_CLIENT;
  return html.slice(0, idx) + LIVE_CLIENT + html.slice(idx);
}

/* --------------------------- watch + SSE --------------------------- */
const clients = new Set();

function broadcast(file) {
  for (const res of clients) {
    try { res.write('data: ' + file + '\n\n'); } catch (e) { /* cliente muerto */ }
  }
}

/* Agrupa ráfagas de eventos (los editores escriben varias veces) en un solo aviso */
const pending = new Map();
function scheduleReload(relFile) {
  const f = relFile.split(path.sep).join('/');
  const prev = pending.get(f);
  if (prev) clearTimeout(prev);
  pending.set(f, setTimeout(function () {
    pending.delete(f);
    broadcast(f);
  }, DEBOUNCE_MS));
}

/* Descarta ficheros basura de editores (swap, backups, temporales) */
function isJunk(abs) {
  const base = path.basename(abs);
  return base.startsWith('.') || base.endsWith('~') || /\.(sw[pox]|tmp|bak)$/.test(base) || /^#.*#$/.test(base);
}

function relFromPresentation(abs) {
  return path.relative(PRESENTATION, abs).split(path.sep).join('/');
}

function watchDir(dir, recursive) {
  if (!fs.existsSync(dir)) return;
  try {
    fs.watch(dir, { recursive: !!recursive }, function (_event, filename) {
      if (!filename) return;
      const abs = path.join(dir, filename);
      if (isJunk(abs)) return;
      if (!fs.existsSync(abs)) return; /* borrados temporales del editor */
      scheduleReload(relFromPresentation(abs));
    });
    console.log('  · watch ' + (path.relative(PRESENTATION, dir) || '.') + (recursive ? '/**' : ''));
  } catch (e) {
    console.warn('[serve] no se pudo vigilar ' + dir + ': ' + e.message);
  }
}

function startWatchers() {
  /* Raíz de la presentación (ficheros sueltos: slides.md, index.html, custom.css…) */
  watchDir(PRESENTATION, false);
  /* Subcarpetas propias de la presentación (p. ej. img/) */
  let entries = [];
  try { entries = fs.readdirSync(PRESENTATION, { withFileTypes: true }); } catch (e) {}
  for (const ent of entries) {
    if (!ent.isDirectory() || ent.name === 'framework' || ent.name.startsWith('.')) continue;
    watchDir(path.join(PRESENTATION, ent.name), true);
  }
  /* Partes navegables del framework (node_modules queda fuera a propósito) */
  for (const d of ['lib', 'theme', 'samples']) watchDir(path.join(FRAMEWORK, d), true);
}

/* ------------------------------ HTTP ------------------------------ */
function sendFile(res, file) {
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  if (ext === '.html') {
    /* El cliente autoreload se inyecta aquí: los fuentes quedan limpios */
    res.end(injectLiveClient(fs.readFileSync(file, 'utf8')));
  } else {
    fs.createReadStream(file).pipe(res);
  }
}

function handleSse(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-store',
    'Connection': 'keep-alive'
  });
  res.write('retry: 800\n\n');
  clients.add(res);
  const ping = setInterval(function () {
    try { res.write(': ping\n\n'); } catch (e) { /* ignorar */ }
  }, 25000);
  req.on('close', function () {
    clearInterval(ping);
    clients.delete(res);
  });
}

const server = http.createServer(function (req, res) {
  let p;
  try { p = decodeURIComponent(req.url.split('?')[0]); } catch (e) { p = req.url.split('?')[0]; }
  if (p === '/__sd_sse') { handleSse(req, res); return; }
  if (p === '/') p = '/index.html';
  if (p.includes('..')) { res.writeHead(403); res.end(); return; }
  /* /framework/* -> framework/, el resto -> presentación (raíz del proyecto) */
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
  sendFile(res, file);
});

server.on('error', function (e) {
  if (e.code === 'EADDRINUSE') {
    console.error('El puerto ' + PORT + ' está ocupado. Prueba: npm run serve -- --port ' + (PORT + 1));
    process.exit(1);
  }
  throw e;
});

server.listen(PORT, '127.0.0.1', function () {
  const real = server.address().port;
  console.log('slidedown dev server → http://localhost:' + real);
  startWatchers();
  console.log('Autoreload activo: .md → recarga suave (conserva diapositiva) · css/html/js → recarga completa');
});

process.on('SIGINT', function () {
  console.log('\nCerrando servidor dev…');
  process.exit(0);
});
