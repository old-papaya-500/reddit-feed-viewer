const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const VIEWER_DIR = path.resolve(__dirname, '..', 'viewer');
const MINI_PERFILES = path.join(__dirname, 'fixtures', 'mini_perfiles.json');

// Elementos opcionales/deshabilitados en la edición pública que app.js consulta con guardas defensivas
const OPTIONAL_DYNAMIC_IDS = new Set([
  'feedTitleSearch', 'clearTitleSearchBtn',
  'tabRanking', 'sectionRanking', 'tabGraph', 'sectionGraph', 'profileOpenGraphBtn',
  'rankingSortSelect', 'rankingSubFilter', 'rankingList', 'rankingCount',
  'userHeatmapGrid', 'heatmapSummary'
]);

test('Auditoría estática DOM: todos los getElementById requeridos de app.js y faq.js existen en index.html', () => {
  const html = fs.readFileSync(path.join(VIEWER_DIR, 'index.html'), 'utf-8');
  const htmlIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));

  for (const scriptName of ['app.js', 'faq.js']) {
    const code = fs.readFileSync(path.join(VIEWER_DIR, scriptName), 'utf-8');
    const refs = [...code.matchAll(/getElementById\(\s*['"]([^'"]+)['"]\s*\)/g)].map(m => m[1]);
    const missing = [...new Set(refs)].filter(id => !htmlIds.has(id) && !OPTIONAL_DYNAMIC_IDS.has(id));
    assert.deepEqual(missing, [], `IDs faltantes en index.html referenciados por ${scriptName}: ${missing.join(', ')}`);
  }
});

// Crea un DOM ligero en memoria con todos los IDs reales de index.html para probar flujos de app.js sin navegador
function createMockDom(html) {
  const elementsById = new Map();

  function makeClassList(initial = []) {
    const set = new Set(initial);
    return {
      add: (...cls) => cls.forEach(c => set.add(c)),
      remove: (...cls) => cls.forEach(c => set.delete(c)),
      toggle: (c, force) => {
        if (force === undefined) {
          if (set.has(c)) { set.delete(c); return false; }
          set.add(c); return true;
        }
        if (force) set.add(c); else set.delete(c);
        return Boolean(force);
      },
      contains: (c) => set.has(c),
      toArray: () => Array.from(set)
    };
  }

  function createEl(tag = 'div', id = '') {
    const listeners = new Map();
    const attrs = new Map();
    const children = [];
    const el = {
      tagName: tag.toUpperCase(),
      id,
      type: '',
      value: '',
      checked: false,
      disabled: false,
      open: false,
      textContent: '',
      _innerHTML: '',
      get innerHTML() { return this._innerHTML; },
      set innerHTML(val) { this._innerHTML = String(val || ''); children.length = 0; },
      style: {},
      dataset: {},
      className: '',
      classList: makeClassList(),
      children,
      appendChild(child) { children.push(child); return child; },
      setAttribute(k, v) { attrs.set(k, String(v)); },
      getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
      removeAttribute(k) { attrs.delete(k); },
      addEventListener(ev, fn) {
        if (!listeners.has(ev)) listeners.set(ev, []);
        listeners.get(ev).push(fn);
      },
      dispatch(ev, eventObj = {}) {
        const list = listeners.get(ev) || [];
        const e = { preventDefault() {}, stopPropagation() {}, target: el, ...eventObj };
        list.forEach(fn => fn(e));
      },
      querySelector(sel) {
        if (sel.startsWith('.')) {
          const cls = sel.slice(1);
          const stack = [...children];
          while (stack.length) {
            const cur = stack.shift();
            if (cur && (cur.classList.contains(cls) || String(cur.className).includes(cls))) return cur;
            if (cur && cur.children) stack.push(...cur.children);
          }
        }
        return createEl('span');
      },
      querySelectorAll(sel) {
        const res = [];
        const stack = [...children];
        while (stack.length) {
          const cur = stack.shift();
          if (!cur) continue;
          if (sel === 'input[type="checkbox"]' && cur.type === 'checkbox') res.push(cur);
          else if (sel === '.sub-chk:checked' && cur.classList.contains('sub-chk') && cur.checked) res.push(cur);
          else if (sel === '.sub-chk' && cur.classList.contains('sub-chk')) res.push(cur);
          else if (sel === 'details.faq-item' && cur.tagName === 'DETAILS' && (cur.classList.contains('faq-item') || cur.className === 'faq-item')) res.push(cur);
          if (cur.children) stack.push(...cur.children);
        }
        return res;
      },
      closest() { return null; },
      contains() { return false; },
      focus() {},
      click() { this.dispatch('click'); },
      showModal() { this.open = true; },
      close() { this.open = false; },
      getBoundingClientRect() { return { top: 100, left: 0, width: 800, height: 120 }; }
    };
    if (id) elementsById.set(id, el);
    return el;
  }

  for (const m of html.matchAll(/\bid="([^"]+)"/g)) {
    const id = m[1];
    if (!elementsById.has(id)) createEl('div', id);
  }

  if (elementsById.has('feedSortSelect')) elementsById.get('feedSortSelect').value = 'date_desc';

  const docListeners = new Map();
  const document = {
    documentElement: createEl('html'),
    body: createEl('body'),
    getElementById: (id) => elementsById.get(id) || null,
    createElement: (tag) => createEl(tag),
    querySelectorAll: () => [],
    addEventListener: (ev, fn) => {
      if (!docListeners.has(ev)) docListeners.set(ev, []);
      docListeners.get(ev).push(fn);
    }
  };

  const storage = new Map();
  const windowObj = {
    document,
    matchMedia: () => ({ matches: false }),
    localStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: (k) => storage.delete(k)
    },
    scrollY: 0,
    innerHeight: 900,
    scrollTo: () => {},
    open: () => {},
    confirm: () => true,
    alert: () => {},
    addEventListener: () => {},
    requestAnimationFrame: (cb) => setTimeout(cb, 0)
  };

  return { document, windowObj, elementsById };
}

