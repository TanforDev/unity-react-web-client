// Pure mapping from the published build-config to Unity's createUnityInstance config.
const META = { companyName: 'Phantum Studio', productName: 'WorldTap.io', productVersion: '0.0.3' };

export function toUnityConfig(config, base) {
  const url = path => new URL(path, base).href;
  const common = { frameworkUrl: url(config.framework), codeUrl: url(config.code),
    streamingAssetsUrl: url('StreamingAssets'), ...META };
  if (config.version === 2) {
    // Progressive loading stays off until the real CDN routing gate has passed for this build.
    if (!config.progressive || config.progressive.gatePassed !== true) {
      throw new Error('Progressive loading is not enabled for this release');
    }
    return { ...common, primaryDataUrls: config.progressive.primary.map(url),
      secondaryDataUrls: config.progressive.secondary.map(url) };
  }
  return { ...common, dataUrl: url(config.data) };
}

// Phones report a device pixel ratio of 3 or more, which makes the WebGL canvas far larger
// than it needs to be. Rendering is capped at 2x; the browser scales it up to the screen size.
export const MAX_DEVICE_PIXEL_RATIO = 2;
export function renderScale(devicePixelRatio, max = MAX_DEVICE_PIXEL_RATIO) {
  const ratio = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  return Math.min(ratio, max);
}
