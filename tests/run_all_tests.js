#!/usr/bin/env node
// run_all_tests.js - Runner unificado de pruebas automatizadas (Node.js puro, cero dependencias)
const path = require('path');
const { spawnSync } = require('child_process');

const testFiles = [
  path.join(__dirname, 'test_pipeline.js'),
  path.join(__dirname, 'test_viewer_dom.js')
];

console.log('========================================================');
console.log('   Reddit Feed Viewer — Pruebas Automatizadas (Node)    ');
console.log('========================================================\n');

const isolationArgs = process.allowedNodeEnvironmentFlags.has('--test-isolation')
  ? ['--test-isolation=none']
  : [];

const res = spawnSync(process.execPath, ['--test', ...isolationArgs, ...testFiles], {
  stdio: 'inherit'
});

if (res.status === 0) {
  console.log('\n[QA Visual] Nota: test_viewer_dom.js valida JS e IDs DOM, pero no CSS ni layout.');
  console.log('Ante cambios visuales en viewer/, verificá viewer/index.html en navegador con tests/fixtures/mini_perfiles.json antes de commitear.');
}

process.exit(res.status === null ? 1 : res.status);
