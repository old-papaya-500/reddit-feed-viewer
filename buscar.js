#!/usr/bin/env node
// buscar.js - Buscador Universal de Reddit (r/argentina u otros)
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const USER_AGENT = 'reddit-universal-researcher/1.0 (pure nodejs)';
const ART_OFFSET_HOURS = -3; // Argentina Time UTC-3

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Convierte 'YYYY-MM-DD' o fecha y hora en timestamp UNIX respetando horario de Argentina (UTC-3)
function parseArtToUnix(dateStr, isEndOfDay = false) {
  // dateStr esperado: YYYY-MM-DD o YYYY-MM
  const parts = dateStr.trim().split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parts[2] ? parseInt(parts[2], 10) : (isEndOfDay ? new Date(year, month + 1, 0).getDate() : 1);

  const hours = isEndOfDay ? 23 : 0;
  const minutes = isEndOfDay ? 59 : 0;
  const seconds = isEndOfDay ? 59 : 0;

  // Fecha local asumida como ART (UTC-3), por lo que en UTC es +3 horas
  const utcDate = new Date(Date.UTC(year, month, day, hours - ART_OFFSET_HOURS, minutes, seconds));
  return Math.floor(utcDate.getTime() / 1000);
}

// Genera un sello de tiempo único en horario argentino (ART UTC-3): YYYYMMDD_HHMMSS
function getArtTimestampSlug() {
  const art = new Date(Date.now() + ART_OFFSET_HOURS * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${art.getUTCFullYear()}${p(art.getUTCMonth() + 1)}${p(art.getUTCDate())}_${p(art.getUTCHours())}${p(art.getUTCMinutes())}${p(art.getUTCSeconds())}`;
}

// Crea una carpeta única dentro de resultados/ para almacenar esta corrida sin mezclar archivos
function createUniqueRunDir(baseRoot, folderPrefix) {
  let candidate = path.join(baseRoot, `${folderPrefix}_${getArtTimestampSlug()}`);
  let suffix = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(baseRoot, `${folderPrefix}_${getArtTimestampSlug()}_${suffix++}`);
  }
  fs.mkdirSync(candidate, { recursive: true });
  return candidate;
}

// Normaliza texto para búsqueda de flairs (sin tildes, minúsculas)
function normalizeText(str) {
  if (!str) return '';
  return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
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

function isValidDateStr(str) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const [y, m, d] = str.split('-').map(Number);
  if (y < 2005 || y > 2035 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const check = new Date(Date.UTC(y, m - 1, d));
  return check.getUTCFullYear() === y && (check.getUTCMonth() + 1) === m && check.getUTCDate() === d;
}

// Pregunta por consola para modo interactivo
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

async function fetchWithRetry(url, maxRetries = 10) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
      if (res.status === 200) return await res.json();
      if (res.status === 422 || res.status === 429 || res.status >= 500) {
        const wait = Math.min(attempt * 8, 60);
        console.warn(`  [HTTP ${res.status}] Enfriando y reintentando en ${wait}s (${attempt}/${maxRetries})...`);
        await sleep(wait * 1000);
        continue;
      }
      console.warn(`  [HTTP ${res.status}] Error no recuperable.`);
      return null;
    } catch (err) {
      const wait = Math.min(attempt * 8, 60);
      console.warn(`  [Red: ${err.message}] Reintentando en ${wait}s...`);
      await sleep(wait * 1000);
    }
  }
  return null;
}

function showHelp() {
  console.log(`
Uso de buscar.js:

  1) Modo Interactivo (sin argumentos):
     node buscar.js

  2) Modo con Argumentos:
     node buscar.js [opciones]

Opciones disponibles:
  --sub <nombre>        Nombre del subreddit (por defecto: argentina)
  --mes <1-12>          Mes a buscar (requiere --anio)
  --anio <YYYY>         Año a buscar
  --desde <YYYY-MM-DD>  Fecha inicial (00:00:00 ART)
  --hasta <YYYY-MM-DD>  Fecha final (23:59:59 ART)
  --fecha <YYYY-MM-DD>  Un día específico completo
  --flair <texto>       Filtrar por texto de flair (ej: "Política", "Economía", "Serio", etc.)
  --out <prefijo>       Nombre base de los archivos generados
  --help, -h            Muestra esta ayuda

Ejemplos:
  # Buscar todo enero de 2026 en r/argentina:
  node buscar.js --mes 1 --anio 2026

  # Buscar solo con un flair específico en todo 2026:
  node buscar.js --desde 2026-01-01 --hasta 2026-12-31 --flair "Economía"

  # Buscar en otro subreddit un rango específico:
  node buscar.js --sub AskArgentina --desde 2026-01-01 --hasta 2026-01-15
