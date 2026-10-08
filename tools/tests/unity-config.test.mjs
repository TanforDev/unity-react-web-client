import test from 'node:test';
import assert from 'node:assert/strict';
import { toUnityConfig } from '../../src/unity-config.js';

const base = new URL('https://abc.cloudfront.net/dev/20260929-153619/');
const legacy = { framework: 'Build/f.js.br', code: 'Build/c.wasm.br', data: 'Build/d.data.br' };

test('legacy config keeps the single data file and metadata', () => {
  const c = toUnityConfig(legacy, base);
  assert.equal(c.dataUrl, 'https://abc.cloudfront.net/dev/20260929-153619/Build/d.data.br');
  assert.equal(c.primaryDataUrls, undefined);
  assert.equal(c.productName, 'WorldTap.io');
  assert.equal(c.streamingAssetsUrl, 'https://abc.cloudfront.net/dev/20260929-153619/StreamingAssets');
});

test('progressive config is refused until the routing gate has passed', () => {
  const v2 = { ...legacy, version: 2, progressive: { primary: ['Build/p.data.br'], secondary: ['Build/s.data.br'] } };
  assert.throws(() => toUnityConfig(v2, base), /not enabled/);
  const c = toUnityConfig({ ...v2, progressive: { ...v2.progressive, gatePassed: true } }, base);
  assert.deepEqual(c.primaryDataUrls, ['https://abc.cloudfront.net/dev/20260929-153619/Build/p.data.br']);
  assert.equal(c.dataUrl, undefined);
});

import { renderScale } from '../../src/unity-config.js';

test('render scale is capped at 2x and falls back to 1 for bad values', () => {
  assert.equal(renderScale(1), 1);
  assert.equal(renderScale(1.25), 1.25);
  assert.equal(renderScale(2), 2);
  assert.equal(renderScale(3), 2);
  assert.equal(renderScale(3.5), 2);
  assert.equal(renderScale(undefined), 1);
  assert.equal(renderScale(0), 1);
  assert.equal(renderScale(NaN), 1);
  assert.equal(renderScale(3, 1.5), 1.5);
});
