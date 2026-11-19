import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Shell from "../components/Shell";
import { Empty, PhaseTrack } from "../components/ui";
import { useSession } from "../auth";
import { useQuery, useAction } from "../api/hooks";
import * as api from "../api";
import { can, canReview } from "../lib/perms";
import { ago } from "../lib/format";

export default function OpportunityDetail() {
  const { id } = useParams();
  const { ws, user } = useSession();
  const o = useQuery(() => api.getOpportunity(id), [id]);
  if (o === null) return <Shell title="Opportunity" />;
  if (!o) return <Shell title="Opportunity"><Empty title="Opportunity not found" /></Shell>;
  const edit = can(user, "opp.edit") && user.streams.includes(o.streamId) && !o.handoff;
  const nameOf = (uid) => ws.users.find((u) => u.id === uid)?.name || "Agent";

  return (
    <Shell title={<><Link to="/opportunities" className="mut" style={{ textDecoration: "none" }}>Opportunities</Link> <span className="mut">/</span> <span className="mono">{o.id}</span></>}>
      <Link to="/opportunities" className="backbtn"><i className="ti ti-arrow-left" /> Back to opportunities</Link>
      <PhaseTrack phase={o.phase} />
      <Header o={o} edit={edit} user={user} nameOf={nameOf} />
      <NextAction o={o} user={user} edit={edit} />
      <div className="grid2">
        <div className="stack">
          <LineageCard o={o} user={user} />
          <SignalsCard o={o} edit={edit} user={user} />
          <EvidenceCard o={o} edit={edit} user={user} nameOf={nameOf} />
          {o.workItems.length > 0 && (
            <div className="card"><h3><i className="ti ti-layout-kanban" /> Delivery work <span className="right faint">{o.handoff?.system}</span></h3>
              {o.workItems.filter((w) => w.type === "Epic" || w.type === "Story").map((w) => {
                const tests = o.workItems.filter((t) => t.parent === w.key && /Test/.test(t.type)).length;
                return <div key={w.key} className="row small" style={{ padding: "6px 0", paddingLeft: w.type === "Story" ? 16 : 0 }}>
                  <span className="mono tiny" style={{ color: "var(--accent-d)", width: 74 }}>{w.key}</span><span className="grow" style={{ fontWeight: w.type === "Epic" ? 700 : 400 }}>{w.type === "Epic" && "Epic · "}{w.title}</span>
                  {tests > 0 && <span className="tag" title="Test cases"><i className="ti ti-test-pipe" style={{ fontSize: 11 }} /> {tests}</span>}<span className="tag">{w.status}</span></div>;
              })}
            </div>)}
          <div className="card"><h3><i className="ti ti-history" /> Activity on this opportunity</h3>
            {o.audit.length ? o.audit.map((a) => <div key={a.id} className="row small" style={{ padding: "5px 0" }}><b>{nameOf(a.userId)}</b> <span className="soft grow">{a.action}{a.detail && ` · ${a.detail}`}</span><span className="tiny faint">{ago(a.at)}</span></div>)
              : <div className="small faint">Nothing yet in this session. Seeded history is in the gate log.</div>}
          </div>
        </div>
        <div className="stack">
          <PhaseChecklistCard o={o} user={user} nameOf={nameOf} />
          <GatesCard o={o} user={user} edit={edit} nameOf={nameOf} />
        </div>
      </div>
    </Shell>
  );
}

function Header({ o, edit, user, nameOf }) {
  const [editing, setEditing] = useState(null);
  const [val, setVal] = useState("");
  const start = (k) => { if (!edit) return; setEditing(k); setVal(o[k]); };
  const save = async () => { if (val.trim() && val !== o[editing]) await api.updateOpportunity(o.id, { [editing]: val.trim() }, user.id); setEditing(null); };
  return (
    <div className="ohead"><div className="grow">
      {editing === "title"
        ? <input className="input" style={{ fontSize: 22, fontWeight: 700 }} autoFocus value={val} onChange={(e) => setVal(e.target.value)} onBlur={save} onKeyDown={(e) => e.key === "Enter" && save()} />
        : <h1 className={edit ? "inline-edit" : ""} onClick={() => start("title")} title={edit ? "Click to edit" : ""}>{o.title} {edit && <i className="ti ti-pencil faint" style={{ fontSize: 15 }} />}</h1>}
      {editing === "desc"
        ? <textarea className="textarea" style={{ marginTop: 9 }} autoFocus value={val} onChange={(e) => setVal(e.target.value)} onBlur={save} />
        : <p className={`desc ${edit ? "inline-edit" : ""}`} onClick={() => start("desc")} title={edit ? "Click to edit" : ""}>{o.desc} {edit && <i className="ti ti-pencil faint" style={{ fontSize: 14 }} />}</p>}
      <div className="metarow">
        <span className="mono soft">{o.id}</span>·
        <span className={`pill dot ${o.origin === "human" ? "human" : "agent"}`}>{o.origin === "human" ? "Human-created" : "Agent-drafted"}</span>
        <span className={`pill dot ${o.status.cls}`}>{o.status.label}</span>
        <span>· {o.stream.name} · owner {nameOf(o.owner)} · updated {ago(o.at)}</span>
      </div>
    </div></div>
  );
}

