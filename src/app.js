import { bootState, persist } from './domain/state.js';
import {
  ensureActiveList,
  addFromQuickText,
  addShoppingItem,
  updateShoppingItem,
  removeShoppingItem,
  toggleShoppingItem,
  shoppingTotals,
  sortShoppingItems,
  inventoryProposalsFromChecked,
  createShoppingList,
} from './domain/shopping.js';
import {
  LOCATIONS,
  STATUSES,
  createInventoryItem,
  updateInventoryItem,
  setInventoryStatus,
  removeInventory,
  shoppingSuggestionsFromInventory,
  applyPurchaseToInventory,
} from './domain/inventory.js';
import { suggestToday, draftWeek } from './domain/meals.js';
import { parseQuickAdd } from './domain/quick-add.js';
import {
  generateSuggestions,
  dismissSuggestion,
  suggestionFingerprint,
  previewProposal,
  applyProposal,
} from './domain/suggestions.js';
import { ProposalError } from './domain/proposals.js';
import { proposalFromInventoryChip } from './domain/inventoryProposals.js';
import {
  NAVER_PAY_HISTORY_URL,
  parseOrderPaste,
  applyClarifyAnswer,
} from './domain/orderPaste.js';
import { readDeferAuth, writeDeferAuth, hasLocalHouseholdActivity } from './lib/deferAuth.js';
import {
  buildDinnerHomeOffer,
  createStockRegisterProposalFromUserInput,
} from './domain/dinnerHome.js';
import { resolveDinnerVisual } from './domain/dinnerVisual.js';
import { nextFoodAction, normalizeFoodNav } from './domain/foodHub.js';
import { categoryLabel, categoryOptionsHtml } from './domain/categories.js';
import { pinWindowTop } from './lib/scrollLock.js';
import { createOllamaProvider, installHint, OLLAMA_PROXY_PREFIX } from './ai/ollama.js';
import { smokeTest, DEFAULT_MODEL } from './ai/provider.js';
import { runConversationTurn } from './ai/conversation.js';
import { createGroqProvider, GROQ_DEFAULT_MODEL } from './ai/groq.js';
import { createAiRouter, formatRouteBadge } from './ai/router.js';
import { readCloudConfig, cloudSetupSteps } from './cloud/config.js';
import { getAuthSession, signInWithEmail, signUpWithEmail, signOut } from './cloud/auth.js';
import {
  listMyHouseholds,
  createHousehold,
  createInvite,
  acceptInvite,
  listMembers,
} from './cloud/households.js';
import { pushLocalToCloud, pullCloudToState, fetchCloudSnapshot } from './cloud/sync.js';
import { buildMigrationPlan, formatMigrationPreview } from './cloud/migratePlan.js';
import { createSyncRuntime, syncBadgeLabel, SyncStatus } from './cloud/syncRuntime.js';
import { getSupabaseClient } from './cloud/client.js';
import {
  ensureDeviceLocalBackup,
  saveScopedState,
  loadScopedState,
  isolateOnSignOut,
  bootPrefersScopedCache,
} from './cloud/sessionScope.js';
import {
  needsCloudAuthGate,
  parseSignupHouseholdName,
} from './cloud/onboarding.js';
import {
  buildSyncableFootprint,
  chooseCloudBootstrapAction,
  prepareHouseholdSwitch,
  bootstrapNetworkFailure,
  finalizeBootstrapPull,
  isQuietPullSuccess,
} from './cloud/bootstrap.js';
import { uid } from './lib/id.js';
import { getStorageScope, sandboxBadgeText } from './lib/storageScope.js';

