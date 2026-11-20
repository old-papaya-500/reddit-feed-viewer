# Reddit Archiver & Feed Viewer (Public Edition)

Herramientas livianas en **Node.js puro** y **HTML5/JS estático** (cero dependencias externas) para buscar publicaciones de Reddit por rango de fechas, extraer árboles completos de comentarios y explorarlos en un visor web offline tipo Feed.

---

## 📋 Requisitos

- **Node.js 18+** (solo módulos nativos, sin `npm install`).
- Navegador moderno para abrir `viewer/index.html` (100% offline).

---

## 🚀 Flujo de Trabajo

```text
1. [buscar.js]                --> resultados/<dataset>_YYYYMMDD_HHMMSS/<dataset>.json (.csv, .md)
        ↓
2. [scrapear_comentarios.js]  --> (misma carpeta) <dataset>_comentarios.json
        ↓
3. [consolidar_perfiles.js]   --> resultados/consolidados/perfiles_YYYYMMDD_HHMMSS/perfiles_usuarios.json
        ↓
4. [viewer/index.html]        --> Visor Web Offline (Feed, búsqueda por título y árboles de comentarios)
```

---

## 🛠️ Uso Rápido

Todos los scripts tienen **modo interactivo** (ejecutándolos sin argumentos) o **CLI**:

### 1. Buscar Publicaciones (`buscar.js`)
Extrae publicaciones en horario argentino (**ART, UTC-3**) con filtro opcional por flair y genera `.json`, `.csv` (UTF-8 BOM compatible con Excel) y `.md` dentro de una carpeta única en `resultados/`.

```bash
# Modo interactivo:
node buscar.js

# Mes completo (por defecto r/argentina, enero 2026):
node buscar.js --sub argentina --mes 1 --anio 2026

# Rango de fechas con flair:
node buscar.js --sub argentina --desde 2026-01-01 --hasta 2026-01-31 --flair "Economía"
```

### 2. Extraer Árbol de Comentarios (`scrapear_comentarios.js`)
Recorre las publicaciones extraídas y descarga el árbol jerárquico completo de comentarios (`depth`, `parent_id`, `author`, `score`, `body`) preservando el cuerpo de texto del post (`post_selftext`). Incluye guardado automático de checkpoints (`.checkpoint.json`) para pausar con `Ctrl+C` y reanudar.

```bash
node scrapear_comentarios.js
# o por CLI:
node scrapear_comentarios.js --input resultados/<carpeta>/argentina_2026_01.json
```

### 3. Consolidar Dataset para el Visor (`consolidar_perfiles.js`)
Combina los archivos de publicaciones y comentarios dentro de `resultados/` en un único archivo JSON unificado listo para cargar en el visor (con lectura y escritura por streaming para soportar datasets grandes).

```bash
node consolidar_perfiles.js
```

### 4. Validar JSON Masivos (`validar_json.js`)
Verifica la integridad de archivos JSON grandes por streaming sin agotar la memoria RAM:

```bash
node validar_json.js resultados/consolidados/<carpeta>/perfiles_usuarios.json
```

---

## 🌐 Visor Web de Feed (`viewer/index.html`)

Abrí `viewer/index.html` directamente en tu navegador (doble clic, sin servidor):

- **Carga Streaming + Modal de progreso:** soporta archivos JSON grandes sin congelar la interfaz.
- **Feed Builder:** filtrado por comunidades (checkboxes), rango de fechas ART, ordenamiento por fecha o score y buscador multi-palabra por título con resaltado.
- **Árbol de Comentarios Reconstruido:** al abrir cualquier publicación reconstruye el hilo completo con respuestas anidadas (incluyendo contenido `[deleted]` sin romper la jerarquía).
- **Modo Offline Estricto (`Offline: ON/OFF`):** evita cualquier petición externa a Internet.
- **Temas visuales:** 4 estilos (`Original`, `Editorial`, `OSINT`, `Nordic`) + modo Claro / Oscuro.
