#!/usr/bin/env node
// scrapear_comentarios.js - Extractor Concurrente de Comentarios de Reddit
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const USER_AGENT = 'reddit-comment-researcher-parallel/1.0 (pure nodejs)';
const DEFAULT_CONCURRENCY = 3;
const MAX_CONCURRENCY = 20;
const PER_WORKER_DELAY_MS = 1400; // Pausa prudente por cada hilo

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Parseador de argumentos de línea de comandos
function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    } else if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        parsed[key] = next;
        i++;
      } else {
        parsed[key] = true;
      }
    } else if (arg.startsWith('-')) {
      const key = arg.slice(1);
      const next = args[i + 1];
      if (next && !next.startsWith('-')) {
        parsed[key] = next;
        i++;
      } else {
        parsed[key] = true;
      }
    }
  }
  return parsed;
}

function showHelp() {
  console.log(`
Uso de scrapear_comentarios.js:

  1) Modo Interactivo (sin argumentos):
     node scrapear_comentarios.js

  2) Modo con Argumentos:
     node scrapear_comentarios.js --input <archivo_posts.json> [opciones]

Opciones disponibles:
  --input <archivo>        Ruta al archivo JSON de publicaciones (ej: argentina_2026_01.json)
  --concurrency, -c <num>  Cantidad de hilos en paralelo (por defecto: ${DEFAULT_CONCURRENCY}, máx: ${MAX_CONCURRENCY})
  --lite                   Modo ligero (solo interacciones sin texto/body; ahorra ~70% de espacio, ideal para grafos)
  --out <archivo>          Ruta o nombre del archivo JSON de salida
  --limit <num>            Límite opcional de publicaciones a procesar (para pruebas rápidas)
  --help, -h               Muestra este mensaje de ayuda
`);
}

// Busca archivos JSON de publicaciones en el directorio actual y dentro de resultados/
function discoverPostJsonFiles() {
  const found = [];
  const isPostFile = (name) =>
    name.endsWith('.json') &&
    !name.startsWith('.') &&
    !name.includes('_comentarios') &&
    !name.includes('checkpoint') &&
    !name.includes('perfiles_usuarios') &&
    !name.includes('resumen_') &&
    name !== 'master.json' &&
    name !== 'media_comments.json';

  for (const f of fs.readdirSync('.')) {
    if (isPostFile(f) && fs.statSync(f).isFile()) found.push(f);
  }
  if (fs.existsSync('resultados') && fs.statSync('resultados').isDirectory()) {
    for (const entry of fs.readdirSync('resultados', { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === 'consolidados' || entry.name.startsWith('.')) continue;
      const subDir = path.join('resultados', entry.name);
      for (const f of fs.readdirSync(subDir)) {
        const full = path.join(subDir, f);
        if (isPostFile(f) && fs.statSync(full).isFile()) found.push(full);
      }
    }
  }
  found.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return found;
}

function ask(rl, promptText, defaultValue = '') {
  return new Promise(resolve => {
    const prompt = defaultValue ? `${promptText} [por defecto: ${defaultValue}]: ` : `${promptText}: `;
    rl.question(prompt, answer => {
      resolve(answer.trim() || defaultValue);
    });
  });
}

async function askValidated(rl, promptText, defaultValue, validator, errorMsg) {
  while (true) {
    const raw = await ask(rl, promptText, defaultValue);
    const parsed = validator(raw);
    if (parsed !== null && parsed !== undefined) return parsed;
    console.log(`  ❌ Valor inválido ("${raw}"). ${errorMsg}`);
  }
}

// Petición HTTP con reintentos y retroceso exponencial
async function fetchWithRetry(url, maxRetries = 10) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
      if (res.status === 200) {
        return await res.json();
      }
      if (res.status === 404) {
        return { data: [] };
      }
      if (res.status === 422 || res.status === 429 || res.status >= 500) {
        const wait = Math.min(attempt * 6, 45);
        console.warn(`  [HTTP ${res.status}] Enfriando y reintentando en ${wait}s (intento ${attempt}/${maxRetries})...`);
        await sleep(wait * 1000);
        continue;
      }
      console.warn(`  [HTTP ${res.status}] Error no recuperable al consultar ${url}`);
      return null;
    } catch (err) {
      const wait = Math.min(attempt * 6, 45);
      console.warn(`  [Red: ${err.message}] Reintentando en ${wait}s...`);
      await sleep(wait * 1000);
    }
  }
  return null;
}

