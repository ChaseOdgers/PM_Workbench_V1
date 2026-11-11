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
          <SignalsCard o={o} edit={edit} user={user} />
          <EvidenceCard o={o} edit={edit} user={user} nameOf={nameOf} />
          {o.workItems.length > 0 && (
            <div className="card"><h3><i className="ti ti-layout-kanban" /> Delivery work <span className="right faint">{o.handoff?.system}</span></h3>
              {o.workItems.map((w) => <div key={w.key} className="row small" style={{ padding: "6px 0", paddingLeft: w.type === "Story" ? 16 : 0 }}>
                <span className="mono tiny" style={{ color: "var(--accent-d)", width: 74 }}>{w.key}</span><span className="grow" style={{ fontWeight: w.type === "Epic" ? 700 : 400 }}>{w.type === "Epic" && "Epic · "}{w.title}</span><span className="tag">{w.status}</span></div>)}
            </div>)}
          <div className="card"><h3><i className="ti ti-history" /> Activity on this opportunity</h3>
            {o.audit.length ? o.audit.map((a) => <div key={a.id} className="row small" style={{ padding: "5px 0" }}><b>{nameOf(a.userId)}</b> <span className="soft grow">{a.action}{a.detail && ` · ${a.detail}`}</span><span className="tiny faint">{ago(a.at)}</span></div>)
              : <div className="small faint">Nothing yet in this session. Seeded history is in the gate log.</div>}
          </div>
        </div>
        <div className="stack">
          <GatesCard o={o} user={user} edit={edit} nameOf={nameOf} />
          {o.phase !== "Sense" && o.phase !== "Shape" && <ReadinessCard o={o} user={user} nameOf={nameOf} />}
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
    text = <>Handed off {ago(o.handoff.at)} as <b>{o.handoff.system} epic {o.handoff.epic}</b> with {o.handoff.stories} stories.</>;
    acts = <Link className="btn ghost" to={`/opportunities/${o.id}/handoff`}><i className="ti ti-file-description" /> View handoff brief</Link>;
  } else if (o.phase === "Sense") {
    text = <>Ground this opportunity: link the signals behind it and add evidence. When the problem is clear, move it to <b>Shape</b>.</>;
    if (edit) acts = <button className="btn primary" disabled={busy} onClick={() => run(() => api.setPhase(o.id, "Shape", user.id))}><i className="ti ti-arrow-right" /> Move to Shape</button>;
  } else if (o.phase === "Shape") {
    text = <>Shaped and grounded in {o.signals.length} signal{o.signals.length === 1 ? "" : "s"}. Generate a prototype to test it with your team. {o.gates.length > 0 && <>It will open <b>{o.gates.length} governance review{o.gates.length > 1 ? "s" : ""}</b>.</>}</>;
    if (edit) acts = <>
      <button className="btn ghost" onClick={() => run(() => api.setPhase(o.id, "Sense", user.id))}>Back to Sense</button>
      <button className="btn primary" disabled={busy} onClick={() => run(async () => { await api.generatePrototype(o.id, user.id); nav(`/opportunities/${o.id}/prototype`); })}><i className="ti ti-bolt" /> Generate prototype</button></>;
  } else if (o.readiness.ready) {
    icon = "ti-send";
    text = <>Everything is cleared. Hand off to engineering: the agent drafts a one-page brief and pushes it as an epic.</>;
    acts = <>
      <Link className="btn ghost" to={`/opportunities/${o.id}/prototype`}><i className="ti ti-device-desktop" /> Prototype studio</Link>
      {can(user, "handoff") && <Link className="btn primary" to={`/opportunities/${o.id}/handoff`}><i className="ti ti-send" /> Hand off</Link>}</>;
  } else {
    icon = "ti-route";
    text = <>Before handoff: {missing.map((m) => m.label.toLowerCase()).join("; ")}{o.readiness.rejected.length ? `; resolve ${o.readiness.rejected.length} rejected gate` : ""}.</>;
    acts = <Link className="btn primary" to={`/opportunities/${o.id}/prototype`}><i className="ti ti-device-desktop" /> Open prototype studio</Link>;
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

function ReadinessCard({ o, user, nameOf }) {
  const da = o.directorApproval || {};
  const isDirector = can(user, "opp.approve") && !o.handoff;
  return (
    <div className="card"><h3><i className="ti ti-checklist" /> Ready for handoff? <span className="right">{o.readiness.ready ? <span className="status ok">ready</span> : <span className="status pending">not yet</span>}</span></h3>
      {o.readiness.items.map((i) => (
        <div key={i.key} className={`check ${i.ok ? "ok" : i.blocking === false ? "opt" : "no"}`}>
          <i className={`ti ${i.ok ? "ti-circle-check-filled" : i.blocking === false ? "ti-alert-circle" : "ti-circle"}`} />
          <span className="grow">{i.label}</span>
          {i.key === "director" && da.by && <span className="tiny faint">{nameOf(da.by)}</span>}
        </div>))}
      {o.proto && <div className="tiny faint" style={{ marginTop: 6 }}>{o.proto.versions} prototype version{o.proto.versions === 1 ? "" : "s"}{o.proto.approvedVersion ? ` · v${o.proto.approvedVersion} approved` : ""}</div>}
      {isDirector && da.status !== "approved" && (
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn green sm" onClick={() => api.directorDecision(o.id, "approved", user.id)}><i className="ti ti-check" /> Approve opportunity</button>
          {da.status !== "rejected" && <button className="btn out sm" onClick={() => api.directorDecision(o.id, "rejected", user.id)}>Send back</button>}
        </div>)}
      {da.status === "rejected" && <div className="note warn" style={{ marginTop: 10 }}><i className="ti ti-arrow-back-up" /><div>Sent back by {nameOf(da.by)}. Rework it, then ask for approval again.</div></div>}
    </div>
  );
}
