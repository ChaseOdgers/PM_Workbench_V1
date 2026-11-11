// The Workbench API. Every screen goes through these async functions.
// Today they read and write the in-browser mock DB (db.js). In a client build each one becomes
// an HTTP call to a real service, e.g. listSignals → GET /api/streams/:id/signals.
import { getDb, mutate, nextId, resetDb } from "./db";
import { rankSignals } from "../lib/ranking";
import { triggeredGates, readiness, oppStatus } from "../lib/gates";
import { scanHtml, worst } from "../lib/scan";
import { applyInstruction, renderPrototype, DEFAULT_OPTIONS } from "../lib/prototype";
import { PACKS } from "../data/packs";

const ok = (v) => Promise.resolve(structuredClone(v));
const now = () => new Date().toISOString();
const SESSION = "pmwb.v1.session";

function audit(d, userId, action, target, detail = "") {
  d.audit.unshift({ id: nextId("audit", "A"), at: now(), userId, action, target, detail });
}
function logGate(d, entry) {
  d.gateLog.unshift({ id: nextId("log", "log"), at: now(), ...entry });
}
const nameOf = (d, id) => d.users.find((u) => u.id === id)?.name || d.agents.find((a) => a.id === id)?.name || id;

/* ---------- session & workspace ---------- */
export function getSession() {
  try { return JSON.parse(localStorage.getItem(SESSION)) || memSession; } catch { return memSession; }
}
export function signIn(userId) {
  const u = getDb().users.find((x) => x.id === userId);
  const s = { userId, streamId: u.streams[0] };
  saveSession(s);
  mutate((d) => audit(d, userId, "signed in", "workspace", "via mock SSO"));
  return ok(s);
}
export function setStream(streamId) {
  const s = { ...getSession(), streamId };
  saveSession(s);
  mutate(() => {});
  return ok(s);
}
let memSession = null;
function saveSession(s) { memSession = s; try { localStorage.setItem(SESSION, JSON.stringify(s)); } catch { /* storage blocked: keep in memory */ } }
export function signOut() { memSession = null; try { localStorage.removeItem(SESSION); } catch { /* ignore */ } mutate(() => {}); return ok(true); }
export function resetDemo(packId) { resetDb(packId); return ok(true); }
export const listPacks = () => ok(PACKS);

export function getWorkspace() {
  const d = getDb();
  return ok({ ...d.workspace, packId: d.meta.packId, streams: d.valueStreams, users: d.users });
}

/* ---------- users ---------- */
export const listUsers = () => ok(getDb().users);
export function saveUser(user, by) {
  return ok(mutate((d) => {
    if (!user.id) {
      user = { ...user, id: nextId("user", "u"), initials: user.name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase(), demo: false };
      d.users.push(user);
      audit(d, by, "added user", user.name, user.persona);
    } else {
      Object.assign(d.users.find((u) => u.id === user.id), user);
      audit(d, by, "updated user", user.name, `${user.persona} · ${user.streams.length} streams`);
    }
    return user;
  }));
}

