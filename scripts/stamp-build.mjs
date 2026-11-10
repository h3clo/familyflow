#!/usr/bin/env node
/**
 * After `vite build`, stamp a unique build id into dist (sw.js, app bundle, index.html)
 * and write build.json. Home-screen PWAs compare build.json on resume to auto-refresh.
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const dist = resolve(process.cwd(), 'dist');
const swPath = resolve(dist, 'sw.js');
const buildJsonPath = resolve(dist, 'build.json');
const indexPath = resolve(dist, 'index.html');

function resolveBuildId() {
  if (process.env.BUILD_ID) return String(process.env.BUILD_ID).slice(0, 32);
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 12);
  try {
    return execSync('git rev-parse --short=12 HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return `local-${Date.now()}`;
  }
}

function replaceInFile(filePath, pairs) {
  if (!existsSync(filePath)) return false;
  let text = readFileSync(filePath, 'utf8');
  let changed = false;
  for (const [from, to] of pairs) {
    if (!text.includes(from)) continue;
    text = text.replaceAll(from, to);
    changed = true;
  }
  if (changed) writeFileSync(filePath, text);
  return changed;
}

function walkStamp(dir, pairs) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) {
      walkStamp(p, pairs);
      continue;
    }
    if (!/\.(js|html|css|webmanifest)$/.test(ent.name) && ent.name !== 'sw.js') continue;
    replaceInFile(p, pairs);
  }
}

if (!existsSync(swPath)) {
  console.error('stamp-build: dist/sw.js missing — run vite build first');
  process.exit(1);
}

const id = resolveBuildId();
const pairs = [
  ['__BUILD_ID__', id],
  ['__APP_BUILD_ID__', id],
];

if (!readFileSync(swPath, 'utf8').includes('__BUILD_ID__')) {
  console.error('stamp-build: __BUILD_ID__ placeholder missing in dist/sw.js');
  process.exit(1);
}

walkStamp(dist, pairs);

if (existsSync(indexPath)) {
  let html = readFileSync(indexPath, 'utf8');
  if (!html.includes('name="familyflow-build"')) {
    html = html.replace(
      '<head>',
      `<head>\n    <meta name="familyflow-build" content="${id}" />`,
    );
  } else {
    html = html.replace(
      /<meta name="familyflow-build" content="[^"]*"\s*\/?>/,
      `<meta name="familyflow-build" content="${id}" />`,
    );
  }
  writeFileSync(indexPath, html);
}

writeFileSync(
  buildJsonPath,
  `${JSON.stringify({ id, builtAt: new Date().toISOString() }, null, 2)}\n`,
);
console.log(`stamp-build: ${id}`);
