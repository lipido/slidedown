/* ============================================================
   SLIDEDOWN — framework de presentaciones en Markdown (cero build)
   ------------------------------------------------------------
   Uso: <sd-deck src="slides.md"></sd-deck>
   o con contenido inline:
   <sd-deck><script type="text/slidedown"> ...markdown... </script></sd-deck>

   Se apoya en lib/marked.min.js (obligatorio) y, opcionalmente,
   lib/mermaid.min.js (se carga de forma perezosa solo si hay
   bloques ```mermaid).
   ============================================================ */
(function () {
  'use strict';

  var SLIDE_W = 1280;
  var SLIDE_H = 720;
  var THEMES = ['light', 'dark', 'blueprint'];
  var diagramUid = 0;
  var arrowUid = 0;
  /* Directorio de lib/, derivado del propio script para que funcione desde
     cualquier profundidad (raíz, samples/x/, etc.). */
  var LIB_DIR = (function () {
    try {
      var s = document.currentScript;
      if (s && s.src) return s.src.replace(/[^/]*$/, '');
    } catch (e) {}
    return '';
  })();

  /* ------------------------- utilidades ------------------------- */
  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  /* ------------------- frontmatter del deck -------------------- */
  function parseFrontmatter(md) {
    var m = md.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    if (!m) return { attrs: {}, body: md };
    var attrs = {};
    m[1].split('\n').forEach(function (line) {
      var mm = line.match(/^\s*([\w-]+)\s*:\s*(.+?)\s*$/);
      if (mm) attrs[mm[1]] = mm[2].replace(/^['"]|['"]$/g, '');
    });
    return { attrs: attrs, body: md.slice(m[0].length) };
  }

  /* -------------------- separar diapositivas -------------------- */
  function splitSlides(md) {
    var parts = [];
    var lines = md.split('\n');
    var cur = [];
    var fence = null;
    function flush() {
      if (cur.length && cur.some(function (l) { return l.trim() !== ''; })) {
        parts.push(cur.join('\n'));
      }
      cur = [];
    }
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (fence) {
        cur.push(line);
        if (line.trim().startsWith(fence)) fence = null;
        continue;
      }
      var fm = line.match(/^\s*(```+)/);
      if (fm) { fence = fm[1]; cur.push(line); continue; }
      if (/^\s*---\s*$/.test(line)) { flush(); continue; }
      cur.push(line);
    }
    flush();
    return parts;
  }

  /* ------------- directivas por diapositiva (comentarios) ------------- */
  function extractDirectives(md) {
    var attrs = {};
    var notes = '';
    md = md.replace(/<!--\s*slide\s*:([\s\S]*?)-->/g, function (all, inner) {
      inner.replace(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/g, function (m, k, dq, sq, nq) {
        attrs[k] = dq || sq || nq;
        return '';
      });
      return '';
    });
    md = md.replace(/<!--\s*notes\s*:\s*([\s\S]*?)-->/g, function (m, n) {
      notes += n.trim() + '\n';
      return '';
    });
    return { attrs: attrs, notes: notes.trim(), md: md };
  }

  /* ------------- fenced divs ::: clase ::: → <div> reales -------------
     Devuelve una lista de "pasos": cada paso es o bien texto markdown
     suelto, o bien {open:<etiqueta div>}, {close:true}. _renderMd recorre
     estos pasos y parsea cada fragmento de markdown POR SEPARADO con marked,
     de modo que el contenido interno de cada div se parsea como markdown
     real (títulos, listas, tablas) y queda encerrado dentro de su <div>. */
  function fencedDivs(md) {
    var lines = md.split('\n');
    var steps = [];
    var text = [];
    var fence = null;
    var depth = 0;
    function flushText() {
      if (text.length) { steps.push(text.join('\n')); text = []; }
    }
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (fence) {
        text.push(line);
        if (line.trim().startsWith(fence)) fence = null;
        continue;
      }
      var fm = line.match(/^\s*(```+)/);
      if (fm) { fence = fm[1]; text.push(line); continue; }
      var m = line.match(/^(\s*):::\s*(.*?)\s*$/);
      if (m) {
        var inner = m[2].trim();
        var selfClose = /:::$/.test(inner);
        if (selfClose) inner = inner.replace(/:::\s*$/, '').trim();
        if (inner === '') {
          if (depth > 0) {
            flushText();
            steps.push({ close: true });
            depth--;
          }
          continue;
        }
        flushText();
        steps.push({ open: inner });
        if (selfClose) steps.push({ close: true });
        else depth++;
        continue;
      }
      text.push(line);
    }
    flushText();
    while (depth-- > 0) steps.push({ close: true });
    return steps;
  }

  /* Interpreta el interior de un fenced div: clases + atributos. */
  function divSpec(inner) {
    var cls = [];
    var attrs = [];
    inner.replace(/\{([^}]*)\}/g, function (all, body) {
      body.replace(/\.([\w-]+)/g, function (m, c) { cls.push(c); return ''; });
      body.replace(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/g, function (m, k, d, s, p) {
        attrs.push([k, d || s || p]);
        return '';
      });
      return '';
    });
    inner.replace(/\{[^}]*\}/g, ' ').split(/\s+/).forEach(function (tok) {
      if (!tok) return;
      if (tok.charAt(0) === '.') { cls.push(tok.slice(1)); }
      else if (/^[\w-]+=/.test(tok)) {
        var eq = tok.indexOf('=');
        attrs.push([tok.slice(0, eq), tok.slice(eq + 1).replace(/^['"]|['"]$/g, '')]);
      } else { cls.push(tok); }
    });
    return { cls: cls, attrs: attrs };
  }

  /* Convierte la especificación de un div en su etiqueta de apertura <div>. */
  function openDivTag(spec) {
    var d = divSpec(spec.trim());
    var attrStr = d.attrs.map(function (kv) {
      return kv[0] === 'id'
        ? ' id="' + esc(kv[1]) + '"'
        : ' data-' + esc(kv[0]) + '="' + esc(kv[1]) + '"';
    }).join(' ');
    return '<div class="' + d.cls.join(' ') + '"' + attrStr + '>';
  }

  /* Convierte las imágenes markdown con clases al estilo del framework:
       ![alt](img.png){.img-w-40 .img-center}
     en HTML <img class="...">, porque marked v12 no procesa los {.clase}. */
  function imgAttrs(md) {
    return md.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)\{([^}]*)\}/g, function (m, alt, src, title, body) {
      var cls = body.replace(/\./g, ' ').trim();
      var t = title ? ' title="' + esc(title) + '"' : '';
      return '<img src="' + esc(src) + '" alt="' + esc(alt) + '"' + t + ' class="' + esc(cls) + '">';
    });
  }

  /* ----------------------- renderer marked ----------------------- */
  /* Nota: marked v12 usa la API de renderer basada en STRING:
     heading(texto, nivel), paragraph(texto), listitem(texto, task, checked),
     code(codigo, infostring, escaped). No recibe tokens. */
  function fragClass(text) {
    return /\{fragment\}\s*$/.test(text) ? ' class="fragment"' : '';
  }
  function stripFrag(text) {
    return text.replace(/\{fragment\}\s*$/, '');
  }
  var markedReady = false;
  function initMarked() {
    if (markedReady || typeof marked === 'undefined') return;
    markedReady = true;
    marked.use({
      renderer: {
        code: function (code, infostring, escaped) {
          var lang = (infostring || '').toLowerCase().split(/\s+/)[0];
          if (lang === 'mermaid') {
            return '<sd-diagram type="mermaid">' + esc(code) + '</sd-diagram>\n';
          }
          var cls = lang ? ' class="language-' + esc(lang) + '"' : '';
          code = code.replace(/\n$/, '');
          return '<pre><code' + cls + '>' + (escaped ? code : esc(code)) + '</code></pre>\n';
        },
        paragraph: function (text) {
          return '<p' + fragClass(text) + '>' + stripFrag(text) + '</p>\n';
        },
        heading: function (text, level) {
          return '<h' + level + fragClass(text) + '>' + stripFrag(text) + '</h' + level + '>\n';
        },
        listitem: function (text, task, checked) {
          var cls = fragClass(text);
          if (task) cls += ' task-list-item';
          var checkbox = task ? '<input type="checkbox" ' + (checked ? 'checked' : '') + '> ' : '';
          return '<li' + cls + '>' + checkbox + stripFrag(text) + '</li>\n';
        },
        blockquote: function (text) {
          return '<blockquote>' + text + '</blockquote>\n';
        }
      }
    });
  }

  /* ----------------- posicionamiento libre por clases ---------------- */
  function applyPositioning(root) {
    var rePos = /\bpos-(\d+)-(\d+)\b/;
    var reW = /\bw-(\d+)\b/;
    var reH = /\bh-(\d+)\b/;
    root.querySelectorAll('[class]').forEach(function (el) {
      var cls = typeof el.className === 'string' ? el.className : '';
      var p = cls.match(rePos);
      if (p) { el.style.position = 'absolute'; el.style.left = p[1] + '%'; el.style.top = p[2] + '%'; }
      var w = cls.match(reW); if (w) el.style.width = w[1] + '%';
      var h = cls.match(reH); if (h) el.style.height = h[1] + '%';
    });
  }

  /* En layout "free", separa el contenido normal (título/intro) en un header
     y las cajas posicionadas + flechas en un canvas. El canvas es el contenedor
     posicionado relativo, de modo que las coordenadas % de las cajas se calculan
     sobre el área libre (debajo del header) y no pisan el texto. */
  function splitFree(slide) {
    if (slide.dataset.layout !== 'free') return;
    var content = slide.querySelector('.sd-content');
    if (!content) return;
    var children = Array.prototype.slice.call(content.children);
    var isPositioned = function (el) {
      var cls = typeof el.className === 'string' ? el.className : '';
      return el.classList.contains('arrow') ||
        /(^|\s)textbox(\s|$)/.test(cls) ||
        /(^|\s)box(\s|$)/.test(cls) ||
        /\bpos-\d+-\d+\b/.test(cls);
    };
    var headerEls = [];
    var canvasEls = [];
    children.forEach(function (el) {
      (isPositioned(el) ? canvasEls : headerEls).push(el);
    });
    if (!headerEls.length || !canvasEls.length) return;

    var header = document.createElement('div');
    header.className = 'sd-free-header';
    headerEls.forEach(function (el) { header.appendChild(el); });

    var canvas = document.createElement('div');
    canvas.className = 'sd-free-canvas';
    canvasEls.forEach(function (el) { canvas.appendChild(el); });

    content.textContent = '';
    content.appendChild(header);
    content.appendChild(canvas);
  }

  /* ----------------- flechas entre cajas (SVG) ----------------- */
  /* La flecha sale del borde de la caja origen y llega al borde de la caja
     destino. El borde se elige automáticamente según la dirección hacia el
     otro centro, salvo que se fuerce con side=top|right|bottom|left (se
     aplica al origen) o to-side=... (se aplica al destino). */
  function renderArrows(slide) {
    var cs = getComputedStyle(document.documentElement);
    var color = cs.getPropertyValue('--sd-arrow-color').trim() || '#5b5bd6';
    var width = parseFloat(cs.getPropertyValue('--sd-arrow-width')) || 3;
    slide.querySelectorAll('.sd-arrow, .arrow').forEach(function (arrow) {
      var from = arrow.dataset.from ? slide.querySelector('#' + CSS.escape(arrow.dataset.from)) : null;
      var to = arrow.dataset.to ? slide.querySelector('#' + CSS.escape(arrow.dataset.to)) : null;
      if (!from || !to) return;
      var fromSide = arrow.dataset.side || null;
      var toSide = arrow.dataset.toSide || null;

      /* El contenedor de referencia de la flecha es su ancestro posicionado
         (aquel al que se ancla `inset:0` del .arrow): la slide en el caso
         normal, o el .sd-free-canvas cuando hay header en layout free. Las
         coordenadas se calculan relativas a él, de modo que el SVG de la
         flecha (que cubre ese contenedor) coincide con las cajas. */
      function refContainer() {
        var node = arrow.parentNode;
        while (node && node !== slide) {
          var pos = getComputedStyle(node).position;
          if (pos === 'relative' || pos === 'absolute' || pos === 'fixed' || pos === 'sticky') return node;
          node = node.parentNode;
        }
        return slide;
      }
      var refNode = refContainer();

      /* rect de un elemento en coordenadas del contenedor de referencia */
      function rect(el) {
        var r = el.getBoundingClientRect();
        var rr = refNode.getBoundingClientRect();
        return { x: r.left - rr.left, y: r.top - rr.top, w: r.width, h: r.height };
      }
      /* punto del perímetro de un rect en la dirección del vector (dx,dy) */
      function edgePoint(rc, dx, dy) {
        if (dx === 0 && dy === 0) return { x: rc.x + rc.w / 2, y: rc.y + rc.h / 2 };
        var cx = rc.x + rc.w / 2, cy = rc.y + rc.h / 2;
        // escalar al borde (línea recta centro->destino)
        var sx = (rc.w / 2) / Math.abs(dx);
        var sy = (rc.h / 2) / Math.abs(dy);
        var t = Math.min(sx, sy);
        return { x: cx + dx * t, y: cy + dy * t };
      }
      /* punto de un borde concreto (top|right|bottom|left) */
      function sidePoint(rc, side) {
        var cx = rc.x + rc.w / 2, cy = rc.y + rc.h / 2;
        switch (side) {
          case 'top': return { x: cx, y: rc.y };
          case 'bottom': return { x: cx, y: rc.y + rc.h };
          case 'left': return { x: rc.x, y: cy };
          case 'right': return { x: rc.x + rc.w, y: cy };
          default: return { x: cx, y: cy };
        }
      }
      /* punto de una bézier cúbica en t∈[0,1] */
      function bez(p0, c1, c2, p1, t) {
        var mt = 1 - t;
        var a = mt * mt * mt, b = 3 * mt * mt * t, c = 3 * mt * t * t, d = t * t * t;
        return {
          x: a * p0.x + b * c1.x + c * c2.x + d * p1.x,
          y: a * p0.y + b * c1.y + c * c2.y + d * p1.y
        };
      }
      /* ¿está el punto dentro del rect (con margen)? */
      function inside(rc, p, m) {
        m = m || 0;
        return p.x >= rc.x - m && p.x <= rc.x + rc.w + m && p.y >= rc.y - m && p.y <= rc.y + rc.h + m;
      }

      function draw() {
        if (!slide.isConnected) return;
        var sr = refNode.getBoundingClientRect();
        var ra = rect(from), rb = rect(to);
        var a = { x: ra.x + ra.w / 2, y: ra.y + ra.h / 2 };
        var b = { x: rb.x + rb.w / 2, y: rb.y + rb.h / 2 };
        var curve = parseFloat(arrow.dataset.curve || '0.25');
        var dx = b.x - a.x, dy = b.y - a.y;

        // puntos de anclaje: por defecto el borde automático; si side se fuerza
        var p0 = fromSide ? sidePoint(ra, fromSide) : edgePoint(ra, dx, dy);
        var p1 = toSide ? sidePoint(rb, toSide) : edgePoint(rb, -dx, -dy);

        // Puntos de control para la subdivisión, calculados desde los centros.
        var c1s = { x: a.x + dx * curve, y: a.y + dy * curve };
        var c2s = { x: b.x - dx * curve, y: b.y - dy * curve };

        // recorte fino por subdivisión: ajusta el punto de la curva al perímetro
        // exacto de cada caja. Solo aplica cuando NO hay side forzado (si hay
        // side, el punto de anclaje ya está en el borde exacto y se respeta).
        var start = p0;
        var end = p1;
        if (!fromSide) {
          var SAMPLES = 60;
          var pts = [];
          for (var i = 0; i <= SAMPLES; i++) pts.push(bez(a, c1s, c2s, b, i / SAMPLES));
          start = pts[0];
          for (var k = 0; k < pts.length; k++) {
            if (!inside(ra, pts[k], 0)) { start = pts[k]; break; }
          }
          if (inside(ra, start, 0)) start = p0;
        }
        if (!toSide) {
          var SAMPLES2 = 60;
          var pts2 = [];
          for (var j = 0; j <= SAMPLES2; j++) pts2.push(bez(a, c1s, c2s, b, j / SAMPLES2));
          end = pts2[pts2.length - 1];
          for (var k2 = pts2.length - 1; k2 >= 0; k2--) {
            if (inside(rb, pts2[k2], 0)) { end = pts2[k2]; break; }
          }
          if (inside(rb, end, 0)) end = p1;
        }

        // Puntos de control FINALES, calculados desde los puntos de borde
        // (start/end), NO desde los centros. Así la curva sale de start en
        // dirección a end y la punta de flecha queda bien orientada.
        var sdx = end.x - start.x, sdy = end.y - start.y;
        var c1 = { x: start.x + sdx * curve, y: start.y + sdy * curve };
        var c2 = { x: end.x - sdx * curve, y: end.y - sdy * curve };

        var mid = 'sd-arr-' + (++arrowUid);
        var d = 'M' + start.x.toFixed(1) + ' ' + start.y.toFixed(1) +
          ' C' + c1.x.toFixed(1) + ' ' + c1.y.toFixed(1) +
          ' ' + c2.x.toFixed(1) + ' ' + c2.y.toFixed(1) +
          ' ' + end.x.toFixed(1) + ' ' + end.y.toFixed(1);
        arrow.innerHTML =
          '<svg width="' + sr.width + '" height="' + sr.height + '" viewBox="0 0 ' + sr.width + ' ' + sr.height + '" aria-hidden="true">' +
          '<defs><marker id="' + mid + '" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">' +
          '<path d="M0,0 L10,5 L0,10 Z" fill="' + esc(color) + '"/></marker></defs>' +
          '<path d="' + d + '" fill="none" stroke="' + esc(color) + '" stroke-width="' + width + '" marker-end="url(#' + mid + ')"/></svg>';
      }
      draw();
      var onResize = function () { draw(); };
      var onImgLoad = function () { draw(); };
      window.addEventListener('resize', onResize);
      window.addEventListener('beforeprint', onResize);
      // redibujar cuando cualquier imagen de la slide cargue (las cajas con
      // imágenes cambian de tamaño al cargar y hay que re-anclar las flechas)
      slide.querySelectorAll('img').forEach(function (img) {
        if (!img.complete) img.addEventListener('load', onImgLoad, { once: true });
      });
      arrow._sdCleanup = function () {
        window.removeEventListener('resize', onResize);
        window.removeEventListener('beforeprint', onResize);
        slide.querySelectorAll('img').forEach(function (img) {
          img.removeEventListener('load', onImgLoad);
        });
      };
    });
  }

  /* Redibuja las flechas de una diapositiva. Limpia los listeners anteriores
     de cada flecha y vuelve a dibujarlas (idempotente). Se usa cuando el
     contenido asíncrono (mermaid, imágenes) cambia el tamaño de las cajas. */
  function redrawSlide(slide) {
    slide.querySelectorAll('.sd-arrow, .arrow').forEach(function (arrow) {
      if (arrow._sdCleanup) { arrow._sdCleanup(); arrow._sdCleanup = null; }
    });
    renderArrows(slide);
  }

  /* ---------------------- highlight (perezoso, 190 lenguajes) ---------------------- */
  function ensureHighlight() {
    return new Promise(function (resolve, reject) {
      if (window.hljs && window.hljs.highlightElement) return resolve(window.hljs);
      var s = document.createElement('script');
      s.src = LIB_DIR + 'highlight.min.js';
      s.onload = function () {
        // Carga el bundle de lenguajes tras el core
        var s2 = document.createElement('script');
        s2.src = LIB_DIR + 'highlight-languages.min.js';
        s2.onload = function () { resolve(window.hljs); };
        s2.onerror = function () {
          // Si falla el paquete de lenguajes, el core sigue siendo usable (highlight auto-detect limitado)
          resolve(window.hljs);
        };
        document.head.appendChild(s2);
      };
      s.onerror = function () { reject(new Error('No se pudo cargar lib/highlight.min.js')); };
      document.head.appendChild(s);
    });
  }
  function highlightAll(root) {
    if (!window.hljs || !window.hljs.highlightElement) return;
    root.querySelectorAll('pre code').forEach(function (block) {
      if (block.classList.contains('hljs')) return;
      try { window.hljs.highlightElement(block); } catch (e) {}
    });
  }

  /* ---------------------- mermaid (perezoso) ---------------------- */
  function ensureMermaid() {
    return new Promise(function (resolve, reject) {
      if (window.mermaid) return resolve(window.mermaid);
      var s = document.createElement('script');
      s.src = LIB_DIR + 'mermaid.min.js';
      s.onload = function () { resolve(window.mermaid); };
      s.onerror = function () { reject(new Error('No se pudo cargar lib/mermaid.min.js')); };
      document.head.appendChild(s);
    });
  }
  function mermaidThemeVars() {
    var cs = getComputedStyle(document.documentElement);
    function g(n, fb) { return (cs.getPropertyValue(n) || fb).trim(); }
    return {
      primaryColor: g('--sd-mermaid-node-bg', '#eef0fa'),
      primaryTextColor: g('--sd-mermaid-node-fg', '#1b1b2f'),
      primaryBorderColor: g('--sd-mermaid-node-border', '#5b5bd6'),
      lineColor: g('--sd-mermaid-edge', '#8a8fa3'),
      textColor: g('--sd-fg', '#1b1b2f'),
      fontSize: g('--sd-mermaid-font-size', '16px'),
      fontFamily: g('--sd-font-body', 'sans-serif'),
      noteBkgColor: g('--sd-bg-soft', '#f2f4f8'),
      noteTextColor: g('--sd-fg', '#1b1b2f'),
      clusterBkg: g('--sd-bg-soft', '#f2f4f8'),
      clusterBorder: g('--sd-border', '#e3e6ee'),
      edgeLabelBackground: g('--sd-bg', '#ffffff'),
      secondaryColor: g('--sd-bg-soft', '#f2f4f8'),
      tertiaryColor: g('--sd-bg', '#ffffff')
    };
  }

  /* Agrupa las columnas (.col) hermanas consecutivas en un contenedor
     .sd-cols, de modo que el grid de columnas no afecte a otros elementos
     (títulos, párrafos) que estén fuera de las columnas. */
  function groupColumns(slide) {
    var content = slide.querySelector('.sd-content');
    if (!content) return;
    var children = Array.prototype.slice.call(content.children);
    var groups = [];
    var cur = [];
    children.forEach(function (el) {
      if (el.classList && el.classList.contains('col')) cur.push(el);
      else { if (cur.length) groups.push(cur); cur = []; }
    });
    if (cur.length) groups.push(cur);
    groups.forEach(function (cols) {
      var wrap = document.createElement('div');
      wrap.className = 'sd-cols';
      wrap.dataset.count = String(cols.length);
      var ref = cols[0];
      content.insertBefore(wrap, ref);
      cols.forEach(function (c) { wrap.appendChild(c); });
    });
  }

  /* --------------------------- <sd-diagram> --------------------------- */
  class SdDiagram extends HTMLElement {
    connectedCallback() {
      if (this._inited) return;
      this._inited = true;
      this.type = this.getAttribute('type') || 'mermaid';
      this._code = (this.textContent || '').trim();
      if (this.type === 'mermaid') this.render();
    }
    async render() {
      if (!this._code) { this.textContent = ''; return; }
      this.textContent = '';
      this.classList.add('sd-diagram--mermaid');
      try {
        var mmd = await ensureMermaid();
        mmd.initialize({
          startOnLoad: false,
          theme: 'base',
          themeVariables: mermaidThemeVars(),
          flowchart: { htmlLabels: true, curve: 'basis' },
          sequence: { mirrorActors: false },
          er: { useMaxWidth: true }
        });
        var id = 'sd-mmd-' + (++diagramUid);
        var out = await mmd.render(id, this._code);
        this.innerHTML = out.svg;
        this.dataset.rendered = '1';
        this._redrawSlide();
      } catch (e) {
        this.innerHTML = '<pre class="sd-diagram-error">' + esc(e.message || e) + '</pre>';
        this._redrawSlide();
      }
    }
    /* redibuja las flechas de la diapositiva que contiene este diagrama,
       porque el render de mermaid puede cambiar el tamaño de las cajas */
    _redrawSlide() {
      var slide = this.closest('.sd-slide');
      if (slide && window.__sdRedrawSlide) window.__sdRedrawSlide(slide);
    }
    async refresh() {
      this.innerHTML = '';
      this.classList.remove('sd-diagram--mermaid');
      await this.render();
    }
  }

  /* --------------------------- <sd-deck> --------------------------- */
  class SdDeck extends HTMLElement {
    connectedCallback() {
      if (this._init) return;
      this._init = true;
      this._slides = [];
      this._index = -1;
      this._fragIndex = -1;
      this._fragStats = [];
      this._overview = false;
      this._deckTransition = 'fade';
      this.classList.add('sd-deck');
      this.dataset.direction = '1';

      this._buildChrome();
      this._bindEvents();

      var saved = null;
      try { saved = localStorage.getItem('sd-theme'); } catch (e) {}
      if (saved) this.setTheme(saved);

      var src = this.getAttribute('src') || 'slides.md';
      var self = this;
      this._load(src).catch(function (err) {
        self._frame.innerHTML = '<div class="sd-error">' + esc(err.message || err) + '</div>';
      });
    }

    /* -------------------------- tema -------------------------- */
    setTheme(name) {
      if (THEMES.indexOf(name) === -1) return;
      document.documentElement.dataset.theme = name;
      try { localStorage.setItem('sd-theme', name); } catch (e) {}
      this.dispatchEvent(new CustomEvent('themechange', { detail: { theme: name } }));
      document.querySelectorAll('sd-diagram[data-rendered="1"]').forEach(function (d) {
        if (d.refresh) d.refresh();
      });
    }
    cycleTheme() {
      var cur = document.documentElement.dataset.theme || 'light';
      var i = (THEMES.indexOf(cur) + 1) % THEMES.length;
      this.setTheme(THEMES[i]);
    }

    /* ------------------------- chrome ------------------------- */
    _buildChrome() {
      var stage = document.createElement('div');
      stage.className = 'sd-stage';
      this._frame = document.createElement('div');
      this._frame.className = 'sd-deck-frame';
      stage.appendChild(this._frame);

      var progress = document.createElement('div');
      progress.className = 'sd-progress';
      this._bar = document.createElement('div');
      this._bar.className = 'sd-progress-bar';
      progress.appendChild(this._bar);

      var ui = document.createElement('div');
      ui.className = 'sd-ui';
      this._counter = document.createElement('span');
      this._counter.className = 'sd-counter';
      var self = this;
      function btn(label, title, fn) {
        var b = document.createElement('button');
        b.textContent = label;
        b.title = title;
        b.addEventListener('click', fn);
        return b;
      }
      ui.appendChild(this._counter);
      ui.appendChild(btn('‹', 'Anterior', function () { self.go(-1); }));
      ui.appendChild(btn('›', 'Siguiente', function () { self.go(1); }));
      ui.appendChild(btn('Tema', 'Cambiar tema (T)', function () { self.cycleTheme(); }));
      ui.appendChild(btn('Resumen', 'Vista de miniaturas (O)', function () { self.toggleOverview(); }));
      ui.appendChild(btn('Notas', 'Notas del orador (N)', function () { self.toggleNotes(); }));
      ui.appendChild(btn('PDF', 'Exportar a PDF (P)', function () { window.print(); }));
      ui.appendChild(btn('Full', 'Pantalla completa (F)', function () { self.toggleFullscreen(); }));

      this._notesPanel = document.createElement('div');
      this._notesPanel.className = 'sd-notes-panel';
      this._notesPanel.innerHTML = '<strong>Notas del orador</strong><div class="sd-notes-text"></div>';

      this.appendChild(stage);
      this.appendChild(progress);
      this.appendChild(ui);
      this.appendChild(this._notesPanel);
    }

    _bindEvents() {
      var self = this;
      this._onKey = function (e) {
        if (e.target && e.target.closest && e.target.closest('input,textarea,select')) return;
        switch (e.key) {
          case 'ArrowRight': case 'ArrowDown': case 'PageDown': case ' ': case 'Enter':
            e.preventDefault(); self.go(1); break;
          case 'ArrowLeft': case 'ArrowUp': case 'PageUp': case 'Backspace':
            e.preventDefault(); self.go(-1); break;
          case 'Home': e.preventDefault(); self._show(0, -1, { noAnim: true }); break;
          case 'End': e.preventDefault(); self._show(self._slides.length - 1, 1, { noAnim: true }); break;
          case 'f': case 'F': self.toggleFullscreen(); break;
          case 'o': case 'O': self.toggleOverview(); break;
          case 't': case 'T': self.cycleTheme(); break;
          case 'n': case 'N': self.toggleNotes(); break;
          case 'p': case 'P': window.print(); break;
          case 'Escape':
            if (self._overview) self.setOverview(false);
            self.classList.remove('sd-notes-open');
            break;
        }
      };
      this._onHash = function () {
        var i = parseInt(location.hash.slice(1), 10);
        if (!isNaN(i) && i !== self._index) self._show(i, 0, { noAnim: true });
      };
      this._onResize = function () {
        var s = Math.min(window.innerWidth / SLIDE_W, window.innerHeight / SLIDE_H);
        self._frame.style.setProperty('--sd-scale', String(s));
      };
      window.addEventListener('keydown', this._onKey);
      window.addEventListener('hashchange', this._onHash);
      window.addEventListener('resize', this._onResize);
      this._onResize();
    }

    toggleFullscreen() {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
    }
    toggleNotes() {
      this.classList.toggle('sd-notes-open');
      this._updateNotes();
    }
    setOverview(on) {
      this._overview = on;
      this.classList.toggle('sd-overview', on);
      this.querySelectorAll('.sd-slide.sd-enter, .sd-slide.sd-leaving').forEach(function (s) {
        s.classList.remove('sd-enter', 'sd-leaving');
      });
      if (!on && this._slides[this._index]) this._applyFragments(this._slides[this._index]);
    }
    toggleOverview() { this.setOverview(!this._overview); }

    /* ------------------------- carga ------------------------- */
    async _load(src) {
      var sources = src.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      var parts = [];
      var ok = false;
      for (var i = 0; i < sources.length; i++) {
        try {
          var res = await fetch(sources[i]);
          if (res.ok) { parts.push(await res.text()); ok = true; }
        } catch (e) { /* inténtalo con la siguiente fuente */ }
      }
      if (!ok) {
        var inline = this.querySelector('script[type="text/slidedown"]');
        if (inline) { parts.push(inline.textContent); ok = true; }
      }
      if (!ok) throw new Error('No se encontró ' + src + ' ni contenido inline.');

      var md = parts.join('\n\n---\n\n');
      initMarked();

      var fm = parseFrontmatter(md);
      if (fm.attrs.title) document.title = fm.attrs.title;
      this._deckTransition = fm.attrs.transition || 'fade';
      if (fm.attrs.theme) this.setTheme(fm.attrs.theme);
      if (fm.attrs.stagger === 'true') this.classList.add('sd-stagger');

      var self = this;
      this._slides = splitSlides(fm.body).map(function (s) { return self._buildSlide(s); });

      this._frame.innerHTML = '';
      this._slides.forEach(function (el, i) {
        el.dataset.idx = String(i);
        el.addEventListener('click', function () {
          if (self._overview) { self.setOverview(false); self._show(i, 0, { noAnim: true }); }
        });
        self._frame.appendChild(el);
        renderArrows(el);
      });
      this._fragStats = this._slides.map(function (el) { return el.querySelectorAll('.fragment').length; });

      // Resaltado de sintaxis (perezoso): solo si hay bloques de código
      var hasCode = this._slides.some(function (el) { return el.querySelector('pre code'); });
      if (hasCode) {
        try {
          await ensureHighlight();
          highlightAll(this._frame);
        } catch (e) {
          console.warn('[slidedown] highlight.js no disponible:', e);
        }
      }

      var initial = parseInt(location.hash.slice(1), 10);
      if (isNaN(initial)) initial = 0;
      this._show(clamp(initial, 0, this._slides.length - 1), 0, { noAnim: true });
    }

    _buildSlide(raw) {
      var info = extractDirectives(raw);
      var html = this._renderMd(info.md);
      var el = document.createElement('section');
      el.className = 'sd-slide';
      el.dataset.notes = info.notes || '';
      // id opcional de la slide (<!-- slide: id=portada -->) para CSS custom
      if (info.attrs.id) el.id = info.attrs.id;
      var layout = info.attrs.layout || 'default';
      if (layout === 'two-cols' || layout === 'three-cols') layout = 'default';
      el.dataset.layout = layout;
      el.dataset.transition = info.attrs.transition || this._deckTransition;
      if (info.attrs.bg) {
        // bg=img.png[&dark=0.5] : imagen de fondo con capa de oscurecimiento
        // configurable. dark=0 (sin oscurecer) .. 1 (casi negro). Por defecto
        // usa el token --sd-bg-overlay (si está definido) o 0.35.
        var bg = info.attrs.bg;
        var dark = null;
        var amp = bg.indexOf('&');
        if (amp !== -1) {
          var q = bg.slice(amp + 1);
          bg = bg.slice(0, amp);
          var dm = q.match(/(?:^|&)dark=([\d.]+)/);
          if (dm) dark = parseFloat(dm[1]);
        }
        var overlay = (dark !== null)
          ? 'rgba(0,0,0,' + dark + ')'
          : 'var(--sd-bg-overlay, rgba(0,0,0,.35))';
        el.style.backgroundImage = 'linear-gradient(' + overlay + ', ' + overlay + '), url(' + bg + ')';
      }
      el.innerHTML = '<div class="sd-content">' + html + '</div>';
      applyPositioning(el);
      splitFree(el);
      groupColumns(el);
      el.querySelectorAll('.fragment').forEach(function (f, i) {
        f.dataset.fragIndex = String(i);
        f.style.setProperty('--i', String(i));
      });
      return el;
    }

    _renderMd(md) {
      var steps = fencedDivs(md);
      var parts = [];
      var self = this;
      function parseChunk(chunk) {
        var out;
        try {
          out = marked.parse(imgAttrs(chunk), { gfm: true, breaks: true });
        } catch (e) {
          out = esc(chunk);
        }
        return out;
      }
      for (var i = 0; i < steps.length; i++) {
        var step = steps[i];
        if (typeof step === 'string') parts.push(parseChunk(step));
        else if (step.open) parts.push(openDivTag(step.open));
        else if (step.close) parts.push('</div>');
      }
      var html = parts.join('\n');
      html = html.replace(/(<(p|h[1-6]|li|blockquote)([^>]*)>)([\s\S]*?)\{fragment\}(<\/\2>)/g,
        function (m, open, tag, attrs, inner, close) {
          return '<' + tag + attrs + ' class="fragment">' + inner + close;
        });
      return html;
    }

    /* ----------------------- navegación ----------------------- */
    _activeSlide() { return this._slides[this._index] || null; }

    _transitionDisabled() {
      return this._overview || (this._slides[this._index] && this._slides[this._index].dataset.transition === 'none');
    }
    _durMs() {
      var v = getComputedStyle(this._frame).getPropertyValue('--sd-transition-duration');
      var n = parseFloat(v);
      return isNaN(n) ? 500 : n;
    }

    _show(index, dir, opts) {
      opts = opts || {};
      if (!this._slides.length) return;
      index = clamp(index, 0, this._slides.length - 1);
      var prev = this._activeSlide();
      var next = this._slides[index];
      if (prev === next && !opts.force) return;

      this._index = index;
      this._direction = dir || 1;
      this.dataset.direction = String(this._direction);

      var fragTotal = this._fragStats[index] || 0;
      this._fragIndex = this._direction < 0 ? fragTotal : -1;
      this._applyFragments(next);

      var noTrans = opts.noAnim || this._transitionDisabled();
      if (prev && prev !== next) {
        prev.classList.add('sd-leaving');
        var leaveDone = function () { prev.classList.remove('sd-leaving', 'sd-active'); };
        if (noTrans) leaveDone();
        else {
          prev.addEventListener('animationend', leaveDone, { once: true });
          setTimeout(leaveDone, this._durMs() + 120);
        }
      }
      next.classList.add('sd-active');
      if (prev && !noTrans) {
        next.classList.add('sd-enter');
        var enterDone = function () { next.classList.remove('sd-enter'); };
        next.addEventListener('animationend', enterDone, { once: true });
        setTimeout(enterDone, this._durMs() + 120);
      }
      if (location.hash !== '#' + index) {
        try { history.replaceState(null, '', '#' + index); } catch (e) { location.hash = String(index); }
      }
      this._updateChrome();
      this._updateNotes();
    }

    go(delta) {
      if (!this._slides.length) return;
      if (this._overview) this.setOverview(false);
      var total = this._fragStats[this._index] || 0;
      if (delta > 0) {
        if (total > 0 && this._fragIndex < total - 1) {
          this._fragIndex++;
          this._applyFragments(this._slides[this._index]);
          this._updateChrome();
          return;
        }
      } else if (delta < 0) {
        if (total > 0 && this._fragIndex > 0) {
          this._fragIndex--;
          this._applyFragments(this._slides[this._index]);
          this._updateChrome();
          return;
        }
      }
      this._show(this._index + delta, delta > 0 ? 1 : -1);
    }

    _applyFragments(slide) {
      if (!slide) return;
      var idx = this._fragIndex;
      slide.querySelectorAll('.fragment').forEach(function (f) {
        var fi = parseInt(f.dataset.fragIndex || '0', 10);
        f.classList.toggle('sd-revealed', fi <= idx);
      });
    }

    _updateChrome() {
      var n = this._slides.length || 1;
      var ft = this._fragStats[this._index] || 1;
      var fi = clamp(this._fragIndex + 1, 0, ft);
      var p = (this._index + fi / ft) / n;
      this._bar.style.width = clamp(p, 0, 1) * 100 + '%';
      this._counter.textContent = (this._index + 1) + ' / ' + n;
    }

    _updateNotes() {
      if (!this._notesPanel) return;
      var notes = (this._slides[this._index] && this._slides[this._index].dataset.notes) || '';
      var t = this._notesPanel.querySelector('.sd-notes-text');
      if (t) t.textContent = notes || 'Sin notas para esta diapositiva.';
    }
  }

  if (typeof customElements !== 'undefined') {
    customElements.define('sd-deck', SdDeck);
    customElements.define('sd-diagram', SdDiagram);
  }
  window.__sdRedrawSlide = redrawSlide;
})();