/* ---------- context: sources, notes, connectors ---------- */
export function listSources() {
  const d = getDb();
  return ok(d.sources.map((s) => ({ ...s, agent: d.agents.find((a) => a.id === s.agentId) })));
}
export const listConnectors = () => ok(getDb().connectors);
export function addSource(data, by) {
  const id = mutate((d) => {
    const c = d.connectors.find((x) => x.id === data.connectorId);
    const src = {
      id: nextId("src", "src"), name: data.name, icon: c.icon, kind: c.kind, system: c.name, access: "read-only",
      schedule: data.schedule, agentId: data.agentId, tag: data.tag || c.tag, status: "connecting", lastSync: null, records: 0,
    };
    d.sources.push(src);
    audit(d, by, "connected source", src.name, `${c.name} · ${data.schedule}`);
    return src.id;
  });
  // Simulated connector handshake and first sync.
  setTimeout(() => mutate((d) => { const s = d.sources.find((x) => x.id === id); if (s) s.status = "syncing"; }), 1200);
  setTimeout(() => mutate((d) => {
    const s = d.sources.find((x) => x.id === id);
    if (!s) return;
    s.status = "synced"; s.lastSync = now(); s.records = 200 + Math.floor(Math.random() * 4000);
    d.agentRuns.unshift({ id: nextId("run", "run"), agentId: s.agentId, at: now(), recordsRead: s.records, signalsRaised: 0, result: "ok", note: `First sync of ${s.name}` });
  }), 3200);
  return ok(id);
}
export function updateSource(id, patch, by) {
  return ok(mutate((d) => {
    const s = d.sources.find((x) => x.id === id);
    Object.assign(s, patch);
    audit(d, by, "updated source", s.name, Object.keys(patch).join(", "));
  }));
}
export function removeSource(id, by) {
  return ok(mutate((d) => {
    const s = d.sources.find((x) => x.id === id);
    d.sources = d.sources.filter((x) => x.id !== id);
    audit(d, by, "disconnected source", s?.name);
  }));
}
export const listNotes = (streamId) => ok(getDb().notes.filter((n) => !streamId || n.streamId === streamId));
export function addNote(streamId, text, by) {
  return ok(mutate((d) => {
    d.notes.unshift({ id: nextId("note", "note"), streamId, text, by, at: now() });
    const src = d.sources.find((s) => s.kind === "manual");
    if (src) { src.records++; src.lastSync = now(); }
    audit(d, by, "added context note", streamId, text.slice(0, 60));
  }));
}

/* ---------- agents ---------- */
export function listAgents() {
  const d = getDb();
  return ok(d.agents.map((a) => ({
    ...a,
    sources: d.sources.filter((s) => s.agentId === a.id),
    runs: d.agentRuns.filter((r) => r.agentId === a.id).sort((x, y) => y.at.localeCompare(x.at)).slice(0, 5),
  })));
}
export function updateAgent(id, patch, by) {
  return ok(mutate((d) => {
    const a = d.agents.find((x) => x.id === id);
    Object.assign(a, patch);
    if (patch.state) d.agentRuns.unshift({ id: nextId("run", "run"), agentId: id, at: now(), recordsRead: 0, signalsRaised: 0, result: patch.state === "paused" ? "paused" : "ok", note: `${patch.state === "paused" ? "Paused" : "Resumed"} by ${nameOf(d, by)}` });
    audit(d, by, patch.state ? `${patch.state === "paused" ? "paused" : "resumed"} agent` : "updated agent", a.name, JSON.stringify(patch));
  }));
}
export function runAgent(id, by) {
  return ok(mutate((d) => {
    const a = d.agents.find((x) => x.id === id);
    const read = a.id === "agt-signals" ? d.supportContacts.length + d.feedback.length + d.webItems.length : 50 + Math.floor(Math.random() * 900);
    const note = a.id === "agt-signals" ? `Re-ranked ${d.signals.length} themes with the current rules` : a.id === "agt-gov" ? "Re-checked every open opportunity against policies" : "Manual run";
    d.agentRuns.unshift({ id: nextId("run", "run"), agentId: id, at: now(), recordsRead: read, signalsRaised: 0, result: "ok", note });
    audit(d, by, "ran agent", a.name, note);
  }));
}

