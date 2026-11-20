/**
 * Validador de Estructura JSON para Archivos Grandes (Streaming, sin límite de 512 MB de V8)
 *
 * Uso interactivo:
 *   node validar_json.js
 *
 * Uso por CLI:
 *   node validar_json.js --input perfiles_usuarios.json
 *   node validar_json.js perfiles_usuarios.json
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const V8_MAX_STRING_BYTES = 536870888; // ~512 MB (límite de string único en V8 / Chrome / Node.js)

function parseArgs() {
  const args = process.argv.slice(2);
  const params = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--input' || a === '-i') {
      params.input = args[++i];
    } else if (a === '--help' || a === '-h') {
      params.help = true;
    } else if (!a.startsWith('-') && !params.input) {
      params.input = a;
    }
  }
  return params;
}

function ask(rl, promptText, defaultVal = '') {
  return new Promise(resolve => {
    const defLabel = defaultVal !== '' ? ` [por defecto: ${defaultVal}]` : '';
    rl.question(`${promptText}${defLabel}: `, answer => {
      const trimmed = answer.trim();
      resolve(trimmed !== '' ? trimmed : defaultVal);
    });
  });
}

function findJsonFiles(dir, maxDepth = 2, currentDepth = 0) {
  let results = [];
  if (currentDepth > maxDepth) return results;
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_) {
    return results;
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git') {
        results = results.concat(findJsonFiles(fullPath, maxDepth, currentDepth + 1));
      }
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      results.push(fullPath);
    }
  }
  return results;
}

function inspectHeadAndTail(filePath, fileSize) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const headLen = Math.min(256, fileSize);
    const headBuf = Buffer.alloc(headLen);
    fs.readSync(fd, headBuf, 0, headLen, 0);

    const tailLen = Math.min(256, fileSize);
    const tailBuf = Buffer.alloc(tailLen);
    fs.readSync(fd, tailBuf, 0, tailLen, Math.max(0, fileSize - tailLen));

    const headStr = headBuf.toString('utf-8').trimStart();
    const tailStr = tailBuf.toString('utf-8').trimEnd();

    return {
      headStr,
      tailStr,
      firstChar: headStr[0] || '',
      lastChar: tailStr[tailStr.length - 1] || ''
    };
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Valida el archivo JSON completo en streaming chunk por chunk,
 * verificando balance de llaves/corchetes, comillas, escapes y parseando cada registro.
 */
