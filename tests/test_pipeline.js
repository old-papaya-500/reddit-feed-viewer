const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const RELEASE_DIR = path.resolve(__dirname, '..');
const FIXTURES_DIR = path.join(__dirname, 'fixtures');

function collectJsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', '.git', 'resultados', 'tests'].includes(entry.name)) continue;
      out.push(...collectJsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

test('Sintaxis válida (node --check) en todos los scripts .js de la suite y viewer/', () => {
  const jsFiles = collectJsFiles(RELEASE_DIR);
  assert.ok(jsFiles.length >= 6, `Se esperaban al menos 6 archivos .js, encontrados: ${jsFiles.length}`);
  for (const file of jsFiles) {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  }
});

test('Consolidación end-to-end (consolidar_perfiles.js + validar_json.js) sobre mini-fixtures', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reddit-feed-viewer-test-'));
  const outJson = path.join(tmpDir, 'perfiles_test.json');
  const outCsv = path.join(tmpDir, 'perfiles_test_ranking.csv');

  try {
    const inputs = [
      path.join(FIXTURES_DIR, 'mini_posts.json'),
      path.join(FIXTURES_DIR, 'mini_comentarios.json')
    ].join(',');

    execFileSync(process.execPath, [
      path.join(RELEASE_DIR, 'consolidar_perfiles.js'),
      '--input', inputs,
      '--out', outJson
    ], { stdio: 'pipe' });

    assert.ok(fs.existsSync(outJson), 'Debe generar el JSON consolidado');
    assert.ok(fs.existsSync(outCsv), 'Debe generar el CSV resumen');

    // Validar integridad con validar_json.js
    const valOut = execFileSync(process.execPath, [
      path.join(RELEASE_DIR, 'validar_json.js'),
      outJson
    ], { encoding: 'utf-8' });
    assert.match(valOut, /100% VÁLIDA E ÍNTEGRA/, 'validar_json.js debe certificar el JSON como válido');

    const data = JSON.parse(fs.readFileSync(outJson, 'utf-8'));
    assert.equal(data.metadata.posts_totales_indexados, 6);
    assert.equal(data.metadata.comentarios_totales_indexados, 21);
    assert.equal(data.metadata.usuarios_identificados, 8, 'Solo usuarios reales deben contar en usuarios_identificados');

    // Verificar bloque anónimo [deleted] preservado pero fuera del CSV
    const anonEntry = data.perfiles.find(p => p.es_anonimo === true);
    assert.ok(anonEntry, 'Debe existir bloque es_anonimo para posts/comentarios [deleted]');
    assert.equal(anonEntry.metricas.total_posts, 1);
    assert.equal(anonEntry.metricas.total_comentarios, 1);

    const csvText = fs.readFileSync(outCsv, 'utf-8');
    assert.equal(csvText.includes('[deleted]'), false, '[deleted] nunca debe aparecer en el CSV');

    // Verificar preservación de comentario modo ligero (--lite)
    const carol = data.perfiles.find(p => p.usuario === 'carol');
    const c014 = carol.timeline.find(t => t.id === 'c014');
    assert.equal(c014.lite, true, 'Comentario --lite debe conservar lite: true');
    assert.equal(c014.cuerpo, undefined, 'Comentario --lite no debe guardar cuerpo vacío');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
