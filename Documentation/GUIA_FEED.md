# 🗂️ Instructivo y Guía de Uso — Sección Feed y Controles Generales

Esta guía explica cómo cargar datasets, armar y filtrar la vista principal **`🗂️ Feed`**, utilizar el buscador unificado (**Omnibox**), explorar árboles completos de comentarios y configurar la privacidad (**Modo Offline**) y apariencia del visor **Reddit Feed Viewer**.

---

## 1. Controles Globales de la Barra Superior (Header)

La barra superior permanece visible en todas las secciones del visor y concentra las herramientas globales:

| Control | Función principal | Detalles clave |
|---|---|---|
| **`📁 Archivos ▾`** | Gestión en memoria del dataset (`📂 Cargar JSON` y `🗑️ Vaciar memoria`). | Usa lectura **streaming** (`TextDecoderStream`) capaz de indexar archivos `perfiles_usuarios.json` de cientos de MB sin congelar el navegador. `Vaciar memoria` limpia todos los índices, vistas y cachés de la sesión. |
| **`🔍 Buscar post o usuario...` (Omnibox)** | Buscador dual de **títulos de publicaciones** y **perfiles de usuario**. | • **Texto libre + `Enter`:** filtra el Feed por palabras en el título.<br>• **Prefijo `u/` (ej. `u/alice`):** busca exclusivamente usuarios y salta a su perfil.<br>• **Con el campo vacío:** despliega los **últimos 5 buscados recientemente** (guardados en `localStorage`) con opción **`Borrar historial`**. |
| **`⚙️ Armar Feed`** | Reabre el configurador amplio en 2 pasos (`#feedBuilderDialog`). | Permite cambiar el archivo JSON, elegir qué comunidades (`r/...`) incluir, acotar un rango de fechas y definir el orden inicial. |
| **`🌐 Offline: OFF` / `📴 Offline: ON`** | Interruptor de **Modo Offline Estricto** (persiste entre sesiones). | En **`ON`**, bloquea cualquier conexión externa a Internet: no descarga imágenes/videos remotos ni consulta la API de Arctic Shift para enriquecer posts o hidratar comentarios `--lite`. Ideal para consultas aisladas. |
| **`🎨 Apariencia ▾`** | Selector de **Tema** (`Claro` / `Oscuro`) y **Estilo visual**. | Incluye 4 presets tipográficos y cromáticos instantáneos: **`🎨 Original`** (Reddit clásico), **`📰 Editorial`** (periodismo de datos), **`💻 OSINT`** (terminal técnica) y **`❄️ Nordic`** (minimalista). |
| **`❓ Ayuda`** | Abre el modal de ayuda contextual (`#faqDialog`). | Detecta automáticamente la vista activa (`Feed` o `Perfil de Usuario`) y muestra su guía resumida con acordeones y comandos copiables. |

> **Auto-descubrimiento inicial:** al abrir `viewer/index.html` sobre un servidor local, el visor intenta detectar automáticamente si existe un `perfiles_usuarios.json` en la misma carpeta o en el directorio raíz; si no lo encuentra (o al abrirse vía `file://`), espera la selección manual en **Paso 1**.

---

## 2. Configurador Inicial: Modal `🗂️ Armar Feed`

Al iniciar el visor sin datos en memoria se abre automáticamente el modal **`🗂️ Armar Feed`** estructurado en dos pasos:

1. **Paso 1 — Carga del archivo JSON (siempre habilitado):**
   - Hacé clic en **`📂 Cargar JSON`** y seleccioná el archivo `perfiles_usuarios.json` generado por `consolidar_perfiles.js`.
   - Si todavía no generaste el dataset, el botón **`❓ Cómo generar el JSON`** abre el instructivo paso a paso de la suite de scrapeo con comandos listos para copiar.
   - Una vez indexado el archivo, la barra pasa a verde mostrando el total de **publicaciones**, **perfiles identificados** y **comentarios indexados**, y el botón cambia a **`📂 Cambiar JSON`**.
2. **Paso 2 — Personalización previa (se desbloquea al cargar el JSON):**
   - **Comunidades:** lista de casillas con todas las comunidades detectadas (`r/...`) y la cantidad de publicaciones en cada una. Incluye accesos rápidos **`Todas`** y **`Ninguna`**.
   - **Rango de fechas (ART, UTC-3):** campos **`Desde`** (`00:00:00 ART`) y **`Hasta`** (`23:59:59 ART`) para acotar una ventana temporal exacta, más **`✕ Limpiar fechas`**.
   - **Ordenar por:** define el criterio inicial (`▼ Más recientes primero`, `▲ Más antiguos primero` o `🔥 Mayor score`).
3. **Generación:** al presionar **`▶ Generar Feed`**, se cierra el modal y se renderiza la vista principal centrada. *(Nota: antes de generar el primer Feed, `Esc` y el clic fuera están bloqueados para guiar el flujo inicial; luego quedan habilitados).*

---

## 3. Navegación, Ordenamiento y Búsqueda en el Feed

