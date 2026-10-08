// Pure logic of the web ad actions (docs/web-rewarded-ads-plan.md). No DOM, no network, no Firebase,
// so it is unit tested in Node. The ad is judged on the client: nothing here talks to a server.

// Hosts a creative may be loaded from. An admin typo or a compromised admin account cannot load an
// arbitrary site into the game page. Add a host here (and in a build) before using it in a creative.
export const ALLOWED_AD_HOSTS = Object.freeze([
  'worldtapio-dev.web.app',
  'worldtap-ea40a.web.app',
  'd2agetn4u2winj.cloudfront.net',
  'firebasestorage.googleapis.com',
  'storage.googleapis.com',
]);

function parseHttps(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** https only, host on the allowlist (exact match), no credentials in the url. */
export function isAllowedCreativeUrl(url, hosts = ALLOWED_AD_HOSTS) {
  const parsed = typeof url === 'string' ? parseHttps(url) : null;
  return parsed !== null && hosts.includes(parsed.hostname);
}

/** A click-through may go anywhere over https; it opens in a new tab with noopener. */
export function safeClickUrl(url) {
  return typeof url === 'string' && parseHttps(url) ? url : undefined;
}

/** Enabled creatives of a known type whose url passes the allowlist. */
export function usableCreatives(list, hosts = ALLOWED_AD_HOSTS) {
  if (!Array.isArray(list)) return [];
  return list.filter(c => c && typeof c === 'object' && c.enabled !== false
    && (c.type === 'image' || c.type === 'html') && isAllowedCreativeUrl(c.url, hosts));
}

/** Weighted pick; `random` returns [0, 1). Returns null for an empty list. */
export function pickCreative(creatives, random = Math.random) {
  if (!creatives.length) return null;
  const weights = creatives.map(c => (Number.isFinite(c.weight) && c.weight > 0 ? c.weight : 1));
  let point = random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < creatives.length; i++) {
    point -= weights[i];
    if (point < 0) return creatives[i];
  }
  return creatives[creatives.length - 1];
}

/**
 * Whether the ad action option should be offered. A full stock is fine (spending from a full stock is
 * the normal case); `unknown` ad blocker status is treated as "ads may work".
 */
export function adAvailability({ settings, stock, adBlock }) {
  if (!settings || settings.adsEnabled !== true) return { available: false, reason: 'disabled' };
  if (usableCreatives(settings.adCreatives).length === 0) return { available: false, reason: 'no_creative' };
  if (!(stock > 0)) return { available: false, reason: 'no_stock' };
  if (adBlock === 'blocked') return { available: false, reason: 'blocked' };
  return { available: true, reason: 'ok' };
}

/**
 * Countdown of active time. Time spent paused (tab hidden) does not count, so leaving the tab in the
 * background does not run the ad out. `now` returns milliseconds from a monotonic clock.
 */
export function createCountdown(durationSeconds, now = () => performance.now()) {
  const total = durationSeconds * 1000;
  let active = 0;
  let since = null;
  const elapsed = () => Math.min(total, active + (since === null ? 0 : now() - since));
  const begin = () => { if (since === null) since = now(); };
  return {
    start: begin,
    resume: begin,
    pause() {
      if (since !== null) { active += now() - since; since = null; }
    },
    remaining: () => Math.max(0, Math.ceil((total - elapsed()) / 1000)),
    done: () => elapsed() >= total,
    watchedSeconds: () => Math.floor(elapsed() / 1000),
  };
}

/** Result sent back to the game: completed, closed (early), no_fill or error, with whole seconds watched. */
export function resultFor({ completed = false, noFill = false, error = false, watched = 0 } = {}) {
  if (noFill) return { result: 'no_fill', seconds: 0 };
  const seconds = Math.max(0, Math.floor(watched));
  if (error) return { result: 'error', seconds };
  return { result: completed ? 'completed' : 'closed', seconds };
}
