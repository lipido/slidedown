---
title: slidedown · 04 · Notas del orador
theme: dark
transition: fade
---

<!-- ============================================================
   SAMPLE 04 — NOTAS DEL ORADOR
   Escribe notas por diapositiva con:
       <!-- notes: texto -->
   Se consultan con N (panel). El exportador de PDF las omite por
   defecto (--include-notes las imprime al pie de la página).
   ============================================================ -->

<!-- slide: layout=title -->
# Notas del orador

<footer class="subtitle">Pulsa **N** para abrir el panel de notas.</footer>

<!-- notes: Cuenta la demo del framework. La idea: editar markdown
y ver el resultado al instante. Menciona que el panel se cierra con N. -->

---

# ¿Cómo se escriben?

La nota es un comentario `<!-- notes: ... -->` en la diapositiva.

- No se muestra en pantalla.
- Sí aparece en el panel (tecla N).
- En el PDF solo con `--include-notes`.

<!-- notes: Recuerda: una sola nota por diapositiva.
Puede ocupar varias líneas. -->

---

<!-- slide: transition=zoom -->
# Consejos de uso

1. Redacta las notas en presente, como si hablaras.
2. Incluye datos que no caben en la diapositiva.
3. Marca "lo que NO debes olvidar" en negrita.

<!-- notes: En esta diapositiva la transición es zoom.
Los tres consejos aparecen también en el PDF bajo la diapositiva
si se exporta con --include-notes. -->

---

# Recapitulación

- `N` alterna el panel de notas.
- `P` exporta a PDF (sin notas; con `--include-notes` quedan al pie).
- `O` muestra el resumen con miniaturas.

<!-- notes: Cerramos con el flujo completo: editar -> N -> P. -->
