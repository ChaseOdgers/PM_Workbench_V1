// Real-data ingestion: parse an uploaded export, map its columns, theme each record and
// build the numbers the signals agent ranks (volume and an 8-week trend).
// Pure functions, no DB access, so they can be tested in Node and reused by a backend later.

export const MAX_ROWS = 5000;
const DAY = 86400000;

/* ---------- parsing ---------- */

// RFC 4180-style CSV: quoted fields, escaped quotes, commas and newlines inside quotes, CRLF.
export function parseCsv(text) {
  const rows = [];
  let row = [], field = "", q = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  if (!rows.length) return { headers: [], rows: [] };
  const headers = rows[0].map((h, i) => h.trim() || `Column ${i + 1}`);
  return { headers, rows: rows.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? "").trim()]))) };
}

// A JSON export: an array of objects, or an object holding one (e.g. {"tickets":[…]}).
export function parseJson(text) {
  let data = JSON.parse(text);
  if (!Array.isArray(data)) data = Object.values(data).find(Array.isArray) || [];
  const rows = data.filter((r) => r && typeof r === "object").map((r) =>
    Object.fromEntries(Object.entries(r).filter(([, v]) => v == null || typeof v !== "object").map(([k, v]) => [k, v == null ? "" : String(v)])));
  const headers = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return { headers, rows };
}