function NextAction({ o, user, edit }) {
  const nav = useNavigate();
  const { run, busy } = useAction();
  const missing = o.readiness.items.filter((i) => !i.ok && i.blocking !== false);
  let icon = "ti-sparkles", text, acts = null;
  if (o.handoff) {
    icon = "ti-circle-check";
    text = <>Handed off {ago(o.handoff.at)} as <b>{o.handoff.system} epic {o.handoff.epic}</b> with {o.handoff.stories} stories{o.handoff.tests ? ` and ${o.handoff.tests} test cases` : ""}.</>;
    acts = <Link className="btn ghost" to={`/opportunities/${o.id}/handoff`}><i className="ti ti-file-description" /> View delivery pack</Link>;
  } else if (o.phase === "Sense") {
    text = <>Ground this opportunity: link the signals behind it and add evidence. When the problem is clear, move it to <b>Shape</b>.</>;
    if (o.checklist && !o.checklist.ready) text = <>Before Shape, this team needs: <b>{o.checklist.missing.map((m) => m.label).join("; ")}</b>. See the phase checklist.</>;
    if (edit) acts = <button className="btn primary" disabled={busy || !o.checklist?.ready} title={o.checklist?.ready ? "" : "Complete the required checklist items first"} onClick={() => run(() => api.setPhase(o.id, "Shape", user.id))}><i className={`ti ${o.checklist?.ready ? "ti-arrow-right" : "ti-lock"}`} /> Move to Shape</button>;
  } else if (o.phase === "Shape") {
    text = <>Shaped and grounded in {o.signals.length} signal{o.signals.length === 1 ? "" : "s"}. Generate a prototype to test it with your team. {o.gates.length > 0 && <>It will open <b>{o.gates.length} governance review{o.gates.length > 1 ? "s" : ""}</b>.</>}</>;
    if (edit) acts = <>
      <button className="btn ghost" onClick={() => run(() => api.setPhase(o.id, "Sense", user.id))}>Back to Sense</button>
      <Link className="btn ghost" to={`/opportunities/${o.id}/handoff`}><i className="ti ti-list-details" /> Draft stories &amp; tests</Link>
      <button className="btn primary" disabled={busy || !o.checklist?.ready} title={o.checklist?.ready ? "" : "Complete the required checklist items first"} onClick={() => run(async () => { await api.generatePrototype(o.id, user.id); nav(`/opportunities/${o.id}/prototype`); })}><i className={`ti ${o.checklist?.ready ? "ti-bolt" : "ti-lock"}`} /> Generate prototype</button></>;
    if (o.checklist && !o.checklist.ready) text = <>Before prototyping, this team needs: <b>{o.checklist.missing.map((m) => m.label).join("; ")}</b>. See the phase checklist.</>;
  } else if (o.readiness.ready) {
    icon = "ti-send";
    text = <>Everything is cleared. Hand off to engineering: the delivery agent drafts user stories, acceptance criteria and test scenarios, and pushes them as an epic.</>;
    acts = <>
      <Link className="btn ghost" to={`/opportunities/${o.id}/prototype`}><i className="ti ti-device-desktop" /> Prototype studio</Link>
      {can(user, "handoff") && <Link className="btn primary" to={`/opportunities/${o.id}/handoff`}><i className="ti ti-send" /> Review delivery pack &amp; hand off</Link>}</>;
  } else {
    icon = "ti-route";
    text = <>Before handoff: {missing.map((m) => m.label).join("; ")}{o.readiness.rejected.length ? `; resolve ${o.readiness.rejected.length} rejected gate` : ""}.</>;
    acts = <>
      <Link className="btn ghost" to={`/opportunities/${o.id}/handoff`}><i className="ti ti-list-details" /> Draft stories &amp; tests</Link>
      <Link className="btn primary" to={`/opportunities/${o.id}/prototype`}><i className="ti ti-device-desktop" /> Open prototype studio</Link></>;
  }
  return (
    <div className="next"><div className="ic"><i className={`ti ${icon}`} /></div>
      <div className="grow"><div className="k">{o.handoff ? "Done" : "Next step"}</div><div className="t">{text}</div></div>
      {acts && <div className="acts">{acts}</div>}
    </div>
  );
}

