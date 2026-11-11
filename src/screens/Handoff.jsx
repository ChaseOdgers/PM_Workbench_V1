import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Shell from "../components/Shell";
import { Empty } from "../components/ui";
import { useSession } from "../auth";
import { useQuery, useAction } from "../api/hooks";
import * as api from "../api";
import { can } from "../lib/perms";
import { ago } from "../lib/format";

function toMarkdown(b, o) {
  return `# ${b.title}\n\n_${o.id} · handoff brief_\n\n## Scope\n${b.scope}\n\n## Non-goals\n${b.nonGoals.split("\n").map((l) => `- ${l}`).join("\n")}\n\n## Acceptance criteria\n${b.acceptance.split("\n").map((l) => `- [ ] ${l}`).join("\n")}\n\n## Linked signals\n${b.signals.map((s) => `- ${s.id}: ${s.theme} (${s.volume.toLocaleString()} ${s.unit})`).join("\n")}\n\n## Evidence\n${b.evidence.map((e) => `- ${e}`).join("\n") || "- none"}\n\n## Approved prototype\n${b.prototype ? `v${b.prototype.v}: ${b.prototype.note}` : "none"}\n\n## Governance\n${b.gates.map((g) => `- ${g.name}: ${g.status}${g.by && g.status !== "not started" ? ` (${g.by})` : ""}`).join("\n")}\n`;
}

export default function Handoff() {
  const { id } = useParams();
  const { user } = useSession();
  const nav = useNavigate();
  const o = useQuery(() => api.getOpportunity(id), [id]);
  const draft = useQuery(() => api.draftHandoff(id), [id]);
  const [b, setB] = useState(null);
  const [system, setSystem] = useState("ADO");
  const { run, busy } = useAction();
  useEffect(() => { if (draft && !b) { setB(o?.handoff?.brief || draft); setSystem(draft.system); } }, [draft, o, b]);
  if (!o || !b) return <Shell title="Handoff" />;
  const done = !!o.handoff;
  const allowed = can(user, "handoff") && o.readiness.ready && !done;

  const download = () => {
    const url = URL.createObjectURL(new Blob([toMarkdown(b, o)], { type: "text/markdown" }));
    Object.assign(document.createElement("a"), { href: url, download: `${o.id}-handoff-brief.md` }).click();
  };
  const List = ({ k, label, icon }) => (
    <>
      <h2><i className={`ti ${icon}`} /> {label}</h2>
      {done ? <ul>{b[k].split("\n").filter(Boolean).map((l, i) => <li key={i}>{l}</li>)}</ul>
        : <textarea className="textarea" style={{ minHeight: 40 + b[k].split("\n").length * 22 }} value={b[k]} onChange={(e) => setB({ ...b, [k]: e.target.value })} />}
    </>
  );

  return (
    <Shell title={<><Link to={`/opportunities/${id}`} className="mut mono" style={{ textDecoration: "none" }}>{id}</Link> <span className="mut">/</span> Handoff brief</>}>
      <Link to={`/opportunities/${id}`} className="backbtn"><i className="ti ti-arrow-left" /> Back to {id}</Link>
      <div className="pagehead"><div><h1>Handoff brief</h1>
        <p>{done ? `Handed off ${ago(o.handoff.at)} as ${o.handoff.system} epic ${o.handoff.epic}.` : "The agent drafted this from the opportunity, its signals, the approved prototype and the gate decisions. Edit anything, then push it as an epic with one story per acceptance criterion."}</p></div>
        <div className="acts">
          <button className="btn out sm" onClick={download}><i className="ti ti-download" /> Download .md</button>
          {!done && <>
            <select className="select" style={{ width: 150, padding: "7px 10px", fontSize: 13 }} value={system} onChange={(e) => setSystem(e.target.value)} aria-label="Target system">
              <option value="ADO">Azure DevOps</option><option value="Jira">Jira</option></select>
            <button className="btn primary sm" disabled={!allowed || busy} onClick={() => run(async () => { await api.pushHandoff(id, b, system, user.id); nav(`/opportunities/${id}`); })}><i className="ti ti-send" /> Push to {system}</button></>}
        </div>
      </div>
      {!done && !o.readiness.ready && <div className="note warn" style={{ marginBottom: 16, maxWidth: 860 }}><i className="ti ti-lock" /><div>Not ready to push yet: {o.readiness.items.filter((i) => !i.ok && i.blocking !== false).map((i) => i.label).join("; ")}. You can still edit and download the brief.</div></div>}
      <div className="brief">
        <div className="oid">{o.id} · {o.stream.name}</div>
        <h1 style={{ fontSize: 22, margin: "4px 0 18px" }}>{b.title}</h1>
        <h2><i className="ti ti-target" /> Scope</h2>
        {done ? <p style={{ lineHeight: 1.55 }}>{b.scope}</p> : <textarea className="textarea" value={b.scope} onChange={(e) => setB({ ...b, scope: e.target.value })} />}
        <List k="nonGoals" label="Non-goals" icon="ti-circle-off" />
        <List k="acceptance" label="Acceptance criteria (one story each)" icon="ti-checklist" />
        <h2><i className="ti ti-radar-2" /> Linked signals</h2>
        <ul>{b.signals.map((s) => <li key={s.id}><span className="mono tiny">{s.id}</span> {s.theme} · {s.volume.toLocaleString()} {s.unit}</li>)}</ul>
        <h2><i className="ti ti-paperclip" /> Evidence</h2>
        {b.evidence.length ? <ul>{b.evidence.map((e, i) => <li key={i}>{e}</li>)}</ul> : <div className="small faint">None attached.</div>}
        <h2><i className="ti ti-device-desktop" /> Approved prototype</h2>
        {b.prototype ? <div className="small">v{b.prototype.v}: {b.prototype.note} · <a href={b.prototype.link} target="_blank" rel="noreferrer">open</a></div> : <div className="small faint">No version approved yet.</div>}
        <h2><i className="ti ti-shield-check" /> Governance</h2>
        <ul>{b.gates.map((g) => <li key={g.name}>{g.name}: <span className={`status ${g.status === "not started" ? "none" : g.status}`}>{g.status}</span>{g.status === "approved" && ` by ${g.by}`}</li>)}</ul>
      </div>
      {done && o.workItems.length > 0 && <div className="note" style={{ marginTop: 16, maxWidth: 860 }}><i className="ti ti-circle-check" /><div>Created in {o.handoff.system}: {o.workItems.map((w) => w.key).join(", ")}. (Mock connector: in a client build this calls the {o.handoff.system} API.)</div></div>}
    </Shell>
  );
}
