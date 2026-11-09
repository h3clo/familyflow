export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `ff-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
