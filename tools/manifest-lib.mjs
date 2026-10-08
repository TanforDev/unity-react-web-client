// Pure helpers shared by prepare-build, publish-build and their tests.
import path from 'node:path';

const MIME = {
  '.wasm': 'application/wasm', '.js': 'application/javascript', '.json': 'application/json',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.hash': 'text/plain', '.html': 'text/html',
};
const COMPRESSED = { '.br': 'br', '.gz': 'gzip' };

/** Describe one build output file. Already-compressed inputs keep their bytes and encoding. */
export function classifyFile(key) {
  const ext = path.posix.extname(key);
  const encoding = COMPRESSED[ext] || null;
  const underlying = encoding ? key.slice(0, -ext.length) : key;
  const contentType = MIME[path.posix.extname(underlying)] || 'application/octet-stream';
  // Only raw engine files under Build/ are compressed here; never double-compress.
  const compress = !encoding && key.startsWith('Build/') && /\.(wasm|data|js)$/.test(key);
  return { objectKey: key + (compress ? '.br' : ''), contentType,
    encoding: encoding === 'gzip' ? 'gzip' : (encoding || (compress ? 'br' : null)), compress, alreadyCompressed: Boolean(encoding) };
}

/** Throw if the manifest is incomplete or internally inconsistent. */
export function validateManifest(manifest) {
  if (!manifest || !/^\d{8}-\d{6}(-[a-z]+)?$/.test(manifest.id || '')) throw new Error('Manifest build id is invalid');
  if (!Array.isArray(manifest.objects) || manifest.objects.length === 0) throw new Error('Manifest has no objects');
  const keys = new Set();
  for (const o of manifest.objects) {
    if (!o.key || keys.has(o.key)) throw new Error(`Duplicate or empty object key: ${o.key}`);
    keys.add(o.key);
  }
  if (manifest.progressive) {
    const p = manifest.progressive;
    if (!Array.isArray(p.primary) || p.primary.length === 0) throw new Error('Progressive manifest needs primary files');
    if (!Array.isArray(p.secondary)) throw new Error('Progressive manifest needs a secondary list');
    for (const key of [...p.primary, ...p.secondary]) {
      if (!keys.has(key)) throw new Error(`Progressive reference is missing from objects: ${key}`);
    }
  }
  return true;
}

/** Locate a required engine artifact; accepts raw, .br and .gz release names. */
export function findArtifact(manifest, suffix) {
  const object = manifest.objects.find(o => o.key.replace(/\.(br|gz)$/, '').endsWith(suffix));
  if (!object) throw new Error(`Missing artifact ${suffix}`);
  return object.key;
}

/**
 * Build the public build-config. Legacy releases keep the single `data` file (version 1);
 * progressive releases add `version: 2` and primary/secondary lists.
 */
export function buildConfig(manifest, { cdn, prefix }) {
  validateManifest(manifest);
  const config = { environment: 'dev', firebaseProject: 'worldtapio-dev', buildId: manifest.id,
    baseUrl: `${cdn}/${prefix}`, loader: findArtifact(manifest, '.loader.js'),
    framework: findArtifact(manifest, '.framework.js'), code: findArtifact(manifest, '.wasm') };
  if (manifest.progressive) {
    return { ...config, version: 2, progressive: { primary: manifest.progressive.primary,
      secondary: manifest.progressive.secondary } };
  }
  return { ...config, data: findArtifact(manifest, '.data') };
}