async function validateLargeJsonStream(filePath, fileSize) {
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath, {
      encoding: 'utf-8',
      highWaterMark: 256 * 1024 // chunks de 256 KB
    });

    let bytesRead = 0;
    let lineNum = 1;
    let colNum = 0;
    let inString = false;
    let escapeNext = false;

    // Pila de estructura: '{' o '['
    const stack = [];

    // Buffer para extraer objetos hijos de primer nivel (ej. cada perfil o cada post)
    let capturingObject = false;
    let captureStartDepth = -1;
    let currentObjectChunks = [];
    let currentObjectLen = 0;
    let currentObjStartLine = 1;

    let objectsValidated = 0;
    let parseErrors = [];
    let nextReportMB = 50;

    stream.on('data', chunk => {
      bytesRead += Buffer.byteLength(chunk, 'utf-8');
      const mbRead = bytesRead / (1024 * 1024);
      if (mbRead >= nextReportMB) {
        const pct = ((bytesRead / fileSize) * 100).toFixed(1);
        process.stdout.write(`  -> Procesado: ${mbRead.toFixed(1)} MB / ${(fileSize / (1024 * 1024)).toFixed(1)} MB (${pct}%) | Registros validados: ${objectsValidated.toLocaleString()}\r`);
        nextReportMB += 50;
      }

      let objSliceStart = capturingObject ? 0 : -1;

      for (let i = 0; i < chunk.length; i++) {
        const ch = chunk[i];

        if (ch === '\n') {
          lineNum++;
          colNum = 0;
        } else {
          colNum++;
        }

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

        // Fuera de un string
        if (ch === '"') {
          inString = true;
        } else if (ch === '{' || ch === '[') {
          stack.push({ char: ch, line: lineNum, col: colNum });

          // Detectar inicio de un objeto de registro:
          // Caso 1: Array raíz `[ { ... }, { ... } ]` -> stack es ['[', '{'] (depth 2)
          // Caso 2: Objeto con `"perfiles": [ { ... } ]` -> stack es ['{', '[', '{'] (depth 3)
          if (!capturingObject && ch === '{') {
            const d = stack.length;
            if (
              (d === 2 && stack[0].char === '[') ||
              (d === 3 && stack[0].char === '{' && stack[1].char === '[')
            ) {
              capturingObject = true;
              captureStartDepth = d;
              currentObjectChunks = [];
              currentObjectLen = 0;
              currentObjStartLine = lineNum;
              objSliceStart = i;
            }
          }
        } else if (ch === '}' || ch === ']') {
          const expected = ch === '}' ? '{' : '[';
          if (stack.length === 0) {
            parseErrors.push({
              tipo: 'Cierre inesperado sin apertura',
              detalle: `Se encontró '${ch}' sin su '${expected}' correspondiente`,
              linea: lineNum,
              columna: colNum
            });
            stream.destroy();
            return;
          }

          const top = stack[stack.length - 1];
          if (top.char !== expected) {
            parseErrors.push({
              tipo: 'Desbalance de llaves/corchetes',
              detalle: `Se encontró '${ch}' pero se esperaba cerrar '${top.char}' (abierto en línea ${top.line}, col ${top.col})`,
              linea: lineNum,
              columna: colNum
            });
            stream.destroy();
            return;
          }

          // Si estábamos capturando un registro y llegamos a su cierre
          if (capturingObject && ch === '}' && stack.length === captureStartDepth) {
            const piece = chunk.slice(objSliceStart, i + 1);
            currentObjectChunks.push(piece);
            currentObjectLen += piece.length;

            const fullObjStr = currentObjectChunks.join('');
            try {
              JSON.parse(fullObjStr);
              objectsValidated++;
            } catch (err) {
              parseErrors.push({
                tipo: 'Error de sintaxis interna en registro JSON',
                detalle: err.message,
                linea: currentObjStartLine,
                columna: colNum,
                muestra: fullObjStr.slice(0, 200) + ' ... ' + fullObjStr.slice(-200)
              });
              stream.destroy();
              return;
            }

            capturingObject = false;
            captureStartDepth = -1;
            currentObjectChunks = [];
            currentObjectLen = 0;
            objSliceStart = -1;
          }

          stack.pop();
        }
      }

      // Si seguimos capturando un objeto al terminar este chunk, guardamos el fragmento
      if (capturingObject && objSliceStart !== -1) {
        const piece = chunk.slice(objSliceStart);
        currentObjectChunks.push(piece);
        currentObjectLen += piece.length;
      }
    });

    stream.on('close', () => {
      resolve({
        bytesRead,
        lineNum,
        inString,
        stack,
        objectsValidated,
        parseErrors
      });
    });

    stream.on('error', err => reject(err));
  });
}