/* ---------- signals ---------- */
export function listSignals(streamId) {
  const d = getDb();
  const stream = d.valueStreams.find((s) => s.id === streamId);
  const settings = d.workspace.settings.signals;
  const ranked = rankSignals(d.signals.filter((s) => s.streamId === streamId), stream?.goals || [], settings);
  const decorate = (s) => ({ ...s, sources: s.sourceIds.map((id) => d.sources.find((x) => x.id === id)).filter(Boolean) });
  return ok({ settings, goals: stream?.goals || [], top: ranked.top.map(decorate), rest: ranked.rest.map(decorate), muted: ranked.muted.map(decorate) });
}
export function getSignalRecords(signalId) {
  const d = getDb();
  const s = d.signals.find((x) => x.id === signalId);
  const keys = s.rawKeys || [];
  const contacts = d.supportContacts.filter((r) => keys.includes(r.themeKey));
  const feedback = d.feedback.filter((r) => keys.includes(r.themeKey));
  const web = d.webItems.filter((r) => keys.includes(r.themeKey));
  return ok({ contacts: contacts.slice(0, 12), feedback: feedback.slice(0, 6), web, counts: { contacts: contacts.length, feedback: feedback.length, web: web.length } });
}
export function setSignalMuted(id, muted, by) {
  return ok(mutate((d) => {
    const s = d.signals.find((x) => x.id === id);
    s.muted = muted;
    audit(d, by, muted ? "muted signal" : "unmuted signal", s.id, s.theme);
  }));
}
export function updateSignalSettings(patch, by) {
  return ok(mutate((d) => {
    const s = d.workspace.settings.signals;
    Object.assign(s, { ...patch, weights: { ...s.weights, ...(patch.weights || {}) } });
    audit(d, by, "changed ranking rules", "signals", JSON.stringify(patch));
  }));
}
export function promoteSignal(signalId, by) {
  return ok(mutate((d) => {
    const s = d.signals.find((x) => x.id === signalId);
    const src = s.sourceIds.map((id) => d.sources.find((x) => x.id === id)?.name).filter(Boolean).join(" and ");
    const opp = {
      id: nextId("OPP", "OPP"), streamId: s.streamId, title: s.theme, origin: "agent", owner: by, at: now(), phase: "Shape",
      desc: `Agent draft from ${s.id}: ${s.volume.toLocaleString()} ${s.unit} from ${src} point to this theme. Describe the customer problem and the outcome you want, then generate a prototype.`,
      signalIds: [s.id], evidence: [], manualGates: [], gateReviews: {}, directorApproval: { status: "none" }, handoff: null,
    };
    d.opportunities.unshift(opp);
    s.promotedTo = opp.id;
    audit(d, by, "promoted signal", opp.id, s.theme);
    return opp.id;
  }));
}
export function linkSignal(oppId, signalId, by) {
  return ok(mutate((d) => {
    const o = d.opportunities.find((x) => x.id === oppId);
    const s = d.signals.find((x) => x.id === signalId);
    if (!o.signalIds.includes(signalId)) o.signalIds.push(signalId);
    if (!s.promotedTo) s.promotedTo = oppId;
    audit(d, by, "linked signal", oppId, s.theme);
  }));
}
export function unlinkSignal(oppId, signalId, by) {
  return ok(mutate((d) => {
    const o = d.opportunities.find((x) => x.id === oppId);
    o.signalIds = o.signalIds.filter((x) => x !== signalId);
    const s = d.signals.find((x) => x.id === signalId);
    if (s?.promotedTo === oppId) s.promotedTo = null;
    audit(d, by, "unlinked signal", oppId, signalId);
  }));
}

/* ---------- opportunities ---------- */
function enrich(d, o) {
  const trig = triggeredGates(o, d.gates);
  const proto = d.prototypes.find((p) => p.oppId === o.id) || null;
  return { trig, proto, status: oppStatus(o, trig, proto), ready: readiness(o, trig, proto) };
}

// When an opportunity reaches Prototype, each triggered gate opens a review and logs a flag.
function syncReviews(d, o) {
  if (o.phase !== "Prototype" || o.handoff) return;
  for (const t of triggeredGates(o, d.gates)) {
    if (!o.gateReviews[t.gate.id]) {
      o.gateReviews[t.gate.id] = { status: "pending", comments: [] };
      logGate(d, { oppId: o.id, gateId: t.gate.id, kind: "flag", text: `${t.gate.name} required: ${t.reason}`, by: "agt-gov" });
    }
  }
}

export function listOpportunities(streamIds) {
  const d = getDb();
  return ok(d.opportunities
    .filter((o) => !streamIds || streamIds.includes(o.streamId))
    .map((o) => {
      const e = enrich(d, o);
      return { ...o, status: e.status, signalCount: o.signalIds.length, gateCount: e.trig.length, stream: d.valueStreams.find((s) => s.id === o.streamId)?.name };
    }));
}

