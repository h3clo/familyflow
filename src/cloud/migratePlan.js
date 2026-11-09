/**
 * Build a local → cloud migration preview (pure).
 * Never mutates state or writes to the network.
 */

function normName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

function itemKey(name) {
  return normName(name);
}

/**
 * @param {object} localState
 * @param {object|null} cloudSnapshot — shape from pullCloudToState (shoppingLists/inventory/mealPlan/todayDinner)
 */
export function buildMigrationPlan(localState, cloudSnapshot) {
  const localList = localState?.shoppingLists?.[0] || { items: [] };
  const cloudList = cloudSnapshot?.shoppingLists?.[0] || { items: [] };
  const localItems = localList.items || [];
  const cloudItems = cloudList.items || [];
  const localInv = localState?.inventory || [];
  const cloudInv = cloudSnapshot?.inventory || [];

  const cloudItemById = new Map(cloudItems.map((i) => [i.id, i]));
  const cloudItemByName = new Map();
  for (const i of cloudItems) {
    const k = itemKey(i.name);
    if (!cloudItemByName.has(k)) cloudItemByName.set(k, []);
    cloudItemByName.get(k).push(i);
  }

  const shopping = {
    sameId: [],
    conflicts: [],
    duplicatesByName: [],
    localOnly: [],
    cloudOnly: [],
  };

  const seenCloudIds = new Set();
  for (const local of localItems) {
    const remote = cloudItemById.get(local.id);
    if (remote) {
      seenCloudIds.add(remote.id);
      if (shoppingFieldsDiffer(local, remote)) {
        shopping.conflicts.push({
          kind: 'shopping',
          id: local.id,
          name: local.name,
          local: summarizeShopping(local),
          cloud: summarizeShopping(remote),
          resolution: 'local_wins_on_approve',
        });
      } else {
        shopping.sameId.push({ id: local.id, name: local.name });
      }
      continue;
    }
    const nameHits = cloudItemByName.get(itemKey(local.name)) || [];
    const openHit = nameHits.find((h) => !seenCloudIds.has(h.id));
    if (openHit) {
      seenCloudIds.add(openHit.id);
      shopping.duplicatesByName.push({
        kind: 'shopping',
        localId: local.id,
        cloudId: openHit.id,
        name: local.name,
        local: summarizeShopping(local),
        cloud: summarizeShopping(openHit),
        resolution: 'keep_both_or_merge_local_id',
      });
    } else {
      shopping.localOnly.push({ id: local.id, name: local.name, summary: summarizeShopping(local) });
    }
  }
  for (const remote of cloudItems) {
    if (!seenCloudIds.has(remote.id) && !localItems.some((l) => l.id === remote.id)) {
      shopping.cloudOnly.push({ id: remote.id, name: remote.name, summary: summarizeShopping(remote) });
    }
  }

  const cloudInvById = new Map(cloudInv.map((i) => [i.id, i]));
  const cloudInvByName = new Map();
  for (const i of cloudInv) {
    const k = itemKey(i.name);
    if (!cloudInvByName.has(k)) cloudInvByName.set(k, []);
    cloudInvByName.get(k).push(i);
  }

  const inventory = {
    sameId: [],
    conflicts: [],
    duplicatesByName: [],
    localOnly: [],
    cloudOnly: [],
  };
  const seenInv = new Set();
  for (const local of localInv) {
    const remote = cloudInvById.get(local.id);
    if (remote) {
      seenInv.add(remote.id);
      if (inventoryFieldsDiffer(local, remote)) {
        inventory.conflicts.push({
          kind: 'inventory',
          id: local.id,
          name: local.name,
          local: summarizeInventory(local),
          cloud: summarizeInventory(remote),
          resolution: 'local_wins_on_approve',
        });
      } else {
        inventory.sameId.push({ id: local.id, name: local.name });
      }
      continue;
    }
    const nameHits = cloudInvByName.get(itemKey(local.name)) || [];
    const openHit = nameHits.find((h) => !seenInv.has(h.id));
    if (openHit) {
      seenInv.add(openHit.id);
      inventory.duplicatesByName.push({
        kind: 'inventory',
        localId: local.id,
        cloudId: openHit.id,
        name: local.name,
        local: summarizeInventory(local),
        cloud: summarizeInventory(openHit),
        resolution: 'keep_both_or_merge_local_id',
      });
    } else {
      inventory.localOnly.push({ id: local.id, name: local.name, summary: summarizeInventory(local) });
    }
  }
  for (const remote of cloudInv) {
    if (!seenInv.has(remote.id) && !localInv.some((l) => l.id === remote.id)) {
      inventory.cloudOnly.push({ id: remote.id, name: remote.name, summary: summarizeInventory(remote) });
    }
  }

  const mealConflict =
    localState?.mealPlan &&
    cloudSnapshot?.mealPlan &&
    JSON.stringify(localState.mealPlan) !== JSON.stringify(cloudSnapshot.mealPlan);

  const dinnerConflict =
    localState?.todayDinner &&
    cloudSnapshot?.todayDinner &&
    JSON.stringify(localState.todayDinner) !== JSON.stringify(cloudSnapshot.todayDinner);

  const needsAttention =
    shopping.conflicts.length +
      shopping.duplicatesByName.length +
      inventory.conflicts.length +
      inventory.duplicatesByName.length +
      (mealConflict ? 1 : 0) +
      (dinnerConflict ? 1 : 0) >
    0;

  const cloudEmpty =
    cloudItems.length === 0 &&
    cloudInv.length === 0 &&
    !cloudSnapshot?.mealPlan &&
    !cloudSnapshot?.todayDinner;

  return {
    cloudEmpty,
    needsAttention,
    shopping,
    inventory,
    meals: {
      mealPlanConflict: !!mealConflict,
      todayDinnerConflict: !!dinnerConflict,
      localHasMealPlan: !!localState?.mealPlan,
      cloudHasMealPlan: !!cloudSnapshot?.mealPlan,
      localHasDinner: !!localState?.todayDinner,
      cloudHasDinner: !!cloudSnapshot?.todayDinner,
    },
    summary: {
      shoppingLocalOnly: shopping.localOnly.length,
      shoppingConflicts: shopping.conflicts.length,
      shoppingDuplicates: shopping.duplicatesByName.length,
      shoppingCloudOnly: shopping.cloudOnly.length,
      inventoryLocalOnly: inventory.localOnly.length,
      inventoryConflicts: inventory.conflicts.length,
      inventoryDuplicates: inventory.duplicatesByName.length,
      inventoryCloudOnly: inventory.cloudOnly.length,
    },
  };
}

