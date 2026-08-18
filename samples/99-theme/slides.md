---
title: slidedown · 99 · Cómo crear un tema
theme: blueprint
transition: fade
---

<!-- ============================================================
   SAMPLE 99 — CÓMO CREAR UN TEMA
   Un tema es UN archivo que solo sobreescribe tokens.
   Pasos:
     1. Copia theme/themes/blueprint.css a theme/themes/mi-tema.css
     2. Cambia el selector a  [data-theme="mi-tema"]
     3. Sobreescribe los tokens que quieras
     4. Añade el <link> en index.html y usa theme: mi-tema
   ============================================================ -->

<!-- slide: layout=title -->
# Cómo crear un tema

<footer class="subtitle">Este deck usa el tema `blueprint`</footer>

---

# La idea: tokens ≠ estructura

| Qué | Archivo | ¿Se toca para crear un tema? |
|---|---|---|
| Tokens (colores, tipografías…) | `theme/tokens.css` | No |
| Temas (overrides) | `theme/themes/*.css` | **Sí** |
| Estructura de componentes | `theme/base.css` | No |
| Layouts y posicionamiento | `theme/layouts.css` | No |
| Transiciones | `theme/transitions.css` | No |
| Diagramas | `theme/diagrams.css` | No |
| Impresión / PDF | `theme/print.css` | No |

---

# Tokens de color

::: col
- `--sd-bg` → fondo de la diapositiva
- `--sd-bg-soft` → paneles y citas
- `--sd-fg` → texto principal
- `--sd-fg-soft` → texto secundario
- `--sd-muted` → metadatos
- `--sd-accent` → acento principal
- `--sd-accent-2` → acento secundario
- `--sd-link` → enlaces
:::

::: col
- `--sd-info` / `--sd-success`
- `--sd-warning` / `--sd-danger`
- `--sd-border` → bordes y líneas
- `--sd-code-bg` / `--sd-code-fg`
- `--sd-gradient-1` / `--sd-gradient-2`
- `--sd-textbox-bg` / `--sd-textbox-border`
- `--sd-ui-bg` / `--sd-ui-fg`
- `--sd-overview-bg`
:::

---

# Tokens de tipografía y forma

::: col
- `--sd-font-heading`
- `--sd-font-body`
- `--sd-font-mono`
- `--sd-font-size-base`
- `--sd-h1-size` / `--sd-h2-size` / `--sd-h3-size`
- `--sd-line-height`
- `--sd-letter-spacing-heading`
:::

::: col
- `--sd-space-unit` → escala de espaciado
- `--sd-slide-padding`
- `--sd-gap`
- `--sd-radius` / `--sd-radius-sm` / `--sd-radius-lg`
- `--sd-shadow-sm/md/lg`
- `--sd-transition-duration`
- `--sd-easing`
:::

---

# Tokens de diagramas

::: col
- `--sd-mermaid-node-bg`
- `--sd-mermaid-node-fg`
- `--sd-mermaid-node-border`
- `--sd-mermaid-edge`
- `--sd-mermaid-font-size`
:::

::: col
- `--sd-arrow-color`
- `--sd-arrow-width`
- `--sd-arrow-head`
:::

---

# Receta mínima (10 tokens)

```css
[data-theme="mi-tema"] {
  --sd-bg: #faf7f2;            /* fondo */
  --sd-bg-soft: #f0eadd;       /* paneles */
  --sd-fg: #2b2620;            /* texto */
  --sd-muted: #8a8070;         /* metadatos */
  --sd-accent: #c0532e;        /* acento */
  --sd-accent-fg: #ffffff;     /* texto sobre acento */
  --sd-border: #e0d6c4;        /* bordes */
  --sd-font-heading: Georgia, 'Times New Roman', serif;
  --sd-font-body: Georgia, serif;
  --sd-radius: 4px;            /* forma */
}
```

Con eso cambias el 90 % del aspecto. El resto lo hereda el tema base.

---

# ¿Y la estructura?

No la toques. **Todos** los componentes consumen los tokens:

- textboxes → `--sd-textbox-*`
- avisos → `--sd-info/success/warning/danger`
- diagramas → `--sd-mermaid-*`, `--sd-arrow-*`
- UI (barra, progreso, resumen) → `--sd-ui-*`, `--sd-overview-bg`

Si necesitas más tokens, añádelos en `tokens.css` con su comentario.

---

# Referencia de temas

| Tema | Selector | Estilo |
|---|---|---|
| Claro | `[data-theme="light"]` | base por defecto |
| Oscuro | `[data-theme="dark"]` | alto contraste |
| Blueprint | `[data-theme="blueprint"]` | ejemplo completo |

Para añadir el tuyo: enlaza el CSS en `index.html` y usa `theme: mi-tema`
en el frontmatter del deck.
