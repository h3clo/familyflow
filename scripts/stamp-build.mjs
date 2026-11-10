#!/usr/bin/env node
/**
 * After `vite build`, stamp a unique build id into dist/sw.js and write build.json.
 * Every Pages deploy gets a new Cache name so activate() drops stale shells.
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dist = resolve(process.cwd(), 'dist');
const swPath = resolve(dist, 'sw.js');
const buildJsonPath = resolve(dist, 'build.json');

function resolveBuildId() {
  // Explicit BUILD_ID wins (tests / local overrides).
  if (process.env.BUILD_ID) return String(process.env.BUILD_ID).slice(0, 32);
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 12);
  try {
    return execSync('git rev-parse --short=12 HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return `local-${Date.now()}`;
  }
}

if (!existsSync(swPath)) {
  console.error('stamp-build: dist/sw.js missing — run vite build first');
  process.exit(1);
}

const id = resolveBuildId();
const raw = readFileSync(swPath, 'utf8');
if (!raw.includes('__BUILD_ID__')) {
  console.error('stamp-build: __BUILD_ID__ placeholder missing in dist/sw.js');
  process.exit(1);
}

writeFileSync(swPath, raw.replaceAll('__BUILD_ID__', id));
writeFileSync(
  buildJsonPath,
  `${JSON.stringify({ id, builtAt: new Date().toISOString() }, null, 2)}\n`,
);
console.log(`stamp-build: ${id}`);