export function createApp(root) {
  const sandboxScope = getStorageScope();
  const sandboxLabel = sandboxBadgeText(sandboxScope);
  let state = bootPrefersScopedCache(bootState());
  ensureActiveList(state);
  if (!state.settings.view) state.settings.view = 'home';
  if (!state.settings.foodSegment) state.settings.foodSegment = 'shopping';
  {
    const nav = normalizeFoodNav(state.settings.view, state.settings.foodSegment);
    state.settings.view = nav.view;
    state.settings.foodSegment = nav.foodSegment;
  }
  if (!state.cloud) {
    state.cloud = {
      householdId: null,
      lastPushedAt: null,
      lastPulledAt: null,
      userId: null,
      mode: 'local',
      migratedAt: null,
    };
  }
  persist(state);

  let toast = '';
  let editingId = null;
  /** Inventory row currently being edited (separate from shopping edit). */
  let editingInventoryId = null;
  let pendingProposals = [];
  /** @type {null | { ready: object[], needsClarify: object[], skipped: string[] }} */
  let orderPasteDraft = null;
  let quickDraft = null;
  /** @type {null | { proposal: object, preview: object }} */
  let pendingApproval = null;
  /** Cycle index for home dinner 「바꾸기」 alternatives (session only). */
  let dinnerAltIndex = 0;
  /** Session-only stock confirm form for untracked dinner proteins. */
  let stockRegisterDraft = null;
  /** @type {{ role: 'user'|'assistant', text: string, kind?: string, engine?: string }[]} */
  let chatLog = [];
  let chatBusy = false;
  let chatDraft = '';
  /** @type {{ status: string, message: string, models: string[], reply: string, busy: boolean, installHint: string, routeProvider: string, routeModel: string }} */
  let aiUi = {
    status: 'idle',
    message: '아직 확인하지 않았어요. 규칙 엔진은 AI 없이도 동작해요.',
    models: [],
    reply: '',
    busy: false,
    installHint: '',
    routeProvider: 'none',
    routeModel: '',
  };
  const cloudCfg = readCloudConfig();
  const syncRuntime = createSyncRuntime();
  let unbindNetwork = () => {};
  let syncPushTimer = null;
  let applyingRemote = false;
  /** @type {{ busy: boolean, user: object|null, households: object[], members: object[], inviteCode: string, message: string, migrationPlan: object|null, migrationText: string, deferAuth: boolean }} */
  let cloudUi = {
    busy: false,
    user: null,
    households: [],
    members: [],
    inviteCode: '',
    migrationPlan: null,
    migrationText: '',
    deferAuth: readDeferAuth(),
    message: cloudCfg.configured
      ? '공용 관리자 계정으로 로그인하면 Mac·iPhone·iPad에서 같은 집 데이터를 쓸 수 있어요.'
      : '클라우드 미설정 — 로컬만 사용 중이에요.',
  };

  function isCloudPrimary() {
    return state.cloud?.mode === 'cloud-primary' && !!state.cloud?.householdId && !!cloudUi.user;
  }

  function persistActive() {
    if (isCloudPrimary()) {
      saveScopedState(state.cloud.userId, state.cloud.householdId, state);
    } else {
      persist(state);
    }
  }

  async function pushCloudQuiet() {
    if (!isCloudPrimary() || applyingRemote) return;
    if (!syncRuntime.isOnline()) {
      syncRuntime.setStatus(SyncStatus.offline, '오프라인 — 캐시만 표시, 수정은 온라인에서');
      render();
      return;
    }
    syncRuntime.setStatus(SyncStatus.syncing, '클라우드에 저장 중…');
    render();
    try {
      await pushLocalToCloud(state, state.cloud.householdId);
      const now = new Date().toISOString();
      state.cloud.lastPushedAt = now;
      persistActive();
      syncRuntime.setStatus(SyncStatus.ok, '동기화 완료', { syncedAt: now, error: null });
    } catch (err) {
      syncRuntime.setStatus(SyncStatus.error, err.message || '동기화 실패', { error: err.message });
    }
    render();
  }

  function scheduleCloudPush() {
    if (!isCloudPrimary()) return;
    if (syncPushTimer) clearTimeout(syncPushTimer);
    syncPushTimer = setTimeout(() => {
      syncPushTimer = null;
      pushCloudQuiet();
    }, 450);
  }

  /**
   * Pull remote household into local cache.
   * Always returns { ok } — callers must not treat void/undefined as success.
   */
  async function pullCloudQuiet({ reason = 'pull' } = {}) {
    if (!isCloudPrimary()) return { ok: false, skipped: true, reason: 'not-primary' };
    if (applyingRemote) return { ok: false, skipped: true, reason: 'busy' };
    if (!syncRuntime.isOnline()) {
      syncRuntime.setStatus(SyncStatus.offline, '오프라인 — 이 기기 캐시를 보여 줘요');
      render();
      return { ok: false, offline: true };
    }
    syncRuntime.setStatus(SyncStatus.syncing, reason === 'realtime' ? '다른 기기 변경 반영 중…' : '클라우드에서 불러오는 중…');
    render();
    try {
      applyingRemote = true;
      const localCatalog = {
        cookingPatterns: state.cookingPatterns,
        sauces: state.sauces,
      };
      const next = await pullCloudToState(state, state.cloud.householdId);
      // Patterns/sauces stay device-local (no cloud tables).
      next.cookingPatterns = localCatalog.cookingPatterns || next.cookingPatterns || [];
      next.sauces = localCatalog.sauces || next.sauces || [];
      next.cloud = {
        ...next.cloud,
        mode: 'cloud-primary',
        userId: state.cloud.userId,
        migratedAt: state.cloud.migratedAt,
        lastPushedAt: state.cloud.lastPushedAt,
      };
      state = next;
      ensureActiveList(state);
      persistActive();
      const now = new Date().toISOString();
      syncRuntime.setStatus(SyncStatus.ok, '동기화 완료', { syncedAt: now, error: null });
      return { ok: true };
    } catch (err) {
      const message = err.message || '불러오기 실패';
      syncRuntime.setStatus(SyncStatus.error, message, { error: message });
      return { ok: false, error: err, message };
    } finally {
      applyingRemote = false;
      render();
    }
  }

  async function startCloudListeners() {
    await syncRuntime.unsubscribe();
    syncRuntime.stopPolling();
    if (!isCloudPrimary()) return;
    const client = getSupabaseClient();
    let debounce = null;
    await syncRuntime.subscribeHousehold(client, state.cloud.householdId, () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => pullCloudQuiet({ reason: 'realtime' }), 600);
    });
    syncRuntime.startPolling(45000, () => pullCloudQuiet({ reason: 'poll' }));
  }

  /**
   * Bind household so Supabase is the real store.
   * Considers shopping/inventory/meals/dinner/profiles (+ local pattern·sauce catalog).
   * Divergent both-sides data → preview approval only (no silent overwrite).
   */
  async function activateCloudAsPrimary({ forcePreview = false } = {}) {
    const hid = state.cloud?.householdId;
    if (!hid || !cloudUi.user) return { ok: false, action: 'skip' };
    if (state.cloud.mode === 'cloud-primary' && !forcePreview) {
      const pulled = await pullCloudQuiet({ reason: 'session' });
      if (!isQuietPullSuccess(pulled)) {
        cloudUi.message = pulled?.message || '클라우드에서 불러오지 못했어요. 이 기기 데이터는 그대로 두었어요.';
        return { ok: false, action: 'error', error: pulled?.error || null, pull: pulled };
      }
      await startCloudListeners();
      return { ok: true, action: 'already' };
    }

    ensureDeviceLocalBackup(state);
    syncRuntime.setStatus(SyncStatus.syncing, '클라우드에 연결 중…');
    render();

    try {
      const snap = await fetchCloudSnapshot(state, hid);
      const plan = buildMigrationPlan(state, snap);
      const localFp = buildSyncableFootprint(state);
      const cloudFp = buildSyncableFootprint(snap);
      const action = forcePreview
        ? 'needs-preview'
        : chooseCloudBootstrapAction({ local: localFp, cloud: cloudFp, plan });

      if (action === 'needs-preview') {
        cloudUi.migrationPlan = plan;
        cloudUi.migrationText = formatMigrationPreview(plan);
        cloudUi.message =
          '이 기기와 클라우드에 서로 다른 기록이 있어요. 미리보기를 확인한 뒤 승인해 주세요. 자동으로 덮어쓰지 않아요.';
        syncRuntime.setStatus(SyncStatus.idle, '이전 확인 필요');
        return { ok: false, action: 'needs-preview' };
      }

      if (action === 'push' || action === 'empty') {
        if (action === 'push') await pushLocalToCloud(state, hid);
        const now = new Date().toISOString();
        state.cloud.mode = 'cloud-primary';
        state.cloud.migratedAt = now;
        state.cloud.lastPushedAt = now;
        state.cloud.userId = cloudUi.user.id;
        persistActive();
        cloudUi.migrationPlan = null;
        cloudUi.migrationText = '';
        cloudUi.message =
          action === 'push'
            ? '이 기기 기록을 클라우드에 올렸고, 이제 클라우드가 기본 저장소예요.'
            : '클라우드를 기본 저장소로 연결했어요. 재고·장보기·식단을 넣으면 자동으로 동기화돼요.';
        syncRuntime.setStatus(SyncStatus.ok, '클라우드 연결됨', { syncedAt: now, error: null });
        await startCloudListeners();
        return { ok: true, action };
      }

      // pull: download first — promote to cloud-primary only after success.
      const localBeforePull = state;
      let pulledState = null;
      try {
        pulledState = await pullCloudToState(localBeforePull, hid);
      } catch (pullErr) {
        const failed = finalizeBootstrapPull({
          pullOk: false,
          localState: localBeforePull,
          error: pullErr,
        });
        state = failed.state;
        persist(state);
        cloudUi.message = failed.message;
        syncRuntime.setStatus(SyncStatus.error, failed.message, { error: failed.message });
        return failed;
      }

      const finalized = finalizeBootstrapPull({
        pullOk: true,
        localState: localBeforePull,
        pulledState,
        userId: cloudUi.user.id,
      });
      state = finalized.state;
      ensureActiveList(state);
      persistActive();
      cloudUi.migrationPlan = null;
      cloudUi.migrationText = '';
      cloudUi.message = finalized.message;
      syncRuntime.setStatus(SyncStatus.ok, '클라우드 연결됨', {
        syncedAt: state.cloud.lastPulledAt,
        error: null,
      });
      await startCloudListeners();
      return { ok: true, action: 'pull' };
    } catch (err) {
      const fail = bootstrapNetworkFailure(err);
      cloudUi.message = fail.message;
      // Stay local — do not flip mode or wipe device data on network errors.
      if (state.cloud?.mode !== 'cloud-primary') {
        state.cloud.mode = 'local';
        persist(state);
      }
      syncRuntime.setStatus(SyncStatus.error, cloudUi.message, { error: cloudUi.message });
      return fail;
    }
  }

  async function switchActiveHousehold(nextHid) {
    if (!nextHid || !cloudUi.user) return;
    await syncRuntime.dispose();
    const switched = prepareHouseholdSwitch({
      prevState: state,
      nextHouseholdId: nextHid,
      userId: cloudUi.user.id,
      loadScoped: loadScopedState,
      saveScoped: saveScopedState,
    });
    state = switched.state;
    ensureActiveList(state);
    persistActive();
    cloudUi.migrationPlan = null;
    cloudUi.migrationText = '';
    cloudUi.members = [];
    try {
      cloudUi.members = await listMembers(nextHid);
    } catch {
      cloudUi.members = [];
    }
    await activateCloudAsPrimary();
  }

  async function refreshCloudSession() {
    if (!cloudCfg.configured) return;
    try {
      const { user } = await getAuthSession();
      cloudUi.user = user;
      if (user) {
        if (state.cloud.userId && state.cloud.userId !== user.id) {
          // Account switch: isolate previous mirror
          const restored = isolateOnSignOut();
          if (restored) state = restored;
          ensureActiveList(state);
        }
        state.cloud.userId = user.id;
        cloudUi.households = await listMyHouseholds();
        if (!state.cloud.householdId && cloudUi.households.length === 1) {
          state.cloud.householdId = cloudUi.households[0].householdId;
          persist(state);
        }
        if (state.cloud.householdId) {
          cloudUi.members = await listMembers(state.cloud.householdId);
          if (state.cloud.mode === 'cloud-primary') {
            const pulled = await pullCloudQuiet({ reason: 'session' });
            if (!isQuietPullSuccess(pulled)) {
              cloudUi.message =
                pulled?.message || '클라우드 불러오기에 실패했어요. 이 기기 캐시는 그대로입니다.';
            } else {
              await startCloudListeners();
            }
          } else {
            await activateCloudAsPrimary();
          }
        }
      } else {
        cloudUi.households = [];
        cloudUi.members = [];
        await syncRuntime.unsubscribe();
        syncRuntime.stopPolling();
      }
    } catch (err) {
      cloudUi.message = err.message || '세션 확인 실패';
      syncRuntime.setStatus(SyncStatus.error, cloudUi.message, { error: cloudUi.message });
    }
  }

  unbindNetwork = syncRuntime.bindNetwork((kind) => {
    if (kind === 'online' && isCloudPrimary()) pullCloudQuiet({ reason: 'online' });
    render();
  });

  refreshCloudSession().then(() => render());

  function aiProvider() {
    const model = state.settings.ai?.model || DEFAULT_MODEL;
    const ollama = createOllamaProvider({
      baseUrl: OLLAMA_PROXY_PREFIX,
      preferredModel: model,
    });
    const groq = createGroqProvider({
      preferredModel: GROQ_DEFAULT_MODEL,
      getHouseholdId: () => state.cloud?.householdId || null,
      getState: () => state,
    });
    return createAiRouter({
      ollama,
      groq,
      getState: () => state,
      onRoute: (info) => {
        aiUi.routeProvider = info.provider;
        aiUi.routeModel = info.model || '';
        if (info.message) aiUi.message = info.message;
      },
    });
  }

  const setToast = (msg) => {
    toast = msg;
    render();
    if (!msg) return;
    setTimeout(() => {
      if (toast === msg) {
        toast = '';
        render();
      }
    }, 2600);
  };

  const commit = (fn, message) => {
    if (isCloudPrimary() && !syncRuntime.canWrite('cloud-primary')) {
      setToast('오프라인에서는 읽기만 가능해요. 네트워크 연결 후 다시 수정해 주세요.');
      syncRuntime.setStatus(SyncStatus.readonly, '오프라인 읽기 전용');
      return;
    }
    fn(state);
    persistActive();
    scheduleCloudPush();
    if (message) setToast(message);
    else render();
  };

  function render() {
    const nav = normalizeFoodNav(state.settings.view || 'home', state.settings.foodSegment);
    state.settings.view = nav.view;
    state.settings.foodSegment = nav.foodSegment;
    const view = state.settings.view;
    const authGate = needsCloudAuthGate({
      configured: cloudCfg.configured,
      user: cloudUi.user,
      deferAuth: cloudUi.deferAuth,
    });
    const dinnerPeek =
      !authGate && view === 'home'
        ? buildDinnerHomeOffer(state, { altIndex: dinnerAltIndex })
        : null;
    const dinnerVisualPeek =
      dinnerPeek?.status === 'offer'
        ? resolveDinnerVisual(state, dinnerPeek.offer)
        : dinnerPeek?.status === 'confirmed'
          ? resolveDinnerVisual(state, dinnerPeek.dinner)
          : null;
    const immersiveHome = Boolean(dinnerVisualPeek?.imageSrc);
    root.innerHTML = `
      <div class="shell ${immersiveHome ? 'shell-immersive' : ''}">
        ${
          immersiveHome
            ? ''
            : `<header class="top">
          <div>
            <p class="eyebrow">Family Flow</p>
            <h1>${authGate ? '우리 집 시작하기' : viewTitle(view)}</h1>
          </div>
          <div class="top-meta">
            ${sandboxChip()}
            ${authGate ? '' : settingsBtn()}
          </div>
        </header>`
        }
        <main class="main" ${pendingApproval ? 'inert' : ''}>
          ${
            authGate
              ? authGateView()
              : view === 'home'
                ? homeView({ immersive: immersiveHome })
                : view === 'food'
                  ? foodView()
                  : view === 'family'
                    ? familyView()
                    : moreView()
          }
        </main>
        ${toast ? `<div class="toast" role="status">${esc(toast)}</div>` : ''}
        ${
          authGate
            ? ''
            : `<nav class="tabbar" aria-label="주요 메뉴" ${pendingApproval ? 'inert' : ''}>
          <div class="tabbar-inner">
            ${tab('home', '홈', 'home')}
            ${tab('food', '식생활', 'food')}
            ${tab('family', '가족', 'family')}
          </div>
        </nav>`
        }
        ${pendingApproval ? approvalPanel(pendingApproval) : ''}
      </div>`;
    bind();
    if (pendingApproval) {
      const sheet = root.querySelector('.approval-sheet');
      const focusEl = sheet?.querySelector('.primary, .ghost, [data-act]');
      requestAnimationFrame(() => focusEl?.focus?.());
    }
  }

  function settingsBtn(opts = {}) {
    const onMedia = !!opts.onMedia;
    const on = state.settings.view === 'more';
    return `<button type="button" class="settings-btn ${on ? 'on' : ''} ${onMedia ? 'on-media' : ''}" data-nav="more" aria-label="설정" title="설정">
      <svg class="settings-ico" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="3"/>
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
      </svg>
    </button>`;
  }

  function sandboxChip(opts = {}) {
    if (!sandboxLabel) return '';
    const onMedia = opts.onMedia ? ' on-media' : '';
    return `<span class="sandbox-badge${onMedia}" title="저장 키 격리 중 · 기본 기기 데이터와 섞이지 않아요">${esc(
      sandboxLabel,
    )}</span>`;
  }

  function tabIcon(kind) {
    const common = 'class="tab-ico" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
    if (kind === 'home') {
      return `<svg ${common}><path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z"/></svg>`;
    }
    if (kind === 'food') {
      return `<svg ${common}><path d="M4 11h16v2H4z"/><path d="M7 7c0-1.5 1.2-3 3-3s3 1.5 3 3"/><path d="M14 7c0-1.5 1.2-3 3-3s3 1.5 3 3"/><path d="M6 13v5a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-5"/></svg>`;
    }
    if (kind === 'family') {
      return `<svg ${common}><circle cx="9" cy="8" r="3"/><circle cx="16" cy="9" r="2.4"/><path d="M3.5 19c.6-3 2.8-5 5.5-5s4.9 2 5.5 5"/><path d="M13 14.2c1.7-.4 3.4.3 4.5 1.8.5.7.8 1.5 1 2"/></svg>`;
    }
    return `<svg ${common}><circle cx="6" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.6" fill="currentColor" stroke="none"/></svg>`;
  }

  function authGateView() {
    const localBusy = hasLocalHouseholdActivity(state);
    return `
      <section class="hero-assist">
        <p class="lede">${
          localBusy
            ? '이 기기에 이미 장보기·재고·저녁 기록이 있어요.'
            : '처음이라면 공용 관리자 계정으로 시작해 주세요.'
        }</p>
        <h2>${localBusy ? '이어서 쓰거나 로그인' : '로그인 또는 집 만들기'}</h2>
        <p class="hint">${
          localBusy
            ? '새로고침 후에도 로컬 기록은 남아 있어요. 클라우드로 옮기려면 로그인하세요.'
            : '계정 하나만 만들면 Mac·iPhone·iPad에서 같은 집을 씁니다.'
        }</p>
      </section>
      ${cloudPanel()}
      <section class="panel muted">
        <button type="button" class="primary block" data-act="defer-cloud-auth">${
          localBusy ? '이 기기 기록으로 계속' : '잠깐 둘러보기 (이 기기만 · 동기화 안 됨)'
        }</button>
        <p class="hint">나중에 우측 위 설정에서 언제든 로그인할 수 있어요.</p>
      </section>`;
  }

  function tab(id, label, icon) {
    const on = state.settings.view === id;
    return `<button type="button" data-nav="${id}" class="tab ${on ? 'on' : ''}" ${on ? 'aria-current="page"' : ''}>
      ${tabIcon(icon || id)}
      <span class="tab-label">${label}</span>
    </button>`;
  }

  function viewTitle(view) {
    if (view === 'food') {
      const seg = state.settings.foodSegment || 'shopping';
      return { shopping: '식생활 · 장보기', inventory: '식생활 · 재고', meals: '식생활 · 식단' }[seg] || '식생활';
    }
    return {
      home: '오늘 챙길 일',
      food: '식생활',
      family: '가족',
      more: '설정',
      shopping: '식생활 · 장보기',
      inventory: '식생활 · 재고',
      meals: '식생활 · 식단',
    }[view];
  }

  function foodView() {
    const next = nextFoodAction(state);
    const seg = state.settings.foodSegment || next.segment || 'shopping';
    const segments = [
      { id: 'shopping', label: '장보기' },
      { id: 'inventory', label: '재고' },
      { id: 'meals', label: '식단' },
    ];
    return `
      <section class="panel food-coach" aria-label="지금 할 일">
        <p class="label">불편해지기 전에 먼저</p>
        <h2>${esc(next.title)}</h2>
        <p class="hint">${esc(next.hint)}</p>
        ${
          next.segment !== seg
            ? `<button type="button" class="primary block" data-nav="food" data-segment="${next.segment}">${esc(next.cta)}</button>`
            : `<p class="hint">아래에 바로 이어서 하면 돼요.</p>`
        }
      </section>
      <div class="food-segments" role="tablist" aria-label="식생활 구분">
        ${segments
          .map(
            (s) =>
              `<button type="button" role="tab" class="food-seg ${seg === s.id ? 'on' : ''}" data-nav="food" data-segment="${s.id}" aria-selected="${seg === s.id ? 'true' : 'false'}">${s.label}</button>`,
          )
          .join('')}
      </div>
      ${seg === 'shopping' ? shoppingView() : seg === 'inventory' ? inventoryView() : mealsView()}
    `;
  }

  function familyView() {
    return `
      <section class="panel">
        <p class="lede">가입 계정이 아니라, 집 안 이름표예요.</p>
        <h2>가족 프로필</h2>
        <p class="hint">엄마·아빠는 별도 가입하지 않아도 됩니다. 건강·금융 정보는 저장하지 않아요.</p>
        <ul class="chip-list">${(state.members || [])
          .map(
            (m) =>
              `<li class="member-chip"><span class="member-chip-text">${esc(m.displayName)} · ${esc(m.roleLabel || m.role || '구성원')}</span><button type="button" class="ghost member-chip-x" data-act="remove-member" data-id="${esc(m.id)}" aria-label="삭제">×</button></li>`,
          )
          .join('')}</ul>
        <form data-form="add-member" class="cloud-auth">
          <label>이름<input name="displayName" required maxlength="40" placeholder="엄마" /></label>
          <label>역할
            <select name="roleLabel">
              <option value="구성원">구성원</option>
              <option value="엄마">엄마</option>
              <option value="아빠">아빠</option>
              <option value="자녀">자녀</option>
              <option value="관리자">관리자</option>
            </select>
          </label>
          <button type="submit" class="secondary">프로필 추가</button>
        </form>
      </section>
      <section class="panel muted">
        <h2>아직 안 하는 것</h2>
        <ul class="locked"><li>가족 건강</li><li>가족 일정</li><li>가사 분담</li></ul>
      </section>`;
  }

  function homeView({ immersive = false } = {}) {
    const pack = generateSuggestions(state);
    const list = ensureActiveList(state);
    const openCount = list.items.filter((i) => !i.checked).length;
    const lowCount = state.inventory.filter((i) => i.status === 'out' || i.status === 'low').length;
    const dinnerHome = buildDinnerHomeOffer(state, { altIndex: dinnerAltIndex });
    const dinnerBlock = dinnerHomeBlock(dinnerHome, { immersive });

    if (pack.mode === 'setup') {
      return `
        ${
          immersive
            ? dinnerBlock
            : `<section class="hero-assist">
          <p class="lede">목록을 채우기 전에, 필요한 일을 먼저 보여 드릴게요.</p>
          <h2>${esc(pack.setup.title)}</h2>
          <p class="hint">임의의 재고·구매 이력을 만들지 않아요. 아는 것만 짧게 등록해 주세요.</p>
          <ul class="setup-steps">
            ${pack.setup.steps
              .map(
                (s) => `<li>
                <button type="button" class="setup-go" data-nav="${s.view}" ${s.segment ? `data-segment="${s.segment}"` : ''}>
                  <span>${esc(s.label)}</span><span aria-hidden="true">→</span>
                </button>
                <small>${esc(s.hint)}</small>
              </li>`,
              )
              .join('')}
          </ul>
        </section>
        ${dinnerBlock}`
        }
        ${
          immersive
            ? `<section class="status-strip" aria-label="요약">
          <div><p class="label">살 것</p><p class="budget-value">${openCount}</p></div>
          <div><p class="label">재고 주의</p><p class="budget-value">${lowCount}</p></div>
          <div><p class="label">저녁</p><p class="budget-value">${dinnerHome.status === 'confirmed' ? '확정' : dinnerHome.status === 'offer' ? '제안' : '미정'}</p></div>
        </section>
        ${chatPanel()}`
            : chatPanel()
        }`;
    }

    return `
      ${dinnerBlock}
      <section class="status-strip" aria-label="요약">
        <div><p class="label">살 것</p><p class="budget-value">${openCount}</p></div>
        <div><p class="label">재고 주의</p><p class="budget-value">${lowCount}</p></div>
        <div><p class="label">저녁</p><p class="budget-value">${dinnerHome.status === 'confirmed' ? '확정' : dinnerHome.status === 'offer' ? '제안' : '미정'}</p></div>
      </section>
      <section class="panel">
        <h2>지금 챙길 일</h2>
        ${
          pack.suggestions.length
            ? `<ul class="suggest-list">${pack.suggestions.map(suggestCard).join('')}</ul>`
            : `<p class="empty">지금은 급한 제안이 없어요. 장보기·재고는 아래에서 바로 갈 수 있어요.</p>`
        }
      </section>
      ${chatPanel()}
      <section class="panel muted">
        <h2>도구</h2>
        <div class="tool-grid">
          <button type="button" class="secondary" data-nav="food" data-segment="shopping">장보기${openCount ? ` · ${openCount}` : ''}</button>
          <button type="button" class="secondary" data-nav="food" data-segment="inventory">재고</button>
          <button type="button" class="secondary" data-nav="food" data-segment="meals">식단</button>
        </div>
        <p class="hint">세 가지는 식생활 탭 안에 모아 두었어요. 변경은 승인 후에만 저장돼요.</p>
      </section>`;
  }

  /** Stock / sauce / protein chips under the dinner title. */
  function dinnerMetaChips({ stockLabel, sauceName, protein } = {}) {
    const chips = [];
    if (stockLabel) chips.push({ text: stockLabel, kind: 'stock' });
    const sauce = String(sauceName || '').trim();
    // Always show full sauce name as text (title uses a shortened label).
    if (sauce) chips.push({ text: `소스 · ${sauce}`, kind: 'sauce' });
    if (protein) chips.push({ text: `곁들임 · ${protein}`, kind: 'protein' });
    if (!chips.length) return '';
    return `<div class="dinner-meta-chips" role="list">${chips
      .map(
        (c) =>
          `<p class="dinner-meta-chip dinner-meta-chip-${c.kind}" role="listitem">${esc(c.text)}</p>`,
      )
      .join('')}</div>`;
  }

  function dinnerHomeBlock(dinnerHome, { immersive = false } = {}) {
    if (dinnerHome.status === 'confirmed') {
      const dinner = dinnerHome.dinner;
      const visual = resolveDinnerVisual(state, dinner);
      const meta = dinnerMetaChips({
        sauceName: dinner.sauceName,
        protein: dinner.protein,
      });
      if (immersive && visual.imageSrc) {
        return dinnerStage({
          visual,
          badgeLabel: '확정',
          label: '오늘 저녁 · 확정',
          title: dinner.title,
          meta,
          support: '',
          actions: '',
        });
      }
      return `<section class="panel dinner-hero" aria-label="오늘 저녁">
        <div class="dinner-hero-body">
          <p class="label">오늘 저녁 · 확정</p>
          <h2>${esc(dinner.title)}</h2>
          ${meta}
        </div>
      </section>`;
    }

    if (dinnerHome.status === 'empty') {
      return `<section class="panel dinner-hero dinner-empty" aria-label="오늘 저녁 추천">
        <p class="label">오늘 저녁 추천</p>
        <h2>추천할 저녁이 부족해요</h2>
        <p class="hint">${esc(dinnerHome.emptyReason)}</p>
        <div class="dinner-empty-actions">
          <button type="button" class="secondary block" data-nav="food" data-segment="inventory">재고 확인하기</button>
        </div>
      </section>`;
    }

    const offer = dinnerHome.offer;
    const visual = resolveDinnerVisual(state, offer);
    const meta = dinnerMetaChips({
      stockLabel: offer.stockLabel,
      sauceName: offer.sauceName,
      protein: offer.protein,
    });
    const support =
      offer.stockStatus === 'untracked'
        ? '사진은 야채 패턴·소스예요. 곁들임 재고는 추측하지 않아요.'
        : '확인된 재고·식단 신호를 섞어 골랐어요.';
    const actions = `<div class="dinner-actions">
      <button type="button" class="primary block" data-act="dinner-accept">이대로</button>
      <button type="button" class="dinner-swap" data-act="dinner-swap" ${offer.hasAlt ? '' : 'disabled'}>다른 후보로 바꾸기</button>
      ${
        offer.canRegisterStock
          ? stockRegisterDraft?.protein === offer.protein
            ? renderStockRegisterForm(offer.protein)
            : `<button type="button" class="secondary block" data-act="dinner-register-stock">재고 확인 후 등록</button>`
          : ''
      }
      <p class="fine">저녁·재고 모두 승인 후에만 저장돼요</p>
    </div>`;

    if (immersive && visual.imageSrc) {
      return dinnerStage({
        visual,
        badgeLabel: '저장 전',
        label: '오늘 저녁 추천',
        title: offer.title,
        meta,
        support,
        actions,
      });
    }

    return `<section class="panel dinner-hero" aria-label="오늘 저녁 추천">
      <div class="dinner-hero-body">
        <p class="label">오늘 저녁 추천 · 저장 전</p>
        <h2>${esc(offer.title)}</h2>
        ${meta}
        <p class="hint">${esc(support)}</p>
        ${actions}
      </div>
    </section>`;
  }

  function renderStockRegisterForm(protein) {
    return `<form data-form="dinner-stock-register" class="dinner-stock-form" aria-label="재고 확인 후 등록">
      <p class="hint"><strong>${esc(protein)}</strong> — 확인한 값만 적어요. 비운 수량·단위는 저장하지 않아요.</p>
      <label>보유 상태
        <select name="status" required>
          <option value="">선택해 주세요</option>
          <option value="enough">충분함</option>
          <option value="low">부족함</option>
          <option value="out">없음</option>
          <option value="unknown">모름</option>
        </select>
      </label>
      <label>보관 위치
        <select name="location" required>
          <option value="">선택해 주세요</option>
          <option value="fridge">냉장고</option>
          <option value="freezer">냉동실</option>
          <option value="pantry">실온·팬트리</option>
          <option value="storage">창고</option>
        </select>
      </label>
      <label>수량 (선택)<input name="quantity" type="number" min="0.1" step="0.1" inputmode="decimal" placeholder="모를면 비워 두세요" /></label>
      <label>단위 (선택)<input name="unit" maxlength="12" placeholder="예: 개, 마리 (선택)" /></label>
      <input type="hidden" name="name" value="${esc(protein)}" />
      <div class="row-actions wrap">
        <button type="submit" class="primary">미리보기</button>
        <button type="button" class="ghost" data-act="dinner-stock-cancel">취소</button>
      </div>
    </form>`;
  }

  function dinnerStage({
    visual,
    badgeLabel,
    label = '오늘 저녁 추천',
    title,
    meta = '',
    support = '',
    actions,
  }) {
    const mediaLabel = [visual.patternName, visual.sauceShortName ? `소스 ${visual.sauceShortName}` : '']
      .filter(Boolean)
      .join(' · ');
    return `<section class="dinner-stage" aria-label="오늘 저녁">
      <div class="dinner-media" data-hero-src="${esc(visual.imageSrc || '')}" style="background-image:url('${esc(
        visual.imageSrc,
      )}')" role="img" aria-label="${esc(mediaLabel || '저녁 패턴')}">
        <div class="dinner-media-top">
          <p class="dinner-brand">Family Flow</p>
          <div class="dinner-media-meta">
            ${sandboxChip({ onMedia: true })}
            ${settingsBtn({ onMedia: true })}
          </div>
        </div>
        <span class="dinner-media-badge">${esc(badgeLabel)}</span>
      </div>
      <div class="dinner-hero-body">
        <p class="label">${esc(label)}</p>
        <h2>${esc(title)}</h2>
        ${meta || ''}
        ${support ? `<p class="hint">${esc(support)}</p>` : ''}
        ${actions || ''}
      </div>
    </section>`;
  }

  function chatPanel() {
    return `<section class="panel chat-panel" aria-label="가정 비서 대화">
      <h2>말해 보세요</h2>
      <p class="hint">한국어로 장보기·식단·재고를 말해 주세요. AI는 제안만 하고, 승인 전에는 저장하지 않아요.</p>
      <div class="chat-log" role="log">
        ${
          chatLog.length
            ? chatLog
                .map(
                  (m) =>
                    `<div class="chat-bubble ${m.role}">${esc(m.text)}${
                      m.kind ? `<small>${esc(m.kind)}${m.engine ? ` · ${esc(m.engine)}` : ''}</small>` : ''
                    }</div>`,
                )
                .join('')
            : `<p class="empty">예: “휴지가 다 떨어졌어”, “장보기 목록 보여줘”</p>`
        }
      </div>
      <form data-form="ai-chat" class="chat-form">
        <label class="sr-only" for="chat-text">메시지</label>
        <textarea id="chat-text" name="message" rows="2" maxlength="500" placeholder="무엇을 도와드릴까요?" ${chatBusy ? 'disabled' : ''}>${esc(chatDraft)}</textarea>
        <button type="submit" class="primary" ${chatBusy ? 'disabled' : ''}>${chatBusy ? '생각 중…' : '보내기'}</button>
      </form>
    </section>`;
  }

  function approvalPanel({ proposal, preview }) {
    return `<div class="approval-layer" role="presentation">
      <section class="panel approval approval-sheet" role="dialog" aria-modal="true" aria-labelledby="approval-title" tabindex="-1">
        <h2 id="approval-title">변경 미리보기</h2>
        <p><strong>${esc(proposal.title)}</strong></p>
        <p class="hint">${esc(proposal.reason)}</p>
        ${
          preview.ok
            ? `<ul class="change-list">${preview.changes.map((c) => `<li>${esc(c.text)}</li>`).join('')}</ul>
               <p class="hint">승인 전에는 데이터가 바뀌지 않아요.</p>
               <div class="suggest-actions">
                 <button type="button" class="primary" data-act="confirm-proposal">승인하고 저장</button>
                 <button type="button" class="ghost" data-act="cancel-proposal">취소</button>
               </div>`
            : `<ul class="error-list">${preview.errors.map((e) => `<li>${esc(e.message)}</li>`).join('')}</ul>
               <button type="button" class="ghost" data-act="cancel-proposal">닫기</button>`
        }
      </section>
    </div>`;
  }

  function suggestCard(s) {
    const fp = suggestionFingerprint(s);
    return `<li class="suggest-card" data-fp="${esc(fp)}">
      <div>
        <strong>${esc(s.title)}</strong>
        <p>${esc(s.reason)}</p>
        <small class="hint">${(s.ops || []).length}개 작업 · ${esc(s.source || 'rules')}</small>
      </div>
      <div class="suggest-actions">
        <button type="button" class="primary" data-act="preview-suggestion" data-fp="${esc(fp)}">${esc(s.actionLabel || '변경 미리보기')}</button>
        <button type="button" class="ghost" data-act="dismiss-suggestion" data-fp="${esc(fp)}">나중에</button>
      </div>
    </li>`;
  }

  function shoppingView() {
    const list = ensureActiveList(state);
    const totals = shoppingTotals(list);
    const items = sortShoppingItems(list.items);
    const must = items.filter((i) => !i.checked && i.priority === 'must');
    const nice = items.filter((i) => !i.checked && i.priority === 'nice');
    const done = items.filter((i) => i.checked);
    const suggestions = shoppingSuggestionsFromInventory(state, list);

    return `
      <section class="budget-card">
        <div><p class="label">예산</p><p class="budget-value">${won(list.budgetWon)}</p></div>
        <div><p class="label">남은 예상</p><p class="budget-value ${totals.overBudget ? 'over' : ''}">${won(totals.estimatedOpen)}${totals.overBudget ? ' · 초과' : ''}</p></div>
        <div><p class="label">진행</p><p class="budget-value">${totals.checkedCount}/${totals.count}</p></div>
      </section>

      <form class="quick-add" data-form="quick-add">
        <label class="sr-only" for="quick-text">장보기 추가</label>
        <textarea id="quick-text" name="text" rows="2" placeholder="예: 휴지가 다 떨어졌어. 휴지 30롤 넣어줘.">${esc(quickDraft?.sourceText || '')}</textarea>
        <div class="quick-actions">
          <button type="button" class="ghost" data-act="preview-quick">미리보기</button>
          <button type="submit" class="primary">목록에 추가</button>
        </div>
        ${
          quickDraft
            ? `<div class="preview-card" role="status">
            <strong>${esc(quickDraft.name)}</strong>
            <span>${quickDraft.quantity}${esc(quickDraft.unit)} · ${quickDraft.priority === 'must' ? '필수' : '선택'} · ${catLabel(quickDraft.category)}</span>
            <p class="hint">맞으면 추가를 누르세요. AI 없이도 규칙으로 해석합니다.</p>
          </div>`
            : ''
        }
      </form>

      <form class="manual-add" data-form="manual-add">
        <details ${must.length + nice.length + done.length === 0 ? 'open' : ''}>
          <summary>직접 입력</summary>
          <p class="hint">분류(식재료·간식·생활용품)는 이름으로 자동 지정돼요. 틀리면 수정에서 바꾸세요.</p>
          <div class="form-grid">
            <label>품목<input name="name" required maxlength="80" placeholder="휴지, 과자…" /></label>
            <label>수량<input name="quantity" type="number" min="0.1" step="any" value="1" /></label>
            <label>단위<input name="unit" maxlength="12" value="개" /></label>
            <label>구분<select name="priority"><option value="must">필수</option><option value="nice">선택</option></select></label>
            <label>예상 가격(원)<input name="estimatedPrice" type="number" min="0" step="100" placeholder="선택" /></label>
          </div>
          <button type="submit" class="primary block">추가</button>
        </details>
      </form>

      ${
        suggestions.length
          ? `<section class="panel"><h2>재고에서 제안</h2>
            <p class="hint">탭하면 미리보기가 열리고, 승인한 뒤에만 장보기에 들어가요.</p>
            <ul class="chip-list">${suggestions
              .map(
                (s) =>
                  `<li><button type="button" data-act="preview-inv-suggestion" data-name="${esc(s.name)}" data-qty="${s.quantity}" data-unit="${esc(s.unit)}" data-priority="${s.priority}" data-category="${s.category}" data-inventory="${s.inventoryId || ''}">${esc(s.name)} · 미리보기</button></li>`,
              )
              .join('')}</ul></section>`
          : ''
      }

      ${sectionList('필수', must)}
      ${sectionList('있으면 좋음', nice)}
      ${sectionList('구매 완료', done)}

      ${done.length ? `<button type="button" class="secondary block" data-act="propose-inventory">구매 완료 → 재고 반영 제안</button>` : ''}

      ${
        pendingProposals.length
          ? `<section class="panel proposals"><h2>재고에 반영할까요?</h2>
          ${pendingProposals
            .map(
              (p, idx) =>
                `<label class="proposal"><input type="checkbox" name="prop" value="${idx}" checked /><span>${esc(p.name)} → ${esc(LOCATIONS.find((l) => l.id === p.location)?.label || p.location)} · 충분함</span></label>`,
            )
            .join('')}
          <button type="button" class="primary" data-act="apply-proposals">선택한 항목 재고에 반영</button></section>`
          : ''
      }

      <form class="budget-form" data-form="budget">
        <label>이번 장보기 예산(원)<input name="budgetWon" type="number" min="0" step="1000" value="${list.budgetWon ?? ''}" /></label>
        <button type="submit" class="ghost">예산 저장</button>
      </form>`;
  }

  function sectionList(title, rows) {
    if (!rows.length) {
      return `<section class="panel muted"><h2>${title}</h2><p class="empty">아직 없어요.</p></section>`;
    }
    return `<section class="panel"><h2>${title}</h2><ul class="shop-list">${rows.map(shopRow).join('')}</ul></section>`;
  }

  function shopRow(item) {
    if (editingId === item.id) {
      return `<li class="shop-row edit"><form data-form="edit-item" data-id="${item.id}">
        <input name="name" value="${esc(item.name)}" required maxlength="80" />
        <div class="form-grid compact">
          <input name="quantity" type="number" min="0.1" step="any" value="${item.quantity}" aria-label="수량" />
          <input name="unit" value="${esc(item.unit)}" maxlength="12" aria-label="단위" />
          <select name="priority" aria-label="구분"><option value="must" ${item.priority === 'must' ? 'selected' : ''}>필수</option><option value="nice" ${item.priority === 'nice' ? 'selected' : ''}>선택</option></select>
          <select name="category" aria-label="분류">${categoryOptionsHtml(item.category)}</select>
          <input name="estimatedPrice" type="number" min="0" step="100" value="${item.estimatedPrice ?? ''}" placeholder="가격" aria-label="가격" />
        </div>
        <div class="row-actions">
          <button type="submit" class="primary">저장</button>
          <button type="button" class="ghost" data-act="cancel-edit">취소</button>
        </div>
      </form></li>`;
    }
    return `<li class="shop-row ${item.checked ? 'done' : ''}">
      <label class="check">
        <input type="checkbox" data-act="toggle" data-id="${item.id}" ${item.checked ? 'checked' : ''} />
        <span class="body"><strong>${esc(item.name)}</strong>
        <small>${item.quantity}${esc(item.unit)} · ${item.priority === 'must' ? '필수' : '선택'} · ${catLabel(item.category)}${item.estimatedPrice != null ? ` · ${won(item.estimatedPrice)}` : ''}</small></span>
      </label>
      <div class="row-actions">
        <button type="button" class="icon" data-act="edit" data-id="${item.id}" aria-label="수정">✎</button>
        <button type="button" class="icon danger" data-act="delete" data-id="${item.id}" aria-label="삭제">✕</button>
      </div>
    </li>`;
  }

  function inventoryView() {
    const byLoc = LOCATIONS.map((loc) => ({
      ...loc,
      items: state.inventory.filter((i) => i.location === loc.id),
    }));
    const paste = orderPasteDraft;
    return `
      <p class="lede">정확한 무게는 필요할 때만. 상태만으로도 장보기와 연결됩니다.</p>
      <form class="manual-add order-paste" data-form="order-paste">
        <p class="hint">네이버페이·마이쇼핑 주문 화면을 복사해 붙여 넣으면 재고 이름으로 정리해 드려요. 승인 전에 저장하지 않아요.</p>
        <p class="hint"><a href="${esc(NAVER_PAY_HISTORY_URL)}" target="_blank" rel="noopener noreferrer">네이버페이 주문·결제내역 바로가기</a></p>
        <label class="block-label">주문 내역 붙여넣기
          <textarea name="paste" rows="5" placeholder="결제완료&#10;[KF365] 무항생제 달걀 XL(특란) 40구…"></textarea>
        </label>
        <button type="submit" class="secondary block">붙여넣기 분석</button>
      </form>
      ${
        paste
          ? `<section class="panel proposals" data-order-paste-result>
          <h2>재고에 넣을까요?</h2>
          ${
            paste.ready.length
              ? paste.ready
                  .map((p, idx) => {
                    const qty =
                      p.quantity != null && p.unit
                        ? `${p.quantity}${esc(p.unit)}`
                        : p.quantity != null
                          ? String(p.quantity)
                          : '수량 없음(상태만)';
                    const loc = LOCATIONS.find((l) => l.id === p.location)?.label || p.location;
                    return `<label class="proposal"><input type="checkbox" name="order-ready" value="${idx}" checked /><span><strong>${esc(p.name)}</strong> · ${esc(qty)} · ${esc(loc)} · 충분함</span></label>`;
                  })
                  .join('')
              : '<p class="empty">바로 등록할 항목이 없어요.</p>'
          }
          ${
            paste.needsClarify.length
              ? `<h3 class="subhead">확인이 필요해요</h3>
              <p class="hint">상세 옵션·용량을 짧게 적어 주세요. 예: 1kg, 물냉</p>
              ${paste.needsClarify
                .map(
                  (p, idx) => `<div class="clarify-row" data-clarify-idx="${idx}">
                    <p><strong>${esc(p.name)}</strong> <small>${esc(p.clarifyReason || '')}</small></p>
                    <p class="fine muted-src">${esc(p.sourceText)}</p>
                    <div class="row-actions">
                      <input name="clarify-${idx}" maxlength="40" placeholder="1kg / 옵션명" aria-label="${esc(p.name)} 보완" />
                      <button type="button" class="secondary" data-act="clarify-order" data-idx="${idx}">반영</button>
                    </div>
                  </div>`,
                )
                .join('')}`
              : ''
          }
          ${
            paste.ready.length
              ? `<button type="button" class="primary block" data-act="apply-order-paste">선택한 항목 재고에 등록</button>`
              : ''
          }
          <button type="button" class="ghost block" data-act="clear-order-paste">붙여넣기 닫기</button>
        </section>`
          : ''
      }
      <form class="manual-add" data-form="add-inventory">
        <p class="hint">분류는 이름으로 자동 지정돼요. 틀리면 수정(✎)에서 바꾸세요.</p>
        <div class="form-grid">
          <label>이름<input name="name" required maxlength="80" placeholder="브로콜리, 과자, 휴지…" /></label>
          <label>위치<select name="location">${LOCATIONS.map((l) => `<option value="${l.id}">${l.label}</option>`).join('')}</select></label>
          <label>상태<select name="status">${STATUSES.map((s) => `<option value="${s.id}">${s.label}</option>`).join('')}</select></label>
          <label>수량(선택)<input name="quantity" type="number" min="0" step="any" /></label>
          <label>단위<input name="unit" maxlength="12" placeholder="개" /></label>
        </div>
        <button type="submit" class="primary block">재고 등록</button>
      </form>
      ${byLoc
        .map(
          (loc) => `<section class="panel"><h2>${loc.label}</h2>${
            loc.items.length
              ? `<ul class="inv-list">${loc.items.map((item) => inventoryRow(item)).join('')}</ul>`
              : '<p class="empty">비어 있어요.</p>'
          }</section>`,
        )
        .join('')}`;
  }

  function inventoryRow(item) {
    if (editingInventoryId === item.id) {
      return `<li class="inv-row edit">
        <form data-form="edit-inventory" data-id="${item.id}">
          <input name="name" value="${esc(item.name)}" required maxlength="80" aria-label="이름" />
          <div class="form-grid compact">
            <select name="location" aria-label="위치">${LOCATIONS.map((l) => `<option value="${l.id}" ${item.location === l.id ? 'selected' : ''}>${l.label}</option>`).join('')}</select>
            <select name="status" aria-label="상태">${STATUSES.map((s) => `<option value="${s.id}" ${item.status === s.id ? 'selected' : ''}>${s.label}</option>`).join('')}</select>
            <select name="category" aria-label="분류">${categoryOptionsHtml(item.category)}</select>
            <input name="quantity" type="number" min="0" step="any" value="${item.quantity ?? ''}" placeholder="비우면 수량 미확인" aria-label="수량" title="비우면 수량 미확인" />
            <input name="unit" maxlength="12" value="${esc(item.unit || '')}" placeholder="단위" aria-label="단위" />
          </div>
          <div class="row-actions">
            <button type="submit" class="primary">저장</button>
            <button type="button" class="ghost" data-act="cancel-inv-edit">취소</button>
          </div>
        </form>
      </li>`;
    }
    return `<li>
      <div><strong>${esc(item.name)}</strong><small>${
        item.quantity != null
          ? `${item.quantity}${esc(item.unit || '')} · `
          : '수량 미확인 · '
      }${catLabel(item.category)}</small></div>
      <div class="status-chips">${STATUSES.map(
        (s) =>
          `<button type="button" class="${item.status === s.id ? 'on' : ''}" data-act="inv-status" data-id="${item.id}" data-status="${s.id}">${s.label}</button>`,
      ).join('')}</div>
      <div class="row-actions">
        <button type="button" class="icon" data-act="inv-edit" data-id="${item.id}" aria-label="수정">✎</button>
        <button type="button" class="icon danger" data-act="inv-delete" data-id="${item.id}" aria-label="삭제">✕</button>
      </div>
    </li>`;
  }

  function mealsView() {
    const today = suggestToday(state, state.settings.todayFlags || {});
    const plan = state.mealPlan;
    const dinner = state.todayDinner;
    return `
      <p class="lede">지금은 <strong>저녁</strong>만 다뤄요. 야채찜·구이 + 소스 변형. 아침·점심 추천은 나중에.</p>
      ${
        dinner
          ? `<section class="panel dinner-confirmed"><h2>홈에서 확정한 오늘 저녁</h2><p><strong>${esc(dinner.title)}</strong></p><small>${dinner.protein ? esc(dinner.protein) : ''}${dinner.sauceName ? ' · ' + esc(dinner.sauceName) : ''}</small></section>`
          : ''
      }
      <section class="panel">
        <h2>오늘</h2>
        <div class="meal-cards">${today.slots
          .map(
            (s) => `<article class="meal-card">
            <p class="label">${mealLabel(s.mealType)}</p>
            <h3>${esc(s.title)}</h3>
            <p>${s.protein ? `${esc(s.protein)} · ` : ''}${s.sauce ? esc(s.sauce.name) : '소스 선택 자유'}</p>
            <small>${esc(s.note || '')}</small>
          </article>`,
          )
          .join('')}</div>
        <div class="row-actions wrap">
          <button type="button" class="ghost" data-act="today-lazy">요리 귀찮음</button>
          <button type="button" class="ghost" data-act="today-noshop">장보기 없이</button>
          <button type="button" class="ghost" data-act="today-refresh">다른 조합</button>
        </div>
      </section>
      <section class="panel">
        <h2>나의 소스 · 방식</h2>
        <ul class="sauce-list">${state.sauces
          .map(
            (s) =>
              `<li><strong>${esc(s.name)}</strong><small>${s.components.map((c) => c.name + (c.prep ? `(${c.prep})` : '')).join(' · ')}${s.exactAmounts === false ? ' · 비율은 나중에' : ''}</small></li>`,
          )
          .join('')}</ul>
      </section>
      <section class="panel">
        <h2>이번 주 초안</h2>
        ${
          plan
            ? `<p class="hint">${esc(plan.weekStart)} 주 · ${plan.status === 'confirmed' ? '확정' : '초안'} · 장보기 자동 연결은 다음 단계</p>
            <ul class="week-list">${plan.days
              .map((d) => {
                const dinner = d.slots.find((x) => x.mealType === 'dinner');
                return `<li><strong>${esc(d.date.slice(5))}</strong> ${esc(dinner?.title || '—')}</li>`;
              })
              .join('')}</ul>
            <div class="row-actions wrap">
              <button type="button" class="secondary" data-act="confirm-week" ${plan.status === 'confirmed' ? 'disabled' : ''}>주간 식단 확정</button>
              <button type="button" class="ghost" data-act="draft-week">초안 다시</button>
            </div>`
            : `<button type="button" class="primary" data-act="draft-week">7일 초안 만들기</button>`
        }
      </section>`;
  }

  function moreView() {
    const model = state.settings.ai?.model || DEFAULT_MODEL;
    const statusLabel = {
      idle: '미확인',
      checking: '확인 중…',
      ready: '연결됨',
      offline: '오프라인',
      missing_model: '모델 없음',
      error: '오류',
    }[aiUi.status] || aiUi.status;

    return `
      <section class="panel muted">
        <p class="hint">동기화·AI 상태는 홈에 안 붙이고, 필요할 때만 여기서 확인해요.</p>
      </section>
      <section class="panel">
        <h2>우리 집</h2>
        <p class="hint">가족 이름표는 <strong>가족</strong> 탭에 두었어요. 여기는 집 설정·클라우드·AI만.</p>
        <form data-form="household">
          <label>기본 장보기 예산<input name="budgetWon" type="number" min="0" step="1000" value="${state.household.budgetWon}" /></label>
          <p class="hint">집 이름은 기본값(우리 집)으로 두어요. 여러 집을 쓸 때만 아래에서 구분용으로 바꿉니다.</p>
          <details class="hh-name-details">
            <summary>집 이름 (선택)</summary>
            <label class="hh-name-label">표시 이름<input name="name" value="${esc(state.household.name)}" maxlength="40" placeholder="우리 집" /></label>
          </details>
          <button type="submit" class="primary">저장</button>
        </form>
      </section>
      ${cloudPanel()}
      <section class="panel ai-panel" data-ai-panel>
        <h2>AI 자동 전환</h2>
        <p class="hint">우선순위: <strong>Ollama(로컬)</strong> → <strong>Groq 무료</strong>(Edge Function) → <strong>규칙</strong>. 유료 자동 전환 없음. Ollama는 <code>${esc(OLLAMA_PROXY_PREFIX)}</code> → loopback만. :11434 공인 개방 금지. Groq 키는 서버 Secrets만.</p>
        <p class="hint">현재 경로: <strong>${esc(formatRouteBadge({ provider: aiUi.routeProvider, model: aiUi.routeModel }))}</strong> · Groq 모델 <code>${esc(GROQ_DEFAULT_MODEL)}</code></p>
        <form data-form="ai-settings" class="ai-settings">
          <label>Ollama 기본 모델<input name="model" value="${esc(model)}" maxlength="64" placeholder="${esc(DEFAULT_MODEL)}" /></label>
          <button type="submit" class="ghost" ${aiUi.busy ? 'disabled' : ''}>모델 이름 저장</button>
        </form>
        <p class="ai-status"><strong>상태:</strong> ${esc(statusLabel)} — ${esc(aiUi.message)}</p>
        ${
          aiUi.models.length
            ? `<p class="hint">설치됨: ${aiUi.models.map((m) => esc(m)).join(', ')}</p>`
            : ''
        }
        ${aiUi.installHint ? `<pre class="ai-hint">${esc(aiUi.installHint)}</pre>` : ''}
        ${aiUi.reply ? `<div class="preview-card" role="status"><strong>테스트 응답</strong><p>${esc(aiUi.reply)}</p></div>` : ''}
        <div class="row-actions wrap">
          <button type="button" class="secondary" data-act="ai-probe" ${aiUi.busy ? 'disabled' : ''}>연결 확인</button>
          <button type="button" class="primary" data-act="ai-smoke" ${aiUi.busy ? 'disabled' : ''}>응답 테스트</button>
        </div>
      </section>
      <section class="panel">
        <h2>데이터</h2>
        <p class="hint">기본은 이 기기 브라우저 저장입니다. 클라우드 복사는 로컬을 지우지 않아요. Haze Flow는 수정하지 않습니다.</p>
        ${
          sandboxScope.enabled
            ? `<p class="hint"><strong>sandbox</strong> · device <code>${esc(
                sandboxScope.device,
              )}</code> — 상태·인증·캐시 키가 기본 버킷과 분리돼요. URL: <code>?sandbox&amp;device=${esc(
                sandboxScope.device,
              )}</code></p>`
            : `<p class="hint">파괴적 점검은 <code>?sandbox&amp;device=작업이름</code>으로 저장을 격리한 뒤 하세요.</p>`
        }
        <div class="row-actions wrap">
          <button type="button" class="ghost" data-act="export-json">JSON 내보내기</button>
          <button type="button" class="ghost" data-act="new-list">새 장보기 목록</button>
        </div>
      </section>
      <section class="panel muted">
        <h2>다음 영역 (잠금)</h2>
        <ul class="locked"><li>가족 건강</li><li>가족 일정</li><li>가정 재정 · Haze 연동</li><li>가사 분담</li></ul>
      </section>`;
  }

  function cloudPanel() {
    const syncUi = syncRuntime.getUi();
    if (!cloudCfg.configured) {
      return `<section class="panel cloud-panel">
        <h2>우리 집 클라우드 (S5-B)</h2>
        <p class="hint">아직 Supabase가 연결되지 않았어요. Ollama·규칙·장보기는 로컬만으로 계속 쓸 수 있어요.</p>
        <pre class="ai-hint">${esc(cloudSetupSteps())}</pre>
        <p class="hint">상세: docs/SUPABASE_SETUP.md</p>
      </section>`;
    }

    const activeHid = state.cloud?.householdId;
    const modeLabel =
      state.cloud?.mode === 'cloud-primary'
        ? '클라우드가 기본 저장소'
        : '클라우드 연결 대기 (로그인·집 선택 후 자동 연결)';

    if (!cloudUi.user) {
      return `<section class="panel cloud-panel">
        <h2>우리 집 클라우드</h2>
        <p class="hint">엄마·아빠가 각각 가입할 필요 없어요. <strong>관리자 공용 계정 하나</strong>만 만들면 Mac·iPhone·iPad에서 같은 데이터를 씁니다.</p>
        <p class="hint">${esc(cloudUi.message)}</p>
        <form data-form="cloud-auth" class="cloud-auth">
          <label>공용 이메일<input name="email" type="email" required autocomplete="username" /></label>
          <label>비밀번호<input name="password" type="password" required minlength="6" autocomplete="current-password" /></label>
          <p class="hint">「공용 계정 만들기」를 누르면 기본 집 이름(우리 집)으로 가구가 바로 생깁니다. 이름은 나중에 바꿔도 됩니다.</p>
          <div class="row-actions wrap">
            <button type="submit" class="primary" data-auth="signin" ${cloudUi.busy ? 'disabled' : ''}>로그인</button>
            <button type="submit" class="secondary" data-auth="signup" ${cloudUi.busy ? 'disabled' : ''}>공용 계정 만들기</button>
          </div>
        </form>
      </section>`;
    }

    return `<section class="panel cloud-panel">
      <h2>우리 집 클라우드</h2>
      <p class="hint">계정: ${esc(cloudUi.user.email || cloudUi.user.id)}</p>
      <p class="hint">상태: <strong>${esc(syncBadgeLabel(syncUi))}</strong> — ${esc(syncUi.message)} · ${esc(modeLabel)}</p>
      ${syncUi.lastSyncedAt ? `<p class="hint">마지막 동기화: ${esc(new Date(syncUi.lastSyncedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }))} (Asia/Seoul)</p>` : ''}
      <p class="hint">${esc(cloudUi.message)}</p>
      <div class="row-actions wrap">
        <button type="button" class="ghost" data-act="cloud-refresh" ${cloudUi.busy ? 'disabled' : ''}>상태 새로고침</button>
        <button type="button" class="ghost" data-act="cloud-pull-now" ${cloudUi.busy || !activeHid ? 'disabled' : ''}>지금 불러오기</button>
        <button type="button" class="ghost" data-act="cloud-signout" ${cloudUi.busy ? 'disabled' : ''}>로그아웃</button>
      </div>
      ${
        cloudUi.households.length
          ? `<ul class="chip-list">${cloudUi.households
              .map(
                (h) =>
                  `<li><button type="button" data-act="cloud-select-hh" data-id="${esc(h.householdId)}" class="${h.householdId === activeHid ? 'primary' : 'secondary'}">${esc(h.name)}</button></li>`,
              )
              .join('')}</ul>`
          : `<form data-form="cloud-create-hh" class="cloud-auth">
        <p class="hint">아직 집이 없어요. 만들면 기본 이름(우리 집)으로 연결됩니다.</p>
        <label>장보기 예산 (선택)<input name="budgetWon" type="number" min="0" step="1000" value="${state.household.budgetWon ?? ''}" /></label>
        <input type="hidden" name="name" value="우리 집" />
        <button type="submit" class="primary" ${cloudUi.busy ? 'disabled' : ''}>우리 집 만들기</button>
      </form>`
      }
      ${
        activeHid && state.cloud?.mode !== 'cloud-primary'
          ? `<div class="preview-card migration-card">
              <strong>클라우드 연결이 필요해요</strong>
              <p class="hint">보통은 로그인·집 선택 시 자동으로 연결됩니다. 이 기기와 클라우드에 기록이 겹치면 아래 미리보기로 확인하세요.</p>
              <div class="row-actions wrap">
                <button type="button" class="primary" data-act="cloud-activate-now" ${cloudUi.busy ? 'disabled' : ''}>지금 클라우드 연결</button>
                <button type="button" class="secondary" data-act="cloud-migrate-preview" ${cloudUi.busy ? 'disabled' : ''}>충돌 미리보기</button>
              </div>
              ${
                cloudUi.migrationPlan
                  ? `<pre class="ai-hint">${esc(cloudUi.migrationText)}</pre>
                     <button type="button" class="primary" data-act="cloud-migrate-approve" ${cloudUi.busy ? 'disabled' : ''}>확인했고 클라우드를 기본 저장소로 쓸게요</button>`
                  : ''
              }
            </div>`
          : ''
      }
      ${
        activeHid && state.cloud?.mode === 'cloud-primary'
          ? `<p class="hint">이제 장보기·재고·식단 변경은 승인된 제안/편집 후 클라우드에 동기화됩니다. 오프라인이면 조회만 가능합니다.</p>
            <div class="row-actions wrap">
              <button type="button" class="secondary" data-act="cloud-push" ${cloudUi.busy ? 'disabled' : ''}>지금 전체 다시 올리기</button>
            </div>`
          : ''
      }
      ${
        activeHid
          ? `<details class="cloud-advanced">
              <summary>고급 · 다른 로그인 계정 초대 (보통 안 씀)</summary>
              <p class="hint">공용 계정 하나면 초대할 필요 없어요. 나중에 개별 계정이 필요할 때만 씁니다.</p>
              <div class="row-actions wrap">
                <button type="button" class="secondary" data-act="cloud-invite" ${cloudUi.busy ? 'disabled' : ''}>초대 코드 만들기</button>
              </div>
              ${cloudUi.inviteCode ? `<p class="preview-card"><strong>초대 코드</strong> <code>${esc(cloudUi.inviteCode)}</code></p>` : ''}
              <form data-form="cloud-join" class="cloud-auth">
                <label>초대 코드로 참여<input name="code" required maxlength="32" placeholder="ABCD1234" /></label>
                <label>표시 이름<input name="displayName" maxlength="40" placeholder="나" /></label>
                <button type="submit" class="secondary" ${cloudUi.busy ? 'disabled' : ''}>참여하기</button>
              </form>
            </details>`
          : ''
      }
    </section>`;
  }

  function bind() {
    root.querySelectorAll('[data-nav]').forEach((btn) => {
      btn.onclick = () => {
        let view = btn.dataset.nav;
        let segment = btn.dataset.segment || state.settings.foodSegment;
        if (view === 'shopping' || view === 'inventory' || view === 'meals') {
          segment = view;
          view = 'food';
        }
        const nav = normalizeFoodNav(view, segment);
        state.settings.view = nav.view;
        state.settings.foodSegment = nav.foodSegment;
        editingId = null;
        persist(state);
        render();
        // Tab changes should start at the top (iOS often keeps a phantom offset).
        requestAnimationFrame(() => pinWindowTop({ force: true }));
      };
    });

    const chatForm = root.querySelector('[data-form=ai-chat]');
    if (chatForm) {
      chatForm.onsubmit = async (e) => {
        e.preventDefault();
        if (chatBusy) return;
        const fd = new FormData(chatForm);
        const message = String(fd.get('message') || '').trim();
        if (!message) {
          setToast('메시지를 입력해 주세요.');
          return;
        }
        chatDraft = '';
        chatLog = [...chatLog, { role: 'user', text: message }].slice(-20);
        chatBusy = true;
        render();
        try {
          const turn = await runConversationTurn(state, message, aiProvider());
          if (turn.route) {
            aiUi.routeProvider = turn.route.provider || aiUi.routeProvider;
            aiUi.routeModel = turn.route.model || aiUi.routeModel;
            if (turn.route.message) aiUi.message = turn.route.message;
          }
          chatLog = [
            ...chatLog,
            {
              role: 'assistant',
              text: turn.message,
              kind: turn.kind,
              engine: turn.engine,
            },
          ].slice(-20);
          if (turn.kind === 'proposal' && turn.proposal && turn.preview) {
            pendingApproval = { proposal: turn.proposal, preview: turn.preview };
          }
        } catch (err) {
          chatLog = [
            ...chatLog,
            {
              role: 'assistant',
              text: err.message || '대화 처리에 실패했어요. 규칙 기능은 그대로 쓸 수 있어요.',
              kind: 'clarify',
              engine: 'error',
            },
          ].slice(-20);
        } finally {
          chatBusy = false;
          render();
          const logEl = root.querySelector('.chat-log');
          if (logEl) logEl.scrollTop = logEl.scrollHeight;
        }
      };
    }

    root.querySelectorAll('[data-act=dinner-accept]').forEach((btn) => {
      btn.onclick = () => {
        const dinnerHome = buildDinnerHomeOffer(state, { altIndex: dinnerAltIndex });
        const proposal = dinnerHome.offer?.proposal;
        if (!proposal) {
          setToast('지금은 확정할 저녁 제안이 없어요.');
          return;
        }
        try {
          const preview = previewProposal(state, proposal);
          pendingApproval = { proposal, preview };
          render();
          if (!preview.ok) setToast(preview.errors[0]?.message || '이 제안은 적용할 수 없어요.');
        } catch (err) {
          pendingApproval = null;
          setToast(err.message || '미리보기에 실패했어요.');
        }
      };
    });

    root.querySelectorAll('[data-act=dinner-register-stock]').forEach((btn) => {
      btn.onclick = () => {
        const dinnerHome = buildDinnerHomeOffer(state, { altIndex: dinnerAltIndex });
        const protein = dinnerHome.offer?.protein;
        if (!dinnerHome.offer?.canRegisterStock || !protein) {
          setToast('지금은 등록할 가정 재료가 없어요.');
          return;
        }
        stockRegisterDraft = { protein };
        pendingApproval = null;
        render();
      };
    });

    root.querySelectorAll('[data-act=dinner-stock-cancel]').forEach((btn) => {
      btn.onclick = () => {
        stockRegisterDraft = null;
        pendingApproval = null;
        setToast('재고 등록을 취소했어요. 목록은 그대로예요.');
      };
    });

    const stockForm = root.querySelector('[data-form=dinner-stock-register]');
    if (stockForm) {
      stockForm.onsubmit = (e) => {
        e.preventDefault();
        const fd = Object.fromEntries(new FormData(stockForm));
        const built = createStockRegisterProposalFromUserInput({
          name: fd.name,
          status: fd.status,
          location: fd.location,
          quantity: fd.quantity,
          unit: fd.unit,
        });
        if (!built.ok) {
          setToast(built.error || '입력값을 확인해 주세요.');
          return;
        }
        try {
          const preview = previewProposal(state, built.proposal);
          pendingApproval = { proposal: built.proposal, preview };
          stockRegisterDraft = null;
          render();
          if (!preview.ok) setToast(preview.errors[0]?.message || '이 제안은 적용할 수 없어요.');
        } catch (err) {
          pendingApproval = null;
          setToast(err.message || '미리보기에 실패했어요.');
        }
      };
    }

    root.querySelectorAll('[data-act=dinner-swap]').forEach((btn) => {
      btn.onclick = () => {
        const dinnerHome = buildDinnerHomeOffer(state, { altIndex: dinnerAltIndex });
        if (!dinnerHome.offer?.hasAlt) {
          setToast('다른 후보가 더 없어요. 재고를 추가해 주세요.');
          return;
        }
        dinnerAltIndex = dinnerHome.offer.nextAltIndex;
        pendingApproval = null;
        render();
        setToast('다른 저녁 후보로 바꿨어요. 이대로로 미리보세요.');
      };
    });

    root.querySelectorAll('[data-act=preview-suggestion]').forEach((btn) => {
      btn.onclick = () => {
        const pack = generateSuggestions(state);
        const suggestion = (pack.suggestions || []).find((s) => suggestionFingerprint(s) === btn.dataset.fp);
        if (!suggestion) {
          setToast('이미 처리됐거나 조건이 바뀌었어요.');
          return;
        }
        try {
          const preview = previewProposal(state, suggestion);
          pendingApproval = { proposal: suggestion, preview };
          // Preview must not persist domain changes — only re-render.
          render();
          if (!preview.ok) setToast(preview.errors[0]?.message || '이 제안은 적용할 수 없어요.');
        } catch (err) {
          pendingApproval = null;
          setToast(err.message || '미리보기에 실패했어요.');
        }
      };
    });

    root.querySelectorAll('[data-act=confirm-proposal]').forEach((btn) => {
      btn.onclick = () => {
        if (!pendingApproval?.proposal) return;
        const proposal = pendingApproval.proposal;
        try {
          let msg = '반영했어요.';
          let navigate = null;
          commit((s) => {
            const result = applyProposal(s, proposal);
            msg = result.message || msg;
            navigate = result.navigate;
            if (navigate) s.settings.view = navigate === 'home' ? 'home' : navigate;
          });
          pendingApproval = null;
          if (proposal?.ops?.some((op) => op.op === 'meals.confirm_dinner')) {
            dinnerAltIndex = 0;
          }
          setToast(msg);
        } catch (err) {
          const message = err instanceof ProposalError || err?.message ? err.message : '저장에 실패했어요.';
          setToast(message);
          // Keep preview open; state unchanged on failure.
          try {
            pendingApproval = {
              proposal,
              preview: previewProposal(state, proposal),
            };
          } catch {
            pendingApproval = null;
          }
          render();
        }
      };
    });

    root.querySelectorAll('[data-act=cancel-proposal]').forEach((btn) => {
      btn.onclick = () => {
        pendingApproval = null;
        render();
      };
    });

    const approvalLayer = root.querySelector('.approval-layer');
    if (approvalLayer) {
      approvalLayer.onclick = (e) => {
        if (e.target === approvalLayer) {
          pendingApproval = null;
          render();
        }
      };
      const sheet = approvalLayer.querySelector('.approval-sheet');
      if (sheet) sheet.onclick = (e) => e.stopPropagation();
    }

    root.querySelectorAll('[data-act=dismiss-suggestion]').forEach((btn) => {
      btn.onclick = () => {
        const pack = generateSuggestions(state);
        const suggestion = (pack.suggestions || []).find((s) => suggestionFingerprint(s) === btn.dataset.fp);
        if (!suggestion) {
          render();
          return;
        }
        pendingApproval = null;
        commit((s) => {
          dismissSuggestion(s, suggestion);
        }, '이 제안은 잠시 숨길게요.');
      };
    });

    const quick = root.querySelector('[data-form=quick-add]');
    if (quick) {
      quick.onsubmit = (e) => {
        e.preventDefault();
        try {
          commit((s) => addFromQuickText(ensureActiveList(s), new FormData(quick).get('text')), '장보기 목록에 넣었어요.');
          quickDraft = null;
        } catch (err) {
          setToast(err.message);
        }
      };
    }

    const previewBtn = root.querySelector('[data-act=preview-quick]');
    if (previewBtn) {
      previewBtn.onclick = () => {
        const text = root.querySelector('#quick-text')?.value || '';
        quickDraft = parseQuickAdd(text);
        if (!quickDraft) setToast('이름이나 ‘휴지 30롤’처럼 적어주세요.');
        else render();
      };
    }

    const manual = root.querySelector('[data-form=manual-add]');
    if (manual) {
      manual.onsubmit = (e) => {
        e.preventDefault();
        try {
          const fd = Object.fromEntries(new FormData(manual));
          delete fd.category; // inferred from name
          commit((s) => addShoppingItem(ensureActiveList(s), fd), '추가했어요.');
        } catch (err) {
          setToast(err.message);
        }
      };
    }

    const budget = root.querySelector('[data-form=budget]');
    if (budget) {
      budget.onsubmit = (e) => {
        e.preventDefault();
        const v = Number(new FormData(budget).get('budgetWon'));
        commit((s) => {
          const list = ensureActiveList(s);
          list.budgetWon = Number.isFinite(v) ? v : null;
          s.household.budgetWon = list.budgetWon;
        }, '예산을 저장했어요.');
      };
    }

    root.querySelectorAll('[data-act=toggle]').forEach((el) => {
      el.onchange = () => commit((s) => toggleShoppingItem(ensureActiveList(s), el.dataset.id, el.checked));
    });
    root.querySelectorAll('[data-act=edit]').forEach((el) => {
      el.onclick = () => {
        editingId = el.dataset.id;
        editingInventoryId = null;
        render();
      };
    });
    root.querySelectorAll('[data-act=cancel-edit]').forEach((el) => {
      el.onclick = () => {
        editingId = null;
        render();
      };
    });
    root.querySelectorAll('[data-form=edit-item]').forEach((form) => {
      form.onsubmit = (e) => {
        e.preventDefault();
        try {
          commit(
            (s) => updateShoppingItem(ensureActiveList(s), form.dataset.id, Object.fromEntries(new FormData(form))),
            '수정했어요.',
          );
          editingId = null;
        } catch (err) {
          setToast(err.message);
        }
      };
    });
    root.querySelectorAll('[data-act=delete]').forEach((el) => {
      el.onclick = () => {
        if (!confirm('이 품목을 삭제할까요?')) return;
        commit((s) => removeShoppingItem(ensureActiveList(s), el.dataset.id), '삭제했어요.');
      };
    });
    root.querySelectorAll('[data-act=preview-inv-suggestion]').forEach((el) => {
      el.onclick = () => {
        try {
          const proposal = proposalFromInventoryChip({
            name: el.dataset.name,
            quantity: Number(el.dataset.qty),
            unit: el.dataset.unit,
            priority: el.dataset.priority,
            category: el.dataset.category,
            inventoryId: el.dataset.inventory || null,
          });
          const preview = previewProposal(state, proposal);
          pendingApproval = { proposal, preview };
          render();
          if (!preview.ok) setToast(preview.errors[0]?.message || '이 제안은 적용할 수 없어요.');
        } catch (err) {
          pendingApproval = null;
          setToast(err.message || '미리보기에 실패했어요.');
        }
      };
    });

    const aiSettings = root.querySelector('[data-form=ai-settings]');
    if (aiSettings) {
      aiSettings.onsubmit = (e) => {
        e.preventDefault();
        const fd = Object.fromEntries(new FormData(aiSettings));
        commit((s) => {
          if (!s.settings.ai) s.settings.ai = { provider: 'ollama', model: DEFAULT_MODEL };
          s.settings.ai.model = String(fd.model || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
          s.settings.ai.provider = 'ollama';
        }, 'AI 모델 이름을 저장했어요.');
      };
    }
    const aiProbe = root.querySelector('[data-act=ai-probe]');
    if (aiProbe) {
      aiProbe.onclick = async () => {
        aiUi = { ...aiUi, busy: true, status: 'checking', message: 'Ollama 상태를 확인하는 중…', reply: '' };
        render();
        try {
          const probe = await aiProvider().probe();
          aiUi = {
            ...aiUi,
            busy: false,
            status: probe.status,
            message: probe.message,
            models: probe.models || [],
            installHint: probe.detail?.installHint || (probe.status === 'offline' ? installHint(state.settings.ai?.model || DEFAULT_MODEL) : ''),
            reply: '',
          };
        } catch (err) {
          aiUi = {
            ...aiUi,
            busy: false,
            status: 'error',
            message: err.message || '확인에 실패했어요.',
            installHint: installHint(state.settings.ai?.model || DEFAULT_MODEL),
          };
        }
        render();
      };
    }
    const aiSmoke = root.querySelector('[data-act=ai-smoke]');
    if (aiSmoke) {
      aiSmoke.onclick = async () => {
        aiUi = { ...aiUi, busy: true, status: 'checking', message: '모델 응답을 요청하는 중…', reply: '' };
        render();
        try {
          const result = await smokeTest(aiProvider(), { model: state.settings.ai?.model || DEFAULT_MODEL });
          if (!result.ok) {
            aiUi = {
              ...aiUi,
              busy: false,
              status: result.probe.status,
              message: result.probe.message,
              models: result.probe.models || [],
              installHint: result.probe.detail?.installHint || installHint(state.settings.ai?.model || DEFAULT_MODEL),
              reply: '',
            };
          } else {
            aiUi = {
              ...aiUi,
              busy: false,
              status: 'ready',
              message: result.probe.message,
              models: result.probe.models || [],
              installHint: '',
              reply: result.reply?.text || '(빈 응답)',
            };
          }
        } catch (err) {
          aiUi = {
            ...aiUi,
            busy: false,
            status: 'error',
            message: err.message || '응답 테스트에 실패했어요. 규칙 엔진은 계속 쓸 수 있어요.',
            installHint: installHint(state.settings.ai?.model || DEFAULT_MODEL),
            reply: '',
          };
        }
        render();
      };
    }

    const propose = root.querySelector('[data-act=propose-inventory]');
    if (propose) {
      propose.onclick = () => {
        pendingProposals = inventoryProposalsFromChecked(ensureActiveList(state), state.inventory);
        setToast(pendingProposals.length ? '아래에서 재고 반영을 확인하세요.' : '완료 항목이 없어요.');
      };
    }
    const applyProp = root.querySelector('[data-act=apply-proposals]');
    if (applyProp) {
      applyProp.onclick = () => {
        const checked = [...root.querySelectorAll('[name=prop]:checked')].map((x) => Number(x.value));
        commit((s) => {
          checked.forEach((idx) => applyPurchaseToInventory(s, pendingProposals[idx], { accept: true }));
        }, '재고에 반영했어요.');
        pendingProposals = [];
      };
    }

    const orderPasteForm = root.querySelector('[data-form=order-paste]');
    if (orderPasteForm) {
      orderPasteForm.onsubmit = (e) => {
        e.preventDefault();
        const text = String(new FormData(orderPasteForm).get('paste') || '');
        const parsed = parseOrderPaste(text);
        orderPasteDraft = parsed;
        if (!parsed.ready.length && !parsed.needsClarify.length) {
          setToast('주문 상품을 찾지 못했어요. 상품명이 보이게 복사해 주세요.');
        } else {
          const n = parsed.ready.length + parsed.needsClarify.length;
          setToast(`${n}개 항목을 정리했어요. 아래에서 확인하세요.`);
        }
        render();
      };
    }
    root.querySelectorAll('[data-act=clarify-order]').forEach((el) => {
      el.onclick = () => {
        if (!orderPasteDraft) return;
        const idx = Number(el.dataset.idx);
        const input = root.querySelector(`[name=clarify-${idx}]`);
        const answer = input?.value || '';
        const item = orderPasteDraft.needsClarify[idx];
        if (!item) return;
        const resolved = applyClarifyAnswer(item, answer);
        if (resolved.needsClarify) {
          setToast(resolved.clarifyReason || '용량을 예: 1kg 처럼 적어 주세요.');
          return;
        }
        orderPasteDraft.needsClarify.splice(idx, 1);
        orderPasteDraft.ready.push(resolved);
        setToast(`${resolved.name}을(를) 목록에 넣었어요.`);
        render();
      };
    });
    const applyOrderPaste = root.querySelector('[data-act=apply-order-paste]');
    if (applyOrderPaste) {
      applyOrderPaste.onclick = () => {
        if (!orderPasteDraft?.ready?.length) return;
        const checked = [...root.querySelectorAll('input[name=order-ready]:checked')].map((el) => Number(el.value));
        if (!checked.length) {
          setToast('등록할 항목을 선택해 주세요.');
          return;
        }
        commit((s) => {
          checked.forEach((idx) => {
            const p = orderPasteDraft.ready[idx];
            if (!p) return;
            applyPurchaseToInventory(
              s,
              {
                name: p.name,
                quantity: p.quantity,
                unit: p.unit,
                category: p.category,
                location: p.location,
                suggestedStatus: p.status || 'enough',
              },
              { accept: true },
            );
          });
        }, `${checked.length}개 재고를 등록했어요.`);
        orderPasteDraft = {
          ...orderPasteDraft,
          ready: orderPasteDraft.ready.filter((_, i) => !checked.includes(i)),
        };
        if (!orderPasteDraft.ready.length && !orderPasteDraft.needsClarify.length) {
          orderPasteDraft = null;
        }
        render();
      };
    }
    const clearOrderPaste = root.querySelector('[data-act=clear-order-paste]');
    if (clearOrderPaste) {
      clearOrderPaste.onclick = () => {
        orderPasteDraft = null;
        render();
      };
    }

    const addInv = root.querySelector('[data-form=add-inventory]');
    if (addInv) {
      addInv.onsubmit = (e) => {
        e.preventDefault();
        try {
          const fd = Object.fromEntries(new FormData(addInv));
          delete fd.category; // inferred from name
          commit((s) => {
            s.inventory.push(createInventoryItem(fd));
          }, '재고를 등록했어요.');
        } catch (err) {
          setToast(err.message);
        }
      };
    }
    root.querySelectorAll('[data-act=inv-edit]').forEach((el) => {
      el.onclick = () => {
        editingInventoryId = el.dataset.id;
        editingId = null;
        render();
      };
    });
    root.querySelectorAll('[data-act=cancel-inv-edit]').forEach((el) => {
      el.onclick = () => {
        editingInventoryId = null;
        render();
      };
    });
    root.querySelectorAll('[data-form=edit-inventory]').forEach((form) => {
      form.onsubmit = (e) => {
        e.preventDefault();
        try {
          commit(
            (s) => updateInventoryItem(s, form.dataset.id, Object.fromEntries(new FormData(form))),
            '재고를 수정했어요.',
          );
          editingInventoryId = null;
        } catch (err) {
          setToast(err.message);
        }
      };
    });
    root.querySelectorAll('[data-act=inv-status]').forEach((el) => {
      el.onclick = () => commit((s) => setInventoryStatus(s, el.dataset.id, el.dataset.status));
    });
    root.querySelectorAll('[data-act=inv-delete]').forEach((el) => {
      el.onclick = () => {
        if (!confirm('재고에서 삭제할까요?')) return;
        if (editingInventoryId === el.dataset.id) editingInventoryId = null;
        commit((s) => removeInventory(s, el.dataset.id), '삭제했어요.');
      };
    });

    root.querySelectorAll('[data-act=draft-week]').forEach((el) => {
      el.onclick = () => commit((s) => {
        s.mealPlan = draftWeek(s);
      }, '주간 초안을 만들었어요.');
    });
    const confirmWeek = root.querySelector('[data-act=confirm-week]');
    if (confirmWeek) {
      confirmWeek.onclick = () =>
        commit((s) => {
          if (s.mealPlan) s.mealPlan.status = 'confirmed';
        }, '주간 식단을 확정했어요.');
    }
    root.querySelectorAll('[data-act=today-lazy]').forEach((el) => {
      el.onclick = () => {
        state.settings.todayFlags = { lazy: true };
        persist(state);
        setToast('저노력 조합으로 바꿨어요.');
      };
    });
    root.querySelectorAll('[data-act=today-noshop]').forEach((el) => {
      el.onclick = () => {
        state.settings.todayFlags = { ...(state.settings.todayFlags || {}), noShop: true };
        persist(state);
        setToast('재고 위주 메모를 붙였어요.');
      };
    });
    root.querySelectorAll('[data-act=today-refresh]').forEach((el) => {
      el.onclick = () => {
        state.settings.todayFlags = { ...(state.settings.todayFlags || {}) };
        persist(state);
        setToast('조합을 새로 뽑았어요.');
      };
    });

    root.querySelectorAll('[data-act=defer-cloud-auth]').forEach((el) => {
      el.onclick = () => {
        cloudUi.deferAuth = true;
        writeDeferAuth(true);
        cloudUi.message =
          '이 기기 임시 모드예요. 재고·장보기는 브라우저에만 남고 Supabase에는 안 올라가요. 로그인하면 클라우드가 기본 저장소가 됩니다.';
        render();
      };
    });

    const cloudAuth = root.querySelector('[data-form=cloud-auth]');
    if (cloudAuth) {
      cloudAuth.onsubmit = async (e) => {
        e.preventDefault();
        if (cloudUi.busy) return;
        const mode = e.submitter?.dataset?.auth || 'signin';
        const fd = Object.fromEntries(new FormData(cloudAuth));
        cloudUi.busy = true;
        render();
        try {
          if (mode === 'signup') {
            const parsed = parseSignupHouseholdName(fd.householdName);
            if (!parsed.ok) throw new Error(parsed.error);
            await signUpWithEmail(fd.email, fd.password, {
              displayName: parsed.profileDisplayName,
            });
            await refreshCloudSession();
            if (!cloudUi.user) {
              cloudUi.message =
                '계정을 만들었어요. 이메일 확인이 필요하면 확인 후 로그인해 주세요. 집 이름은 로그인 뒤 한 번만 더 만들면 됩니다.';
            } else if (cloudUi.households.length) {
              cloudUi.deferAuth = false;
              writeDeferAuth(false);
              cloudUi.message = '공용 계정을 만들었어요. 이미 연결된 집이 있어 그 집을 쓸 수 있어요.';
            } else {
              const hid = await createHousehold(parsed.householdName);
              ensureDeviceLocalBackup(state);
              commit((s) => {
                s.cloud.householdId = hid;
                s.cloud.mode = 'local';
                s.cloud.migratedAt = null;
                s.household.name = parsed.householdName;
              });
              cloudUi.deferAuth = false;
              writeDeferAuth(false);
              await refreshCloudSession();
              await activateCloudAsPrimary();
              if (!cloudUi.message) {
                cloudUi.message = `공용 계정과 「${parsed.householdName}」 집을 만들고 클라우드를 기본 저장소로 연결했어요.`;
              }
            }
          } else {
            await signInWithEmail(fd.email, fd.password);
            cloudUi.deferAuth = false;
            writeDeferAuth(false);
            cloudUi.message = '로그인했어요.';
            await refreshCloudSession();
          }
        } catch (err) {
          cloudUi.message = err.message || '인증에 실패했어요.';
        } finally {
          cloudUi.busy = false;
          render();
        }
      };
    }

    const cloudCreate = root.querySelector('[data-form=cloud-create-hh]');
    if (cloudCreate) {
      cloudCreate.onsubmit = async (e) => {
        e.preventDefault();
        if (cloudUi.busy) return;
        const fd = Object.fromEntries(new FormData(cloudCreate));
        cloudUi.busy = true;
        render();
        try {
          const hid = await createHousehold(fd.name, fd.budgetWon);
          ensureDeviceLocalBackup(state);
          commit((s) => {
            s.cloud.householdId = hid;
            s.cloud.mode = 'local';
            s.cloud.migratedAt = null;
            s.household.name = String(fd.name || s.household.name).trim() || s.household.name;
            const b = Number(fd.budgetWon);
            if (Number.isFinite(b)) s.household.budgetWon = b;
          });
          await refreshCloudSession();
          await activateCloudAsPrimary();
          if (!cloudUi.message) cloudUi.message = '우리 집을 만들고 클라우드를 기본 저장소로 연결했어요.';
        } catch (err) {
          cloudUi.message = err.message || '가구 생성에 실패했어요.';
        } finally {
          cloudUi.busy = false;
          render();
        }
      };
    }

    const cloudJoin = root.querySelector('[data-form=cloud-join]');
    if (cloudJoin) {
      cloudJoin.onsubmit = async (e) => {
        e.preventDefault();
        if (cloudUi.busy) return;
        const fd = Object.fromEntries(new FormData(cloudJoin));
        cloudUi.busy = true;
        render();
        try {
          const hid = await acceptInvite(fd.code, fd.displayName);
          commit((s) => {
            s.cloud.householdId = hid;
          });
          cloudUi.message = '가구에 참여했어요.';
          await refreshCloudSession();
        } catch (err) {
          cloudUi.message = err.message || '초대 참여에 실패했어요.';
        } finally {
          cloudUi.busy = false;
          render();
        }
      };
    }

    root.querySelectorAll('[data-act=cloud-select-hh]').forEach((btn) => {
      btn.onclick = async () => {
        const nextHid = btn.dataset.id;
        if (!nextHid || nextHid === state.cloud?.householdId) return;
        cloudUi.busy = true;
        cloudUi.message = '다른 집으로 전환 중… 이전 집 데이터와 섞지 않아요.';
        render();
        try {
          await switchActiveHousehold(nextHid);
          if (!cloudUi.message) setToast('집을 바꿨어요.');
        } catch (err) {
          cloudUi.message = err.message || '집 전환에 실패했어요.';
        } finally {
          cloudUi.busy = false;
          render();
        }
      };
    });

    const cloudRefresh = root.querySelector('[data-act=cloud-refresh]');
    if (cloudRefresh) {
      cloudRefresh.onclick = async () => {
        cloudUi.busy = true;
        render();
        await refreshCloudSession();
        cloudUi.busy = false;
        cloudUi.message = '동기화 상태를 갱신했어요.';
        render();
      };
    }

    const cloudPullNow = root.querySelector('[data-act=cloud-pull-now]');
    if (cloudPullNow) {
      cloudPullNow.onclick = async () => {
        if (!isCloudPrimary()) {
          setToast('클라우드 기본 저장소로 이전한 뒤에 불러올 수 있어요.');
          return;
        }
        const pulled = await pullCloudQuiet({ reason: 'manual' });
        cloudUi.message = isQuietPullSuccess(pulled)
          ? '클라우드 최신 데이터를 반영했어요.'
          : pulled?.message || '불러오기에 실패했어요. 이 기기 데이터는 그대로 두었어요.';
      };
    }

    const cloudSignout = root.querySelector('[data-act=cloud-signout]');
    if (cloudSignout) {
      cloudSignout.onclick = async () => {
        await syncRuntime.dispose();
        await signOut();
        const restored = isolateOnSignOut();
        if (restored) {
          state = restored;
          ensureActiveList(state);
        } else {
          state.cloud = {
            ...(state.cloud || {}),
            userId: null,
            householdId: null,
            mode: 'local',
          };
          persist(state);
        }
        cloudUi.user = null;
        cloudUi.households = [];
        cloudUi.members = [];
        cloudUi.inviteCode = '';
        cloudUi.migrationPlan = null;
        cloudUi.migrationText = '';
        cloudUi.message = '로그아웃했어요. 계정 데이터를 섞지 않도록 이 기기는 로컬 백업으로 돌아갔어요.';
        syncRuntime.setStatus(SyncStatus.idle, '로컬만 사용 중');
        render();
      };
    }

    const activateNow = root.querySelector('[data-act=cloud-activate-now]');
    if (activateNow) {
      activateNow.onclick = async () => {
        if (!state.cloud?.householdId) return;
        cloudUi.busy = true;
        render();
        try {
          await activateCloudAsPrimary();
        } finally {
          cloudUi.busy = false;
          render();
        }
      };
    }

    const migratePreview = root.querySelector('[data-act=cloud-migrate-preview]');
    if (migratePreview) {
      migratePreview.onclick = async () => {
        if (!state.cloud?.householdId) return;
        cloudUi.busy = true;
        render();
        try {
          await activateCloudAsPrimary({ forcePreview: true });
          if (!cloudUi.migrationPlan) {
            ensureDeviceLocalBackup(state);
            const snap = await fetchCloudSnapshot(state, state.cloud.householdId);
            const plan = buildMigrationPlan(state, snap);
            cloudUi.migrationPlan = plan;
            cloudUi.migrationText = formatMigrationPreview(plan);
            cloudUi.message = '이전 미리보기를 준비했어요. 내용을 확인한 뒤 승인해 주세요.';
          }
        } catch (err) {
          cloudUi.message = err.message || '미리보기 실패';
        } finally {
          cloudUi.busy = false;
          render();
        }
      };
    }

    const migrateApprove = root.querySelector('[data-act=cloud-migrate-approve]');
    if (migrateApprove) {
      migrateApprove.onclick = async () => {
        if (!state.cloud?.householdId || !cloudUi.migrationPlan) return;
        if (
          !confirm(
            '이 기기 장보기·재고·식단·가족 프로필을 클라우드에 올리고, 이후 클라우드를 기본 저장소로 쓸까요?\n로컬 원본은 삭제되지 않습니다. 충돌 항목은 이 기기 값으로 덮어씁니다.',
          )
        ) {
          return;
        }
        cloudUi.busy = true;
        syncRuntime.setStatus(SyncStatus.syncing, '이전 중…');
        render();
        try {
          ensureDeviceLocalBackup(state);
          const result = await pushLocalToCloud(state, state.cloud.householdId);
          const now = new Date().toISOString();
          state.cloud.mode = 'cloud-primary';
          state.cloud.migratedAt = now;
          state.cloud.lastPushedAt = now;
          state.cloud.userId = cloudUi.user?.id || state.cloud.userId;
          persistActive();
          cloudUi.migrationPlan = null;
          cloudUi.migrationText = '';
          cloudUi.message = `이전 완료 (장보기 ${result.counts.shoppingItems}, 재고 ${result.counts.inventory}, 프로필 ${result.counts.familyProfiles}). 이제 이 계정이 기본 저장소예요.`;
          syncRuntime.setStatus(SyncStatus.ok, '이전·동기화 완료', { syncedAt: now, error: null });
          await startCloudListeners();
          const pulled = await pullCloudQuiet({ reason: 'post-migrate' });
          if (!isQuietPullSuccess(pulled)) {
            cloudUi.message =
              (cloudUi.message ? `${cloudUi.message} ` : '') +
              (pulled?.message || '올린 뒤 다시 불러오기는 실패했어요. 로컬·클라우드 원본은 유지됩니다.');
          }
        } catch (err) {
          cloudUi.message = err.message || '이전에 실패했어요.';
          syncRuntime.setStatus(SyncStatus.error, cloudUi.message, { error: cloudUi.message });
        } finally {
          cloudUi.busy = false;
          render();
        }
      };
    }

    const addMember = root.querySelector('[data-form=add-member]');
    if (addMember) {
      addMember.onsubmit = (e) => {
        e.preventDefault();
        const fd = Object.fromEntries(new FormData(addMember));
        commit((s) => {
          s.members = s.members || [];
          s.members.push({
            id: uid(),
            displayName: String(fd.displayName || '').trim(),
            roleLabel: fd.roleLabel || '구성원',
            role: fd.roleLabel === '관리자' ? 'owner' : 'member',
            note: '',
            sortOrder: s.members.length,
          });
        }, '가족 프로필을 추가했어요.');
      };
    }

    root.querySelectorAll('[data-act=remove-member]').forEach((btn) => {
      btn.onclick = () => {
        commit((s) => {
          s.members = (s.members || []).filter((m) => m.id !== btn.dataset.id);
        }, '프로필을 삭제했어요.');
      };
    });

    const cloudInvite = root.querySelector('[data-act=cloud-invite]');
    if (cloudInvite) {
      cloudInvite.onclick = async () => {
        if (!state.cloud?.householdId) return;
        cloudUi.busy = true;
        render();
        try {
          const inv = await createInvite(state.cloud.householdId);
          cloudUi.inviteCode = inv.code || '';
          cloudUi.message = '초대 코드를 만들었어요. 가족에게만 공유하세요.';
        } catch (err) {
          cloudUi.message = err.message || '초대 생성 실패';
        } finally {
          cloudUi.busy = false;
          render();
        }
      };
    }

    const cloudPush = root.querySelector('[data-act=cloud-push]');
    if (cloudPush) {
      cloudPush.onclick = async () => {
        if (!isCloudPrimary()) return;
        cloudUi.busy = true;
        render();
        await pushCloudQuiet();
        cloudUi.message = '전체 다시 올리기를 마쳤어요.';
        cloudUi.busy = false;
        render();
      };
    }

    const hh = root.querySelector('[data-form=household]');
    if (hh) {
      hh.onsubmit = (e) => {
        e.preventDefault();
        const fd = Object.fromEntries(new FormData(hh));
        commit((s) => {
          s.household.name = String(fd.name || s.household.name).trim() || s.household.name;
          const b = Number(fd.budgetWon);
          if (Number.isFinite(b)) s.household.budgetWon = b;
        }, '가정 정보를 저장했어요.');
      };
    }
    const exp = root.querySelector('[data-act=export-json]');
    if (exp) {
      exp.onclick = () => {
        const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `familyflow-backup-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
      };
    }
    const neu = root.querySelector('[data-act=new-list]');
    if (neu) {
      neu.onclick = () =>
        commit((s) => {
          const list = createShoppingList({ budgetWon: s.household.budgetWon });
          s.shoppingLists.unshift(list);
          s.settings.activeListId = list.id;
          s.settings.view = 'food';
          s.settings.foodSegment = 'shopping';
        }, '새 장보기 목록을 만들었어요.');
    }
  }

  render();
  return { getState: () => state };
}

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function won(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return `${Number(n).toLocaleString('ko-KR')}원`;
}
function catLabel(c) {
  return categoryLabel(c);
}
function mealLabel(t) {
  return { breakfast: '아침', lunch: '점심', dinner: '저녁' }[t] || t;
}