export function parseFile(name, text) {
  const out = /\.json$/i.test(name) || /^\s*[[{]/.test(text) ? parseJson(text) : parseCsv(text);
  return { ...out, truncated: out.rows.length > MAX_ROWS, total: out.rows.length, rows: out.rows.slice(0, MAX_ROWS) };
}

/* ---------- column mapping ---------- */

const GUESS = {
  text: ["description", "comment", "comments", "body", "text", "verbatim", "feedback", "review", "message", "details", "content", "summary", "notes"],
  title: ["subject", "title", "headline", "summary"],
  date: ["created", "created at", "created_at", "createddate", "date", "submitted", "opened", "timestamp", "started at", "started", "time", "created date"],
  id: ["id", "ticket id", "ticket", "case number", "casenumber", "case id", "key", "number", "review id"],
  category: ["category", "type", "topic", "reason", "issue type", "intent", "tags", "case reason"],
  channel: ["channel", "origin", "source", "via", "case origin", "platform"],
  rating: ["rating", "score", "stars", "nps", "csat"],
  tier: ["tier", "customer tier", "status", "segment", "loyalty tier", "priority"],
};

export function guessMapping(headers) {
  const norm = (h) => h.toLowerCase().replace(/[_\-.]+/g, " ").trim();
  const used = new Set();
  const m = {};
  for (const [field, names] of Object.entries(GUESS)) {
    const hit = names.map((n) => headers.find((h) => !used.has(h) && norm(h) === n)).find(Boolean)
      || names.map((n) => headers.find((h) => !used.has(h) && norm(h).includes(n))).find(Boolean);
    if (hit) { m[field] = hit; used.add(hit); }
  }
  // If there is a title but no body, the title is the text.
  if (!m.text && m.title) { m.text = m.title; delete m.title; }
  return m;
}

/* ---------- theming ---------- */

export function classify(text, themes) {
  const t = ` ${text.toLowerCase()} `;
  let best = null, bestHits = 0;
  for (const th of themes) {
    const hits = (th.keywords || []).reduce((n, k) => n + (t.includes(k.toLowerCase()) ? 1 : 0), 0);
    if (hits > bestHits) { best = th; bestHits = hits; }
  }
  return best;
}

const STOP = new Set(("a about above after again against all am an and any are aren't as at be because been before being below between both but by can can't cannot could did didn't do does doesn't doing don't down during each few for from further had hadn't has hasn't have haven't having he her here hers herself him himself his how i i'm i've if in into is isn't it it's its itself just let's me more most my myself no nor not now of off on once only or other ought our ours ourselves out over own same she should so some such than that that's the their theirs them themselves then there there's these they they're this those through to too under until up very was wasn't we we're were weren't what when where which while who whom why with won't would you your yours yourself also get got still even one two three will really please thanks thank hi hello told said tried trying need needed want wanted like going went back time times day days today yesterday since ago around via though without within every never always again able customer customers flight flights airline airlines american ticket tickets trip travel help app website site call called email agent agents someone nobody anyone anything nothing something question questions inquiry general feedback issue issues problem problems great love loved good nice easy smooth experience awesome amazing best worst terrible awful update help helpful thing things make made using used works work working fly flew way ways use new old yet per due etc let put set see saw say lot bit may non got get yes ask early late much many").split(" "));
const keep = (w) => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w);
// Terms plus two-word phrases, where a phrase is two kept words that sit side by side in the text.
function grams(text) {
  const toks = text.toLowerCase().replace(/[^a-z0-9\s'-]/g, " ").split(/\s+/).map((w) => w.replace(/^['-]+|['-]+$/g, ""));
  const g = new Set();
  toks.forEach((w, i) => { if (keep(w)) { g.add(w); if (keep(toks[i + 1] || "")) g.add(`${w} ${toks[i + 1]}`); } });
  return g;
}

// Clusters records no known theme caught, by the terms they share. Each new theme is one
// frequent term (or two-word phrase) that appears in enough records to matter. `all` is every
// text in the import: a term that is just as common in already-themed records ("seat") is
// generic, so it ranks below one concentrated in the leftovers ("legroom").
export function discoverThemes(texts, { all = texts, minCount = 6, minShare = 0.03, max = 5 } = {}) {
  const docs = texts.map(grams);
  const global = new Map();
  all.forEach((t) => grams(t).forEach((x) => global.set(x, (global.get(x) || 0) + 1)));
  const floor = Math.max(minCount, Math.ceil(texts.length * minShare));
  const found = [];
  const taken = new Set();
  for (let round = 0; round < max; round++) {
    const df = new Map();
    docs.forEach((g, i) => { if (!taken.has(i)) g.forEach((x) => df.set(x, (df.get(x) || 0) + 1)); });
    const score = ([term, n]) => n * (n / Math.max(n, global.get(term) || n)) * (term.includes(" ") ? 1.5 : 1);
    const cand = [...df.entries()].filter(([, n]) => n >= floor).sort((a, b) => score(b) - score(a));
    if (!cand.length) break;
    const [term] = cand[0];
    const members = docs.map((g, i) => (!taken.has(i) && g.has(term) ? i : -1)).filter((i) => i >= 0);
    members.forEach((i) => taken.add(i));
    found.push({ term, members });
  }
  return found;
}

/* ---------- numbers ---------- */

export function toIso(v) {
  if (!v) return null;
  const n = Number(v);
  const t = /^\d{10}$/.test(v) ? n * 1000 : /^\d{13}$/.test(v) ? n : Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

// Counts per week for the 8 weeks ending at `end`.
export function weeklyTrend(isoDates, end = Date.now(), weeks = 8) {
  const out = Array(weeks).fill(0);
  for (const d of isoDates) {
    const age = Math.floor((end - Date.parse(d)) / (7 * DAY));
    if (age >= 0 && age < weeks) out[weeks - 1 - age]++;
  }
  return out;
}

// Exports are often months old. Anchor the trend window to "now" when the data is recent,
// otherwise to the newest record, so an older export still shows its real shape.
export function trendAnchor(isoDates) {
  const latest = Math.max(...isoDates.map((d) => Date.parse(d)).filter(Number.isFinite));
  if (!Number.isFinite(latest)) return Date.now();
  return Date.now() - latest < 14 * DAY ? Date.now() : latest + DAY;
}

/* ---------- the whole pipeline for one file ---------- */

// rows + mapping → records, each with a themeKey; plus any themes discovered on the way.
export function themeRows(rows, mapping, themes, { idPrefix, streamId, sourceId }) {
  const textOf = (r) => [mapping.title && r[mapping.title], r[mapping.text]].filter(Boolean).join(" — ").slice(0, 600);
  const now = new Date().toISOString();
  const recs = rows.map((r, i) => ({
    id: (mapping.id && r[mapping.id]) ? String(r[mapping.id]).slice(0, 24) : `${idPrefix}-${i + 1}`,
    created: toIso(mapping.date && r[mapping.date]) || now,
    text: textOf(r),
    raw: r,
  })).filter((r) => r.text.trim());
  for (const r of recs) { const th = classify(r.text, themes); r.themeKey = th?.key || null; }
  // Emerging themes come from problems: with a rating column, the top fifth of the scale
  // (NPS 9-10, 4-5 stars) is praise, so it stays out of discovery.
  const ratingOf = (r) => (mapping.rating ? Number(r.raw[mapping.rating]) : NaN);
  const maxRating = Math.max(...recs.map(ratingOf).filter(Number.isFinite), 0);
  const praise = (r) => maxRating > 0 && ratingOf(r) >= Math.ceil(maxRating * 0.8);
  const leftovers = recs.filter((r) => !r.themeKey && !praise(r));
  const found = discoverThemes(leftovers.map((r) => r.text), { all: recs.map((r) => r.text) });
  // Keys are by term, not by file, so the same emerging theme in two uploads lands on one signal.
  const newThemes = found.map(({ term, members }) => {
    const key = `new-${term.replace(/\s+/g, "-")}`;
    members.forEach((i) => { leftovers[i].themeKey = key; });
    return { key, label: `Emerging theme: “${term}”`, streamId, icon: "ti-sparkles", keywords: [term], discovered: true, sourceId };
  }).filter((t) => !themes.some((x) => x.key === t.key));
  return { records: recs, newThemes, unthemed: recs.filter((r) => !r.themeKey).length };
}
