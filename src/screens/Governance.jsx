import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import Shell from "../components/Shell";
import { Modal, Field } from "../components/ui";
import { useSession } from "../auth";
import { useQuery } from "../api/hooks";
import * as api from "../api";
import { can, APPROVER_ROLES } from "../lib/perms";
import { ago } from "../lib/format";

export default function Governance() {
  const { user } = useSession();
  const g = useQuery(() => api.getGovernance(), []);
  const [modal, setModal] = useState(null);
  const [filter, setFilter] = useState("all");
  const admin = can(user, "gov.manage");
  if (!g) return <Shell title="Governance" />;
  const log = g.log.filter((l) => filter === "all" || l.kind === filter);
  const Beat = ({ n, title, sub, action }) => (
    <div className="row" style={{ margin: "22px 0 11px" }}>
      <div className="glyph" style={{ background: "var(--navy)", width: 30, height: 30 }}>{n}</div>
      <div className="grow"><div style={{ fontWeight: 700, fontSize: 15.5 }}>{title}</div><div className="small faint">{sub}</div></div>{action}
    </div>);

  return (
    <Shell title={<><i className="ti ti-shield-check" style={{ color: "var(--navy)" }} /> Governance</>}>
      <div className="pagehead"><div><h1>Governance</h1>
        <p>Three things: the policies you bring, the gates they become, and a log of every time a gate fires. In V1 the check is the governance agent reading opportunities and prototypes against each gate, plus a human approval.</p></div></div>

      <Beat n="1" title="Policies" sub="Uploaded documents or short rules typed in"
        action={admin && <button className="btn out sm" onClick={() => setModal("policy")}><i className="ti ti-plus" /> Add policy</button>} />
      <div className="table">{g.policies.map((p) => (
        <div key={p.id} className="lrow">
          <div className="lic" style={{ background: "var(--navy-soft)", borderColor: "transparent" }}><i className={`ti ${p.icon}`} /></div>
          <div className="grow"><div className="lt">{p.name}</div><div className="ls">{p.source === "upload" ? `Uploaded · ${p.file}` : "Rule defined in-app"} · {p.text.slice(0, 110)}{p.text.length > 110 ? "…" : ""}</div></div>
          <div className="row" style={{ gap: 5, flexWrap: "wrap", justifyContent: "flex-end" }}>{p.gates.length ? p.gates.map((x) => <span key={x.id} className="status ok"><i className="ti ti-arrow-right" />{x.name}</span>) : <span className="status none">no gate yet</span>}</div>
        </div>))}</div>

      <Beat n="2" title="Gates" sub="Trigger + approver + action. A block stops handoff until approved; a flag asks for review"
        action={admin && <button className="btn out sm" onClick={() => setModal("gate")}><i className="ti ti-plus" /> Create gate</button>} />
      <div className="table">{g.gates.map((x) => (
        <div key={x.id} className="lrow" style={{ opacity: x.enabled === false ? .55 : 1 }}>
          <div className="lic" style={{ background: x.action === "block" ? "var(--red-soft)" : "var(--amber-soft)", color: x.action === "block" ? "var(--red)" : "var(--amber-ink)", borderColor: "transparent" }}><i className={`ti ${x.action === "block" ? "ti-shield-lock" : "ti-flag"}`} /></div>
          <div className="grow"><div className="lt">{x.name}</div>
            <div className="ls">Triggers {x.trigger}{x.keywords.length ? ` (words: ${x.keywords.join(", ")})` : ""} · from <b className="soft">{x.policy?.name}</b></div>
            {x.checks.length > 0 && <div className="tiny faint" style={{ marginTop: 3 }}>Prototype checks: {x.checks.map((c) => c.label).join(" · ")}</div>}</div>
          <span className="tag">{x.approverRole}</span>
          <span className={`status ${x.action === "block" ? "block" : "flag"}`}>{x.action}</span>
          {admin && <label className="row tiny" style={{ gap: 5, cursor: "pointer" }}><input type="checkbox" checked={x.enabled !== false} onChange={(e) => api.saveGate({ id: x.id, enabled: e.target.checked }, user.id)} /> on</label>}
        </div>))}</div>

      <Beat n="3" title="Gate log" sub="Every time a gate fires: flagged, blocked, or passed"
        action={<div className="seg">{["all", "flag", "block", "pass"].map((k) => <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{k}</button>)}</div>} />
      <div className="table">{log.map((l) => (
        <div key={l.id} className="lrow">
          <span className={`sri ${l.kind}`} style={{ width: 28, height: 28, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", background: `var(--${l.kind === "block" ? "red" : l.kind === "flag" ? "amber" : "green"}-soft)`, color: `var(--${l.kind === "block" ? "red" : l.kind === "flag" ? "amber" : "green"}${l.kind === "block" ? "" : "-ink"})` }}>
            <i className={`ti ${l.kind === "block" ? "ti-ban" : l.kind === "flag" ? "ti-flag" : "ti-check"}`} /></span>
          <div className="grow"><div className="small" style={{ fontWeight: 500 }}>{l.text}</div>
            <div className="tiny faint mono"><Link to={`/opportunities/${l.oppId}`}>{l.oppId}</Link>{l.gateName && ` · ${l.gateName}`} · {l.byName} · {ago(l.at)}</div></div>
          <span className={`status ${l.kind}`}>{l.kind === "pass" ? "passed" : l.kind === "block" ? "blocked" : "flagged"}</span>
        </div>))}</div>

      {modal === "policy" && <PolicyModal user={user} onClose={() => setModal(null)} />}
      {modal === "gate" && <GateModal user={user} policies={g.policies} onClose={() => setModal(null)} />}
    </Shell>
  );
}

function PolicyModal({ user, onClose }) {
  const [f, setF] = useState({ name: "", source: "rule", file: null, text: "" });
  const ref = useRef();
  const onFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const isText = /text|json|markdown/.test(file.type) || /\.(md|txt)$/i.test(file.name);
    setF({ ...f, source: "upload", file: file.name, name: f.name || file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "), text: isText ? (await file.text()).slice(0, 4000) : `${file.name} (PDF text extraction runs in the client build)` });
  };
  return (
    <Modal title="Add policy" icon="ti-file-text" onClose={onClose}
      footer={<><button className="btn out sm" onClick={onClose}>Cancel</button><button className="btn primary sm" disabled={!f.name.trim() || !f.text.trim()} onClick={async () => { await api.addPolicy(f, user.id); onClose(); }}>Add policy</button></>}>
      <div className="seg"><button className={f.source === "rule" ? "on" : ""} onClick={() => setF({ ...f, source: "rule", file: null })}>Type a rule</button><button className={f.source === "upload" ? "on" : ""} onClick={() => ref.current.click()}>Upload a document</button></div>
      <input ref={ref} type="file" hidden onChange={onFile} />
      {f.file && <div className="chip"><i className="ti ti-file" /> {f.file}</div>}
      <Field label="Name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Brand & tone guidelines" /></Field>
      <Field label="Policy text"><textarea className="textarea" value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} placeholder="What must always or never happen." /></Field>
      <div className="small faint">Next, create a gate from it. Auto-generating gates from long documents is deferred past V1.</div>
    </Modal>
  );
}

function GateModal({ user, policies, onClose }) {
  const [f, setF] = useState({ name: "", policyId: policies[0]?.id, trigger: "", keywords: "", triggerAll: false, approverRole: "Legal", action: "flag", forbid: "" });
  const save = async () => {
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const checks = f.forbid.trim() ? [{ id: `c-${Date.now()}`, type: "forbid", pattern: esc(f.forbid.trim()), label: `Prototype contains “${f.forbid.trim()}”`, outcome: f.action }] : [];
    await api.saveGate({
      name: f.name.trim(), policyId: f.policyId, trigger: f.trigger.trim() || (f.triggerAll ? "on every opportunity" : `when an opportunity mentions ${f.keywords}`),
      keywords: f.keywords.split(",").map((k) => k.trim()).filter(Boolean), triggerAll: f.triggerAll, approverRole: f.approverRole, action: f.action, checks,
    }, user.id);
    onClose();
  };
  const valid = f.name.trim() && (f.triggerAll || f.keywords.trim());
  return (
    <Modal title="Create gate" icon="ti-shield-bolt" onClose={onClose}
      footer={<><button className="btn out sm" onClick={onClose}>Cancel</button><button className="btn primary sm" disabled={!valid} onClick={save}>Create gate</button></>}>
      <Field label="Gate name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Brand review" /></Field>
      <Field label="From policy"><select className="select" value={f.policyId} onChange={(e) => setF({ ...f, policyId: e.target.value })}>{policies.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
      <Field label="Trigger: opportunity mentions any of (comma-separated)">
        <input className="input" value={f.keywords} disabled={f.triggerAll} onChange={(e) => setF({ ...f, keywords: e.target.value })} placeholder="e.g. logo, brand, campaign" />
        <label className="row small" style={{ gap: 6, marginTop: 4 }}><input type="checkbox" checked={f.triggerAll} onChange={(e) => setF({ ...f, triggerAll: e.target.checked })} /> Applies to every opportunity</label>
      </Field>
      <Field label="Trigger, in words (shown to PMs)"><input className="input" value={f.trigger} onChange={(e) => setF({ ...f, trigger: e.target.value })} placeholder="when an opportunity changes brand assets" /></Field>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <div className="grow"><Field label="Approver role"><select className="select" value={f.approverRole} onChange={(e) => setF({ ...f, approverRole: e.target.value })}>{APPROVER_ROLES.map((r) => <option key={r}>{r}</option>)}</select></Field></div>
        <div className="grow"><Field label="Action"><select className="select" value={f.action} onChange={(e) => setF({ ...f, action: e.target.value })}><option value="flag">Flag for review</option><option value="block">Block handoff until approved</option></select></Field></div>
      </div>
      <Field label="Prototype check (optional): fail if the prototype contains"><input className="input" value={f.forbid} onChange={(e) => setF({ ...f, forbid: e.target.value })} placeholder="e.g. guaranteed" /></Field>
    </Modal>
  );
}
