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
- `npm run pdf` (vector, texto seleccionable) y `npm run pdf:raster` (screenshots, píxel literal) exportan la presentación raíz a `slides.pdf` (1280×720 pt, fragmentos revelados). Usan el mismo `print.css` con `printBackground:true`.
- `npm run gen-assets` regenera placeholders. Los assets se **versionan en git** (el clonado funciona sin internet).
- La raíz del proyecto es UNA presentación (`slides.md`, `custom.css`, `img/`); el framework vive en `framework/` y no se toca al presentar.

## Arquitectura de render

- `slides.md` → `fencedDivs` (cada `::: div :::` se parsea por separado) → `marked` → DOM → post-procesado: `applyPositioning` → `splitFree` → `groupColumns`. El orden importa.
- `layout=free` separa header/canvas para que las cajas no pisen el título.
- Las columnas `.col` se agrupan en `.sd-cols`, que son contenedores posicionados.

## Sistemas de coordenadas (delicado)

- Cajas `pos-X-Y` y flechas se anclan a su **contenedor posicionado** (slide, `.sd-free-canvas` o `.col`). Cambiar el posicionamiento altera las coordenadas; la suite de flechas (en pantalla) lo detecta.
- `renderArrows` usa el contenedor de referencia real de la flecha, no la slide.

## Timing asíncrono (trampa frecuente)

- Las flechas se dibujan al montar, pero las cajas cambian de tamaño al cargar imágenes o renderizar mermaid. Cualquier contenido asíncrono que afecte al tamaño DEBE redibujar las flechas (patrón listener / `redrawSlide`).

## Theming

- El estilo vive en tokens (`--sd-*` en `tokens.css`). Los componentes solo consumen tokens; no pongas colores a pelo en CSS estructural.
- Los ajustes por presentación van en `custom.css` (raíz, cargado al final): no tocar temas ni el core. Las slides pueden llevar `id=` (directiva de slide) como gancho para CSS.

## Trampas ya resueltas (no reintroducir)

- Punta de flecha invertida → puntos de control desde los bordes, no los centros.
- SVG desplazado / flechas fuera de las cajas → contenedor de referencia.
- Cajas/flechas pisando el título → header/canvas + columnas posicionadas.
- Flecha colapsada por timing → redibujar al terminar mermaid.
