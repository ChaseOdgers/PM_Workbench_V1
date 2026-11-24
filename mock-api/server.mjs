// A tiny mock enterprise API: serves mock-api/static/v1 like a set of real systems.
// No dependencies. Adds what the static snapshot can't: filters, paging, an API key, latency,
// and live data for demos (new records arrive while the Workbench's agents are watching).
//   npm run mock-api                     → http://localhost:4010/v1/index.json
//   PORT=5000 MOCK_API_KEY=secret LATENCY_MS=300 node mock-api/server.mjs
//   MOCK_DRIP=1 npm run mock-api          → 1-3 new Salesforce cases on a random theme every 20 s
//
// Data endpoints: GET /v1/<system>/<resource>[.json]?since=ISO&limit=N&offset=N
// Demo controls (no key needed):
//   GET /v1/_demo/surge?theme=pets&n=25&endpoint=salesforce/cases   add n new records now
//   GET /v1/_demo/themes                                              themes you can surge
//   GET /v1/_demo/reset                                               back to the files on disk
// Or from a terminal: npm run surge -- wifi 30
import { createServer } from "node:http";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { SAY, BUILD, filler } from "./stories.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "static");
const PORT = Number(process.env.PORT || 4010);
const KEY = process.env.MOCK_API_KEY || "";
const LATENCY = Number(process.env.LATENCY_MS || 150);
const DRIP = process.env.MOCK_DRIP || "";
const DRIP_SEC = Number(process.env.DRIP_SEC || 20);
const DATE_FIELDS = ["CreatedDate", "startedAt", "surveyDate", "updated", "createdAt", "scheduledDeparture"];

// Everything is held in memory so surges and drips change what the next request returns.
let store = new Map();
let added = 0;
function load() {
  store = new Map();
  const walk = (dir) => readdirSync(dir).forEach((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return walk(p);
    if (f.endsWith(".json")) store.set("/" + relative(root, p).split(sep).join("/").replace(/\.json$/, ""), JSON.parse(readFileSync(p, "utf8")));
  });
  walk(root);
  added = 0;
}
load();

function surge(endpoint, theme, n) {
  const b = BUILD[endpoint];
  const data = store.get(`/v1/${endpoint}`);
  if (!b || !data) throw new Error(`can't add records to ${endpoint}; try one of ${Object.keys(BUILD).join(", ")}`);
  if (!SAY[theme]) throw new Error(`unknown theme ${theme}; try one of ${Object.keys(SAY).join(", ")}`);
  const { pick, fill } = filler();
  const list = b.list(data);
  for (let i = 0; i < n; i++) {
    const at = new Date(Date.now() - Math.floor(Math.random() * 36 * 3600000)).toISOString();
    list.unshift(b.make(theme, fill(pick(SAY[theme])), at, ++added, pick));
  }
  b.after?.(data);
  const idx = store.get("/v1/index");
  if (idx?.endpoints) idx.endpoints[endpoint] = list.length;
  return { endpoint, theme, added: n, total: list.length };
}

if (DRIP) setInterval(() => {
  const themes = Object.keys(SAY);
  const r = surge("salesforce/cases", DRIP === "1" ? themes[Math.floor(Math.random() * themes.length)] : DRIP, 1 + Math.floor(Math.random() * 3));
  console.log(`drip: +${r.added} ${r.theme} cases (${r.total} total)`);
}, DRIP_SEC * 1000);

createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "x-api-key, content-type", "content-type": "application/json", "cache-control": "no-store" };
  if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
  const send = (code, body, wait = LATENCY) => setTimeout(() => { res.writeHead(code, cors); res.end(JSON.stringify(body)); }, wait);
  const path = url.pathname.replace(/\/+$/, "").replace(/\.json$/, "");

  if (path.startsWith("/v1/_demo/")) {
    try {
      if (path === "/v1/_demo/themes") return send(200, { themes: Object.keys(SAY), endpoints: Object.keys(BUILD) }, 0);
      if (path === "/v1/_demo/reset") { load(); console.log("reset: data reloaded from disk"); return send(200, { reset: true }, 0); }
      if (path === "/v1/_demo/surge") {
        const r = surge(url.searchParams.get("endpoint") || "salesforce/cases", url.searchParams.get("theme") || "pets", Math.min(500, Number(url.searchParams.get("n") || 25)));
        console.log(`surge: +${r.added} ${r.theme} records in ${r.endpoint} (${r.total} total)`);
        return send(200, r, 0);
      }
    } catch (e) { return send(400, { error: e.message }, 0); }
    return send(404, { error: "unknown demo control" }, 0);
  }

  if (KEY && req.headers["x-api-key"] !== KEY) return send(401, { error: "invalid or missing x-api-key" });
  const stored = store.get(path);
  if (!stored) return send(404, { error: `no such endpoint: ${url.pathname}` });
  const data = structuredClone(stored);
  const key = Object.keys(data).find((k) => Array.isArray(data[k]) && data[k].length && typeof data[k][0] === "object" && !("weeks" in data[k][0]));
  if (key) {
    let rows = data[key];
    const since = url.searchParams.get("since");
    if (since) rows = rows.filter((r) => { const f = DATE_FIELDS.find((x) => r[x]); return !f || r[f] >= since; });
    const offset = Number(url.searchParams.get("offset") || 0), limit = Number(url.searchParams.get("limit") || rows.length);
    data[key] = rows.slice(offset, offset + limit);
    data.paging = { ...(data.paging || {}), total: rows.length, offset, limit, next: offset + limit < rows.length ? offset + limit : null };
  }
  console.log(`${req.method} ${url.pathname}${url.search} → ${key ? data[key].length : "ok"}`);
  send(200, data);
}).listen(PORT, () => console.log(`Mock enterprise API on http://localhost:${PORT}/v1/index.json${KEY ? " (x-api-key required)" : ""}${DRIP ? ` · drip every ${DRIP_SEC}s` : ""}\nDemo: npm run surge -- pets 25   (or open http://localhost:${PORT}/v1/_demo/surge?theme=pets&n=25)`));
