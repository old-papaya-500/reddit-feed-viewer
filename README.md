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

### 1. Buscar Publicaciones en Paralelo (`buscar.js`)
Extrae publicaciones en paralelo respetando horario argentino (**ART, UTC-3**) con particionado temporal (`--shard mes|semana|dia`), hasta **20 hilos concurrentes** (`-c`, por defecto `3`), enfriamiento global compartido ante `422/429`, reanudación por partición (`--resume`) y filtro opcional por flair. Genera `.json`, `.csv` (UTF-8 BOM compatible con Excel) y `.md` (opcional con `--no-md`) dentro de una carpeta única en `resultados/`.

```bash
# Modo interactivo:
node buscar.js

# Mes completo (por defecto r/argentina, enero 2026):
node buscar.js --sub argentina --mes 1 --anio 2026

# Historial multi-año en paralelo (ej. 5 años particionados por mes, 10 hilos, sin .md):
node buscar.js --sub argentina --anio-desde 2021 --anio-hasta 2025 --shard mes -c 10 --no-md

# Reanudar una corrida pausada con Ctrl+C:
node buscar.js --resume "resultados/<carpeta_de_corrida>"
```

### 2. Extraer Árbol de Comentarios en Paralelo (`scrapear_comentarios.js`)
Recorre las publicaciones extraídas en paralelo (`-c 3` por defecto, hasta **`20`** hilos) y descarga el árbol jerárquico completo de comentarios (`depth`, `parent_id`, `author`, `score`, `body`) preservando el cuerpo de texto del post (`post_selftext`). Utiliza checkpoints incrementales *append-only* `.jsonl` (sin límite de 512 MB) para pausar con `Ctrl+C` y reanudar, y modo ligero opcional (`--lite`) para ahorrar ~70% de espacio en disco.

```bash
node scrapear_comentarios.js
# o por CLI con concurrencia personalizada:
node scrapear_comentarios.js --input resultados/<carpeta>/argentina_2026_01.json -c 6
```

### 3. Consolidar Dataset para el Visor (`consolidar_perfiles.js`)
Combina los archivos de publicaciones y comentarios dentro de `resultados/` en un único archivo JSON unificado listo para cargar en el visor. Utiliza lectura en streaming y 32 particiones temporales en disco para consolidar datasets grandes con bajo consumo de RAM.

```bash
node consolidar_perfiles.js
```

### 4. Validar JSON Masivos (`validar_json.js`)
Verifica la integridad de archivos JSON grandes por streaming sin agotar la memoria RAM:

```bash
node validar_json.js resultados/consolidados/<carpeta>/perfiles_usuarios.json
```

---

## 🌐 Visor Web de Feed y Perfiles (`viewer/index.html`)

Abrí `viewer/index.html` directamente en tu navegador (doble clic, sin servidor):

- **Carga Streaming + Modal de progreso:** soporta archivos JSON grandes sin congelar la interfaz. Menú **`📁 Archivos ▾`** unificado (*Cargar JSON* + *Vaciar memoria*).
- **Configurador Amplio `🗂️ Armar Feed` + Feed Centrado:** modal inicial en 2 pasos (cargar JSON → elegir comunidades, fechas ART y orden inicial), reabrible en cualquier momento desde **`⚙️ Armar Feed`**. Feed centrado al 90% del ancho con **barra de reordenamiento instantáneo** (`Fecha descendente`, `Fecha ascendente`, `Mayor score`) e **indicador flotante de Mes y Año al scrollear**.
- **Omnibox Unificado (`🔍 Buscar post o usuario...`):** buscá posts por título (`Enter`, con chip removible y resaltado `<mark>`) o saltá directo al perfil de cualquier usuario activo (también con prefijo `u/`), con historial de los **últimos 5 buscados recientemente** y botón **`Borrar historial`**.
- **Vista de Perfil de Usuario:** métricas individuales, filtro *multiple-choice* por subreddit, barra de reordenamiento y línea de tiempo filtrable por Posts / Comentarios.
- **Árbol de Comentarios Reconstruido:** al abrir cualquier publicación reconstruye el hilo completo con respuestas anidadas (incluyendo contenido `[deleted]` sin romper la jerarquía e hidratación bajo demanda para datasets `--lite` cuando *Offline* está en OFF).
- **Modo Offline Estricto (`Offline: ON/OFF`):** evita cualquier petición externa a Internet.
- **Menú `🎨 Apariencia ▾`:** 4 estilos visuales (`Original`, `Editorial`, `OSINT`, `Nordic`) + modo Claro / Oscuro.
