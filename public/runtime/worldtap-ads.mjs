// Web ad actions: the overlay that plays an in-house timed ad (docs/web-rewarded-ads-plan.md).
// The ad is judged on the client. Nothing here talks to a server and nothing may throw into the game.
import {
  adAvailability, createCountdown, pickCreative, resultFor, safeClickUrl, usableCreatives,
} from './worldtap-ads-core.mjs';

export const DEFAULT_LABELS = Object.freeze({
  title: 'Advertisement',
  countdown: 'Your action is sent in %s s',
  continue: 'Continue',
  close: 'Close',
});

const LOAD_TIMEOUT_MS = 6000;
const TICK_MS = 250;

/**
 * Runs one ad at a time. All browser access is injected (`view`, clocks, visibility) so the flow is
 * tested in Node. Resolves with { result: completed | closed | no_fill | error, seconds }.
 */
export function createAdPlayer(env) {
  let busy = false;
  return {
    get busy() { return busy; },
    show(creative, seconds, labels) {
      return new Promise(resolve => {
        if (busy) { resolve(resultFor({ error: true })); return; }
        busy = true;
        const countdown = createCountdown(seconds, env.now);
        let finished = false;
        let started = false;
        let tickTimer = null;
        let loadTimer = null;
        let unsubscribe = null;
        const finish = partial => {
          if (finished) return;
          finished = true;
          try { if (tickTimer !== null) env.clearInterval(tickTimer); } catch { /* ignore */ }
          try { if (loadTimer !== null) env.clearTimeout(loadTimer); } catch { /* ignore */ }
          try { unsubscribe?.(); } catch { /* ignore */ }
          try { env.view.unmount(); } catch { /* ignore */ }
          busy = false;
          resolve(resultFor({ ...partial, watched: countdown.watchedSeconds() }));
        };
        const tick = () => {
          if (finished) return;
          try { env.view.setRemaining(countdown.remaining()); } catch { /* ignore */ }
          if (countdown.done()) {
            if (tickTimer !== null) { env.clearInterval(tickTimer); tickTimer = null; }
            try { env.view.enableContinue(); } catch { /* ignore */ }
          }
        };
        try {
          env.view.onLoad(() => {
            if (finished || started) return;
            started = true;
            if (loadTimer !== null) { env.clearTimeout(loadTimer); loadTimer = null; }
            if (!env.isHidden()) countdown.start();
            tickTimer = env.setInterval(tick, TICK_MS);
            tick();
          });
          env.view.onError(() => finish({ error: true }));
          env.view.onClose(() => finish({ completed: false }));
          env.view.onContinue(() => { if (!finished && countdown.done()) finish({ completed: true }); });
          unsubscribe = env.onVisibility(hidden => {
            if (!started || finished) return;
            if (hidden) countdown.pause(); else countdown.resume();
          });
          env.view.mount(creative, labels);
          loadTimer = env.setTimeout(() => finish({ error: true }), env.loadTimeoutMs ?? LOAD_TIMEOUT_MS);
        } catch {
          finish({ error: true });
        }
      });
    },
  };
}

const style = (el, css) => { el.style.cssText = css; return el; };

