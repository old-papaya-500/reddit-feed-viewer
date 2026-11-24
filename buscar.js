#!/usr/bin/env node
// buscar.js - Buscador Concurrente de Publicaciones de Reddit (Sharding Temporal + Checkpoints + Streaming)
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const USER_AGENT = 'reddit-parallel-history-researcher/1.0 (pure nodejs)';
const ART_OFFSET_HOURS = -3; // Argentina Time UTC-3
const DEFAULT_CONCURRENCY = 3;
const MAX_CONCURRENCY = 20;
const PER_WORKER_DELAY_MS = 1200;

let globalPauseUntil = 0; // Enfriamiento compartido si algún worker recibe 422/429

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getArtTimestampSlug() {
  const art = new Date(Date.now() + ART_OFFSET_HOURS * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${art.getUTCFullYear()}${p(art.getUTCMonth() + 1)}${p(art.getUTCDate())}_${p(art.getUTCHours())}${p(art.getUTCMinutes())}${p(art.getUTCSeconds())}`;
}

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

function normalizeText(str) {
  if (!str) return '';
  return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
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
      if (next && !next.startsWith('-')) {
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

const VALID_SHARD_MODES = ['mes', 'semana', 'dia'];

function isValidDateStr(str) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const [y, m, d] = str.split('-').map(Number);
  if (y < 2005 || y > 2035 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const check = new Date(Date.UTC(y, m - 1, d));
  return check.getUTCFullYear() === y && (check.getUTCMonth() + 1) === m && check.getUTCDate() === d;
}

function normalizeShardMode(raw) {
  const clean = normalizeText(String(raw || '').trim());
  return VALID_SHARD_MODES.includes(clean) ? clean : null;
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

async function askYesNo(rl, promptText, defaultYes = true) {
  const def = defaultYes ? 'S' : 'N';
  return askValidated(
    rl,
    promptText,
    def,
    (v) => {
      const n = normalizeText(v);
      if (['s', 'si', 'y', 'yes'].includes(n)) return true;
      if (['n', 'no'].includes(n)) return false;
      return null;
    },
    'Ingresá S (sí) o N (no).'
  );
}

function showHelp() {
  console.log(`
Uso de buscar.js (Buscador Concurrente en Paralelo):

  1) Modo Interactivo:
     node buscar.js

  2) Modo CLI:
     node buscar.js [opciones]

Opciones:
  --sub <nombre>           Subreddit (por defecto: argentina)
  --desde <YYYY-MM-DD>     Fecha inicial ART (ej: 2020-01-01)
  --hasta <YYYY-MM-DD>     Fecha final ART (ej: 2026-01-31)
  --mes <1-12>             Mes específico (combinable con --anio, por defecto año 2026)
  --anio <YYYY>            Año específico completo o junto con --mes
  --anio-desde <YYYY>      Año inicial completo (01-01)
  --anio-hasta <YYYY>      Año final completo (12-31)
  --shard <mes|semana|dia> Tamaño de cada partición paralela (por defecto: mes)
  --concurrency, -c <num>  Hilos en paralelo (por defecto: ${DEFAULT_CONCURRENCY}, máx: ${MAX_CONCURRENCY})
  --flair <texto>          Filtro opcional por flair
  --resume <carpeta>       Reanudar una corrida pausada en resultados/<carpeta>/
  --no-md                  Omitir generación del archivo .md (recomendado para >50.000 posts)
  --help, -h               Muestra esta ayuda

Ejemplos:
  # Mes completo de r/argentina (enero 2026):
  node buscar.js --sub argentina --mes 1 --anio 2026

  # Traer 5 años completos de r/argentina en 3 hilos (particionado por mes):
  node buscar.js --sub argentina --anio-desde 2021 --anio-hasta 2025 -c 3 --no-md

  # Prueba rápida de 3 días particionados por día:
  node buscar.js --sub argentina --desde 2026-01-01 --hasta 2026-01-03 --shard dia -c 3