function SignalsCard({ o, edit, user }) {
  const words = (o.title + " " + o.desc).toLowerCase().match(/[a-z]{5,}/g) || [];
  const suggested = o.linkable.map((s) => ({ s, hits: words.filter((w) => s.theme.toLowerCase().includes(w)).length })).filter((x) => x.hits > 0).sort((a, b) => b.hits - a.hits).slice(0, 3);
  const [more, setMore] = useState(false);
  return (
    <div className="card"><h3><i className="ti ti-radar-2" /> Linked signals <span className="right faint">{o.signals.length} linked</span></h3>
      {o.signals.length === 0 && <div className="small faint" style={{ marginBottom: 8 }}>No signals linked yet.</div>}
      {o.signals.map((s) => (
        <div key={s.id} className="ev">
          <div className={`rank ${s.severity}`} style={{ width: 36, height: 36, fontSize: 14 }}>{s.score}</div>
          <div className="grow"><div style={{ fontWeight: 600, fontSize: 13.5 }}>{s.theme}</div><div className="tiny faint">{s.why}</div></div>
          {edit && <button className="iconbtn" title="Unlink" aria-label={`Unlink ${s.id}`} onClick={() => api.unlinkSignal(o.id, s.id, user.id)}><i className="ti ti-unlink" /></button>}
        </div>))}
      {edit && (suggested.length > 0 || o.linkable.length > 0) && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed var(--line-2)" }}>
          <div className="tiny faint" style={{ marginBottom: 4, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".5px" }}><i className="ti ti-sparkles" /> {suggested.length ? "Suggested by the agent" : "Other signals in this stream"}</div>
          {(more ? o.linkable.map((s) => ({ s })) : suggested.length ? suggested : o.linkable.slice(0, 2).map((s) => ({ s }))).map(({ s }) => (
            <div key={s.id} className="row small" style={{ padding: "6px 0" }}>
              <span className={`status ${s.severity === "High" ? "block" : s.severity === "Medium" ? "flag" : "none"}`}>{s.score}</span>
              <span className="grow">{s.theme}{s.promotedTo && <span className="faint"> · on {s.promotedTo}</span>}</span>
              <button className="btn out xs" onClick={() => api.linkSignal(o.id, s.id, user.id)}><i className="ti ti-plus" /> Link</button>
            </div>))}
          {!more && o.linkable.length > suggested.length && <button className="btn link small" onClick={() => setMore(true)}>Show all {o.linkable.length}</button>}
        </div>)}
    </div>
  );
}

