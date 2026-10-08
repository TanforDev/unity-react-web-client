import { mkdir, readdir, readFile, writeFile, copyFile, access } from 'node:fs/promises';
import path from 'node:path';
import { brotliCompressSync, constants } from 'node:zlib';
import { createHash } from 'node:crypto';
import { classifyFile, validateManifest } from './manifest-lib.mjs';

// Maximum Brotli quality: slowest to build (minutes) but ~17% smaller engine files, same decode speed.
const BROTLI_QUALITY = 11;
const source = path.resolve(process.argv[2] || '');
const id = path.basename(source);
if (!/^\d{8}-\d{6}(-[a-z]+)?$/.test(id)) throw new Error('Supply a timestamped Unity build directory');
const output = path.resolve('artifacts', id);
await mkdir(output, { recursive: true });
const objects = [];
const objectKeyBySource = new Map();
async function collect(directory, relative = '') {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const key = path.posix.join(relative, item.name);
    const input = path.join(directory, item.name);
    if (item.isDirectory()) { await collect(input, key); continue; }
    const original = await readFile(input);
    const info = classifyFile(key);
    // Already-compressed (.br/.gz) inputs keep their exact bytes and encoding.
    const body = info.compress ? brotliCompressSync(original, {
      params: { [constants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY },
    }) : original;
    const destination = path.join(output, info.objectKey);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, body);
    objectKeyBySource.set(key, info.objectKey);
    objects.push({ key: info.objectKey, contentType: info.contentType, encoding: info.encoding,
      bytes: body.length, originalBytes: original.length,
      sha256: createHash('sha256').update(body).digest('hex') });
  }
}
await collect(path.join(source, 'Build'), 'Build');
await collect(path.join(source, 'StreamingAssets'), 'StreamingAssets');

// Optional sidecar from the Unity template (progressive loading): primary and secondary
// lists in source-relative paths. Files outside Build/ and StreamingAssets/ are inventoried too.
const manifest = { id, objects };
const sidecarPath = path.join(source, 'worldtap-build.json');
const hasSidecar = await access(sidecarPath).then(() => true, () => false);
if (hasSidecar) {
  const sidecar = JSON.parse(await readFile(sidecarPath, 'utf8'));
  if (sidecar.progressive) {
    const referenced = [...sidecar.primary, ...sidecar.secondary];
    for (const key of referenced) {
      if (!objectKeyBySource.has(key)) {
        const dir = path.dirname(key);
        await collect(path.join(source, dir), dir === '.' ? '' : dir);
        if (!objectKeyBySource.has(key)) throw new Error(`Referenced progressive file is missing: ${key}`);
      }
    }
    const mapKeys = list => list.map(k => objectKeyBySource.get(k));
    manifest.progressive = { primary: mapKeys(sidecar.primary), secondary: mapKeys(sidecar.secondary) };
  }
}
validateManifest(manifest);

await mkdir('public/runtime', { recursive: true });
for (const file of ['firebase-bootstrap.mjs', 'firebase-auth-flow.mjs', 'firebase-config.json',
  'worldtap-analytics.mjs', 'worldtap-analytics-core.mjs', 'worldtap-ads.mjs', 'worldtap-ads-core.mjs', 'worldtap-ads-gpt.mjs']) {
  await copyFile(path.join(source, file), path.join('public/runtime', file));
}
await writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ id, files: objects.length, progressive: Boolean(manifest.progressive),
  originalBytes: objects.reduce((n, x) => n + x.originalBytes, 0),
  uploadBytes: objects.reduce((n, x) => n + x.bytes, 0) }));
