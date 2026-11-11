import { scopedStorageKey } from './storageScope.js';

const STATE_BASE = 'familyflow-v1';

function stateKey() {
  return scopedStorageKey(STATE_BASE);
}

export function loadState() {
  try {
    const raw = localStorage.getItem(stateKey());
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveState(state) {
  localStorage.setItem(stateKey(), JSON.stringify(state));
}

export function clearState() {
  localStorage.removeItem(stateKey());
}

/** Base key without sandbox prefix (tests / docs). */
export function deviceStateBaseKey() {
  return STATE_BASE;
}
