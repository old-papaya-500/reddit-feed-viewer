/**
 * Reddit Feed Viewer - Módulo Reutilizable de Preguntas Frecuentes e Instructivos (FAQ)
 * Gestiona el modal #faqDialog sincronizado con README.md y Documentation/ para todas las pantallas:
 * - scraping: README.md (Suite CLI de extracción y consolidación en el modal Armar Feed)
 * - feed:     Documentation/GUIA_FEED.md
 * - profile:  Documentation/GUIA_PERFILES.md
 */
(function () {
  'use strict';

  const faqDialog           = document.getElementById('faqDialog');
  const faqDialogBadge      = document.getElementById('faqDialogBadge');
  const faqDialogTitle      = document.getElementById('faqDialogTitle');
  const faqDialogSubtitle   = document.getElementById('faqDialogSubtitle');
  const faqDialogCloseBtn   = document.getElementById('faqDialogCloseBtn');
  const faqDialogCount      = document.getElementById('faqDialogCount');
  const faqDialogDocRef     = document.getElementById('faqDialogDocRef');
  const faqToggleAllBtn     = document.getElementById('faqToggleAllBtn');
  const faqDialogBody       = document.getElementById('faqDialogBody');
  const faqDialogIntro      = document.getElementById('faqDialogIntro');
  const faqAccordionSection = document.getElementById('faqAccordionSection');

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderCodeBlock(label, code) {
    const safeLabel = escapeHtml(label);
    const safeCode = escapeHtml(code);
    return `
      <div class="faq-code-card">
        <div class="faq-code-header">
          <span class="faq-code-label">${safeLabel}</span>
          <button type="button" class="faq-copy-btn" data-copy-code="${safeCode}" aria-label="Copiar comando: ${safeLabel}">
            📋 Copiar
          </button>
        </div>
        <pre class="faq-code-pre" role="region" aria-label="${safeLabel}" tabindex="0"><code>${safeCode}</code></pre>
      </div>
    `;
  }

  function renderTable(headers, rowsHtml) {
    const ths = headers.map(h => `<th scope="col">${escapeHtml(h)}</th>`).join('');
    const trs = rowsHtml.map(cells => `<tr>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`).join('');
    return `
      <div class="faq-table-wrap" role="region" aria-label="Tabla de referencia" tabindex="0">
        <table class="faq-table">
          <thead><tr>${ths}</tr></thead>
          <tbody>${trs}</tbody>
        </table>
      </div>
    `;
  }

  // =========================================================================
  // Catálogo de Secciones FAQ sincronizado con README.md y Documentation/
  // =========================================================================
  const FAQ_SECTIONS = {
    scraping: {
      badge: 'Suite CLI · Extracción y Consolidación',
      docRef: 'README.md',
      title: '🚀 Cómo generar perfiles_usuarios.json',
      subtitle: 'Instructivo completo para extraer publicaciones y comentarios con la suite en Node.js puro (cero dependencias) y consolidar el JSON unificado para este visor.',
      introHtml: `
        <div class="faq-callout-title">💡 Resumen rápido antes de empezar</div>
        <p>
          Ejecutá los scripts desde una terminal ubicada en la carpeta raíz del proyecto (donde están <code>buscar.js</code> y <code>consolidar_perfiles.js</code>).
          Todos los scripts incluyen <strong>Modo Interactivo Asistido</strong> (corriéndolos sin argumentos) y <strong>Modo por Línea de Comandos (CLI)</strong>.
          El archivo final que debés abrir con <strong>📂 Cargar JSON</strong> es el generado en el <strong>Paso 3</strong>:
          <code>resultados/consolidados/perfiles_YYYYMMDD_HHMMSS/perfiles_usuarios.json</code>.
        </p>
      `,
      items: [
        {
          defaultOpen: true,
          summary: '📋 Requisitos previos y flujo de trabajo en 3 etapas',
          bodyHtml: `
            <ul class="faq-list">
              <li><strong>Node.js 18 o superior</strong> recomendado (usa <code>fetch</code> y streams nativos).</li>
              <li><strong>Conexión a Internet</strong> únicamente durante la extracción; el visor web funciona <strong>100% offline</strong>.</li>
              <li><strong>Sin instalación previa:</strong> no requiere <code>npm install</code>, librerías externas ni claves de API de Reddit.</li>
            </ul>
            ${renderCodeBlock('Verificar versión instalada de Node.js', 'node -v')}
            <p class="faq-paragraph"><strong>Arquitectura desacoplada en 3 etapas (+ Visor):</strong></p>
            <div class="faq-pipeline-flow" role="list" aria-label="Etapas del flujo de trabajo">
              <div class="faq-pipeline-step" role="listitem">
                <span class="faq-step-pill">1. buscar.js</span>
                <span>Descarga publicaciones por subreddit y rango de fechas (ART UTC-3) en <code>resultados/&lt;corrida&gt;/&lt;nombre&gt;.json</code> (+ <code>.csv</code> y <code>.md</code>).</span>
              </div>
              <div class="faq-pipeline-step" role="listitem">
                <span class="faq-step-pill">2. scrapear_comentarios.js</span>
                <span>Extrae en paralelo el árbol jerárquico completo de comentarios en <code>&lt;nombre&gt;_comentarios.json</code> (soporta modo <code>--lite</code>).</span>
              </div>
              <div class="faq-pipeline-step" role="listitem">
                <span class="faq-step-pill faq-step-pill-highlight">3. consolidar_perfiles.js</span>
                <span>Fusiona posts y comentarios en <code>resultados/consolidados/perfiles_YYYYMMDD_HHMMSS/perfiles_usuarios.json</code> (listo para cargar en el visor) + resumen <code>.csv</code>.</span>
              </div>
            </div>
          `
        },
        {
          summary: '1️⃣ Paso 1: Búsqueda concurrente de publicaciones (buscar.js)',
          bodyHtml: `
            <p class="faq-paragraph">
              Extrae publicaciones de un subreddit en paralelo respetando la zona horaria oficial de Argentina (<strong>ART, UTC-3</strong>), con particionado temporal (<code>--shard mes|semana|dia</code>), hasta <strong>20 hilos en paralelo</strong> (<code>-c</code>, por defecto <code>3</code>), enfriamiento global compartido ante <code>HTTP 422/429</code>, checkpoints atómicos por partición (<code>.shards/</code> + <code>--resume</code>) y fusión final en streaming.
            </p>
            ${renderCodeBlock('Modo interactivo asistido (con validación estricta de entradas)', 'node buscar.js')}
            ${renderCodeBlock('Mes completo (por defecto r/argentina)', 'node buscar.js --mes 1 --anio 2026')}
            ${renderCodeBlock('Historial multi-año en paralelo (5 años por mes, 10 hilos, sin .md)', 'node buscar.js --sub argentina --anio-desde 2021 --anio-hasta 2025 --shard mes -c 10 --no-md')}
            ${renderCodeBlock('Reanudar una corrida pausada con Ctrl+C', 'node buscar.js --resume "resultados/<carpeta_de_corrida>"')}
            <p class="faq-note">
              <strong>Salidas en <code>resultados/&lt;prefijo&gt;_YYYYMMDD_HHMMSS/</code>:</strong> <code>&lt;nombre&gt;.json</code> (con <code>author</code>, <code>selftext</code>, <code>url</code>, <code>score</code>, <code>flair</code>), <code>&lt;nombre&gt;.csv</code> (BOM UTF-8 para Excel) y <code>&lt;nombre&gt;.md</code> (opcional con <code>--no-md</code>).
            </p>
          `
        },
        {
          summary: '2️⃣ Paso 2: Extracción concurrente de comentarios (scrapear_comentarios.js)',
          bodyHtml: `
            <p class="faq-paragraph">
              Extrae en paralelo el <strong>árbol jerárquico completo</strong> de comentarios y respuestas anidadas (<code>depth</code>, <code>parent_id</code>, <code>author</code>, <code>score</code>, <code>body</code>), preservando además el texto de los posts (<code>post_selftext</code>). Si el JSON de entrada es antiguo y no trae <code>selftext</code>, lo enriquece automáticamente en lotes de 50.
            </p>
            <ul class="faq-list">
              <li><strong>Concurrencia por defecto:</strong> <code>--concurrency 3</code> (configurable de <code>1</code> a <strong><code>20</code></strong> hilos).</li>
              <li><strong>Modo Ligero (<code>--lite</code> / <code>--solo-interacciones</code>):</strong> omite <code>body</code> y <code>media_urls</code> para ahorrar ~70% de espacio en disco/RAM conservando la estructura de árboles y métricas. Al abrir un post en el visor con <em>Offline: OFF</em>, el texto se hidrata bajo demanda desde Arctic Shift.</li>
              <li><strong>Checkpoints y Streaming:</strong> guarda progreso incremental <em>append-only</em> en <code>.&lt;nombre&gt;_comentarios_checkpoint.jsonl</code> (sin límite de 512 MB ni acumulación en RAM) y exporta el JSON final por streaming al llegar al 100%.</li>
            </ul>
            ${renderCodeBlock('Modo interactivo (descubre datasets en resultados/*/ automáticamente)', 'node scrapear_comentarios.js')}
            ${renderCodeBlock('CLI con alta concurrencia y modo ligero', 'node scrapear_comentarios.js --input resultados/<carpeta>/argentina_2026_01.json -c 10 --lite')}
            ${renderCodeBlock('Prueba rápida acotada a los primeros N posts', 'node scrapear_comentarios.js --input resultados/<carpeta>/argentina_2026_01.json --limit 10')}
          `
        },
        {
          summary: '3️⃣ Paso 3: Consolidación unificada para el Visor (consolidar_perfiles.js)',
          bodyHtml: `
            <p class="faq-paragraph">
              Escanea los archivos <code>.json</code> del directorio (hasta profundidad 4, ignorando <code>consolidados/</code>, <code>backups/</code>, <code>viewer/</code>, <code>test/</code> y <code>tests/</code>), <strong>fusiona sin pérdida</strong> <code>posts.json</code> + <code>*_comentarios.json</code> y genera el archivo <code>perfiles_usuarios.json</code> listo para cargar en este visor.
            </p>
            <ul class="faq-list">
              <li><strong>Motor escalable multi-GB de baja RAM:</strong> lectura en streaming elemento a elemento + <strong>32 particiones temporales en disco</strong> (en <code>%TEMP%</code> con limpieza automática) y ensamblado final indexado por <em>byte-offset</em>, evitando errores <code>heap out of memory</code> en millones de comentarios.</li>
              <li><strong>Manejo de <code>[deleted]</code> / <code>[removed]</code>:</strong> sus posts y comentarios se preservan con <code>es_anonimo: true</code> para no romper feeds ni árboles de discusión, excluyéndolos de las métricas de perfiles identificados.</li>
            </ul>
            ${renderCodeBlock('Modo interactivo (recomendado)', 'node consolidar_perfiles.js')}
            ${renderCodeBlock('Consolidar archivos específicos por CLI', 'node consolidar_perfiles.js --input argentina_2026_01.json,argentina_2026_01_comentarios.json')}
            ${renderCodeBlock('Filtrar por período (ART) o mínimo de actividades', 'node consolidar_perfiles.js --anio 2026 --mes 1 --min 2 --out perfiles_usuarios.json')}
            <p class="faq-note">
              <strong>Ubicación por defecto de salida:</strong> <code>resultados/consolidados/perfiles_YYYYMMDD_HHMMSS/perfiles_usuarios.json</code> (+ archivo resumen <code>.csv</code> para Excel).
            </p>
          `
        },
        {
          summary: '🛠️ Utilidad extra: Validador streaming para JSON gigantes (validar_json.js)',
          bodyHtml: `
            <p class="faq-paragraph">
              Si consolidaste un dataset masivo mayor a 512 MB (donde un lector JSON convencional agota el límite de strings de V8), podés verificar su integridad estructural en streaming antes de cargarlo en el navegador:
            </p>
            ${renderCodeBlock('Validar integridad de perfiles_usuarios.json en streaming', 'node validar_json.js perfiles_usuarios.json')}
          `
        }
      ]
    },

    feed: {
      badge: 'Guía de Uso · Sección Feed',
      docRef: 'Documentation/GUIA_FEED.md',
      title: '🗂️ Guía de Uso — Sección Feed y Controles Generales',
      subtitle: 'Cómo cargar datasets, personalizar comunidades y fechas, usar el buscador unificado (Omnibox), gestionar el modo Offline y explorar árboles de comentarios.',
      introHtml: `
        <div class="faq-callout-title">💡 Vista principal centrada</div>
        <p>
          El <strong>Feed</strong> reúne todas las publicaciones de las comunidades y fechas seleccionadas en <code>⚙️ Armar Feed</code>, con reordenamiento instantáneo en memoria, búsqueda sin distinción de tildes e indicador flotante de mes y año al desplazarte.
        </p>
      `,
      items: [
        {
          defaultOpen: true,
          summary: '🧭 Controles globales de la barra superior (Header)',
          bodyHtml: renderTable(
            ['Control', 'Función principal', 'Detalles clave'],
            [
              ['<strong>📁 Archivos ▾</strong>', '<code>📂 Cargar JSON</code> y <code>🗑️ Vaciar memoria</code>.', 'Lectura en streaming (<code>TextDecoderStream</code>) apta para cientos de MB sin congelar la pestaña.'],
              ['<strong>🔍 Buscar post o usuario...</strong>', 'Omnibox dual de títulos y perfiles.', 'Texto + <code>Enter</code> filtra títulos del Feed; prefijo <code>u/</code> busca usuarios; vacío muestra los <strong>últimos 5 recientes</strong>.'],
              ['<strong>⚙️ Armar Feed</strong>', 'Reabre el configurador en 2 pasos.', 'Permite cambiar el JSON, elegir comunidades (<code>r/...</code>), fechas ART y orden inicial.'],
              ['<strong>🌐 Offline: OFF / ON</strong>', 'Modo Offline Estricto.', 'En <code>ON</code> bloquea cualquier petición externa (multimedia remoto o hidratación desde Arctic Shift).'],
              ['<strong>🎨 Apariencia ▾</strong>', 'Tema Claro/Oscuro y estilos.', '4 presets instantáneos: <code>Original</code>, <code>Editorial</code>, <code>OSINT</code> y <code>Nordic</code>.']
            ]
          )
        },
        {
          summary: '⚙️ Configurador en 2 pasos: Modal Armar Feed',
          bodyHtml: `
            <ul class="faq-list">
              <li><strong>Paso 1 (Carga JSON):</strong> seleccioná <code>perfiles_usuarios.json</code> con <code>📂 Cargar JSON</code> (o consultá <code>❓ Cómo generar el JSON</code> si aún no corriste los scrapers). Al terminar la indexación verás el conteo de posts, perfiles y comentarios.</li>
              <li><strong>Paso 2 (Filtros iniciales):</strong> se desbloquea tras cargar el archivo; permite marcar comunidades (<code>Todas</code> / <code>Ninguna</code>), acotar fechas <code>Desde</code> / <code>Hasta</code> en horario <strong>ART (UTC-3)</strong> y elegir el orden inicial.</li>
              <li><strong>Generación:</strong> presioná <code>▶ Generar Feed</code> para desplegar las publicaciones.</li>
            </ul>
          `
        },
        {
          summary: '🔍 Búsqueda en Omnibox, Reordenamiento y Píldora de Fecha',
          bodyHtml: `
            <ul class="faq-list">
              <li><strong>Búsqueda multi-palabra sin tildes:</strong> escribir varios términos (ej. <code>dolar inflacion</code>) exige que todos figuren en el título (<em>AND</em>), ignora mayúsculas/tildes, resalta coincidencias en amarillo y activa el chip removible <code>🔍 Título: "..." ✕</code>.</li>
              <li><strong>Sugerencias contextuales:</strong> si tu Feed filtra ciertas comunidades, el desplegable del Omnibox restringe las sugerencias de usuarios a quienes participaron en esas comunidades.</li>
              <li><strong>Reordenamiento instantáneo:</strong> los chips <code>▼ Fecha descendente</code>, <code>▲ Fecha ascendente</code> y <code>🔥 Mayor score</code> reordenan en memoria sin re-escanear el dataset.</li>
              <li><strong>Paginación y píldora flotante:</strong> muestra bloques de <strong>50 posts por página</strong> y, al hacer scroll en orden cronológico, despliega una píldora lateral con <code>Mes Año</code> (estilo Google Photos).</li>
            </ul>
          `
        },
        {
          summary: '💬 Tarjetas, Modal de Detalle, Árbol de Comentarios y Modo --lite',
          bodyHtml: `
            <ul class="faq-list">
              <li><strong>Tarjetas del Feed:</strong> muestran autor clickeable (o <em><code>[deleted]</code></em> preservando el post), comunidad, flair, badge automático de medio (<code>🖼️ Imagen</code>, <code>🖼️ Galería</code>, <code>🎬 Video</code>, <code>🔗 Enlace externo</code>), fecha ART y score.</li>
              <li><strong>Modal de discusión:</strong> reconstruye el árbol jerárquico completo (<code>t3_</code> y <code>t1_</code>) ordenado por mayor score en cada nivel. Con <code>Offline: OFF</code> enriquece automáticamente textos, videos o galerías faltantes desde Arctic Shift.</li>
              <li><strong>Datasets en Modo Ligero (<code>--lite</code>):</strong> si los comentarios se extrajeron sin texto para ahorrar ~70% de disco, con <code>Offline: OFF</code> el visor hidrata bajo demanda los textos del post abierto en lotes de 100.</li>
            </ul>
          `
        }
      ]
    },

    profile: {
      badge: 'Guía de Uso · Ficha de Perfil',
      docRef: 'Documentation/GUIA_PERFILES.md',
      title: '👤 Guía de Uso — Perfil de Usuario y Línea de Tiempo',
      subtitle: 'Exploración individual por usuario: filtro multiple-choice de subreddits en vivo, KPIs, flairs y trazabilidad de respuestas en su Línea de Tiempo.',
      introHtml: `
        <div class="faq-callout-title">💡 Recálculo dinámico en tiempo real</div>
        <p>
          Al cambiar las casillas de <strong>Filtrar perfil por subreddit</strong> arriba a la derecha de la tarjeta del usuario, se recalculan instantáneamente sus fechas extremas, las 5 tarjetas de métricas (KPIs), los flairs y su Línea de Tiempo completa.
        </p>
      `,
      items: [
        {
          defaultOpen: true,
          summary: '👤 Acceso a la Ficha de Usuario y navegación contextual',
          bodyHtml: `
            <p class="faq-paragraph">Podés abrir el perfil de cualquier usuario desde distintos puntos del visor:</p>
            <ul class="faq-list">
              <li>Desde el <strong>Omnibox</strong> del encabezado (<code>🔍 Buscar post o usuario...</code>, opcionalmente con prefijo <code>u/</code>).</li>
              <li>Haciendo clic en cualquier autor <code>u/usuario</code> del <strong>Feed</strong>, del <strong>Árbol de Comentarios</strong> dentro del modal o desde otra Línea de Tiempo.</li>
            </ul>
            <p class="faq-note">
              <strong><code>← Volver al Feed</code> inteligente:</strong> conserva tu punto de origen —incluso si navegaste entre varios perfiles seguidos— y restaura tu posición exacta de scroll en el Feed.
            </p>
          `
        },
        {
          summary: '🔎 Filtro dinámico Multiple-Choice por Subreddit y KPIs',
          bodyHtml: `
            <p class="faq-paragraph">
              El desplegable <strong>Filtrar perfil por subreddit</strong> permite marcar o desmarcar comunidades individuales del usuario (con botones rápidos <code>Todos</code> y <code>Ninguno</code>). Si venís de un Feed filtrado a ciertas comunidades, las preselecciona automáticamente mostrando el aviso <code>🔎 Filtro activo (X/Y)</code>.
            </p>
            ${renderTable(
              ['Indicador (KPI)', 'Qué mide', 'Cómo interpretarlo'],
              [
                ['<strong>Score Total</strong>', 'Suma algebraica de votos en posts y comentarios del filtro activo.', 'Recepción acumulada en las comunidades seleccionadas.'],
                ['<strong>Total Actividades</strong>', 'Suma de <code>Posts + Comentarios</code>.', 'Volumen bruto de participación.'],
                ['<strong>Posts vs. Comentarios</strong>', 'Desglose entre publicaciones propias y respuestas dejadas.', 'Distingue creadores de temas (OP) de participantes en discusiones ajenas.'],
                ['<strong>Promedio / Ítem</strong>', '<code>Score Total / Total Actividades</code> (en pts).', 'Impacto medio por intervención sin importar el volumen.'],
                ['<strong>Subreddits y Flairs</strong>', 'Comunidades seleccionadas y etiquetas usadas.', 'Resumen temático del perfil.']
              ]
            )}
          `
        },
        {
          summary: '📜 Línea de Tiempo individual y trazabilidad de respuestas',
          bodyHtml: `
            <p class="faq-paragraph">
              Combina chips de ordenamiento (<code>▼ Fecha descendente</code>, <code>▲ Fecha ascendente</code>, <code>🔥 Mayor score</code>) con filtros de tipo (<code>Todos</code>, <code>📝 Posts</code>, <code>💬 Comentarios</code>), respetando también los subreddits seleccionados arriba.
            </p>
            <ul class="faq-list">
              <li><strong>Tarjetas de Publicación (borde naranja):</strong> título clickeable, flair, fecha ART, score y vista previa del cuerpo.</li>
              <li><strong>Tarjetas de Comentario (borde azul):</strong> resuelven automáticamente a quién respondió usando <code>parent_id</code> (<code>↳ 💬 En respuesta a u/destinatario · Post: ...</code> con enlace al perfil, o respuesta directa al post).</li>
              <li><strong><code>Ver en detalle y discusión ↗</code>:</strong> abre el modal con cita del comentario padre (hasta 220 caracteres) y el árbol completo de comentarios de esa publicación.</li>
            </ul>
          `
        }
      ]
    }
  };

  let activeFaqSectionId = null;

  function getAccordionDetails() {
    if (!faqAccordionSection) return [];
    return Array.from(faqAccordionSection.querySelectorAll('details.faq-item'));
  }

  function syncToggleAllState() {
    if (!faqToggleAllBtn) return;
    const items = getAccordionDetails();
    const allOpen = items.length > 0 && items.every(d => Boolean(d.open));
    faqToggleAllBtn.setAttribute('aria-expanded', allOpen ? 'true' : 'false');
  }

  function renderFaqSection(sectionId) {
    const resolvedKey = (sectionId && Object.prototype.hasOwnProperty.call(FAQ_SECTIONS, sectionId))
      ? sectionId
      : 'feed';
    const section = FAQ_SECTIONS[resolvedKey];
    activeFaqSectionId = resolvedKey;

    if (faqDialogBadge) faqDialogBadge.textContent = section.badge || 'Ayuda';
    if (faqDialogTitle) faqDialogTitle.textContent = section.title || '❓ Preguntas Frecuentes';
    if (faqDialogSubtitle) {
      faqDialogSubtitle.textContent = section.subtitle || '';
      faqDialogSubtitle.classList.toggle('hidden', !section.subtitle);
    }

    if (faqDialogDocRef) {
      if (section.docRef) {
        faqDialogDocRef.textContent = `📄 ${section.docRef}`;
        faqDialogDocRef.classList.remove('hidden');
      } else {
        faqDialogDocRef.textContent = '';
        faqDialogDocRef.classList.add('hidden');
      }
    }

    if (faqDialogIntro) {
      if (section.introHtml) {
        faqDialogIntro.innerHTML = section.introHtml;
        faqDialogIntro.classList.remove('hidden');
      } else {
        faqDialogIntro.innerHTML = '';
        faqDialogIntro.classList.add('hidden');
      }
    }

    const items = Array.isArray(section.items) ? section.items : [];
    if (faqDialogCount) {
      faqDialogCount.textContent = `${items.length} ${items.length === 1 ? 'apartado' : 'apartados'}`;
    }

    if (faqAccordionSection) {
      faqAccordionSection.innerHTML = '';
      items.forEach(item => {
        const details = document.createElement('details');
        details.className = 'faq-item';
        if (item.defaultOpen) {
          details.open = true;
          details.setAttribute('open', '');
        }
        details.innerHTML = `
          <summary class="faq-summary">${escapeHtml(item.summary)}</summary>
          <div class="faq-answer">${item.bodyHtml || ''}</div>
        `;
        faqAccordionSection.appendChild(details);
      });
    }

    syncToggleAllState();
  }

  function resetFaqScrollToTop() {
    if (faqDialog) {
      faqDialog.scrollTop = 0;
      if (typeof faqDialog.scrollTo === 'function') faqDialog.scrollTo(0, 0);
    }
    if (faqDialogBody) {
      faqDialogBody.scrollTop = 0;
      if (typeof faqDialogBody.scrollTo === 'function') faqDialogBody.scrollTo(0, 0);
    }
  }

  function openFaq(sectionId = 'feed') {
    if (!faqDialog) return;
    renderFaqSection(sectionId);
    if (!faqDialog.open) {
      if (typeof faqDialog.showModal === 'function') faqDialog.showModal();
      else faqDialog.setAttribute('open', '');
    }
    // Resetear scroll DESPUÉS de showModal(), cuando el <dialog> ya tiene layout box activo
    resetFaqScrollToTop();
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(resetFaqScrollToTop);
    }
  }

  function closeFaq() {
    if (!faqDialog) return;
    resetFaqScrollToTop();
    try {
      if (faqDialog.open && typeof faqDialog.close === 'function') {
        faqDialog.close();
      } else {
        faqDialog.removeAttribute('open');
      }
    } catch (_) {}
  }

  async function copyTextToClipboard(text) {
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (_) {
        // Fallback abajo para contextos file:// restringidos
      }
    }
    if (typeof document !== 'undefined' && document.body && typeof document.execCommand === 'function') {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.className = 'visually-hidden';
        document.body.appendChild(ta);
        if (typeof ta.select === 'function') ta.select();
        const ok = document.execCommand('copy');
        if (typeof ta.remove === 'function') ta.remove();
        return Boolean(ok);
      } catch (_) {}
    }
    return false;
  }

  // Botones declarativos con data-faq-section="..." (ej. #feedBuilderFaqBtn -> scraping)
  const faqTriggerBtns = document.querySelectorAll('[data-faq-section]');
  if (faqTriggerBtns && typeof faqTriggerBtns.forEach === 'function') {
    faqTriggerBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetSection = btn.getAttribute('data-faq-section') || (btn.dataset && btn.dataset.faqSection) || 'scraping';
        openFaq(targetSection);
      });
    });
  }

  // Respaldo explícito para el botón del modal de carga de JSON en entornos DOM simulados
  const feedBuilderFaqBtn = document.getElementById('feedBuilderFaqBtn');
  if (feedBuilderFaqBtn && (!faqTriggerBtns || faqTriggerBtns.length === 0)) {
    feedBuilderFaqBtn.addEventListener('click', () => openFaq('scraping'));
  }

  if (faqDialogCloseBtn) {
    faqDialogCloseBtn.addEventListener('click', closeFaq);
  }

  // Expandir todo / Contraer todo manteniendo aria-expanded sincronizado
  if (faqToggleAllBtn) {
    faqToggleAllBtn.addEventListener('click', () => {
      const expand = faqToggleAllBtn.getAttribute('aria-expanded') !== 'true';
      const items = getAccordionDetails();
      items.forEach(d => {
        d.open = expand;
        if (expand) d.setAttribute('open', '');
        else d.removeAttribute('open');
      });
      faqToggleAllBtn.setAttribute('aria-expanded', expand ? 'true' : 'false');
    });
  }

  if (faqAccordionSection) {
    // toggle no burbujea: usar fase de captura para mantener sincronizado el botón Expandir/Contraer todo
    faqAccordionSection.addEventListener('toggle', () => {
      syncToggleAllState();
    }, { capture: true });

    // Delegación para botones "📋 Copiar" en bloques de código CLI
    faqAccordionSection.addEventListener('click', async e => {
      const target = e.target;
      if (!target || typeof target.closest !== 'function') return;
      const copyBtn = target.closest('.faq-copy-btn');
      if (!copyBtn) return;

      const rawCode = copyBtn.getAttribute('data-copy-code') || '';
      if (!rawCode) return;

      const ok = await copyTextToClipboard(rawCode);
      const prevText = '📋 Copiar';
      copyBtn.textContent = ok ? '✅ Copiado' : '⚠️ Error';
      copyBtn.classList.toggle('is-copied', ok);
      setTimeout(() => {
        copyBtn.textContent = prevText;
        copyBtn.classList.remove('is-copied');
      }, 1800);
    });
  }

  // Fallback de light-dismiss por coordenadas de puntero si el navegador no soporta <dialog closedby="any">
  if (faqDialog && typeof HTMLDialogElement !== 'undefined' && !('closedBy' in HTMLDialogElement.prototype)) {
    const isPointerOutside = (e, dlg) => {
      const r = dlg.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };
    let pressedOutside = false;
    faqDialog.addEventListener('pointerdown', e => {
      pressedOutside = isPointerOutside(e, faqDialog);
    });
    faqDialog.addEventListener('pointerup', e => {
      if (pressedOutside && isPointerOutside(e, faqDialog)) closeFaq();
      pressedOutside = false;
    });
  }

  window.RedditFaqController = {
    openFaq,
    closeFaq,
    getActiveSectionId: () => activeFaqSectionId,
    getSectionIds: () => Object.keys(FAQ_SECTIONS)
  };
})();
