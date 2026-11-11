// Prototype studio engine (design call #5).
// V1 is scripted: a version = a set of options rendered by a template, so every version is
// reproducible and the governance scan has real HTML to read. In M3 a live model call replaces
// applyInstruction() for free-form edits; the version/scan/approve loop stays the same.

const esc = (s = "") => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

export const DEFAULT_OPTIONS = { altPosition: "bottom", feeBreakdown: false, ariaLabels: false, largeText: false, dark: false, notes: [] };

// Turn a chat message or a feedback note into new options.
// Returns { options, reply, refused } — refused = a governance block the agent will not do.
export function applyInstruction(options, text) {
  const t = text.toLowerCase();
  const o = { ...DEFAULT_OPTIONS, ...options, notes: [...(options.notes || [])] };
  if (/auto[- ]?book|skip (the )?confirm|without (asking|confirm|consent)|book (it )?automatically/.test(t)) {
    return {
      options: null,
      refused: { gateId: "gate-dot", text: `Edit asked to "${text.slice(0, 80)}"` },
      reply: "I can't do that one. Booking or changing a fare without the customer's explicit consent breaches the DOT Fare Advertising & Consumer Rule, so the DOT gate would block it before launch. I kept the confirmation step and logged the attempt.",
    };
  }
  const done = [];
  if (/above the fold|at the top|first thing|inline|move .*up|higher/.test(t)) { o.altPosition = "top"; done.push("moved the options above the fold"); }
  if (/below|at the bottom|move .*down/.test(t)) { o.altPosition = "bottom"; done.push("moved the options lower on the page"); }
  if (/fee|tax|all-in|total price|full price/.test(t)) { o.feeBreakdown = true; done.push("added the all-in price with taxes and fees"); }
  if (/access|aria|screen reader|a11y|label/.test(t)) { o.ariaLabels = true; done.push("added accessible labels to every control"); }
  if (/bigger|larger|font|text size|readab/.test(t)) { o.largeText = true; done.push("increased the text size"); }
  if (/dark/.test(t)) { o.dark = true; done.push("switched to a dark theme"); }
  if (/light/.test(t)) { o.dark = false; done.push("switched to a light theme"); }
  if (!done.length) {
    o.notes.push(text.trim());
    return { options: o, reply: `I added "${text.trim()}" to the revision notes on the screen. The V1 agent is scripted: it applies layout, pricing, accessibility and theme changes directly, and pins anything else as a note for the next live-model version.` };
  }
  return { options: o, reply: `Done: I ${done.join(", ")}.` };
}

function altOffersBody(opp, o, a) {
  const alts = [
    { t: "7:45 PM · Nonstop", d: "Same day · 2h 55m", p: 289, f: 41 },
    { t: "Tomorrow 6:10 AM · Nonstop", d: "+1 day · 2h 50m", p: 244, f: 37 },
    { t: "5:20 PM · 1 stop CLT", d: "Same day · 4h 40m", p: 231, f: 36 },
  ];
  const price = (x) => (o.feeBreakdown ? `$${x.p + x.f} <small>incl. $${x.f} taxes &amp; fees</small>` : `$${x.p}`);
  const offers = `
    <section class="panel">
      <h2>This fare just sold out. Here are your best options</h2>
      ${alts.map((x, i) => `
        <div class="offer">
          <div><b>${x.t}</b><div class="muted">${x.d} · Main Cabin</div></div>
          <div class="price">${price(x)}</div>
          <button${a(`Choose ${x.t}`)}>Choose</button>
        </div>`).join("")}
      <p class="muted">Nothing is booked until you review the fare and confirm.</p>
    </section>`;
  const search = `
    <section class="panel">
      <div class="row"><div><b>DFW → LGA</b> · Fri, Nov 20 · 1 adult</div><button class="ghost"${a("Edit search")}>Edit search</button></div>
      <div class="offer soldout"><div><b>4:05 PM · Nonstop</b><div class="muted">Main Cabin</div></div><div class="price">Sold out</div></div>
      <div class="offer soldout"><div><b>4:05 PM · Nonstop</b><div class="muted">Main Cabin Extra</div></div><div class="price">Last seat taken</div></div>
    </section>`;
  return o.altPosition === "top" ? offers + search : search + offers;
}

function genericBody(opp, o, a) {
  const sentences = opp.desc.split(/(?<=\.)\s+/).filter(Boolean).slice(0, 3);
  const cards = `
    <section class="panel">
      <h2>How it works</h2>
      ${sentences.map((s, i) => `<div class="offer"><div><b>Step ${i + 1}</b><div class="muted">${esc(s)}</div></div><button${a(`Open step ${i + 1}`)}>Open</button></div>`).join("")}
    </section>`;
  const hero = `<section class="panel"><div class="row"><div><b>${esc(opp.title)}</b><div class="muted">Concept screen generated from ${esc(opp.id)}</div></div><button${a("Get started")}>Get started</button></div></section>`;
  return o.altPosition === "top" ? cards + hero : hero + cards;
}

export function renderPrototype(opp, options, ws) {
  const o = { ...DEFAULT_OPTIONS, ...options };
  const b = ws.brand;
  const a = (label) => (o.ariaLabels ? ` aria-label="${esc(label)}"` : "");
  const body = opp.template === "alt-offers" ? altOffersBody(opp, o, a) : genericBody(opp, o, a);
  const bg = o.dark ? "#0E1622" : "#F3F5F8", fg = o.dark ? "#E8EEF5" : "#12233A", panel = o.dark ? "#172334" : "#fff", line = o.dark ? "#2A3A50" : "#E2E7EC";
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(opp.title)} · prototype</title>
<style>
body{margin:0;font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:${bg};color:${fg};font-size:${o.largeText ? 18 : 15}px}
header{background:${b.sidebar};color:#fff;padding:14px 22px;display:flex;align-items:center;gap:12px}
header .logo{background:${b.accent};border-radius:6px;padding:4px 8px;font-weight:800}
main{max-width:720px;margin:22px auto;padding:0 16px;display:flex;flex-direction:column;gap:16px}
.panel{background:${panel};border:1px solid ${line};border-radius:12px;padding:16px 18px}
h2{font-size:1.05em;margin:0 0 12px}
.row,.offer{display:flex;align-items:center;gap:14px;justify-content:space-between}
.offer{padding:12px 0;border-top:1px solid ${line}}
.offer:first-of-type{border-top:none}
.offer.soldout{opacity:.55}
.price{margin-left:auto;font-weight:800;text-align:right}
.price small{display:block;font-weight:500;font-size:.72em;opacity:.7}
.muted{opacity:.65;font-size:.88em;margin-top:2px}
button{background:${b.accent};color:#fff;border:none;border-radius:8px;padding:9px 16px;font-weight:700;font-size:.9em;cursor:pointer}
button.ghost{background:transparent;color:${b.accent};border:1px solid ${b.accent}}
.notes{border-style:dashed}
.notes li{margin:4px 0}
</style></head><body>
<header><span class="logo">${esc(ws.clientShort)}</span><span>${esc(opp.title)}</span></header>
<main>
${body}
${o.notes.length ? `<section class="panel notes"><h2>Revision notes</h2><ul>${o.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul></section>` : ""}
</main></body></html>`;
}
