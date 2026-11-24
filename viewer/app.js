/**
 * Reddit Feed Viewer - Frontend Estático
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
  let activeFeedSubs = new Set(); // comunidades activas del Feed generado

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
  const filesMenuWrap     = document.getElementById('filesMenuWrap');
  const filesMenuBtn      = document.getElementById('filesMenuBtn');
  const filesMenuDropdown = document.getElementById('filesMenuDropdown');
  const menuLoadJsonBtn   = document.getElementById('menuLoadJsonBtn');
  const clearMemoryBtn    = document.getElementById('clearMemoryBtn');
  const offlineToggle     = document.getElementById('offlineToggle');
  const offlineIcon       = document.getElementById('offlineIcon');
  const offlineLabel      = document.getElementById('offlineLabel');
  const visualMenuWrap    = document.getElementById('visualMenuWrap');
  const visualMenuBtn     = document.getElementById('visualMenuBtn');
  const visualMenuDropdown = document.getElementById('visualMenuDropdown');
  const stylePresetItems  = document.querySelectorAll('[data-style-preset]');
  const themeToggle       = document.getElementById('themeToggle');
  const themeIcon         = document.getElementById('themeIcon');
  const themeToggleLabel  = document.getElementById('themeToggleLabel');
  const statusText        = document.getElementById('statusText');
  const statusMeta        = document.getElementById('statusMeta');

  // Header Search (Omnibox: Posts + Usuarios)
  const headerUserSearch      = document.getElementById('headerUserSearch');
  const headerSearchClearBtn  = document.getElementById('headerSearchClearBtn');
  const headerSearchDropdown  = document.getElementById('headerSearchDropdown');
  const feedActiveSearchChip     = document.getElementById('feedActiveSearchChip');
  const feedActiveSearchLabel    = document.getElementById('feedActiveSearchLabel');
  const feedActiveSearchClearBtn = document.getElementById('feedActiveSearchClearBtn');

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
  const feedScrollDatePill = document.getElementById('feedScrollDatePill');
  const feedToolbar        = document.getElementById('feedToolbar');
  const feedToolbarCount   = document.getElementById('feedToolbarCount');
  const feedSortChips      = document.querySelectorAll('[data-feed-sort]');

  // Modal Amplio de Armar Feed
  const openFeedBuilderBtn    = document.getElementById('openFeedBuilderBtn');
  const emptyOpenBuilderBtn   = document.getElementById('emptyOpenBuilderBtn');
  const feedBuilderDialog     = document.getElementById('feedBuilderDialog');
  const feedBuilderCloseBtn   = document.getElementById('feedBuilderCloseBtn');
  const feedBuilderFileBar    = document.getElementById('feedBuilderFileBar');
  const feedBuilderFileStatus = document.getElementById('feedBuilderFileStatus');
  const feedBuilderFileHint   = document.getElementById('feedBuilderFileHint');
  const feedBuilderUploadBtn  = document.getElementById('feedBuilderUploadBtn');
  const feedBuilderFieldset   = document.getElementById('feedBuilderFieldset');

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
  const timelineSortChips    = document.querySelectorAll('[data-timeline-sort]');
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
  // 3. Temas Claro / Oscuro y Estilos Visuales (Menú unificado "Apariencia")
  // =========================================================================
  function closeVisualMenu() {
    if (visualMenuDropdown) visualMenuDropdown.classList.add('hidden');
    if (visualMenuBtn) visualMenuBtn.setAttribute('aria-expanded', 'false');
  }

  function updateThemeToggleUI(isDark) {
    if (themeIcon) themeIcon.textContent = isDark ? '☀️' : '🌙';
    if (themeToggleLabel) themeToggleLabel.textContent = isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro';
  }

  function applyStylePreset(val) {
    if (!val || val === 'default') {
      document.documentElement.removeAttribute('data-style');
      val = 'default';
    } else {
      document.documentElement.setAttribute('data-style', val);
    }
    localStorage.setItem('reddit_feed_viewer_style_preset', val);
    stylePresetItems.forEach(item => {
      const active = item.dataset.stylePreset === val;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-checked', active ? 'true' : 'false');
    });
  }

  function initTheme() {
    const saved = localStorage.getItem('reddit_feed_viewer_theme');
    let isDarkNow;
    if (saved) {
      document.documentElement.setAttribute('data-theme', saved);
      isDarkNow = saved === 'dark';
    } else {
      isDarkNow = window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    updateThemeToggleUI(isDarkNow);

    if (themeToggle) {
      themeToggle.addEventListener('click', () => {
        const cur = document.documentElement.getAttribute('data-theme');
        const next = (cur === 'dark') ? 'light' : (cur === 'light') ? 'dark'
          : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'light' : 'dark');
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('reddit_feed_viewer_theme', next);
        updateThemeToggleUI(next === 'dark');
        closeVisualMenu();
      });
    }

    // Selector de paletas y tipografías (Original, Editorial, OSINT, Nordic)
    const savedStyle = localStorage.getItem('reddit_feed_viewer_style_preset') || 'default';
    applyStylePreset(savedStyle);

    stylePresetItems.forEach(item => {
      item.addEventListener('click', () => {
        applyStylePreset(item.dataset.stylePreset);
        closeVisualMenu();
      });
    });

    if (visualMenuBtn && visualMenuDropdown) {
      visualMenuBtn.addEventListener('click', e => {
        e.stopPropagation();
        closeFilesMenu();
        const willOpen = visualMenuDropdown.classList.contains('hidden');
        visualMenuDropdown.classList.toggle('hidden', !willOpen);
        visualMenuBtn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
      });

      document.addEventListener('click', e => {
        if (visualMenuWrap && !visualMenuWrap.contains(e.target)) {
          closeVisualMenu();
        }
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
    const saved = localStorage.getItem('reddit_feed_viewer_strict_offline');
    strictOfflineMode = saved === 'true';
    updateOfflineButtonUI();

    if (offlineToggle) {
      offlineToggle.addEventListener('click', () => {
        strictOfflineMode = !strictOfflineMode;
        localStorage.setItem('reddit_feed_viewer_strict_offline', strictOfflineMode ? 'true' : 'false');
        updateOfflineButtonUI();

        // Si el modal de detalle está abierto, refrescar su contenido con el nuevo modo
        if (itemDialog && itemDialog.open && currentModalPost) {
          openPostDetail(currentModalPost);
        }
      });
    }
  }

  // =========================================================================
  // 4. Navegación entre Secciones
  // =========================================================================
  function showView(name, opts = {}) {
    document.body.classList.toggle('view-feed', name === 'feed');
    if (name !== 'feed') hideFeedScrollDatePill();
    sectionFeed.classList.add('hidden');
    if (sectionRanking) sectionRanking.classList.add('hidden');
    sectionProfile.classList.add('hidden');
    if (sectionGraph) sectionGraph.classList.add('hidden');
    tabFeed.classList.remove('active');
    if (tabRanking) tabRanking.classList.remove('active');
    if (tabGraph) tabGraph.classList.remove('active');

    if (name === 'feed') {
      sectionFeed.classList.remove('hidden');
      tabFeed.classList.add('active');
    } else if (name === 'ranking' && sectionRanking) {
      sectionRanking.classList.remove('hidden');
      if (tabRanking) tabRanking.classList.add('active');
      renderRankingList();
    } else if (name === 'graph' && sectionGraph) {
      sectionGraph.classList.remove('hidden');
      if (tabGraph) tabGraph.classList.add('active');
      if (window.RedditGraphController && !opts.skipAutoGraphBuild) {
        window.RedditGraphController.onSectionVisible();
      }
    } else if (name === 'profile') {
      sectionProfile.classList.remove('hidden');
      if (previousView === 'ranking' && sectionRanking) backBtnText.textContent = 'Volver al Ranking';
      else if (previousView === 'graph' && sectionGraph) backBtnText.textContent = 'Volver al Grafo';
      else backBtnText.textContent = 'Volver al Feed';
    }
  }

  tabFeed.addEventListener('click', () => { previousView = 'feed'; showView('feed'); });
  if (tabRanking) {
    tabRanking.addEventListener('click', () => { previousView = 'ranking'; showView('ranking'); });
  }
  if (tabGraph) {
    tabGraph.addEventListener('click', () => { previousView = 'graph'; showView('graph'); });
  }
  backBtn.addEventListener('click', () => showView(previousView));

  let profileOriginBeforeGraph = 'feed';
  if (profileOpenGraphBtn) {
    profileOpenGraphBtn.addEventListener('click', () => {
      if (!selectedProfile || !selectedProfile.usuario) return;
      profileOriginBeforeGraph = (previousView === 'ranking') ? 'ranking' : 'feed';
      previousView = 'graph';
      showView('graph', { skipAutoGraphBuild: true });
      if (window.RedditGraphController) {
        window.RedditGraphController.openEgoForUser(selectedProfile.usuario, { egoOnly: true });
      }
    });
  }

  function returnToUserProfileFromGraph(username) {
    const targetName = username || (selectedProfile && selectedProfile.usuario) || '';
    const profile = targetName ? userProfileMap.get(targetName.toLowerCase()) : selectedProfile;
    if (profile) {
      previousView = profileOriginBeforeGraph || 'feed';
      selectUser(profile);
    } else {
      showView('feed');
    }
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
    populateRankingSubFilter();

    if (clearMemoryBtn) clearMemoryBtn.disabled = false;

    if (window.RedditGraphController) {
      window.RedditGraphController.onDataReloaded();
    }

    // Desbloquear el configurador de Armar Feed para que el usuario elija filtros antes de generar el Feed
    setFeedBuilderDataState(true, sourceName, meta);
    openFeedBuilderDialog();
  }

  function clearMemory() {
    if (allProfiles.length === 0) return;
    if (!confirm('¿Vaciar todos los datos cargados en memoria RAM?')) return;

    // 1. Liberar todas las estructuras de datos en memoria
    allProfiles = [];
    availableSubreddits.clear();
    activeFeedSubs.clear();
    userProfileMap.clear();
    commentsByPostId.clear();
    postById.clear();
    feedItems = [];
    feedPage = 0;
    selectedProfile = null;
    currentModalPost = null;
    currentModalPostId = null;
    activeTitleQuery = '';
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
    if (headerSearchClearBtn) headerSearchClearBtn.classList.add('hidden');
    if (feedActiveSearchChip) feedActiveSearchChip.classList.add('hidden');
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
    if (feedToolbar) feedToolbar.classList.add('hidden');
    hideFeedScrollDatePill();

    if (rankingSubFilter) rankingSubFilter.innerHTML = '<option value="all">Todos los subreddits</option>';
    if (rankingList) rankingList.innerHTML = '<div class="empty-state">Cargá un archivo <code>perfiles_usuarios.json</code> para ver el ranking.</div>';
    if (rankingCount) rankingCount.textContent = '0 usuarios';

    timelineFeed.innerHTML = '';
    timelineCount.textContent = '0 ítems';

    // 5. Limpiar estado del módulo de Grafos
    if (window.RedditGraphController && typeof window.RedditGraphController.onMemoryCleared === 'function') {
      window.RedditGraphController.onMemoryCleared();
    }

    if (clearMemoryBtn) clearMemoryBtn.disabled = true;
    statusText.textContent = 'Memoria vaciada · Esperando archivo de datos...';
    statusMeta.textContent = '';

    previousView = 'feed';
    showView('feed');
    setFeedBuilderDataState(false);
    openFeedBuilderDialog();
  }

  function closeFilesMenu() {
    if (filesMenuDropdown) filesMenuDropdown.classList.add('hidden');
    if (filesMenuBtn) filesMenuBtn.setAttribute('aria-expanded', 'false');
  }

  if (filesMenuBtn && filesMenuDropdown) {
    filesMenuBtn.addEventListener('click', e => {
      e.stopPropagation();
      closeVisualMenu();
      const willOpen = filesMenuDropdown.classList.contains('hidden');
      filesMenuDropdown.classList.toggle('hidden', !willOpen);
      filesMenuBtn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    });

    document.addEventListener('click', e => {
      if (filesMenuWrap && !filesMenuWrap.contains(e.target)) {
        closeFilesMenu();
      }
    });
  }

  if (menuLoadJsonBtn) {
    menuLoadJsonBtn.addEventListener('click', () => {
      closeFilesMenu();
      if (fileInput) fileInput.click();
    });
  }

  if (clearMemoryBtn) {
    clearMemoryBtn.addEventListener('click', () => {
      closeFilesMenu();
      clearMemory();
    });
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

  // =========================================================================
  // 6. Navegación a Perfil de Usuario desde cualquier Enlace
  // =========================================================================
  function navigateToUserProfile(username) {
    if (!username || username === '[deleted]') return;

    const profile = userProfileMap.get(username.toLowerCase());
    if (profile) {
      if (itemDialog && typeof itemDialog.close === 'function') {
        try { itemDialog.close(); } catch (_) {}
      }
      if (sectionGraph && !sectionGraph.classList.contains('hidden')) previousView = 'graph';
      else if (sectionRanking && !sectionRanking.classList.contains('hidden')) previousView = 'ranking';
      else previousView = 'feed';
      selectUser(profile);
    } else {
      // Si el usuario no está en el índice de perfiles, abrir enlace a Reddit
      window.open(`https://www.reddit.com/user/${encodeURIComponent(username)}/`, '_blank', 'noopener,noreferrer');
    }
  }

  // =========================================================================
  // 7. Omnibox en Header (Buscador unificado de Títulos de Posts y Usuarios)
  // =========================================================================
  let searchDebounceTimer = null;
  let activeTitleQuery = '';
  const OMNIBOX_RECENT_KEY = 'reddit_feed_viewer_omnibox_recent';
  const OMNIBOX_RECENT_MAX = 5;

  function loadRecentSearches() {
    try {
      const raw = localStorage.getItem(OMNIBOX_RECENT_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr
        .filter(item => item && (item.type === 'title' || item.type === 'user') && typeof item.value === 'string' && item.value.trim())
        .slice(0, OMNIBOX_RECENT_MAX);
    } catch (_) {
      return [];
    }
  }

  function saveRecentSearch(type, value) {
    const clean = String(value || '').trim();
    if (!clean || (type !== 'title' && type !== 'user')) return;
    const current = loadRecentSearches();
    const normLower = clean.toLowerCase();
    const filtered = current.filter(item => !(item.type === type && item.value.toLowerCase() === normLower));
    filtered.unshift({ type, value: clean });
    try {
      localStorage.setItem(OMNIBOX_RECENT_KEY, JSON.stringify(filtered.slice(0, OMNIBOX_RECENT_MAX)));
    } catch (_) {}
  }

  function clearRecentSearches() {
    try {
      localStorage.removeItem(OMNIBOX_RECENT_KEY);
    } catch (_) {}
  }

  function updateActiveSearchChipUI() {
    if (!feedActiveSearchChip || !feedActiveSearchLabel) return;
    if (activeTitleQuery) {
      feedActiveSearchLabel.textContent = `🔍 Título: "${activeTitleQuery}"`;
      feedActiveSearchChip.classList.remove('hidden');
    } else {
      feedActiveSearchChip.classList.add('hidden');
    }
  }

  function applyTitleFilter(rawQuery) {
    activeTitleQuery = String(rawQuery || '').trim();
    if (activeTitleQuery) {
      saveRecentSearch('title', activeTitleQuery);
    }
    if (headerUserSearch) headerUserSearch.value = activeTitleQuery;
    if (headerSearchClearBtn) headerSearchClearBtn.classList.toggle('hidden', !activeTitleQuery);
    if (headerSearchDropdown) headerSearchDropdown.classList.add('hidden');
    updateActiveSearchChipUI();

    if (postById.size > 0) {
      hasGeneratedFeedOnce = true;
      if (feedBuilderCloseBtn) feedBuilderCloseBtn.classList.remove('hidden');
      closeFeedBuilderDialog();
      showView('feed');
      generateFeed();
    }
  }

  function getMatchingUsersForOmnibox(userQuery) {
    if (!userQuery || allProfiles.length === 0) return [];
    const filterByActiveFeed = activeFeedSubs.size > 0 && activeFeedSubs.size < availableSubreddits.size;
    return allProfiles.filter(p => {
      if (!p.usuario.toLowerCase().includes(userQuery)) return false;
      if (filterByActiveFeed) {
        const subs = p.metricas && Array.isArray(p.metricas.subreddits_activos)
          ? p.metricas.subreddits_activos
          : [];
        if (!subs.some(s => activeFeedSubs.has(s))) return false;
      }
      return true;
    }).slice(0, 7);
  }

  headerUserSearch.addEventListener('input', () => {
    const hasVal = headerUserSearch.value.trim().length > 0;
    if (headerSearchClearBtn) headerSearchClearBtn.classList.toggle('hidden', !hasVal);
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(renderHeaderDropdown, 140);
  });

  headerUserSearch.addEventListener('focus', renderHeaderDropdown);

  headerUserSearch.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const raw = headerUserSearch.value.trim();
      if (!raw) {
        if (activeTitleQuery) applyTitleFilter('');
        return;
      }
      if (/^u\//i.test(raw)) {
        const cleanU = raw.replace(/^u\//i, '').toLowerCase();
        const matches = getMatchingUsersForOmnibox(cleanU);
        if (matches.length > 0) {
          saveRecentSearch('user', matches[0].usuario);
          headerSearchDropdown.classList.add('hidden');
          headerUserSearch.value = '';
          if (headerSearchClearBtn) headerSearchClearBtn.classList.add('hidden');
          navigateToUserProfile(matches[0].usuario);
          return;
        }
      }
      applyTitleFilter(raw);
    } else if (e.key === 'Escape') {
      headerSearchDropdown.classList.add('hidden');
    }
  });

  if (headerSearchClearBtn) {
    headerSearchClearBtn.addEventListener('click', () => {
      if (headerUserSearch) headerUserSearch.value = '';
      headerSearchClearBtn.classList.add('hidden');
      headerSearchDropdown.classList.add('hidden');
      if (activeTitleQuery) {
        applyTitleFilter('');
      }
      if (headerUserSearch) headerUserSearch.focus();
    });
  }

  if (feedActiveSearchClearBtn) {
    feedActiveSearchClearBtn.addEventListener('click', () => {
      applyTitleFilter('');
    });
  }

  document.addEventListener('click', e => {
    if (!e.target.closest('.header-search')) {
      headerSearchDropdown.classList.add('hidden');
    }
  });

  function renderHeaderDropdown() {
    const raw = headerUserSearch.value.trim();
    headerSearchDropdown.innerHTML = '';

    if (allProfiles.length === 0 && postById.size === 0) {
      headerSearchDropdown.classList.add('hidden');
      return;
    }

    // Estado vacío: mostrar historial de últimos 5 buscados recientemente + botón Borrar historial
    if (!raw) {
      const recents = loadRecentSearches();
      if (recents.length === 0) {
        headerSearchDropdown.classList.add('hidden');
        return;
      }

      const headerRow = document.createElement('div');
      headerRow.className = 'dropdown-section-header';
      headerRow.innerHTML = `
        <span class="dropdown-section-label">🕒 Buscados recientemente</span>
        <button type="button" id="omniboxClearHistoryBtn" class="dropdown-clear-history-btn">Borrar historial</button>
      `;
      const clearBtn = headerRow.querySelector('#omniboxClearHistoryBtn');
      if (clearBtn) {
        clearBtn.addEventListener('click', e => {
          e.stopPropagation();
          clearRecentSearches();
          headerSearchDropdown.classList.add('hidden');
        });
      }
      headerSearchDropdown.appendChild(headerRow);

      recents.forEach(entry => {
        const row = document.createElement('div');
        row.className = 'dropdown-item dropdown-recent-item';
        row.tabIndex = 0;
        row.setAttribute('role', 'option');
        if (entry.type === 'user') {
          row.innerHTML = `
            <div class="dropdown-avatar">${(entry.value[0] || 'U').toUpperCase()}</div>
            <div class="dropdown-info">
              <span class="dropdown-username">u/${escapeHtml(entry.value)}</span>
              <span class="dropdown-meta">Perfil de usuario</span>
            </div>
            <span class="dropdown-recent-tag">Usuario</span>
          `;
        } else {
          row.innerHTML = `
            <div class="dropdown-recent-icon" aria-hidden="true">📝</div>
            <div class="dropdown-info">
              <span class="dropdown-username">"${escapeHtml(entry.value)}"</span>
              <span class="dropdown-meta">Búsqueda por título en Feed</span>
            </div>
            <span class="dropdown-recent-tag">Título</span>
          `;
        }
        const runRecent = () => {
          headerSearchDropdown.classList.add('hidden');
          if (entry.type === 'user') {
            saveRecentSearch('user', entry.value);
            headerUserSearch.value = activeTitleQuery || '';
            if (headerSearchClearBtn) headerSearchClearBtn.classList.toggle('hidden', !activeTitleQuery);
            navigateToUserProfile(entry.value);
          } else {
            applyTitleFilter(entry.value);
          }
        };
        row.addEventListener('click', runRecent);
        row.addEventListener('keydown', e => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); runRecent(); }
        });
        headerSearchDropdown.appendChild(row);
      });

      headerSearchDropdown.classList.remove('hidden');
      return;
    }

    const isUserOnly = /^u\//i.test(raw);
    const userQuery = (isUserOnly ? raw.replace(/^u\//i, '') : raw).toLowerCase();

    // 1. Acción principal: Filtrar Feed por título (si no empezó con u/)
    if (!isUserOnly && postById.size > 0) {
      const actionRow = document.createElement('div');
      actionRow.className = 'dropdown-action-item';
      actionRow.tabIndex = 0;
      actionRow.setAttribute('role', 'option');
      actionRow.innerHTML = `
        <span class="dropdown-action-text">
          <span>📝</span>
          <span>Filtrar Feed por título: <strong>"${escapeHtml(raw)}"</strong></span>
        </span>
        <kbd class="dropdown-kbd">Enter</kbd>
      `;
      const runTitleSearch = () => applyTitleFilter(raw);
      actionRow.addEventListener('click', runTitleSearch);
      actionRow.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); runTitleSearch(); }
      });
      headerSearchDropdown.appendChild(actionRow);
    }

    // 2. Usuarios coincidentes en el Feed activo
    const matches = getMatchingUsersForOmnibox(userQuery);
    const filterByActiveFeed = activeFeedSubs.size > 0 && activeFeedSubs.size < availableSubreddits.size;

    const secLabel = document.createElement('div');
    secLabel.className = 'dropdown-section-label';
    secLabel.textContent = matches.length > 0
      ? `👤 Usuarios (${matches.length}${matches.length === 7 ? '+' : ''})`
      : '👤 Usuarios';
    headerSearchDropdown.appendChild(secLabel);

    if (matches.length === 0) {
      const subNote = filterByActiveFeed ? ' en las comunidades del feed activo' : '';
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'dropdown-no-results';
      emptyDiv.innerHTML = `Sin usuarios para "<strong>${escapeHtml(userQuery || raw)}</strong>"${subNote}`;
      headerSearchDropdown.appendChild(emptyDiv);
      headerSearchDropdown.classList.remove('hidden');
      return;
    }

    matches.forEach(p => {
      const m = p.metricas || {};
      const item = document.createElement('div');
      item.className = 'dropdown-item';
      item.tabIndex = 0;
      item.setAttribute('role', 'option');
      item.innerHTML = `
        <div class="dropdown-avatar">${(p.usuario[0] || 'U').toUpperCase()}</div>
        <div class="dropdown-info">
          <span class="dropdown-username">u/${escapeHtml(p.usuario)}</span>
          <span class="dropdown-meta">▲ ${(m.score_total || 0).toLocaleString()} · ${(m.total_interacciones || 0).toLocaleString()} acts</span>
        </div>
      `;
      const go = () => {
        saveRecentSearch('user', p.usuario);
        headerSearchDropdown.classList.add('hidden');
        headerUserSearch.value = activeTitleQuery || '';
        if (headerSearchClearBtn) headerSearchClearBtn.classList.toggle('hidden', !activeTitleQuery);
        navigateToUserProfile(p.usuario);
      };
      item.addEventListener('click', go);
      item.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
      headerSearchDropdown.appendChild(item);
    });

    headerSearchDropdown.classList.remove('hidden');
  }

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

  // =========================================================================
  // 8b. Control del Modal Amplio "Armar Feed"
  // =========================================================================
  let hasGeneratedFeedOnce = false;

  function openFeedBuilderDialog() {
    if (!feedBuilderDialog) return;
    if (!feedBuilderDialog.open) {
      if (typeof feedBuilderDialog.showModal === 'function') feedBuilderDialog.showModal();
      else feedBuilderDialog.setAttribute('open', '');
    }
  }

  function closeFeedBuilderDialog() {
    if (!feedBuilderDialog) return;
    try {
      if (feedBuilderDialog.open && typeof feedBuilderDialog.close === 'function') {
        feedBuilderDialog.close();
      } else {
        feedBuilderDialog.removeAttribute('open');
      }
    } catch (_) {}
  }

  function setFeedBuilderDataState(loaded, sourceName = '', meta = null) {
    if (feedBuilderFieldset) feedBuilderFieldset.disabled = !loaded;
    if (applyFeedBtn) applyFeedBtn.disabled = !loaded;
    if (feedBuilderFileBar) feedBuilderFileBar.classList.toggle('is-loaded', loaded);

    if (!loaded) {
      hasGeneratedFeedOnce = false;
      if (feedBuilderCloseBtn) feedBuilderCloseBtn.classList.add('hidden');
      if (feedBuilderFileStatus) feedBuilderFileStatus.textContent = 'Sin archivo cargado';
      if (feedBuilderFileHint) {
        feedBuilderFileHint.innerHTML = 'Seleccioná un archivo <code>perfiles_usuarios.json</code> para desbloquear los filtros.';
      }
      if (feedBuilderUploadBtn) {
        feedBuilderUploadBtn.textContent = '📂 Cargar JSON';
        feedBuilderUploadBtn.className = 'btn btn-primary';
      }
    } else {
      if (feedBuilderFileStatus) feedBuilderFileStatus.textContent = `✅ ${sourceName || 'Dataset cargado'}`;
      if (feedBuilderFileHint) {
        const postsCnt = (meta && meta.posts_totales_indexados) ? meta.posts_totales_indexados : postById.size;
        const commsCnt = (meta && meta.comentarios_totales_indexados) ? meta.comentarios_totales_indexados : commentsByPostId.size;
        feedBuilderFileHint.textContent = `${postsCnt.toLocaleString()} publicaciones · ${allProfiles.length.toLocaleString()} perfiles · ${commsCnt.toLocaleString()} comentarios indexados.`;
      }
      if (feedBuilderUploadBtn) {
        feedBuilderUploadBtn.textContent = '📂 Cambiar JSON';
        feedBuilderUploadBtn.className = 'btn btn-secondary';
      }
      if (feedBuilderCloseBtn) {
        feedBuilderCloseBtn.classList.toggle('hidden', !hasGeneratedFeedOnce);
      }
    }
  }

  if (feedBuilderUploadBtn) {
    feedBuilderUploadBtn.addEventListener('click', () => {
      if (fileInput) fileInput.click();
    });
  }
  if (openFeedBuilderBtn) {
    openFeedBuilderBtn.addEventListener('click', openFeedBuilderDialog);
  }
  if (emptyOpenBuilderBtn) {
    emptyOpenBuilderBtn.addEventListener('click', openFeedBuilderDialog);
  }
  if (feedBuilderCloseBtn) {
    feedBuilderCloseBtn.addEventListener('click', closeFeedBuilderDialog);
  }
  if (feedBuilderDialog) {
    // Evitar cerrar con Escape si todavía no se cargó ningún archivo ni se generó el feed inicial
    feedBuilderDialog.addEventListener('cancel', e => {
      if (!hasGeneratedFeedOnce) e.preventDefault();
    });
    feedBuilderDialog.addEventListener('click', e => {
      if (e.target === feedBuilderDialog && hasGeneratedFeedOnce) {
        closeFeedBuilderDialog();
      }
    });
  }

  if (feedTitleSearch) {
    feedTitleSearch.addEventListener('input', () => {
      const hasVal = feedTitleSearch.value.trim().length > 0;
      if (clearTitleSearchBtn) clearTitleSearchBtn.classList.toggle('hidden', !hasVal);
    });

    feedTitleSearch.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (postById.size > 0) applyFeedAndCloseBuilder();
      }
    });
  }

  if (clearTitleSearchBtn) {
    clearTitleSearchBtn.addEventListener('click', () => {
      feedTitleSearch.value = '';
      clearTitleSearchBtn.classList.add('hidden');
      feedTitleSearch.focus();
    });
  }

  function applyFeedAndCloseBuilder() {
    if (postById.size === 0) return;
    hasGeneratedFeedOnce = true;
    if (feedBuilderCloseBtn) feedBuilderCloseBtn.classList.remove('hidden');
    showView('feed');
    generateFeed();
    closeFeedBuilderDialog();
  }

  applyFeedBtn.addEventListener('click', applyFeedAndCloseBuilder);

  function generateFeed() {
    if (allProfiles.length === 0) {
      alert('Primero cargá un archivo perfiles_usuarios.json.');
      return;
    }

    const selectedSubs = new Set(
      Array.from(subCheckboxList.querySelectorAll('.sub-chk:checked')).map(c => c.value)
    );
    activeFeedSubs = new Set(selectedSubs);
    const sortMode = feedSortSelect.value;

    const rawQuery = activeTitleQuery || (feedTitleSearch ? feedTitleSearch.value.trim() : '');
    const normQuery = normalizeSearchText(rawQuery);
    activeTitleTerms = normQuery ? normQuery.split(/\s+/).filter(Boolean) : [];
    updateActiveSearchChipUI();

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
    syncFeedSortUI(sortMode);

    if (postsList.length === 0) {
      if (feedToolbar) feedToolbar.classList.add('hidden');
      feedItemsList.innerHTML = '<div class="empty-state" style="text-align:center;padding:3rem;">No se encontraron publicaciones con esos filtros.</div>';
      feedPagination.classList.add('hidden');
      return;
    }

    if (feedToolbar) {
      feedToolbar.classList.remove('hidden');
      if (feedToolbarCount) {
        feedToolbarCount.textContent = `${postsList.length.toLocaleString()} publicaciones`;
      }
    }

    renderFeedPage();
  }

  function syncFeedSortUI(sortMode) {
    if (feedSortSelect && feedSortSelect.value !== sortMode) {
      feedSortSelect.value = sortMode;
    }
    feedSortChips.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.feedSort === sortMode);
    });
  }

  // Reordena al instante el feed ya cargado sin volver a filtrar todo el dataset
  function resortLoadedFeed(sortMode) {
    syncFeedSortUI(sortMode);
    if (!feedItems || feedItems.length === 0) return;

    feedItems.sort((a, b) => {
      if (sortMode === 'date_asc')   return (a.created_utc || 0) - (b.created_utc || 0);
      if (sortMode === 'score_desc') return (b.score || 0)       - (a.score || 0);
      return (b.created_utc || 0) - (a.created_utc || 0);
    });

    feedPage = 0;
    feedItemsList.innerHTML = '';
    hideFeedScrollDatePill();
    renderFeedPage();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  feedSortChips.forEach(btn => {
    btn.addEventListener('click', () => {
      resortLoadedFeed(btn.dataset.feedSort);
    });
  });

  if (feedSortSelect) {
    feedSortSelect.addEventListener('change', () => {
      if (feedItems.length > 0) {
        resortLoadedFeed(feedSortSelect.value);
      } else {
        syncFeedSortUI(feedSortSelect.value);
      }
    });
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

  // Indicador flotante de Mes y Año al desplazarse en el Feed (estilo Google Photos)
  const MONTHS_ES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  let feedScrollHideTimer = null;
  let feedScrollRafPending = false;

  function hideFeedScrollDatePill() {
    if (feedScrollDatePill) feedScrollDatePill.classList.remove('is-visible');
    if (feedScrollHideTimer) {
      clearTimeout(feedScrollHideTimer);
      feedScrollHideTimer = null;
    }
  }

  function updateFeedScrollDatePill() {
    feedScrollRafPending = false;
    if (!feedScrollDatePill) return;

    const isFeedActive = document.body.classList.contains('view-feed') &&
      feedItemsList && !feedItemsList.classList.contains('hidden');
    const cards = isFeedActive ? feedItemsList.children : null;
    const isChronoSort = !feedSortSelect || feedSortSelect.value !== 'score_desc';

    if (!isFeedActive || !isChronoSort || !cards || cards.length < 6) {
      hideFeedScrollDatePill();
      return;
    }

    const docEl = document.documentElement;
    const maxScroll = Math.max(0, docEl.scrollHeight - window.innerHeight);
    if (maxScroll < 300) {
      hideFeedScrollDatePill();
      return;
    }

    // Búsqueda binaria O(log N) de la tarjeta más cercana al tope visible (120px)
    const anchorY = 120;
    let lo = 0;
    let hi = cards.length - 1;
    let bestIdx = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const top = cards[mid].getBoundingClientRect().top;
      if (top <= anchorY) {
        bestIdx = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    const ts = Number(cards[bestIdx] && cards[bestIdx].dataset ? cards[bestIdx].dataset.ts : 0);
    if (!ts) return;

    // Convertir a Hora Argentina (ART, UTC-3)
    const art = new Date((ts - 10800) * 1000);
    const label = `${MONTHS_ES[art.getUTCMonth()]} ${art.getUTCFullYear()}`;
    if (feedScrollDatePill.textContent !== label) {
      feedScrollDatePill.textContent = label;
    }

    // Posicionar verticalmente acompañando la barra de scroll (estilo Google Photos)
    const progress = Math.max(0, Math.min(1, window.scrollY / maxScroll));
    const minTop = 84;
    const maxTop = Math.max(minTop, window.innerHeight - 54);
    const pillTop = Math.round(minTop + progress * (maxTop - minTop));
    feedScrollDatePill.style.top = `${pillTop}px`;
    feedScrollDatePill.classList.add('is-visible');

    if (feedScrollHideTimer) clearTimeout(feedScrollHideTimer);
    feedScrollHideTimer = setTimeout(() => {
      feedScrollDatePill.classList.remove('is-visible');
    }, 1350);
  }

  window.addEventListener('scroll', () => {
    if (!feedScrollDatePill || !document.body.classList.contains('view-feed')) return;
    if (!feedScrollRafPending) {
      feedScrollRafPending = true;
      requestAnimationFrame(updateFeedScrollDatePill);
    }
  }, { passive: true });

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
    card.dataset.ts = String(it.created_utc || 0);

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
      : `<a href="#" class="author-user-link feed-author-link" data-user="${escapeHtml(author)}">u/${escapeHtml(author)}</a>`;

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

    // Autor con enlace a su perfil (o etiqueta neutra si es [deleted])
    const isDeletedAuthor = !author || author === '[deleted]' || author === '[removed]';
    if (isDeletedAuthor) {
      dialogAuthorWrap.innerHTML = `por <span style="color: var(--text-muted); font-style: italic;">[deleted]</span>`;
    } else {
      dialogAuthorWrap.innerHTML = `por <a href="#" class="author-user-link modal-author-link">u/${escapeHtml(author)}</a>`;
      dialogAuthorWrap.querySelector('.modal-author-link').addEventListener('click', (e) => {
        e.preventDefault();
        navigateToUserProfile(author);
      });
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
      if (post.lite && !post._hydrated) {
        if (strictOfflineMode) {
          dialogContent.textContent = '(Modo ligero: texto no guardado en disco. Desactivá "Offline" para consultarlo en Arctic Shift.)';
        } else {
          dialogContent.textContent = '⏳ Cargando texto del comentario desde Arctic Shift...';
          hydrateLiteComments([post]).then(() => {
            if (currentModalPost === post) {
              dialogContent.textContent = post.cuerpo || '(Sin texto)';
            }
          });
        }
      } else {
        dialogContent.textContent = post.cuerpo || '(Sin texto)';
      }
    }

    // RECONSTRUCCIÓN DEL ÁRBOL DE COMENTARIOS
    dialogCommentsSection.classList.remove('hidden');
    renderCommentTreeForPost(pid);

    if (typeof itemDialog.showModal === 'function') itemDialog.showModal();
    else itemDialog.setAttribute('open', '');
  }

  // Hidrata bajo demanda el texto de comentarios scrapeados en modo ligero (--lite) usando Arctic Shift
  const hydratingPostIds = new Set();
  async function hydrateLiteComments(commentsList) {
    if (strictOfflineMode || !Array.isArray(commentsList)) return false;
    const pending = commentsList.filter(c => c && c.id && c.lite && !c._hydrated);
    if (pending.length === 0) return false;

    const byId = new Map(pending.map(c => [c.id, c]));
    const BATCH = 100;
    let updated = false;

    for (let i = 0; i < pending.length; i += BATCH) {
      const chunkIds = pending.slice(i, i + BATCH).map(c => c.id);
      try {
        const res = await fetch(`https://arctic-shift.photon-reddit.com/api/comments/ids?ids=${chunkIds.join(',')}`);
        if (res.ok) {
          const json = await res.json();
          if (json && Array.isArray(json.data)) {
            for (const raw of json.data) {
              const target = byId.get(raw.id);
              if (target) {
                target.cuerpo = raw.body || '';
                target._hydrated = true;
                updated = true;
              }
            }
          }
        }
      } catch (_) {}
    }

    // Marcar restantes como intentados para no repetir llamadas infinitas si fueron borrados en origen
    pending.forEach(c => {
      if (!c._hydrated) {
        c._hydrated = true;
        if (!c.cuerpo) c.cuerpo = '(Texto no disponible en Arctic Shift)';
      }
    });
    return updated;
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
    const litePending = comments.filter(c => c && c.lite && !c._hydrated);
    dialogCommentsTitle.textContent = '💬 Árbol de Comentarios';
    dialogCommentsCountBadge.textContent = litePending.length > 0 && !strictOfflineMode
      ? `${comments.length} comentarios · ⏳ cargando texto...`
      : `${comments.length} comentarios`;

    if (litePending.length > 0 && !strictOfflineMode && !hydratingPostIds.has(postId)) {
      hydratingPostIds.add(postId);
      hydrateLiteComments(litePending).finally(() => {
        hydratingPostIds.delete(postId);
        if (currentModalPostId === postId && itemDialog && itemDialog.open) {
          renderCommentTreeForPost(postId);
        }
      });
    }

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
      : `<a href="#" class="author-user-link comment-tree-author" data-user="${escapeHtml(author)}">u/${escapeHtml(author)}</a>`;

    const bodyDisplay = node.cuerpo
      ? escapeHtml(node.cuerpo)
      : (node.lite && !node._hydrated
          ? (strictOfflineMode
              ? '<em style="color:var(--text-muted);">Modo ligero (Offline ON · texto no guardado en disco)</em>'
              : '<em style="color:var(--text-muted);">⏳ Cargando texto desde Arctic Shift...</em>')
          : '(Comentario sin texto)');

    el.innerHTML = `
      <div class="comment-node-header">
        <div class="comment-author-avatar">${initial}</div>
        ${authorHtml}
        <span class="comment-score-badge">▲ ${node.score || 0}</span>
        <span>${escapeHtml(node.date_art || '')}</span>
      </div>
      <div class="comment-node-body">${bodyDisplay}</div>
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
  // 12. Ranking General
  // =========================================================================
  function populateRankingSubFilter() {
    if (!rankingSubFilter) return;
    rankingSubFilter.innerHTML = '<option value="all">Todos los subreddits</option>';
    Array.from(availableSubreddits).sort().forEach(sub => {
      const opt = document.createElement('option');
      opt.value = sub;
      opt.textContent = `r/${sub}`;
      rankingSubFilter.appendChild(opt);
    });
  }

  function renderRankingList() {
    if (!rankingList || !rankingCount || !rankingSortSelect || !rankingSubFilter) return;
    rankingList.innerHTML = '';

    if (allProfiles.length === 0) {
      rankingList.innerHTML = '<div class="empty-state">Cargá un archivo <code>perfiles_usuarios.json</code> para ver el ranking.</div>';
      rankingCount.textContent = '0 usuarios';
      return;
    }

    const sortVal = rankingSortSelect.value;
    const subVal  = rankingSubFilter.value;

    let list = allProfiles.filter(p => {
      if (subVal === 'all') return true;
      return (p.metricas && p.metricas.subreddits_activos || []).includes(subVal);
    });

    list.sort((a, b) => {
      const mA = a.metricas || {}, mB = b.metricas || {};
      switch (sortVal) {
        case 'score':    return (mB.score_total || 0) - (mA.score_total || 0);
        case 'posts':    return (mB.total_posts || 0) - (mA.total_posts || 0);
        case 'comments': return (mB.total_comentarios || 0) - (mA.total_comentarios || 0);
        case 'name':     return a.usuario.localeCompare(b.usuario);
        default:         return ((mB.total_interacciones || 0) - (mA.total_interacciones || 0)) || ((mB.score_total || 0) - (mA.score_total || 0));
      }
    });

    rankingCount.textContent = `${list.length.toLocaleString()} usuarios`;
    const limit = Math.min(list.length, 500);

    for (let i = 0; i < limit; i++) {
      const p = list[i], m = p.metricas || {}, n = i + 1;
      let pos = `#${n}`, posClass = '';
      if (n === 1) { pos = '🥇'; posClass = 'pos-1'; }
      else if (n === 2) { pos = '🥈'; posClass = 'pos-2'; }
      else if (n === 3) { pos = '🥉'; posClass = 'pos-3'; }

      const subsHtml = (m.subreddits_activos || []).slice(0, 3)
        .map(s => `<span class="badge badge-sub">r/${escapeHtml(s)}</span>`).join('');

      const row = document.createElement('div');
      row.className = 'ranking-row';
      row.tabIndex = 0;
      row.innerHTML = `
        <div class="ranking-row-left">
          <span class="ranking-position ${posClass}">${pos}</span>
          <div class="ranking-user-avatar">${(p.usuario[0] || 'U').toUpperCase()}</div>
          <div class="ranking-user-info">
            <span class="ranking-user-name">u/${escapeHtml(p.usuario)}</span>
            <div class="ranking-user-subs">${subsHtml}</div>
          </div>
        </div>
        <div class="ranking-row-right">
          <div class="ranking-stat-box">
            <span class="ranking-stat-val">${(m.total_interacciones || 0).toLocaleString()}</span>
            <span class="ranking-stat-lbl">Actividades</span>
          </div>
          <div class="ranking-stat-box">
            <span class="ranking-stat-val score-val">▲ ${(m.score_total || 0).toLocaleString()}</span>
            <span class="ranking-stat-lbl">Score</span>
          </div>
          <div class="ranking-stat-box">
            <span class="ranking-stat-val">📝 ${(m.total_posts || 0).toLocaleString()} · 💬 ${(m.total_comentarios || 0).toLocaleString()}</span>
            <span class="ranking-stat-lbl">Posts / Comms</span>
          </div>
        </div>
      `;
      const go = () => { previousView = 'ranking'; selectUser(p); };
      row.addEventListener('click', go);
      row.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
      rankingList.appendChild(row);
    }

    if (list.length > limit) {
      const note = document.createElement('div');
      note.className = 'empty-state';
      note.style.fontSize = '0.8rem';
      note.textContent = `Mostrando los primeros ${limit} usuarios. Filtrá por subreddit para sub-rankings específicos.`;
      rankingList.appendChild(note);
    }
  }

  if (rankingSortSelect) rankingSortSelect.addEventListener('change', renderRankingList);
  if (rankingSubFilter) rankingSubFilter.addEventListener('change', renderRankingList);

  // =========================================================================
  // 13. Vista de Perfil de Usuario Seleccionado (Multiple-Choice por Subreddit)
  // =========================================================================
  let allCurrentProfileSubs = [];
  let selectedProfileSubs = new Set();

  if (profileSubMultiBtn && profileSubMultiPanel) {
    profileSubMultiBtn.addEventListener('click', e => {
      e.stopPropagation();
      const willOpen = profileSubMultiPanel.classList.contains('hidden');
      profileSubMultiPanel.classList.toggle('hidden', !willOpen);
      profileSubMultiBtn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    });

    document.addEventListener('click', e => {
      if (profileSubMultiWrap && !profileSubMultiWrap.contains(e.target)) {
        profileSubMultiPanel.classList.add('hidden');
        profileSubMultiBtn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  if (profileSubsAllBtn) {
    profileSubsAllBtn.addEventListener('click', () => {
      selectedProfileSubs = new Set(allCurrentProfileSubs);
      syncProfileCheckboxesDOM();
      applyProfileSubFilters();
    });
  }

  if (profileSubsNoneBtn) {
    profileSubsNoneBtn.addEventListener('click', () => {
      selectedProfileSubs.clear();
      syncProfileCheckboxesDOM();
      applyProfileSubFilters();
    });
  }

  function syncProfileCheckboxesDOM() {
    if (!profileSubCheckboxes) return;
    profileSubCheckboxes.querySelectorAll('input[type="checkbox"]').forEach(chk => {
      chk.checked = selectedProfileSubs.has(chk.value);
    });
  }

  function applyProfileSubFilters() {
    if (!selectedProfile) return;
    const m = selectedProfile.metricas || {};
    const totalSubsCount = allCurrentProfileSubs.length;
    const selectedCount = selectedProfileSubs.size;
    const isAllSelected = totalSubsCount > 0 && selectedCount === totalSubsCount;
    const hasFilterActive = totalSubsCount > 0 && !isAllSelected;

    // 1. Actualizar etiqueta del botón multiple-choice
    if (profileSubMultiLabel) {
      if (totalSubsCount === 0) {
        profileSubMultiLabel.textContent = 'Sin subreddits';
      } else if (isAllSelected) {
        profileSubMultiLabel.textContent = `Todos (${totalSubsCount})`;
      } else if (selectedCount === 0) {
        profileSubMultiLabel.textContent = 'Ninguno seleccionado';
      } else {
        profileSubMultiLabel.textContent = `${selectedCount} de ${totalSubsCount} seleccionados`;
      }
    }

    // 2. Barra de "Subreddits activos" (NO clickeables, solo los seleccionados + aviso de filtro)
    userSubreddits.innerHTML = '';
    const selectedList = allCurrentProfileSubs.filter(s => selectedProfileSubs.has(s));
    if (selectedList.length > 0) {
      selectedList.forEach(s => {
        const badge = document.createElement('span');
        badge.className = 'badge badge-sub';
        badge.textContent = `r/${s}`;
        userSubreddits.appendChild(badge);
      });
    } else {
      userSubreddits.innerHTML = '<span class="status-meta">Ningún subreddit seleccionado</span>';
    }

    if (profileFilterNotice) {
      if (hasFilterActive) {
        profileFilterNotice.textContent = `🔎 Filtro activo (${selectedCount}/${totalSubsCount})`;
        profileFilterNotice.classList.remove('hidden');
      } else {
        profileFilterNotice.classList.add('hidden');
      }
    }

    // 3. Recalcular métricas, fechas y mapa de calor 24x7 según subreddits seleccionados
    let activeItemsForHeatmap = selectedProfile.timeline || [];

    if (isAllSelected || totalSubsCount === 0) {
      userDates.textContent = `Actividad registrada: ${m.primera_actividad_art || '?'} ➜ ${m.ultima_actividad_art || '?'}`;
      metricScore.textContent    = (m.score_total || 0).toLocaleString();
      metricTotal.textContent    = (m.total_interacciones || 0).toLocaleString();
      metricPosts.textContent    = (m.total_posts || 0).toLocaleString();
      metricComments.textContent = (m.total_comentarios || 0).toLocaleString();
      metricAvg.textContent      = m.score_promedio !== undefined ? `${m.score_promedio} pts` : '0 pts';
    } else {
      const selectedLower = new Set(Array.from(selectedProfileSubs).map(s => s.toLowerCase()));
      const filtered = (selectedProfile.timeline || []).filter(
        it => selectedLower.has((it.subreddit || 'otros').toLowerCase())
      );
      activeItemsForHeatmap = filtered;

      let scoreSum = 0;
      let postsCnt = 0;
      let commsCnt = 0;
      filtered.forEach(it => {
        scoreSum += (it.score || 0);
        if (it.tipo === 'post') postsCnt++;
        else commsCnt++;
      });

      const sortedByDate = filtered.slice().sort((a, b) => (a.created_utc || 0) - (b.created_utc || 0));
      const firstDate = sortedByDate[0] ? sortedByDate[0].date_art : '-';
      const lastDate  = sortedByDate[sortedByDate.length - 1] ? sortedByDate[sortedByDate.length - 1].date_art : '-';
      const avg = filtered.length > 0 ? (scoreSum / filtered.length).toFixed(2) : '0';

      userDates.textContent      = `Filtrado (${selectedCount} de ${totalSubsCount} subs): ${firstDate} ➜ ${lastDate}`;
      metricScore.textContent    = scoreSum.toLocaleString();
      metricTotal.textContent    = filtered.length.toLocaleString();
      metricPosts.textContent    = postsCnt.toLocaleString();
      metricComments.textContent = commsCnt.toLocaleString();
      metricAvg.textContent      = `${avg} pts`;
    }

    // 4. Renderizar Mapa de Calor 24h x 7 días (Hora Argentina ART UTC-3)
    renderUserHeatmap(activeItemsForHeatmap);

    // 5. Actualizar línea de tiempo
    renderUserTimeline();
  }

  function renderUserHeatmap(items) {
    if (!userHeatmapGrid || !heatmapSummary) return;
    userHeatmapGrid.innerHTML = '';

    // 7 días (Lun=0 .. Dom=6) x 24 horas (0..23)
    const DAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    const DAY_FULL   = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    const grid = Array.from({ length: 7 }, () => new Uint32Array(24));
    const hoursActive = new Uint8Array(24);

    let totalValid = 0;
    let nightCount = 0; // 00:00 a 05:59 ART
    let maxVal = 0;
    let peakDay = 0;
    let peakHour = 0;

    for (let i = 0; i < items.length; i++) {
      const ts = items[i].created_utc;
      if (!ts) continue;
      // Convertir a ART (UTC-3) sin depender del timezone del sistema
      const art = new Date((ts - 10800) * 1000);
      const jsDay = art.getUTCDay(); // 0=Dom, 1=Lun .. 6=Sáb
      const dayIdx = (jsDay + 6) % 7; // 0=Lun .. 6=Dom
      const hour = art.getUTCHours();

      grid[dayIdx][hour]++;
      hoursActive[hour] = 1;
      totalValid++;
      if (hour < 6) nightCount++;

      if (grid[dayIdx][hour] > maxVal) {
        maxVal = grid[dayIdx][hour];
        peakDay = dayIdx;
        peakHour = hour;
      }
    }

    if (totalValid === 0) {
      heatmapSummary.textContent = 'Sin marcas de tiempo disponibles para este filtro.';
      return;
    }

    let activeHoursCount = 0;
    for (let h = 0; h < 24; h++) activeHoursCount += hoursActive[h];
    const nightPct = Math.round((nightCount / totalValid) * 100);
    const peakHourStr = String(peakHour).padStart(2, '0');

    heatmapSummary.innerHTML = `Pico: <strong>${DAY_LABELS[peakDay]} ${peakHourStr}:00h</strong> (${maxVal.toLocaleString()} acts) · Madrugada (00–06h): <strong>${nightPct}%</strong> · Cobertura: <strong>${activeHoursCount}/24h</strong>`;

    const gridEl = document.createElement('div');
    gridEl.className = 'heatmap-grid';

    // Fila de cabecera con horas (00..23)
    const corner = document.createElement('div');
    gridEl.appendChild(corner);
    for (let h = 0; h < 24; h++) {
      const hLbl = document.createElement('div');
      hLbl.className = 'hm-hour-label';
      hLbl.textContent = h % 2 === 0 ? String(h).padStart(2, '0') : '';
      gridEl.appendChild(hLbl);
    }

    // 7 filas de días
    for (let d = 0; d < 7; d++) {
      const dLbl = document.createElement('div');
      dLbl.className = 'hm-day-label';
      dLbl.textContent = DAY_LABELS[d];
      gridEl.appendChild(dLbl);

      for (let h = 0; h < 24; h++) {
        const val = grid[d][h];
        let lvl = 0;
        if (val > 0) {
          const ratio = val / maxVal;
          if (ratio >= 0.75) lvl = 4;
          else if (ratio >= 0.45) lvl = 3;
          else if (ratio >= 0.2) lvl = 2;
          else lvl = 1;
        }
        const cell = document.createElement('div');
        cell.className = `hm-cell hm-lvl-${lvl}`;
        const hStr = String(h).padStart(2, '0');
        cell.title = `${DAY_FULL[d]} ${hStr}:00–${hStr}:59 ART: ${val.toLocaleString()} actividad${val === 1 ? '' : 'es'}`;
        gridEl.appendChild(cell);
      }
    }

    userHeatmapGrid.appendChild(gridEl);
  }

  function selectUser(profile) {
    selectedProfile = profile;
    const m = profile.metricas || {};
    showView('profile');

    if (profileSubMultiPanel) profileSubMultiPanel.classList.add('hidden');
    if (profileSubMultiBtn) profileSubMultiBtn.setAttribute('aria-expanded', 'false');

    userName.textContent = `u/${profile.usuario}`;
    userAvatar.textContent = (profile.usuario[0] || 'U').toUpperCase();
    redditProfileLink.href = `https://www.reddit.com/user/${encodeURIComponent(profile.usuario)}/`;

    // Flairs
    userFlairs.innerHTML = '';
    (m.flairs_utilizados || []).filter(Boolean).forEach(f => {
      const badge = document.createElement('span');
      badge.className = 'badge badge-flair';
      badge.textContent = f;
      userFlairs.appendChild(badge);
    });
    if (!m.flairs_utilizados || m.flairs_utilizados.length === 0) {
      userFlairs.innerHTML = '<span class="status-meta">Sin flairs</span>';
    }

    // Recolectar subreddits del usuario y conteos
    const subCounts = new Map();
    (profile.timeline || []).forEach(it => {
      const sub = it.subreddit || 'otros';
      subCounts.set(sub, (subCounts.get(sub) || 0) + 1);
    });
    allCurrentProfileSubs = Array.from(subCounts.keys()).sort();

    // Selección inicial: si el Feed activo filtra un subconjunto de comunidades donde el usuario participó, preseleccionar esas; sino todas
    const filterByActiveFeed = activeFeedSubs.size > 0 && activeFeedSubs.size < availableSubreddits.size;
    if (filterByActiveFeed) {
      const matchingSubs = allCurrentProfileSubs.filter(s => activeFeedSubs.has(s));
      selectedProfileSubs = new Set(matchingSubs.length > 0 ? matchingSubs : allCurrentProfileSubs);
    } else {
      selectedProfileSubs = new Set(allCurrentProfileSubs);
    }

    // Poblar checkboxes del multiple-choice
    if (profileSubCheckboxes) {
      profileSubCheckboxes.innerHTML = '';
      allCurrentProfileSubs.forEach(sub => {
        const id = `prof-sub-chk-${sub}`;
        const row = document.createElement('div');
        row.className = 'sub-checkbox-item';

        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.id = id;
        chk.value = sub;
        chk.checked = selectedProfileSubs.has(sub);
        chk.addEventListener('change', () => {
          if (chk.checked) selectedProfileSubs.add(sub);
          else selectedProfileSubs.delete(sub);
          applyProfileSubFilters();
        });

        const lbl = document.createElement('label');
        lbl.htmlFor = id;
        lbl.textContent = `r/${sub}`;

        const cnt = document.createElement('span');
        cnt.className = 'sub-checkbox-count';
        cnt.textContent = (subCounts.get(sub) || 0).toLocaleString();

        row.appendChild(chk);
        row.appendChild(lbl);
        row.appendChild(cnt);
        profileSubCheckboxes.appendChild(row);
      });
    }

    applyProfileSubFilters();
  }

  function renderUserTimeline() {
    if (!selectedProfile || !Array.isArray(selectedProfile.timeline)) {
      timelineFeed.innerHTML = '<div class="empty-state">Sin actividades registradas.</div>';
      timelineCount.textContent = '0 ítems';
      return;
    }

    let items = selectedProfile.timeline.slice();

    if (activeTimelineFilter !== 'all') {
      items = items.filter(it => it.tipo === activeTimelineFilter);
    }
    if (allCurrentProfileSubs.length > 0 && selectedProfileSubs.size < allCurrentProfileSubs.length) {
      const selectedLower = new Set(Array.from(selectedProfileSubs).map(s => s.toLowerCase()));
      items = items.filter(it => selectedLower.has((it.subreddit || 'otros').toLowerCase()));
    }

    items.sort((a, b) => {
      if (currentSortOrder === 'asc')   return (a.created_utc || 0) - (b.created_utc || 0);
      if (currentSortOrder === 'score') return (b.score || 0)       - (a.score || 0);
      return (b.created_utc || 0) - (a.created_utc || 0);
    });

    timelineCount.textContent = `${items.length.toLocaleString()} ítems`;
    timelineFeed.innerHTML = '';

    if (items.length === 0) {
      timelineFeed.innerHTML = '<div class="empty-state">No hay actividades para este filtro.</div>';
      return;
    }

    items.forEach(it => {
      const isPost = it.tipo === 'post';
      const card = document.createElement('article');
      card.className = `timeline-item ${isPost ? 'timeline-item-post' : 'timeline-item-comment'}`;

      const badgeClass = isPost ? 'badge-post' : 'badge-comment';
      const badgeIcon  = isPost ? '📝 PUBLICACIÓN' : '💬 COMENTARIO';
      const subLabel   = it.subreddit ? `r/${it.subreddit}` : '';

      let bodyHtml = '';
      if (isPost) {
        bodyHtml = `
          <h4 class="timeline-post-title post-clickable-title" style="cursor: pointer;">${escapeHtml(it.titulo || '(Sin título)')}</h4>
          ${it.cuerpo ? `<div class="timeline-post-selftext-preview">${escapeHtml(it.cuerpo)}</div>` : ''}
        `;
      } else {
        const replyInfo = resolveReplyTarget(it);
        let replyTargetHtml = '';
        if (replyInfo && replyInfo.targetAuthor && replyInfo.targetAuthor !== '[deleted]') {
          replyTargetHtml = `<span>↳ 💬 En respuesta a <a href="#" class="author-user-link timeline-reply-link" data-user="${escapeHtml(replyInfo.targetAuthor)}">u/${escapeHtml(replyInfo.targetAuthor)}</a></span>`;
          if (it.post_titulo) {
            replyTargetHtml += `<span>· Post: <strong>${escapeHtml(it.post_titulo)}</strong></span>`;
          }
        } else if (it.post_titulo) {
          replyTargetHtml = `<span>↳ 💬 En respuesta al post:</span> <strong>${escapeHtml(it.post_titulo)}</strong>`;
        }

        const contextHtml = replyTargetHtml
          ? `<div class="timeline-context-quote" style="flex-wrap:wrap;">${replyTargetHtml}</div>`
          : '';
        bodyHtml = `
          ${contextHtml}
          <div class="timeline-comment-bubble">${escapeHtml(it.cuerpo || '(Comentario sin texto)')}</div>
        `;
      }

      card.innerHTML = `
        <div class="timeline-item-header">
          <div class="timeline-item-meta">
            <span class="badge ${badgeClass}">${badgeIcon}</span>
            ${subLabel ? `<span class="badge badge-sub">${escapeHtml(subLabel)}</span>` : ''}
            ${it.flair ? `<span class="badge badge-flair">${escapeHtml(it.flair)}</span>` : ''}
            <span>${escapeHtml(it.date_art || '')}</span>
          </div>
          <span class="timeline-score">▲ ${it.score || 0}</span>
        </div>

        <div class="timeline-item-main">${bodyHtml}</div>

        <div class="timeline-item-footer">
          <span class="action-link view-dialog-btn">Ver en detalle y discusión ↗</span>
          ${it.permalink ? `<a href="${it.permalink}" target="_blank" rel="noopener noreferrer" class="external-link">Abrir en Reddit ↗</a>` : ''}
        </div>
      `;

      const openItem = () => openPostDetail({ ...it, _author: selectedProfile.usuario });
      card.querySelector('.view-dialog-btn').addEventListener('click', openItem);
      const titleLink = card.querySelector('.post-clickable-title');
      if (titleLink) titleLink.addEventListener('click', openItem);

      const replyLink = card.querySelector('.timeline-reply-link');
      if (replyLink) {
        replyLink.addEventListener('click', e => {
          e.preventDefault();
          navigateToUserProfile(replyLink.dataset.user);
        });
      }

      timelineFeed.appendChild(card);
    });
  }

  timelineSortChips.forEach(btn => {
    btn.addEventListener('click', () => {
      timelineSortChips.forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      currentSortOrder = btn.dataset.timelineSort;
      renderUserTimeline();
    });
  });
  timelineChips.forEach(chip => {
    chip.addEventListener('click', () => {
      timelineChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      activeTimelineFilter = chip.dataset.type;
      renderUserTimeline();
    });
  });

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

  // =========================================================================
  // 15. API interna para módulos complementarios (graph.js) e Inicio
  // =========================================================================
  window.RedditFeedViewerAPI = {
    getData: () => ({
      allProfiles,
      availableSubreddits,
      userProfileMap,
      postById,
      commentsByPostId
    }),
    navigateToUserProfile,
    returnToUserProfileFromGraph
  };

  initTheme();
  initOfflineMode();
  showView('feed');
  setFeedBuilderDataState(false);
  openFeedBuilderDialog();
  tryAutoLoad();

})();