`);
}

// Divide el rango [startUnix, endUnix] en ventanas independientes (mes, semana o día en ART)
function buildTimeShards(startUnix, endUnix, shardMode = 'mes') {
  const shards = [];
  let cursor = startUnix;
  let index = 1;

  while (cursor <= endUnix) {
    let sliceEnd;
    let label;

    const artDate = new Date((cursor + ART_OFFSET_HOURS * 3600) * 1000);
    const y = artDate.getUTCFullYear();
    const m = artDate.getUTCMonth(); // 0..11
    const d = artDate.getUTCDate();
    const p = (n) => String(n).padStart(2, '0');

    if (shardMode === 'dia') {
      const dayEnd = parseArtToUnix(`${y}-${p(m + 1)}-${p(d)}`, true);
      sliceEnd = Math.min(endUnix, dayEnd);
      label = `${y}-${p(m + 1)}-${p(d)}`;
    } else if (shardMode === 'semana') {
      sliceEnd = Math.min(endUnix, cursor + 7 * 86400 - 1);
      label = `S${String(index).padStart(3, '0')}_${y}-${p(m + 1)}-${p(d)}`;
    } else {
      // 'mes' por defecto
      const monthEnd = parseArtToUnix(`${y}-${p(m + 1)}`, true);
      sliceEnd = Math.min(endUnix, monthEnd);
      label = `${y}-${p(m + 1)}`;
    }

    shards.push({
      index,
      id: `shard_${String(index).padStart(4, '0')}_${label}`,
      label,
      startUnix: cursor,
      endUnix: sliceEnd
    });

    cursor = sliceEnd + 1;
    index++;
  }

  return shards;
}

async function fetchWithAdaptiveRetry(url, workerId, maxRetries = 10) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    // Respetar enfriamiento global si otro worker detectó 422/429
    const now = Date.now();
    if (globalPauseUntil > now) {
      await sleep(globalPauseUntil - now);
    }

    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
      if (res.status === 200) {
        return await res.json();
      }
      if (res.status === 422 || res.status === 429 || res.status >= 500) {
        const waitSec = Math.min(attempt * 8, 60);
        // Propagar enfriamiento suave compartido al resto de los workers
        globalPauseUntil = Math.max(globalPauseUntil, Date.now() + Math.min(waitSec, 20) * 1000);
        console.warn(`  [Hilo ${workerId}][HTTP ${res.status}] Enfriando ${waitSec}s (intento ${attempt}/${maxRetries})...`);
        await sleep(waitSec * 1000);
        continue;
      }
      console.warn(`  [Hilo ${workerId}][HTTP ${res.status}] Error no recuperable.`);
      return null;
    } catch (err) {
      const waitSec = Math.min(attempt * 6, 45);
      console.warn(`  [Hilo ${workerId}][Red: ${err.message}] Reintentando en ${waitSec}s...`);
      await sleep(waitSec * 1000);
    }
  }
  return null;
}

function escapeCsv(val) {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

// Fusión en streaming de todos los shards ordenados cronológicamente (cero límite de 512 MB)
async function mergeShardsStreaming(shards, shardsDir, runDir, outputBase, meta, skipMd) {
  const fileJson = path.join(runDir, `${outputBase}.json`);
  const fileCsv = path.join(runDir, `${outputBase}.csv`);
  const fileMd = path.join(runDir, `${outputBase}.md`);

  const jsonWs = fs.createWriteStream(fileJson, { encoding: 'utf-8' });
  const csvWs = fs.createWriteStream(fileCsv, { encoding: 'utf-8' });
  const mdWs = skipMd ? null : fs.createWriteStream(fileMd, { encoding: 'utf-8' });

  jsonWs.write('[\n');
  csvWs.write('\uFEFF' + ['#', 'ID', 'Fecha (ART)', 'Título', 'Autor', 'Votos', 'Comentarios', 'Flair', 'Link', 'URL'].map(escapeCsv).join(',') + '\n');

  if (mdWs) {
    mdWs.write(`# Publicaciones de r/${meta.subreddit}\n\n`);
    mdWs.write(`- **Subreddit:** r/${meta.subreddit}\n`);
    mdWs.write(`- **Período (ART UTC-3):** ${new Date(meta.startUnix * 1000).toISOString()} a ${new Date(meta.endUnix * 1000).toISOString()}\n`);
    if (meta.flairFilter) mdWs.write(`- **Filtro de Flair:** "${meta.flairFilter}"\n`);
    mdWs.write(`\n| # | Link | Fecha (ART) | Título | Votos | Flair |\n`);
    mdWs.write(`|---|---|---|---|---|---|\n`);
  }

  const seenIds = new Set();
  let totalWritten = 0;

  async function writeStream(ws, chunk) {
    if (!ws.write(chunk)) {
      await new Promise(resolve => ws.once('drain', resolve));
    }
  }

  for (const shard of shards) {
    const shardFile = path.join(shardsDir, `${shard.id}.json`);
    if (!fs.existsSync(shardFile)) continue;

    const posts = JSON.parse(fs.readFileSync(shardFile, 'utf-8'));
    posts.sort((a, b) => a.created_utc - b.created_utc);

    for (const p of posts) {
      if (!p || !p.id || seenIds.has(p.id)) continue;
      seenIds.add(p.id);

      const prefix = totalWritten === 0 ? '  ' : ',\n  ';
      await writeStream(jsonWs, prefix + JSON.stringify(p));

      totalWritten++;
      const csvRow = [
        totalWritten, p.id, p.date_art, p.title, p.author,
        p.score, p.num_comments, p.flair, p.permalink, p.url
      ].map(escapeCsv).join(',') + '\n';
      await writeStream(csvWs, csvRow);

      if (mdWs) {
        const cleanTitle = (p.title || '').replace(/\|/g, '\\|').replace(/\n/g, ' ').trim();
        const cleanFlair = (p.flair || '').replace(/\|/g, '\\|');
        await writeStream(mdWs, `| ${totalWritten} | [Reddit](${p.permalink}) | ${p.date_art} | ${cleanTitle} | ${p.score} | ${cleanFlair} |\n`);
      }
    }
  }

  jsonWs.write('\n]\n');
  await new Promise(resolve => jsonWs.end(resolve));
  await new Promise(resolve => csvWs.end(resolve));
  if (mdWs) {
    mdWs.write(`\n---\n*Total: ${totalWritten.toLocaleString()} publicaciones · Generado el ${new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}*\n`);
    await new Promise(resolve => mdWs.end(resolve));
  }

  return { totalWritten, fileJson, fileCsv, fileMd: skipMd ? null : fileMd };
}

