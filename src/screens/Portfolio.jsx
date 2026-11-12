import { useNavigate } from "react-router-dom";
import Shell from "../components/Shell";
import { Empty } from "../components/ui";
import { useSession } from "../auth";
import { useQuery } from "../api/hooks";
import * as api from "../api";
import { ago } from "../lib/format";

const PHASE_COLORS = { Sense: "var(--line-2)", Shape: "var(--amber)", Prototype: "var(--accent)", Handoff: "var(--green)" };
const KIND = { approve: ["ti-user-check", "wait", "Approve"], rejected: ["ti-alert-triangle", "bad", "Review"], ready: ["ti-send", "ready", "Hand off"] };

export default function Portfolio() {
  const { user } = useSession();
  const nav = useNavigate();
  const p = useQuery(() => api.getPortfolio(user), [user.id]);
  if (!p) return <Shell title="Portfolio" />;
  const open = async (streamId, path) => { await api.setStream(streamId); nav(path); };
  const kpis = [
    [p.totals.open, "open opportunities", "ti-bulb"],
    [p.totals.high, "high-severity signals", "ti-radar-2"],
    [p.totals.unclaimed, "signals not yet on an opportunity", "ti-inbox"],
    [p.totals.gates, "gate reviews in progress", "ti-shield-check"],
    [p.totals.approvals, "waiting on your approval", "ti-user-check"],
    [p.totals.handedOff, "handed off to engineering", "ti-send"],
  ];
  const cols = { gridTemplateColumns: "1.3fr 2fr 120px 210px 90px 100px 24px" };

  return (
    <Shell title={<><i className="ti ti-layout-dashboard" style={{ color: "var(--navy)" }} /> Portfolio <span className="mut">· all value streams</span></>}>
      <div className="pagehead"><div><h1>Portfolio</h1>
        <p>Every value stream you own, in one view: what the signals are saying, where opportunities are in the loop, and what's waiting on you. Click a stream to work in it.</p></div></div>

      <div className="cols3" style={{ gridTemplateColumns: "repeat(6,1fr)", marginBottom: 18 }}>
        {kpis.map(([n, l, ic]) => (
          <div key={l} className="card" style={{ padding: "13px 15px" }}>
            <div className="row" style={{ gap: 7 }}><i className={`ti ${ic}`} style={{ color: "var(--ink-faint)", fontSize: 16 }} />
              <span style={{ fontFamily: "var(--cond)", fontSize: 26, fontWeight: 700, color: "var(--navy)", lineHeight: 1 }}>{n}</span></div>
            <div className="tiny faint" style={{ marginTop: 5 }}>{l}</div>
          </div>))}
      </div>

        <div className="card" style={{ marginBottom: 18 }}><h3><i className="ti ti-bell-ringing" /> Needs your attention <span className="right faint">{p.attention.length}</span></h3>
          {p.attention.length === 0 && <Empty icon="ti-circle-check" title="Nothing waiting on you" text="Opportunities that need your approval, were rejected at a gate, or are ready to hand off show up here." />}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(380px,1fr))", columnGap: 24 }}>{p.attention.map((a) => {
            const [ic, cls, cta] = KIND[a.kind];
            return (
              <div key={a.id} className="ev" style={{ cursor: "pointer" }} onClick={() => nav(`/opportunities/${a.id}`)}>
                <div className="evi" style={{ background: `var(--${cls === "bad" ? "red" : cls === "wait" ? "amber" : "green"}-soft)`, color: `var(--${cls === "bad" ? "red" : cls === "wait" ? "amber" : "green"}-ink)` }}><i className={`ti ${ic}`} /></div>
                <div className="grow"><div className="oid">{a.id} · {a.stream}</div><div className="small" style={{ fontWeight: 600 }}>{a.title}</div><div className="tiny faint">{a.why}</div></div>
                <span className="btn out xs">{cta}</span>
              </div>);
          })}</div>
        </div>

          <div className="table">
            <div className="tr head" style={cols}><span>Value stream</span><span>Top signal</span><span>Signals</span><span>Opportunities by phase</span><span>Gates</span><span>Agents</span><span /></div>
            {p.streams.map((s) => {
              const total = Object.values(s.phases).reduce((a, b) => a + b, 0);
              return (
                <div key={s.id} className="tr click" style={cols} onClick={() => open(s.id, "/signals")}>
                  <div className="row" style={{ gap: 11 }}><div className="lic"><i className={`ti ${s.icon}`} /></div>
                    <div><div className="lt">{s.name}</div><div className="ls">{s.owner ? `Owner ${s.owner}` : "No owner"}{s.lastActivity && ` · active ${ago(s.lastActivity)}`}</div></div></div>
                  <div className="small">{s.top ? <>
                    <span className={`status ${s.top.severity === "High" ? "block" : s.top.severity === "Medium" ? "flag" : "none"}`} style={{ marginRight: 6 }}>{s.top.score}</span>{s.top.theme}
                  </> : <span className="faint">No signals yet{s.goals ? "" : " · no goals set"}</span>}</div>
                  <div className="small">{s.signals.total ? <><b>{s.signals.high}</b> high<div className="tiny faint">{s.signals.total} total · {s.signals.unclaimed} unclaimed</div></> : <span className="faint">—</span>}</div>
                  <div>
                    {total ? <>
                      <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", background: "var(--surface-2)" }}>
                        {Object.entries(s.phases).map(([ph, n]) => n > 0 && <span key={ph} title={`${ph}: ${n}`} style={{ width: `${(n / total) * 100}%`, background: PHASE_COLORS[ph] }} />)}
                      </div>
                      <div className="tiny faint" style={{ marginTop: 4 }}>{Object.entries(s.phases).filter(([, n]) => n).map(([ph, n]) => `${n} ${ph}`).join(" · ")}</div>
                    </> : <span className="small faint">None yet</span>}
                  </div>
                  <div className="small">{s.pendingGates ? <span className="status pending">{s.pendingGates} open</span> : <span className="faint">—</span>}</div>
                  <div className="tiny soft">{s.agents.running} running{s.agents.paused ? <div style={{ color: "var(--amber-ink)" }}>{s.agents.paused} paused</div> : null}</div>
                  <i className="ti ti-chevron-right faint" />
                </div>);
            })}
          </div>
          <div className="row tiny faint" style={{ marginTop: 10, gap: 14 }}>
            {Object.entries(PHASE_COLORS).map(([ph, c]) => <span key={ph} className="row" style={{ gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: c }} />{ph}</span>)}
            <span style={{ marginLeft: "auto" }}>Agents shown are the stream-specific ones; shared agents serve every stream.</span>
          </div>

    </Shell>
  );
}
