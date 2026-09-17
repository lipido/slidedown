# AGENTS.md

Guía para agentes que trabajan en slidedown. Léela antes de tocar código.

## Mantenimiento (leer primero)

- Este archivo debe ser **PEQUEÑO**. Si crece, condensa o elimina; borra lo que ya no aplique.
- Tras **cada cambio** (en `lib/*.js`, `theme/*.css`, `samples/`, `test/`), revisa si afecta a estas reglas y actualízalas.
- **Toda feature o cambio de comportamiento debe ampliar la verificación**: añade aserciones en `test/verify.mjs` que cubran lo nuevo. No termines un cambio sin tests.
- No dupliques el `README.md`: aquí solo reglas de diseño y trampas.

## Verificación (siempre)

- Desde `framework/`: `conda activate slidedown && npm test` → suite Playwright que recorre la presentación raíz y todos los samples. **Debe quedar en verde.** Incluye check del PDF vector (`test/pdf/verify-vector.pdf`, 1280×720 pt por página).
- Ejecútala tras cualquier cambio; es la red de seguridad de posicionamiento y timing.
- `npm run pdf` (vector, texto seleccionable) y `npm run pdf:raster` (screenshots, píxel literal) exportan la presentación raíz a `slides.pdf` (1280×720 pt, fragmentos revelados). Usan el mismo `print.css` con `printBackground:true`. **Por defecto omiten las notas del orador** (`data-notes`); con `--include-notes` se imprimen al pie. La impresión rápida del navegador (`P`/`Ctrl+P`) sí las incluye siempre vía `print.css`.
- `npm run serve` sirve la presentación con **autoreload** (`test/serve.mjs`: estático sin caché + push SSE; `.md` → recarga suave vía `SdDeck.reload()` conservando slide, resto → recarga completa). El cliente se inyecta al servir los HTML: los fuentes quedan limpios y sin servidor externo todo sigue funcionando.
- `npm run gen-assets` regenera placeholders. Los assets se **versionan en git** (el clonado funciona sin internet).
- La raíz del proyecto puede contener **varias presentaciones**: cada una es un `.md` (por defecto `slides.md`), todas comparten `custom.css` e `img/`. Se eligen con `?md=<archivo>` en la URL (`index.html?md=tema1.md`) o en el export: `npm run pdf -- tema1.md` → `tema1.pdf`. En `slidedown.js` la fuente efectiva la decide `_resolveSrc()` (query `md` > atributo `src` > `slides.md`); `reload()` también la respeta. El framework vive en `framework/` y no se toca al presentar.

## Arquitectura de render

- `slides.md` → `fencedDivs` (cada `::: div :::` se parsea por separado) → `marked` → DOM → post-procesado: `applyPositioning` → `splitFree` → `groupColumns`. El orden importa.
- `layout=free` separa header/canvas para que las cajas no pisen el título.
- Las columnas `.col` se agrupan en `.sd-cols`, que son contenedores posicionados.

## Sistemas de coordenadas (delicado)

- Cajas `pos-X-Y` y flechas se anclan a su **contenedor posicionado** (slide, `.sd-free-canvas` o `.col`). Cambiar el posicionamiento altera las coordenadas; la suite de flechas (en pantalla) lo detecta.
- `renderArrows` usa el contenedor de referencia real de la flecha, no la slide.

## Timing asíncrono (trampa frecuente)

- Las flechas se dibujan al montar, pero las cajas cambian de tamaño al cargar imágenes o renderizar mermaid/plantuml. Cualquier contenido asíncrono que afecte al tamaño DEBE redibujar las flechas (patrón listener / `redrawSlide`) y re-ajustar (`fitSlide`).

## "Todo cabe" (regla sagrada)

- Nada se trunca nunca: si el contenido excede el área útil (720 − padding), `fitSlide` escala `.sd-content` con `zoom` (afecta layout; fallback `transform`). Se re-aplica al montar, cargar imágenes, renderizar mermaid/plantuml, cambiar slide, redimensionar y salir de overview.
- La suite verifica visualmente (rects en pantalla) que nada sale de la diapositiva: check "sin truncado (todo cabe)" en `test/verify.mjs`. El sample `samples/05-overflow/` contiene slides diseñadas para desbordar.
- Trampa de unidades: el marco va escalado (`--sd-scale`); `getBoundingClientRect()` devuelve px de pantalla y `clientHeight/scrollHeight` px de layout. Convertir con `ratio = rect.height / clientHeight` antes de comparar.

## Theming

- El estilo vive en tokens (`--sd-*` en `tokens.css`). Los componentes solo consumen tokens; no pongas colores a pelo en CSS estructural.
- Los ajustes por presentación van en `custom.css` (raíz, cargado al final): no tocar temas ni el core. Las slides pueden llevar `id=` (directiva de slide) como gancho para CSS.

## Trampas ya resueltas (no reintroducir)

- Punta de flecha invertida → puntos de control desde los bordes, no los centros.
- SVG desplazado / flechas fuera de las cajas → contenedor de referencia.
- Cajas/flechas pisando el título → header/canvas + columnas posicionadas.
- Flecha colapsada por timing → redibujar al terminar mermaid.
- Contenido truncado abajo → auto-fit `zoom` en `.sd-content` (el `transform: scale` NO reduce el layout y `overflow:hidden` recorta).
- Bloque de código recortado → **no** poner `max-height` a `pre` y sí `flex-shrink: 0`: `.sd-content` es flex column y un `pre` con `overflow:hidden` se encoge (y recorta) en vez de desbordar; el auto-fit mide `scrollHeight` y necesita ver la altura real para escalar (sample `samples/06-code-long`).
- Columnas recortando contenido → `.sd-cols` con `flex-shrink: 0` (si no, flexbox encoge el grid y recorta sus columnas con `overflow:hidden` antes de que el auto-fit pueda escalar).
- Hueco abajo tras escalar → `zoom` reflowea el texto más ancho y el contenido queda más corto que el área útil; `fitSlide` re-mide la altura visual de los hijos y sube el zoom hacia 1 hasta llenar.
- Nuevo tipo de diagrama (p. ej. `plantuml`) → además del fence y `<sd-diagram type="...">`, `SdDiagram.connectedCallback` filtra por tipo: hay que añadirlo ahí, no solo en `render()`.
- Error de sintaxis de PlantUML → `renderToString` lo entrega como SVG (no llama a `onError`); hay que detectar el marcador ("Syntax Error") y mostrar `.sd-diagram-error`.
