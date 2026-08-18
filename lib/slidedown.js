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

  /* ----------------- flechas entre cajas (SVG) ----------------- */
  function renderArrows(slide) {
    var cs = getComputedStyle(document.documentElement);
    var color = cs.getPropertyValue('--sd-arrow-color').trim() || '#5b5bd6';
    var width = parseFloat(cs.getPropertyValue('--sd-arrow-width')) || 3;
    slide.querySelectorAll('.sd-arrow, .arrow').forEach(function (arrow) {
      var from = arrow.dataset.from ? slide.querySelector('#' + CSS.escape(arrow.dataset.from)) : null;
      var to = arrow.dataset.to ? slide.querySelector('#' + CSS.escape(arrow.dataset.to)) : null;
      if (!from || !to) return;
      function center(el) {
        var r = el.getBoundingClientRect();
        var sr = slide.getBoundingClientRect();
        return { x: r.left - sr.left + r.width / 2, y: r.top - sr.top + r.height / 2 };
      }
      function draw() {
        if (!slide.isConnected) return;
        var sr = slide.getBoundingClientRect();
        var a = center(from), b = center(to);
        var curve = parseFloat(arrow.dataset.curve || '0.25');
        var dx = b.x - a.x, dy = b.y - a.y;
        var c1 = { x: a.x + dx * curve, y: a.y + dy * curve };
        var c2 = { x: b.x - dx * curve, y: b.y - dy * curve };
        var mid = 'sd-arr-' + (++arrowUid);
        var d = 'M' + a.x.toFixed(1) + ' ' + a.y.toFixed(1) +
          ' C' + c1.x.toFixed(1) + ' ' + c1.y.toFixed(1) +
          ' ' + c2.x.toFixed(1) + ' ' + c2.y.toFixed(1) +
          ' ' + b.x.toFixed(1) + ' ' + b.y.toFixed(1);
        arrow.innerHTML =
          '<svg width="' + sr.width + '" height="' + sr.height + '" viewBox="0 0 ' + sr.width + ' ' + sr.height + '" aria-hidden="true">' +
          '<defs><marker id="' + mid + '" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">' +
          '<path d="M0,0 L10,5 L0,10 Z" fill="' + esc(color) + '"/></marker></defs>' +
          '<path d="' + d + '" fill="none" stroke="' + esc(color) + '" stroke-width="' + width + '" marker-end="url(#' + mid + ')"/></svg>';
      }
      draw();
      var onResize = function () { draw(); };
      window.addEventListener('resize', onResize);
      window.addEventListener('beforeprint', onResize);
      arrow._sdCleanup = function () {
        window.removeEventListener('resize', onResize);
        window.removeEventListener('beforeprint', onResize);
      };
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
      } catch (e) {
        this.innerHTML = '<pre class="sd-diagram-error">' + esc(e.message || e) + '</pre>';
      }
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
      var layout = info.attrs.layout || 'default';
      if (layout === 'two-cols' || layout === 'three-cols') layout = 'default';
      el.dataset.layout = layout;
      el.dataset.transition = info.attrs.transition || this._deckTransition;
      if (info.attrs.bg) {
        el.style.backgroundImage = 'linear-gradient(rgba(0,0,0,.35), rgba(0,0,0,.35)), url(' + info.attrs.bg + ')';
      }
      el.innerHTML = '<div class="sd-content">' + html + '</div>';
      applyPositioning(el);
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
          out = marked.parse(chunk, { gfm: true, breaks: true });
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
})();
