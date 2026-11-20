/**
 * Reddit Community Auditor - Frontend Estático
 * Desarrollado bajo las directrices de Google Chrome Modern Web Guidance
 */
(function () {
  'use strict';

  // =========================================================================
  // 1. Estado Global
  // =========================================================================
  let allProfiles = [];
  let availableSubreddits = new Set();
  let selectedProfile = null;
  let previousView = 'feed'; // 'feed' o 'ranking'

  // Índices globales para búsquedas instantáneas en memoria
  const userProfileMap = new Map();   // username.toLowerCase() -> perfil
  const commentsByPostId = new Map(); // postId -> Array de comentarios
  const postById = new Map();         // postId -> objeto post

  // Feed state (solo posts)
  let feedItems = [];        // todos los posts filtrados
  let feedPage = 0;          // página de paginación
  const FEED_PAGE_SIZE = 50; // posts por página

  // Timeline state (dentro del perfil de un usuario)
  let activeTimelineFilter = 'all';
  let activeTimelineSub = 'all';
  let currentSortOrder = 'desc';
  let strictOfflineMode = false;

  // =========================================================================
  // 2. Referencias DOM
  // =========================================================================
  const tabFeed           = document.getElementById('tabFeed');
  const tabRanking        = document.getElementById('tabRanking');
  const tabGraph          = document.getElementById('tabGraph');
  const sectionFeed       = document.getElementById('sectionFeed');
  const sectionRanking    = document.getElementById('sectionRanking');
  const sectionProfile    = document.getElementById('sectionProfile');
  const sectionGraph      = document.getElementById('sectionGraph');
  const profileOpenGraphBtn = document.getElementById('profileOpenGraphBtn');

  const fileInput         = document.getElementById('fileInput');
  const clearMemoryBtn    = document.getElementById('clearMemoryBtn');
  const offlineToggle     = document.getElementById('offlineToggle');
  const offlineIcon       = document.getElementById('offlineIcon');
  const offlineLabel      = document.getElementById('offlineLabel');
  const stylePresetSelect = document.getElementById('stylePresetSelect');
  const themeToggle       = document.getElementById('themeToggle');
  const themeIcon         = document.getElementById('themeIcon');
  const statusText        = document.getElementById('statusText');
  const statusMeta        = document.getElementById('statusMeta');

  // Header Search
  const headerUserSearch      = document.getElementById('headerUserSearch');
  const headerUserSubFilter   = document.getElementById('headerUserSubFilter');
  const headerSearchDropdown  = document.getElementById('headerSearchDropdown');

  // Feed Builder
  const feedTitleSearch     = document.getElementById('feedTitleSearch');
  const clearTitleSearchBtn = document.getElementById('clearTitleSearchBtn');
  const subCheckboxList   = document.getElementById('subCheckboxList');
  const subsSelectAll     = document.getElementById('subsSelectAll');
  const subsSelectNone    = document.getElementById('subsSelectNone');
  const feedDateFrom      = document.getElementById('feedDateFrom');
  const feedDateTo        = document.getElementById('feedDateTo');
  const clearDatesBtn     = document.getElementById('clearDatesBtn');
  const feedSortSelect    = document.getElementById('feedSortSelect');
  const applyFeedBtn      = document.getElementById('applyFeedBtn');
  const feedCounterBadge  = document.getElementById('feedCounterBadge');
  const feedItemCount     = document.getElementById('feedItemCount');
  const feedEmptyState    = document.getElementById('feedEmptyState');
  const feedItemsList     = document.getElementById('feedItemsList');
  const feedPagination    = document.getElementById('feedPagination');
  const feedLoadMore      = document.getElementById('feedLoadMore');
  const feedPaginationInfo = document.getElementById('feedPaginationInfo');

  // Ranking
  const rankingSortSelect = document.getElementById('rankingSortSelect');
  const rankingSubFilter  = document.getElementById('rankingSubFilter');
  const rankingCount      = document.getElementById('rankingCount');
  const rankingList       = document.getElementById('rankingList');

  // Perfil de Usuario
  const backBtn           = document.getElementById('backBtn');
  const backBtnText       = document.getElementById('backBtnText');
  const userName          = document.getElementById('userName');
  const userAvatar        = document.getElementById('userAvatar');
  const userDates         = document.getElementById('userDates');
  const redditProfileLink = document.getElementById('redditProfileLink');
  const metricScore       = document.getElementById('metricScore');
  const metricTotal       = document.getElementById('metricTotal');
  const metricPosts       = document.getElementById('metricPosts');
  const metricComments    = document.getElementById('metricComments');
  const metricAvg         = document.getElementById('metricAvg');
  const userSubreddits       = document.getElementById('userSubreddits');
  const userFlairs           = document.getElementById('userFlairs');
  const profileFilterNotice  = document.getElementById('profileFilterNotice');
  const profileSubMultiWrap  = document.getElementById('profileSubMultiWrap');
  const profileSubMultiBtn   = document.getElementById('profileSubMultiBtn');
  const profileSubMultiLabel = document.getElementById('profileSubMultiLabel');
  const profileSubMultiPanel = document.getElementById('profileSubMultiPanel');
  const profileSubsAllBtn    = document.getElementById('profileSubsAllBtn');
  const profileSubsNoneBtn   = document.getElementById('profileSubsNoneBtn');
  const profileSubCheckboxes = document.getElementById('profileSubCheckboxes');
  const userHeatmapGrid      = document.getElementById('userHeatmapGrid');
  const heatmapSummary       = document.getElementById('heatmapSummary');
  const timelineSortOrder    = document.getElementById('timelineSortOrder');
  const timelineChips     = document.querySelectorAll('.timeline-filters .chip');
  const timelineCount     = document.getElementById('timelineCount');
  const timelineFeed      = document.getElementById('timelineFeed');

  // Modal Dialog Nativo
  const itemDialog              = document.getElementById('itemDialog');
  const dialogTypeBadge         = document.getElementById('dialogTypeBadge');
  const dialogSubBadge          = document.getElementById('dialogSubBadge');
  const dialogDate              = document.getElementById('dialogDate');
  const dialogAuthorWrap        = document.getElementById('dialogAuthorWrap');
  const dialogAuthorLink        = document.getElementById('dialogAuthorLink');
  const dialogTitle             = document.getElementById('dialogTitle');
  const dialogContext           = document.getElementById('dialogContext');
  const dialogContent           = document.getElementById('dialogContent');
  const dialogMedia             = document.getElementById('dialogMedia');
  const dialogCommentsSection   = document.getElementById('dialogCommentsSection');
  const dialogCommentsTitle     = document.getElementById('dialogCommentsTitle');
  const dialogCommentsCountBadge = document.getElementById('dialogCommentsCountBadge');
  const dialogCommentTree       = document.getElementById('dialogCommentTree');
  const dialogScore             = document.getElementById('dialogScore');
  const dialogRedditLink        = document.getElementById('dialogRedditLink');
  const dialogCloseBtn          = document.getElementById('dialogCloseBtn');

  // Modal de Loading Global
  const loadingDialog           = document.getElementById('loadingDialog');
  const loadingTitle            = document.getElementById('loadingTitle');
  const loadingDetail           = document.getElementById('loadingDetail');
  const loadingProgressBar      = document.getElementById('loadingProgressBar');
  const loadingPercent          = document.getElementById('loadingPercent');

  if (loadingDialog) {
    // Evitar cierre accidental con Escape mientras hay un proceso en curso
    loadingDialog.addEventListener('cancel', e => e.preventDefault());
  }

  const LoadingModal = {
    async yieldToUI() {
      await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
    },
    async show(title, detail = 'Por favor esperá un instante...', pct = null) {
      if (!loadingDialog) return;
      if (loadingTitle) loadingTitle.textContent = title || 'Procesando...';
      if (loadingDetail) loadingDetail.textContent = detail || '';
      this._setProgress(pct);
      if (!loadingDialog.open) {
        if (typeof loadingDialog.showModal === 'function') loadingDialog.showModal();
        else loadingDialog.setAttribute('open', '');
      }
      // Garantizar que el navegador pinte el modal antes de comenzar trabajo intensivo
      await this.yieldToUI();
    },
    async update(detail, pct = null, title = null) {
      if (!loadingDialog) return;
      if (title && loadingTitle) loadingTitle.textContent = title;
      if (detail !== undefined && detail !== null && loadingDetail) loadingDetail.textContent = detail;
      this._setProgress(pct);
      await new Promise(r => setTimeout(r, 0));
    },
    _setProgress(pct) {
      if (!loadingProgressBar || !loadingPercent) return;
      if (pct === null || pct === undefined || Number.isNaN(pct)) {
        loadingProgressBar.classList.add('indeterminate');
        loadingProgressBar.style.width = '';
        loadingPercent.textContent = '';
      } else {
        const clamped = Math.max(0, Math.min(100, Math.round(pct)));
        loadingProgressBar.classList.remove('indeterminate');
        loadingProgressBar.style.width = `${clamped}%`;
        loadingPercent.textContent = `${clamped}%`;
      }
    },
    hide() {
      if (!loadingDialog) return;
      try {
        if (loadingDialog.open && typeof loadingDialog.close === 'function') {
          loadingDialog.close();
        } else {
          loadingDialog.removeAttribute('open');
        }
      } catch (_) {}
    }
  };

  window.RedditLoadingModal = LoadingModal;

  // =========================================================================
  // 3. Temas Claro / Oscuro con color-scheme nativo
  // =========================================================================
  function initTheme() {
    const saved = localStorage.getItem('reddit_auditor_theme');
    if (saved) {
      document.documentElement.setAttribute('data-theme', saved);
      themeIcon.textContent = saved === 'dark' ? '☀️' : '🌙';
    } else {
      themeIcon.textContent = window.matchMedia('(prefers-color-scheme: dark)').matches ? '☀️' : '🌙';
    }
    themeToggle.addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme');
      const next = (cur === 'dark') ? 'light' : (cur === 'light') ? 'dark'
        : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'light' : 'dark');
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('reddit_auditor_theme', next);
      themeIcon.textContent = next === 'dark' ? '☀️' : '🌙';
    });

    // Selector de paletas y tipografías (Original, Editorial, OSINT, Nordic)
    const savedStyle = localStorage.getItem('reddit_auditor_style_preset') || 'default';
    if (savedStyle !== 'default') {
      document.documentElement.setAttribute('data-style', savedStyle);
    }
    if (stylePresetSelect) {
      stylePresetSelect.value = savedStyle;
      stylePresetSelect.addEventListener('change', e => {
        const val = e.target.value;
        if (val === 'default') {
          document.documentElement.removeAttribute('data-style');
        } else {
          document.documentElement.setAttribute('data-style', val);
        }
        localStorage.setItem('reddit_auditor_style_preset', val);
      });
    }
  }

  // =========================================================================
  // 3b. Modo Offline Estricto (bloquea cualquier tráfico hacia servidores externos)
  // =========================================================================
  function updateOfflineButtonUI() {
    if (!offlineToggle) return;
    offlineToggle.setAttribute('aria-pressed', strictOfflineMode ? 'true' : 'false');
    if (strictOfflineMode) {
      offlineToggle.classList.add('is-offline');
      offlineIcon.textContent = '📴';
      offlineLabel.textContent = 'Offline: ON';
    } else {
      offlineToggle.classList.remove('is-offline');
      offlineIcon.textContent = '🌐';
      offlineLabel.textContent = 'Offline: OFF';
    }
  }

  function initOfflineMode() {
    const saved = localStorage.getItem('reddit_auditor_strict_offline');
    strictOfflineMode = saved === 'true';
    updateOfflineButtonUI();

    if (offlineToggle) {
      offlineToggle.addEventListener('click', () => {
        strictOfflineMode = !strictOfflineMode;
        localStorage.setItem('reddit_auditor_strict_offline', strictOfflineMode ? 'true' : 'false');
        updateOfflineButtonUI();

        // Si el modal de detalle está abierto, refrescar su contenido con el nuevo modo
        if (itemDialog && itemDialog.open && currentModalPost) {
          openPostDetail(currentModalPost);
        }
      });
    }
  }

  // =========================================================================
  // 4. Vista Principal (Feed)
  // =========================================================================
  function showView() {
    document.body.classList.add('view-feed');
    if (sectionFeed) sectionFeed.classList.remove('hidden');
  }

  // =========================================================================
  // 5. Carga e Indexación de Datos
  // =========================================================================
  async function loadData(jsonObj, sourceName) {
    let list = [];
    let meta = null;

    if (Array.isArray(jsonObj)) {
      list = jsonObj;
    } else if (jsonObj && Array.isArray(jsonObj.perfiles)) {
      list = jsonObj.perfiles;
      meta = jsonObj.metadata;
    } else {
      alert('El formato del archivo no es válido.');
      return;
    }

    function isDeletedProfile(p) {
      if (!p) return true;
      if (p.es_anonimo) return true;
      const u = String(p.usuario || '').trim().toLowerCase();
      return !u || u === '[deleted]' || u === '[removed]';
    }

    allProfiles = [];
    availableSubreddits.clear();
    userProfileMap.clear();
    commentsByPostId.clear();
    postById.clear();

    // Indexación en memoria en bloques cooperativos para no congelar la interfaz
    const total = list.length;
    const CHUNK_SIZE = 2500;
    for (let i = 0; i < total; i++) {
      const p = list[i];
      const deletedEntry = isDeletedProfile(p);

      if (!deletedEntry && p.usuario) {
        allProfiles.push(p);
        userProfileMap.set(p.usuario.toLowerCase(), p);
      }

      if (p.metricas && Array.isArray(p.metricas.subreddits_activos)) {
        p.metricas.subreddits_activos.forEach(s => availableSubreddits.add(s));
      }

      if (Array.isArray(p.timeline)) {
        const displayAuthor = deletedEntry ? '[deleted]' : p.usuario;
        p.timeline.forEach(it => {
          if (it.tipo === 'post') {
            it._author = displayAuthor;
            const pid = it.id || it.post_id;
            if (pid && !postById.has(pid)) {
              postById.set(pid, it);
            }
          } else if (it.tipo === 'comentario') {
            it.author = displayAuthor;
            let pid = it.post_id;
            if (!pid && it.parent_id && it.parent_id.startsWith('t3_')) {
              pid = it.parent_id.slice(3);
            }
            if (pid) {
              let bucket = commentsByPostId.get(pid);
              if (!bucket) {
                bucket = [];
                commentsByPostId.set(pid, bucket);
              }
              bucket.push(it);
            }
          }
        });
      }

      if (i > 0 && i % CHUNK_SIZE === 0) {
        const indexPct = 85 + Math.round((i / total) * 12);
        await LoadingModal.update(
          `Indexando perfiles y comentarios: ${i.toLocaleString()} / ${total.toLocaleString()} registros...`,
          indexPct
        );
      }
    }

    statusText.textContent = `${sourceName} · ${allProfiles.length.toLocaleString()} perfiles indexados · ${commentsByPostId.size.toLocaleString()} hilos con comentarios`;
    if (meta) {
      statusMeta.textContent = `Posts: ${(meta.posts_totales_indexados || 0).toLocaleString()} · Comentarios: ${(meta.comentarios_totales_indexados || 0).toLocaleString()}`;
    }

    await LoadingModal.update('Preparando filtros y feed inicial...', 98);

    buildSubCheckboxes();

    if (clearMemoryBtn) clearMemoryBtn.disabled = false;

    // Generar feed automático inicial si hay datos
    if (postById.size > 0) {
      generateFeed();
    }
  }

  function populateHeaderUserSubFilter() {
    if (!headerUserSubFilter) return;
    headerUserSubFilter.innerHTML = '<option value="all">Todos</option>';
    Array.from(availableSubreddits).sort().forEach(sub => {
      const opt = document.createElement('option');
      opt.value = sub;
      opt.textContent = `r/${sub}`;
      headerUserSubFilter.appendChild(opt);
    });
  }

  function clearMemory() {
    if (allProfiles.length === 0) return;
    if (!confirm('¿Vaciar todos los datos cargados en memoria RAM?')) return;

    // 1. Liberar todas las estructuras de datos en memoria
    allProfiles = [];
    availableSubreddits.clear();
    userProfileMap.clear();
    commentsByPostId.clear();
    postById.clear();
    feedItems = [];
    feedPage = 0;
    selectedProfile = null;
    currentModalPost = null;
    currentModalPostId = null;
    activeTitleTerms = [];
    activeTimelineSub = 'all';

    // 2. Cerrar modal si estaba abierto
    if (itemDialog && itemDialog.open && typeof itemDialog.close === 'function') {
      try { itemDialog.close(); } catch (_) {}
    }

    // 3. Limpiar controles e inputs
    if (fileInput) fileInput.value = '';
    if (feedTitleSearch) feedTitleSearch.value = '';
    if (clearTitleSearchBtn) clearTitleSearchBtn.classList.add('hidden');
    if (feedDateFrom) feedDateFrom.value = '';
    if (feedDateTo) feedDateTo.value = '';
    if (headerUserSearch) headerUserSearch.value = '';
    if (headerUserSubFilter) headerUserSubFilter.innerHTML = '<option value="all">Todos</option>';
    if (headerSearchDropdown) {
      headerSearchDropdown.innerHTML = '';
      headerSearchDropdown.classList.add('hidden');
    }

    // 4. Resetear vistas DOM
    subCheckboxList.innerHTML = '<p class="sidebar-empty-hint">Cargá un archivo JSON para ver las comunidades disponibles.</p>';
    feedItemsList.innerHTML = '';
    feedItemsList.classList.add('hidden');
    feedPagination.classList.add('hidden');
    feedCounterBadge.classList.add('hidden');
    feedEmptyState.classList.remove('hidden');

    if (clearMemoryBtn) clearMemoryBtn.disabled = true;
    statusText.textContent = 'Memoria vaciada · Esperando archivo de datos...';
    statusMeta.textContent = '';

    showView('feed');
  }

  if (clearMemoryBtn) {
    clearMemoryBtn.addEventListener('click', clearMemory);
  }

  /**
   * Lector JSON por Streaming para archivos grandes (> 150 MB hasta varios GB).
   * Evita el límite de V8 de 512 MB para un string único, por el cual FileReader.readAsText()
   * devolvía "" y causaba "SyntaxError: Unexpected end of JSON input".
   */
  async function parseLargeJsonFile(file) {
    const totalBytes = file.size;
    const totalMB = (totalBytes / (1024 * 1024)).toFixed(1);

    if (totalBytes < 150 * 1024 * 1024) {
      statusText.textContent = `Leyendo ${file.name} (${totalMB} MB)...`;
      await LoadingModal.update(`Leyendo ${file.name} (${totalMB} MB)...`, 25);
      const text = await file.text();
      await LoadingModal.update(`Parseando estructura JSON (${totalMB} MB)...`, 65);
      return JSON.parse(text);
    }

    const reader = file.stream().pipeThrough(new TextDecoderStream()).getReader();

    let bytesApprox = 0;
    let inString = false;
    let escapeNext = false;
    const stack = [];

    let capturing = false;
    let captureTarget = ''; // 'metadata' o 'item'
    let captureDepth = -1;
    let objChunks = [];

    let meta = null;
    const perfiles = [];
    let nextUiUpdate = 12 * 1024 * 1024;

    while (true) {
      const { done, value: chunk } = await reader.read();
      if (done) break;

      bytesApprox += chunk.length;
      if (bytesApprox >= nextUiUpdate) {
        const readMB = Math.min(totalBytes, bytesApprox) / (1024 * 1024);
        const rawPct = Math.min(99, (bytesApprox / totalBytes) * 100);
        const modalPct = Math.min(84, Math.round(rawPct * 0.84));
        const msg = `Leyendo en streaming: ${readMB.toFixed(0)} MB / ${totalMB} MB · ${perfiles.length.toLocaleString()} perfiles leídos...`;
        statusText.textContent = msg;
        await LoadingModal.update(msg, modalPct);
        nextUiUpdate += 12 * 1024 * 1024;
      }

      let sliceStart = capturing ? 0 : -1;

      for (let i = 0; i < chunk.length; i++) {
        const ch = chunk[i];

        if (escapeNext) {
          escapeNext = false;
          continue;
        }

        if (inString) {
          if (ch === '\\') {
            escapeNext = true;
          } else if (ch === '"') {
            inString = false;
          }
          continue;
        }

        if (ch === '"') {
          inString = true;
        } else if (ch === '{' || ch === '[') {
          stack.push(ch);

          if (!capturing && ch === '{') {
            const d = stack.length;
            if (d === 2 && stack[0] === '{' && stack[1] === '{') {
              capturing = true;
              captureTarget = 'metadata';
              captureDepth = 2;
              objChunks = [];
              sliceStart = i;
            } else if (d === 3 && stack[0] === '{' && stack[1] === '[' && stack[2] === '{') {
              capturing = true;
              captureTarget = 'item';
              captureDepth = 3;
              objChunks = [];
              sliceStart = i;
            } else if (d === 2 && stack[0] === '[' && stack[1] === '{') {
              capturing = true;
              captureTarget = 'item';
              captureDepth = 2;
              objChunks = [];
              sliceStart = i;
            }
          }
        } else if (ch === '}' || ch === ']') {
          if (capturing && ch === '}' && stack.length === captureDepth) {
            objChunks.push(chunk.slice(sliceStart, i + 1));
            const fullStr = objChunks.join('');
            const parsed = JSON.parse(fullStr);
            if (captureTarget === 'metadata') {
              meta = parsed;
            } else {
              perfiles.push(parsed);
            }
            capturing = false;
            captureTarget = '';
            captureDepth = -1;
            objChunks = [];
            sliceStart = -1;
          }
          stack.pop();
        }
      }

      if (capturing && sliceStart !== -1) {
        objChunks.push(chunk.slice(sliceStart));
      }
    }

    if (capturing || stack.length > 0 || inString) {
      throw new Error(`El archivo JSON parece estar incompleto o truncado al final (bloques abiertos: ${stack.length}). Ejecutá "node validar_json.js" para verificarlo.`);
    }

    return meta ? { metadata: meta, perfiles } : perfiles;
  }

  fileInput.addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    statusText.textContent = `Iniciando lectura de ${file.name}...`;
    await LoadingModal.show(
      '📂 Cargando archivo JSON',
      `Preparando lectura de ${file.name} (${sizeMB} MB)...`,
      2
    );
    try {
      const data = await parseLargeJsonFile(file);
      await loadData(data, file.name);
      await LoadingModal.update('¡Carga completada!', 100);
      LoadingModal.hide();
    } catch (err) {
      LoadingModal.hide();
      statusText.textContent = `Error al cargar ${file.name}`;
      alert(`Error al parsear JSON: ${err.message}`);
    }
  });

  async function tryAutoLoad() {
    const candidates = [
      'perfiles_usuarios.json',
      '../perfiles_usuarios.json',
      '../../perfiles_usuarios.json',
      '../test run abs/release/perfiles_usuarios.json'
    ];
    for (const url of candidates) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          await LoadingModal.show('📂 Cargando dataset automáticamente', `Descargando ${url}...`, null);
          const json = await res.json();
          await loadData(json, url);
          LoadingModal.hide();
          return;
        }
      } catch (_) {
        LoadingModal.hide();
      }
    }
  }

  function navigateToUserProfile() {}

  // =========================================================================
  // 8. Feed Builder: Checkboxes de Comunidades y Rango de Fechas
  // =========================================================================
  function buildSubCheckboxes() {
    subCheckboxList.innerHTML = '';

    if (availableSubreddits.size === 0) {
      subCheckboxList.innerHTML = '<p class="sidebar-empty-hint">No hay comunidades disponibles.</p>';
      return;
    }

    // Contar posts por comunidad (incluyendo posts de autores [deleted] presentes en postById)
    const subPostCounts = new Map();
    postById.forEach(it => {
      const sub = it.subreddit || 'otros';
      subPostCounts.set(sub, (subPostCounts.get(sub) || 0) + 1);
    });

    const sorted = Array.from(availableSubreddits).sort();
    sorted.forEach(sub => {
      const id = `sub-chk-${sub}`;
      const count = subPostCounts.get(sub) || 0;

      const wrapper = document.createElement('div');
      wrapper.className = 'sub-checkbox-item';

      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.id = id;
      chk.value = sub;
      chk.checked = true; // seleccionadas por defecto
      chk.className = 'sub-chk';

      const lbl = document.createElement('label');
      lbl.htmlFor = id;
      lbl.textContent = `r/${sub}`;

      const cnt = document.createElement('span');
      cnt.className = 'sub-checkbox-count';
      cnt.textContent = count.toLocaleString();

      wrapper.appendChild(chk);
      wrapper.appendChild(lbl);
      wrapper.appendChild(cnt);
      subCheckboxList.appendChild(wrapper);
    });
  }

  subsSelectAll.addEventListener('click', () => {
    subCheckboxList.querySelectorAll('.sub-chk').forEach(c => { c.checked = true; });
  });

  subsSelectNone.addEventListener('click', () => {
    subCheckboxList.querySelectorAll('.sub-chk').forEach(c => { c.checked = false; });
  });

  clearDatesBtn.addEventListener('click', () => {
    feedDateFrom.value = '';
    feedDateTo.value = '';
  });

  // =========================================================================
  // 9. Feed Builder: Generar Feed (Solo Posts por Defecto + Buscador por Título)
  // =========================================================================
  let activeTitleTerms = [];
  let titleSearchDebounce = null;

  function normalizeSearchText(str) {
    if (!str) return '';
    return String(str)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function highlightTitleHtml(rawTitle, terms) {
    const safeTitle = escapeHtml(rawTitle || '(Sin título)');
    if (!terms || terms.length === 0) return safeTitle;

    // Resaltado seguro tolerante a mayúsculas/tildes sobre el texto original
    const escapedTerms = terms
      .filter(Boolean)
      .map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .map(t => t
        .replace(/a/g, '[aáàäâ]')
        .replace(/e/g, '[eéèëê]')
        .replace(/i/g, '[iíìïî]')
        .replace(/o/g, '[oóòöô]')
        .replace(/u/g, '[uúùüû]')
        .replace(/n/g, '[nñ]')
      );
    if (escapedTerms.length === 0) return safeTitle;

    try {
      const rx = new RegExp(`(${escapedTerms.join('|')})`, 'gi');
      return safeTitle.replace(rx, '<mark class="title-highlight">$1</mark>');
    } catch (_) {
      return safeTitle;
    }
  }

  if (feedTitleSearch) {
    feedTitleSearch.addEventListener('input', () => {
      const hasVal = feedTitleSearch.value.trim().length > 0;
      if (clearTitleSearchBtn) clearTitleSearchBtn.classList.toggle('hidden', !hasVal);
      clearTimeout(titleSearchDebounce);
      if (allProfiles.length > 0) {
        titleSearchDebounce = setTimeout(generateFeed, 220);
      }
    });

    feedTitleSearch.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        clearTimeout(titleSearchDebounce);
        if (allProfiles.length > 0) generateFeed();
      }
    });
  }

  if (clearTitleSearchBtn) {
    clearTitleSearchBtn.addEventListener('click', () => {
      feedTitleSearch.value = '';
      clearTitleSearchBtn.classList.add('hidden');
      if (allProfiles.length > 0) generateFeed();
      feedTitleSearch.focus();
    });
  }

  applyFeedBtn.addEventListener('click', generateFeed);

  function generateFeed() {
    if (allProfiles.length === 0) {
      alert('Primero cargá un archivo perfiles_usuarios.json.');
      return;
    }

    const selectedSubs = new Set(
      Array.from(subCheckboxList.querySelectorAll('.sub-chk:checked')).map(c => c.value)
    );
    const sortMode = feedSortSelect.value;

    const rawQuery = feedTitleSearch ? feedTitleSearch.value.trim() : '';
    const normQuery = normalizeSearchText(rawQuery);
    activeTitleTerms = normQuery ? normQuery.split(/\s+/).filter(Boolean) : [];

    let fromTs = null;
    let toTs   = null;
    if (feedDateFrom.value) {
      fromTs = new Date(feedDateFrom.value + 'T00:00:00-03:00').getTime() / 1000;
    }
    if (feedDateTo.value) {
      toTs = new Date(feedDateTo.value + 'T23:59:59-03:00').getTime() / 1000;
    }

    // Recorrer directamente el índice postById (20x más rápido que escanear todos los comentarios)
    const postsList = [];
    postById.forEach(it => {
      // Filtro por subreddit
      const sub = it.subreddit || '';
      if (selectedSubs.size > 0 && !selectedSubs.has(sub)) return;

      // Filtro por fechas
      const ts = it.created_utc || 0;
      if (fromTs !== null && ts < fromTs) return;
      if (toTs   !== null && ts > toTs)   return;

      // Filtro por palabras clave en el título (multi-palabra AND, sin distinguir tildes)
      if (activeTitleTerms.length > 0) {
        if (it._titleNorm === undefined) {
          it._titleNorm = normalizeSearchText(it.titulo || '');
        }
        for (let i = 0; i < activeTitleTerms.length; i++) {
          if (!it._titleNorm.includes(activeTitleTerms[i])) return;
        }
      }

      postsList.push(it);
    });

    // Ordenamiento
    postsList.sort((a, b) => {
      if (sortMode === 'date_asc')   return (a.created_utc || 0) - (b.created_utc || 0);
      if (sortMode === 'score_desc') return (b.score || 0)       - (a.score || 0);
      return (b.created_utc || 0) - (a.created_utc || 0); // date_desc por defecto
    });

    feedItems = postsList;
    feedPage  = 0;

    feedItemCount.textContent = postsList.length.toLocaleString();
    feedCounterBadge.classList.remove('hidden');

    feedEmptyState.classList.add('hidden');
    feedItemsList.innerHTML = '';
    feedItemsList.classList.remove('hidden');

    if (postsList.length === 0) {
      feedItemsList.innerHTML = '<div class="empty-state" style="text-align:center;padding:3rem;">No se encontraron publicaciones con esos filtros.</div>';
      feedPagination.classList.add('hidden');
      return;
    }

    renderFeedPage();
  }

  function renderFeedPage() {
    const start = feedPage * FEED_PAGE_SIZE;
    const slice = feedItems.slice(start, start + FEED_PAGE_SIZE);

    slice.forEach(it => {
      const card = buildPostCard(it);
      feedItemsList.appendChild(card);
    });

    feedPage++;
    const shown = Math.min(feedPage * FEED_PAGE_SIZE, feedItems.length);

    if (shown < feedItems.length) {
      feedPagination.classList.remove('hidden');
      feedPaginationInfo.textContent = `Mostrando ${shown.toLocaleString()} de ${feedItems.length.toLocaleString()} publicaciones`;
    } else {
      feedPagination.classList.add('hidden');
      feedPaginationInfo.textContent = '';
    }
  }

  feedLoadMore.addEventListener('click', renderFeedPage);

  // =========================================================================
  // 10. Construcción de Tarjeta de Publicación en el Feed
  // =========================================================================
  function isDirectImageUrl(url) {
    if (!url) return false;
    const clean = url.split('?')[0].toLowerCase();
    return (
      url.includes('i.redd.it/') ||
      url.includes('i.imgur.com/') ||
      clean.endsWith('.jpg') ||
      clean.endsWith('.jpeg') ||
      clean.endsWith('.png') ||
      clean.endsWith('.gif') ||
      clean.endsWith('.webp')
    );
  }

  function detectPostMediaBadge(it) {
    const url = it.url || it.original_url || '';
    const permalink = it.permalink || '';
    if (!url) return '';
    if (isDirectImageUrl(url)) return '<span class="badge">🖼️ Imagen</span>';
    if (url.includes('v.redd.it/') || (it.post_type === 'video')) return '<span class="badge">🎬 Video</span>';
    if (url.includes('/gallery/') || (it.post_type === 'gallery')) return '<span class="badge">🖼️ Galería</span>';
    if (permalink && url !== permalink && !url.includes('reddit.com/r/')) {
      return '<span class="badge">🔗 Enlace externo</span>';
    }
    return '';
  }

  function buildPostCard(it) {
    const card = document.createElement('article');
    card.className = 'timeline-item timeline-item-post';

    const author = it._author || it.author || '[deleted]';
    const isDeletedAuthor = author === '[deleted]' || author === '[removed]';
    const initial = isDeletedAuthor ? '?' : (author[0] || 'U').toUpperCase();
    const pid = it.id || it.post_id || '';
    const commentsForThisPost = pid && commentsByPostId.has(pid) ? commentsByPostId.get(pid).length : (it.num_comments || 0);
    const subLabel = it.subreddit ? `r/${it.subreddit}` : '';
    const mediaBadge = detectPostMediaBadge(it);
    const bodyText = it.cuerpo || it.selftext || '';
    const authorLinkHtml = isDeletedAuthor
      ? `<span style="color: var(--text-muted); font-style: italic;">[deleted]</span>`
      : `<span class="author-user-link" style="cursor:default;text-decoration:none;">u/${escapeHtml(author)}</span>`;

    card.innerHTML = `
      <div class="feed-item-author">
        <div class="feed-item-author-avatar">${initial}</div>
        <span>Publicado por </span>
        ${authorLinkHtml}
      </div>

      <div class="timeline-item-header">
        <div class="timeline-item-meta">
          <span class="badge badge-post">📝 POST</span>
          ${subLabel ? `<span class="badge badge-sub">${escapeHtml(subLabel)}</span>` : ''}
          ${it.flair ? `<span class="badge badge-flair">${escapeHtml(it.flair)}</span>` : ''}
          ${mediaBadge}
          <span>${escapeHtml(it.date_art || '')}</span>
        </div>
        <span class="timeline-score">▲ ${it.score || 0}</span>
      </div>

      <div class="timeline-item-main">
        <h4 class="timeline-post-title post-clickable-title" style="cursor: pointer;" title="Abrir publicación y ver árbol de comentarios">${highlightTitleHtml(it.titulo || '(Sin título)', activeTitleTerms)}</h4>
        ${bodyText ? `<div class="timeline-post-selftext-preview">${escapeHtml(bodyText)}</div>` : ''}
      </div>

      <div class="timeline-item-footer">
        <button type="button" class="btn btn-secondary view-discussion-btn" style="font-size: 0.78rem; padding: 0.35rem 0.7rem;">
          💬 Ver contenido y discusión (${commentsForThisPost} comentarios) ↗
        </button>
        ${it.permalink ? `<a href="${it.permalink}" target="_blank" rel="noopener noreferrer" class="external-link">Abrir en Reddit ↗</a>` : ''}
      </div>
    `;

    // Clic en el nombre del autor -> ir al perfil completo
    const authorLink = card.querySelector('.feed-author-link');
    if (authorLink) {
      authorLink.addEventListener('click', (e) => {
        e.preventDefault();
        navigateToUserProfile(author);
      });
    }

    // Clic en el título o en el botón "Ver discusión" -> abrir post y reconstruir árbol
    const openPost = () => openPostDetail(it);
    card.querySelector('.post-clickable-title').addEventListener('click', openPost);
    card.querySelector('.view-discussion-btn').addEventListener('click', openPost);

    return card;
  }

  // =========================================================================
  // 11. Contenido del Post, Multimedia y Reconstrucción del Árbol de Comentarios
  // =========================================================================
  let currentModalPostId = null;
  let currentModalPost = null;

  function renderPostBodyAndMedia(post, isFetchingRemote = false) {
    const bodyText = (post.cuerpo || post.selftext || '').trim();
    const url = post.url || post.original_url || '';
    const permalink = post.permalink || '';

    // 1. Cuerpo de texto (selftext)
    if (bodyText) {
      dialogContent.classList.remove('hidden');
      dialogContent.textContent = bodyText;
    } else if (isFetchingRemote && !strictOfflineMode) {
      dialogContent.classList.remove('hidden');
      dialogContent.textContent = '⏳ Recuperando contenido completo de la publicación...';
    } else {
      dialogContent.classList.add('hidden');
      dialogContent.textContent = '';
    }

    // 2. Multimedia y enlaces adjuntos (imagen, galería, video o enlace externo)
    dialogMedia.innerHTML = '';
    let hasMedia = false;

    // Si el Modo Offline Estricto está ENCENDIDO, no incrustar <img> ni <video> remotos automáticamente
    if (strictOfflineMode) {
      if (url && url !== permalink && !url.endsWith((post.id || '') + '/')) {
        hasMedia = true;
        const offlineCard = document.createElement('div');
        offlineCard.className = 'post-external-link-card';
        offlineCard.innerHTML = `
          <span>📴 <strong>Modo Offline Estricto:</strong> Recurso externo no descargado automáticamente (<code>${escapeHtml(url)}</code>)</span>
          <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary" style="flex-shrink:0;">Abrir URL ↗</a>
        `;
        dialogMedia.appendChild(offlineCard);
      }
      if (hasMedia) dialogMedia.classList.remove('hidden');
      else dialogMedia.classList.add('hidden');
      return;
    }

    // A) Galería de imágenes (si se enriqueció o venía en media_files)
    if (Array.isArray(post._galleryUrls) && post._galleryUrls.length > 0) {
      hasMedia = true;
      const grid = document.createElement('div');
      grid.className = 'post-gallery-grid';
      post._galleryUrls.forEach((gUrl, idx) => {
        const item = document.createElement('div');
        item.className = 'post-gallery-item';
        item.innerHTML = `
          <a href="${escapeHtml(gUrl)}" target="_blank" rel="noopener noreferrer" title="Abrir imagen ${idx + 1} en tamaño original">
            <img src="${escapeHtml(gUrl)}" alt="Imagen ${idx + 1} de la galería" loading="lazy">
          </a>
          <span class="post-gallery-caption">Foto ${idx + 1} de ${post._galleryUrls.length}</span>
        `;
        grid.appendChild(item);
      });
      dialogMedia.appendChild(grid);
    }
    // B) Imagen directa (i.redd.it / .jpg / .png / .gif / .webp)
    else if (isDirectImageUrl(url)) {
      hasMedia = true;
      const box = document.createElement('div');
      box.className = 'post-media-box';
      box.innerHTML = `
        <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" title="Ver imagen en resolución completa">
          <img src="${escapeHtml(url)}" alt="${escapeHtml(post.titulo || 'Imagen del post')}" class="post-detail-image" loading="lazy">
        </a>
        <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="external-link">🔍 Abrir imagen original en pestaña nueva ↗</a>
      `;
      dialogMedia.appendChild(box);
    }
    // C) Video nativo de Reddit (v.redd.it)
    else if (post._videoUrl || url.includes('v.redd.it/')) {
      hasMedia = true;
      const box = document.createElement('div');
      box.className = 'post-media-box';
      if (post._videoUrl) {
        box.innerHTML = `
          <video controls preload="metadata" class="post-detail-video" src="${escapeHtml(post._videoUrl)}"></video>
          <a href="${escapeHtml(permalink || url)}" target="_blank" rel="noopener noreferrer" class="external-link">🎬 Ver video con pista de audio en Reddit ↗</a>
        `;
      } else {
        box.innerHTML = `
          <div style="padding: 0.75rem; text-align: center;">
            <p style="margin-bottom: 0.5rem;">🎬 <strong>Video alojado en Reddit</strong></p>
            <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary">Abrir video (${escapeHtml(url)}) ↗</a>
          </div>
        `;
      }
      dialogMedia.appendChild(box);
    }
    // D) Enlace a galería aún no desglosada o link externo (noticias, youtube, etc.)
    else if (url && url !== permalink && !url.endsWith(post.id + '/')) {
      hasMedia = true;
      const linkCard = document.createElement('div');
      linkCard.className = 'post-external-link-card';
      const isGal = url.includes('/gallery/');
      linkCard.innerHTML = `
        <span>${isGal ? '🖼️ <strong>Galería de Reddit:</strong>' : '🔗 <strong>Enlace adjunto:</strong>'} <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a></span>
        <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary" style="flex-shrink:0;">Abrir ↗</a>
      `;
      dialogMedia.appendChild(linkCard);
    }

    if (hasMedia) {
      dialogMedia.classList.remove('hidden');
    } else {
      dialogMedia.classList.add('hidden');
    }
  }

  async function enrichPostFromArcticShift(post, pid) {
    if (strictOfflineMode || !pid || post._enriched) return;
    try {
      const res = await fetch(`https://arctic-shift.photon-reddit.com/api/posts/ids?ids=${encodeURIComponent(pid)}`);
      if (!res.ok) {
        post._enriched = true;
        return;
      }
      const json = await res.json();
      const raw = json && Array.isArray(json.data) ? json.data[0] : null;
      post._enriched = true;
      if (!raw) return;

      // 1. Extraer selftext
      if (raw.selftext && typeof raw.selftext === 'string' && raw.selftext.trim()) {
        post.cuerpo = raw.selftext;
      }

      // 2. Extraer video MP4 si es v.redd.it
      const rv = (raw.media && raw.media.reddit_video) || (raw.secure_media && raw.secure_media.reddit_video);
      if (rv && rv.fallback_url) {
        post._videoUrl = rv.fallback_url;
      }

      // 3. Extraer imágenes de galería si es reddit.com/gallery/...
      if (raw.gallery_data && Array.isArray(raw.gallery_data.items) && raw.media_metadata) {
        const gUrls = [];
        raw.gallery_data.items.forEach(item => {
          const meta = raw.media_metadata[item.media_id];
          if (meta && meta.status === 'valid') {
            let ext = 'jpg';
            if (meta.m) {
              if (meta.m.includes('png')) ext = 'png';
              else if (meta.m.includes('gif')) ext = 'gif';
              else if (meta.m.includes('webp')) ext = 'webp';
            }
            gUrls.push(`https://i.redd.it/${item.media_id}.${ext}`);
          }
        });
        if (gUrls.length > 0) {
          post._galleryUrls = gUrls;
        }
      }
    } catch (_) {
      post._enriched = true;
    }
  }

  /**
   * Resuelve a qué usuario y tipo de contenido (post o comentario) responde un comentario.
   */
  function resolveReplyTarget(comment) {
    if (!comment) return null;
    const parentId = comment.parent_id || '';
    const postId = comment.post_id || (parentId.startsWith('t3_') ? parentId.slice(3) : '');

    if (parentId.startsWith('t1_')) {
      const parentCommentId = parentId.slice(3);
      const thread = postId ? commentsByPostId.get(postId) : null;
      if (thread) {
        const parentComment = thread.find(c => c.id === parentCommentId);
        if (parentComment) {
          return {
            targetType: 'comentario',
            targetAuthor: parentComment.author || '[deleted]',
            targetSnippet: (parentComment.cuerpo || '').slice(0, 220)
          };
        }
      }
      return { targetType: 'comentario', targetAuthor: '', targetSnippet: '' };
    }

    if (parentId.startsWith('t3_') || postId) {
      const parentPost = postId ? postById.get(postId) : null;
      if (parentPost) {
        return {
          targetType: 'post',
          targetAuthor: parentPost._author || parentPost.author || '',
          targetSnippet: parentPost.titulo || comment.post_titulo || ''
        };
      }
    }

    return null;
  }

  function openPostDetail(post) {
    const isPost = post.tipo === 'post' || !post.tipo;
    const author = post._author || post.author || 'usuario';
    const pid = isPost
      ? (post.id || post.post_id || '')
      : (post.post_id || (post.parent_id && post.parent_id.startsWith('t3_') ? post.parent_id.slice(3) : ''));
    currentModalPostId = pid;
    currentModalPost = post;

    dialogTypeBadge.textContent = isPost ? '📝 Publicación' : '💬 Comentario';
    dialogTypeBadge.className   = `badge ${isPost ? 'badge-post' : 'badge-comment'}`;
    dialogSubBadge.textContent  = post.subreddit ? `r/${post.subreddit}` : 'Reddit';
    dialogDate.textContent      = post.date_art || '';
    dialogScore.textContent     = (post.score || 0).toLocaleString();
    dialogRedditLink.href       = post.permalink || '#';

    // Autor (texto informativo en versión pública de solo Feed)
    const isDeletedAuthor = !author || author === '[deleted]' || author === '[removed]';
    if (isDeletedAuthor) {
      dialogAuthorWrap.innerHTML = `por <span style="color: var(--text-muted); font-style: italic;">[deleted]</span>`;
    } else {
      dialogAuthorWrap.innerHTML = `por <span class="author-user-link" style="cursor:default;text-decoration:none;">u/${escapeHtml(author)}</span>`;
    }

    if (isPost) {
      dialogTitle.textContent = post.titulo || 'Sin título';
      dialogContext.classList.add('hidden');

      const needsRemoteFetch = !strictOfflineMode && !post._enriched && pid && (!post.cuerpo || (post.url && (post.url.includes('v.redd.it/') || post.url.includes('/gallery/'))));
      renderPostBodyAndMedia(post, needsRemoteFetch);

      if (needsRemoteFetch) {
        enrichPostFromArcticShift(post, pid).then(() => {
          if (currentModalPostId === pid) {
            renderPostBodyAndMedia(post, false);
          }
        });
      }
    } else {
      dialogTitle.textContent = 'Comentario en debate';
      const replyInfo = resolveReplyTarget(post);
      const ctxParts = [];

      if (replyInfo && replyInfo.targetAuthor && replyInfo.targetAuthor !== '[deleted]') {
        const label = replyInfo.targetType === 'comentario'
          ? 'En respuesta al comentario de'
          : 'En respuesta a la publicación de';
        ctxParts.push(
          `<div>↳ ${label} <a href="#" class="author-user-link modal-reply-target-link" data-user="${escapeHtml(replyInfo.targetAuthor)}">u/${escapeHtml(replyInfo.targetAuthor)}</a></div>`
        );
        if (replyInfo.targetType === 'comentario' && replyInfo.targetSnippet) {
          const ellipsis = replyInfo.targetSnippet.length >= 220 ? '...' : '';
          ctxParts.push(`<div class="reply-parent-snippet">"${escapeHtml(replyInfo.targetSnippet)}${ellipsis}"</div>`);
        }
      }

      if (post.post_titulo) {
        ctxParts.push(`<div style="margin-top:0.35rem;">📌 Post: <strong>${escapeHtml(post.post_titulo)}</strong></div>`);
      }

      if (ctxParts.length > 0) {
        dialogContext.classList.remove('hidden');
        dialogContext.innerHTML = ctxParts.join('');
        const targetLink = dialogContext.querySelector('.modal-reply-target-link');
        if (targetLink) {
          targetLink.addEventListener('click', e => {
            e.preventDefault();
            navigateToUserProfile(targetLink.dataset.user);
          });
        }
      } else {
        dialogContext.classList.add('hidden');
      }

      dialogMedia.classList.add('hidden');
      dialogMedia.innerHTML = '';
      dialogContent.classList.remove('hidden');
      dialogContent.textContent = post.cuerpo || '(Sin texto)';
    }

    // RECONSTRUCCIÓN DEL ÁRBOL DE COMENTARIOS
    dialogCommentsSection.classList.remove('hidden');
    renderCommentTreeForPost(pid);

    if (typeof itemDialog.showModal === 'function') itemDialog.showModal();
    else itemDialog.setAttribute('open', '');
  }

  function renderCommentTreeForPost(postId) {
    dialogCommentTree.innerHTML = '';

    if (!postId || !commentsByPostId.has(postId)) {
      dialogCommentsTitle.textContent = '💬 Árbol de Comentarios';
      dialogCommentsCountBadge.textContent = '0 comentarios';
      dialogCommentTree.innerHTML = `
        <div class="empty-state" style="text-align: center; padding: 1.5rem;">
          No hay comentarios registrados para esta publicación en el dataset descargado.
        </div>
      `;
      return;
    }

    const comments = commentsByPostId.get(postId);
    dialogCommentsTitle.textContent = '💬 Árbol de Comentarios';
    dialogCommentsCountBadge.textContent = `${comments.length} comentarios`;

    // 1. Mapeo de nodos
    const nodeMap = new Map();
    comments.forEach(c => {
      nodeMap.set(c.id, {
        ...c,
        children: []
      });
    });

    // 2. Establecer jerarquía padre-hijo (t3_ = post raíz, t1_ = respuesta a comentario)
    const roots = [];
    nodeMap.forEach(node => {
      const pid = node.parent_id || '';
      if (pid.startsWith('t1_')) {
        const parentCommentId = pid.slice(3);
        const parentNode = nodeMap.get(parentCommentId);
        if (parentNode) {
          parentNode.children.push(node);
          return;
        }
      }
      roots.push(node);
    });

    // 3. Ordenamiento: mayor score primero o cronológico
    function sortNodes(list) {
      list.sort((a, b) => (b.score || 0) - (a.score || 0) || (a.created_utc || 0) - (b.created_utc || 0));
      list.forEach(n => {
        if (n.children.length > 0) sortNodes(n.children);
      });
    }
    sortNodes(roots);

    // 4. Renderizado recursivo
    roots.forEach(rootNode => {
      dialogCommentTree.appendChild(buildCommentNodeElement(rootNode));
    });
  }

  function buildCommentNodeElement(node) {
    const el = document.createElement('div');
    el.className = 'comment-node';

    const author = node.author || '[deleted]';
    const isDeleted = author === '[deleted]';
    const initial = isDeleted ? '?' : (author[0] || 'U').toUpperCase();

    const authorHtml = isDeleted
      ? `<span style="color: var(--text-muted); font-style: italic;">[deleted]</span>`
      : `<span class="author-user-link" style="cursor:default;text-decoration:none;">u/${escapeHtml(author)}</span>`;

    el.innerHTML = `
      <div class="comment-node-header">
        <div class="comment-author-avatar">${initial}</div>
        ${authorHtml}
        <span class="comment-score-badge">▲ ${node.score || 0}</span>
        <span>${escapeHtml(node.date_art || '')}</span>
      </div>
      <div class="comment-node-body">${escapeHtml(node.cuerpo || '(Comentario sin texto)')}</div>
      <div class="comment-node-footer">
        ${node.permalink ? `<a href="${node.permalink}" target="_blank" rel="noopener noreferrer" class="external-link">Ver en Reddit ↗</a>` : ''}
      </div>
    `;

    // Clic en el autor del comentario -> ir a su perfil
    if (!isDeleted) {
      const aLink = el.querySelector('.comment-tree-author');
      if (aLink) {
        aLink.addEventListener('click', (e) => {
          e.preventDefault();
          navigateToUserProfile(author);
        });
      }
    }

    // Respuestas anidadas (hilos tipo Reddit)
    if (node.children && node.children.length > 0) {
      const repliesWrap = document.createElement('div');
      repliesWrap.className = 'comment-replies';
      node.children.forEach(child => {
        repliesWrap.appendChild(buildCommentNodeElement(child));
      });
      el.appendChild(repliesWrap);
    }

    return el;
  }

  dialogCloseBtn.addEventListener('click', () => itemDialog.close());
  itemDialog.addEventListener('click', e => { if (e.target === itemDialog) itemDialog.close(); });


  // =========================================================================
  // 14. Utilidades
  // =========================================================================
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }


  initTheme();
  initOfflineMode();
  showView();
  tryAutoLoad();

})();