export function getOpportunity(id) {
  const d = getDb();
  const o = d.opportunities.find((x) => x.id === id);
  if (!o) return ok(false);
  const e = enrich(d, o);
  const settings = d.workspace.settings.signals;
  const stream = d.valueStreams.find((s) => s.id === o.streamId);
  const all = rankSignals(d.signals.filter((s) => s.streamId === o.streamId), stream?.goals || [], settings).all;
  return ok({
    ...o,
    stream,
    status: e.status,
    readiness: e.ready,
    gates: e.trig.map((t) => ({ ...t.gate, reason: t.reason, policy: d.policies.find((p) => p.id === t.gate.policyId), review: o.gateReviews[t.gate.id] || null })),
    allGates: d.gates,
    signals: all.filter((s) => o.signalIds.includes(s.id)),
    linkable: all.filter((s) => !o.signalIds.includes(s.id) && !s.muted),
    proto: e.proto ? { approvedVersion: e.proto.approvedVersion, versions: e.proto.versions.length } : null,
    log: d.gateLog.filter((l) => l.oppId === id),
    audit: d.audit.filter((a) => a.target === id).slice(0, 20),
    workItems: d.workItems.filter((w) => w.oppId === id),
  });
}

export function createOpportunity({ streamId, title, desc }, by) {
  return ok(mutate((d) => {
    const o = { id: nextId("OPP", "OPP"), streamId, title, desc, phase: "Sense", origin: "human", owner: by, at: now(), signalIds: [], evidence: [], manualGates: [], gateReviews: {}, directorApproval: { status: "none" }, handoff: null };
    d.opportunities.unshift(o);
    audit(d, by, "created opportunity", o.id, title);
    return o.id;
  }));
}
export function updateOpportunity(id, patch, by) {
  return ok(mutate((d) => {
    const o = d.opportunities.find((x) => x.id === id);
    Object.assign(o, patch, { at: now() });
    syncReviews(d, o);
    audit(d, by, "edited", id, Object.keys(patch).join(", "));
  }));
}
export function setPhase(id, phase, by) {
  return ok(mutate((d) => {
    const o = d.opportunities.find((x) => x.id === id);
    o.phase = phase; o.at = now();
    if (phase === "Prototype" && o.directorApproval?.status === "none") o.directorApproval = { status: "pending" };
    syncReviews(d, o);
    audit(d, by, `moved to ${phase}`, id);
  }));
}
export function addEvidence(id, item, by) {
  return ok(mutate((d) => {
    const o = d.opportunities.find((x) => x.id === id);
    o.evidence.push({ id: nextId("ev", "ev"), by, at: now(), ...item });
    syncReviews(d, o);
    audit(d, by, `added ${item.type}`, id, item.name || item.text?.slice(0, 60) || item.url);
  }));
}
export function removeEvidence(id, evId, by) {
  return ok(mutate((d) => {
    const o = d.opportunities.find((x) => x.id === id);
    o.evidence = o.evidence.filter((e) => e.id !== evId);
    audit(d, by, "removed evidence", id);
  }));
}
export function toggleManualGate(id, gateId, by) {
  return ok(mutate((d) => {
    const o = d.opportunities.find((x) => x.id === id);
    o.manualGates = o.manualGates.includes(gateId) ? o.manualGates.filter((g) => g !== gateId) : [...o.manualGates, gateId];
    syncReviews(d, o);
    audit(d, by, "changed gates", id, gateId);
  }));
}
export function reviewGate(oppId, gateId, decision, comment, by) {
  return ok(mutate((d) => {
    const o = d.opportunities.find((x) => x.id === oppId);
    const g = d.gates.find((x) => x.id === gateId);
    const r = o.gateReviews[gateId] || { comments: [] };
    if (decision) Object.assign(r, { status: decision, by, at: now() });
    if (comment) r.comments.push({ by, text: comment, at: now() });
    o.gateReviews[gateId] = r;
    if (decision) logGate(d, { oppId, gateId, kind: decision === "approved" ? "pass" : "block", text: `${g.name} ${decision} by ${nameOf(d, by)}${comment ? `: “${comment}”` : ""}`, by });
    audit(d, by, decision ? `${decision} gate` : "commented on gate", oppId, g.name);
  }));
}
export function directorDecision(oppId, status, by) {
  return ok(mutate((d) => {
    const o = d.opportunities.find((x) => x.id === oppId);
    o.directorApproval = { status, by, at: now() };
    audit(d, by, status === "approved" ? "approved opportunity" : "sent back opportunity", oppId);
  }));
}
export function listReviewQueue(user) {
  const d = getDb();
  const out = [];
  for (const o of d.opportunities) {
    if (o.handoff) continue;
    for (const t of triggeredGates(o, d.gates)) {
      const r = o.gateReviews[t.gate.id];
      if (r && user.approverRoles.includes(t.gate.approverRole)) out.push({ opp: { id: o.id, title: o.title, streamId: o.streamId }, gate: t.gate, reason: t.reason, review: r, stream: d.valueStreams.find((s) => s.id === o.streamId)?.name });
    }
  }
  return ok(out);
}

