/**
 * Sync status + realtime + online/offline helpers for S5-B.
 */

export const SyncStatus = Object.freeze({
  idle: 'idle',
  syncing: 'syncing',
  ok: 'ok',
  error: 'error',
  offline: 'offline',
  readonly: 'readonly',
});

export function createSyncRuntime() {
  /** @type {{ status: string, message: string, lastSyncedAt: string|null, lastError: string|null }} */
  let ui = {
    status: SyncStatus.idle,
    message: '로컬만 사용 중',
    lastSyncedAt: null,
    lastError: null,
  };
  let channel = null;
  let pullTimer = null;
  let onlineHandler = null;
  let offlineHandler = null;

  function getUi() {
    return { ...ui };
  }

  function setStatus(status, message, extra = {}) {
    ui = {
      ...ui,
      status,
      message: message || ui.message,
      lastError: extra.error ?? (status === SyncStatus.error ? message : ui.lastError),
      lastSyncedAt: extra.syncedAt ?? ui.lastSyncedAt,
    };
    return getUi();
  }

  function isOnline() {
    return typeof navigator === 'undefined' ? true : navigator.onLine !== false;
  }

  function canWrite(cloudMode) {
    if (cloudMode !== 'cloud-primary') return true;
    if (!isOnline()) return false;
    if (ui.status === SyncStatus.offline) return false;
    return true;
  }

  function bindNetwork(onChange) {
    if (typeof window === 'undefined') return () => {};
    onlineHandler = () => {
      setStatus(SyncStatus.ok, '다시 온라인이에요. 동기화할 수 있어요.');
      onChange?.('online');
    };
    offlineHandler = () => {
      setStatus(SyncStatus.offline, '오프라인 — 캐시는 볼 수 있고, 수정은 온라인에서만 가능해요.');
      onChange?.('offline');
    };
    window.addEventListener('online', onlineHandler);
    window.addEventListener('offline', offlineHandler);
    if (!isOnline()) offlineHandler();
    return () => {
      window.removeEventListener('online', onlineHandler);
      window.removeEventListener('offline', offlineHandler);
    };
  }

  async function subscribeHousehold(client, householdId, onEvent) {
    await unsubscribe();
    if (!client || !householdId) return null;
    channel = client
      .channel(`familyflow-hh-${householdId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shopping_items', filter: `household_id=eq.${householdId}` },
        (payload) => onEvent?.('shopping_items', payload),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inventory_items', filter: `household_id=eq.${householdId}` },
        (payload) => onEvent?.('inventory_items', payload),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'meal_plans', filter: `household_id=eq.${householdId}` },
        (payload) => onEvent?.('meal_plans', payload),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'today_dinners', filter: `household_id=eq.${householdId}` },
        (payload) => onEvent?.('today_dinners', payload),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'family_profiles', filter: `household_id=eq.${householdId}` },
        (payload) => onEvent?.('family_profiles', payload),
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setStatus(ui.status === SyncStatus.offline ? SyncStatus.offline : SyncStatus.ok, '실시간 동기화 연결됨');
        }
      });
    return channel;
  }

  async function unsubscribe() {
    if (channel) {
      try {
        await channel.unsubscribe();
      } catch {
        /* ignore */
      }
      channel = null;
    }
  }

  function startPolling(ms, fn) {
    stopPolling();
    if (!ms || ms < 5000) return;
    pullTimer = setInterval(() => {
      if (isOnline()) fn?.();
    }, ms);
  }

  function stopPolling() {
    if (pullTimer) {
      clearInterval(pullTimer);
      pullTimer = null;
    }
  }

  async function dispose() {
    stopPolling();
    await unsubscribe();
  }

  return {
    getUi,
    setStatus,
    isOnline,
    canWrite,
    bindNetwork,
    subscribeHousehold,
    unsubscribe,
    startPolling,
    stopPolling,
    dispose,
    SyncStatus,
  };
}

export function syncBadgeLabel(ui) {
  switch (ui?.status) {
    case SyncStatus.syncing:
      return '동기화 중';
    case SyncStatus.ok:
      return '동기화됨';
    case SyncStatus.error:
      return '동기화 실패';
    case SyncStatus.offline:
      return '오프라인';
    case SyncStatus.readonly:
      return '읽기 전용';
    default:
      return '로컬';
  }
}