// Extrae URLs de imágenes/GIFs embebidos en comentarios (media_metadata de Reddit)
function extractCommentMediaUrls(node) {
  const urls = [];
  const seen = new Set();
  const addUrl = (u) => {
    if (!u || typeof u !== 'string') return;
    const clean = u.replace(/&amp;/g, '&').trim();
    if (clean && !seen.has(clean)) {
      seen.add(clean);
      urls.push(clean);
    }
  };

  if (node && node.media_metadata && typeof node.media_metadata === 'object') {
    for (const meta of Object.values(node.media_metadata)) {
      if (!meta || meta.status === 'failed') continue;
      const src = meta.s || {};
      if (meta.e === 'AnimatedImage') {
        addUrl(src.gif || src.mp4 || src.u);
      } else if (src.u) {
        addUrl(src.u);
      } else if (meta.id && meta.m) {
        const ext = meta.m.includes('png') ? 'png'
          : meta.m.includes('gif') ? 'gif'
          : meta.m.includes('webp') ? 'webp'
          : 'jpg';
        addUrl(`https://i.redd.it/${meta.id}.${ext}`);
      }
    }
  }

  return urls;
}

// Recorrido recursivo del árbol de comentarios
function flattenCommentTree(nodes, depth = 0, postPermalink = '', liteMode = false) {
  const flattened = [];
  if (!Array.isArray(nodes)) return flattened;

  for (const item of nodes) {
    if (!item) continue;
    const node = item.data || item;
    if (!node || !node.id) continue;

    const dateObj = node.created_utc ? new Date(node.created_utc * 1000) : null;
    const dateArt = dateObj ? dateObj.toLocaleString('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    }) : '';

    const commentPermalink = node.permalink 
      ? (node.permalink.startsWith('http') ? node.permalink : `https://www.reddit.com${node.permalink}`)
      : (postPermalink ? `${postPermalink.replace(/\/$/, '')}/comment/${node.id}/` : '');

    const commentObj = {
      id: node.id,
      parent_id: node.parent_id || '',
      depth: depth,
      author: node.author || '[deleted]',
      score: typeof node.score === 'number' ? node.score : 0,
      created_utc: node.created_utc || 0,
      date_art: dateArt,
      permalink: commentPermalink
    };

    if (liteMode) {
      commentObj.lite = true;
    } else {
      commentObj.body = node.body || '';
      const mediaUrls = extractCommentMediaUrls(node);
      if (mediaUrls.length > 0) {
        commentObj.media_urls = mediaUrls;
      }
    }
    flattened.push(commentObj);

    if (node.replies) {
      let childNodes = [];
      if (Array.isArray(node.replies)) {
        childNodes = node.replies;
      } else if (node.replies.data && Array.isArray(node.replies.data.children)) {
        childNodes = node.replies.data.children;
      } else if (node.replies.data && Array.isArray(node.replies.data)) {
        childNodes = node.replies.data;
      }

      if (childNodes.length > 0) {
        const childComments = flattenCommentTree(childNodes, depth + 1, postPermalink, liteMode);
        flattened.push(...childComments);
      }
    }
  }

  return flattened;
}

// Obtiene en lote el selftext de posts antiguos que no traían el campo en el JSON de entrada
async function enrichMissingSelftext(postsData, processedMap) {
  const missing = postsData.filter(p => !processedMap.has(p.id) && typeof p.selftext === 'undefined');
  if (missing.length === 0) return;

  console.log(`[Texto de posts]: Enriqueciendo selftext de ${missing.length} publicaciones en lotes de 50...`);
  const byId = new Map(missing.map(p => [p.id, p]));
  const BATCH = 50;

  for (let i = 0; i < missing.length; i += BATCH) {
    const chunkIds = missing.slice(i, i + BATCH).map(p => p.id);
    const url = `https://arctic-shift.photon-reddit.com/api/posts/ids?ids=${chunkIds.join(',')}`;
    const json = await fetchWithRetry(url);
    if (json && Array.isArray(json.data)) {
      for (const raw of json.data) {
        const target = byId.get(raw.id);
        if (target) {
          target.selftext = raw.selftext || '';
          if (!target.url && raw.url) target.url = raw.url;
          if (!target.flair && raw.link_flair_text) target.flair = raw.link_flair_text;
        }
      }
    }
    const done = Math.min(i + BATCH, missing.length);
    console.log(`  Texto de posts obtenido: ${done}/${missing.length} (${((done / missing.length) * 100).toFixed(0)}%)`);
    await sleep(400);
  }
}

// Recorre un array JSON en streaming objeto por objeto (soporta archivos >512 MB sin RangeError)
function streamJsonArrayObjects(filePath, onObject) {
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath, { encoding: 'utf-8', highWaterMark: 256 * 1024 });
    let inString = false;
    let escapeNext = false;
    const stack = [];
    let capturing = false;
    let captureDepth = -1;
    let chunks = [];

    stream.on('data', chunk => {
      let sliceStart = capturing ? 0 : -1;
      for (let i = 0; i < chunk.length; i++) {
        const ch = chunk[i];
        if (escapeNext) { escapeNext = false; continue; }
        if (inString) {
          if (ch === '\\') escapeNext = true;
          else if (ch === '"') inString = false;
          continue;
        }
        if (ch === '"') {
          inString = true;
        } else if (ch === '{' || ch === '[') {
          stack.push(ch);
          if (!capturing && ch === '{' && stack.length === 2 && stack[0] === '[') {
            capturing = true;
            captureDepth = 2;
            chunks = [];
            sliceStart = i;
          }
        } else if (ch === '}' || ch === ']') {
          if (capturing && ch === '}' && stack.length === captureDepth) {
            chunks.push(chunk.slice(sliceStart, i + 1));
            try {
              onObject(JSON.parse(chunks.join('')));
            } catch (_) {}
            capturing = false;
            captureDepth = -1;
            chunks = [];
            sliceStart = -1;
          }
          stack.pop();
        }
      }
      if (capturing && sliceStart !== -1) {
        chunks.push(chunk.slice(sliceStart));
      }
    });

    stream.on('end', () => resolve());
    stream.on('error', err => reject(err));
  });
}