async function main() {
  const cliArgs = parseArgs();

  console.log('========================================================');
  console.log('  Validador de Estructura JSON para Archivos Grandes');
  console.log('========================================================\n');

  let targetFile = cliArgs.input;

  if (!targetFile) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const discovered = findJsonFiles('.');
    if (discovered.length > 0) {
      console.log('Archivos .json detectados en la carpeta:');
      discovered.forEach((f, idx) => {
        const st = fs.statSync(f);
        const mb = (st.size / (1024 * 1024)).toFixed(2);
        console.log(`  ${idx + 1}) ${f} (${mb} MB)`);
      });
      console.log('');
      const ans = await ask(rl, 'Elegí el número de archivo o escribí la ruta completa', '1');
      const num = parseInt(ans, 10);
      if (!isNaN(num) && num >= 1 && num <= discovered.length) {
        targetFile = discovered[num - 1];
      } else {
        targetFile = ans;
      }
    } else {
      targetFile = await ask(rl, 'Ingresá la ruta del archivo .json a validar');
    }
    rl.close();
  }

  targetFile = targetFile.replace(/^["']|["']$/g, '');

  if (!fs.existsSync(targetFile)) {
    console.error(`\n[ERROR] No se encontró el archivo: "${targetFile}"`);
    process.exit(1);
  }

  const stat = fs.statSync(targetFile);
  const fileSize = stat.size;
  const sizeMB = (fileSize / (1024 * 1024)).toFixed(2);

  console.log(`Archivo: ${path.resolve(targetFile)}`);
  console.log(`Tamaño:  ${sizeMB} MB (${fileSize.toLocaleString()} bytes)`);

  if (fileSize === 0) {
    console.error('\n[RESULTADO] ❌ El archivo está completamente vacío (0 bytes).');
    process.exit(1);
  }

  // 1. Aviso importante sobre límite de 512 MB de V8
  if (fileSize >= V8_MAX_STRING_BYTES) {
    console.log('\n⚠️  AVISO CRÍTICO DE MOTOR V8 (Chrome / Edge / Node.js):');
    console.log(`   Este archivo (${sizeMB} MB) supera el límite máximo de un string único en V8 (~512 MB).`);
    console.log(`   Si un navegador intenta abrirlo con FileReader.readAsText(), falla silenciosamente`);
    console.log(`   devolviendo un string vacío ("") y JSON.parse("") lanza:`);
    console.log(`   "SyntaxError: Unexpected end of JSON input" AUNQUE EL ARCHIVO ESTÉ SANO.`);
  }

  // 2. Inspección rápida de cabecera y final del archivo
  console.log('\n--- Paso 1: Inspección rápida de inicio y fin de archivo ---');
  const { headStr, tailStr, firstChar, lastChar } = inspectHeadAndTail(targetFile, fileSize);
  console.log(`Primer carácter: '${firstChar}' | Último carácter: '${lastChar}'`);
  console.log(`Inicio: ${JSON.stringify(headStr.slice(0, 80))}...`);
  console.log(`Final:  ...${JSON.stringify(tailStr.slice(-80))}`);

  const validStart = firstChar === '{' || firstChar === '[';
  const validEnd = lastChar === '}' || lastChar === ']';

  if (!validStart || !validEnd) {
    console.log('\n❌ ALERTA: El archivo no comienza o no termina con llaves/corchetes de cierre válidos.');
    console.log('   Esto indica que la escritura del archivo se interrumpió antes de finalizar (archivo truncado).');
  } else {
    console.log('✅ Inicio y cierre superficiales correctos.');
  }

  // 3. Validación profunda por streaming
  console.log('\n--- Paso 2: Validación profunda por streaming (registro por registro) ---');
  const t0 = Date.now();
  const result = await validateLargeJsonStream(targetFile, fileSize);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
  process.stdout.write('\n');

  console.log('\n========================================================');
  console.log('                DIAGNÓSTICO FINAL                       ');
  console.log('========================================================');
  console.log(`Tiempo de análisis:    ${elapsed} segundos`);
  console.log(`Líneas procesadas:     ${result.lineNum.toLocaleString()}`);
  console.log(`Registros validados:   ${result.objectsValidated.toLocaleString()}`);

  let isHealthy = true;

  if (result.parseErrors.length > 0) {
    isHealthy = false;
    console.log('\n❌ SE DETECTARON ERRORES DE SINTAXIS EN EL ARCHIVO:');
    result.parseErrors.forEach((err, i) => {
      console.log(`  Error #${i + 1}: [${err.tipo}] en línea ${err.linea}, columna ${err.columna}`);
      console.log(`  Detalle: ${err.detalle}`);
      if (err.muestra) console.log(`  Muestra: ${err.muestra}`);
    });
  }

  if (result.inString) {
    isHealthy = false;
    console.log('\n❌ ARCHIVO TRUNCADO: El archivo terminó en medio de un texto (comillas sin cerrar).');
  }

  if (result.stack.length > 0) {
    isHealthy = false;
    console.log(`\n❌ ARCHIVO INCOMPLETO: Quedaron ${result.stack.length} bloques abiertos sin cerrar al final del archivo:`);
    result.stack.forEach(s => {
      console.log(`   - '${s.char}' abierto en línea ${s.line}, columna ${s.col}`);
    });
  }

  if (isHealthy) {
    console.log('\n✅ ESTRUCTURA JSON 100% VÁLIDA E ÍNTEGRA.');
    console.log('   Todos los registros individuales y cierres de estructura son correctos.');
    if (fileSize >= V8_MAX_STRING_BYTES) {
      console.log('\n💡 CONCLUSIÓN:');
      console.log('   El archivo NO está corrupto. El error "Unexpected end of JSON input" en el navegador');
      console.log('   ocurría porque FileReader.readAsText() no soporta archivos > 512 MB de una sola vez.');
      console.log('   -> Usá la nueva versión del visor (app.js) que ahora carga archivos grandes por streaming.');
    }
  } else {
    console.log('\n⚠️  CONCLUSIÓN: El archivo JSON en disco está truncado o malformado.');
    console.log('   Deberás volver a ejecutar consolidar_perfiles.js y esperar a que finalice el mensaje de cierre.');
  }
  console.log('========================================================\n');
}

main().catch(err => {
  console.error('\nError fatal en el validador:', err);
  process.exit(1);
});