function EvidenceCard({ o, edit, user, nameOf }) {
  const [mode, setMode] = useState(null);
  const [val, setVal] = useState("");
  const [val2, setVal2] = useState("");
  const fileRef = useRef();
  const icons = { file: "ti-file", link: "ti-link", note: "ti-note" };
  const onFile = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const isText = /text|json|html|markdown|csv/.test(f.type) || /\.(md|txt|csv|html|json)$/i.test(f.name);
    const text = isText ? (await f.text()).slice(0, 2000) : undefined;
    await api.addEvidence(o.id, { type: "file", name: f.name, meta: `${Math.max(1, Math.round(f.size / 1024))} KB · uploaded${isText ? " · text read by the agent" : ""}`, text }, user.id);
    e.target.value = "";
  };
  const save = async () => {
    if (mode === "note" && val.trim()) await api.addEvidence(o.id, { type: "note", text: val.trim() }, user.id);
    if (mode === "link" && val.trim()) await api.addEvidence(o.id, { type: "link", url: val.trim(), name: val2.trim() || val.trim() }, user.id);
    setMode(null); setVal(""); setVal2("");
  };
  return (
    <div className="card"><h3><i className="ti ti-paperclip" /> Evidence <span className="right faint">files, links and notes</span></h3>
      {o.evidence.length === 0 && !mode && <div className="small faint">No evidence attached. Anything you add is read by the governance agent too.</div>}
      {o.evidence.map((e) => (
        <div key={e.id} className="ev">
          <div className="evi"><i className={`ti ${icons[e.type]}`} /></div>
          <div className="grow">
            {e.type === "note" ? <div className="small" style={{ lineHeight: 1.45 }}>{e.text}</div>
              : e.type === "link" ? <a className="small" href={e.url} target="_blank" rel="noreferrer" style={{ fontWeight: 600 }}>{e.name}</a>
              : <div className="small" style={{ fontWeight: 600 }}>{e.name}</div>}
            <div className="tiny faint">{e.meta ? `${e.meta} · ` : ""}{nameOf(e.by)} · {ago(e.at)}</div>
          </div>
          {edit && <button className="iconbtn danger" aria-label="Remove evidence" onClick={() => api.removeEvidence(o.id, e.id, user.id)}><i className="ti ti-x" /></button>}
        </div>))}
      {mode && (
        <div className="stack" style={{ gap: 8, marginTop: 10 }}>
          {mode === "note" ? <textarea className="textarea" autoFocus placeholder="What did you learn? e.g. a decision from today's ELT review" value={val} onChange={(e) => setVal(e.target.value)} />
            : <><input className="input" autoFocus placeholder="https://…" value={val} onChange={(e) => setVal(e.target.value)} /><input className="input" placeholder="Label (optional)" value={val2} onChange={(e) => setVal2(e.target.value)} /></>}
          <div className="row"><button className="btn primary sm" onClick={save}>Add {mode}</button><button className="btn out sm" onClick={() => setMode(null)}>Cancel</button></div>
        </div>)}
      {edit && !mode && (
        <div className="row" style={{ marginTop: 12, flexWrap: "wrap" }}>
          <input ref={fileRef} type="file" hidden onChange={onFile} />
          <button className="btn out sm" onClick={() => fileRef.current.click()}><i className="ti ti-upload" /> Upload file</button>
          <button className="btn out sm" onClick={() => setMode("link")}><i className="ti ti-link" /> Add link</button>
          <button className="btn out sm" onClick={() => setMode("note")}><i className="ti ti-note" /> Add note</button>
        </div>)}
    </div>
  );
}