function summarizeShopping(i) {
  return {
    quantity: i.quantity,
    unit: i.unit,
    priority: i.priority,
    checked: !!i.checked,
    note: i.note || '',
  };
}

function summarizeInventory(i) {
  return {
    status: i.status,
    location: i.location,
    quantity: i.quantity,
    unit: i.unit || '',
    note: i.note || '',
  };
}

function shoppingFieldsDiffer(a, b) {
  return (
    normName(a.name) !== normName(b.name) ||
    Number(a.quantity) !== Number(b.quantity) ||
    String(a.unit || '') !== String(b.unit || '') ||
    !!a.checked !== !!b.checked ||
    String(a.priority || '') !== String(b.priority || '') ||
    String(a.note || '') !== String(b.note || '')
  );
}

function inventoryFieldsDiffer(a, b) {
  return (
    normName(a.name) !== normName(b.name) ||
    String(a.status || '') !== String(b.status || '') ||
    String(a.location || '') !== String(b.location || '') ||
    String(a.quantity ?? '') !== String(b.quantity ?? '') ||
    String(a.note || '') !== String(b.note || '')
  );
}

export function formatMigrationPreview(plan) {
  if (!plan) return '';
  const lines = [];
  if (plan.cloudEmpty) {
    lines.push('클라우드가 비어 있어요. 이 기기 기록을 그대로 올리면 됩니다.');
  }
  const s = plan.summary;
  lines.push(
    `장보기: 올릴 ${s.shoppingLocalOnly} · 충돌 ${s.shoppingConflicts} · 이름중복 ${s.shoppingDuplicates} · 클라우드만 ${s.shoppingCloudOnly}`,
  );
  lines.push(
    `재고: 올릴 ${s.inventoryLocalOnly} · 충돌 ${s.inventoryConflicts} · 이름중복 ${s.inventoryDuplicates} · 클라우드만 ${s.inventoryCloudOnly}`,
  );
  if (plan.meals.mealPlanConflict) lines.push('주간 식단이 기기와 클라우드에서 달라요 → 승인 시 기기 값으로 덮어씁니다.');
  if (plan.meals.todayDinnerConflict) lines.push('오늘 저녁이 달라요 → 승인 시 기기 값으로 덮어씁니다.');
  if (plan.needsAttention) {
    lines.push('충돌·중복이 있어 승인 전에 내용을 확인해 주세요. 승인하면 기기(로컬) 값이 우선합니다. 로컬은 삭제되지 않습니다.');
  } else {
    lines.push('큰 충돌은 없어요. 승인하면 클라우드에 복사하고, 이후 이 계정의 기본 저장소로 씁니다.');
  }
  return lines.join('\n');
}
