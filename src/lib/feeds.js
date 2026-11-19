// Live public sources the browser can call directly: no API key, CORS enabled.
// Each feed returns items shaped like the pack's webItems (minus sourceId). An item may preset
// its themeKey (weather does); otherwise the signals agent themes it from `text`.
const DAY = 86400000;
const isoDay = (t) => new Date(t).toISOString().slice(0, 10);

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", mdash: "—", ndash: "–" };
export const decode = (s = "") => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) =>
  e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENT[e.toLowerCase()] ?? m);
export const stripHtml = (s = "") => decode(s.replace(/<br\s*\/?>|<\/p>/gi, " ").replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();

async function getJson(url, label) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${label} returned ${res.status}`);
  return res.json();
}

/* ---------- hub weather ---------- */
export const AIRPORTS = {
  DFW: [32.8998, -97.0403], CLT: [35.2144, -80.9473], ORD: [41.9742, -87.9073], MIA: [25.7959, -80.287], PHX: [33.4342, -112.0116],
  PHL: [39.8744, -75.2424], DCA: [38.8512, -77.0402], LAX: [33.9416, -118.4085], JFK: [40.6413, -73.7781], LGA: [40.7769, -73.874],
  BOS: [42.3656, -71.0096], ATL: [33.6407, -84.4277], DEN: [39.8561, -104.6737], SEA: [47.4502, -122.3088], SFO: [37.6213, -122.379],
  IAH: [29.9902, -95.3368], AUS: [30.1975, -97.6664], LAS: [36.084, -115.1537], MCO: [28.4312, -81.3081], SAN: [32.7338, -117.1933],
};
// WMO weather codes → what it means for operations.
function wxRisk(code, gust, snow) {
  if ([95, 96, 99].includes(code)) return ["high", "thunderstorms"];
  if ([71, 73, 75, 77, 85, 86].includes(code) || snow >= 2) return ["high", "snow"];
  if ([56, 57, 66, 67].includes(code)) return ["high", "freezing rain"];
  if ([65, 82].includes(code)) return ["high", "heavy rain"];
  if (gust >= 65) return ["high", "high winds"];
  if ([45, 48].includes(code)) return ["moderate", "fog"];
  if ([63, 81].includes(code)) return ["moderate", "rain"];
  if (gust >= 50) return ["moderate", "gusty winds"];
  return null;
}

export const FEEDS = {
  fedreg: {
    label: "Federal Register", name: "DOT rulemaking · Federal Register", icon: "ti-gavel", tag: "Regulatory signal", agentId: "agt-market",
    unit: "documents", field: "Search terms", defaults: { terms: "airline passengers", agency: "transportation-department", days: 365 },
    help: "Rules, proposed rules and notices from the Federal Register API (federalregister.gov), limited to the Department of Transportation, last 12 months.",
    async fetch({ terms, agency, days = 365 }) {
      const p = new URLSearchParams({ per_page: "100", order: "newest" });
      if (terms) p.set("conditions[term]", terms);
      if (agency) p.append("conditions[agencies][]", agency);
      p.set("conditions[publication_date][gte]", isoDay(Date.now() - days * DAY));
      for (const f of ["document_number", "title", "abstract", "publication_date", "html_url", "type"]) p.append("fields[]", f);
      const j = await getJson(`https://www.federalregister.gov/api/v1/documents.json?${p}`, "Federal Register");
      return (j.results || []).map((r) => ({
        id: `FR-${r.document_number}`, created: new Date(`${r.publication_date}T12:00:00Z`).toISOString(),
        source: `Federal Register · ${r.type}`, title: r.title, text: `${r.title}. ${r.abstract || ""}`, url: r.html_url,
      }));
    },
  },
  hn: {
    label: "Hacker News search", name: "Airline news · Hacker News", icon: "ti-news", tag: "Market research", agentId: "agt-market",
    unit: "stories", field: "Search terms", defaults: { terms: "airline", days: 56 },
    help: "Recent news stories matching your terms, from the Hacker News search API (hn.algolia.com), last 8 weeks.",
    async fetch({ terms, days = 56 }) {
      const since = Math.floor((Date.now() - days * DAY) / 1000);
      const p = new URLSearchParams({ query: terms || "airline", tags: "story", hitsPerPage: "100", numericFilters: `created_at_i>${since}` });
      const j = await getJson(`https://hn.algolia.com/api/v1/search_by_date?${p}`, "Hacker News search");
      return (j.hits || []).filter((h) => h.title).map((h) => ({
        id: `HN-${h.objectID}`, created: h.created_at, source: `Hacker News · ${h.points ?? 0} pts`,
        title: h.title, text: `${h.title} ${stripHtml(h.story_text || "")}`.slice(0, 600), url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
      }));
    },
  },
  weather: {
    label: "Open-Meteo forecast", name: "Hub weather risk · next 7 days", icon: "ti-cloud-storm", kind: "api", tag: "Operational events", agentId: "agt-ingest",
    unit: "hub-days", field: "Hub airports (IATA codes)", defaults: { terms: "DFW, CLT, ORD, MIA, PHX, PHL, DCA, LAX, JFK, LGA" },
    help: `7-day forecasts for each hub from Open-Meteo (open-meteo.com). Each hub-day with thunderstorms, snow, freezing rain, heavy rain, fog or strong gusts becomes a record. Known codes: ${Object.keys(AIRPORTS).join(", ")}.`,
    async fetch({ terms }) {
      const codes = (terms || "").toUpperCase().split(/[^A-Z]+/).filter((c) => AIRPORTS[c]);
      if (!codes.length) throw new Error("no known airport codes in the list");
      const p = new URLSearchParams({
        latitude: codes.map((c) => AIRPORTS[c][0]).join(","), longitude: codes.map((c) => AIRPORTS[c][1]).join(","),
        daily: "weather_code,wind_gusts_10m_max,precipitation_sum,snowfall_sum", timezone: "auto", forecast_days: "7",
      });
      let j = await getJson(`https://api.open-meteo.com/v1/forecast?${p}`, "Open-Meteo");
      if (!Array.isArray(j)) j = [j];
      const fetched = new Date().toISOString();
      const out = [];
      j.forEach((loc, i) => {
        const d = loc.daily || {};
        (d.time || []).forEach((day, k) => {
          const risk = wxRisk(d.weather_code?.[k], d.wind_gusts_10m_max?.[k] ?? 0, d.snowfall_sum?.[k] ?? 0);
          if (!risk) return;
          const label = new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
          out.push({
            id: `WX-${codes[i]}-${day}`, created: fetched, themeKey: "weather", source: `Open-Meteo · ${risk[0]} risk`,
            title: `${codes[i]} · ${label}: ${risk[1]} (gusts ${Math.round(d.wind_gusts_10m_max?.[k] ?? 0)} km/h, ${d.precipitation_sum?.[k] ?? 0} mm)`,
            text: `${codes[i]} ${risk[1]}`, url: `https://open-meteo.com/en/docs?latitude=${AIRPORTS[codes[i]][0]}&longitude=${AIRPORTS[codes[i]][1]}`,
          });
        });
      });
      return out;
    },
  },
  stackexchange: {
    label: "Travel Stack Exchange", name: "Traveler questions · Travel Stack Exchange", icon: "ti-help-hexagon", tag: "Voice of customer", agentId: "agt-voc",
    unit: "questions", field: "Search terms", defaults: { terms: "american airlines", days: 365 },
    help: "Questions travelers ask on travel.stackexchange.com, from the Stack Exchange API, last 12 months. Each one is themed like a support ticket.",
    async fetch({ terms, days = 365 }) {
      const p = new URLSearchParams({ order: "desc", sort: "creation", site: "travel", pagesize: "100", q: terms || "airline", fromdate: String(Math.floor((Date.now() - days * DAY) / 1000)) });
      const j = await getJson(`https://api.stackexchange.com/2.3/search/advanced?${p}`, "Stack Exchange");
      return (j.items || []).map((q) => ({
        id: `SE-${q.question_id}`, created: new Date(q.creation_date * 1000).toISOString(), source: `Travel SE · ${q.answer_count} answers`,
        title: decode(q.title), text: `${decode(q.title)} ${(q.tags || []).join(" ")}`, url: q.link,
      }));
    },
  },
  mastodon: {
    label: "Mastodon hashtags", name: "Social posts · Mastodon", icon: "ti-brand-mastodon", tag: "Voice of customer", agentId: "agt-voc",
    unit: "posts", field: "Hashtags (comma-separated)", defaults: { terms: "americanairlines, airline, flying" },
    help: "Public posts under each hashtag on mastodon.social (latest 80 per tag). Read-only, never replies.",
    async fetch({ terms }) {
      const tags = (terms || "").split(/[,\s]+/).map((t) => t.replace(/^#/, "").toLowerCase()).filter(Boolean).slice(0, 5);
      if (!tags.length) throw new Error("add at least one hashtag");
      const seen = new Map();
      for (const tag of tags) {
        let maxId = "";
        for (let page = 0; page < 2; page++) {
          const posts = await getJson(`https://mastodon.social/api/v1/timelines/tag/${encodeURIComponent(tag)}?limit=40${maxId ? `&max_id=${maxId}` : ""}`, "Mastodon");
          for (const s of posts) {
            const body = stripHtml(s.content);
            if (body && !seen.has(s.id)) seen.set(s.id, { id: `MA-${s.id}`, created: s.created_at, source: `Mastodon · @${s.account?.acct || "unknown"}`, title: body.slice(0, 220), text: body.slice(0, 600), url: s.url });
          }
          if (posts.length < 40) break;
          maxId = posts[posts.length - 1].id;
        }
      }
      return [...seen.values()];
    },
  },
};

/* ---------- Google Sheets and any CSV/JSON URL ---------- */
// A normal Sheets link (shared "anyone with the link") becomes its CSV endpoint.
export function toFetchUrl(url) {
  const m = url.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/);
  if (m && !/\/d\/e\//.test(url)) {
    const gid = url.match(/[#&?]gid=(\d+)/)?.[1] || "0";
    return `https://docs.google.com/spreadsheets/d/${m[1]}/gviz/tq?tqx=out:csv&gid=${gid}`;
  }
  if (/docs\.google\.com\/spreadsheets\/d\/e\//.test(url) && !/output=csv/.test(url)) return url.replace(/\/pub(html)?.*$/, "/pub?output=csv");
  return url;
}
export async function fetchText(url) {
  let res;
  try { res = await fetch(toFetchUrl(url)); } catch { throw new Error("the browser couldn't reach it. The site may not allow cross-site reads; for a Google Sheet, set sharing to “Anyone with the link”"); }
  if (!res.ok) throw new Error(`it returned ${res.status}${res.status === 401 || res.status === 403 ? " (is it shared publicly?)" : ""}`);
  const text = await res.text();
  if (/^\s*<!doctype html|^\s*<html/i.test(text)) throw new Error("it returned a web page, not CSV or JSON. For a Google Sheet, set sharing to “Anyone with the link”");
  return text;
}
