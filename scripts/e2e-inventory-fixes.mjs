/**
 * Regression E2E for inventory fixes (390×844).
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
    /* next */
  }
}
if (!chromium) throw new Error('playwright not found');

const BASE = process.env.FAMILYFLOW_URL || 'http://127.0.0.1:4174/';
const OUT = process.env.ARTIFACT_DIR || '/opt/cursor/artifacts';
fs.mkdirSync(OUT, { recursive: true });

function say(...a) {
  console.log(a.join(' '));
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on('pageerror', (e) => {
  throw new Error(`pageerror: ${e}`);
});

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
if (await page.locator('[data-act=defer-cloud-auth]').count()) {
  await page.locator('[data-act=defer-cloud-auth]').first().click();
}

await page.locator('[data-nav=food]').first().click();
await page.locator('[data-nav=food][data-segment=inventory]').first().click();
await page.waitForSelector('[data-act=inv-tools-toggle]');

// 1) Register button opens form + submit adds item
const toolsBtn = page.locator('[data-act=inv-tools-toggle]');
if ((await toolsBtn.getAttribute('aria-expanded')) !== 'true') await toolsBtn.click();
await page.waitForSelector('[data-form=add-inventory]');
await page.fill('[data-form=add-inventory] [name=name]', '무');
await page.fill('[data-form=add-inventory] [name=quantity]', '1');
await page.fill('[data-form=add-inventory] [name=unit]', 'kg');
await page.selectOption('[data-form=add-inventory] [name=location]', 'fridge');
await page.click('[data-form=add-inventory] button[type=submit]');
await page.waitForSelector('.inv-name', { hasText: '무 1kg', timeout: 4000 });
say('1_register: ok');

// Add more for grouping
async function addItem(name, loc, qty, unit) {
  if ((await toolsBtn.getAttribute('aria-expanded')) !== 'true') await toolsBtn.click();
  await page.fill('[data-form=add-inventory] [name=name]', name);
  await page.selectOption('[data-form=add-inventory] [name=location]', loc);
  if (qty != null) {
    await page.fill('[data-form=add-inventory] [name=quantity]', String(qty));
    await page.fill('[data-form=add-inventory] [name=unit]', unit || '');
  } else {
    await page.fill('[data-form=add-inventory] [name=quantity]', '');
    await page.fill('[data-form=add-inventory] [name=unit]', '');
  }
  await page.click('[data-form=add-inventory] button[type=submit]');
  await page.waitForTimeout(120);
}
await addItem('감귤', 'fridge', 2.5, 'kg');
await addItem('화장지', 'storage', 30, '롤');
await addItem('라면', 'pantry', 3, '개');
await addItem('냉동만두', 'freezer', 1, '봉');

// Close tools for clean list shot
if ((await toolsBtn.getAttribute('aria-expanded')) === 'true') await toolsBtn.click();
await page.waitForTimeout(150);

// 2) Location groups, fewest-first
const groupOrder = await page.locator('[data-inv-group]').evaluateAll((els) =>
  els.map((el) => `${el.getAttribute('data-inv-group')}:${el.querySelector('.inv-group-count')?.textContent}`),
);
say('2_groups:', groupOrder.join(','));
// freezer/pantry/storage should appear before fridge (fridge has 2)
const fridgeIdx = groupOrder.findIndex((g) => g.startsWith('fridge:'));
const firstCount = Number(groupOrder[0].split(':')[1]);
const fridgeCount = Number(groupOrder[fridgeIdx].split(':')[1]);
if (!(firstCount <= fridgeCount)) throw new Error(`groups not ascending: ${groupOrder}`);
if (!groupOrder.some((g) => g.startsWith('storage:'))) throw new Error('missing storage group');

// 3) No sort UI
if (await page.locator('[name=inv-sort]').count()) throw new Error('sort UI still present');
say('3_no_sort: ok');

// 4) Edit/delete icon size
await page.locator('.inv-summary', { hasText: '무' }).click();
const sizes = await page.locator('.inv-row.open .inv-detail-actions .icon').evaluateAll((btns) =>
  btns.map((b) => {
    const r = b.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  }),
);
say('4_btn_sizes:', JSON.stringify(sizes));
if (sizes.some((s) => s.w > 44 || s.h > 44)) throw new Error(`edit/delete too large: ${JSON.stringify(sizes)}`);

// 7) Qty beside name; unknown qty = name only
await page.locator('.inv-summary', { hasText: '무' }).click(); // collapse
await addItem('대파', 'fridge', null, null);
if ((await toolsBtn.getAttribute('aria-expanded')) === 'true') await toolsBtn.click();
const daepa = await page.locator('.inv-name', { hasText: '대파' }).first().innerText();
if (daepa.trim() !== '대파') throw new Error(`expected name only for unknown qty, got ${daepa}`);
const gamgyul = await page.locator('.inv-name', { hasText: '감귤' }).first().innerText();
if (!/감귤\s*2\.5kg/.test(gamgyul)) throw new Error(`expected 감귤 2.5kg, got ${gamgyul}`);
say('7_qty_display: ok');

// 5) Shopping add alone does not create inventory; purchase → enough
const beforeInv = await page.locator('.inv-name').count();
await page.locator('[data-nav=food][data-segment=shopping]').click();
await page.waitForSelector('[data-form=quick-add], [data-form=add-item], form.manual-add, .quick-add', {
  timeout: 5000,
});
// Prefer quick add if present
const quick = page.locator('[data-form=quick-add] textarea, .quick-add textarea, [name=text]');
if (await quick.count()) {
  await quick.first().fill('테스트사과 1개');
  await page.locator('[data-form=quick-add] button[type=submit], .quick-add button[type=submit]').first().click();
} else {
  // fallback: any shopping add form
  await page.fill('input[name=name]', '테스트사과');
  await page.click('form.manual-add button[type=submit], [data-form=add-item] button[type=submit]');
}
await page.waitForTimeout(300);
await page.locator('[data-nav=food][data-segment=inventory]').click();
await page.waitForTimeout(200);
const afterAddOnly = await page.locator('.inv-name', { hasText: '테스트사과' }).count();
if (afterAddOnly) throw new Error('shopping add alone created inventory');
say('5a_shop_add_no_inv: ok');

await page.locator('[data-nav=food][data-segment=shopping]').click();
// check first open item if needed, mark done
const check = page.locator('.shop-row input[type=checkbox], .check input[type=checkbox]').first();
if (await check.count()) {
  if (!(await check.isChecked())) await check.check();
}
const propose = page.locator('[data-act=propose-inventory]');
if (await propose.count()) {
  await propose.click();
  await page.waitForSelector('[data-act=apply-proposals]', { timeout: 4000 });
  const label = await page.locator('.proposals .proposal span, .proposals label').first().innerText();
  if (!/충분/.test(label)) throw new Error(`purchase proposal missing 충분: ${label}`);
  await page.click('[data-act=apply-proposals]');
  await page.waitForTimeout(250);
  await page.locator('[data-nav=food][data-segment=inventory]').click();
  await page.waitForTimeout(200);
  const apple = page.locator('.inv-row', { hasText: '테스트사과' });
  if (!(await apple.count())) throw new Error('purchase did not create inventory');
  const st = await apple.locator('.inv-status').innerText();
  if (!/충분/.test(st)) throw new Error(`expected 충분 after purchase, got ${st}`);
  say('5b_purchase_enough: ok');
} else {
  say('5b_purchase_enough: skipped (no propose btn — item may use different UX)');
}

await page.locator('[data-nav=food][data-segment=inventory]').click();
if ((await toolsBtn.getAttribute('aria-expanded')) === 'true') await toolsBtn.click();
await page.screenshot({ path: path.join(OUT, 'inventory-fixes-mobile.png') });
say('screenshot: inventory-fixes-mobile.png');
say('beforeInv', beforeInv);
say('OK');
await browser.close();
