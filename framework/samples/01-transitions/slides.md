---
title: slidedown · 01 · Transiciones y fragments
theme: blueprint
transition: fade
---

<!-- ============================================================
   SAMPLE 01 — TRANSICIONES Y FRAGMENTS
   Por diapositiva:  <!-- slide: transition=fade|slide|zoom|cover|flip|none -->
   Fragments: añade {fragment} al final de un párrafo, título,
   cita o elemento de lista. Pulsa → para revelarlos.
   ============================================================ -->

<!-- slide: layout=title transition=fade -->
# Transiciones
Cada diapositiva de este sample usa una transición distinta.

---

<!-- slide: transition=slide -->
## Transición `slide`

Desliza lateralmente según la dirección de navegación.

- La dirección la controla el framework automáticamente.

---

<!-- slide: transition=zoom -->
## Transición `zoom`

La diapositiva nueva aparece desde un zoom.

- Suave y elegante para cambios de sección.

---

<!-- slide: transition=cover -->
## Transición `cover`

La nueva diapositiva "cubre" la anterior.

- Efecto cinematográfico.

---

<!-- slide: transition=flip -->
## Transición `flip`

Gira en 3D sobre el eje horizontal.

- Requiere navegador con soporte 3D (todos los modernos).

---

<!-- slide: transition=none -->
## Transición `none`

Cambio instantáneo, sin animación.

- Útil para diapositivas muy densas o datos.

---

## Fragments: revelado progresivo

- Este punto aparece primero. {fragment}
- Este segundo. {fragment}
- Este tercero. {fragment}

**Y este párrafo al final.** {fragment}

Pulsa **→** repetidamente para ver la secuencia.

---

## Fragmentos en títulos y citas

### Este título se revela {fragment}

> Esta cita aparece después. {fragment}

- Y una lista mezclada: {fragment}
  - subpunto visible con su padre {fragment}
  - otro subpunto {fragment}

---

## Fragmentos en bloque

::: fragment
### Este bloque completo se revela

Contenido del bloque, aparece de una vez.
:::

::: fragment
Otro bloque independiente.
:::
