import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { buildConfig, validateManifest } from './manifest-lib.mjs';
const exec = promisify(execFile);
const [id, cdn] = process.argv.slice(2);
if (!/^\d{8}-\d{6}(-[a-z]+)?$/.test(id || '') || !/^https:\/\/[a-z0-9]+\.cloudfront\.net$/.test(cdn || '')) {
  throw new Error('Supply build timestamp and CloudFront HTTPS base URL');
}
const aws = async args => (await exec('aws', [...args, '--region', 'us-east-1', '--no-cli-pager'], { maxBuffer: 1024 * 1024 })).stdout;
const identity = JSON.parse(await aws(['sts', 'get-caller-identity', '--output', 'json']));
if (identity.Account !== '376129878558') throw new Error('Unexpected AWS account');
const bucket = 'worldtap-webgl-dev-376129878558-us-east-1';
const directory = path.resolve('artifacts', id);
const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
if (manifest.id !== id) throw new Error('Manifest build mismatch');
validateManifest(manifest);
const prefix = `dev/${id}/`;
const config = buildConfig(manifest, { cdn, prefix });
for (let i = 0; i < manifest.objects.length; i += 4) {
  await Promise.all(manifest.objects.slice(i, i + 4).map(async object => {
    const args = ['s3', 'cp', path.join(directory, object.key), `s3://${bucket}/${prefix}${object.key}`,
      '--content-type', object.contentType, '--cache-control', 'public,max-age=31536000,immutable', '--only-show-errors'];
    if (object.encoding) args.push('--content-encoding', object.encoding);
    await aws(args);
  }));
  console.log(`Uploaded ${Math.min(i + 4, manifest.objects.length)}/${manifest.objects.length}`);
}
// All immutable objects are uploaded above; only now is the public pointer switched.
await writeFile('public/build-config.json', JSON.stringify(config, null, 2) + '\n');
await writeFile('deploy/dev-release.json', JSON.stringify({ ...config, bucket, objects: manifest.objects }, null, 2) + '\n');
console.log(`Published ${manifest.objects.length} files; frontend configuration is ready.`);
