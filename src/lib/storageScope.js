/**
 * URL sandbox isolation: `?sandbox&device=작업이름`
 * Prefixes Family Flow localStorage / auth keys so destructive tests
 * never touch the default device bucket or another sandbox lane.
 */

/** @type {{ enabled: boolean, device: string, label: string }} */
let active = { enabled: false, device: '', label: '' };

/**
 * @param {string} name
 * @returns {string}
 */
export function sanitizeDeviceId(name) {
  const cleaned = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣_-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return cleaned || 'default';
}

/**
 * @param {string} [search] location.search or query without leading ?
 * @returns {{ enabled: boolean, device: string, label: string }}
 */
export function parseSandboxSearch(search = '') {
  const raw = String(search || '');
  const q = new URLSearchParams(raw.startsWith('?') ? raw.slice(1) : raw);
  if (!q.has('sandbox')) {
    return { enabled: false, device: '', label: '' };
  }
  const device = sanitizeDeviceId(q.get('device') || 'default');
  return { enabled: true, device, label: device };
}

/**
 * Call once before any localStorage / auth reads (e.g. main.js).
 * @param {string} [search]
 */
export function initStorageScope(search) {
  const from =
    search != null
      ? search
      : typeof location !== 'undefined'
        ? location.search
        : '';
  active = parseSandboxSearch(from);
  return active;
}

/** @returns {{ enabled: boolean, device: string, label: string }} */
export function getStorageScope() {
  return active;
}

/** Test helper — restore default (non-sandbox) scope. */
export function resetStorageScopeForTests() {
  active = { enabled: false, device: '', label: '' };
}

/**
 * @param {string} baseKey
 * @returns {string}
 */
export function scopedStorageKey(baseKey) {
  const key = String(baseKey || '');
  if (!active.enabled) return key;
  return `familyflow-sb:${active.device}:${key}`;
}

export function sandboxBadgeText(scope = active) {
  if (!scope?.enabled) return '';
  return `sandbox · ${scope.label || scope.device || 'default'}`;
}
