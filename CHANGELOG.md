# Changelog

Todos los cambios relevantes de **Reddit Archiver & Feed Viewer** se documentan en este archivo en orden cronológico inverso, siguiendo el formato de [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

---

## [1.2.0] — 2026-11-26

### Agregado
- **Sistema de Ayuda Contextual / FAQ (`viewer/faq.js`, `viewer/index.html`, `viewer/app.js`, `viewer/styles.css`):**
  - Modal nativo `#faqDialog` (`closedby="any"` + fallback por coordenadas de puntero) con acordeones `<details>` no exclusivos, botón **`▾ Expandir todo` / `▴ Contraer todo`** sincronizado (`aria-expanded`), tablas responsivas, referencia documental y bloques de código CLI con botón **`📋 Copiar`** (con respaldo para `file://`).
  - Botón **`❓ Cómo generar el JSON`** en el Paso 1 de `Armar Feed` (`#feedBuilderFaqBtn`) con el instructivo completo en 3 etapas (`buscar.js`, `scrapear_comentarios.js`, `consolidar_perfiles.js` y `validar_json.js`).
  - Botón global **`❓ Ayuda`** en el header (`#headerHelpBtn`) que detecta la vista activa (`Feed` o `Perfil de Usuario`) y abre su guía correspondiente con reseteo automático de scroll.
- **Preservación de scroll y accesibilidad (`viewer/app.js`, `viewer/index.html`):**
  - Registro de posición vertical por vista (`savedScrollByView`) con restauración automática al presionar **`← Volver al Feed`** desde un perfil y reinicio al tope al abrir otro perfil o regenerar el Feed.
  - Atributo `aria-current="page"` dinámico en la pestaña activa del header.
- **Documentación detallada (`Documentation/`):**
  - `Documentation/GUIA_FEED.md`: guía completa de controles globales, Omnibox, `Armar Feed`, modo Offline y árboles de comentarios.
  - `Documentation/GUIA_PERFILES.md`: guía de la ficha de Perfil de Usuario, filtro *multiple-choice* por subreddit, KPIs y trazabilidad de respuestas.
- **Suite de pruebas automatizadas y GitHub Actions CI (`tests/`, `.github/workflows/ci.yml`):**
  - Runner unificado `node tests/run_all_tests.js` en Node.js puro (sintaxis `.js`, pipeline de consolidación con fixtures sintéticos, auditoría estática DOM de `app.js` + `faq.js`, flujos de Feed/Perfil/Omnibox y pruebas del modal FAQ).
  - Workflow `.github/workflows/ci.yml` con matriz **Node.js 20, 22 y 24** en `ubuntu-latest`.

### Cambiado
- **Saneamiento y tokens CSS/HTML (`viewer/styles.css`, `viewer/index.html`):**
  - Escala centralizada de capas (`--z-*`) y tokens semánticos en `light-dark(...)`.
  - Eliminación de estilos `style="..."` inline en `index.html` y remoción de clases/reglas CSS sin uso o duplicadas.

### Corregido
- **Header responsivo y alineación de `#visualMenuDropdown` (`viewer/styles.css`, `viewer/app.js`):**
  - Cambio de `.app-header` a altura flexible (`min-height: 60px; height: auto; flex-wrap: wrap`), `overflow-x: clip` en `body` y `scroll-padding-top: 76px` en `html`.
  - Alineación dinámica (`fitHeaderDropdownInViewport()`) y regla móvil (`left: 0; right: auto` en `<= 768px`) para evitar recorte horizontal de **`🎨 Apariencia ▾`** en viewports estrechos.
  - Orden de cascada de `@media` corregido y ocultamiento de `.toolbar-sep` en pantallas angostas (`<= 768px`).
- **Cierre inmediato del desplegable Omnibox tras `Enter` (`viewer/app.js`):**
  - Cancelación de `searchDebounceTimer` al confirmar búsqueda con `Enter`, `Escape` o al limpiar el campo, evitando que el listado se reabra sobre el chip de filtro.

---

## [1.1.0] — 2026-11-24

### Agregado
- **Historial reciente en el Omnibox (`viewer/app.js`, `viewer/styles.css`):** memoria en `localStorage` de los últimos 5 términos o usuarios buscados con botón **`Borrar historial`**.

### Cambiado
- **Scrapers paralelos como predeterminados (`buscar.js`, `scrapear_comentarios.js`):** motor concurrente hasta 20 hilos con particionado temporal (`--shard`), checkpoints incrementales `.jsonl`, reanudación (`--resume`) y modo `--lite`.
- **Limpieza de branding público** en el visor y `README.md`.

---

## [1.0.0] — 2026-11-23

### Agregado
- Publicación inicial de **Reddit Archiver & Offline Feed Viewer**: scripts CLI en Node.js puro (`buscar.js`, `scrapear_comentarios.js`, `consolidar_perfiles.js`, `validar_json.js`) y visor web offline (`viewer/index.html`, `viewer/app.js`, `viewer/styles.css`) con Feed centrado, vista de Perfil de Usuario, Omnibox, modo Offline Estricto, árboles de comentarios reconstruidos y 4 presets visuales con modo Claro/Oscuro.
