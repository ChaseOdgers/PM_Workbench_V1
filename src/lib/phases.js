// Phase checklists: what has to be true before an opportunity moves to the next phase.
// The org sets a default; each value stream (team) can inherit it or run its own. A checklist
// item is an automatic check the Workbench evaluates, or an attestation a person ticks off.
// Required items block the move; recommended items only warn. Directors can override a block
// with a reason when the rules allow it, and every move records a snapshot of its checklist.
import { goalMatch } from "./ranking";

export const TRANSITIONS = [
  { key: "Sense>Shape", from: "Sense", to: "Shape", label: "Sense → Shape", hint: "Is the problem real and worth shaping?" },
  { key: "Shape>Prototype", from: "Shape", to: "Prototype", label: "Shape → Prototype", hint: "Is it worth building something to test?" },
  { key: "Prototype>Handoff", from: "Prototype", to: "Handoff", label: "Prototype → Handoff", hint: "Is it ready for engineering?" },
];
export const transitionFrom = (phase) => TRANSITIONS.find((t) => t.from === phase) || null;

const words = (s = "") => s.trim().split(/\s+/).filter(Boolean).length;

// Automatic checks. `n` is the item's threshold where the check takes one.
export const CHECKS = {
  signals: { label: (n) => `At least ${n} linked signal${n === 1 ? "" : "s"}`, n: 1, test: (c, n) => [c.o.signalIds.length >= n, `${c.o.signalIds.length} linked`] },
  evidence: { label: (n) => `At least ${n} piece${n === 1 ? "" : "s"} of evidence attached`, n: 1, test: (c, n) => [c.o.evidence.length >= n, `${c.o.evidence.length} attached`] },
  problem: { label: (n) => `Problem statement written (${n}+ words)`, n: 20, test: (c, n) => [words(c.o.desc) >= n, `${words(c.o.desc)} words`] },
  goalFit: { label: () => "Fits a value-stream goal", test: (c) => { const m = goalMatch(`${c.o.title} ${c.o.desc}`, c.stream?.goals || []); return [!!m, m ? `“${m.goal.text}”` : "no goal matched"]; } },
  owner: { label: () => "Owner assigned", test: (c) => [!!c.o.owner, ""] },
  proto: { label: () => "A prototype exists", test: (c) => [!!c.proto?.versions?.length, ""] },
  protoApproved: { label: () => "A prototype version is approved", test: (c) => [!!c.proto?.approvedVersion, c.proto?.approvedVersion ? `v${c.proto.approvedVersion}` : ""] },
  gatesCleared: { label: () => "Blocking governance gates approved", test: (c) => { const b = c.trig.filter((t) => t.gate.action === "block"); const okN = b.filter((t) => c.o.gateReviews[t.gate.id]?.status === "approved").length; return [okN === b.length, b.length ? `${okN} of ${b.length}` : "none triggered"]; } },
  gatesReviewed: { label: () => "Flag-only gates reviewed", test: (c) => { const f = c.trig.filter((t) => t.gate.action === "flag"); const okN = f.filter((t) => c.o.gateReviews[t.gate.id]?.status === "approved").length; return [okN === f.length, f.length ? `${okN} of ${f.length}` : "none triggered"]; } },
  noRejected: { label: () => "No gate is rejected", test: (c) => { const r = c.trig.filter((t) => c.o.gateReviews[t.gate.id]?.status === "rejected").length; return [r === 0, r ? `${r} rejected` : ""]; } },
  director: { label: () => "Director approval", test: (c) => [c.o.directorApproval?.status === "approved", c.o.directorApproval?.status === "rejected" ? "sent back" : ""] },
  delivery: { label: () => "Delivery pack saved (stories, AC, tests)", test: (c) => [!!c.o.delivery, c.o.delivery ? `${c.o.delivery.stories.length} stories` : "not drafted"] },
  deliveryAC: { label: () => "Every story has acceptance criteria", test: (c) => { const s = c.o.delivery?.stories || []; const miss = s.filter((x) => !x.ac.some((a) => a.then?.trim())).length; return [s.length > 0 && miss === 0, s.length ? (miss ? `${miss} without AC` : "") : "no pack yet"]; } },
  records: { label: (n) => `At least ${n} customer records behind the signals`, n: 25, data: true, test: (c, n) => [(c.data?.records || 0) >= n, `${c.data?.records || 0} records`] },
  systems: { label: (n) => `Confirmed by ${n}+ source systems`, n: 2, data: true, test: (c, n) => [(c.data?.systems || 0) >= n, `${c.data?.systems || 0} systems`] },
  fresh: { label: (n) => `Data refreshed in the last ${n} day${n === 1 ? "" : "s"}`, n: 7, data: true, test: (c, n) => { const t = c.data?.lastSync; const days = t ? (Date.now() - Date.parse(t)) / 86400000 : Infinity; return [days <= n, t ? `synced ${days < 1 ? "today" : `${Math.round(days)}d ago`}` : "never synced"]; } },
  growing: { label: (n) => `A linked signal is growing ${n}%+ over 8 weeks`, n: 20, data: true, test: (c, n) => [Math.round((c.data?.growth || 0) * 100) >= n, `fastest +${Math.round((c.data?.growth || 0) * 100)}%`] },
  deliveryTests: { label: () => "Every Must story has a test scenario", test: (c) => { const p = c.o.delivery; if (!p) return [false, "no pack yet"]; const miss = p.stories.filter((s) => s.priority === "Must" && !p.scenarios.some((t) => t.include && t.storyId === s.id)).length; return [miss === 0, miss ? `${miss} untested` : ""]; } },
};
export const WHO = { anyone: "Anyone on the team", pm: "Product manager", director: "Director", reviewer: "Reviewer" };

