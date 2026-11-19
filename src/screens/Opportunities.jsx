import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Shell from "../components/Shell";
import { Modal, Field, Empty, PHASES } from "../components/ui";
import { useSession } from "../auth";
import { useQuery } from "../api/hooks";
import * as api from "../api";
import { can } from "../lib/perms";
import { ago } from "../lib/format";

export default function Opportunities() {
  const { ws, user, stream } = useSession();
  const nav = useNavigate();
  const scope = user.persona === "pm" || user.persona === "director" ? [stream.id] : user.streams;
  const opps = useQuery(() => api.listOpportunities(scope), [scope.join()]);
  const [phase, setPhase] = useState("All");
  const [creating, setCreating] = useState(false);
  const [view, setView] = useState("board");
  const signoffs = useQuery(() => api.listSignoffs(user), [user.id]);
  const asked = (signoffs || []).filter((x) => x.asked);
  const list = (opps || []).filter((o) => phase === "All" || o.phase === phase);
  const cols = { gridTemplateColumns: "1fr 110px 150px 130px 70px 70px 100px" };

  return (
    <Shell title={<><i className="ti ti-bulb" style={{ color: "var(--navy)" }} /> Opportunities {scope.length === 1 && <span className="mut">· {stream.name}</span>}</>}>
      <div className="pagehead"><div><h1>Opportunities</h1>
        <p>Problems worth solving, each grounded in linked signals and evidence. Open one to shape it, prototype it with your team, clear its gates and hand it off.</p></div>
        {can(user, "opp.create") && <div className="acts"><button className="btn primary sm" onClick={() => setCreating(true)}><i className="ti ti-plus" /> Create opportunity</button></div>}
      </div>
      <div className="row" style={{ marginBottom: 14 }}>
        <div className="seg"><button className={view === "board" ? "on" : ""} onClick={() => setView("board")}><i className="ti ti-layout-kanban" /> Board</button><button className={view === "list" ? "on" : ""} onClick={() => setView("list")}><i className="ti ti-list" /> List</button></div>
        {view === "list" && <div className="seg">{["All", ...PHASES].map((p) => <button key={p} className={phase === p ? "on" : ""} onClick={() => setPhase(p)}>{p}</button>)}</div>}
        <span className="small faint" style={{ marginLeft: "auto" }}>{list.length} shown</span>
      </div>
      {asked.length > 0 && (
        <div className="signstrip">
          <div className="small" style={{ fontWeight: 700, marginBottom: 6 }}><i className="ti ti-user-check" /> Checklist tasks assigned to you · {asked.length}</div>
          {asked.map((x) => <div key={x.opp.id + x.item.id} className="row small" style={{ padding: "3px 0", cursor: "pointer" }} onClick={() => nav(`/opportunities/${x.opp.id}`)}>
            <span className="mono tiny">{x.opp.id}</span><span className="grow">{x.item.label} <span className="faint">· before {x.to} · assigned by {x.request.byName}</span></span><i className="ti ti-arrow-right faint" /></div>)}
        </div>)}
      {view === "board" && opps && <Board opps={opps} nav={nav} multi={scope.length > 1} />}
      {view === "list" && (list.length ? (
        <div className="table">
          <div className="tr head" style={cols}><span>Opportunity</span><span>Phase</span><span>Status</span><span>Next phase</span><span>Signals</span><span>Gates</span><span>Updated</span></div>
          {list.map((o) => (
            <div key={o.id} className="tr click" style={cols} onClick={() => nav(`/opportunities/${o.id}`)}>
              <div><div className="oid">{o.id}{scope.length > 1 && ` · ${o.stream}`}</div><div className="lt">{o.title}</div></div>
              <div><span className="tag">{o.phase}</span></div>
              <div><span className={`pill dot ${o.status.cls}`}>{o.status.label}</span></div>
              <div className="small" title={o.next ? `${o.next.done} of ${o.next.total} checklist items done before ${o.next.to}` : ""}>{o.next ? <span className={`status ${o.next.ready ? "ok" : "pending"}`}><i className={`ti ${o.next.ready ? "ti-lock-open" : "ti-lock"}`} />{o.next.to} {o.next.done}/{o.next.total}</span> : <span className="tiny faint">—</span>}</div>
              <div className="small soft"><i className="ti ti-radar-2" /> {o.signalCount}</div>
              <div className="small soft"><i className="ti ti-shield" /> {o.gateCount}</div>
              <div className="tiny faint">{ago(o.at)}</div>
            </div>))}
        </div>
      ) : <Empty icon="ti-bulb" title="No opportunities in this view" text="Promote a signal, or create one from an idea." />)}
      {creating && <CreateModal ws={ws} user={user} stream={stream} onClose={() => setCreating(false)} onCreated={(id) => nav(`/opportunities/${id}`)} />}
    </Shell>
  );
}

