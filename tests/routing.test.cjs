const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function loadTsModule(file) {
  const src = fs.readFileSync(file, 'utf8');
  const { outputText } = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: file,
  });
  const module = { exports: {} };
  const req = (p) => {
    if (p.startsWith('.') || p.startsWith('/')) {
      const full = path.resolve(path.dirname(file), p);
      const tsFile = full.endsWith('.ts') ? full : full + '.ts';
      if (fs.existsSync(tsFile)) return loadTsModule(tsFile);
      return require(full);
    }
    return require(p);
  };
  const fn = new Function('require', 'module', 'exports', outputText);
  fn(req, module, module.exports);
  return module.exports;
}

const { haversine } = loadTsModule(path.resolve(__dirname, '../src/logic/distance.ts'));
const { findClosestStopByWalking } = loadTsModule(path.resolve(__dirname, '../src/logic/routing.ts'));

test('fallback uses haversine distance', async () => {
  const point = [0, 0];
  const stops = [
    [0, 0.01],
    [0, 0.02],
  ];
  const result = await findClosestStopByWalking(point, stops, 0);
  assert.ok(result);
  const expected = haversine(point, stops[0]);
  assert.ok(Math.abs(result.distanceMeters - expected) < 1e-6);
});
