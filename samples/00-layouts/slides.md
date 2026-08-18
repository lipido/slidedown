---
title: slidedown · 00 · Layouts
theme: dark
transition: fade
---

<!-- ============================================================
   SAMPLE 00 — LAYOUTS
   Cada diapositiva muestra un layout distinto.
   Los layouts se eligen con:  <!-- slide: layout=NOMBRE -->
   Nombres: default | center | title | section | quote | full | free
   Columnas: se crean con ::: col ::: y el JS las cuenta.
   ============================================================ -->

<!-- slide: layout=title -->
# Layouts
Un layout por diapositiva.

<footer class="subtitle">Este es el layout `title`</footer>

---

<!-- slide: layout=title bg=img/foto.png&dark=0.5 -->
# Portada con fondo

Imagen de fondo con `bg=img/foto.png&dark=0.5`.

<footer class="subtitle">`dark` controla el oscurecimiento (0 a 1)</footer>

---

# Layout `default`

Contenido arriba-izquierda, tipografía normal.

- Lista normal
- Con `code`, **negrita** y [enlaces](https://example.com)

> Una cita con su recuadro.

---

<!-- slide: layout=center -->
## Layout `center`

Todo el contenido centrado, vertical y horizontalmente.

---

<!-- slide: layout=section -->
# Layout `section`
Diapositiva de separación con degradado.

---

<!-- slide: layout=quote -->
> "El CSS es como una entrevista de trabajo:
> ganas o ganas experiencia."
>
> <footer>— Alguien en internet</footer>

---

# Columnas (layout por defecto)

::: col
## Columna 1
- Izquierda
- Más texto
:::

::: col
## Columna 2
- Derecha
- Más texto

::: note success
Dos columnas con `::: col :::`.
:::
:::

---

# Tres columnas

::: col
### A
Primera columna.
:::

::: col
### B
Segunda columna.
:::

::: col
### C
Tercera columna con una lista:
- uno
- dos
- tres
:::

---

# Layout `full`

Sin padding: el contenido ocupa todo el lienzo.

::: box
Puedes combinar con `::: box :::` y posicionamiento absoluto.
:::

---

<!-- slide: layout=free -->
::: textbox pos-5-10 w-40
### Caja 1
Posicionada con `pos-5-10 w-40`.
:::

::: textbox pos-55-55 w-40
### Caja 2
Posicionada con `pos-55-55 w-40`.
:::

::: note
Layout `free`: las coordenadas son porcentajes del lienzo.
Usa `pos-X-Y`, `w-N` y `h-N`.
:::

---

# Otros elementos

::: note info
Este es un aviso `info`.
:::

::: note warning
Este es un aviso `warning`.
:::

::: note success
Este es un aviso `success`.
:::

::: note danger
Este es un aviso `danger`.
:::

- Etiqueta <span class="badge">badge</span> en línea
- Caja resaltada: <span class="box">contenido</span>

---

# Imágenes

Imagen básica en markdown, centrada y con sombra:

![Descripción](img/foto.png){.img-center .img-w-50 .img-shadow}

---

# Imagen en columna

::: col
![Gráfico](img/grafico.png){.img-w-80}
:::

::: col
## Texto al lado

Imagen a la izquierda, texto a la derecha usando columnas.

- Las rutas son relativas a la carpeta del sample.
- Clases útiles: `.img-w-40`, `.img-center`, `.img-shadow`.
:::

---

| Atajo | Acción |
|---|---|
| `→` / `Espacio` | Siguiente (revela fragmentos) |
| `←` | Anterior |
| `F` | Pantalla completa |
| `O` | Resumen de miniaturas |
| `T` | Cambiar tema |
| `N` | Notas del orador |
| `P` | Exportar PDF |
