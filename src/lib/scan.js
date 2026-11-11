// Governance scan for prototype HTML. Each gate carries simple, readable checks:
//   forbid       – fail if the pattern appears
//   require      – fail if the pattern is missing (optionally only when `when` appears)
//   aria-buttons – fail if any button has no aria-label
// V1 runs these in the browser; in V3 the governance agent adds a model read of the policy text.
export function scanHtml(html, gates) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const text = doc.body?.textContent || "";
  const results = [];
  for (const g of gates) {
    for (const c of g.checks || []) {
      let failed = false;
      let detail = "";
      if (c.type === "forbid") {
        const m = new RegExp(c.pattern, "i").exec(html);
        failed = !!m;
        if (m) {
          // Quote the match with a little context, tags removed, cut at word edges.
          const clean = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
          const mm = new RegExp(c.pattern, "i").exec(clean) || { index: 0, 0: m[0] };
          const words = clean.slice(Math.max(0, mm.index - 40), mm.index + mm[0].length + 40).split(" ");
          detail = `Found “…${words.slice(1, -1).join(" ").trim()}…”`;
        }
      } else if (c.type === "require") {
        const applies = !c.when || new RegExp(c.when, "i").test(text);
        failed = applies && !new RegExp(c.pattern, "i").test(text);
        if (failed) detail = "Prices are shown without taxes or fees";
      } else if (c.type === "aria-buttons") {
        const btns = [...doc.querySelectorAll("button, [role=button]")];
        const missing = btns.filter((b) => !b.getAttribute("aria-label"));
        failed = missing.length > 0;
        detail = btns.length ? `${btns.length - missing.length} of ${btns.length} buttons have accessible labels` : "No buttons found";
      }
      results.push({ gateId: g.id, gateName: g.name, checkId: c.id, label: c.label, outcome: failed ? c.outcome : "pass", detail });
    }
  }
  return results;
}

export const worst = (results) =>
  results.some((r) => r.outcome === "block") ? "block" : results.some((r) => r.outcome === "flag") ? "flag" : "pass";
