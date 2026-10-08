// Pure analytics logic (no browser or Firebase imports) so it can be unit tested in Node.
// Rules: only events from the catalog, GA4 size limits, nothing is loaded or sent before consent,
// and analytics can never throw into the game.

// GA4 limits for standard properties (Analytics Help, "Event collection limits").
export const LIMITS = Object.freeze({ eventName: 40, params: 25, paramName: 40, paramValue: 100, queue: 50 });

// The event catalog (docs/analytics-leftovers-plan.md, section 1.4). Add a name here first.
export const EVENTS = Object.freeze(new Set([
  'startup_complete', 'startup_failed', 'tutorial_begin', 'tutorial_complete', 'sign_up', 'login', 'adblock_status',
  'tap_session', 'select_content', 'action_launch', 'action_result', 'action_cancel',
  'earn_virtual_currency', 'spend_virtual_currency', 'purchase', 'purchase_failed',
  'ad_complete', 'ad_failed', 'ad_skipped', 'daily_reward_claim', 'leaderboard_view', 'country_history_view',
  'setting_change', 'client_error', 'perf_sample', 'action_download',
]));

const NAME = /^[a-z][a-z0-9_]*$/;
const RESERVED_PREFIXES = ['google_', 'ga_', 'firebase_'];

/** Returns { ok, name, params } with sanitized parameters, or { ok: false, reason }. */
export function validateEvent(name, params) {
  if (typeof name !== 'string' || name.length > LIMITS.eventName || !NAME.test(name)) return { ok: false, reason: 'bad event name' };
  if (!EVENTS.has(name)) return { ok: false, reason: 'event not in catalog' };
  const clean = {};
  const entries = params && typeof params === 'object' && !Array.isArray(params) ? Object.entries(params) : [];
  for (const [key, value] of entries) {
    if (Object.keys(clean).length >= LIMITS.params) break;
    if (key.length > LIMITS.paramName || !NAME.test(key) || RESERVED_PREFIXES.some(p => key.startsWith(p))) continue;
    if (typeof value === 'number') { if (Number.isFinite(value)) clean[key] = value; }
    else if (typeof value === 'boolean') clean[key] = value ? 1 : 0;
    else if (typeof value === 'string') clean[key] = value.slice(0, LIMITS.paramValue);
    // Objects, arrays, null and undefined are dropped: no free-form data leaves the game.
  }
  return { ok: true, name, params: clean };
}

/**
 * Consent-gated controller. `loadSdk()` is only ever called after `enable()`; it resolves to an
 * object { logEvent, setUserProperties, setUserId, setEnabled } or null (unsupported/blocked).
 */
export function createController(loadSdk) {
  let state = 'unknown'; // unknown (no consent decision) | loading | ready | off
  let sdk = null;
  let queue = [];
  const safe = fn => { try { return fn(); } catch { return undefined; } };

  function flush() {
    const pending = queue; queue = [];
    for (const item of pending) safe(() => item(sdk));
  }

  async function enable() {
    if (state === 'loading' || state === 'ready') return;
    if (sdk) { // consent was withdrawn and given again: never initialize the SDK twice
      state = 'ready';
      safe(() => sdk.setEnabled(true));
      flush();
      return;
    }
    state = 'loading';
    try { sdk = await loadSdk(); } catch { sdk = null; }
    if (state !== 'loading') { // disable() ran while the SDK was loading
      if (sdk) safe(() => sdk.setEnabled(false));
      return;
    }
    if (!sdk) { state = 'off'; queue = []; return; }
    state = 'ready';
    flush();
  }

  function disable() {
    state = 'off';
    queue = [];
    if (sdk) safe(() => sdk.setEnabled(false));
  }

  function run(action) {
    if (state === 'off') return;
    if (state === 'ready') { safe(() => action(sdk)); return; }
    if (queue.length < LIMITS.queue) queue.push(action); // waits for a consent decision
  }

  return {
    get state() { return state; },
    enable,
    disable,
    track(name, params) {
      const event = validateEvent(name, params);
      if (event.ok) run(s => s.logEvent(event.name, event.params));
    },
    setUserProperties(props) {
      const clean = {};
      for (const [k, v] of Object.entries(props || {})) {
        if (Object.keys(clean).length >= 25) break;
        if (NAME.test(k) && k.length <= LIMITS.paramName && (typeof v === 'string' || typeof v === 'number')) clean[k] = typeof v === 'string' ? v.slice(0, 36) : v;
      }
      if (Object.keys(clean).length) run(s => s.setUserProperties(clean));
    },
    setUserId(id) {
      if (typeof id === 'string' && id.length > 0 && id.length <= 256) run(s => s.setUserId(id));
    },
  };
}

