---
title: slidedown · 03 · Textboxes e infografías
theme: light
transition: fade
---

<!-- ============================================================
   SAMPLE 03 — CAJAS DE TEXTO Y POSICIONAMIENTO LIBRE
   Colocación por porcentajes del lienzo:
     pos-X-Y   -> left: X%  top: Y%
     w-N       -> width: N%
     h-N       -> height: N%
   Layout recomendado:  <!-- slide: layout=free -->
   ============================================================ -->

# Posicionamiento libre

Cada elemento se coloca por porcentajes del lienzo.

| Clase | Efecto |
|---|---|
| `pos-10-20` | `left:10%; top:20%` |
| `w-40` | `width:40%` |
| `h-25` | `height:25%` |
| `id=nombre` | Referencia para flechas `::: arrow :::` |

---

<!-- slide: layout=free -->
::: textbox pos-5-5 w-27 h-40
### Arriba izquierda
`pos-5-5 w-27 h-40`
:::

::: textbox pos-68-5 w-27 h-40
### Arriba derecha
`pos-68-5 w-27 h-40`
:::

::: textbox pos-5-55 w-27 h-40
### Abajo izquierda
`pos-5-55 w-27 h-40`
:::

::: textbox pos-68-55 w-27 h-40
### Abajo derecha
`pos-68-55 w-27 h-40`
:::

::: box pos-36-25 w-28 h-50
### Centro
Centrado con `pos-36-25 w-28 h-50`.
:::

---

<!-- slide: layout=free -->
::: textbox id=plan pos-5-30 w-30
### Plan
Definir alcance y objetivos.
:::

::: box id=ejecuta pos-37-15 w-26
### Ejecución
Iterar en sprints cortos.
:::

::: box id=mide pos-37-50 w-26
### Medición
Métricas y feedback.
:::

::: textbox id=escala pos-70-30 w-26
### Escala
Automatizar lo que funciona.
:::

::: arrow from=plan to=ejecuta curve=.3 :::
::: arrow from=ejecuta to=mide curve=.3 :::
::: arrow from=mide to=plan curve=.5 :::
::: arrow from=ejecuta to=escala curve=.2 :::
::: arrow from=mide to=escala curve=.2 :::

---

<!-- slide: layout=free -->
::: textbox pos-10-15 w-35
### Texto + imagen
Puedes mezclar markdown normal dentro de cada caja:

- listas
- **negrita**
- `código`
:::

::: textbox pos-55-15 w-35
### Cajas anidadas

::: box
Contenido dentro de `::: box :::` dentro de un textbox.
:::

::: note success
Los avisos también funcionan aquí.
:::
:::

::: textbox pos-20-60 w-60 h-25
### Barra inferior
`pos-20-60 w-60 h-25`
:::
