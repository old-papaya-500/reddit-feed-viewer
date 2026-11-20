#!/usr/bin/env node
// consolidar_perfiles.js - Protocolo de Consolidación de Perfiles de Usuario e Historial Cronológico
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ART_OFFSET_HOURS = -3; // UTC-3

function parseArtToUnix(dateStr, isEndOfDay = false) {
  const parts = dateStr.trim().split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parts[2] ? parseInt(parts[2], 10) : (isEndOfDay ? new Date(year, month + 1, 0).getDate() : 1);

  const hours = isEndOfDay ? 23 : 0;
  const minutes = isEndOfDay ? 59 : 0;
  const seconds = isEndOfDay ? 59 : 0;

  const utcDate = new Date(Date.UTC(year, month, day, hours - ART_OFFSET_HOURS, minutes, seconds));
  return Math.floor(utcDate.getTime() / 1000);
}

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
Uso de consolidar_perfiles.js:

  1) Modo Interactivo (sin argumentos):
     node consolidar_perfiles.js

  2) Modo con Argumentos (CLI):
     node consolidar_perfiles.js [opciones]

Opciones:
  --input <archivos>    Lista de archivos JSON separados por coma o patrón (por defecto: escanea directorio actual)
  --desde <YYYY-MM-DD>  Filtro temporal inicial (00:00:00 ART)
  --hasta <YYYY-MM-DD>  Filtro temporal final (23:59:59 ART)
  --anio <YYYY>         Filtra todo un año específico
  --mes <1-12>          Filtra un mes específico (requiere --anio)
  --min <num>           Mínimo de actividades para incluir un usuario (por defecto: 1)
  --out <archivo>       Nombre del JSON de salida (por defecto: perfiles_usuarios.json)
  --help, -h            Muestra este mensaje de ayuda
`);
}

function ask(rl, promptText, defaultValue = '') {
  return new Promise(resolve => {
    const prompt = defaultValue ? `${promptText} [por defecto: ${defaultValue}]: ` : `${promptText}: `;
    rl.question(prompt, answer => {
      resolve(answer.trim() || defaultValue);
    });
  });
}

// Extrae el nombre del subreddit de un post/comentario o su permalink
function extractSubreddit(item, filePath = '') {
  if (item.subreddit) return item.subreddit.replace(/^r\//i, '');
  const permalink = item.permalink || item.post_permalink || '';
  const match = permalink.match(/\/r\/([a-zA-Z0-9_]+)/i);
  if (match) return match[1];
  if (filePath) {
    const fileBase = path.basename(filePath);
    const m = fileBase.match(/^([a-zA-Z0-9_]+?)_/);
    if (m) return m[1];
  }
  return '';
}

// Lector JSON en streaming para archivos que superan el límite de 512 MB de string en V8
function readJsonArrayStream(filePath) {
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath, { encoding: 'utf-8', highWaterMark: 256 * 1024 });
    const items = [];
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
            items.push(JSON.parse(chunks.join('')));
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

    stream.on('end', () => resolve(items));
    stream.on('error', err => reject(err));
  });
}

function getArtTimestampSlug() {
  const art = new Date(Date.now() + ART_OFFSET_HOURS * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${art.getUTCFullYear()}${p(art.getUTCMonth() + 1)}${p(art.getUTCDate())}_${p(art.getUTCHours())}${p(art.getUTCMinutes())}${p(art.getUTCSeconds())}`;
}

function createUniqueConsolidationDir() {
  const baseRoot = path.join('resultados', 'consolidados');
  const slug = getArtTimestampSlug();
  let candidate = path.join(baseRoot, `perfiles_${slug}`);
  let suffix = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(baseRoot, `perfiles_${slug}_${suffix++}`);
  }
  fs.mkdirSync(candidate, { recursive: true });
  return candidate;
}

