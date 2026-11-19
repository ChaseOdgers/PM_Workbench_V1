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
  deliveryTests: { label: () => "Every Must story has a test scenario", test: (c) => { const p = c.o.delivery; if (!p) return [false, "no pack yet"]; const miss = p.stories.filter((s) => s.priority === "Must" && !p.scenarios.some((t) => t.include && t.storyId === s.id)).length; return [miss === 0, miss ? `${miss} untested` : ""]; } },
};
export const WHO = { anyone: "Anyone on the team", pm: "Product manager", director: "Director", reviewer: "Reviewer" };

const auto = (check, level, n) => ({ check, level, ...(n != null ? { n } : {}) });
const manual = (label, level, who) => ({ check: "manual", label, level, who });
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
// Stable ids, so a ticked-off attestation still matches its item after a reload or a re-save.
export const itemId = (tk, it) => `${tk}:${it.check === "manual" ? `m-${slug(it.label)}` : it.check}`;
const withIds = (transitions) => Object.fromEntries(Object.entries(transitions).map(([tk, list]) => [tk, list.map((it) => ({ id: itemId(tk, it), ...it }))]));

export const PRESETS = {
  fast: { label: "Fast lane", blurb: "Ideas move quickly. Only governance is mandatory; everything else is a nudge.", allowOverride: true, transitions: {
    "Sense>Shape": [auto("signals", "recommended", 1)],
    "Shape>Prototype": [auto("problem", "recommended", 10)],
    "Prototype>Handoff": [auto("gatesCleared", "required"), auto("noRejected", "required"), auto("protoApproved", "recommended"), auto("delivery", "recommended")],
  } },
  balanced: { label: "Balanced", blurb: "Grounded in data before shaping, approved before handoff. Light on ceremony.", allowOverride: true, transitions: {
    "Sense>Shape": [auto("signals", "required", 1), auto("problem", "recommended", 20)],
    "Shape>Prototype": [auto("signals", "required", 1), auto("goalFit", "recommended"), auto("evidence", "recommended", 1)],
    "Prototype>Handoff": [auto("protoApproved", "required"), auto("gatesCleared", "required"), auto("gatesReviewed", "recommended"), auto("noRejected", "required"), auto("director", "required"), auto("delivery", "recommended")],
  } },
  strict: { label: "Strict (regulated)", blurb: "Every idea is validated, presented and signed off. No overrides.", allowOverride: false, transitions: {
    "Sense>Shape": [auto("signals", "required", 2), auto("evidence", "required", 1), auto("problem", "required", 40), auto("owner", "required"), manual("Problem validated with customer data or research", "required", "pm")],
    "Shape>Prototype": [auto("goalFit", "required"), auto("evidence", "required", 2), manual("Presented at the product review council", "required", "director"), manual("Engineering lead consulted on feasibility", "required", "pm")],
    "Prototype>Handoff": [auto("protoApproved", "required"), auto("gatesCleared", "required"), auto("gatesReviewed", "required"), auto("noRejected", "required"), auto("director", "required"), auto("delivery", "required"), auto("deliveryAC", "required"), auto("deliveryTests", "required"), manual("Legal sign-off on customer-facing copy", "required", "reviewer")],
  } },
};
export const presetRules = (key) => { const p = PRESETS[key]; return { preset: key, allowOverride: p.allowOverride, transitions: withIds(structuredClone(p.transitions)) }; };
// Seed files name a preset only; fill in its items.
export function hydrateRules(r) {
  if (!r) return r;
  const fill = (x) => (x && !x.inherit && !x.transitions ? { ...presetRules(x.preset || "balanced"), ...x, transitions: presetRules(x.preset || "balanced").transitions } : x);
  return { org: fill(r.org), streams: Object.fromEntries(Object.entries(r.streams || {}).map(([k, v]) => [k, fill(v)])) };
}

// Effective rules for a value stream: its own if customized, otherwise the org default.
export function rulesFor(phaseRules, streamId) {
  const own = phaseRules.streams?.[streamId];
  return own && !own.inherit ? { ...own, scope: "team" } : { ...phaseRules.org, scope: "org" };
}

export const itemLabel = (it) => (it.check === "manual" ? it.label : CHECKS[it.check]?.label(it.n ?? CHECKS[it.check].n) || it.check);

// ctx: { o, stream, proto, trig } → checklist for the move out of the opportunity's current phase.
export function evaluate(rules, ctx, transitionKey) {
  const t = transitionKey ? TRANSITIONS.find((x) => x.key === transitionKey) : transitionFrom(ctx.o.phase);
  if (!t) return null;
  const items = (rules.transitions[t.key] || []).map((it) => {
    if (it.check === "manual") {
      const a = ctx.o.checks?.[it.id];
      return { ...it, label: it.label, ok: !!a, detail: a ? "" : `${WHO[it.who] || "Anyone"} confirms`, attested: a || null };
    }
    const def = CHECKS[it.check];
    if (!def) return { ...it, label: it.check, ok: true, detail: "unknown check" };
    const [ok, detail] = def.test(ctx, it.n ?? def.n);
    return { ...it, label: itemLabel(it), ok, detail };
  });
  const required = items.filter((i) => i.level === "required");
  return { transition: t, items, ready: required.every((i) => i.ok), done: items.filter((i) => i.ok).length, total: items.length,
    missing: required.filter((i) => !i.ok), warnings: items.filter((i) => i.level !== "required" && !i.ok), allowOverride: !!rules.allowOverride, scope: rules.scope, preset: rules.preset };
}
