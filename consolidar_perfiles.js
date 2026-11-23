#!/usr/bin/env node
// consolidar_perfiles.js - Protocolo de Consolidación de Perfiles de Usuario e Historial Cronológico
const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');

const ART_OFFSET_HOURS = -3; // UTC-3
const NUM_BUCKETS = 32; // Particiones temporales en disco para escalar a millones de registros con baja RAM

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

async function askValidated(rl, promptText, defaultValue, validator, errorMsg) {
  while (true) {
    const raw = await ask(rl, promptText, defaultValue);
    const parsed = validator(raw);
    if (parsed !== null && parsed !== undefined) return parsed;
    console.log(`  ❌ Valor inválido ("${raw}"). ${errorMsg}`);
  }
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

// Hash determinístico FNV-1a (32-bit) para particionar autores en buckets de disco
function hashBucket(str, numBuckets) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % numBuckets;
}

async function writeStreamChunk(ws, chunk) {
  if (!ws.write(chunk)) {
    await new Promise(resolve => ws.once('drain', resolve));
  }
}

function closeWriteStream(ws) {
  return new Promise((resolve, reject) => {
    ws.once('error', reject);
    ws.end(() => resolve());
  });
}

// Lector JSON en streaming elemento-por-elemento (O(1) RAM por archivo, soporta archivos >512 MB y multi-GB)
async function streamJsonArray(filePath, onItem) {
  const stream = fs.createReadStream(filePath, { encoding: 'utf-8', highWaterMark: 256 * 1024 });
  let started = false;
  let inString = false;
  let escapeNext = false;
  const stack = [];
  let capturing = false;
  let captureDepth = -1;
  let chunks = [];
  let count = 0;

  for await (const chunk of stream) {
    let sliceStart = capturing ? 0 : -1;
    for (let i = 0; i < chunk.length; i++) {
      const ch = chunk[i];
      if (!started) {
        if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n' || ch === '\uFEFF') continue;
        if (ch !== '[') {
          stream.destroy();
          return { isArray: false, count: 0 };
        }
        started = true;
        stack.push('[');
        continue;
      }

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
          const obj = JSON.parse(chunks.join(''));
          capturing = false;
          captureDepth = -1;
          chunks = [];
          sliceStart = -1;
          count++;
          await onItem(obj);
        }
        stack.pop();
      }
    }
    if (capturing && sliceStart !== -1) {
      chunks.push(chunk.slice(sliceStart));
    }
  }

  return { isArray: started, count };
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
      const lowerName = entry.name.toLowerCase();
      if (lowerName !== 'node_modules' &&
          lowerName !== '.git' &&
          lowerName !== 'consolidados' &&
          lowerName !== 'backups' &&
          lowerName !== 'viewer' &&
          lowerName !== 'test' &&
          lowerName !== 'tests' &&
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
    const opc = await askValidated(
      rl,
      'Opción [1-2]',
      '1',
      (v) => (['1', '2'].includes(v) ? v : null),
      'Elegí 1 o 2.'
    );

    if (opc === '2') {
      targetFiles = await askValidated(
        rl,
        `Ingresá los números separados por coma [1-${discovered.length}] (ej: 1,3)`,
        '',
        (v) => {
          const parts = v.split(',').map(s => s.trim()).filter(Boolean);
          if (parts.length === 0) return null;
          const chosen = [];
          for (const p of parts) {
            if (!/^\d+$/.test(p)) return null;
            const file = discovered[parseInt(p, 10) - 1];
            if (!file) return null;
            chosen.push(file);
          }
          return chosen;
        },
        `Ingresá números válidos entre 1 y ${discovered.length} separados por coma.`
      );
    } else {
      targetFiles = discovered;
    }

    const filtrarFecha = await askValidated(
      rl,
      '¿Filtrar por año/mes específico? [s/N]',
      'N',
      (v) => {
        const n = v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (['s', 'si', 'y', 'yes'].includes(n)) return true;
        if (['n', 'no'].includes(n)) return false;
        return null;
      },
      'Ingresá S (sí) o N (no).'
    );
    if (filtrarFecha) {
      const anio = await askValidated(
        rl,
        'Año (YYYY)',
        '2026',
        (v) => (/^\d{4}$/.test(v) && Number(v) >= 2005 && Number(v) <= 2035 ? Number(v) : null),
        'Ingresá un año válido de 4 dígitos (2005-2035).'
      );
      const mes = await askValidated(
        rl,
        'Mes (1-12 o escribí "todos" para todo el año)',
        'todos',
        (v) => {
          const n = v.toLowerCase();
          if (n === 'todos' || n === '') return '';
          return (/^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 12) ? Number(v) : null;
        },
        'Ingresá un número entre 1 y 12, o "todos".'
      );
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

  // Priorizar manifiestos de media de comentarios para evitar mantener millones de referencias en RAM
  targetFiles = [...targetFiles].sort((a, b) => {
    const aIsCommMedia = /media_comments/i.test(path.basename(a)) ? 0 : 1;
    const bIsCommMedia = /media_comments/i.test(path.basename(b)) ? 0 : 1;
    return aIsCommMedia - bIsCommMedia;
  });

  console.log('\n========================================================');
  console.log(`Archivos a consolidar: ${targetFiles.length}`);
  if (startUnix > 0 || endUnix < Infinity) {
    console.log(`Filtro temporal activo: Desde ${startUnix} hasta ${endUnix}`);
  }
  console.log(`Modo escalable: Streaming + ${NUM_BUCKETS} particiones en disco (baja RAM)`);
  console.log('========================================================\n');

  function normalizeMediaRef(relPath, baseDir) {
    if (!relPath) return null;
    const cleanRel = String(relPath).replace(/\\/g, '/').replace(/^\.\//, '');
    if (!baseDir) return cleanRel;
    const cleanBase = String(baseDir).replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '');
    if (!cleanBase || cleanBase === '.' || cleanRel.startsWith(cleanBase + '/')) return cleanRel;
    return `${cleanBase}/${cleanRel}`;
  }

  const tmpWorkDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reddit-consolidar-'));
  let totalPostsIndexed = 0;
  let totalCommentsIndexed = 0;
  let totalRealUsers = 0;
  let csvPath = '';

  try {
    const bucketPaths = [];
    const bucketStreams = [];
    for (let b = 0; b < NUM_BUCKETS; b++) {
      const bp = path.join(tmpWorkDir, `bucket_${b}.jsonl`);
      bucketPaths.push(bp);
      bucketStreams.push(fs.createWriteStream(bp, { encoding: 'utf-8' }));
    }
    const anonBucketPath = path.join(tmpWorkDir, 'bucket_anon.jsonl');
    const anonWs = fs.createWriteStream(anonBucketPath, { encoding: 'utf-8' });

    const postRecordById = new Map(); // postId -> objeto post enriquecido (se vuelca a disco al finalizar Fase 1)
    const pendingCommentMedia = new Map(); // commentId -> media_files[]

    // FASE 1: Ingesta en streaming elemento por elemento -> volcado inmediato de comentarios a buckets
    for (const filePath of targetFiles) {
      if (!fs.existsSync(filePath)) continue;
      const fSizeMb = (fs.statSync(filePath).size / (1024 * 1024)).toFixed(1);
      const fileDirNorm = path.dirname(filePath).replace(/\\/g, '/');
      let fileItems = 0;
      let fileComments = 0;

      console.log(`Procesando en streaming (${fSizeMb} MB): ${filePath}...`);

      try {
        const res = await streamJsonArray(filePath, async (item) => {
          fileItems++;
          if (fileItems % 25000 === 0) {
            process.stdout.write(`\r  ... ${fileItems} registros leídos (${fileComments} comentarios volcados)`);
          }

          if (!item || typeof item !== 'object') return;

          // 0. Manifiesto opcional de imágenes/GIFs en comentarios (media_comments.json)
          if (item.tipo === 'comment_media' && item.comment_id && Array.isArray(item.media_files) && item.media_files.length > 0) {
            const cBaseDir = item.media_base_dir || fileDirNorm;
            const normFiles = item.media_files.map(mf => ({
              ...mf,
              local_path: normalizeMediaRef(mf.local_path, cBaseDir)
            }));
            pendingCommentMedia.set(item.comment_id, normFiles);
            return;
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
            const existing = postRecordById.get(postId);
            if (!existing) {
              const isAnonPost = (!author || author === '[deleted]' || author === '[removed]');
              const postSub = extractSubreddit(item, filePath);
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
                num_comments: incomingNumComments,
                _author: isAnonPost ? '' : author
              };
              if (item.post_type) postObj.post_type = item.post_type;
              if (incomingTextFile) postObj.text_file_path = incomingTextFile;
              if (incomingMediaFiles) postObj.media_files = incomingMediaFiles;
              if (isAnonPost) postObj.autor_eliminado = true;

              postRecordById.set(postId, postObj);
            } else {
              // Fusión/Enriquecimiento desde _comentarios.json o master.json
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

          // 2. Extraer Comentarios y volcar inmediatamente a su partición en disco (0 comentarios retenidos en RAM)
          const commentsList = item.comments;
          if (Array.isArray(commentsList)) {
            const parentSub = extractSubreddit(item, filePath);
            for (const c of commentsList) {
              if (!c || !c.id) continue;
              const cTime = c.created_utc;
              if (cTime && (cTime < startUnix || cTime > endUnix)) continue;

              const isAnonComm = (!c.author || c.author === '[deleted]' || c.author === '[removed]');
              const commSub = extractSubreddit(c, filePath) || parentSub;
              const isLiteComm = Boolean(c.lite && !c.body);

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
                permalink: c.permalink || ''
              };
              if (isLiteComm) {
                commObj.lite = true;
              } else {
                commObj.cuerpo = c.body || '';
              }
              if (Array.isArray(c.media_urls) && c.media_urls.length > 0) {
                commObj.media_urls = c.media_urls;
              }
              if (pendingCommentMedia.has(c.id)) {
                commObj.media_files = pendingCommentMedia.get(c.id);
                pendingCommentMedia.delete(c.id);
              }

              fileComments++;
              if (isAnonComm) {
                commObj.autor_eliminado = true;
                await writeStreamChunk(anonWs, JSON.stringify(commObj) + '\n');
              } else {
                const bIdx = hashBucket(c.author, NUM_BUCKETS);
                await writeStreamChunk(bucketStreams[bIdx], JSON.stringify({ a: c.author, d: commObj }) + '\n');
              }
            }
          }
        });

        if (fileItems >= 25000) process.stdout.write('\n');
        if (!res.isArray) {
          console.warn(`Aviso: "${filePath}" no es un arreglo JSON. Salteando.`);
        } else {
          console.log(`  -> Completado: ${res.count} registros (${fileComments} comentarios)`);
        }
      } catch (e) {
        if (fileItems >= 25000) process.stdout.write('\n');
        console.warn(`Aviso: Error al parsear "${filePath}" (${e.message}). Salteando.`);
      }
    }

    // Volcar posts enriquecidos a sus particiones y liberar RAM antes de Fase 2
    totalPostsIndexed = postRecordById.size;
    console.log(`\nVolcando ${totalPostsIndexed} publicaciones únicas a particiones temporales...`);
    for (const postObj of postRecordById.values()) {
      const author = postObj._author;
      delete postObj._author;
      if (!author || postObj.autor_eliminado) {
        await writeStreamChunk(anonWs, JSON.stringify(postObj) + '\n');
      } else {
        const bIdx = hashBucket(author, NUM_BUCKETS);
        await writeStreamChunk(bucketStreams[bIdx], JSON.stringify({ a: author, d: postObj }) + '\n');
      }
    }
    postRecordById.clear();
    pendingCommentMedia.clear();

    await Promise.all([
      ...bucketStreams.map(ws => closeWriteStream(ws)),
      closeWriteStream(anonWs)
    ]);

    // FASE 2: Consolidación partición por partición -> almacenamiento compacto indexado por byte-offset
    console.log('\n--- FASE 2: Consolidando y ordenando líneas de tiempo por partición ---');

    const storePath = path.join(tmpWorkDir, 'profiles_store.bin');
    const storeWs = fs.createWriteStream(storePath);
    let storeOffset = 0;
    const profileIndex = []; // Solo metadatos livianos para ordenamiento global y CSV
    let anonPostsCount = 0;
    let anonCommentsCount = 0;
    let anonEntryMeta = null;

    for (let b = 0; b < NUM_BUCKETS; b++) {
      const bp = bucketPaths[b];
      if (!fs.existsSync(bp) || fs.statSync(bp).size === 0) {
        try { fs.unlinkSync(bp); } catch (_) {}
        continue;
      }

      const bucketUsers = new Map();
      const bucketSeenComments = new Set();

      const rlBucket = readline.createInterface({
        input: fs.createReadStream(bp, { encoding: 'utf-8', highWaterMark: 256 * 1024 }),
        crlfDelay: Infinity
      });

      for await (const line of rlBucket) {
        if (!line) continue;
        const rec = JSON.parse(line);
        const author = rec.a;
        const item = rec.d;

        if (item.tipo === 'comentario') {
          if (bucketSeenComments.has(item.id)) continue;
          bucketSeenComments.add(item.id);
          totalCommentsIndexed++;
        }

        let u = bucketUsers.get(author);
        if (!u) {
          u = { posts: [], comentarios: [], subreddits: new Set(), flairs: new Set() };
          bucketUsers.set(author, u);
        }
        if (item.subreddit) u.subreddits.add(item.subreddit);
        if (item.tipo === 'post') {
          u.posts.push(item);
          if (item.flair) u.flairs.add(item.flair);
        } else {
          u.comentarios.push(item);
        }
      }

      for (const [author, uData] of bucketUsers.entries()) {
        const totalPosts = uData.posts.length;
        const totalComentarios = uData.comentarios.length;
        const totalInteracciones = totalPosts + totalComentarios;

        if (totalInteracciones < minActividades) continue;

        const timeline = [...uData.posts, ...uData.comentarios];
        timeline.sort((a, b) => (a.created_utc || 0) - (b.created_utc || 0));

        let scoreTotal = 0;
        for (const act of timeline) {
          scoreTotal += (act.score || 0);
        }
        const scorePromedio = parseFloat((scoreTotal / (totalInteracciones || 1)).toFixed(2));
        const primeraAct = timeline[0] ? timeline[0].date_art : '';
        const ultimaAct = timeline[timeline.length - 1] ? timeline[timeline.length - 1].date_art : '';

        const profileObj = {
          usuario: author,
          metricas: {
            total_interacciones: totalInteracciones,
            total_posts: totalPosts,
            total_comentarios: totalComentarios,
            score_total: scoreTotal,
            score_promedio: scorePromedio,
            primera_actividad_art: primeraAct,
            ultima_actividad_art: ultimaAct,
            subreddits_activos: Array.from(uData.subreddits),
            flairs_utilizados: Array.from(uData.flairs)
          },
          timeline
        };

        const buf = Buffer.from(JSON.stringify(profileObj), 'utf-8');
        await writeStreamChunk(storeWs, buf);

        profileIndex.push({
          usuario: author,
          total_interacciones: totalInteracciones,
          total_posts: totalPosts,
          total_comentarios: totalComentarios,
          score_total: scoreTotal,
          score_promedio: scorePromedio,
          primera_actividad_art: primeraAct,
          ultima_actividad_art: ultimaAct,
          offset: storeOffset,
          length: buf.length
        });
        storeOffset += buf.length;
      }

      bucketUsers.clear();
      bucketSeenComments.clear();
      try { fs.unlinkSync(bp); } catch (_) {}
      process.stdout.write(`\r  Partición ${b + 1}/${NUM_BUCKETS} consolidada (${profileIndex.length} perfiles acumulados)...`);
    }
    process.stdout.write('\n');

    // Procesar bloque anónimo [deleted] SOLO para reconstrucción de feeds/hilos (excluido de ranking, stats y grafo)
    if (fs.existsSync(anonBucketPath) && fs.statSync(anonBucketPath).size > 0) {
      const anonPosts = [];
      const anonComments = [];
      const anonSubs = new Set();
      const anonFlairs = new Set();
      const anonSeenComments = new Set();

      const rlAnon = readline.createInterface({
        input: fs.createReadStream(anonBucketPath, { encoding: 'utf-8', highWaterMark: 256 * 1024 }),
        crlfDelay: Infinity
      });

      for await (const line of rlAnon) {
        if (!line) continue;
        const item = JSON.parse(line);
        if (item.tipo === 'comentario') {
          if (anonSeenComments.has(item.id)) continue;
          anonSeenComments.add(item.id);
          anonComments.push(item);
          anonCommentsCount++;
          totalCommentsIndexed++;
        } else {
          anonPosts.push(item);
          anonPostsCount++;
          if (item.flair) anonFlairs.add(item.flair);
        }
        if (item.subreddit) anonSubs.add(item.subreddit);
      }

      if (anonPosts.length > 0 || anonComments.length > 0) {
        const anonTimeline = [...anonPosts, ...anonComments];
        anonTimeline.sort((a, b) => (a.created_utc || 0) - (b.created_utc || 0));
        const anonProfileEntry = {
          usuario: '[deleted]',
          es_anonimo: true,
          metricas: {
            total_interacciones: anonTimeline.length,
            total_posts: anonPosts.length,
            total_comentarios: anonComments.length,
            score_total: 0,
            score_promedio: 0,
            primera_actividad_art: anonTimeline[0] ? anonTimeline[0].date_art : '',
            ultima_actividad_art: anonTimeline[anonTimeline.length - 1] ? anonTimeline[anonTimeline.length - 1].date_art : '',
            subreddits_activos: Array.from(anonSubs),
            flairs_utilizados: Array.from(anonFlairs)
          },
          timeline: anonTimeline
        };
        const buf = Buffer.from(JSON.stringify(anonProfileEntry), 'utf-8');
        await writeStreamChunk(storeWs, buf);
        anonEntryMeta = { offset: storeOffset, length: buf.length };
        storeOffset += buf.length;
      }
      try { fs.unlinkSync(anonBucketPath); } catch (_) {}
    }

    await closeWriteStream(storeWs);

    // FASE 3: Ordenamiento global del índice liviano y ensamblado final en streaming
    profileIndex.sort((a, b) => b.total_interacciones - a.total_interacciones || b.score_total - a.score_total);
    totalRealUsers = profileIndex.length;

    const metadata = {
      fecha_generacion: new Date().toISOString(),
      usuarios_identificados: totalRealUsers,
      posts_totales_indexados: totalPostsIndexed,
      comentarios_totales_indexados: totalCommentsIndexed,
      actividades_anonimas: {
        posts_eliminados: anonPostsCount,
        comentarios_eliminados: anonCommentsCount
      }
    };

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

    const totalToWrite = totalRealUsers + (anonEntryMeta ? 1 : 0);
    console.log(`\nEscribiendo "${outputFile}" mediante streaming (${totalRealUsers} perfiles reales${anonEntryMeta ? ' + actividades [deleted]' : ''})...`);
    const jsonWs = fs.createWriteStream(outputFile);

    await writeStreamChunk(jsonWs, '{\n');
    const metaStr = JSON.stringify(metadata, null, 2).replace(/\n/g, '\n  ');
    await writeStreamChunk(jsonWs, '  "metadata": ' + metaStr + ',\n');
    await writeStreamChunk(jsonWs, '  "perfiles": [\n');

    const storeFd = fs.openSync(storePath, 'r');
    try {
      const writeEntryFromStore = async (entry, isLast) => {
        const entryBuf = Buffer.allocUnsafe(entry.length);
        let bytesRead = 0;
        while (bytesRead < entry.length) {
          const n = fs.readSync(storeFd, entryBuf, bytesRead, entry.length - bytesRead, entry.offset + bytesRead);
          if (n <= 0) break;
          bytesRead += n;
        }
        await writeStreamChunk(jsonWs, '    ');
        await writeStreamChunk(jsonWs, entryBuf);
        await writeStreamChunk(jsonWs, isLast ? '\n' : ',\n');
      };

      for (let i = 0; i < profileIndex.length; i++) {
        const isLast = (i === totalToWrite - 1);
        await writeEntryFromStore(profileIndex[i], isLast);
      }
      if (anonEntryMeta) {
        await writeEntryFromStore(anonEntryMeta, true);
      }
    } finally {
      fs.closeSync(storeFd);
    }

    await writeStreamChunk(jsonWs, '  ]\n}\n');
    await closeWriteStream(jsonWs);

    // Guardar CSV resumen de ranking para Excel mediante streaming
    csvPath = outputFile.replace(/\.json$/, '') + '_ranking.csv';
    console.log(`Escribiendo "${csvPath}"...`);
    const csvWs = fs.createWriteStream(csvPath, { encoding: 'utf-8' });
    await writeStreamChunk(csvWs, '\uFEFF#;Usuario;Total Interacciones;Posts;Comentarios;Score Total;Score Promedio;Primera Actividad;Ultima Actividad\n');

    for (let i = 0; i < profileIndex.length; i++) {
      const p = profileIndex[i];
      const line = `${i + 1};"${p.usuario}";${p.total_interacciones};${p.total_posts};${p.total_comentarios};${p.score_total};${p.score_promedio};"${p.primera_actividad_art}";"${p.ultima_actividad_art}"\n`;
      await writeStreamChunk(csvWs, line);
    }
    await closeWriteStream(csvWs);
  } finally {
    fs.rmSync(tmpWorkDir, { recursive: true, force: true });
  }

  console.log('========================================================');
  console.log('       CONSOLIDACIÓN DE PERFILES COMPLETADA             ');
  console.log('========================================================');
  console.log(`Publicaciones únicas indexadas:   ${totalPostsIndexed}`);
  console.log(`Comentarios únicos indexados:     ${totalCommentsIndexed}`);
  console.log(`Usuarios únicos identificados:   ${totalRealUsers}`);
  console.log(`\nArchivos de salida generados:`);
  console.log(`  -> JSON Detallado con Timelines: ${outputFile}`);
  console.log(`  -> CSV Ranking para Excel:       ${csvPath}`);
  console.log('========================================================\n');
}

main().catch(err => {
  console.error('\nError fatal:', err);
  process.exit(1);
});
