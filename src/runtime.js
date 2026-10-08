import { toUnityConfig } from './unity-config.js';
let unityConfig;
const pendingMessages = [];
const mark = name => { try { performance.mark('worldtap:' + name); } catch { /* timing is optional */ } };
export async function initializeRuntime() {
  mark('runtime-start');
  window.myGameInstance = { SendMessage: (...args) => pendingMessages.push(args) };
  const response = await fetch('/build-config.json', { cache: 'no-store' });
  if (!response.ok) throw new Error('Could not load build configuration');
  const config = await response.json();
  if (config.environment !== 'dev' || config.firebaseProject !== 'worldtapio-dev') {
    throw new Error('Unexpected environment for the development player');
  }
  const base = new URL(config.baseUrl);
  if (base.protocol !== 'https:' || !base.hostname.endsWith('.cloudfront.net')) {
    throw new Error('Invalid build CDN URL');
  }
  window.WorldTapBuildId = String(config.buildId || 'unknown');
  mark('build-config-ready');
  const url = path => new URL(path, base).href;
  unityConfig = { loaderUrl: url(config.loader), ...toUnityConfig(config, base) };
  const bootstrapUrl = '/runtime/firebase-bootstrap.mjs';
  const { initializeWorldTapFirebase } = await import(/* @vite-ignore */ bootstrapUrl);
  await initializeWorldTapFirebase();
  mark('firebase-ready');
}
export function getUnityConfig() {
  if (!unityConfig) throw new Error('Runtime has not initialized');
  return unityConfig;
}
export function attachUnityInstance(instance) {
  mark('unity-instance-ready');
  window.myGameInstance = instance;
  for (const args of pendingMessages.splice(0)) instance.SendMessage(...args);
}
