/**
 * Safari / iOS home-screen PWAs cannot open a one-off clear-cache URL.
 * Detect a newer Pages deploy via build.json and hard-refresh locally.
 */

import { APP_BUILD_ID } from './buildId.js';
import { scopedStorageKey } from './storageScope.js';

const FLAG_BASE = 'familyflow-updating-to';

function updateFlagKey() {
  return scopedStorageKey(FLAG_BASE);
}

export function shouldApplyRemoteBuild(localId, remoteId) {
  if (!localId || !remoteId) return false;
  // Unstamped placeholder looks like __…__ (avoid matching the literal after stamp-build).
  if (localId.startsWith('__') && localId.endsWith('__')) return false;
  return localId !== remoteId;
}

export async function fetchRemoteBuildId(baseUrl, fetchImpl = fetch) {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const res = await fetchImpl(`${base}build.json?_=${Date.now()}`, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.id ? String(data.id) : null;
}

export async function clearAppShellCaches() {
  if ('serviceWorker' in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
  }
  if (typeof caches !== 'undefined') {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  }
}

/**
 * @returns {Promise<'current'|'reloading'|'skipped'|'error'>}
 */
export async function checkForAppUpdate(options = {}) {
  const {
    localId = APP_BUILD_ID,
    // Vite inlines this at build time (`/familyflow/` on Pages).
    baseUrl = import.meta.env.BASE_URL || '/',
    storage = typeof sessionStorage !== 'undefined' ? sessionStorage : null,
    fetchImpl = fetch,
    reload = () => {
      location.reload();
    },
    clear = clearAppShellCaches,
  } = options;

  try {
    const remoteId = await fetchRemoteBuildId(baseUrl, fetchImpl);
    if (!shouldApplyRemoteBuild(localId, remoteId)) return 'current';

    const flag = updateFlagKey();
    if (storage?.getItem(flag) === remoteId) return 'skipped';
    storage?.setItem(flag, remoteId);

    await clear();
    reload();
    return 'reloading';
  } catch {
    return 'error';
  }
}

export function watchAppUpdates() {
  const run = () => {
    checkForAppUpdate().catch(() => {});
  };

  run();

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') run();
  });

  window.addEventListener('pageshow', (event) => {
    if (event.persisted) run();
  });

  // Returning to a home-screen web app often fires focus.
  window.addEventListener('focus', run);
}
