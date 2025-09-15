const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const ts = require('typescript');

require.extensions['.ts'] = function (module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: filename,
  });
  module._compile(outputText, filename);
};

const { nearestOnPolyline, slicePolylineByDistance } = require('../src/logic/route.ts');
const { haversine } = require('../src/logic/distance.ts');

test('nearestOnPolyline projects onto first segment', () => {
  const poly = [
    [0, 0],
    [0, 1],
    [1, 1],
  ];
  const p = [0.2, 0.5];
  const res = nearestOnPolyline(p, poly);
  const d01 = haversine(poly[0], poly[1]);
  assert.strictEqual(res.segIndex, 0);
  assert.ok(Math.abs(res.t - 0.5) < 1e-3);
  assert.ok(Math.abs(res.routeDist - d01 * 0.5) < 1);
  assert.ok(Math.abs(res.point[0] - 0) < 1e-6);
  assert.ok(Math.abs(res.point[1] - 0.5) < 1e-6);
});

test('nearestOnPolyline projects onto second segment', () => {
  const poly = [
    [0, 0],
    [0, 1],
    [1, 1],
  ];
  const p = [0.6, 1.2];
  const res = nearestOnPolyline(p, poly);
  const d01 = haversine(poly[0], poly[1]);
  const d12 = haversine(poly[1], poly[2]);
  assert.strictEqual(res.segIndex, 1);
  assert.ok(Math.abs(res.t - 0.6) < 1e-3);
  assert.ok(Math.abs(res.routeDist - (d01 + d12 * 0.6)) < 1);
  assert.ok(Math.abs(res.point[0] - 0.6) < 1e-6);
  assert.ok(Math.abs(res.point[1] - 1) < 1e-6);
});

test('slicePolylineByDistance extracts segment correctly', () => {
  const poly = [
    [0, 0],
    [0, 1],
    [1, 1],
  ];
  const d01 = haversine(poly[0], poly[1]);
  const d12 = haversine(poly[1], poly[2]);
  const start = d01 / 2;
  const end = d01 + d12 / 2;
  const out = slicePolylineByDistance(poly, start, end);
  const expected = [
    [0, 0.5],
    [0, 1],
    [0.5, 1],
  ];
  assert.strictEqual(out.length, expected.length);
  for (let i = 0; i < expected.length; i++) {
    assert.ok(Math.abs(out[i][0] - expected[i][0]) < 1e-6);
    assert.ok(Math.abs(out[i][1] - expected[i][1]) < 1e-6);
  }
});