const auto = (check, level, n) => ({ check, level, ...(n != null ? { n } : {}) });
const manual = (label, level, who) => ({ check: "manual", label, level, who });
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
// Stable ids, so a ticked-off attestation still matches its item after a reload or a re-save.
export const itemId = (tk, it) => `${tk}:${it.check === "manual" ? `m-${slug(it.label)}` : it.check}${it.when && it.when !== "always" ? `@${it.when}` : ""}`;
const withIds = (transitions) => Object.fromEntries(Object.entries(transitions).map(([tk, list]) => [tk, list.map((it) => ({ id: itemId(tk, it), ...it }))]));

// `when` makes an item conditional: "gate:<id>" (that governance gate triggered), "origin:human"
// (a person created the idea) or "origin:agent" (the signals agent drafted it).
export const PRESETS = {
  fast: { label: "Fast lane", blurb: "Ideas move quickly. Only governance is mandatory; everything else is a nudge.", allowOverride: true, targets: { "Sense>Shape": 7, "Shape>Prototype": 10, "Prototype>Handoff": 14 }, transitions: {
    "Sense>Shape": [auto("signals", "recommended", 1)],
    "Shape>Prototype": [auto("problem", "recommended", 10), auto("records", "recommended", 10)],
    "Prototype>Handoff": [{ ...auto("gatesCleared", "required"), locked: true }, { ...auto("noRejected", "required"), locked: true }, auto("protoApproved", "recommended"), auto("delivery", "recommended")],
  } },
  balanced: { label: "Balanced", blurb: "Grounded in real data before shaping, approved before handoff. Light on ceremony.", allowOverride: true, targets: { "Sense>Shape": 14, "Shape>Prototype": 21, "Prototype>Handoff": 30 }, transitions: {
    "Sense>Shape": [auto("signals", "required", 1), auto("problem", "recommended", 20)],
    "Shape>Prototype": [auto("signals", "required", 1), auto("records", "recommended", 25), auto("systems", "recommended", 2), auto("goalFit", "recommended"), auto("evidence", "recommended", 1),
      { ...manual("Security architect consulted on payment data", "recommended", "reviewer"), when: "gate:gate-pci" }],
    "Prototype>Handoff": [auto("protoApproved", "required"), { ...auto("gatesCleared", "required"), locked: true }, auto("gatesReviewed", "recommended"), { ...auto("noRejected", "required"), locked: true }, auto("director", "required"), auto("delivery", "recommended")],
  } },
  strict: { label: "Strict (regulated)", blurb: "Every idea is validated with fresh data, presented and signed off. No overrides.", allowOverride: false, targets: { "Sense>Shape": 30, "Shape>Prototype": 45, "Prototype>Handoff": 60 }, transitions: {
    "Sense>Shape": [auto("signals", "required", 2), auto("records", "required", 50), auto("fresh", "required", 7), auto("problem", "required", 40), auto("owner", "required"), manual("Problem validated with customer data or research", "required", "pm"),
      { ...manual("Executive sponsor confirms the ask", "required", "director"), when: "origin:human" }],
    "Shape>Prototype": [auto("goalFit", "required"), auto("systems", "required", 3), auto("growing", "recommended", 20), auto("evidence", "required", 2), manual("Presented at the product review council", "required", "director"), manual("Engineering lead consulted on feasibility", "required", "pm")],
    "Prototype>Handoff": [auto("protoApproved", "required"), { ...auto("gatesCleared", "required"), locked: true }, auto("gatesReviewed", "required"), { ...auto("noRejected", "required"), locked: true }, auto("director", "required"), auto("delivery", "required"), auto("deliveryAC", "required"), auto("deliveryTests", "required"),
      { ...manual("Legal sign-off on customer-facing fare copy", "required", "reviewer"), when: "gate:gate-dot" }, { ...manual("Accessibility lead reviewed the prototype", "required", "reviewer"), when: "gate:gate-acaa" }],
  } },
};
export const WHEN = { always: "Always", "origin:human": "Only for ideas a person created", "origin:agent": "Only for agent-drafted ideas" };
export const presetRules = (key) => { const p = PRESETS[key]; return { preset: key, allowOverride: p.allowOverride, teamPolicy: "free", targets: { ...p.targets }, transitions: withIds(structuredClone(p.transitions)) }; };
// Seed files name a preset only; fill in its items.
export function hydrateRules(r) {
  if (!r) return r;
  const fill = (x) => (x && !x.inherit && !x.transitions ? { ...presetRules(x.preset || "balanced"), ...x, transitions: presetRules(x.preset || "balanced").transitions } : x);
  return { org: fill(r.org), streams: Object.fromEntries(Object.entries(r.streams || {}).map(([k, v]) => [k, fill(v)])) };
}