/* ---------- prototype studio ---------- */
function protoFor(d, oppId) {
  let p = d.prototypes.find((x) => x.oppId === oppId);
  if (!p) { p = { oppId, approvedVersion: null, feedback: [], chat: [], versions: [] }; d.prototypes.push(p); }
  return p;
}
function versionHtml(d, opp, v) {
  return v.html || renderPrototype(opp, v.options, d.workspace);
}
function addVersion(d, opp, p, v, by) {
  v.v = p.versions.length + 1;
  v.at = now();
  const trig = triggeredGates(opp, d.gates).map((t) => t.gate);
  v.scan = scanHtml(versionHtml(d, opp, v), trig);
  p.versions.push(v);
  const bad = v.scan.filter((r) => r.outcome !== "pass");
  for (const r of bad) logGate(d, { oppId: opp.id, gateId: r.gateId, kind: r.outcome, text: `v${v.v} scan: ${r.label}`, by: "agt-gov" });
  if (!bad.length) logGate(d, { oppId: opp.id, gateId: null, kind: "pass", text: `v${v.v} passed the governance scan`, by: "agt-gov" });
  audit(d, by, `created prototype v${v.v}`, opp.id, v.note);
  return v;
}

export function getPrototype(oppId) {
  const d = getDb();
  const opp = d.opportunities.find((x) => x.id === oppId);
  const p = d.prototypes.find((x) => x.oppId === oppId);
  if (!opp) return ok(null);
  const trig = triggeredGates(opp, d.gates).map((t) => t.gate);
  return ok({
    opp: { id: opp.id, title: opp.title, phase: opp.phase, streamId: opp.streamId, handoff: opp.handoff },
    approvedVersion: p?.approvedVersion || null,
    chat: p?.chat || [],
    feedback: p?.feedback || [],
    versions: (p?.versions || []).map((v) => {
      const html = versionHtml(d, opp, v);
      return { ...v, html, scan: v.scan || scanHtml(html, trig) };
    }),
  });
}
export function generatePrototype(oppId, by) {
  return ok(mutate((d) => {
    const opp = d.opportunities.find((x) => x.id === oppId);
    const p = protoFor(d, oppId);
    if (opp.phase !== "Prototype") { opp.phase = "Prototype"; if (opp.directorApproval?.status === "none") opp.directorApproval = { status: "pending" }; syncReviews(d, opp); }
    const v = addVersion(d, opp, p, { author: "ai", note: "Grounded baseline from the opportunity", options: { ...DEFAULT_OPTIONS } }, by);
    p.chat.push({ role: "agent", text: `I generated v${v.v} from ${opp.id}, grounded in its description, linked signals and evidence. Ask for changes here, or share the link with your team and paste their feedback.`, at: now() });
  }));
}
export function sendChat(oppId, text, by) {
  return ok(mutate((d) => {
    const opp = d.opportunities.find((x) => x.id === oppId);
    const p = protoFor(d, oppId);
    p.chat.push({ role: "user", text, by, at: now() });
    const last = p.versions[p.versions.length - 1];
    const res = applyInstruction(last?.options || DEFAULT_OPTIONS, text);
    if (res.refused) {
      logGate(d, { oppId, gateId: res.refused.gateId, kind: "block", text: res.refused.text, by: "agt-gov" });
      p.chat.push({ role: "agent", warn: true, text: res.reply, at: now() });
      return;
    }
    const v = addVersion(d, opp, p, { author: "ai", note: text.slice(0, 70), options: res.options }, by);
    const issues = v.scan.filter((r) => r.outcome !== "pass").length;
    p.chat.push({ role: "agent", text: `${res.reply} That's v${v.v}.${issues ? ` The governance scan raised ${issues} item${issues > 1 ? "s" : ""}; see the scan panel.` : " It passed the governance scan."}`, at: now() });
  }));
}
export function addFeedback(oppId, text, by) {
  return ok(mutate((d) => {
    protoFor(d, oppId).feedback.push({ id: nextId("fb", "fb"), by, text, at: now(), used: false });
    audit(d, by, "added team feedback", oppId, text.slice(0, 60));
  }));
}
export function applyFeedback(oppId, by) {
  return ok(mutate((d) => {
    const opp = d.opportunities.find((x) => x.id === oppId);
    const p = protoFor(d, oppId);
    const pending = p.feedback.filter((f) => !f.used);
    if (!pending.length) return;
    let options = p.versions[p.versions.length - 1]?.options || DEFAULT_OPTIONS;
    const replies = [];
    for (const f of pending) {
      const r = applyInstruction(options, f.text);
      if (r.refused) { logGate(d, { oppId, gateId: r.refused.gateId, kind: "block", text: `Feedback asked: ${r.refused.text}`, by: "agt-gov" }); replies.push(`skipped "${f.text}" (blocked by DOT gate)`); }
      else { options = r.options; replies.push(r.reply.replace(/^Done: I /, "").replace(/\.$/, "")); }
      f.used = true;
    }
    const v = addVersion(d, opp, p, { author: "ai", note: `Applied ${pending.length} feedback note${pending.length > 1 ? "s" : ""}`, options }, by);
    p.chat.push({ role: "agent", text: `I read ${pending.length} team note${pending.length > 1 ? "s" : ""} and made v${v.v}: ${replies.join("; ")}.`, at: now() });
  }));
}
export function uploadVersion(oppId, html, filename, by) {
  return ok(mutate((d) => {
    const opp = d.opportunities.find((x) => x.id === oppId);
    const p = protoFor(d, oppId);
    const prev = p.versions[p.versions.length - 1];
    const v = addVersion(d, opp, p, { author: "human", by, note: `Uploaded ${filename}`, html, options: prev?.options || DEFAULT_OPTIONS }, by);
    const w = worst(v.scan);
    p.chat.push({ role: "agent", warn: w === "block", text: `I scanned ${filename} as v${v.v}. ${w === "block" ? "It has a blocking issue, so it can't be approved until that's fixed." : w === "flag" ? "It has items to review but nothing blocking." : "It passed every check."}`, at: now() });
  }));
}
export function approveVersion(oppId, vNum, by) {
  return ok(mutate((d) => {
    const opp = d.opportunities.find((x) => x.id === oppId);
    const p = protoFor(d, oppId);
    const v = p.versions.find((x) => x.v === vNum);
    const trig = triggeredGates(opp, d.gates).map((t) => t.gate);
    const scan = scanHtml(versionHtml(d, opp, v), trig);
    if (worst(scan) === "block") throw new Error("This version has a blocking governance issue.");
    p.approvedVersion = vNum;
    audit(d, by, `approved prototype v${vNum}`, oppId);
  }));
}
export function getVersionHtml(oppId, vNum) {
  const d = getDb();
  const opp = d.opportunities.find((x) => x.id === oppId);
  const v = d.prototypes.find((x) => x.oppId === oppId)?.versions.find((x) => x.v === Number(vNum));
  return ok(opp && v ? versionHtml(d, opp, v) : null);
}

