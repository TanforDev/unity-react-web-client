import test from 'node:test';
import assert from 'node:assert/strict';
import { buildConfig, classifyFile, findArtifact, validateManifest } from '../manifest-lib.mjs';

const obj = key => ({ key });
const legacy = { id: '20260929-153619', objects: ['Build/20260929-153619.data.br', 'Build/20260929-153619.loader.js.br',
  'Build/20260929-153619.framework.js.br', 'Build/20260929-153619.wasm.br'].map(obj) };
const opts = { cdn: 'https://abc.cloudfront.net', prefix: 'dev/20260929-153619/' };

test('classifyFile compresses raw engine files and keeps compressed inputs intact', () => {
  assert.deepEqual(classifyFile('Build/a.wasm'), { objectKey: 'Build/a.wasm.br', contentType: 'application/wasm', encoding: 'br', compress: true, alreadyCompressed: false });
  const pre = classifyFile('Build/a.data.br');
  assert.equal(pre.compress, false);
  assert.equal(pre.objectKey, 'Build/a.data.br');
  assert.equal(pre.encoding, 'br');
  assert.equal(pre.contentType, 'application/octet-stream');
  const gz = classifyFile('Build/a.framework.js.gz');
  assert.equal(gz.encoding, 'gzip');
  assert.equal(gz.contentType, 'application/javascript');
  assert.equal(classifyFile('StreamingAssets/aa/x.json').encoding, null);
  assert.equal(classifyFile('StreamingAssets/aa/x.bundle').compress, false);
});

test('legacy manifest produces the single-data-file config', () => {
  const c = buildConfig(legacy, opts);
  assert.equal(c.data, 'Build/20260929-153619.data.br');
  assert.equal(c.version, undefined);
  assert.equal(c.baseUrl, 'https://abc.cloudfront.net/dev/20260929-153619/');
});

test('progressive manifest produces version 2 with primary/secondary lists', () => {
  const m = { ...legacy, objects: [...legacy.objects, obj('Build/p0.data.br'), obj('Build/s0.data.br')],
    progressive: { primary: ['Build/p0.data.br'], secondary: ['Build/s0.data.br'] } };
  const c = buildConfig(m, opts);
  assert.equal(c.version, 2);
  assert.deepEqual(c.progressive, { primary: ['Build/p0.data.br'], secondary: ['Build/s0.data.br'] });
  assert.equal(c.data, undefined);
});

test('missing references are rejected', () => {
  const bad = { ...legacy, progressive: { primary: ['Build/nope.data.br'], secondary: [] } };
  assert.throws(() => validateManifest(bad), /missing from objects/);
  assert.throws(() => validateManifest({ ...legacy, progressive: { primary: [], secondary: [] } }), /primary/);
  assert.throws(() => validateManifest({ id: 'x', objects: [] }), /build id/);
  assert.throws(() => validateManifest({ ...legacy, objects: [obj('a'), obj('a')] }), /Duplicate/);
  assert.throws(() => findArtifact({ objects: [] }, '.wasm'), /Missing artifact/);
  assert.throws(() => buildConfig({ ...legacy, objects: [obj('Build/x.data.br')] }, opts), /Missing artifact/);
});

test('old gzip releases still resolve', () => {
  const gz = { id: '20260101-000000', objects: ['.data.gz', '.loader.js', '.framework.js.gz', '.wasm.gz'].map(s => obj('Build/b' + s)) };
  assert.equal(buildConfig(gz, opts).data, 'Build/b.data.gz');
});

test('variant build ids with a suffix are accepted', () => {
  assert.equal(validateManifest({ ...legacy, id: '20261002-120000-disksize' }), true);
  assert.throws(() => validateManifest({ ...legacy, id: '20261002-120000-BAD_1' }), /build id/);
});