function GatesCard({ o, user, edit, nameOf }) {
  const [adding, setAdding] = useState(false);
  const extra = o.allGates.filter((g) => !o.gates.some((t) => t.id === g.id) && g.enabled !== false);
  const opened = o.phase === "Prototype" || o.phase === "Handoff";
  return (
    <div className="card"><h3><i className="ti ti-shield-check" /> Governance gates <span className="right faint">{o.handoff ? "cleared" : opened ? "reviews open" : "will open at Prototype"}</span></h3>
      {o.gates.length === 0 && <div className="small faint">No gates triggered by this opportunity's text or evidence.</div>}
      {o.gates.map((g) => <GateRow key={g.id} g={g} o={o} user={user} opened={opened} nameOf={nameOf} />)}
      {edit && extra.length > 0 && (adding ? (
        <select className="select" style={{ marginTop: 10 }} defaultValue="" onChange={async (e) => { await api.toggleManualGate(o.id, e.target.value, user.id); setAdding(false); }}>
          <option value="" disabled>Attach a gate…</option>
          {extra.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      ) : <button className="btn link small" style={{ marginTop: 6 }} onClick={() => setAdding(true)}><i className="ti ti-plus" /> Attach another gate</button>)}
    </div>
  );
}

function GateRow({ g, o, user, opened, nameOf }) {
  const [comment, setComment] = useState("");
  const r = g.review;
  const mine = canReview(user, g) && opened && !o.handoff;
  const st = r?.status || (opened ? "pending" : "none");
  return (
    <div className="gaterow">
      <div className="row" style={{ alignItems: "flex-start" }}>
        <i className={`ti ${g.action === "block" ? "ti-shield-lock" : "ti-flag"}`} style={{ fontSize: 18, color: g.action === "block" ? "var(--red)" : "var(--amber)", marginTop: 1 }} />
        <div className="grow">
          <div style={{ fontWeight: 600, fontSize: 13.5 }}>{g.name}</div>
          <div className="tiny faint">Triggered: {g.reason} · {g.approverRole} approves · {g.action === "block" ? "blocks handoff" : "flag only"}</div>
        </div>
        <span className={`status ${st}`}>{st === "none" ? "not open" : st}</span>
      </div>
      {r?.by && r.status !== "pending" && <div className="tiny faint" style={{ marginLeft: 28, marginTop: 3 }}>{r.status} by {nameOf(r.by)} · {ago(r.at)}</div>}
      {(r?.comments || []).map((c, i) => <div key={i} className="comment" style={{ marginLeft: 28 }}><b>{nameOf(c.by)}:</b> {c.text}</div>)}
      {mine && (
        <div style={{ marginLeft: 28, marginTop: 8 }}>
          <details><summary className="tiny" style={{ cursor: "pointer", color: "var(--accent-d)" }}>Read the policy: {g.policy?.name}</summary><div className="comment">{g.policy?.text}</div></details>
          <textarea className="textarea" style={{ minHeight: 54, marginTop: 8 }} placeholder="Comment (optional for approve, expected for reject)" value={comment} onChange={(e) => setComment(e.target.value)} />
          <div className="row" style={{ marginTop: 7 }}>
            <button className="btn green sm" onClick={async () => { await api.reviewGate(o.id, g.id, "approved", comment, user.id); setComment(""); }}><i className="ti ti-check" /> Approve</button>
            <button className="btn danger sm" onClick={async () => { await api.reviewGate(o.id, g.id, "rejected", comment, user.id); setComment(""); }}><i className="ti ti-x" /> Reject</button>
            {comment && <button className="btn link small" onClick={async () => { await api.reviewGate(o.id, g.id, null, comment, user.id); setComment(""); }}>Comment only</button>}
          </div>
        </div>)}
    </div>
  );
}

// Where the opportunity's numbers come from: each source system, its endpoint, the records
// behind the opportunity's themes, and the warehouse and analytics series.
function LineageCard({ o, user }) {
  const l = o.lineage;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(null);
  const sync = async () => { setBusy(true); setErr(""); const r = await api.syncAllApi(user.id); if (r.failed.length) setErr(r.failed[0]); setBusy(false); };
  if (!l.total && !l.metrics.length && !l.waiting) return null;
  const spark = (v) => { const max = Math.max(...v, 1); return <span className="spark" style={{ width: 84, height: 22 }} aria-hidden>{v.slice(-8).map((x, i) => <span key={i} className={i >= 5 ? "hi" : ""} style={{ height: `${(x / max) * 100}%` }} />)}</span>; };
  return (
    <div className="card"><h3><i className="ti ti-database-share" /> Where this comes from <span className="right faint">{l.total ? `${l.total.toLocaleString()} records · ${l.sources.length} system${l.sources.length === 1 ? "" : "s"}` : ""}</span></h3>
      {l.waiting && <div className="note" style={{ marginBottom: 10 }}><i className="ti ti-cloud-download" /><div className="grow">This opportunity is grounded in data from the enterprise systems, which hasn't arrived yet{l.pending ? ` (${l.pending} source${l.pending > 1 ? "s" : ""} not synced)` : ""}.
        <div style={{ marginTop: 6 }}><button className="btn primary sm" disabled={busy} onClick={sync}>{busy ? <i className="ti ti-loader-2 spin" /> : <i className="ti ti-refresh" />} Sync from the enterprise API</button></div></div></div>}
      {l.sources.map((s) => (
        <div key={s.id} className="lin">
          <div className="row" style={{ gap: 10, cursor: "pointer" }} onClick={() => setOpen(open === s.id ? null : s.id)}>
            <div className="lic" style={{ width: 32, height: 32 }}><i className={`ti ${s.icon}`} /></div>
            <div className="grow"><div style={{ fontWeight: 600, fontSize: 13.5 }}>{s.name} <span className="tiny faint">· {s.system}</span></div>
              <div className="tiny faint">{s.count.toLocaleString()} records on this theme · {s.status === "synced" ? `synced ${ago(s.lastSync)}` : s.status}</div></div>
            <span className="mono" style={{ fontWeight: 700, color: "var(--navy)" }}>{s.count.toLocaleString()}</span>
            <i className={`ti ti-chevron-${open === s.id ? "up" : "down"} faint`} />
          </div>
          {open === s.id && <div style={{ margin: "8px 0 0 42px" }}>
            {s.url && <div className="tiny" style={{ marginBottom: 6 }}><i className="ti ti-api" /> <a href={s.url} target="_blank" rel="noreferrer" className="mono" style={{ wordBreak: "break-all" }}>{s.url.replace(/^https?:\/\//, "")}</a></div>}
            {s.samples.map((r) => <div key={r.id} className="rec"><span className="rid">{r.id}</span><div className="grow">“{r.text}”<div className="tiny faint">{[r.meta, ago(r.created)].filter(Boolean).join(" · ")}</div></div></div>)}
          </div>}
        </div>))}
      {l.metrics.length > 0 && <div style={{ marginTop: l.sources.length ? 10 : 0 }}>
        <div className="tiny faint" style={{ textTransform: "uppercase", letterSpacing: ".6px", fontWeight: 700, marginBottom: 4 }}>Measured in analytics and the warehouse</div>
        {l.metrics.map((m) => (
          <div key={m.id} className="row small" style={{ padding: "6px 0", borderTop: "1px solid var(--line)", gap: 10 }}>
            <div className="grow"><div style={{ fontWeight: 600 }}>{m.label}</div><div className="tiny faint">{m.source}{m.url && <> · <a href={m.url} target="_blank" rel="noreferrer">endpoint</a></>}</div></div>
            {spark(m.values)}
            <div style={{ textAlign: "right", width: 92 }}><div className="mono" style={{ fontWeight: 700 }}>{m.last.toLocaleString()}</div><div className="tiny" style={{ color: m.change >= 0 ? "var(--red-ink)" : "var(--green-ink)" }}>{m.change >= 0 ? "+" : ""}{Math.round(m.change * 100)}% / 4 wks</div></div>
          </div>))}
      </div>}
      {err && <div className="tiny" style={{ color: "var(--red-ink)", marginTop: 6 }}>{err}</div>}
      {!l.waiting && <div className="tiny faint" style={{ marginTop: 8 }}><i className="ti ti-info-circle" /> Records are pulled over HTTP from the mock enterprise API, outside the app. Change the source or re-sync in Context &amp; agents.</div>}
    </div>
  );
}

const WHO_OK = { anyone: () => true, pm: (u) => ["pm", "director"].includes(u.persona), director: (u) => u.persona === "director", reviewer: (u) => u.persona === "reviewer" };

// The checklist that follows the opportunity: what's done in past phases (snapshots), what the
// current phase still needs, and what later phases will ask for. Rules come from the org or team.
function PhaseChecklistCard({ o, user, nameOf }) {
  const nav = useNavigate();
  const [over, setOver] = useState(false);
  const [reason, setReason] = useState("");
  const [peek, setPeek] = useState(null);
  const [signing, setSigning] = useState(null);
  const [note, setNote] = useState("");
  const [asking, setAsking] = useState(null);
  const [showSkipped, setShowSkipped] = useState(false);
  const signers = useQuery(() => (asking ? api.listSigners(o.id, asking) : null), [asking]);
  const { run, busy, error } = useAction();
  const c = o.checklist;
  const da = o.directorApproval || {};
  const isDirector = can(user, "opp.approve") && !o.handoff;
  const sc = o.phaseRulesScope;
  const inStream = user.streams.includes(o.streamId);
  const canOverride = c && !c.ready && c.allowOverride && can(user, "phases.override") && !o.handoff;
  const move = () => run(async () => {
    const to = c.transition.to;
    if (to === "Prototype") { await api.generatePrototype(o.id, user.id, reason); nav(`/opportunities/${o.id}/prototype`); }
    else if (to === "Handoff") nav(`/opportunities/${o.id}/handoff`);
    else await api.setPhase(o.id, to, user.id, reason);
    setOver(false); setReason("");
  });
  const presetName = sc?.preset === "custom" ? "Custom" : { fast: "Fast lane", balanced: "Balanced", strict: "Strict" }[sc?.preset] || sc?.preset;
  const Item = ({ i, live }) => {
    const mineToSign = live && i.check === "manual" && inStream && !o.handoff && (WHO_OK[i.who] || WHO_OK.anyone)(user);
    const canAsk = live && i.check === "manual" && !i.ok && inStream && can(user, "opp.edit") && !o.handoff;
    return (
      <div className={`check ${i.ok ? "ok" : i.level === "required" ? "no" : "opt"}`} style={{ alignItems: "flex-start" }}>
        <i className={`ti ${i.ok ? "ti-circle-check-filled" : i.check === "manual" ? "ti-signature" : i.level === "required" ? "ti-circle" : "ti-alert-circle"}`} style={{ marginTop: 2 }} />
        <div className="grow">
          <div>{i.label}{i.locked && <i className="ti ti-lock faint" title="Set by the organization" style={{ fontSize: 12, marginLeft: 4 }} />}{i.when && i.when !== "always" && <span className="tiny faint"> · {i.when.startsWith("gate:") ? "gate triggered" : "applies here"}</span>}</div>
          {i.attested ? <div className="tiny faint">Signed off by {nameOf(i.attested.by)} · {ago(i.attested.at)}{i.attested.note && <> · “{i.attested.note}”</>}</div>
            : i.request ? <div className="tiny" style={{ color: "var(--amber-ink)" }}><i className="ti ti-send" /> Requested from {nameOf(i.request.to)} by {nameOf(i.request.by)} · {ago(i.request.at)}</div>
            : i.detail && <div className="tiny faint">{i.detail}</div>}
          {live && signing === i.id && <div className="row" style={{ gap: 6, marginTop: 6 }}>
            <input className="input inl" autoFocus placeholder="Note or link (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            <button className="btn green xs" onClick={async () => { await api.toggleCheck(o.id, i.id, user.id, note); setSigning(null); setNote(""); }}><i className="ti ti-check" /> Sign off</button>
            <button className="btn link small" onClick={() => setSigning(null)}>Cancel</button></div>}
          {live && asking === i.id && <div className="row" style={{ gap: 6, marginTop: 6 }}>
            <select className="select" style={{ padding: "4px 8px", fontSize: 12 }} defaultValue="" onChange={async (e) => { if (e.target.value) { await api.requestSignoff(o.id, i.id, e.target.value, user.id); setAsking(null); } }}>
              <option value="" disabled>Ask who?</option>{(signers || []).map((u) => <option key={u.id} value={u.id}>{u.name} · {u.title}</option>)}</select>
            <button className="btn link small" onClick={() => setAsking(null)}>Cancel</button></div>}
          {live && i.check === "manual" && signing !== i.id && asking !== i.id && (
            <div className="row" style={{ gap: 10, marginTop: 3 }}>
              {mineToSign && !i.ok && <button className="btn link small" style={{ padding: 0 }} onClick={() => { setSigning(i.id); setNote(""); }}><i className="ti ti-signature" /> Sign off</button>}
              {mineToSign && i.ok && i.attested?.by === user.id && <button className="btn link small" style={{ padding: 0 }} onClick={() => api.toggleCheck(o.id, i.id, user.id)}>Withdraw</button>}
              {canAsk && !i.request && <button className="btn link small" style={{ padding: 0 }} onClick={() => setAsking(i.id)}><i className="ti ti-send" /> Request</button>}
              {canAsk && i.request && <button className="btn link small" style={{ padding: 0 }} onClick={() => api.requestSignoff(o.id, i.id, null, user.id)}>Cancel request</button>}
            </div>)}
        </div>
        <span className={`lvl ${i.level}`}>{i.level === "required" ? "required" : "nice to have"}</span>
      </div>);
  };
  return (
    <div className="card"><h3><i className="ti ti-list-check" /> Phase checklist
      <span className="right">{sc && <span className="tag" title={sc.scope === "org" ? "This team uses the organization default" : "This team has its own rules"}>{sc.scope === "org" ? "Org default" : o.stream.name.split(" ·")[0]} · {presetName}</span>}</span></h3>

      {o.phaseLog.map((l, k) => (
        <div key={k} className="phasedone" onClick={() => setPeek(peek === k ? null : k)}>
          <div className="row small"><i className="ti ti-circle-check-filled" style={{ color: l.override ? "var(--amber)" : "var(--green)" }} />
            <b className="grow">{l.from} → {l.to}</b><span className="tiny faint">{l.items.filter((i) => i.ok).length}/{l.items.length}{l.days != null ? ` · ${l.days}d in ${l.from}` : ""} · {nameOf(l.by)} · {ago(l.at)}</span><i className={`ti ti-chevron-${peek === k ? "up" : "down"} faint`} /></div>
          {l.override && <div className="tiny" style={{ color: "var(--amber-ink)", marginLeft: 22 }}>Overridden: “{l.override}”</div>}
          {peek === k && <div style={{ marginTop: 6 }}>{l.items.map((i, j) => <Item key={j} i={i} />)}</div>}
        </div>))}

      {c ? <>
        <div className="row" style={{ margin: "10px 0 4px", gap: 8 }}>
          <b className="grow" style={{ fontSize: 14 }}>Before {c.transition.to}</b>
          {c.target && <span className={`status ${c.overdue ? "flag" : "none"}`} title={`Target: ${c.target} days in ${c.transition.from}`}><i className="ti ti-clock" />day {c.days} of {c.target}</span>}
          <span className={`status ${c.ready ? "ok" : "pending"}`}>{c.ready ? "ready" : `${c.missing.length} required left`}</span>
        </div>
        <div className="meter"><span style={{ width: `${c.total ? (c.done / c.total) * 100 : 100}%` }} /></div>
        <div className="tiny faint" style={{ margin: "4px 0 8px" }}>{c.transition.hint} {c.done} of {c.total} done.{c.overdue ? <b style={{ color: "var(--amber-ink)" }}> {c.overdue} day{c.overdue > 1 ? "s" : ""} past this team's target.</b> : ""}</div>
        {c.items.length === 0 && <div className="small faint">No requirements for this move. This team moves ideas fast.</div>}
        {c.items.map((i) => <Item key={i.id} i={i} live />)}
        {c.skipped.length > 0 && <>
          <button className="btn link small" style={{ padding: 0, marginTop: 4 }} onClick={() => setShowSkipped(!showSkipped)}>{c.skipped.length} conditional item{c.skipped.length > 1 ? "s don't" : " doesn't"} apply here</button>
          {showSkipped && c.skipped.map((i) => <div key={i.id} className="tiny faint" style={{ padding: "3px 0 0 24px" }}>{i.label} · {i.when?.startsWith("gate:") ? "its gate isn't triggered" : "doesn't apply to this idea"}</div>)}
        </>}
        {c.items.some((i) => i.check === "director") && isDirector && da.status !== "approved" && (
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn green sm" onClick={() => api.directorDecision(o.id, "approved", user.id)}><i className="ti ti-check" /> Approve opportunity</button>
            {da.status !== "rejected" && <button className="btn out sm" onClick={() => api.directorDecision(o.id, "rejected", user.id)}>Send back</button>}
          </div>)}
        {da.status === "rejected" && <div className="note warn" style={{ marginTop: 10 }}><i className="ti ti-arrow-back-up" /><div>Sent back by {nameOf(da.by)}. Rework it, then ask for approval again.</div></div>}
        {canOverride && !over && <button className="btn link small" style={{ marginTop: 8 }} onClick={() => setOver(true)}><i className="ti ti-key" /> Override and move to {c.transition.to}</button>}
        {over && (
          <div style={{ marginTop: 10 }}>
            <textarea className="textarea" style={{ minHeight: 54 }} placeholder="Why move on without the required items? This is logged." value={reason} onChange={(e) => setReason(e.target.value)} />
            <div className="row" style={{ marginTop: 6 }}>
              <button className="btn primary sm" disabled={!reason.trim() || busy} onClick={move}><i className="ti ti-key" /> {c.transition.to === "Handoff" ? "Continue to handoff" : `Override and move to ${c.transition.to}`}</button>
              <button className="btn link small" onClick={() => setOver(false)}>Cancel</button></div>
          </div>)}
        {error && <div className="tiny" style={{ color: "var(--red-ink)", marginTop: 6 }}>{error}</div>}
        {o.proto && c.transition.to === "Handoff" && <div className="tiny faint" style={{ marginTop: 6 }}>{o.proto.versions} prototype version{o.proto.versions === 1 ? "" : "s"}{o.proto.approvedVersion ? ` · v${o.proto.approvedVersion} approved` : ""}</div>}
      </> : o.handoff && <div className="small faint" style={{ marginTop: 8 }}>Handed off. Every phase checklist is recorded above.</div>}

      {o.upcoming.slice(1).map((u) => u && (
        <div key={u.transition.key} className="phasenext"><i className="ti ti-lock faint" /> <span className="grow">Later: {u.transition.label}</span>
          <span className="tiny faint">{u.items.filter((i) => i.level === "required").length} required · {u.items.filter((i) => i.level !== "required").length} nice to have{u.target ? ` · ${u.target}d target` : ""}</span></div>))}
    </div>
  );
}