// Effective rules for a value stream: its own if customized, otherwise the org default.
// Org items marked locked (or every org item, when the org only lets teams tighten) always apply,
// and a team can't lower them from required to nice-to-have.
export function rulesFor(phaseRules, streamId) {
  const org = phaseRules.org;
  const own = phaseRules.streams?.[streamId];
  if (!own || own.inherit) return { ...org, scope: "org" };
  const tighten = org.teamPolicy === "tighten";
  const transitions = {};
  for (const t of TRANSITIONS) {
    const team = (own.transitions?.[t.key] || []).map((x) => ({ ...x }));
    for (const oi of (org.transitions?.[t.key] || []).filter((x) => x.locked || tighten)) {
      const mine = team.find((x) => x.id === oi.id);
      if (!mine) team.unshift({ ...oi, fromOrg: true });
      else { mine.fromOrg = true; mine.locked = true; if (oi.level === "required") mine.level = "required"; if (oi.n != null && (mine.n ?? 0) < oi.n) mine.n = oi.n; }
    }
    transitions[t.key] = team;
  }
  return { ...own, transitions, targets: { ...(org.targets || {}), ...(own.targets || {}) }, allowOverride: own.allowOverride && org.allowOverride !== false, scope: "team", teamPolicy: org.teamPolicy };
}

export const itemLabel = (it) => (it.check === "manual" ? it.label : CHECKS[it.check]?.label(it.n ?? CHECKS[it.check].n) || it.check);

const DAY = 86400000;
export function applies(it, ctx) {
  const w = it.when || "always";
  if (w === "always") return true;
  if (w.startsWith("gate:")) return ctx.trig.some((t) => t.gate.id === w.slice(5));
  if (w.startsWith("origin:")) return ctx.o.origin === w.slice(7);
  return true;
}
export const whenLabel = (w, gates = []) => (!w || w === "always" ? "" : w.startsWith("gate:") ? `only when ${gates.find((g) => g.id === w.slice(5))?.name || w.slice(5)} is triggered` : WHEN[w]?.replace(/^Only/, "only") || w);

// ctx: { o, stream, proto, trig, data } → checklist for the move out of the opportunity's current phase.
export function evaluate(rules, ctx, transitionKey) {
  const t = transitionKey ? TRANSITIONS.find((x) => x.key === transitionKey) : transitionFrom(ctx.o.phase);
  if (!t) return null;
  const all = (rules.transitions[t.key] || []).map((it) => {
    const base = { ...it, applies: applies(it, ctx), request: ctx.o.requests?.[it.id] || null };
    if (it.check === "manual") {
      const a = ctx.o.checks?.[it.id];
      return { ...base, ok: !!a, detail: a ? a.note || "" : `${WHO[it.who] || "Anyone"} signs off`, attested: a || null };
    }
    const def = CHECKS[it.check];
    if (!def) return { ...base, label: it.check, ok: true, detail: "unknown check" };
    const [ok, detail] = def.test(ctx, it.n ?? def.n);
    return { ...base, label: itemLabel(it), ok, detail };
  });
  const items = all.filter((i) => i.applies);
  const required = items.filter((i) => i.level === "required");
  // Time in phase against the team's target.
  const since = ctx.o.phaseAt || [...(ctx.o.phaseLog || [])].pop()?.at || ctx.o.at;
  const days = since ? Math.floor((Date.now() - Date.parse(since)) / DAY) : 0;
  const target = rules.targets?.[t.key] || null;
  return { transition: t, items, skipped: all.filter((i) => !i.applies), ready: required.every((i) => i.ok), done: items.filter((i) => i.ok).length, total: items.length,
    missing: required.filter((i) => !i.ok), warnings: items.filter((i) => i.level !== "required" && !i.ok), allowOverride: !!rules.allowOverride, scope: rules.scope, preset: rules.preset,
    days, target, overdue: target ? Math.max(0, days - target) : 0 };
}