/* ---------- handoff (design call #4) ---------- */
export function draftHandoff(oppId) {
  const d = getDb();
  const o = d.opportunities.find((x) => x.id === oppId);
  const p = d.prototypes.find((x) => x.oppId === oppId);
  const trig = triggeredGates(o, d.gates);
  const v = p?.versions.find((x) => x.v === p.approvedVersion);
  const opts = v?.options || {};
  const signals = d.signals.filter((s) => o.signalIds.includes(s.id));
  const refused = d.gateLog.filter((l) => l.oppId === oppId && l.kind === "block" && l.by === "agt-gov");
  const ac = [];
  if (o.template === "alt-offers") ac.push("When a selected fare sells out, the customer sees at least three alternate flights or dates on the same screen");
  if (opts.altPosition === "top") ac.push("The alternatives appear above the fold, before the sold-out results");
  if (trig.some((t) => t.gate.id === "gate-dot")) ac.push("Nothing is booked or changed until the customer reviews the fare and confirms (DOT)");
  if (opts.feeBreakdown || trig.some((t) => t.gate.id === "gate-dot")) ac.push("Every displayed price is the all-in fare, including taxes and carrier fees (DOT)");
  if (trig.some((t) => t.gate.id === "gate-pci")) ac.push("No cardholder data is stored or logged in the browser; payment fields tokenize on submit (PCI)");
  if (opts.ariaLabels || trig.some((t) => t.gate.id === "gate-acaa")) ac.push("Every control has an accessible name and a logical focus order (ACAA / WCAG 2.1 AA)");
  if (signals[0]) ac.push(`Success measure: move “${signals[0].theme}” (${signals[0].volume.toLocaleString()} ${signals[0].unit} today) in the right direction within one quarter`);
  for (const n of opts.notes || []) if (!/DOT/.test(n)) ac.push(n);
  return ok({
    title: o.title,
    scope: o.desc,
    nonGoals: [
      ...(refused.length ? ["No booking or fare change without explicit customer consent"] : []),
      "No changes to pricing engines or fare rules",
      "No new data stores for customer or payment data",
    ].join("\n"),
    acceptance: ac.join("\n"),
    signals: signals.map((s) => ({ id: s.id, theme: s.theme, volume: s.volume, unit: s.unit })),
    evidence: o.evidence.map((e) => e.name || e.url || e.text),
    prototype: v ? { v: v.v, note: v.note, link: `#/share/${oppId}/${v.v}` } : null,
    gates: trig.map((t) => ({ name: t.gate.name, status: o.gateReviews[t.gate.id]?.status || "not started", by: nameOf(d, o.gateReviews[t.gate.id]?.by) })),
    system: d.sources.some((s) => s.system === "Azure DevOps") ? "ADO" : "Jira",
  });
}
export function pushHandoff(oppId, brief, system, by) {
  return ok(mutate((d) => {
    const o = d.opportunities.find((x) => x.id === oppId);
    const prefix = system === "Jira" ? "PMW" : "BOOK";
    const epic = { key: `${prefix}-${nextId("work", "").slice(1)}`, type: "Epic", title: brief.title, status: "New", oppId, system };
    d.workItems.push(epic);
    const stories = brief.acceptance.split("\n").filter(Boolean).map((line) => {
      const s = { key: `${prefix}-${nextId("work", "").slice(1)}`, type: "Story", parent: epic.key, title: line, status: "New", oppId, system };
      d.workItems.push(s);
      return s;
    });
    o.handoff = { at: now(), by, system, epic: epic.key, stories: stories.length, brief };
    o.phase = "Handoff";
    audit(d, by, "handed off", oppId, `${system} epic ${epic.key} with ${stories.length} stories`);
    return epic.key;
  }));
}