// Pipeline board: one column per phase. Each card shows what still blocks the next move,
// time in phase against the team's target, and open sign-off requests.
function Board({ opps, nav, multi }) {
  return (
    <div className="board">
      {PHASES.map((ph) => {
        const col = opps.filter((o) => o.phase === ph);
        return (
          <div key={ph} className="bcol">
            <h4>{ph} <span className="tag">{col.length}</span></h4>
            {col.length === 0 && <div className="tiny faint" style={{ padding: "4px 4px 8px" }}>Nothing here.</div>}
            {col.map((o) => {
              const n = o.next;
              return (
                <div key={o.id} className="bcard" onClick={() => nav(`/opportunities/${o.id}`)}>
                  <div className="row" style={{ gap: 6 }}><span className="oid">{o.id}{multi && ` · ${o.stream.split(" ·")[0]}`}</span><span className="grow" />
                    {n?.target && <span className={`tiny ${n.overdue ? "" : "faint"}`} style={n.overdue ? { color: "var(--amber-ink)", fontWeight: 700 } : null} title={`Target ${n.target} days in ${ph}`}><i className="ti ti-clock" /> {n.days}/{n.target}d</span>}</div>
                  <div className="t">{o.title}</div>
                  {n ? <>
                    <div className="meter"><span style={{ width: `${n.total ? (n.done / n.total) * 100 : 100}%`, background: n.ready ? "var(--green)" : "var(--amber)" }} /></div>
                    <div className="row tiny" style={{ marginTop: 5 }}><span className={n.ready ? "" : "faint"} style={n.ready ? { color: "var(--green-ink)", fontWeight: 700 } : null}>{n.ready ? `Ready for ${n.to}` : `${n.done}/${n.total} toward ${n.to}`}</span><span className="grow" />{o.signalCount > 0 && <span className="faint"><i className="ti ti-radar-2" /> {o.signalCount}</span>}</div>
                    {n.blockers.slice(0, 2).map((b) => <div key={b} className="blk"><i className="ti ti-lock" style={{ color: "var(--amber)" }} />{b}</div>)}
                    {n.blockers.length > 2 && <div className="blk faint">+{n.blockers.length - 2} more</div>}
                    {n.asks > 0 && <div className="blk"><i className="ti ti-send" style={{ color: "var(--accent-d)" }} />{n.asks} task{n.asks > 1 ? "s" : ""} assigned</div>}
                  </> : <span className={`pill dot ${o.status.cls}`}>{o.status.label}</span>}
                </div>);
            })}
          </div>);
      })}
    </div>
  );
}

function CreateModal({ ws, user, stream, onClose, onCreated }) {
  const [f, setF] = useState({ title: "", desc: "", streamId: stream.id });
  return (
    <Modal title="Create opportunity" icon="ti-bulb" onClose={onClose}
      footer={<><button className="btn out sm" onClick={onClose}>Cancel</button>
        <button className="btn primary sm" disabled={!f.title.trim()} onClick={async () => onCreated(await api.createOpportunity(f, user.id))}><i className="ti ti-sparkles" /> Create and find evidence</button></>}>
      <div className="guide" style={{ margin: 0 }}><i className="ti ti-info-circle" /><div>Start from a hunch or a leadership decision. It begins in <b>Sense</b>; the agent suggests signals from this value stream that match your description so you can ground it.</div></div>
      <Field label="Title"><input className="input" autoFocus value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Fare lock for price-sensitive travelers" /></Field>
      <Field label="Describe the problem and the outcome"><textarea className="textarea" value={f.desc} onChange={(e) => setF({ ...f, desc: e.target.value })} placeholder="Who has the problem, what it costs, and what better looks like." /></Field>
      {user.streams.length > 1 && <Field label="Value stream"><select className="select" value={f.streamId} onChange={(e) => setF({ ...f, streamId: e.target.value })}>
        {ws.streams.filter((s) => user.streams.includes(s.id)).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>}
    </Modal>
  );
}
