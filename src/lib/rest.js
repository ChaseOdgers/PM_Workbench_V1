// Generic REST connector: point the Workbench at any JSON endpoint that returns a list of records
// (tickets, reviews, survey responses) or weekly metric series. It finds the list in the
// response, flattens nested fields (Account.Tier__c), guesses the column mapping and hands the
// rows to the same pipeline as a file import. No per-system code needed.
import { guessMapping } from "./ingest";

const PREFERRED = ["records", "data", "items", "results", "rows", "reviews", "responses", "conversations", "events", "series", "entries", "value"];
const isRows = (v) => Array.isArray(v) && v.length > 0 && v.every((x) => x && typeof x === "object" && !Array.isArray(x));

// Where the records live in a response: the body itself, a well-known key, or one level deeper.
export function findRecords(json) {
  if (isRows(json)) return { path: "(root)", rows: json };
  if (!json || typeof json !== "object") return null;
  const keys = [...PREFERRED.filter((k) => k in json), ...Object.keys(json).filter((k) => !PREFERRED.includes(k))];
  for (const k of keys) if (isRows(json[k])) return { path: k, rows: json[k] };
  for (const k of keys) {
    const v = json[k];
    if (v && typeof v === "object" && !Array.isArray(v)) for (const k2 of Object.keys(v)) if (isRows(v[k2])) return { path: `${k}.${k2}`, rows: v[k2] };
  }
  return null;
}

export function flatten(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === "attributes" || k.startsWith("_")) continue;
    if (v && typeof v === "object" && !Array.isArray(v)) { for (const [k2, v2] of Object.entries(v)) if (v2 == null || typeof v2 !== "object") out[`${k}.${k2}`] = v2 == null ? "" : String(v2); }
    else if (!Array.isArray(v)) out[k] = v == null ? "" : String(v);
  }
  return out;
}

export async function fetchJson(url, key) {
  let res;
  try { res = await fetch(url, key ? { headers: { "x-api-key": key } } : undefined); }
  catch { throw new Error(`can't reach ${url}. Is the API running, and does it allow browser calls (CORS)?`); }
  if (res.status === 401 || res.status === 403) throw new Error(`the API refused the request (${res.status}). Check the API key`);
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  try { return await res.json(); } catch { throw new Error("the response isn't JSON"); }
}

// Test a URL: what the records look like and a first guess at the mapping.
export async function probe(url, key) {
  const json = await fetchJson(url, key);
  const found = findRecords(json);
  if (!found) throw new Error("no list of records found in the response");
  if (found.rows[0].weeks && Array.isArray(found.rows[0].weeks)) return { kind: "metrics", path: found.path, count: found.rows.length, series: found.rows.map((s) => ({ label: s.label || s.metric, unit: s.unit, last: s.weeks[s.weeks.length - 1]?.value })) };
  const rows = found.rows.map(flatten);
  const headers = [...new Set(rows.slice(0, 50).flatMap((r) => Object.keys(r)))];
  const mapping = guessMapping(headers);
  return { kind: "records", path: found.path, count: rows.length, headers, rows, preview: rows.slice(0, 3), mapping, recordType: mapping.rating ? "feedback" : "support" };
}

// The mock enterprise API publishes a catalog of its endpoints at /v1/index.json.
export async function catalog(base) {
  const b = base.replace(/\/+$/, "");
  const j = await fetchJson(`${b}/v1/index.json`);
  return Object.entries(j.endpoints || {}).map(([ep, count]) => ({ endpoint: ep, count, url: `${b}/v1/${ep}.json` }));
}

export async function pull(cfg) {
  const json = await fetchJson(cfg.url, cfg.key);
  const found = findRecords(json);
  if (!found) throw new Error("no list of records found in the response");
  return found.rows[0].weeks ? { metrics: true, rows: found.rows } : { metrics: false, rows: found.rows.map(flatten) };
}
