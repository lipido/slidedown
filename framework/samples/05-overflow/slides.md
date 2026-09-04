---
title: slidedown · 05 · Overflow (todo cabe)
theme: light
transition: fade
---

<!-- ============================================================
  SAMPLE 05 — OVERFLOW
  Prueba sagrada: "todo cabe" sin scroll.
  Cada slide está diseñado para desbordar 720px si no hay auto-fit.
  Si el framework funciona, todo se ve completo (escalado vía zoom).
  Si falla, verify.mjs hará FAIL por truncado.
  ============================================================ -->

<!-- slide: layout=default -->
# Prueba 1 — Texto + imagen grande + tabla

- Este slide tiene 7 bullets largos para forzar altura {fragment}
- Segundo punto con texto adicional para ocupar más espacio vertical y probar el auto-fit sin scroll
- Tercer punto — Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore
- Cuarto punto — Más texto para asegurar que el contenido total supera la altura útil de 592 px (720 - 2*64)
- Quinto punto — Incluye imagen grande vertical que por sí sola ya desborda si no se limita con max-height
- Sexto punto — Y tabla densa debajo
- Séptimo punto — Último bullet que debería verse completo si el auto-fit funciona (si ves este texto cortado abajo, hay truncado)

![Diagrama grande vertical](img/foto.png){.img-w-60 .img-center .img-shadow}

| Col A | Col B | Col C | Col D |
|---|---|---|---|
| Dato 1 | Dato 2 | Dato 3 | Dato 4 |
| Dato 5 | Dato 6 | Dato 7 | Dato 8 |
| Dato 9 | Dato 10 | Dato 11 | Dato 12 |
| Dato 13 | Dato 14 | Dato 15 | Dato 16 |

---

# Prueba 2 — Solo texto muy denso (12 bullets)

- Bullet 1 — Texto largo para ocupar espacio vertical y probar que incluso sin imagen el texto solo también se escala si desborda
- Bullet 2 — Lorem ipsum dolor sit amet, consectetur adipiscing elit
- Bullet 3 — Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua
- Bullet 4 — Ut enim ad minim veniam, quis nostrud exercitation ullamco
- Bullet 5 — Duis aute irure dolor in reprehenderit in voluptate velit
- Bullet 6 — Excepteur sint occaecat cupidatat non proident
- Bullet 7 — Sunt in culpa qui officia deserunt mollit anim id est laborum
- Bullet 8 — Más texto para seguir forzando altura total por encima de 592 px
- Bullet 9 — Cada bullet añade ~40 px, con 12 bullets son ~480 px solo en lista
- Bullet 10 — Más h1/h2/h3 también ocupan
- Bullet 11 — Si este bullet se ve cortado abajo, hay truncado
- Bullet 12 — Último bullet — DEBE VERSE COMPLETO si “todo cabe” funciona

---

<!-- slide: layout=two-cols -->
# Prueba 3 — Columnas + imagen + código

::: col
## Columna izquierda

- Punto A con texto largo
- Punto B con texto largo
- Punto C con texto largo
- Punto D — añade más altura para que la columna izquierda sea alta
- Punto E — y siga sumando líneas de texto

```js
function hello(name) {
  console.log("Hola " + name);
  return 42;
}
```

| X | Y |
|---|---|
| 1 | 2 |
| 3 | 4 |
| 5 | 6 |
:::

::: col
## Columna derecha

![Imagen grande](img/foto.png){.img-w-80 .img-center .img-shadow}

- Punto D — texto adicional para que la columna derecha también sea alta y pruebe el grid
- Punto E — Lorem ipsum dolor sit amet
- Punto F — Último punto que debe verse
- Punto G — más contenido para forzar el desborde de las columnas
- Punto H — la columna debe escalar con el auto-fit, nunca recortar
- Punto I — si este texto se ve cortado dentro de la columna, hay truncado

:::

---

<!-- slide: layout=default -->
# Prueba 4 — Contenido denso (zoom profundo)

- Bullet 1 — Lorem ipsum dolor sit amet, consectetur adipiscing elit
- Bullet 2 — Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua
- Bullet 3 — Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris
- Bullet 4 — Duis aute irure dolor in reprehenderit in voluptate velit esse
- Bullet 5 — Excepteur sint occaecat cupidatat non proident
- Bullet 6 — Sunt in culpa qui officia deserunt mollit anim id est laborum
- Bullet 7 — Más texto para forzar que el auto-fit escale muy por debajo de 1
- Bullet 8 — y aun así debe llenar el área sin dejar hueco abajo
- Bullet 9 — Este bullet debe verse completo y el slide rellenado al 100%
- Bullet 10 — Más líneas para que el contenido natural supere con claridad el área útil
- Bullet 11 — El zoom debe quedar bien por debajo de 0.7 para probar el relleno
- Bullet 12 — Último bullet de la lista principal — DEBE verse completo

::: col
![Imagen grande](img/foto.png){.img-w-80 .img-center .img-shadow}
:::

::: col
## Columna derecha

- Punto A — texto adicional en columna
- Punto B — texto adicional en columna
- Punto C — texto adicional en columna
- Punto D — texto adicional en columna

:::
