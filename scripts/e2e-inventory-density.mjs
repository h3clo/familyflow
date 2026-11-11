/**
 * Mobile inventory density + CRUD regression (390×844).
 * Compares visible collapsed rows vs the previous card+chips baseline (~7).
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const pwRoots = [
  '/tmp/pw-e2e/node_modules/playwright',
  path.join(process.cwd(), 'node_modules/playwright'),
];
let chromium;
for (const root of pwRoots) {
  try {
    ({ chromium } = require(root));
    break;
  } catch {
    /* try next */
  }
}
if (!chromium) throw new Error('playwright not found (expected /tmp/pw-e2e)');

const BASE = process.env.FAMILYFLOW_URL || 'http://127.0.0.1:4174/';
const OUT = process.env.ARTIFACT_DIR || '/opt/cursor/artifacts';
/** Prior card layout (~PR #51): about 7 full status-chip rows in this viewport. */
const PREV_VISIBLE_BASELINE = 7;
fs.mkdirSync(OUT, { recursive: true });

const names = [
  '달걀',
  '우유',
  '대파',
  '두부',
  '감귤',
  '무',
  '라면',
  '화장지',
  '당근',
  '양파',
  '감자',
  '브로콜리',
  '배추',
  '고추',
  '마늘',
  '생강',
  '파프리카',
  '시금치',
];

function say(...args) {
  console.log(args.join(' '));
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on('pageerror', (e) => {
  throw new Error(`pageerror: ${e}`);
});

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });

const defer = page.locator('[data-act="defer-cloud-auth"]');
if (await defer.count()) {
  await defer.first().click();
  await page.waitForSelector('[data-nav="home"]', { timeout: 8000 });
}

// Seed inventory into the live app state key, then reload.
await page.evaluate((itemNames) => {
  const key = Object.keys(localStorage).find((k) => k.endsWith('familyflow-v1') || k === 'familyflow-v1');
  const raw = key ? localStorage.getItem(key) : null;
  const state = raw ? JSON.parse(raw) : null;
  if (!state) throw new Error('no familyflow-v1 state after boot');
  const statuses = ['enough', 'low', 'out', 'unknown'];
  const locations = ['fridge', 'freezer', 'pantry', 'storage'];
  state.inventory = itemNames.map((name, i) => ({
    id: `e2e-inv-${i}`,
    name,
    location: locations[i % locations.length],
    status: statuses[i % statuses.length],
    quantity: i % 3 === 0 ? null : i + 1,
    unit: i % 3 === 0 ? null : '개',
    category: 'food',
    note: '',
    updatedAt: new Date().toISOString(),
  }));
  state.settings.view = 'food';
  state.settings.foodSegment = 'inventory';
  localStorage.setItem(key, JSON.stringify(state));
}, names);
await page.reload({ waitUntil: 'networkidle' });

await page.locator('[data-nav="food"]').first().click();
await page.locator('[data-nav="food"][data-segment="inventory"]').first().click();
await page.waitForSelector('[data-inv-compact] .inv-summary', { timeout: 5000 });

// Close register panel so the list owns the viewport.
const toolsBtn = page.locator('[data-act=inv-tools-toggle]');
if ((await toolsBtn.count()) && (await toolsBtn.getAttribute('aria-expanded')) === 'true') {
  await toolsBtn.click();
}
await page.waitForTimeout(120);

const visible = await page.evaluate(() => {
  const tab = document.querySelector('.tabbar');
  const bottom = tab ? tab.getBoundingClientRect().top : window.innerHeight;
  const rows = [...document.querySelectorAll('[data-inv-compact] .inv-summary')];
  return rows.filter((el) => {
    const r = el.getBoundingClientRect();
    return r.top >= 0 && r.bottom <= bottom + 0.5 && r.height >= 40;
  }).length;
});

say('prev_visible_baseline:', PREV_VISIBLE_BASELINE);
say('new_visible_collapsed_rows:', visible);
if (visible <= PREV_VISIBLE_BASELINE) {
  throw new Error(`expected more than ${PREV_VISIBLE_BASELINE} visible rows, got ${visible}`);
}
if (visible < 12) {
  throw new Error(`expected at least 12 visible compact rows at 390×844, got ${visible}`);
}

// Expand first row via keyboard (focus + Enter)
const first = page.locator('[data-inv-compact] .inv-summary').first();
await first.focus();
await page.keyboard.press('Enter');
await page.waitForSelector('[data-inv-compact] .inv-row.open .inv-detail:not([hidden])', {
  timeout: 3000,
});
say('expand_via_enter: ok');

await page.locator('.inv-row.open [data-act=inv-status][data-status=low]').click();
await page.waitForTimeout(150);
const statusText = await page.locator('[data-inv-compact] .inv-row.open .inv-status').innerText();
if (!/부족/.test(statusText)) throw new Error(`status text not updated: ${statusText}`);
say('status_chip_to_low: ok');

await page.locator('.inv-row.open [data-act=inv-edit]').click();
await page.waitForSelector('[data-form=edit-inventory]', { timeout: 3000 });
await page.fill('[data-form=edit-inventory] [name=name]', '특란달걀');
await page.locator('[data-form=edit-inventory] button[type=submit]').click();
await page.waitForSelector('[data-inv-compact] .inv-name', { hasText: '특란달걀', timeout: 4000 });
say('edit_rename: ok');

await page.fill('[name=inv-query]', '화장');
await page.waitForTimeout(150);
const filtered = await page.locator('[data-inv-compact] .inv-summary').count();
if (filtered !== 1) throw new Error(`filter expected 1 화장지, got ${filtered}`);
say('search_filter: ok');

await page.fill('[name=inv-query]', '');
await page.waitForTimeout(100);
await page.locator('[data-inv-compact] .inv-summary', { hasText: '라면' }).click();
page.once('dialog', (d) => d.accept());
await page.locator('.inv-row.open [data-act=inv-delete]').click();
await page.waitForTimeout(150);
const ramen = await page.locator('[data-inv-compact] .inv-name', { hasText: '라면' }).count();
if (ramen) throw new Error('delete failed');
say('delete: ok');

// Manual add regression with tools panel
if ((await toolsBtn.getAttribute('aria-expanded')) !== 'true') await toolsBtn.click();
await page.fill('[data-form="add-inventory"] [name="name"]', '테스트콩나물');
await page.selectOption('[data-form="add-inventory"] [name="location"]', 'fridge');
await page.selectOption('[data-form="add-inventory"] [name="status"]', 'enough');
await page.click('[data-form="add-inventory"] button[type="submit"]');
await page.waitForTimeout(150);
if (!(await page.locator('[data-inv-compact] .inv-name', { hasText: '테스트콩나물' }).count())) {
  throw new Error('manual add failed');
}
say('manual_add: ok');

await page.screenshot({ path: path.join(OUT, 'inventory-compact-density.png') });
fs.writeFileSync(
  path.join(OUT, 'inventory-density-compare.json'),
  JSON.stringify(
    {
      viewport: { width: 390, height: 844 },
      prevVisibleBaseline: PREV_VISIBLE_BASELINE,
      newVisibleCollapsedRows: visible,
      gain: visible - PREV_VISIBLE_BASELINE,
    },
    null,
    2,
  ),
);

say('OK');
await browser.close();