/* ---------- governance ---------- */
export function getGovernance() {
  const d = getDb();
  return ok({
    policies: d.policies.map((p) => ({ ...p, gates: d.gates.filter((g) => g.policyId === p.id) })),
    gates: d.gates.map((g) => ({ ...g, policy: d.policies.find((p) => p.id === g.policyId) })),
    log: d.gateLog.map((l) => ({ ...l, gateName: d.gates.find((g) => g.id === l.gateId)?.name, byName: nameOf(d, l.by) })),
  });
}
export function addPolicy(data, by) {
  return ok(mutate((d) => {
    const p = { id: nextId("pol", "pol"), icon: data.source === "upload" ? "ti-file-text" : "ti-pencil", at: now(), ...data };
    d.policies.push(p);
    audit(d, by, "added policy", p.name, data.source);
    return p.id;
  }));
}
export function saveGate(g, by) {
  return ok(mutate((d) => {
    if (!g.id) {
      const gate = { ...g, id: nextId("gate", "gate"), enabled: true };
      d.gates.push(gate);
      audit(d, by, "created gate", gate.name, `${gate.action} · ${gate.approverRole}`);
      for (const o of d.opportunities) syncReviews(d, o);
      return gate.id;
    }
    Object.assign(d.gates.find((x) => x.id === g.id), g);
    audit(d, by, "updated gate", g.name || g.id);
    return g.id;
  }));
}

/* ---------- activity ---------- */
export function listAudit(limit = 50) {
  const d = getDb();
  return ok(d.audit.slice(0, limit).map((a) => ({ ...a, userName: nameOf(d, a.userId) })));
}
