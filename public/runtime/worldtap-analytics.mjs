import { createController, buildStartupParams, buildPerfParams, analyticsDisabledByUrl, deviceClass,
  ADBLOCK, probeAdScript, createAdBlockDetector } from './worldtap-analytics-core.mjs';

const SDK_URL = 'https://www.gstatic.com/firebasejs/12.8.0/firebase-analytics.js';
// Well-known ad script used only as a reachability probe after consent (no cookies, response unread).
const AD_PROBE_URL = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js';

// Local bait element: blockers hide elements with these class names. Nothing leaves the page.
async function measureAdBait() {
  const doc = globalThis.document;
  if (!doc?.body) return undefined;
  const bait = doc.createElement('div');
  bait.className = 'adsbox ad-banner adsbygoogle';
  bait.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;';
  bait.innerHTML = '&nbsp;';
  doc.body.appendChild(bait);
  await new Promise(resolve => setTimeout(resolve, 100)); // let blocker style rules apply
  const style = globalThis.getComputedStyle(bait);
  const measure = { attached: bait.isConnected, display: style.display, visibility: style.visibility,
    width: bait.offsetWidth, height: bait.offsetHeight };
  bait.remove();
  return measure;
}

/**
 * Browser glue: exposes window.WorldTapAnalytics. Nothing is downloaded or sent until enable()
 * (called after the player accepts the Terms). Every call is safe: failures never reach the game.
 */
export function createWorldTapAnalytics(app, config, options = {}) {
  const optedOutByUrl = analyticsDisabledByUrl(options.search ?? globalThis.location?.search);
  const controller = createController(async () => {
    if (!config.measurementId) return null; // no GA4 stream configured for this build
    const sdk = await import(/* @vite-ignore */ SDK_URL);
    if (!(await sdk.isSupported())) return null;
    const analytics = sdk.initializeAnalytics(app, {
      config: { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false },
    });
    sdk.setConsent({ analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
    return {
      logEvent: (name, params) => sdk.logEvent(analytics, name, params),
      setUserProperties: props => sdk.setUserProperties(analytics, props),
      setUserId: id => sdk.setUserId(analytics, id),
      setEnabled: enabled => sdk.setAnalyticsCollectionEnabled(analytics, enabled),
    };
  });

  const language = () => (navigator.language || 'unknown').slice(0, 12);

  if (optedOutByUrl) controller.disable(); // drops anything queued and keeps every call silent
  // Held by the controller until the player has accepted the Terms; dropped if analytics are off.
  controller.setUserProperties({
    build_id: String(globalThis.WorldTapBuildId ?? 'unknown'),
    device_class: deviceClass(globalThis.navigator?.deviceMemory, globalThis.navigator?.hardwareConcurrency),
  });
  const adBlock = createAdBlockDetector({
    measureBait: measureAdBait,
    probe: () => probeAdScript(globalThis.fetch?.bind(globalThis), AD_PROBE_URL,
      new URL('./firebase-config.json', import.meta.url).href),
    canProbe: () => controller.state === 'ready', // the network probe only runs after consent
    onResult: ({ status, method }) => {
      controller.track('adblock_status', { blocked: status === 'blocked' ? 1 : 0, method });
      controller.setUserProperties({ adblock: status === 'blocked' ? 'yes' : 'no' });
    },
  });
  let perfStarted = false;
  const metricsInfo = () => { try { return window.myGameInstance?.GetMetricsInfo?.() ?? {}; } catch { return {}; } };

  return {
    enable: async () => {
      if (optedOutByUrl) return;
      await controller.enable();
      adBlock.check();
    },
    /** Ad blocker status for gameplay code: { status: 'unknown'|'allowed'|'blocked', code: 0|1|2, check() }. */
    adBlock: {
      get status() { return adBlock.status; },
      get code() { return ADBLOCK[adBlock.status] ?? 0; },
      check: () => (optedOutByUrl ? Promise.resolve(adBlock.status) : adBlock.check()),
    },
    disable: () => controller.disable(),
    track: (name, params) => controller.track(name, params),
    setUserProperties: props => controller.setUserProperties(props),
    setUserId: id => controller.setUserId(id),
    /** perf_sample: once, from one fps reading per second for `seconds` seconds (default 30). */
    startPerfSample(seconds = 30) {
      if (perfStarted) return;
      perfStarted = true;
      try {
        const samples = [];
        const timer = setInterval(() => {
          try {
            const fps = metricsInfo().movingAverageFps ?? metricsInfo().fps;
            if (Number.isFinite(fps) && fps > 0) samples.push(fps);
            if (--seconds > 0) return;
            clearInterval(timer);
            const canvas = document.querySelector('canvas');
            const params = buildPerfParams(samples, metricsInfo(), {
              dpr: window.devicePixelRatio, canvasWidth: canvas?.width, canvasHeight: canvas?.height,
              deviceMemory: navigator.deviceMemory, cores: navigator.hardwareConcurrency,
            });
            if (params) controller.track('perf_sample', params);
          } catch { clearInterval(timer); }
        }, 1000);
      } catch { /* analytics must never affect the game */ }
    },
    /** startup_complete: computed here from the performance marks both Unity and the page write. */
    trackStartup() {
      try {
        const marks = Object.fromEntries(performance.getEntriesByType('mark').map(m => [m.name, m.startTime]));
        let metrics = {};
        try { metrics = window.myGameInstance?.GetMetricsInfo?.() ?? {}; } catch { /* metrics are optional */ }
        controller.track('startup_complete', buildStartupParams(marks, metrics, {
          buildId: window.WorldTapBuildId,
          locale: language(),
          dpr: window.devicePixelRatio,
          deviceMemory: navigator.deviceMemory,
          connectionType: navigator.connection?.effectiveType,
        }));
      } catch { /* analytics must never affect the game */ }
    },
  };
}
