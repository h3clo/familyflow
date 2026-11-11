/**
 * Headless browser: home dinner ↔ meals today align; week shortages → shopping proposal.
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

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });

// Defer auth if gate present
const defer = page.locator('[data-act="defer-cloud-auth"]');
if (await defer.count()) {
  await defer.first().click();
  await page.waitForSelector('[data-nav="home"]', { timeout: 8000 });
}

await page.locator('[data-nav="food"]').first().click();
await page.waitForSelector('[data-nav="food"][data-segment="inventory"]', { timeout: 5000 });
await page.locator('[data-nav="food"][data-segment="inventory"]').first().click();
await page.waitForSelector('[data-form="add-inventory"]', { timeout: 5000 });
await page.fill('[data-form="add-inventory"] [name="name"]', '간장');
await page.selectOption('[data-form="add-inventory"] [name="location"]', 'pantry');
await page.selectOption('[data-form="add-inventory"] [name="status"]', 'out');
await page.click('[data-form="add-inventory"] button[type="submit"]');
await page.waitForTimeout(200);

await page.click('[data-nav="home"]');
await page.waitForTimeout(300);
const homeTitle = await page.locator('.dinner-stage h2, .dinner-hero h2, .dinner-hero-body h2').first().innerText();
say('home title:', homeTitle);
await page.screenshot({ path: path.join(OUT, 'flow-home-offer.png'), fullPage: true });

await page.locator('[data-nav="food"]').first().click();
await page.locator('[data-nav="food"][data-segment="meals"]').first().click();
await page.waitForTimeout(200);
const mealsStatus = await page.locator('[data-meals-today]').getAttribute('data-meals-today');
const mealsTitle = await page.locator('[data-meals-today] h3').innerText();
say('meals today status/title:', mealsStatus, mealsTitle);
if (mealsStatus !== 'offer') throw new Error(`expected meals today offer, got ${mealsStatus}`);
if (mealsTitle.trim() !== homeTitle.trim()) {
  throw new Error(`meals title "${mealsTitle}" != home "${homeTitle}"`);
}
await page.screenshot({ path: path.join(OUT, 'flow-meals-today-offer.png'), fullPage: true });

await page.click('[data-nav="home"]');
await page.click('[data-act="dinner-accept"]');
await page.waitForSelector('.approval', { timeout: 5000 });
await page.click('[data-act="confirm-proposal"]');
await page.waitForTimeout(400);

await page.locator('[data-nav="food"]').first().click();
await page.locator('[data-nav="food"][data-segment="meals"]').first().click();
await page.waitForTimeout(200);
const confirmedStatus = await page.locator('[data-meals-today]').getAttribute('data-meals-today');
say('meals after confirm:', confirmedStatus);
if (confirmedStatus !== 'confirmed') throw new Error(`expected confirmed, got ${confirmedStatus}`);
await page.screenshot({ path: path.join(OUT, 'flow-meals-today-confirmed.png'), fullPage: true });

// Week draft → confirm → shopping proposal when shortages exist
const draftBtn = page.locator('[data-act="draft-week"]');
if (await draftBtn.count()) {
  await draftBtn.first().click();
  await page.waitForTimeout(300);
}
const confirmWeek = page.locator('[data-act="confirm-week"]');
if (await confirmWeek.count()) {
  await confirmWeek.click();
  await page.waitForTimeout(400);
  const approval = page.locator('.approval');
  if (await approval.count()) {
    const text = await approval.innerText();
    say('week shop approval:', text.slice(0, 180).replace(/\s+/g, ' '));
    if (!/장보기|부족/.test(text)) throw new Error('week confirm did not open shortage shopping preview');
    await page.screenshot({ path: path.join(OUT, 'flow-week-shop-preview.png'), fullPage: true });
    await page.click('[data-act="confirm-proposal"]');
    await page.waitForTimeout(300);
  } else {
    // Soy may already be on list from dinner accept — try explicit button
    const shopBtn = page.locator('[data-act="week-shop-needs"]');
    if (await shopBtn.count()) {
      await shopBtn.click();
      await page.waitForSelector('.approval', { timeout: 5000 });
      await page.screenshot({ path: path.join(OUT, 'flow-week-shop-preview.png'), fullPage: true });
      await page.click('[data-act="confirm-proposal"]');
    } else {
      say('no week shopping proposal (soy may already be listed) — OK');
    }
  }
}

await page.locator('[data-nav="food"]').first().click();
await page.locator('[data-nav="food"][data-segment="shopping"]').first().click();
await page.waitForTimeout(200);
const onList = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('familyflow-v1'));
  const list = s.shoppingLists.find((l) => l.id === s.settings.activeListId) || s.shoppingLists[0];
  return (list?.items || []).filter((i) => !i.checked).map((i) => i.name);
});
say('open shopping items:', onList.join(', ') || '(none)');
if (!onList.some((n) => n.includes('간장'))) {
  throw new Error('expected 간장 on shopping list from sauce/week shortage flow');
}
await page.screenshot({ path: path.join(OUT, 'flow-shopping-after.png'), fullPage: true });

if (errors.length) {
  say('page errors:', errors.join(' | '));
  throw new Error('page errors');
}

fs.writeFileSync(path.join(OUT, 'e2e-flow-complete.log'), log.join('\n') + '\n');
say('OK');
await browser.close();