/**
 * Builds the startup_complete parameters from browser performance marks (page timeline, ms) and
 * Unity's metrics. `returning` is true when the player was not held up by the Terms/Country dialogs.
 */
export function buildStartupParams(marks, metrics = {}, context = {}) {
  const at = name => (typeof marks[name] === 'number' ? Math.round(marks[name]) : null);
  const span = (a, b) => (at(a) !== null && at(b) !== null ? Math.max(0, at(b) - at(a)) : null);
  const wait = (span('unity:manager-start:TermsConfirmation_Manager', 'unity:manager-end:TermsConfirmation_Manager') ?? 0)
    + (span('unity:manager-start:RegionManager', 'unity:manager-end:RegionManager') ?? 0);
  const complete = at('unity:initialization-complete');
  const params = {
    build_id: context.buildId || 'unknown',
    engine_ms: at('unity:manager-start:EnvironmentManager'),
    init_ms: complete,
    wait_ms: wait,
    auto_ms: complete === null ? null : Math.max(0, complete - wait),
    user_step_ms: span('unity:manager-start:UserManager', 'unity:manager-end:UserManager'),
    config_ms: span('unity:manager-start:GameConfigManager', 'unity:manager-end:GameConfigManager'),
    first_frame_ms: Number.isFinite(metrics.pageLoadTimeToFrame1) ? Math.round(metrics.pageLoadTimeToFrame1) : null,
    wasm_start_ms: Number.isFinite(metrics.webAssemblyStartupTime) ? Math.round(metrics.webAssemblyStartupTime) : null,
    returning: wait < 2000 ? 1 : 0,
    locale: context.locale || 'unknown',
    dpr: Number.isFinite(context.dpr) ? Math.round(context.dpr * 100) / 100 : null,
    device_memory_gb: Number.isFinite(context.deviceMemory) ? context.deviceMemory : null,
    connection_type: context.connectionType || 'unknown',
  };
  for (const key of Object.keys(params)) if (params[key] === null) delete params[key];
  return params;
}

