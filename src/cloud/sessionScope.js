/**
 * Prevent mixing data across accounts / households.
 * Device-local (pre-cloud) backup stays on a fixed key; cloud cache is scoped.
 * With `?sandbox&device=…`, all keys are further prefixed (see storageScope.js).
 */

import { loadState as loadRaw, saveState as saveRaw } from '../lib/storage.js';
import { scopedStorageKey } from '../lib/storageScope.js';

const DEVICE_LOCAL_BASE = 'familyflow-v1';
const DEVICE_BACKUP_BASE = 'familyflow-device-local-backup';

/** @deprecated Prefer deviceLocalKey() — kept for callers that need the base name. */
export const DEVICE_LOCAL_KEY = DEVICE_LOCAL_BASE;
/** @deprecated Prefer deviceBackupKey() */
export const DEVICE_BACKUP_KEY = DEVICE_BACKUP_BASE;

export function deviceLocalKey() {
  return scopedStorageKey(DEVICE_LOCAL_BASE);
}

export function deviceBackupKey() {
  return scopedStorageKey(DEVICE_BACKUP_BASE);
}

export function cloudCacheKey(userId, householdId) {
  if (!userId || !householdId) return null;
  return scopedStorageKey(`familyflow-cache:${userId}:${householdId}`);
}

export function readJson(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function removeJson(key) {
  localStorage.removeItem(key);
}

/** Snapshot current device-local state before binding to cloud (once). */
export function ensureDeviceLocalBackup(state) {
  const backupKey = deviceBackupKey();
  if (readJson(backupKey)) return false;
  writeJson(backupKey, state);
  return true;
}

export function loadDeviceLocalBackup() {
  return readJson(deviceBackupKey());
}

export function loadScopedState(userId, householdId) {
  const key = cloudCacheKey(userId, householdId);
  if (!key) return null;
  return readJson(key);
}

export function saveScopedState(userId, householdId, state) {
  const key = cloudCacheKey(userId, householdId);
  if (!key) {
    saveRaw(state);
    return;
  }
  writeJson(key, state);
  // Keep device mirror while cloud-primary for refresh survival,
  // but stamp scope so boot can detect mismatch.
  const stamped = {
    ...state,
    cloud: {
      ...(state.cloud || {}),
      userId,
      householdId,
      cacheKey: key,
    },
  };
  saveRaw(stamped);
}

export function clearActiveDeviceMirror() {
  // Do not wipe device backup — that is the pre-cloud personal copy.
  removeJson(deviceLocalKey());
}

/**
 * On logout / account switch: drop active mirror and restore device-local backup if any.
 * Cloud cache for the previous scope remains on disk but is not loaded until that account returns.
 */
export function isolateOnSignOut() {
  clearActiveDeviceMirror();
  const backup = loadDeviceLocalBackup();
  if (backup) {
    const restored = structuredClone(backup);
    if (restored.cloud) {
      restored.cloud = {
        ...restored.cloud,
        userId: null,
        householdId: null,
        mode: 'local',
        lastPushedAt: restored.cloud.lastPushedAt || null,
        lastPulledAt: restored.cloud.lastPulledAt || null,
      };
    }
    saveRaw(restored);
    return restored;
  }
  return null;
}

export function bootPrefersScopedCache(state) {
  const userId = state?.cloud?.userId;
  const householdId = state?.cloud?.householdId;
  if (!userId || !householdId || state?.cloud?.mode !== 'cloud-primary') return state;
  const scoped = loadScopedState(userId, householdId);
  return scoped || state;
}

/** Re-export raw for tests / boot that still use default key. */
export { loadRaw as loadDeviceMirror, saveRaw as saveDeviceMirror };
