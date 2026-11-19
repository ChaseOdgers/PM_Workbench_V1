// A tiny mock enterprise API: serves mock-api/static/v1 like a set of real systems.
// No dependencies. Adds what the static snapshot can't: filters, paging, an API key and latency.
//   node mock-api/server.mjs            → http://localhost:4010/v1/index.json
//   PORT=5000 MOCK_API_KEY=secret LATENCY_MS=300 node mock-api/server.mjs
// Endpoints: GET /v1/<system>/<resource>[.json]?since=ISO&limit=N&offset=N
// In the Workbench: Context & agents → Enterprise mock API → base URL http://localhost:4010
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "static");
const PORT = Number(process.env.PORT || 4010);
const KEY = process.env.MOCK_API_KEY || "";
const LATENCY = Number(process.env.LATENCY_MS || 150);
const DATE_FIELDS = ["CreatedDate", "startedAt", "surveyDate", "updated", "createdAt", "scheduledDeparture"];

createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "x-api-key, content-type", "content-type": "application/json" };
  if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
  const send = (code, body) => setTimeout(() => { res.writeHead(code, cors); res.end(JSON.stringify(body)); }, LATENCY);
  if (KEY && req.headers["x-api-key"] !== KEY) return send(401, { error: "invalid or missing x-api-key" });
  const rel = normalize(url.pathname.replace(/\/+$/, "")).replace(/^(\.\.[/\\])+/, "");
  const file = join(root, rel.endsWith(".json") ? rel : `${rel}.json`);
  if (!file.startsWith(root) || !existsSync(file)) return send(404, { error: `no such endpoint: ${url.pathname}` });
  const data = JSON.parse(readFileSync(file, "utf8"));
  const key = Object.keys(data).find((k) => Array.isArray(data[k]) && data[k].length && typeof data[k][0] === "object" && !("weeks" in data[k][0]));
  if (key) {
    let rows = data[key];
    const since = url.searchParams.get("since");
    if (since) rows = rows.filter((r) => { const f = DATE_FIELDS.find((x) => r[x]); return !f || r[f] >= since; });
    const offset = Number(url.searchParams.get("offset") || 0), limit = Number(url.searchParams.get("limit") || rows.length);
    data[key] = rows.slice(offset, offset + limit);
    data.paging = { total: rows.length, offset, limit, next: offset + limit < rows.length ? offset + limit : null };
  }
  console.log(`${req.method} ${url.pathname}${url.search} → ${key ? data[key].length : "ok"}`);
  send(200, data);
}).listen(PORT, () => console.log(`Mock enterprise API on http://localhost:${PORT}/v1/index.json${KEY ? " (x-api-key required)" : ""}`));