export function median(values) {
  const v = values.filter(x => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = v.length >> 1;
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/** Coarse device bucket from capabilities only (no user agent, no model names). */
export function deviceClass(memoryGb, cores) {
  if (!Number.isFinite(memoryGb) || !Number.isFinite(cores)) return 'unknown';
  if (memoryGb <= 2 || cores <= 4) return 'low';
  return memoryGb >= 8 && cores >= 8 ? 'high' : 'mid';
}

/** perf_sample parameters from fps samples (one per second) and Unity's GetMetricsInfo(). */
export function buildPerfParams(fpsSamples, metrics = {}, context = {}) {
  const fps = median(fpsSamples);
  if (fps === null) return null;
  const params = {
    fps_median: Math.round(fps * 10) / 10,
    janked_frames: Number.isFinite(metrics.numJankedFrames) ? Math.round(metrics.numJankedFrames) : null,
    wasm_heap_mb: Number.isFinite(metrics.usedWASMHeapSize) ? Math.round(metrics.usedWASMHeapSize / 1048576) : null,
    dpr: Number.isFinite(context.dpr) ? Math.round(context.dpr * 100) / 100 : null,
    canvas: Number.isFinite(context.canvasWidth) && Number.isFinite(context.canvasHeight)
      ? `${Math.round(context.canvasWidth)}x${Math.round(context.canvasHeight)}` : null,
    device_class: deviceClass(context.deviceMemory, context.cores),
  };
  for (const key of Object.keys(params)) if (params[key] === null) delete params[key];
  return params;
}

/** `?analytics=off` keeps analytics off for that page load (used for the startup A/B test). Never persisted. */
export function analyticsDisabledByUrl(search) {
  if (typeof search !== 'string') return false;
  return new URLSearchParams(search).get('analytics') === 'off';
}

// ---- Ad blocker identifier (docs/analytics-followup-plan.md, Phase 3) ----

/** Numeric codes read by the Unity bridge. */
export const ADBLOCK = Object.freeze({ unknown: 0, allowed: 1, blocked: 2 });

/** The bait element is hidden or collapsed by blockers. A bait that is not measurable is unknown, never blocked. */
export function evaluateBait(measure) {
  if (!measure || measure.attached !== true) return 'unknown';
  if (typeof measure.width !== 'number' || typeof measure.height !== 'number') return 'unknown';
  if (measure.display === 'none' || measure.visibility === 'hidden') return 'blocked';
  if (measure.width === 0 && measure.height === 0) return 'blocked';
  return 'allowed';
}

/** Any blocked signal wins; otherwise any allowed signal; otherwise unknown. */
export function combineAdBlockSignals(...signals) {
  if (signals.includes('blocked')) return 'blocked';
  if (signals.includes('allowed')) return 'allowed';
  return 'unknown';
}

/**
 * Requests a well-known ad script and a same-origin control. Blocked only when the control works and
 * the ad request fails (so being offline is not a blocker). No cookies, no response is read.
 */
export async function probeAdScript(fetchFn, adUrl, controlUrl, timeoutMs = 4000) {
  try {
    if (typeof fetchFn !== 'function') return 'unknown';
    const options = { mode: 'no-cors', credentials: 'omit', cache: 'no-store' };
    const timeout = new Promise(resolve => setTimeout(() => resolve('timeout'), timeoutMs));
    const attempt = url => Promise.resolve().then(() => fetchFn(url, options)).then(() => 'ok', () => 'fail');
    const [control, ad] = await Promise.all([attempt(controlUrl), Promise.race([attempt(adUrl), timeout])]);
    if (control !== 'ok' || ad === 'timeout') return 'unknown';
    return ad === 'fail' ? 'blocked' : 'allowed';
  } catch {
    return 'unknown';
  }
}

/**
 * Ad blocker detector with injected dependencies. The local bait always runs; the network probe runs
 * only when `canProbe()` is true (after consent). `onResult({ status, method })` fires when the status
 * changes. check() never throws.
 */
export function createAdBlockDetector({ measureBait, probe, canProbe, onResult }) {
  let status = 'unknown';
  const safe = fn => { try { return fn(); } catch { return undefined; } };
  return {
    get status() { return status; },
    async check() {
      try {
        const measure = await Promise.resolve().then(measureBait).catch(() => undefined);
        const bait = evaluateBait(measure);
        let probed = 'unknown';
        if (safe(() => canProbe())) probed = (await Promise.resolve().then(probe).catch(() => 'unknown')) ?? 'unknown';
        const next = combineAdBlockSignals(bait, probed);
        const method = bait !== 'unknown' && probed !== 'unknown' ? 'both'
          : bait !== 'unknown' ? 'bait' : probed !== 'unknown' ? 'probe' : 'none';
        if (next !== status && next !== 'unknown') {
          status = next;
          safe(() => onResult?.({ status, method }));
        }
      } catch { /* detection must never affect the game */ }
      return status;
    },
  };
}