/** The real overlay. Images render in an img, HTML creatives in an iframe with sandbox="allow-scripts" only. */
export function createDomView(document) {
  let root = null;
  let counter = null;
  let proceed = null;
  const cb = { load: () => {}, error: () => {}, close: () => {}, proceed: () => {} };
  const onKey = event => { if (event.key === 'Escape') cb.close(); };
  return {
    onLoad: fn => { cb.load = fn; },
    onError: fn => { cb.error = fn; },
    onClose: fn => { cb.close = fn; },
    onContinue: fn => { cb.proceed = fn; },
    mount(creative, labels) {
      root = style(document.createElement('div'),
        'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.93);display:flex;flex-direction:column;'
        + 'align-items:center;justify-content:center;gap:12px;font-family:system-ui,sans-serif;color:#fff;padding:12px;');
      root.setAttribute('role', 'dialog');
      root.setAttribute('aria-modal', 'true');
      root.setAttribute('aria-label', labels.title);

      const bar = style(document.createElement('div'),
        'display:flex;align-items:center;justify-content:space-between;width:min(92vw,480px);font-size:14px;');
      const title = document.createElement('span');
      title.textContent = labels.title;
      const close = style(document.createElement('button'),
        'background:rgba(255,255,255,.15);color:#fff;border:0;border-radius:8px;font-size:18px;min-width:44px;min-height:44px;cursor:pointer;');
      close.type = 'button';
      close.textContent = '✕';
      close.setAttribute('aria-label', labels.close);
      close.addEventListener('click', () => cb.close());
      bar.append(title, close);

      const body = style(document.createElement('div'), 'display:flex;align-items:center;justify-content:center;');
      let media;
      if (creative.type === 'html') {
        media = document.createElement('iframe');
        media.setAttribute('sandbox', 'allow-scripts');
        media.setAttribute('referrerpolicy', 'no-referrer');
        media.setAttribute('title', labels.title);
        style(media, 'width:min(92vw,480px);height:min(66vh,640px);border:0;background:#fff;border-radius:8px;');
      } else {
        media = document.createElement('img');
        media.setAttribute('alt', creative.name || labels.title);
        style(media, 'max-width:min(92vw,480px);max-height:66vh;border-radius:8px;object-fit:contain;');
      }
      media.addEventListener('load', () => cb.load());
      media.addEventListener('error', () => cb.error());
      const click = safeClickUrl(creative.clickUrl);
      if (click && creative.type !== 'html') {
        const link = document.createElement('a');
        link.href = click;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.appendChild(media);
        body.appendChild(link);
      } else {
        body.appendChild(media);
      }

      counter = style(document.createElement('div'), 'font-size:16px;min-height:24px;');
      proceed = style(document.createElement('button'),
        'display:none;background:#2e8bff;color:#fff;border:0;border-radius:10px;font-size:18px;padding:12px 28px;min-height:48px;cursor:pointer;');
      proceed.type = 'button';
      proceed.textContent = labels.continue;
      proceed.addEventListener('click', () => cb.proceed());

      root.append(bar, body, counter, proceed);
      root.dataset.labels = JSON.stringify(labels);
      document.addEventListener('keydown', onKey);
      document.body.appendChild(root);
      media.src = creative.url; // set last so load/error listeners are attached first
    },
    setRemaining(n) {
      if (!counter || !root) return;
      const labels = JSON.parse(root.dataset.labels);
      counter.textContent = labels.countdown.replace('%s', String(n));
    },
    enableContinue() {
      if (!proceed || !counter) return;
      counter.textContent = '';
      proceed.style.display = 'inline-block';
      proceed.focus();
    },
    unmount() {
      document.removeEventListener('keydown', onKey);
      root?.remove();
      root = counter = proceed = null;
    },
  };
}

function parseJson(value) {
  if (value && typeof value === 'object') return value;
  try { return JSON.parse(String(value)); } catch { return null; }
}

/**
 * window.WorldTapAds for the game: configure with the remote settings, ask whether the ad option is
 * available, and show the ad. Every method is safe to call at any time.
 */
export function createWorldTapAds({ document, window: win = globalThis }) {
  let settings = null;
  let labels = { ...DEFAULT_LABELS };
  const player = createAdPlayer({
    view: createDomView(document),
    now: () => performance.now(),
    setInterval: (fn, ms) => win.setInterval(fn, ms),
    clearInterval: id => win.clearInterval(id),
    setTimeout: (fn, ms) => win.setTimeout(fn, ms),
    clearTimeout: id => win.clearTimeout(id),
    isHidden: () => document.visibilityState === 'hidden',
    onVisibility: handler => {
      const listener = () => handler(document.visibilityState === 'hidden');
      document.addEventListener('visibilitychange', listener);
      return () => document.removeEventListener('visibilitychange', listener);
    },
  });
  const adBlockStatus = () => { try { return win.WorldTapAdBlock?.status ?? 'unknown'; } catch { return 'unknown'; } };
  return {
    /** `{ adsEnabled, adDurationSeconds, adCreatives }` as an object or a JSON string. */
    configure(value) { settings = parseJson(value); },
    /** Localized texts as an object or JSON string; unknown keys are ignored. */
    setLabels(value) {
      const next = parseJson(value);
      if (!next) return;
      for (const key of Object.keys(DEFAULT_LABELS)) if (typeof next[key] === 'string' && next[key]) labels[key] = next[key];
    },
    /** `{ available, reason }`; `stock` is the number of stored ad actions. */
    availability(stock) {
      try { return adAvailability({ settings, stock, adBlock: adBlockStatus() }); } catch { return { available: false, reason: 'error' }; }
    },
    /** Plays the ad. Resolves { result: completed | closed | no_fill | error, seconds }; never rejects. */
    async show() {
      try {
        const creative = pickCreative(usableCreatives(settings?.adCreatives));
        if (!creative || settings?.adsEnabled !== true) return resultFor({ noFill: true });
        const seconds = Math.min(60, Math.max(5, Math.round(Number(settings.adDurationSeconds) || 15)));
        return await player.show(creative, seconds, labels);
      } catch {
        return resultFor({ error: true });
      }
    },
    get busy() { return player.busy; },
  };
}