async function main() {
  const cliArgs = parseArgs();

  if (cliArgs.help) {
    showHelp();
    process.exit(0);
  }

  let runDir = '';
  let subreddit = cliArgs.sub || '';
  let startUnix = 0;
  let endUnix = 0;
  let flairFilter = cliArgs.flair || '';
  let shardMode = cliArgs.shard || 'mes';
  let outputBase = cliArgs.out || '';
  let skipMd = Boolean(cliArgs['no-md']);
  let concurrency = parseInt(cliArgs.concurrency || cliArgs.c || DEFAULT_CONCURRENCY, 10);

  if (isNaN(concurrency) || concurrency < 1) concurrency = DEFAULT_CONCURRENCY;
  if (concurrency > MAX_CONCURRENCY) {
    console.warn(`[Aviso]: Concurrencia limitada a ${MAX_CONCURRENCY} para evitar saturación en Arctic Shift.`);
    concurrency = MAX_CONCURRENCY;
  }

  // Modo reanudación directa (--resume <carpeta>)
  if (cliArgs.resume) {
    runDir = cliArgs.resume;
    const metaPath = path.join(runDir, '.shards', '_run_meta.json');
    if (!fs.existsSync(metaPath)) {
      console.error(`Error: No se encontró metadata de corrida reanudable en "${metaPath}".`);
      process.exit(1);
    }
    const saved = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    subreddit = saved.subreddit;
    startUnix = saved.startUnix;
    endUnix = saved.endUnix;
    flairFilter = saved.flairFilter || '';
    shardMode = saved.shardMode || 'mes';
    outputBase = saved.outputBase;
    skipMd = saved.skipMd || skipMd;
    console.log(`\n[Reanudación activada]: Retomando corrida en "${runDir}"...`);
  } else {
    const isCli = cliArgs.desde || cliArgs['anio-desde'] || cliArgs.sub;

    if (isCli) {
      subreddit = (subreddit || 'argentina').replace(/^r\//, '');
      if (!/^[a-zA-Z0-9_]+$/.test(subreddit)) {
        console.error(`Error: Nombre de subreddit inválido ("${subreddit}").`);
        process.exit(1);
      }
      const normShard = normalizeShardMode(shardMode);
      if (!normShard) {
        console.error(`Error: --shard inválido ("${shardMode}"). Opciones válidas: ${VALID_SHARD_MODES.join(', ')}.`);
        process.exit(1);
      }
      shardMode = normShard;

      if (cliArgs.desde && cliArgs.hasta) {
        if (!isValidDateStr(cliArgs.desde) || !isValidDateStr(cliArgs.hasta)) {
          console.error('Error: Las fechas --desde y --hasta deben tener formato válido YYYY-MM-DD.');
          process.exit(1);
        }
        startUnix = parseArtToUnix(cliArgs.desde, false);
        endUnix = parseArtToUnix(cliArgs.hasta, true);
        if (endUnix < startUnix) {
          console.error('Error: --hasta no puede ser anterior a --desde.');
          process.exit(1);
        }
        if (!outputBase) outputBase = `${subreddit}_${cliArgs.desde}_a_${cliArgs.hasta}`;
      } else if (cliArgs['anio-desde'] && cliArgs['anio-hasta']) {
        const y1 = parseInt(cliArgs['anio-desde'], 10);
        const y2 = parseInt(cliArgs['anio-hasta'], 10);
        if (isNaN(y1) || isNaN(y2) || y1 < 2005 || y2 > 2035 || y2 < y1) {
          console.error('Error: --anio-desde y --anio-hasta deben ser años válidos (2005-2035) con anio-hasta >= anio-desde.');
          process.exit(1);
        }
        startUnix = parseArtToUnix(`${y1}-01-01`, false);
        endUnix = parseArtToUnix(`${y2}-12-31`, true);
        if (!outputBase) outputBase = `${subreddit}_${y1}_a_${y2}`;
      } else if (cliArgs.mes || cliArgs.anio) {
        const y = cliArgs.anio ? parseInt(cliArgs.anio, 10) : 2026;
        if (isNaN(y) || y < 2005 || y > 2035) {
          console.error('Error: --anio debe ser un año válido entre 2005 y 2035.');
          process.exit(1);
        }
        if (cliArgs.mes) {
          const m = parseInt(cliArgs.mes, 10);
          if (isNaN(m) || m < 1 || m > 12) {
            console.error('Error: --mes debe ser un número entre 1 y 12.');
            process.exit(1);
          }
          const mesStr = String(m).padStart(2, '0');
          startUnix = parseArtToUnix(`${y}-${mesStr}-01`, false);
          endUnix = parseArtToUnix(`${y}-${mesStr}`, true);
          if (!outputBase) outputBase = `${subreddit}_${y}_${mesStr}`;
        } else {
          startUnix = parseArtToUnix(`${y}-01-01`, false);
          endUnix = parseArtToUnix(`${y}-12-31`, true);
          if (!outputBase) outputBase = `${subreddit}_${y}`;
        }
      } else {
        console.error('Error: Indicá --desde y --hasta, --mes/--anio o --anio-desde y --anio-hasta. Usá --help para ver ejemplos.');
        process.exit(1);
      }
    } else {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      console.log('========================================================');
      console.log('   Buscador Paralelo de Historial Amplio (Multi-Año)    ');
      console.log('========================================================\n');

      subreddit = await askValidated(
        rl,
        'Subreddit a consultar',
        'argentina',
        (v) => {
          const clean = v.replace(/^r\//i, '').trim();
          return /^[a-zA-Z0-9_]+$/.test(clean) ? clean : null;
        },
        'Usá solo letras, números o guion bajo (ej: argentina).'
      );

      const desde = await askValidated(
        rl,
        'Fecha desde (YYYY-MM-DD)',
        '2022-01-01',
        (v) => (isValidDateStr(v) ? v : null),
        'Ingresá una fecha calendario real en formato YYYY-MM-DD (ej: 2022-01-01).'
      );
      startUnix = parseArtToUnix(desde, false);

      const hasta = await askValidated(
        rl,
        'Fecha hasta (YYYY-MM-DD)',
        '2026-01-31',
        (v) => (isValidDateStr(v) && parseArtToUnix(v, true) >= startUnix ? v : null),
        `Ingresá una fecha válida YYYY-MM-DD igual o posterior a ${desde}.`
      );
      endUnix = parseArtToUnix(hasta, true);
      outputBase = `${subreddit}_${desde}_a_${hasta}`;

      shardMode = await askValidated(
        rl,
        'Tamaño de partición paralela [mes / semana / dia]',
        'mes',
        normalizeShardMode,
        'Opciones válidas: mes, semana o dia.'
      );

      concurrency = await askValidated(
        rl,
        `Hilos en paralelo [1-${MAX_CONCURRENCY}]`,
        String(DEFAULT_CONCURRENCY),
        (v) => {
          if (!/^\d+$/.test(v)) return null;
          const n = parseInt(v, 10);
          return (n >= 1 && n <= MAX_CONCURRENCY) ? n : null;
        },
        `Ingresá un número entero entre 1 y ${MAX_CONCURRENCY}.`
      );

      flairFilter = await ask(rl, 'Filtrar por flair (dejar vacío para traer todos)', '');
      skipMd = await askYesNo(rl, '¿Omitir archivo .md para mayor velocidad en historiales grandes? [S/n]', true);
      rl.close();
    }

    if (flairFilter) {
      outputBase += `_flair_${normalizeText(flairFilter).replace(/[^a-z0-9]/g, '_')}`;
    }

    // Crear carpeta única en resultados/
    const slug = getArtTimestampSlug();
    runDir = path.join('resultados', `${outputBase}_${slug}`);
    let suffix = 2;
    while (fs.existsSync(runDir)) {
      runDir = path.join('resultados', `${outputBase}_${slug}_${suffix++}`);
    }
    fs.mkdirSync(runDir, { recursive: true });
  }

  const shardsDir = path.join(runDir, '.shards');
  fs.mkdirSync(shardsDir, { recursive: true });

  const runMeta = { subreddit, startUnix, endUnix, flairFilter, shardMode, outputBase, skipMd };
  fs.writeFileSync(path.join(shardsDir, '_run_meta.json'), JSON.stringify(runMeta, null, 2), 'utf-8');

  const shards = buildTimeShards(startUnix, endUnix, shardMode);
  const normFilter = normalizeText(flairFilter);

  // Detectar shards ya completados si es una reanudación
  let completedShards = 0;
  let totalPostsCollected = 0;
  const pendingShards = [];

  for (const sh of shards) {
    const shFile = path.join(shardsDir, `${sh.id}.json`);
    if (fs.existsSync(shFile)) {
      completedShards++;
      try {
        totalPostsCollected += JSON.parse(fs.readFileSync(shFile, 'utf-8')).length;
      } catch (_) {}
    } else {
      pendingShards.push(sh);
    }
  }

  let stopping = false;
  const handleExit = () => {
    if (stopping) return;
    stopping = true;
    console.log(`\n\n[Pausa]: ${completedShards}/${shards.length} particiones guardadas en "${shardsDir}".`);
    console.log(`Para reanudar exactamente donde quedó, ejecutá:`);
    console.log(`  node buscar.js --resume "${runDir}"\n`);
    process.exit(0);
  };
  process.on('SIGINT', handleExit);
  process.on('SIGTERM', handleExit);

  console.log('\n========================================================');
  console.log(`Subreddit:          r/${subreddit}`);
  console.log(`Rango ART:          ${new Date(startUnix * 1000).toISOString()} -> ${new Date(endUnix * 1000).toISOString()}`);
  console.log(`Particiones (${shardMode}):  ${shards.length} total (${completedShards} ya completas, ${pendingShards.length} pendientes)`);
  console.log(`Hilos en paralelo:  ${concurrency}`);
  console.log(`Carpeta destino:    ${runDir}`);
  console.log('========================================================\n');

  let nextIdx = 0;
  let totalRequests = 0;
  const startTime = Date.now();

  async function processShard(shard, workerId) {
    let cursor = shard.startUnix - 1;
    const shardPosts = [];
    const shardSeen = new Set();
    let batches = 0;

    while (!stopping && cursor < shard.endUnix) {
      batches++;
      totalRequests++;
      const url = `https://arctic-shift.photon-reddit.com/api/posts/search?subreddit=${subreddit}&after=${cursor}&before=${shard.endUnix + 1}&sort=asc&limit=100`;
      const json = await fetchWithAdaptiveRetry(url, workerId);

      if (!json || !Array.isArray(json.data) || json.data.length === 0) {
        break;
      }

      const posts = json.data;
      for (const post of posts) {
        if (post.created_utc >= shard.startUnix && post.created_utc <= shard.endUnix && !shardSeen.has(post.id)) {
          if (normFilter) {
            const postFlairNorm = normalizeText(post.link_flair_text);
            if (!postFlairNorm.includes(normFilter)) continue;
          }
          shardSeen.add(post.id);

          const dateArt = new Date(post.created_utc * 1000).toLocaleString('es-AR', {
            timeZone: 'America/Argentina/Buenos_Aires',
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit'
          });

          shardPosts.push({
            id: post.id,
            title: post.title,
            author: post.author,
            created_utc: post.created_utc,
            date_art: dateArt,
            flair: post.link_flair_text || '(sin flair)',
            score: post.score || 0,
            num_comments: post.num_comments || 0,
            permalink: `https://www.reddit.com${post.permalink}`,
            url: post.url,
            selftext: post.selftext || ''
          });
        }
      }

      const lastTs = posts[posts.length - 1].created_utc;
      if (posts.length < 100 || lastTs >= shard.endUnix) {
        break;
      }
      cursor = lastTs > cursor ? lastTs : cursor + 1;
      await sleep(PER_WORKER_DELAY_MS);
    }

    if (stopping) return;

    // Guardado atómico del shard completado (escritura a .tmp y rename)
    const finalShardFile = path.join(shardsDir, `${shard.id}.json`);
    const tmpShardFile = `${finalShardFile}.tmp`;
    fs.writeFileSync(tmpShardFile, JSON.stringify(shardPosts), 'utf-8');
    fs.renameSync(tmpShardFile, finalShardFile);

    completedShards++;
    totalPostsCollected += shardPosts.length;

    const elapsedSec = Math.max(1, (Date.now() - startTime) / 1000);
    const rate = (totalPostsCollected / elapsedSec).toFixed(1);
    const pct = ((completedShards / shards.length) * 100).toFixed(1);
    console.log(`[${completedShards}/${shards.length} (${pct}%)] [Hilo ${workerId}] ${shard.label}: ${shardPosts.length.toLocaleString()} posts (${batches} lotes) | Acum: ${totalPostsCollected.toLocaleString()} (${rate} posts/s)`);
  }

  async function worker(workerId) {
    while (!stopping) {
      const i = nextIdx++;
      if (i >= pendingShards.length) break;
      await processShard(pendingShards[i], workerId);
      await sleep(PER_WORKER_DELAY_MS);
    }
  }

  const workers = [];
  for (let w = 1; w <= concurrency; w++) {
    workers.push(worker(w));
  }
  await Promise.all(workers);

  if (stopping) return;

  console.log('\n--- Fusionando particiones en streaming (orden cronológico + deduplicación) ---');
  const merged = await mergeShardsStreaming(shards, shardsDir, runDir, outputBase, runMeta, skipMd);
  const totalSec = ((Date.now() - startTime) / 1000).toFixed(1);

  // Limpiar carpeta temporal .shards al completar exitosamente
  fs.rmSync(shardsDir, { recursive: true, force: true });

  console.log('\n========================================================');
  console.log('      BÚSQUEDA HISTÓRICA EN PARALELO COMPLETADA         ');
  console.log('========================================================');
  console.log(`Publicaciones únicas totales:   ${merged.totalWritten.toLocaleString()}`);
  console.log(`Particiones procesadas:         ${shards.length} (${shardMode})`);
  console.log(`Solicitudes HTTP realizadas:    ${totalRequests.toLocaleString()}`);
  console.log(`Tiempo total:                   ${totalSec} segundos (${(merged.totalWritten / Math.max(0.1, Number(totalSec))).toFixed(1)} posts/s)`);
  console.log(`Carpeta de resultados:          ${runDir}`);
  console.log(`  📦 JSON: ${merged.fileJson}`);
  console.log(`  📊 CSV:  ${merged.fileCsv}`);
  if (merged.fileMd) console.log(`  📄 MD:   ${merged.fileMd}`);
  console.log('========================================================\n');
}

main().catch(err => {
  console.error('\nError fatal:', err);
  process.exit(1);
});