test('Flujo funcional completo de app.js: Carga JSON -> Armar Feed -> Omnibox -> Perfil -> Modal -> Vaciar', async () => {
  const html = fs.readFileSync(path.join(VIEWER_DIR, 'index.html'), 'utf-8');
  const appCode = fs.readFileSync(path.join(VIEWER_DIR, 'app.js'), 'utf-8');
  const fixture = JSON.parse(fs.readFileSync(MINI_PERFILES, 'utf-8'));

  const instrumented = appCode.replace(
    'initTheme();',
    'window.__testHooks = { loadData, generateFeed, selectUser, openPostDetail, applyTitleFilter, clearMemory, loadRecentSearches, clearRecentSearches, renderHeaderDropdown }; initTheme();'
  );

  const { document, windowObj, elementsById } = createMockDom(html);
  const sandbox = {
    window: windowObj,
    document,
    localStorage: windowObj.localStorage,
    requestAnimationFrame: windowObj.requestAnimationFrame,
    confirm: () => true,
    alert: () => {},
    fetch: async () => ({ ok: false }),
    setTimeout, clearTimeout,
    console, Map, Set, Array, Math, Date, Object, Number, String, Boolean, JSON, RegExp, Uint8Array, Uint32Array,
    encodeURIComponent, parseInt, parseFloat, Promise
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(instrumented, sandbox);

  const hooks = windowObj.__testHooks;
  assert.ok(hooks, 'Hooks de prueba inicializados correctamente');

  // 1. Estado inicial: Armar Feed bloqueado (grisado) hasta cargar JSON
  assert.equal(elementsById.get('feedBuilderFieldset').disabled, true, 'El formulario debe iniciar grisado/deshabilitado');
  assert.equal(elementsById.get('applyFeedBtn').disabled, true, 'Generar Feed debe iniciar deshabilitado');

  // 2. Cargar mini_perfiles.json
  await hooks.loadData(fixture, 'mini_perfiles.json');
  assert.equal(elementsById.get('feedBuilderFieldset').disabled, false, 'El formulario debe desbloquearse tras cargar JSON');
  assert.equal(elementsById.get('applyFeedBtn').disabled, false, 'Generar Feed debe habilitarse tras cargar JSON');

  const apiData = windowObj.RedditFeedViewerAPI.getData();
  assert.equal(apiData.allProfiles.length, 8, 'Solo 8 perfiles reales (excluyendo [deleted] de allProfiles)');
  assert.equal(apiData.postById.size, 6, 'Los 6 posts (incluido el [deleted]) deben estar en postById');

  // 3. Generar Feed
  elementsById.get('applyFeedBtn').click();
  assert.equal(elementsById.get('feedItemsList').children.length, 6, 'El Feed debe renderizar los 6 posts');

  // 4. Filtro de título vía Omnibox + memoria de últimos 5 buscados recientemente + borrar historial
  hooks.applyTitleFilter('dolar');
  assert.equal(elementsById.get('feedItemsList').children.length, 1, 'Búsqueda "dolar" debe filtrar al post de economía');
  hooks.applyTitleFilter('uno');
  hooks.applyTitleFilter('dos');
  hooks.applyTitleFilter('tres');
  hooks.applyTitleFilter('cuatro');
  hooks.applyTitleFilter('cinco');
  const recents = hooks.loadRecentSearches();
  assert.equal(recents.length, 5, 'El historial del Omnibox debe guardar como máximo 5 búsquedas');
  assert.equal(recents[0].value, 'cinco', 'La búsqueda más reciente debe quedar primera');
  assert.equal(recents.some(r => r.value === 'dolar'), false, 'La 6ta búsqueda más antigua debe desplazarse fuera del límite de 5');
  hooks.applyTitleFilter('');
  assert.equal(elementsById.get('feedItemsList').children.length, 6, 'Limpiar búsqueda debe restaurar los 6 posts');
  hooks.renderHeaderDropdown();
  assert.equal(elementsById.get('headerSearchDropdown').classList.contains('hidden'), false, 'Con el input vacío y con historial, el desplegable debe mostrar los recientes');
  hooks.clearRecentSearches();
  assert.equal(hooks.loadRecentSearches().length, 0, 'Borrar historial debe vaciar los buscados recientemente');

  // 5. Abrir Perfil de usuario (protege contra regresiones en selectUser)
  const alice = apiData.userProfileMap.get('alice');
  assert.ok(alice, 'Perfil de alice debe existir');
  hooks.selectUser(alice);
  assert.equal(elementsById.get('userName').textContent, 'u/alice');
  assert.notEqual(elementsById.get('metricTotal').textContent, '0', 'Las métricas del perfil no pueden quedar vacías');
  assert.ok(elementsById.get('timelineFeed').children.length > 0, 'La línea de tiempo del perfil debe poblarse');

  // 6. Volver al Feed con preservación de vista
  elementsById.get('backBtn').click();
  assert.equal(windowObj.RedditFeedViewerAPI.getCurrentView(), 'feed');

  // 7. Abrir Modal de Post y verificar reconstrucción de árbol de comentarios
  const p002 = apiData.postById.get('p002');
  hooks.openPostDetail(p002);
  assert.ok(elementsById.get('dialogCommentTree').children.length > 0, 'El árbol de comentarios de p002 debe reconstruirse');

  // 8. Vaciar memoria
  hooks.clearMemory();
  assert.equal(elementsById.get('feedBuilderFieldset').disabled, true, 'Al vaciar memoria, Armar Feed debe volver a bloquearse');
});

test('Módulo FAQ reutilizable (faq.js) y botón global Ayuda: cobertura de pantallas públicas y referencia a Documentation/', async () => {
  const html = fs.readFileSync(path.join(VIEWER_DIR, 'index.html'), 'utf-8');
  const appCode = fs.readFileSync(path.join(VIEWER_DIR, 'app.js'), 'utf-8');
  const faqCode = fs.readFileSync(path.join(VIEWER_DIR, 'faq.js'), 'utf-8');
  const fixture = JSON.parse(fs.readFileSync(MINI_PERFILES, 'utf-8'));

  const instrumentedApp = appCode.replace(
    'initTheme();',
    'window.__testHooks = { loadData, selectUser }; initTheme();'
  );

  const { document, windowObj, elementsById } = createMockDom(html);
  const sandbox = {
    window: windowObj,
    document,
    localStorage: windowObj.localStorage,
    requestAnimationFrame: windowObj.requestAnimationFrame,
    navigator: { clipboard: { writeText: async () => {} } },
    confirm: () => true,
    alert: () => {},
    fetch: async () => ({ ok: false }),
    setTimeout, clearTimeout,
    console, Map, Set, Array, Math, Date, Object, Number, String, Boolean, JSON, RegExp, Uint8Array, Uint32Array,
    encodeURIComponent, parseInt, parseFloat, Promise
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(instrumentedApp, sandbox);
  vm.runInNewContext(faqCode, sandbox);

  const ctrl = windowObj.RedditFaqController;
  assert.ok(ctrl, 'RedditFaqController debe registrarse en window');
  assert.deepEqual(
    ctrl.getSectionIds().sort(),
    ['feed', 'profile', 'scraping'],
    'Deben existir las 3 secciones contextuales públicas del visor'
  );

  const faqDialog = elementsById.get('faqDialog');
  const docRefEl = elementsById.get('faqDialogDocRef');
  const accordion = elementsById.get('faqAccordionSection');
  const helpBtn = elementsById.get('headerHelpBtn');

  // 1. Botón del Paso 1 (#feedBuilderFaqBtn) -> scraping (flujo core de 3 etapas + validador)
  elementsById.get('feedBuilderFaqBtn').click();
  assert.equal(faqDialog.open, true);
  assert.equal(ctrl.getActiveSectionId(), 'scraping');
  assert.equal(accordion.children.length, 5);
  assert.ok(docRefEl.textContent.includes('README.md'));
  ctrl.closeFaq();

  // 2. En Feed -> #headerHelpBtn abre guía de Feed (Documentation/GUIA_FEED.md)
  helpBtn.click();
  assert.equal(ctrl.getActiveSectionId(), 'feed');
  assert.ok(docRefEl.textContent.includes('Documentation/GUIA_FEED.md'));
  ctrl.closeFaq();

  // 3. En Perfil de usuario -> #headerHelpBtn abre guía de Perfil (Documentation/GUIA_PERFILES.md)
  await windowObj.__testHooks.loadData(fixture, 'mini_perfiles.json');
  const alice = windowObj.RedditFeedViewerAPI.getData().userProfileMap.get('alice');
  windowObj.__testHooks.selectUser(alice);
  helpBtn.click();
  assert.equal(ctrl.getActiveSectionId(), 'profile');
  assert.ok(docRefEl.textContent.includes('Documentation/GUIA_PERFILES.md'));
  assert.equal(accordion.children[0].open, true, 'En Perfil el primer acordeón debe abrirse');

  // 4. Expandir todo y Contraer todo
  const toggleAllBtn = elementsById.get('faqToggleAllBtn');
  toggleAllBtn.click();
  assert.equal(toggleAllBtn.getAttribute('aria-expanded'), 'true');
  assert.ok(accordion.children.every(d => d.open === true));
  toggleAllBtn.click();
  assert.equal(toggleAllBtn.getAttribute('aria-expanded'), 'false');
  assert.ok(accordion.children.every(d => d.open === false));

  // 5. Verificar reseteo automático de scrollTop al tope tras showModal() al cambiar de sección
  const faqBody = elementsById.get('faqDialogBody');
  let internalScrollTop = 280;
  Object.defineProperty(faqBody, 'scrollTop', {
    get: () => internalScrollTop,
    set: (val) => { if (faqDialog.open) internalScrollTop = val; }
  });
  elementsById.get('tabFeed').click();
  helpBtn.click();
  assert.equal(faqBody.scrollTop, 0, 'Al abrir el modal FAQ, el scroll debe volver a 0 después de showModal()');
  internalScrollTop = 340;
  faqDialog.close();
  windowObj.__testHooks.selectUser(alice);
  helpBtn.click();
  assert.equal(faqBody.scrollTop, 0, 'Al reabrir en otra sección tras dejarlo scrolleado, debe volver al tope (0)');

  elementsById.get('faqDialogCloseBtn').click();
  assert.equal(faqDialog.open, false);
});
