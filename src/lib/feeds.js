// Live public feeds the browser can call directly: no API key, CORS enabled.
// Each returns web items in the pack's webItems shape (minus themeKey and sourceId).
const DAY = 86400000;
const isoDay = (t) => new Date(t).toISOString().slice(0, 10);

export const FEEDS = {
  fedreg: {
    label: "Federal Register",
    unit: "documents",
    defaults: { terms: "airline passengers", agency: "transportation-department", days: 365 },
    help: "Rules, proposed rules and notices from the Federal Register API (federalregister.gov). Free, no key.",
    async fetch({ terms, agency, days = 365 }) {
      const p = new URLSearchParams({ per_page: "100", order: "newest" });
      if (terms) p.set("conditions[term]", terms);
      if (agency) p.append("conditions[agencies][]", agency);
      p.set("conditions[publication_date][gte]", isoDay(Date.now() - days * DAY));
      for (const f of ["document_number", "title", "abstract", "publication_date", "html_url", "type"]) p.append("fields[]", f);
      const res = await fetch(`https://www.federalregister.gov/api/v1/documents.json?${p}`);
      if (!res.ok) throw new Error(`Federal Register returned ${res.status}`);
      const j = await res.json();
      return (j.results || []).map((r) => ({
        id: `FR-${r.document_number}`, created: new Date(`${r.publication_date}T12:00:00Z`).toISOString(),
        source: `Federal Register · ${r.type}`, title: r.title, text: `${r.title}. ${r.abstract || ""}`, url: r.html_url,
      }));
    },
  },
  hn: {
    label: "Hacker News search",
    unit: "stories",
    defaults: { terms: "airline", days: 56 },
    help: "Recent news stories matching your terms, from the Hacker News search API (hn.algolia.com). Free, no key.",
    async fetch({ terms, days = 56 }) {
      const since = Math.floor((Date.now() - days * DAY) / 1000);
      const p = new URLSearchParams({ query: terms || "airline", tags: "story", hitsPerPage: "100", numericFilters: `created_at_i>${since}` });
      const res = await fetch(`https://hn.algolia.com/api/v1/search_by_date?${p}`);
      if (!res.ok) throw new Error(`Hacker News search returned ${res.status}`);
      const j = await res.json();
      return (j.hits || []).filter((h) => h.title).map((h) => ({
        id: `HN-${h.objectID}`, created: h.created_at, source: `Hacker News · ${h.points ?? 0} pts`,
        title: h.title, text: `${h.title} ${h.story_text || ""}`.slice(0, 600), url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
      }));
    },
  },
};
