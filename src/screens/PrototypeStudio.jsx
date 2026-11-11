import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Shell from "../components/Shell";
import { Empty, Modal } from "../components/ui";
import { useSession } from "../auth";
import { useQuery, useAction } from "../api/hooks";
import * as api from "../api";
import { can } from "../lib/perms";
import { worst } from "../lib/scan";
import { ago } from "../lib/format";

const SUGGESTIONS = ["Show the options above the fold", "Show the all-in price with taxes and fees", "Add accessible labels to the buttons", "Make the text larger", "Auto-book the cheapest alternate"];

export default function PrototypeStudio() {
  const { id } = useParams();
  const { ws, user } = useSession();
  const p = useQuery(() => api.getPrototype(id), [id]);
  const [sel, setSel] = useState(null);
  const [msg, setMsg] = useState("");
  const [fbOpen, setFbOpen] = useState(false);
  const [shared, setShared] = useState(false);
  const { run, busy, error, setError } = useAction();
  const chatEnd = useRef();
  const fileRef = useRef();
  const count = p?.versions.length || 0;
  useEffect(() => { setSel(count || null); }, [count]);
  useEffect(() => { chatEnd.current?.scrollIntoView({ block: "end" }); }, [p?.chat.length]);

  if (!p) return <Shell title="Prototype studio" />;
  const edit = can(user, "proto.edit") && user.streams.includes(p.opp.streamId) && !p.opp.handoff;
  const v = p.versions.find((x) => x.v === sel) || p.versions[p.versions.length - 1];
  const nameOf = (uid) => ws.users.find((u) => u.id === uid)?.name || "";
  const unusedFb = p.feedback.filter((f) => !f.used);
  const send = (text) => text.trim() && run(async () => { await api.sendChat(id, text.trim(), user.id); setMsg(""); });
  const shareUrl = v ? `${location.origin}${location.pathname}#/share/${id}/${v.v}` : "";

  const onUpload = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const html = await f.text();
    await run(() => api.uploadVersion(id, html, f.name, user.id));
    e.target.value = "";
  };

  return (
    <Shell title={<><Link to={`/opportunities/${id}`} className="mut mono" style={{ textDecoration: "none" }}>{id}</Link> <span className="mut">/</span> Prototype studio</>}>
      <Link to={`/opportunities/${id}`} className="backbtn"><i className="ti ti-arrow-left" /> Back to {id}</Link>
      <div className="pagehead"><div><h1>Prototype studio</h1>
        <p>{p.opp.title}. Generate, share with the team, bring their feedback back, and let the governance scan check every version before you approve one for handoff.</p></div>
        {edit && count === 0 && <div className="acts"><button className="btn primary" disabled={busy} onClick={() => run(() => api.generatePrototype(id, user.id))}><i className="ti ti-bolt" /> Generate v1</button></div>}
      </div>
      {count === 0 ? (
        <Empty icon="ti-device-desktop" title="No prototype yet" text="Generate v1 from the opportunity. The agent grounds it in the description, linked signals and evidence." />
      ) : (
        <div className="studio">
          <div className="panel">
            <div className="phead"><i className="ti ti-message-2" /> Iterate with the agent <span className="right"><span className="tag">scripted agent · V1</span></span></div>
            <div className="chatbody">
              {p.chat.map((m, i) => (
                <div key={i} className={`msg ${m.role} ${m.warn ? "warn" : ""}`}>
                  <div className="ava"><i className={`ti ${m.role === "user" ? "ti-user" : m.warn ? "ti-alert-triangle" : "ti-robot"}`} /></div>
                  <div className="bub">{m.text}<div className="tiny" style={{ opacity: .6, marginTop: 3 }}>{m.role === "user" ? nameOf(m.by) : "Agent"} · {ago(m.at)}</div></div>
                </div>))}
              <div ref={chatEnd} />
            </div>
            {edit && <>
              <div className="suggest">{SUGGESTIONS.map((s) => <button key={s} onClick={() => send(s)} disabled={busy}>{s}</button>)}</div>
              <div className="chatin">
                <input className="input" placeholder="Ask for a change…" value={msg} onChange={(e) => setMsg(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send(msg)} />
                <button className="btn primary sm" aria-label="Send" disabled={busy || !msg.trim()} onClick={() => send(msg)}><i className="ti ti-arrow-up" /></button>
              </div></>}
          </div>

          <div className="panel">
            <div className="verbar">
              {p.versions.map((x) => (
                <button key={x.v} className={`ver ${x.v === v.v ? "on" : ""}`} onClick={() => setSel(x.v)} title={x.note}>
                  <span className="vn">v{x.v} {p.approvedVersion === x.v && <i className="ti ti-circle-check-filled" style={{ color: "var(--green)" }} />}
                    <i className={`ti ${worst(x.scan) === "block" ? "ti-ban" : worst(x.scan) === "flag" ? "ti-flag" : "ti-check"}`} style={{ color: worst(x.scan) === "block" ? "var(--red)" : worst(x.scan) === "flag" ? "var(--amber)" : "var(--green)", fontSize: 12 }} /></span>
                  <span className="vm">{x.author === "human" ? "Human" : "AI"} · {ago(x.at)}</span>
                </button>))}
              <div className="row" style={{ marginLeft: "auto", gap: 6 }}>
                <button className="btn out sm" onClick={() => { navigator.clipboard?.writeText(shareUrl); setShared(true); setTimeout(() => setShared(false), 2500); }}><i className={`ti ${shared ? "ti-check" : "ti-share"}`} /> {shared ? "Link copied" : "Share link"}</button>
                <a className="btn out sm" href={`#/share/${id}/${v.v}`} target="_blank" rel="noreferrer"><i className="ti ti-external-link" /> Open</a>
              </div>
            </div>
            <div className="row tiny" style={{ padding: "7px 14px", borderBottom: "1px solid var(--line)", background: "var(--surface-2)" }}>
              <b>v{v.v}</b><span className="soft grow">{v.note}{v.by && ` · ${nameOf(v.by)}`}</span>
              {p.approvedVersion === v.v ? <span className="status approved"><i className="ti ti-check" /> approved for handoff</span>
                : edit && <button className="btn green xs" disabled={worst(v.scan) === "block" || busy} title={worst(v.scan) === "block" ? "Fix the blocking issue first" : ""} onClick={() => run(() => api.approveVersion(id, v.v, user.id))}><i className="ti ti-check" /> Approve v{v.v}</button>}
            </div>
            <iframe className="frame" title={`Prototype v${v.v}`} srcDoc={v.html} sandbox="allow-same-origin" />
            <div className="scanbox">
              <div className="phead" style={{ padding: "9px 14px" }}><i className="ti ti-shield-search" /> Governance scan of v{v.v}
                <span className="right">{v.scan.length ? `${v.scan.filter((r) => r.outcome === "pass").length} of ${v.scan.length} checks pass` : "no gate checks apply"}</span></div>
              {v.scan.map((r) => (
                <div key={r.checkId} className="scanrow">
                  <span className={`sri ${r.outcome}`}><i className={`ti ${r.outcome === "block" ? "ti-ban" : r.outcome === "flag" ? "ti-flag" : "ti-check"}`} /></span>
                  <div className="grow"><b>{r.label}</b> <span className="faint">· {r.gateName}</span>{r.detail && <div className="tiny faint">{r.detail}</div>}</div>
                  <span className={`status ${r.outcome}`}>{r.outcome === "block" ? "blocks" : r.outcome === "flag" ? "review" : "pass"}</span>
                </div>))}
            </div>
          </div>
        </div>)}
      {error && <div className="note bad" style={{ marginTop: 12 }}><i className="ti ti-alert-triangle" /><div className="grow">{error}</div><button className="btn link small" onClick={() => setError(null)}>Dismiss</button></div>}
      {count > 0 && edit && (
        <div className="cols3" style={{ marginTop: 16 }}>
          <div className="card"><h3><i className="ti ti-messages" /> Team feedback <span className="right faint">{unusedFb.length} new</span></h3>
            {p.feedback.length === 0 && <div className="small faint">Share the link, then paste what the team says here.</div>}
            {p.feedback.slice(-4).map((f) => <div key={f.id} className="comment" style={{ opacity: f.used ? .55 : 1 }}>{f.text}<div className="tiny faint">{f.used ? "applied" : "new"} · {ago(f.at)}</div></div>)}
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn out sm" onClick={() => setFbOpen(true)}><i className="ti ti-clipboard-text" /> Paste feedback</button>
              <button className="btn primary sm" disabled={!unusedFb.length || busy} onClick={() => run(() => api.applyFeedback(id, user.id))}><i className="ti ti-sparkles" /> Make next version</button>
            </div>
          </div>
          <div className="card"><h3><i className="ti ti-file-import" /> Bring in an edited version</h3>
            <div className="small soft" style={{ lineHeight: 1.5 }}>A colleague edited the HTML by hand? Upload it as the next version. It gets the same governance scan as agent-built versions.</div>
            <input ref={fileRef} type="file" accept=".html,.htm,text/html" hidden onChange={onUpload} />
            <div className="row" style={{ marginTop: 10, flexWrap: "wrap" }}>
              <button className="btn out sm" onClick={() => fileRef.current.click()}><i className="ti ti-upload" /> Upload .html</button>
              <a className="btn link small" href="samples/alt-offer-v4-colleague.html" download><i className="ti ti-download" /> Sample file</a>
            </div>
          </div>
          <div className="card"><h3><i className="ti ti-send" /> When it's right</h3>
            <div className="small soft" style={{ lineHeight: 1.5 }}>Approve the version you want built. Then clear the gates and director approval on the opportunity and hand it off.</div>
            <Link className="btn out sm" style={{ marginTop: 10 }} to={`/opportunities/${id}`}><i className="ti ti-checklist" /> Check readiness</Link>
          </div>
        </div>)}
      {fbOpen && <FeedbackModal onClose={() => setFbOpen(false)} onSave={async (t) => { for (const line of t.split("\n").map((l) => l.trim()).filter(Boolean)) await api.addFeedback(id, line, user.id); setFbOpen(false); }} />}
    </Shell>
  );
}

function FeedbackModal({ onClose, onSave }) {
  const [t, setT] = useState("");
  return (
    <Modal title="Paste team feedback" icon="ti-clipboard-text" onClose={onClose}
      footer={<><button className="btn out sm" onClick={onClose}>Cancel</button><button className="btn primary sm" disabled={!t.trim()} onClick={() => onSave(t.trim())}>Add feedback</button></>}>
      <div className="small soft">One note per line becomes one feedback item. The agent applies them all in the next version.</div>
      <textarea className="textarea" style={{ minHeight: 130 }} autoFocus value={t} onChange={(e) => setT(e.target.value)} placeholder={"Design: make the text larger\nLegal: show taxes and fees on every price"} />
    </Modal>
  );
}
