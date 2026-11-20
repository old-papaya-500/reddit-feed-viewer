#!/usr/bin/env node
// scrapear_comentarios.js - Extractor de Árbol Completo de Comentarios de Reddit
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const USER_AGENT = 'reddit-comment-researcher/1.0 (pure nodejs)';
const BASE_DELAY_MS = 1800; // Respetar rate limits de Arctic Shift

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Parseador de argumentos de línea de comandos (--clave valor)
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
  --input <archivo>   Ruta al archivo JSON de publicaciones a procesar (ej: argentina_2026_01.json)
  --out <archivo>     Ruta o nombre del archivo JSON de salida (por defecto: <archivo>_comentarios.json)
  --limit <num>       Límite opcional de publicaciones a procesar (ideal para pruebas rápidas)
  --help, -h          Muestra este mensaje de ayuda
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

// Pregunta interactiva por consola
function ask(rl, promptText, defaultValue = '') {
  return new Promise(resolve => {
    const prompt = defaultValue ? `${promptText} [por defecto: ${defaultValue}]: ` : `${promptText}: `;
    rl.question(prompt, answer => {
      resolve(answer.trim() || defaultValue);
    });
  });
}

// Petición HTTP con reintentos y backoff exponencial ante 422, 429 o 5xx
async function fetchWithRetry(url, maxRetries = 10) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
      if (res.status === 200) {
        return await res.json();
      }
      if (res.status === 404) {
        // Post no encontrado o sin datos en el archivo
        return { data: [] };
      }
      if (res.status === 422 || res.status === 429 || res.status >= 500) {
        const wait = Math.min(attempt * 8, 60);
        console.warn(`  [HTTP ${res.status}] Enfriando y reintentando en ${wait}s (intento ${attempt}/${maxRetries})...`);
        await sleep(wait * 1000);
        continue;
      }
      console.warn(`  [HTTP ${res.status}] Error no recuperable al consultar ${url}`);
      return null;
    } catch (err) {
      const wait = Math.min(attempt * 8, 60);
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
function flattenCommentTree(nodes, depth = 0, postPermalink = '') {
  const flattened = [];
  if (!Array.isArray(nodes)) return flattened;

  for (const item of nodes) {
    if (!item) continue;
    // En la API de Reddit/Arctic Shift, los nodos pueden venir directamente o envueltos en item.data
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

    const mediaUrls = extractCommentMediaUrls(node);
    const commentObj = {
      id: node.id,
      parent_id: node.parent_id || '',
      depth: depth,
      author: node.author || '[deleted]',
      score: typeof node.score === 'number' ? node.score : 0,
      created_utc: node.created_utc || 0,
      date_art: dateArt,
      body: node.body || '',
      permalink: commentPermalink
    };
    if (mediaUrls.length > 0) {
      commentObj.media_urls = mediaUrls;
    }
    flattened.push(commentObj);

    // Procesar respuestas anidadas (replies)
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
        const childComments = flattenCommentTree(childNodes, depth + 1, postPermalink);
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

// Escritura en streaming de un array JSON para soportar archivos >512 MB sin RangeError
async function writeJsonArrayStream(filePath, items) {
  const ws = fs.createWriteStream(filePath, { encoding: 'utf-8' });
  ws.write('[\n');
  for (let i = 0; i < items.length; i++) {
    const isLast = i === items.length - 1;
    const ok = ws.write('  ' + JSON.stringify(items[i]) + (isLast ? '\n' : ',\n'));
    if (!ok) await new Promise(resolve => ws.once('drain', resolve));
  }
  ws.write(']\n');
  await new Promise(resolve => ws.end(resolve));
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

  // Si no se pasó --input, ejecutar modo interactivo
  if (!inputFile) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log('========================================================');
    console.log('       Scraper de Árbol de Comentarios de Reddit        ');
    console.log('========================================================\n');

    // Buscar archivos JSON existentes en el directorio actual y en resultados/
    const currentFiles = discoverPostJsonFiles();

    if (currentFiles.length === 0) {
      console.log('No se encontraron archivos .json de publicaciones en el directorio actual.');
      inputFile = await ask(rl, 'Ingresá la ruta del archivo JSON con los posteos');
    } else {
      console.log('Archivos de posteos disponibles detectados:');
      currentFiles.forEach((f, idx) => {
        console.log(`  ${idx + 1}) ${f}`);
      });
      const seleccion = await ask(rl, `Elegí un archivo [1-${currentFiles.length}] o escribí la ruta`, '1');
      const idx = parseInt(seleccion, 10) - 1;
      if (!isNaN(idx) && currentFiles[idx]) {
        inputFile = currentFiles[idx];
      } else {
        inputFile = seleccion;
      }
    }
    rl.close();
  }

  if (!fs.existsSync(inputFile)) {
    console.error(`Error: No se encontró el archivo de entrada "${inputFile}".`);
    process.exit(1);
  }

  // Leer y validar archivo de posts
  let postsData;
  try {
    const raw = fs.readFileSync(inputFile, 'utf-8');
    postsData = JSON.parse(raw);
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

  // Nombre de salida y checkpoint dentro de la misma carpeta del archivo de entrada
  const parsedPath = path.parse(inputFile);
  const baseName = parsedPath.name;
  const inputDir = parsedPath.dir || '.';
  if (!outputFile) {
    outputFile = path.join(inputDir, `${baseName}_comentarios.json`);
  }

  const checkpointFile = path.join(inputDir, `.${baseName}_comentarios_checkpoint.json`);

  // Cargar checkpoint si existe
  let processedMap = new Map();
  if (fs.existsSync(checkpointFile)) {
    try {
      const cpRaw = fs.readFileSync(checkpointFile, 'utf-8');
      const cpList = JSON.parse(cpRaw);
      if (Array.isArray(cpList)) {
        for (const item of cpList) {
          processedMap.set(item.post_id, item);
        }
        console.log(`\n[Checkpoint detectado]: Se reanudan ${processedMap.size} publicaciones ya procesadas previamente.`);
      }
    } catch (e) {
      console.warn(`Aviso: No se pudo leer el checkpoint anterior (${e.message}). Comenzando desde cero.`);
    }
  }

  // Manejo de interrupción (Ctrl+C) para guardar checkpoint antes de salir
  const handleExit = () => {
    if (processedMap.size > 0 && processedMap.size < postsData.length) {
      fs.writeFileSync(checkpointFile, JSON.stringify(Array.from(processedMap.values()), null, 2), 'utf-8');
      console.log(`\n[Pausa]: Progreso guardado en "${checkpointFile}" (${processedMap.size}/${postsData.length} posts). Podés reanudar en cualquier momento.`);
    }
    process.exit(0);
  };
  process.on('SIGINT', handleExit);
  process.on('SIGTERM', handleExit);

  console.log('\n========================================================');
  console.log(`Archivo de entrada: ${inputFile}`);
  console.log(`Total de publicaciones a evaluar: ${postsData.length}`);
  console.log(`Archivo de salida: ${outputFile}`);
  console.log('========================================================\n');

  // Asegurar que todos los posts pendientes tengan su selftext (cuerpo de texto)
  await enrichMissingSelftext(postsData, processedMap);

  let processedCount = processedMap.size;
  let totalCommentsCount = 0;
  for (const item of processedMap.values()) {
    totalCommentsCount += item.comments ? item.comments.length : 0;
  }

  const results = [];
  let callsMade = 0;

  for (let i = 0; i < postsData.length; i++) {
    const post = postsData[i];
    const indexStr = `[${i + 1}/${postsData.length}]`;
    const pct = (( (i + 1) / postsData.length ) * 100).toFixed(1);

    // Si ya fue procesado en el checkpoint, reutilizar
    if (processedMap.has(post.id)) {
      results.push(processedMap.get(post.id));
      continue;
    }

    const declaredComments = post.num_comments || 0;
    const postTitle = (post.title || '').replace(/[\r\n]+/g, ' ').substring(0, 60);

    // Caso 1: El post no tiene comentarios declarados
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
      processedMap.set(post.id, item);
      results.push(item);
      processedCount++;
      console.log(`${indexStr} (${pct}%) Post ${post.id}: 0 comentarios declarados. Salteando llamada HTTP.`);
      continue;
    }

    // Caso 2: El post tiene comentarios -> Consultar árbol en Arctic Shift
    const url = `https://arctic-shift.photon-reddit.com/api/comments/tree?link_id=t3_${post.id}`;
    callsMade++;

    const json = await fetchWithRetry(url);
    const treeData = (json && Array.isArray(json.data)) ? json.data : [];
    const flattenedComments = flattenCommentTree(treeData, 0, post.permalink);

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

    processedMap.set(post.id, item);
    results.push(item);
    processedCount++;
    totalCommentsCount += flattenedComments.length;

    console.log(`${indexStr} (${pct}%) Post ${post.id}: ${flattenedComments.length} comentarios obtenidos (declarados: ${declaredComments}) - "${postTitle}..."`);

    // Guardar checkpoint cada 5 posts consultados
    if (callsMade % 5 === 0) {
      fs.writeFileSync(checkpointFile, JSON.stringify(Array.from(processedMap.values()), null, 2), 'utf-8');
    }

    // Pausa preventiva para respetar rate limits de Arctic Shift
    await sleep(BASE_DELAY_MS);
  }

  // Guardar archivo final mediante streaming
  await writeJsonArrayStream(outputFile, results);

  // Limpiar checkpoint si completó exitosamente
  if (fs.existsSync(checkpointFile) && results.length === postsData.length) {
    fs.unlinkSync(checkpointFile);
  }

  console.log('\n========================================================');
  console.log('EXTRACCIÓN COMPLETADA CON ÉXITO');
  console.log(`Publicaciones procesadas: ${results.length}`);
  console.log(`Total comentarios extraídos: ${totalCommentsCount}`);
  console.log(`Archivo generado: ${outputFile}`);
  console.log('========================================================\n');
}

main().catch(err => {
  console.error('\nError fatal:', err);
  process.exit(1);
});