// Migra un checkpoint heredado .json (potencialmente >400 MB) al nuevo formato append-only .jsonl
async function migrateLegacyCheckpoint(legacyFile, jsonlFile) {
  console.log(`\n[Migración automática]: Convirtiendo checkpoint legado "${legacyFile}" a formato streaming (.jsonl)...`);
  const ws = fs.createWriteStream(jsonlFile, { flags: 'a', encoding: 'utf-8' });
  let migrated = 0;
  await streamJsonArrayObjects(legacyFile, item => {
    if (item && item.post_id) {
      ws.write(JSON.stringify(item) + '\n');
      migrated++;
    }
  });
  await new Promise(resolve => ws.end(resolve));
  try { fs.unlinkSync(legacyFile); } catch (_) {}
  console.log(`[Migración completa]: ${migrated.toLocaleString()} publicaciones preservadas sin pérdida.`);
}

// Carga los IDs ya procesados desde el checkpoint .jsonl línea por línea (uso mínimo de RAM)
async function loadJsonlCheckpointIds(jsonlFile) {
  const processedIds = new Set();
  let totalCommentsCount = 0;
  if (!fs.existsSync(jsonlFile)) return { processedIds, totalCommentsCount };

  const rl = readline.createInterface({
    input: fs.createReadStream(jsonlFile, { encoding: 'utf-8' }),
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const obj = JSON.parse(trimmed);
      if (obj && obj.post_id && !processedIds.has(obj.post_id)) {
        processedIds.add(obj.post_id);
        totalCommentsCount += obj.comments_obtenidos || (Array.isArray(obj.comments) ? obj.comments.length : 0);
      }
    } catch (_) {
      // Ignorar última línea truncada si hubo un corte brusco de energía
    }
  }
  return { processedIds, totalCommentsCount };
}