`);
}

async function main() {
  const cliArgs = parseArgs();

  if (cliArgs.help) {
    showHelp();
    return;
  }

  let subreddit = cliArgs.sub || '';
  let startUnix = 0;
  let endUnix = 0;
  let flairFilter = cliArgs.flair || '';
  let outputBase = cliArgs.out || '';

  // 1. Determinar configuración (CLI o interactivo)
  const isCli = cliArgs.mes || cliArgs.desde || cliArgs.fecha || cliArgs.anio;

  if (isCli) {
    subreddit = subreddit || 'argentina';

    if (cliArgs.fecha) {
      startUnix = parseArtToUnix(cliArgs.fecha, false);
      endUnix = parseArtToUnix(cliArgs.fecha, true);
      if (!outputBase) outputBase = `${subreddit}_${cliArgs.fecha}`;
    } else if (cliArgs.desde && cliArgs.hasta) {
      startUnix = parseArtToUnix(cliArgs.desde, false);
      endUnix = parseArtToUnix(cliArgs.hasta, true);
      if (!outputBase) outputBase = `${subreddit}_${cliArgs.desde}_a_${cliArgs.hasta}`;
    } else if (cliArgs.mes && cliArgs.anio) {
      const mesStr = String(cliArgs.mes).padStart(2, '0');
      const startStr = `${cliArgs.anio}-${mesStr}-01`;
      startUnix = parseArtToUnix(startStr, false);
      endUnix = parseArtToUnix(`${cliArgs.anio}-${mesStr}`, true);
      if (!outputBase) outputBase = `${subreddit}_${cliArgs.anio}_${mesStr}`;
    } else if (cliArgs.anio) {
      startUnix = parseArtToUnix(`${cliArgs.anio}-01-01`, false);
      endUnix = parseArtToUnix(`${cliArgs.anio}-12-31`, true);
      if (!outputBase) outputBase = `${subreddit}_${cliArgs.anio}`;
    } else {
      console.error('Error: Parámetros de fecha incompletos. Usa --help para ver ejemplos.');
      process.exit(1);
    }
  } else {
    // Modo interactivo por consola
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log('========================================================');
    console.log('       Buscador Universal de Publicaciones Reddit       ');
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

    console.log('\nSeleccioná el modo de búsqueda temporal:');
    console.log('  1) Mes y año completo (ej: Enero 2026)');
    console.log('  2) Rango de fechas (desde / hasta)');
    console.log('  3) Un día específico (ej: 2026-01-15)');
    const opcion = await askValidated(
      rl,
      'Opción [1-3]',
      '1',
      (v) => (['1', '2', '3'].includes(v) ? v : null),
      'Elegí 1, 2 o 3.'
    );

    if (opcion === '1') {
      const mes = await askValidated(
        rl,
        'Número de mes (1 a 12)',
        '1',
        (v) => (/^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 12 ? Number(v) : null),
        'Ingresá un número entre 1 y 12.'
      );
      const anio = await askValidated(
        rl,
        'Año (YYYY)',
        '2026',
        (v) => (/^\d{4}$/.test(v) && Number(v) >= 2005 && Number(v) <= 2035 ? Number(v) : null),
        'Ingresá un año válido de 4 dígitos (2005-2035).'
      );
      const mesStr = String(mes).padStart(2, '0');
      startUnix = parseArtToUnix(`${anio}-${mesStr}-01`, false);
      endUnix = parseArtToUnix(`${anio}-${mesStr}`, true);
      outputBase = `${subreddit}_${anio}_${mesStr}`;
    } else if (opcion === '2') {
      const desde = await askValidated(
        rl,
        'Fecha desde (YYYY-MM-DD)',
        '2026-01-01',
        (v) => (isValidDateStr(v) ? v : null),
        'Ingresá una fecha válida en formato YYYY-MM-DD.'
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
    } else if (opcion === '3') {
      const dia = await askValidated(
        rl,
        'Fecha específica (YYYY-MM-DD)',
        '2026-01-01',
        (v) => (isValidDateStr(v) ? v : null),
        'Ingresá una fecha válida en formato YYYY-MM-DD.'
      );
      startUnix = parseArtToUnix(dia, false);
      endUnix = parseArtToUnix(dia, true);
      outputBase = `${subreddit}_${dia}`;
    }

    flairFilter = await ask(rl, 'Filtrar por flair (dejar vacío para traer todos)', '');
    rl.close();
  }

  if (flairFilter) {
    outputBase += `_flair_${normalizeText(flairFilter).replace(/[^a-z0-9]/g, '_')}`;
  }

  const startDateIso = new Date(startUnix * 1000).toISOString();
  const endDateIso = new Date(endUnix * 1000).toISOString();

  console.log('\n========================================================');
  console.log(`Subreddit: r/${subreddit}`);
  console.log(`Rango ART: Desde ${startUnix} (${startDateIso}) hasta ${endUnix} (${endDateIso})`);
  if (flairFilter) console.log(`Filtro por flair: "${flairFilter}"`);
  console.log('========================================================\n');

  // Consulta mediante Arctic Shift con ventana amplia
  let currentAfter = startUnix - 7200; // 2 horas antes para margen
  let batchNum = 0;
  const allPosts = [];
  const seenIds = new Set();
  const normFilter = normalizeText(flairFilter);

  while (currentAfter < endUnix) {
    batchNum++;
    const url = `https://arctic-shift.photon-reddit.com/api/posts/search?subreddit=${subreddit}&after=${currentAfter}&sort=asc&limit=100`;

    const json = await fetchWithRetry(url);
    if (!json || !json.data || json.data.length === 0) {
      console.log(`Lote ${batchNum}: No hay más datos devueltos. Fin.`);
      break;
    }

    const posts = json.data;
    let added = 0;

    for (const post of posts) {
      if (post.created_utc >= startUnix && post.created_utc <= endUnix && !seenIds.has(post.id)) {
        // Filtrado opcional por flair
        if (normFilter) {
          const postFlairNorm = normalizeText(post.link_flair_text);
          if (!postFlairNorm.includes(normFilter)) {
            continue;
          }
        }

        seenIds.add(post.id);

        const dateObj = new Date(post.created_utc * 1000);
        const dateArt = dateObj.toLocaleString('es-AR', {
          timeZone: 'America/Argentina/Buenos_Aires',
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit'
        });

        allPosts.push({
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
        added++;
      }
    }

    const lastPost = posts[posts.length - 1];
    const lastDate = new Date(lastPost.created_utc * 1000).toISOString();
    console.log(`Lote ${batchNum}: ${posts.length} recibidos, ${added} coincidieron (Total: ${allPosts.length}). Alcanzado: ${lastDate}`);

    if (lastPost.created_utc > endUnix) {
      console.log('Se superó la fecha final del rango solicitado. Finalizando.');
      break;
    }

    currentAfter = lastPost.created_utc > currentAfter ? lastPost.created_utc : currentAfter + 1;
    await sleep(2200); // Respetar rate limits
  }

  allPosts.sort((a, b) => a.created_utc - b.created_utc);

  console.log('\n========================================================');
  console.log(`FINALIZADO: ${allPosts.length} publicaciones encontradas`);
  console.log('========================================================\n');

  // Crear carpeta única dentro de resultados/ para mantener ordenados los archivos de esta corrida
  const runDir = createUniqueRunDir('resultados', outputBase);
  const fileMd = path.join(runDir, `${outputBase}.md`);
  const fileJson = path.join(runDir, `${outputBase}.json`);
  const fileCsv = path.join(runDir, `${outputBase}.csv`);

  // Guardar JSON
  fs.writeFileSync(fileJson, JSON.stringify(allPosts, null, 2), 'utf-8');

  // Guardar Markdown
  let md = `# Publicaciones de r/${subreddit}\n\n`;
  md += `- **Subreddit:** r/${subreddit}\n`;
  md += `- **Período (ART UTC-3):** ${startDateIso} a ${endDateIso}\n`;
  if (flairFilter) md += `- **Filtro de Flair:** "${flairFilter}"\n`;
  md += `- **Total de publicaciones:** ${allPosts.length}\n\n`;
  md += `| # | Link | Fecha (ART) | Título | Votos | Flair |\n`;
  md += `|---|---|---|---|---|---|\n`;

  allPosts.forEach((p, idx) => {
    const cleanTitle = p.title.replace(/\|/g, '\\|').replace(/\n/g, ' ').trim();
    const cleanFlair = (p.flair || '').replace(/\|/g, '\\|');
    md += `| ${idx + 1} | [Reddit](${p.permalink}) | ${p.date_art} | ${cleanTitle} | ${p.score} | ${cleanFlair} |\n`;
  });

  md += `\n---\n*Generado el ${new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}*\n`;
  fs.writeFileSync(fileMd, md, 'utf-8');

  // Guardar CSV (con BOM UTF-8 para apertura directa y limpia en Microsoft Excel)
  function escapeCsv(val) {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  }

  let csv = '\uFEFF'; // Byte Order Mark para compatibilidad UTF-8 en Excel
  csv += ['#', 'ID', 'Fecha (ART)', 'Título', 'Autor', 'Votos', 'Comentarios', 'Flair', 'Link', 'URL'].map(escapeCsv).join(',') + '\n';

  allPosts.forEach((p, idx) => {
    const row = [
      idx + 1,
      p.id,
      p.date_art,
      p.title,
      p.author,
      p.score,
      p.num_comments,
      p.flair,
      p.permalink,
      p.url
    ];
    csv += row.map(escapeCsv).join(',') + '\n';
  });
  fs.writeFileSync(fileCsv, csv, 'utf-8');

  console.log(`Carpeta de resultados creada: ${runDir}`);
  console.log(`Archivos creados exitosamente:`);
  console.log(`  📄 Markdown: ${fileMd}`);
  console.log(`  📊 CSV:      ${fileCsv}`);
  console.log(`  📦 JSON:     ${fileJson}`);
}

main().catch(console.error);
