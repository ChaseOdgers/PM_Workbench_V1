// The mock database: a data pack loaded into memory and saved to localStorage.
// Nothing outside src/api/ touches this file. To move to Postgres or a real client system,
// replace the functions in src/api/index.js with fetch() calls; the screens don't change.
import { loadPack } from "../data/packs";

const KEY = "pmwb.v1.db";
const listeners = new Set();
let db = null;

// Seed files use `ago` (minutes before now) so the demo always looks fresh.
function hydrate(node, now) {
  if (Array.isArray(node)) return node.forEach((n) => hydrate(n, now));
  if (!node || typeof node !== "object") return;
  for (const k of Object.keys(node)) {
    if (k === "ago") { node.at = new Date(now - node.ago * 60000).toISOString(); delete node.ago; }
    else if (k === "syncAgo") { node.lastSync = new Date(now - node.syncAgo * 60000).toISOString(); delete node.syncAgo; }
    else hydrate(node[k], now);
  }
}

function fresh(packId = "aa") {
  const d = structuredClone(loadPack(packId));
  hydrate(d, Date.now());
  d.audit = [];
  d.meta = { packId, rev: 0, seq: { OPP: 2280, SIG: 500, ev: 100, log: 100, src: 100, pol: 10, gate: 10, user: 10, work: 500, fb: 100, run: 9100, note: 10, audit: 1 } };
  return d;
}

export function getDb() {
  if (!db) {
    try { db = JSON.parse(localStorage.getItem(KEY)) || fresh(); } catch { db = fresh(); }
  }
  return db;
}

export function nextId(kind, prefix = kind) {
  const d = getDb();
  d.meta.seq[kind] = (d.meta.seq[kind] || 0) + 1;
  return `${prefix}-${d.meta.seq[kind]}`;
}

export function mutate(fn) {
  const d = getDb();
  const out = fn(d);
  d.meta.rev++;
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* storage full or blocked: keep in memory */ }
  listeners.forEach((l) => l(d.meta.rev));
  return out;
}

export function resetDb(packId) {
  db = fresh(packId || getDb().meta.packId);
  mutate(() => {});
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