// Convierte el checkpoint .jsonl en el archivo JSON array final mediante streaming (sin límite de 512 MB ni RAM)
async function convertJsonlToJsonArrayStream(jsonlFile, outputFile) {
  const ws = fs.createWriteStream(outputFile, { encoding: 'utf-8' });
  ws.write('[\n');

  const rl = readline.createInterface({
    input: fs.createReadStream(jsonlFile, { encoding: 'utf-8' }),
    crlfDelay: Infinity
  });

  const seenIds = new Set();
  let written = 0;

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let postId = null;
    try {
      const obj = JSON.parse(trimmed);
      postId = obj && obj.post_id;
    } catch (_) {
      continue;
    }
    if (!postId || seenIds.has(postId)) continue;
    seenIds.add(postId);

    const prefix = written === 0 ? '  ' : ',\n  ';
    if (!ws.write(prefix + trimmed)) {
      await new Promise(resolve => ws.once('drain', resolve));
    }
    written++;
  }

  ws.write('\n]\n');
  await new Promise(resolve => ws.end(resolve));
  return written;
}

async function main() {
  const cliArgs = parseArgs();

  if (cliArgs.help) {
    showHelp();
    process.exit(0);
  }

  let inputFile = cliArgs.input;
  let outputFile = cliArgs.out;
  let limit = cliArgs.limit ? parseInt(cliArgs.limit, 10) : 0;
  let liteMode = Boolean(cliArgs.lite || cliArgs['solo-interacciones']);
  let concurrency = parseInt(cliArgs.concurrency || cliArgs.c || DEFAULT_CONCURRENCY, 10);

  if (isNaN(concurrency) || concurrency < 1) concurrency = DEFAULT_CONCURRENCY;
  if (concurrency > MAX_CONCURRENCY) {
    console.warn(`[Aviso]: Concurrencia de ${concurrency} limitada a ${MAX_CONCURRENCY} para evitar rate-limits de Arctic Shift.`);
    concurrency = MAX_CONCURRENCY;
  }

  // Modo interactivo si no se pasó --input
  if (!inputFile) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log('========================================================');
    console.log('  Scraper Concurrente de Comentarios de Reddit (Paralelo)');
    console.log('========================================================\n');

    const currentFiles = discoverPostJsonFiles();

    if (currentFiles.length === 0) {
      console.log('No se encontraron archivos .json de publicaciones en el directorio actual ni en resultados/.');
      inputFile = await askValidated(
        rl,
        'Ingresá la ruta del archivo JSON con los posteos',
        '',
        (v) => (v && fs.existsSync(v) ? v : null),
        'El archivo indicado no existe. Verificá la ruta.'
      );
    } else {
      console.log('Archivos de posteos disponibles detectados:');
      currentFiles.forEach((f, idx) => {
        console.log(`  ${idx + 1}) ${f}`);
      });
      inputFile = await askValidated(
        rl,
        `Elegí un archivo [1-${currentFiles.length}] o escribí la ruta`,
        '1',
        (v) => {
          if (/^\d+$/.test(v)) {
            const idx = parseInt(v, 10) - 1;
            return currentFiles[idx] || null;
          }
          return fs.existsSync(v) ? v : null;
        },
        `Elegí un número entre 1 y ${currentFiles.length} o una ruta existente.`
      );
    }

    concurrency = await askValidated(
      rl,
      `Hilos de consulta en paralelo [1-${MAX_CONCURRENCY}]`,
      String(DEFAULT_CONCURRENCY),
      (v) => (/^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= MAX_CONCURRENCY ? Number(v) : null),
      `Ingresá un número entero entre 1 y ${MAX_CONCURRENCY}.`
    );
    liteMode = await askValidated(
      rl,
      '¿Modo ligero (solo interacciones sin texto, ahorra ~70% de espacio)? [s/N]',
      'N',
      (v) => {
        const n = v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (['s', 'si', 'y', 'yes'].includes(n)) return true;
        if (['n', 'no'].includes(n)) return false;
        return null;
      },
      'Ingresá S (sí) o N (no).'
    );
    rl.close();
  }

  if (!fs.existsSync(inputFile)) {
    console.error(`Error: No se encontró el archivo de entrada "${inputFile}".`);
    process.exit(1);
  }

  let postsData = [];
  try {
    const fSize = fs.statSync(inputFile).size;
    if (fSize >= 250 * 1024 * 1024) {
      console.log(`Leyendo archivo de entrada grande en streaming (${(fSize / (1024 * 1024)).toFixed(1)} MB)...`);
      await streamJsonArrayObjects(inputFile, obj => postsData.push(obj));
    } else {
      const raw = fs.readFileSync(inputFile, 'utf-8');
      postsData = JSON.parse(raw);
    }
    if (!Array.isArray(postsData)) {
      throw new Error('El JSON no contiene un array de publicaciones.');
    }
  } catch (err) {
    console.error(`Error al leer "${inputFile}": ${err.message}`);
    process.exit(1);
  }

  if (limit > 0 && limit < postsData.length) {
    console.log(`Límite activado: se procesarán solo las primeras ${limit} publicaciones.`);
    postsData = postsData.slice(0, limit);
  }

  const parsedPath = path.parse(inputFile);
  const baseName = parsedPath.name;
  const inputDir = parsedPath.dir || '.';
  if (!outputFile) {
    outputFile = path.join(inputDir, `${baseName}_comentarios.json`);
  }

  // Checkpoint append-only en formato JSONL (O(1) por post, soporta millones de comentarios sin límite de 512 MB)
  const legacyCheckpointFile = path.join(inputDir, `.${baseName}_comentarios_checkpoint.json`);
  const checkpointFile = path.join(inputDir, `.${baseName}_comentarios_checkpoint.jsonl`);

  if (fs.existsSync(legacyCheckpointFile)) {
    await migrateLegacyCheckpoint(legacyCheckpointFile, checkpointFile);
  }

  const loadedCp = await loadJsonlCheckpointIds(checkpointFile);
  const processedIds = loadedCp.processedIds;
  let totalCommentsCount = loadedCp.totalCommentsCount;

  if (processedIds.size > 0) {
    console.log(`\n[Checkpoint detectado]: Se reanudan ${processedIds.size.toLocaleString()} publicaciones ya procesadas previamente (${totalCommentsCount.toLocaleString()} comentarios).`);
  }

  // Stream de escritura incremental (append-only) para el checkpoint .jsonl
  const cpFd = fs.openSync(checkpointFile, 'a');
  let stopping = false;

  function appendCheckpointItem(item) {
    fs.writeSync(cpFd, JSON.stringify(item) + '\n', null, 'utf-8');
    processedIds.add(item.post_id);
  }

  // Manejador de salida limpia con Ctrl+C (todo lo procesado ya está persistido línea a línea)
  const handleExit = () => {
    if (stopping) return;
    stopping = true;
    try { fs.closeSync(cpFd); } catch (_) {}
    console.log(`\n[Pausa]: Progreso guardado en "${checkpointFile}" (${processedIds.size.toLocaleString()}/${postsData.length.toLocaleString()} posts). Podés reanudar en cualquier momento.`);
    process.exit(0);
  };
  process.on('SIGINT', handleExit);
  process.on('SIGTERM', handleExit);

  console.log('\n========================================================');
  console.log(`Archivo de entrada: ${inputFile}`);
  console.log(`Publicaciones a procesar: ${postsData.length.toLocaleString()} (${processedIds.size.toLocaleString()} ya en checkpoint)`);
  console.log(`Hilos concurrentes (Workers): ${concurrency}`);
  console.log(`Modo de extracción: ${liteMode ? 'LIGERO (solo interacciones sin body; el visor carga texto online a demanda)' : 'COMPLETO (con texto y media_urls)'}`);
  console.log(`Checkpoint streaming: ${checkpointFile}`);
  console.log(`Archivo de salida: ${outputFile}`);
  console.log('========================================================\n');

  // Asegurar que todos los posts pendientes tengan su selftext (cuerpo de texto)
  await enrichMissingSelftext(postsData, processedIds);

  let nextIndex = 0;

  // Función que ejecuta cada Worker en paralelo
  async function worker(workerId) {
    while (!stopping) {
      const i = nextIndex++;
      if (i >= postsData.length) break;

      const post = postsData[i];
      const indexStr = `[${i + 1}/${postsData.length}]`;
      const pct = (((i + 1) / postsData.length) * 100).toFixed(1);

      // Si ya está en el checkpoint, saltear de inmediato
      if (processedIds.has(post.id)) {
        continue;
      }

      const declaredComments = post.num_comments || 0;
      const postTitle = (post.title || '').replace(/[\r\n]+/g, ' ').substring(0, 50);

      // Si no tiene comentarios declarados, saltear consulta HTTP
      if (declaredComments === 0) {
        const item = {
          post_id: post.id,
          post_title: post.title || '',
          post_selftext: post.selftext || '',
          post_permalink: post.permalink || `https://www.reddit.com/comments/${post.id}/`,
          post_url: post.url || '',
          post_date_utc: post.created_utc || 0,
          post_date_art: post.date_art || '',
          post_author: post.author || '',
          post_score: typeof post.score === 'number' ? post.score : 0,
          post_flair: post.flair || '',
          num_comments_declarados: 0,
          comments_obtenidos: 0,
          comments: []
        };
        appendCheckpointItem(item);
        console.log(`${indexStr} (${pct}%) [Hilo ${workerId}] Post ${post.id}: 0 comentarios declarados. Salteando llamada.`);
        continue;
      }

      // Consulta HTTP al árbol de comentarios
      const url = `https://arctic-shift.photon-reddit.com/api/comments/tree?link_id=t3_${post.id}`;

      const json = await fetchWithRetry(url);
      if (stopping) break;
      const treeData = (json && Array.isArray(json.data)) ? json.data : [];
      const flattenedComments = flattenCommentTree(treeData, 0, post.permalink, liteMode);

      const item = {
        post_id: post.id,
        post_title: post.title || '',
        post_selftext: post.selftext || '',
        post_permalink: post.permalink || `https://www.reddit.com/comments/${post.id}/`,
        post_url: post.url || '',
        post_date_utc: post.created_utc || 0,
        post_date_art: post.date_art || '',
        post_author: post.author || '',
        post_score: typeof post.score === 'number' ? post.score : 0,
        post_flair: post.flair || '',
        num_comments_declarados: declaredComments,
        comments_obtenidos: flattenedComments.length,
        comments: flattenedComments
      };

      appendCheckpointItem(item);
      totalCommentsCount += flattenedComments.length;

      console.log(`${indexStr} (${pct}%) [Hilo ${workerId}] Post ${post.id}: ${flattenedComments.length} comentarios obtenidos (declarados: ${declaredComments}) - "${postTitle}..."`);

      // Pausa prudente por hilo para evitar saturación agregada
      await sleep(PER_WORKER_DELAY_MS);
    }
  }

  const startTime = Date.now();

  // Iniciar el pool de workers en paralelo
  const workerPromises = [];
  for (let w = 1; w <= concurrency; w++) {
    workerPromises.push(worker(w));
  }
  await Promise.all(workerPromises);

  try { fs.closeSync(cpFd); } catch (_) {}
  if (stopping) return;

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n--- Generando archivo JSON final en streaming desde checkpoint (.jsonl)... ---');
  const totalWritten = await convertJsonlToJsonArrayStream(checkpointFile, outputFile);

  // Limpiar checkpoint si completó al 100%
  if (fs.existsSync(checkpointFile) && totalWritten >= postsData.length) {
    fs.unlinkSync(checkpointFile);
  }

  console.log('\n========================================================');
  console.log('       EXTRACCIÓN EN PARALELO COMPLETADA CON ÉXITO      ');
  console.log('========================================================');
  console.log(`Publicaciones procesadas:       ${totalWritten.toLocaleString()}`);
  console.log(`Total comentarios extraídos:    ${totalCommentsCount.toLocaleString()}`);
  console.log(`Hilos concurrentes utilizados:  ${concurrency}`);
  console.log(`Tiempo total de ejecución:      ${durationSec} segundos`);
  console.log(`Archivo generado:               ${outputFile}`);
  console.log('========================================================\n');
}

main().catch(err => {
  console.error('\nError fatal:', err);
  process.exit(1);
});
