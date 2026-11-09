/**
 * Headless browser: home proposal preview → approve → persist after reload.
 * Also checks shopping inventory-chip preview path.
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

const BASE = process.env.FAMILYFLOW_URL || 'http://127.0.0.1:5174/';
const OUT = process.env.ARTIFACT_DIR || '/opt/cursor/artifacts';
fs.mkdirSync(OUT, { recursive: true });

const log = [];
function say(...args) {
  const line = args.join(' ');
  log.push(line);
  console.log(line);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console:${m.text()}`);
});

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });

await page.click('[data-nav="inventory"]');
await page.fill('[data-form="add-inventory"] [name="name"]', '휴지');
await page.selectOption('[data-form="add-inventory"] [name="location"]', 'storage');
await page.selectOption('[data-form="add-inventory"] [name="status"]', 'out');
await page.fill('[data-form="add-inventory"] [name="quantity"]', '30');
await page.fill('[data-form="add-inventory"] [name="unit"]', '롤');
await page.selectOption('[data-form="add-inventory"] [name="category"]', 'household');
await page.click('[data-form="add-inventory"] button[type="submit"]');
await page.waitForTimeout(300);

await page.click('[data-nav="home"]');
await page.waitForTimeout(200);
await page.screenshot({ path: path.join(OUT, 's2-home-suggestions.png'), fullPage: true });

const previewBtn = page.locator('[data-act="preview-suggestion"]').first();
await previewBtn.waitFor({ timeout: 5000 });
await previewBtn.click();
await page.waitForSelector('.approval', { timeout: 5000 });
const approvalText = await page.locator('.approval').innerText();
say('preview panel:', approvalText.slice(0, 200).replace(/\s+/g, ' '));
if (!approvalText.includes('승인 전에는')) throw new Error('missing preview disclaimer');
await page.screenshot({ path: path.join(OUT, 's2-preview-panel.png'), fullPage: true });

await page.click('[data-act="cancel-proposal"]');
await page.click('[data-nav="shopping"]');
await page.waitForTimeout(200);
const openCountBefore = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('familyflow-v1'));
  const list = s.shoppingLists.find((l) => l.id === s.settings.activeListId) || s.shoppingLists[0];
  return (list?.items || []).filter((i) => i.name === '휴지' && !i.checked).length;
});
say('휴지 on list after cancel:', openCountBefore);
if (openCountBefore !== 0) throw new Error('cancel leaked shopping item');

await page.click('[data-nav="home"]');
await page.locator('[data-act="preview-suggestion"]').first().click();
await page.click('[data-act="confirm-proposal"]');
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(OUT, 's2-after-approve-shopping.png'), fullPage: true });

const afterApprove = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('familyflow-v1'));
  const list = s.shoppingLists.find((l) => l.id === s.settings.activeListId) || s.shoppingLists[0];
  return {
    tissue: (list?.items || []).filter((i) => i.name === '휴지' && !i.checked).length,
    applied: Object.keys(s.proposalsMeta?.applied || {}),
  };
});
say('after approve', JSON.stringify(afterApprove));
if (afterApprove.tissue < 1) throw new Error('approve did not add 휴지');

await page.reload({ waitUntil: 'networkidle' });
const afterReload = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('familyflow-v1'));
  const list = s.shoppingLists.find((l) => l.id === s.settings.activeListId) || s.shoppingLists[0];
  return (list?.items || []).filter((i) => i.name === '휴지' && !i.checked).length;
});
say('after reload 휴지 count:', afterReload);
if (afterReload < 1) throw new Error('persist failed after reload');

await page.click('[data-nav="inventory"]');
await page.fill('[data-form="add-inventory"] [name="name"]', '고등어');
await page.selectOption('[data-form="add-inventory"] [name="status"]', 'out');
await page.selectOption('[data-form="add-inventory"] [name="category"]', 'food');
await page.fill('[data-form="add-inventory"] [name="unit"]', '마리');
await page.click('[data-form="add-inventory"] button[type="submit"]');
await page.click('[data-nav="shopping"]');
await page.waitForTimeout(200);
const chip = page.locator('[data-act="preview-inv-suggestion"]').filter({ hasText: '고등어' });
await chip.click();
await page.waitForSelector('.approval');
const chipPreview = await page.locator('.approval').innerText();
say('chip preview:', chipPreview.slice(0, 160).replace(/\s+/g, ' '));
await page.click('[data-act="confirm-proposal"]');
await page.waitForTimeout(300);
const mackerel = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('familyflow-v1'));
  const list = s.shoppingLists.find((l) => l.id === s.settings.activeListId) || s.shoppingLists[0];
  return (list?.items || []).some((i) => i.name === '고등어' && !i.checked);
});
say('mackerel after chip approve:', mackerel);
if (!mackerel) throw new Error('chip approve failed');

await page.screenshot({ path: path.join(OUT, 's2-shopping-chip-approved.png'), fullPage: true });

// AI panel smoke via UI (proxy)
await page.click('[data-nav="more"]');
await page.click('[data-act="ai-probe"]');
await page.waitForTimeout(1500);
let aiText = await page.locator('[data-ai-panel]').innerText();
say('ai probe:', aiText.slice(0, 220).replace(/\s+/g, ' '));
await page.click('[data-act="ai-smoke"]');
await page.waitForTimeout(20000);
aiText = await page.locator('[data-ai-panel]').innerText();
say('ai smoke:', aiText.slice(0, 280).replace(/\s+/g, ' '));
await page.screenshot({ path: path.join(OUT, 's3-ai-panel.png'), fullPage: true });

if (errors.length) say('PAGE_ERRORS', errors.join(' | '));
else say('PAGE_ERRORS none');

fs.writeFileSync(path.join(OUT, 's2-browser-e2e.log'), log.join('\n') + '\n');
await browser.close();
say('E2E_OK');