// Escanea recursivamente archivos JSON excluyendo checkpoints, backups o resultados previos de consolidación
function findJsonFiles(dir, maxDepth = 4, currentDepth = 0) {
  let results = [];
  if (currentDepth > maxDepth) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' &&
          entry.name !== '.git' &&
          entry.name !== 'consolidados' &&
          entry.name !== 'backups' &&
          entry.name !== 'viewer' &&
          !entry.name.startsWith('.')) {
        results = results.concat(findJsonFiles(fullPath, maxDepth, currentDepth + 1));
      }
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      if (!entry.name.startsWith('.') &&
          !entry.name.includes('checkpoint') &&
          !entry.name.includes('perfiles_usuarios') &&
          !entry.name.includes('resumen_descargas')) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

async function main() {
  const cliArgs = parseArgs();

  if (cliArgs.help) {
    showHelp();
    process.exit(0);
  }

  let startUnix = 0;
  let endUnix = Infinity;
  let minActividades = cliArgs.min ? parseInt(cliArgs.min, 10) : 1;
  let outputFile = cliArgs.out || '';
  let targetFiles = [];

  // Parseo de fechas si se especificaron
  if (cliArgs.desde && cliArgs.hasta) {
    startUnix = parseArtToUnix(cliArgs.desde, false);
    endUnix = parseArtToUnix(cliArgs.hasta, true);
  } else if (cliArgs.anio && cliArgs.mes) {
    const mesStr = String(cliArgs.mes).padStart(2, '0');
    startUnix = parseArtToUnix(`${cliArgs.anio}-${mesStr}-01`, false);
    endUnix = parseArtToUnix(`${cliArgs.anio}-${mesStr}`, true);
  } else if (cliArgs.anio) {
    startUnix = parseArtToUnix(`${cliArgs.anio}-01-01`, false);
    endUnix = parseArtToUnix(`${cliArgs.anio}-12-31`, true);
  }

  if (cliArgs.input) {
    targetFiles = cliArgs.input.split(',').map(s => s.trim()).filter(Boolean);
  } else if (process.argv.length <= 2) {
    // Modo interactivo
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log('========================================================');
    console.log('  Consolidador de Perfiles de Usuario y Líneas de Tiempo');
    console.log('========================================================\n');

    const discovered = findJsonFiles('.');
    console.log(`Se detectaron ${discovered.length} archivos de datos disponibles:`);
    discovered.forEach((f, i) => console.log(`  ${i + 1}) ${f}`));

    console.log('\n¿Cómo deseas procesar los archivos?');
    console.log('  1) Todos los archivos detectados (consolidación total)');
    console.log('  2) Seleccionar archivos específicos');
    const opc = await ask(rl, 'Opción [1-2]', '1');

    if (opc === '2') {
      const elegidos = await ask(rl, 'Ingresá los números separados por coma (ej: 1,3)');
      const indices = elegidos.split(',').map(s => parseInt(s.trim(), 10) - 1);
      targetFiles = indices.map(idx => discovered[idx]).filter(Boolean);
    } else {
      targetFiles = discovered;
    }

    const filtrarFecha = await ask(rl, '¿Filtrar por año/mes específico? [s/N]', 'N');
    if (filtrarFecha.toLowerCase() === 's') {
      const anio = await ask(rl, 'Año (YYYY)', '2026');
      const mes = await ask(rl, 'Mes (1-12 o dejar vacío para todo el año)', '1');
      if (mes) {
        const mesStr = String(mes).padStart(2, '0');
        startUnix = parseArtToUnix(`${anio}-${mesStr}-01`, false);
        endUnix = parseArtToUnix(`${anio}-${mesStr}`, true);
      } else {
        startUnix = parseArtToUnix(`${anio}-01-01`, false);
        endUnix = parseArtToUnix(`${anio}-12-31`, true);
      }
    }

    rl.close();
  } else {
    targetFiles = findJsonFiles('.');
  }

  console.log('\n========================================================');
  console.log(`Archivos a consolidar: ${targetFiles.length}`);
  if (startUnix > 0 || endUnix < Infinity) {
    console.log(`Filtro temporal activo: Desde ${startUnix} hasta ${endUnix}`);
  }
  console.log('========================================================\n');

  const seenPostIds = new Set();
  const postRecordById = new Map(); // postId -> referencia al objeto post para fusionar metadatos (selftext, media_files, etc.)
  const seenCommentIds = new Set();
  const commentRecordById = new Map(); // commentId -> referencia al objeto comentario para fusionar media_files
  const pendingCommentMedia = new Map(); // commentId -> media_files[] si media_comments.json se leyó antes
  const userMap = new Map(); // autor -> { usuario, posts: [], comentarios: [] }
  const anonBucket = { posts: [], comentarios: [], subreddits: new Set(), flairs: new Set() };
  let anonPostsCount = 0;
  let anonCommentsCount = 0;

  function normalizeMediaRef(relPath, baseDir) {
    if (!relPath) return null;
    const cleanRel = String(relPath).replace(/\\/g, '/').replace(/^\.\//, '');
    if (!baseDir) return cleanRel;
    const cleanBase = String(baseDir).replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '');
    if (!cleanBase || cleanBase === '.' || cleanRel.startsWith(cleanBase + '/')) return cleanRel;
    return `${cleanBase}/${cleanRel}`;
  }

  function getUserBucket(author) {
    if (!author || author === '[deleted]' || author === '[removed]') return null;
    if (!userMap.has(author)) {
      userMap.set(author, {
        usuario: author,
        posts: [],
        comentarios: [],
        subreddits: new Set(),
        flairs: new Set()
      });
    }
    return userMap.get(author);
  }

  // Ingesta de archivos
  for (const filePath of targetFiles) {
    if (!fs.existsSync(filePath)) continue;
    let data;
    try {
      const fSize = fs.statSync(filePath).size;
      if (fSize >= 300 * 1024 * 1024) {
        console.log(`Leyendo archivo grande en streaming (${(fSize / (1024 * 1024)).toFixed(1)} MB): ${filePath}...`);
        data = await readJsonArrayStream(filePath);
      } else {
        data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      }
    } catch (e) {
      console.warn(`Aviso: Error al parsear "${filePath}" (${e.message}). Salteando.`);
      continue;
    }

    if (!Array.isArray(data)) continue;

    console.log(`Procesando: ${filePath} (${data.length} registros)...`);
    const fileDirNorm = path.dirname(filePath).replace(/\\/g, '/');

    for (const item of data) {
      // 0. Manifiesto opcional de imágenes/GIFs en comentarios (descargar_media_comments.js -> media_comments.json)
      if (item && item.tipo === 'comment_media' && item.comment_id && Array.isArray(item.media_files) && item.media_files.length > 0) {
        const cBaseDir = item.media_base_dir || fileDirNorm;
        const normFiles = item.media_files.map(mf => ({
          ...mf,
          local_path: normalizeMediaRef(mf.local_path, cBaseDir)
        }));
        const existingComm = commentRecordById.get(item.comment_id);
        if (existingComm) {
          existingComm.media_files = normFiles;
        } else {
          pendingCommentMedia.set(item.comment_id, normFiles);
        }
        continue;
      }

      // 1. Extraer o enriquecer Post si existe (soporta posts.json, _comentarios.json y master.json)
      const postId = item.id || item.post_id;
      const postTitle = item.title || item.post_title || '';
      const createdUtc = item.created_utc || item.post_date_utc || 0;
      const author = item.author || item.post_author;
      const withinDate = (!createdUtc || (createdUtc >= startUnix && createdUtc <= endUnix));

      const incomingBody = item.selftext || item.post_selftext || item.cuerpo || '';
      const incomingScore = typeof item.score === 'number'
        ? item.score
        : (typeof item.post_score === 'number' ? item.post_score : 0);
      const incomingFlair = item.flair || item.post_flair || '';
      const incomingUrl = item.url || item.original_url || item.post_url || '';
      const incomingNumComments = item.num_comments || item.comments_count || item.num_comments_declarados || 0;
      const mediaBaseDir = item.media_base_dir || (Array.isArray(item.media_files) || item.text_file_path ? fileDirNorm : '');
      const incomingTextFile = item.text_file_path ? normalizeMediaRef(item.text_file_path, mediaBaseDir) : null;
      const incomingMediaFiles = Array.isArray(item.media_files) && item.media_files.length > 0
        ? item.media_files.map(mf => ({
            ...mf,
            local_path: normalizeMediaRef(mf.local_path, mediaBaseDir)
          }))
        : null;

      if (postId && withinDate && postTitle) {
        if (!seenPostIds.has(postId)) {
          seenPostIds.add(postId);
          const bucket = getUserBucket(author);
          const targetBucket = bucket || anonBucket;
          const postSub = extractSubreddit(item, filePath);
          if (postSub) targetBucket.subreddits.add(postSub);

          const postObj = {
            tipo: 'post',
            id: postId,
            subreddit: postSub,
            created_utc: createdUtc,
            date_art: item.date_art || item.post_date_art || '',
            score: incomingScore,
            titulo: postTitle,
            cuerpo: incomingBody,
            flair: incomingFlair,
            permalink: item.permalink || item.post_permalink || '',
            url: incomingUrl,
            num_comments: incomingNumComments
          };
          if (item.post_type) postObj.post_type = item.post_type;
          if (incomingTextFile) postObj.text_file_path = incomingTextFile;
          if (incomingMediaFiles) postObj.media_files = incomingMediaFiles;
          if (!bucket) {
            postObj.autor_eliminado = true;
            anonPostsCount++;
          }

          targetBucket.posts.push(postObj);
          postRecordById.set(postId, postObj);
          if (incomingFlair) targetBucket.flairs.add(incomingFlair);
        } else {
          // Fusión/Enriquecimiento: completar cuerpo, tipo de post y archivos multimedia desde _comentarios.json o master.json
          const existing = postRecordById.get(postId);
          if (existing) {
            if (!existing.cuerpo && incomingBody) existing.cuerpo = incomingBody;
            if (!existing.url && incomingUrl) existing.url = incomingUrl;
            if (!existing.flair && incomingFlair) existing.flair = incomingFlair;
            if (!existing.created_utc && createdUtc) existing.created_utc = createdUtc;
            if (!existing.date_art && (item.date_art || item.post_date_art)) {
              existing.date_art = item.date_art || item.post_date_art;
            }
            if (incomingNumComments > (existing.num_comments || 0)) {
              existing.num_comments = incomingNumComments;
            }
            if (!existing.post_type && item.post_type) existing.post_type = item.post_type;
            if (!existing.text_file_path && incomingTextFile) existing.text_file_path = incomingTextFile;
            if ((!existing.media_files || existing.media_files.length === 0) && incomingMediaFiles) {
              existing.media_files = incomingMediaFiles;
            }
          }
        }
      }

      // 2. Extraer Comentarios si contiene lista de comentarios
      const commentsList = item.comments;
      if (Array.isArray(commentsList)) {
        for (const c of commentsList) {
          if (!c || !c.id) continue;
          const cTime = c.created_utc;
          if (cTime && (cTime < startUnix || cTime > endUnix)) continue;

          if (!seenCommentIds.has(c.id)) {
            seenCommentIds.add(c.id);
            const cBucket = getUserBucket(c.author);
            const targetBucket = cBucket || anonBucket;
            const commSub = extractSubreddit(c, filePath) || extractSubreddit(item, filePath);
            if (commSub) targetBucket.subreddits.add(commSub);

            const commObj = {
              tipo: 'comentario',
              id: c.id,
              subreddit: commSub,
              created_utc: c.created_utc,
              date_art: c.date_art || '',
              score: typeof c.score === 'number' ? c.score : 0,
              post_id: postId || c.post_id || '',
              post_titulo: postTitle || '',
              parent_id: c.parent_id || '',
              depth: c.depth || 0,
              cuerpo: c.body || '',
              permalink: c.permalink || ''
            };
            if (Array.isArray(c.media_urls) && c.media_urls.length > 0) {
              commObj.media_urls = c.media_urls;
            }
            if (pendingCommentMedia.has(c.id)) {
              commObj.media_files = pendingCommentMedia.get(c.id);
              pendingCommentMedia.delete(c.id);
            }
            if (!cBucket) {
              commObj.autor_eliminado = true;
              anonCommentsCount++;
            }
            targetBucket.comentarios.push(commObj);
            commentRecordById.set(c.id, commObj);
          }
        }
      }
    }
  }

  console.log('\n--- FASE 2: Consolidando y ordenando líneas de tiempo ---');

  const perfilesFinales = [];

  for (const [author, data] of userMap.entries()) {
    const totalPosts = data.posts.length;
    const totalComentarios = data.comentarios.length;
    const totalInteracciones = totalPosts + totalComentarios;

    if (totalInteracciones < minActividades) continue;

    // Unir posts y comentarios y ordenar cronológicamente
    const timeline = [...data.posts, ...data.comentarios];
    timeline.sort((a, b) => (a.created_utc || 0) - (b.created_utc || 0));

    let scoreTotal = 0;
    for (const act of timeline) {
      scoreTotal += (act.score || 0);
    }

    const primeraAct = timeline[0] ? timeline[0].date_art : '';
    const ultimaAct = timeline[timeline.length - 1] ? timeline[timeline.length - 1].date_art : '';

    perfilesFinales.push({
      usuario: author,
      metricas: {
        total_interacciones: totalInteracciones,
        total_posts: totalPosts,
        total_comentarios: totalComentarios,
        score_total: scoreTotal,
        score_promedio: parseFloat((scoreTotal / (totalInteracciones || 1)).toFixed(2)),
        primera_actividad_art: primeraAct,
        ultima_actividad_art: ultimaAct,
        subreddits_activos: Array.from(data.subreddits),
        flairs_utilizados: Array.from(data.flairs)
      },
      timeline: timeline
    });
  }

  // Ordenar perfiles de mayor actividad / score general a menor
  perfilesFinales.sort((a, b) => b.metricas.total_interacciones - a.metricas.total_interacciones || b.metricas.score_total - a.metricas.score_total);

  // Metadata resumen
  const metadata = {
    fecha_generacion: new Date().toISOString(),
    usuarios_identificados: perfilesFinales.length,
    posts_totales_indexados: seenPostIds.size,
    comentarios_totales_indexados: seenCommentIds.size,
    actividades_anonimas: {
      posts_eliminados: anonPostsCount,
      comentarios_eliminados: anonCommentsCount
    }
  };

  // Preparar registro especial [deleted] SOLO para reconstrucción de feeds/hilos (excluido de ranking, stats y grafo)
  let anonProfileEntry = null;
  if (anonBucket.posts.length > 0 || anonBucket.comentarios.length > 0) {
    const anonTimeline = [...anonBucket.posts, ...anonBucket.comentarios];
    anonTimeline.sort((a, b) => (a.created_utc || 0) - (b.created_utc || 0));
    anonProfileEntry = {
      usuario: '[deleted]',
      es_anonimo: true,
      metricas: {
        total_interacciones: anonTimeline.length,
        total_posts: anonBucket.posts.length,
        total_comentarios: anonBucket.comentarios.length,
        score_total: 0,
        score_promedio: 0,
        primera_actividad_art: anonTimeline[0] ? anonTimeline[0].date_art : '',
        ultima_actividad_art: anonTimeline[anonTimeline.length - 1] ? anonTimeline[anonTimeline.length - 1].date_art : '',
        subreddits_activos: Array.from(anonBucket.subreddits),
        flairs_utilizados: Array.from(anonBucket.flairs)
      },
      timeline: anonTimeline
    };
  }

  // Determinar ruta de salida: carpeta única en resultados/consolidados/ si no se pasó --out
  if (!outputFile) {
    const outDir = createUniqueConsolidationDir();
    outputFile = path.join(outDir, 'perfiles_usuarios.json');
  } else {
    const outParent = path.dirname(outputFile);
    if (outParent && outParent !== '.') {
      fs.mkdirSync(outParent, { recursive: true });
    }
  }

  // Guardar archivo JSON consolidado mediante streaming para evitar 'RangeError: Invalid string length'
  const perfilesParaJson = anonProfileEntry ? [...perfilesFinales, anonProfileEntry] : perfilesFinales;
  console.log(`\nEscribiendo "${outputFile}" mediante streaming (${perfilesFinales.length} perfiles reales${anonProfileEntry ? ' + actividades [deleted]' : ''})...`);
  const jsonWs = fs.createWriteStream(outputFile, { encoding: 'utf-8' });

  jsonWs.write('{\n');
  const metaStr = JSON.stringify(metadata, null, 2).replace(/\n/g, '\n  ');
  jsonWs.write('  "metadata": ' + metaStr + ',\n');
  jsonWs.write('  "perfiles": [\n');

  for (let i = 0; i < perfilesParaJson.length; i++) {
    const isLast = (i === perfilesParaJson.length - 1);
    const line = '    ' + JSON.stringify(perfilesParaJson[i]) + (isLast ? '\n' : ',\n');
    const ok = jsonWs.write(line);
    if (!ok) {
      await new Promise(resolve => jsonWs.once('drain', resolve));
    }
  }

  jsonWs.write('  ]\n}\n');
  await new Promise(resolve => jsonWs.end(resolve));

  // Guardar CSV resumen de ranking para Excel mediante streaming
  const csvPath = outputFile.replace(/\.json$/, '') + '_ranking.csv';
  console.log(`Escribiendo "${csvPath}"...`);
  const csvWs = fs.createWriteStream(csvPath, { encoding: 'utf-8' });
  csvWs.write('\uFEFF#;Usuario;Total Interacciones;Posts;Comentarios;Score Total;Score Promedio;Primera Actividad;Ultima Actividad\n');

  for (let i = 0; i < perfilesFinales.length; i++) {
    const p = perfilesFinales[i];
    const m = p.metricas;
    const line = `${i + 1};"${p.usuario}";${m.total_interacciones};${m.total_posts};${m.total_comentarios};${m.score_total};${m.score_promedio};"${m.primera_actividad_art}";"${m.ultima_actividad_art}"\n`;
    const ok = csvWs.write(line);
    if (!ok) {
      await new Promise(resolve => csvWs.once('drain', resolve));
    }
  }
  await new Promise(resolve => csvWs.end(resolve));

  console.log('========================================================');
  console.log('       CONSOLIDACIÓN DE PERFILES COMPLETADA             ');
  console.log('========================================================');
  console.log(`Publicaciones únicas indexadas:   ${seenPostIds.size}`);
  console.log(`Comentarios únicos indexados:     ${seenCommentIds.size}`);
  console.log(`Usuarios únicos identificados:   ${perfilesFinales.length}`);
  console.log(`\nArchivos de salida generados:`);
  console.log(`  -> JSON Detallado con Timelines: ${outputFile}`);
  console.log(`  -> CSV Ranking para Excel:       ${csvPath}`);
  console.log('========================================================\n');
}

main().catch(err => {
  console.error('\nError fatal:', err);
  process.exit(1);
});
