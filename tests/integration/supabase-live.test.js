/**
 * Live Supabase QA — Family Flow.
 * Skips with "실제 서버 미검증" when SUPABASE_QA_* secrets are missing.
 * When configured, failures fail the process (CI red).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readQaEnv } from '../../qa/env.mjs';
import { createQaClient, signInQaUser, signOutQa } from '../../qa/client.mjs';
import { makeRunId, qaLabel, SHARED_HH_A, SHARED_HH_B } from '../../qa/markers.mjs';
import { cleanupTaggedHouseholdData } from '../../qa/cleanup.mjs';
import { ensureNamedHousehold } from '../../qa/households.mjs';
import { createEmptyState } from '../../src/domain/state.js';
import { seedState } from '../../src/domain/seed.js';
import { ensureActiveList, addShoppingItem } from '../../src/domain/shopping.js';
import { createInventoryItem } from '../../src/domain/inventory.js';
import { pushLocalToCloud, pullCloudToState } from '../../src/cloud/sync.js';

const qa = readQaEnv();
const live = qa.configured;
const runId = makeRunId();

if (!live) {
  console.log(`\n[supabase-qa] ${qa.skipReason}\n`);
}

test('QA gate reports configuration status', () => {
  if (!live) {
    assert.ok(qa.skipReason.includes('실제 서버 미검증') || qa.rejectedSecret);
  } else {
    assert.equal(qa.configured, true);
    assert.equal(qa.rejectedSecret, false);
  }
});

test('auth: sign-in, session, sign-out', { skip: !live }, async () => {
  const client = createQaClient({
    url: qa.SUPABASE_QA_URL,
    publishableKey: qa.SUPABASE_QA_PUBLISHABLE_KEY,
    storageKey: `qa-a-${runId}`,
  });
  const { session, user } = await signInQaUser(
    client,
    qa.SUPABASE_QA_USER_A_EMAIL,
    qa.SUPABASE_QA_USER_A_PASSWORD,
  );
  assert.ok(session.access_token);
  assert.equal(user.email?.toLowerCase(), qa.SUPABASE_QA_USER_A_EMAIL.toLowerCase());

  const again = await client.auth.getSession();
  assert.ok(again.data.session?.user?.id);

  await signOutQa(client);
  const after = await client.auth.getSession();
  assert.equal(after.data.session, null);
});

test('CRUD + sync push/pull round-trip (device A → fresh client)', { skip: !live }, async () => {
  const clientA = createQaClient({
    url: qa.SUPABASE_QA_URL,
    publishableKey: qa.SUPABASE_QA_PUBLISHABLE_KEY,
    storageKey: `qa-crud-a-${runId}`,
  });
  await signInQaUser(clientA, qa.SUPABASE_QA_USER_A_EMAIL, qa.SUPABASE_QA_USER_A_PASSWORD);
  const householdId = await ensureNamedHousehold(clientA, SHARED_HH_A);

  const state = seedState(createEmptyState());
  state.cloud.householdId = householdId;
  state.cloud.mode = 'cloud-primary';
  const list = ensureActiveList(state);
  list.title = qaLabel(runId, 'list');
  const itemName = qaLabel(runId, '휴지');
  const invName = qaLabel(runId, '과자');
  addShoppingItem(list, {
    name: itemName,
    quantity: 2,
    unit: '롤',
    priority: 'must',
    category: 'household',
  });
  state.inventory.push(
    createInventoryItem({
      name: invName,
      status: 'enough',
      location: 'pantry',
      category: 'snack',
      quantity: 1,
      unit: '봉',
    }),
  );

  try {
    const pushed = await pushLocalToCloud(state, householdId, clientA);
    assert.equal(pushed.ok, true);
    assert.equal(pushed.localPreserved, true);
    assert.ok(pushed.counts.shoppingItems >= 1);
    assert.ok(pushed.counts.inventory >= 1);

    // Fresh "device B" session as same user
    const clientB = createQaClient({
      url: qa.SUPABASE_QA_URL,
      publishableKey: qa.SUPABASE_QA_PUBLISHABLE_KEY,
      storageKey: `qa-crud-b-${runId}`,
    });
    await signInQaUser(clientB, qa.SUPABASE_QA_USER_A_EMAIL, qa.SUPABASE_QA_USER_A_PASSWORD);
    const pulled = await pullCloudToState(createEmptyState(), householdId, clientB);
    const names = (pulled.shoppingLists || []).flatMap((l) => l.items.map((i) => i.name));
    assert.ok(names.includes(itemName), 'shopping item missing after pull');
    assert.ok(
      (pulled.inventory || []).some((i) => i.name === invName && i.category === 'snack'),
      'inventory missing after pull',
    );

    // Update inventory status and re-read
    const invRow = pulled.inventory.find((i) => i.name === invName);
    const { error: uErr } = await clientB
      .from('inventory_items')
      .update({ status: 'low', updated_at: new Date().toISOString() })
      .eq('id', invRow.id)
      .eq('household_id', householdId);
    assert.equal(uErr, null);
    const { data: reread, error: rErr } = await clientB
      .from('inventory_items')
      .select('status, name')
      .eq('id', invRow.id)
      .maybeSingle();
    assert.equal(rErr, null);
    assert.equal(reread.status, 'low');
  } finally {
    await cleanupTaggedHouseholdData(clientA, householdId, runId);
    await signOutQa(clientA);
  }
});

test('RLS: user B cannot read user A household rows', { skip: !live || !qa.hasUserB }, async () => {
  const clientA = createQaClient({
    url: qa.SUPABASE_QA_URL,
    publishableKey: qa.SUPABASE_QA_PUBLISHABLE_KEY,
    storageKey: `qa-rls-a-${runId}`,
  });
  const clientB = createQaClient({
    url: qa.SUPABASE_QA_URL,
    publishableKey: qa.SUPABASE_QA_PUBLISHABLE_KEY,
    storageKey: `qa-rls-b-${runId}`,
  });

  await signInQaUser(clientA, qa.SUPABASE_QA_USER_A_EMAIL, qa.SUPABASE_QA_USER_A_PASSWORD);
  await signInQaUser(clientB, qa.SUPABASE_QA_USER_B_EMAIL, qa.SUPABASE_QA_USER_B_PASSWORD);

  const hhA = await ensureNamedHousehold(clientA, SHARED_HH_A);
  const hhB = await ensureNamedHousehold(clientB, SHARED_HH_B);
  assert.notEqual(hhA, hhB);

  const secretName = qaLabel(runId, `secret-${randomUUID().slice(0, 8)}`);
  const { data: inserted, error: insErr } = await clientA
    .from('inventory_items')
    .insert({
      id: randomUUID(),
      household_id: hhA,
      name: secretName,
      location: 'pantry',
      status: 'enough',
      category: 'other',
      note: '',
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .maybeSingle();
  assert.equal(insErr, null, insErr?.message);
  assert.ok(inserted?.id);

  try {
    const { data: leaked, error: leakErr } = await clientB
      .from('inventory_items')
      .select('id, name, household_id')
      .eq('household_id', hhA);
    assert.equal(leakErr, null);
    assert.equal((leaked || []).length, 0, 'RLS should hide other household rows');

    const { data: forged, error: forgeErr } = await clientB
      .from('inventory_items')
      .insert({
        id: randomUUID(),
        household_id: hhA,
        name: qaLabel(runId, 'forged'),
        location: 'pantry',
        status: 'enough',
        category: 'other',
        note: '',
        updated_at: new Date().toISOString(),
      })
      .select('id');
    assert.ok(forgeErr || !(forged || []).length, 'forged insert into foreign household must fail');
  } finally {
    await cleanupTaggedHouseholdData(clientA, hhA, runId);
    await cleanupTaggedHouseholdData(clientB, hhB, runId);
    await signOutQa(clientA);
    await signOutQa(clientB);
  }
});

test('unauthenticated client cannot read household inventory', { skip: !live }, async () => {
  const clientA = createQaClient({
    url: qa.SUPABASE_QA_URL,
    publishableKey: qa.SUPABASE_QA_PUBLISHABLE_KEY,
    storageKey: `qa-anon-setup-${runId}`,
  });
  await signInQaUser(clientA, qa.SUPABASE_QA_USER_A_EMAIL, qa.SUPABASE_QA_USER_A_PASSWORD);
  const hhA = await ensureNamedHousehold(clientA, SHARED_HH_A);
  await signOutQa(clientA);

  const anon = createQaClient({
    url: qa.SUPABASE_QA_URL,
    publishableKey: qa.SUPABASE_QA_PUBLISHABLE_KEY,
    storageKey: `qa-anon-${runId}`,
  });
  const { data, error } = await anon.from('inventory_items').select('id').eq('household_id', hhA).limit(5);
  // RLS: either error or empty — never rows
  assert.ok(error || !(data || []).length);
});