### 3.1 Barra de Herramientas del Feed
Una vez generado el Feed, la barra superior de resultados muestra:
- **Contador total:** cantidad exacta de publicaciones que cumplen los filtros activos.
- **Chip de búsqueda activa (`🔍 Título: "..." ✕`):** aparece cuando filtrás títulos desde el Omnibox; al pulsar **`✕`** se quita el filtro de palabras clave conservando las comunidades y fechas elegidas.
- **Chips de reordenamiento instantáneo:**
  - **`▼ Fecha descendente`:** publicaciones más recientes arriba.
  - **`▲ Fecha ascendente`:** orden cronológico desde el inicio del período.
  - **`🔥 Mayor score`:** publicaciones con más votos netos arriba.
  *(Cambiar entre estos chips reordena en memoria de forma inmediata sin volver a escanear todo el dataset).*

### 3.2 Cómo funciona el Buscador por Título y Usuarios (Omnibox)
- **Coincidencia multi-palabra sin tildes:** si escribís varias palabras (ej. `dolar inflacion`), el Feed exige que **todas** aparezcan en el título (*lógica AND*), ignorando mayúsculas, minúsculas y tildes (`dólar` coincide con `dolar`), y resalta cada término en amarillo sobre los títulos.
- **Sugerencias contextuales de usuarios:** mientras escribís, debajo de la acción `Filtrar Feed por título` se listan hasta 7 usuarios coincidentes. Si tu Feed actual está filtrado a un subconjunto de subreddits, el Omnibox **restringe automáticamente** las sugerencias a usuarios activos en esas comunidades.

### 3.3 Paginación e Indicador Flotante de Fecha (Estilo Google Photos)
- **Paginación liviana:** el Feed renderiza bloques de **50 publicaciones por página** mediante el botón **`Cargar más ítems`** para mantener fluidez incluso con decenas de miles de posts.
- **Píldora flotante `Mes Año`:** al desplazarte verticalmente por un Feed ordenado por fecha (con 6 o más publicaciones), aparece sobre el margen derecho un indicador flotante en **Hora Argentina (ART, UTC-3)** (ej. `Enero 2026`) que acompaña proporcionalmente tu posición en la página y se oculta solo al detener el scroll.

---

## 4. Anatomía de Cada Tarjeta de Publicación

Cada tarjeta del Feed resume de un vistazo el contexto de la publicación:
- **Autor:** avatar con inicial + enlace **`u/usuario`** que abre directamente su ficha completa de perfil (con botón `← Volver` al Feed y restauración exacta de posición de scroll). Si la cuenta fue borrada al momento del scrapeo, figura como *`[deleted]`* preservando el post y sus comentarios.
- **Insignias (Badges):** tipo (`📝 POST`), comunidad (`r/...`), *flair* temático (si tiene), indicador automático de contenido adjunto (**`🖼️ Imagen`**, **`🖼️ Galería`**, **`🎬 Video`** o **`🔗 Enlace externo`**), fecha/hora en **ART** y puntaje neto (**`▲ Score`**).
- **Título y vista previa:** título clickeable y extracto del cuerpo de texto (`selftext`) cuando existe.
- **Acciones al pie:**
  - **`💬 Ver contenido y discusión (N comentarios) ↗`** (o clic en el título): abre el modal completo del post.
  - **`Abrir en Reddit ↗`:** abre el enlace original (`permalink`) en una pestaña nueva.

---

## 5. Modal de Detalle y Árbol de Comentarios Reconstruido

Al abrir una publicación se despliega un diálogo con tres bloques principales:

1. **Cuerpo completo y Multimedia:**
   - Muestra el texto íntegro de la publicación, imágenes individuales, grillas de **galerías completas**, reproductor de **video `.mp4`** o tarjeta de enlace externo.
   - Si el dataset original no incluía el cuerpo, galería o URL de video y el visor está en **`🌐 Offline: OFF`**, consulta automáticamente a Arctic Shift en segundo plano para enriquecer la vista. En **`📴 Offline: ON`**, bloquea toda carga remota y ofrece únicamente el enlace manual saliente.
2. **Árbol Jerárquico de Comentarios (`💬 Árbol de Comentarios`):**
   - Reconstruye recursivamente los hilos anidados conectando comentarios raíz (`t3_`) y respuestas a otros comentarios (`t1_`), ordenando cada nivel por **mayor score** (y desempate cronológico).
   - Cada comentario permite hacer clic en **`u/autor`** para saltar a su perfil o abrir ese comentario puntual en Reddit (`Ver en Reddit ↗`).
3. **Soporte para Datasets en Modo Ligero (`--lite`):**
   - Si los comentarios fueron extraídos con `scrapear_comentarios.js --lite` (sin cuerpos de texto en disco para ahorrar ~70% de tamaño):
     - Con **`Offline: OFF`**, el visor descarga bajo demanda los textos del post abierto en lotes de 100 (`⏳ cargando texto...`) y los guarda en memoria durante la sesión.
     - Con **`Offline: ON`**, informa que el comentario proviene de un dataset ligero sin realizar peticiones de red.
