// Governance (design call #3): policies → gates → log.
// A gate triggers on an opportunity when its text mentions one of the gate's keywords,
// when the gate applies to everything, or when the PM attaches it by hand.
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function oppText(opp) {
  return [opp.title, opp.desc, ...(opp.evidence || []).map((e) => e.text || e.name || "")].join(" ");
}

export function triggeredGates(opp, gates) {
  const text = oppText(opp);
  const out = [];
  for (const g of gates) {
    if (g.enabled === false) continue;
    if (g.triggerAll) { out.push({ gate: g, reason: g.trigger }); continue; }
    const kw = g.keywords.find((k) => new RegExp(`\\b${esc(k)}(s|es)?\\b`, "i").test(text));
    if (kw) { out.push({ gate: g, reason: `mentions “${kw}”` }); continue; }
    if ((opp.manualGates || []).includes(g.id)) out.push({ gate: g, reason: "added by hand" });
  }
  return out;
}

export function readiness(opp, triggered, proto) {
  const reviews = opp.gateReviews || {};
  const blocking = triggered.filter((t) => t.gate.action === "block");
  const flags = triggered.filter((t) => t.gate.action === "flag");
  const rejected = triggered.filter((t) => reviews[t.gate.id]?.status === "rejected");
  const items = [
    { key: "proto", label: "A prototype version is approved", ok: !!proto?.approvedVersion },
    ...blocking.map((t) => ({ key: t.gate.id, label: `${t.gate.name} approved`, ok: reviews[t.gate.id]?.status === "approved", blocking: true })),
    ...flags.map((t) => ({ key: t.gate.id, label: `${t.gate.name} reviewed (flag only)`, ok: reviews[t.gate.id]?.status === "approved", blocking: false })),
    { key: "director", label: "Director approval", ok: opp.directorApproval?.status === "approved" },
  ];
  const ready = items.filter((i) => i.blocking !== false).every((i) => i.ok) && rejected.length === 0;
  return { items, ready, rejected };
}

export function oppStatus(opp, triggered, proto) {
  if (opp.handoff) return { label: "Handed off", cls: "done" };
  if (opp.phase === "Sense") return { label: "Sensing", cls: "sens" };
  if (opp.phase === "Shape") return { label: "Shaping", cls: "ready" };
  const reviews = opp.gateReviews || {};
  if (triggered.some((t) => reviews[t.gate.id]?.status === "rejected")) return { label: "Changes requested", cls: "bad" };
  if (triggered.some((t) => t.gate.action === "block" && reviews[t.gate.id]?.status !== "approved")) return { label: "In review", cls: "wait" };
  if (!proto?.approvedVersion) return { label: "Prototyping", cls: "agent" };
  if (opp.directorApproval?.status !== "approved") return { label: "Awaiting director", cls: "wait" };
  return { label: "Ready to hand off", cls: "ready" };
}
