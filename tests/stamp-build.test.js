import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stampScript = join(root, 'scripts/stamp-build.mjs');

test('stamp-build replaces BUILD_ID and writes build.json', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ff-stamp-'));
  const dist = join(dir, 'dist');
  const assets = join(dist, 'assets');
  mkdirSync(assets, { recursive: true });
  writeFileSync(join(dist, 'sw.js'), 'const BUILD_ID = "__BUILD_ID__";\nconst CACHE = `familyflow-${BUILD_ID}`;\n');
  writeFileSync(join(assets, 'app.js'), 'export const APP_BUILD_ID = "__APP_BUILD_ID__";\n');
  writeFileSync(join(dist, 'index.html'), '<!doctype html><html><head><title>t</title></head><body></body></html>\n');

  const env = { ...process.env, BUILD_ID: 'deadbeefcafe' };
  delete env.GITHUB_SHA;
  execFileSync(process.execPath, [stampScript], { cwd: dir, env });

  const sw = readFileSync(join(dist, 'sw.js'), 'utf8');
  assert.equal(sw.includes('__BUILD_ID__'), false);
  assert.match(sw, /deadbeefcafe/);
  assert.match(sw, /familyflow-\$\{BUILD_ID\}/);

  const app = readFileSync(join(assets, 'app.js'), 'utf8');
  assert.equal(app.includes('__APP_BUILD_ID__'), false);
  assert.match(app, /deadbeefcafe/);

  const html = readFileSync(join(dist, 'index.html'), 'utf8');
  assert.match(html, /name="familyflow-build" content="deadbeefcafe"/);

  const meta = JSON.parse(readFileSync(join(dist, 'build.json'), 'utf8'));
  assert.equal(meta.id, 'deadbeefcafe');
  assert.ok(meta.builtAt);

  rmSync(dir, { recursive: true, force: true });
});

test('stamp-build fails when placeholder is missing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ff-stamp-miss-'));
  const dist = join(dir, 'dist');
  mkdirSync(dist);
  writeFileSync(join(dist, 'sw.js'), 'const CACHE = "familyflow-shell-v1";\n');

  assert.throws(() => {
    execFileSync(process.execPath, [stampScript], {
      cwd: dir,
      env: { ...process.env, BUILD_ID: 'x', GITHUB_SHA: '' },
      stdio: 'pipe',
    });
  });

  rmSync(dir, { recursive: true, force: true });
});
