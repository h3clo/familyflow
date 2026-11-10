/**
 * Tag QA rows so cleanup only touches this run's data.
 */

import { randomBytes } from 'node:crypto';

export function makeRunId() {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const rand = randomBytes(3).toString('hex');
  return `ffqa${stamp}${rand}`;
}

/** Human-visible marker embedded in names/titles. */
export function qaLabel(runId, part) {
  return `[QA ${runId}] ${part}`;
}

export function isQaLabel(name, runId) {
  return String(name || '').includes(`[QA ${runId}]`);
}

export const SHARED_HH_A = 'ff-qa-shared-a';
export const SHARED_HH_B = 'ff-qa-shared-b';
