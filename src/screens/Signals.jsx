import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Shell from "../components/Shell";
import { Empty, Spark } from "../components/ui";
import { useSession } from "../auth";
import { useQuery } from "../api/hooks";
import * as api from "../api";
import { can } from "../lib/perms";
import { ago, fmt } from "../lib/format";

export default function Signals() {
  const { user, stream } = useSession();
  const data = useQuery(() => api.listSignals(stream.id), [stream.id]);
  const opps = useQuery(() => api.listOpportunities([stream.id]), [stream.id]);
  const [showRest, setShowRest] = useState(false);
  const [showMuted, setShowMuted] = useState(false);
  if (!data) return <Shell title="Signals" />;
  const triage = can(user, "signal.triage");

  return (
    <Shell title={<><i className="ti ti-radar-2" style={{ color: "var(--navy)" }} /> Signals <span className="mut">· {stream.name}</span></>}>
      <div className="pagehead"><div><h1>Signals</h1>
        <p>What the connected sources are saying, clustered into themes and ranked by the signals agent. Each card says why it ranked where it did. Promote a theme to start an opportunity, or mute it.</p></div></div>
      <div className="grid2">
        <div>
          {data.top.length === 0 && <Empty icon="ti-radar-2" title="No signals for this value stream yet" text="Connect a source in Context & agents and the signals agent will start ranking themes on its next run." />}
          {data.top.map((s, i) => <SignalCard key={s.id} s={s} rank={i + 1} opps={opps || []} triage={triage} user={user} />)}
          {data.rest.length > 0 && (
            <>
              <button className="btn out sm" style={{ margin: "6px 0 12px" }} onClick={() => setShowRest(!showRest)}>
                <i className={`ti ti-chevron-${showRest ? "up" : "down"}`} /> Everything else ({data.rest.length} below the cap of {data.settings.cap})
              </button>
              {showRest && data.rest.map((s, i) => <SignalCard key={s.id} s={s} rank={data.top.length + i + 1} opps={opps || []} triage={triage} user={user} dim />)}
            </>)}
          {data.muted.length > 0 && (
            <>
              <button className="btn link small" style={{ display: "flex", margin: "6px 0 12px" }} onClick={() => setShowMuted(!showMuted)}>
                <i className="ti ti-volume-off" /> {showMuted ? "Hide" : "Show"} muted ({data.muted.length})
              </button>
              {showMuted && data.muted.map((s) => <SignalCard key={s.id} s={s} opps={opps || []} triage={triage} user={user} dim />)}
            </>)}
        </div>
        <div className="stack">
          <RankingRules data={data} editable={can(user, "signal.rules")} user={user} />
          <div className="card"><h3><i className="ti ti-target" /> Value-stream goals <span className="right faint">used for strategic fit</span></h3>
            {data.goals.length ? data.goals.map((g) => (
              <div key={g.id} className="check ok"><i className="ti ti-target-arrow" /><div><div style={{ fontWeight: 600 }}>{g.text}</div><div className="tiny faint">matches: {g.keywords.join(", ")}</div></div></div>))
              : <div className="small faint">No goals entered for this stream, so no signal can score on fit.</div>}
          </div>
        </div>
      </div>
    </Shell>
  );
}

function SignalCard({ s, rank, opps, triage, user, dim }) {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [linking, setLinking] = useState(false);
  const records = useQuery(() => (open ? api.getSignalRecords(s.id) : null), [open, s.id]);
  const f = s.factors;
  return (
    <div className={`sigcard ${dim ? "dim" : ""}`}>
      <div className="sigtop">
        <div className={`rank ${s.severity}`}>{rank ? `#${rank}` : "—"}<small>{s.score}</small></div>
        <div className="grow">
          <div className="row" style={{ alignItems: "flex-start" }}>
            <div className="sigtit grow">{s.theme}</div>
            <span className={`status ${s.severity === "High" ? "block" : s.severity === "Medium" ? "flag" : "none"}`}>{s.severity}</span>
          </div>
          <div className="why"><b>Why #{rank || "–"}:</b> {s.why}</div>
          <div className="factors">
            <span className={`factor ${f.volume.strong ? "on" : ""}`}><i className="ti ti-stack-2" /> Volume</span>
            <span className={`factor ${f.trend.strong ? "on" : ""}`}><i className="ti ti-trending-up" /> Trend</span>
            <span className={`factor ${f.reach.strong ? "on" : ""}`}><i className="ti ti-affiliate" /> Reach</span>
            <span className={`factor ${f.fit.strong ? "on" : ""}`}><i className="ti ti-target" /> Fit</span>
            {s.sources.map((src) => <span key={src.id} className="chip" style={{ padding: "1px 8px", fontSize: 11 }}><i className={`ti ${src.icon}`} style={{ fontSize: 13 }} /> {src.system}</span>)}
          </div>
        </div>
      </div>
      <div className="sigfoot">
        <Spark trend={s.trend} />
        <span className="tiny faint" style={{ marginRight: "auto" }}>8-week trend · {s.id}</span>
        <button className="btn link small" onClick={() => setOpen(!open)}><i className="ti ti-list-search" /> {open ? "Hide" : "See"} records</button>
        {s.promotedTo ? (
          <button className="btn out sm" onClick={() => nav(`/opportunities/${s.promotedTo}`)}><i className="ti ti-arrow-right" /> {s.promotedTo}</button>
        ) : triage && !s.muted && (
          <>
            {linking ? (
              <select className="select" style={{ width: 210, padding: "6px 9px", fontSize: 12.5 }} defaultValue="" onChange={async (e) => { if (e.target.value) { await api.linkSignal(e.target.value, s.id, user.id); setLinking(false); } }}>
                <option value="" disabled>Link to opportunity…</option>
                {opps.filter((o) => !o.handoff).map((o) => <option key={o.id} value={o.id}>{o.id} · {o.title.slice(0, 40)}</option>)}
              </select>
            ) : <button className="btn out sm" onClick={() => setLinking(true)}><i className="ti ti-link" /> Link</button>}
            <button className="btn primary sm" onClick={async () => { const id = await api.promoteSignal(s.id, user.id); nav(`/opportunities/${id}`); }}><i className="ti ti-arrow-up-right" /> Promote</button>
          </>)}
        {triage && <button className="iconbtn" title={s.muted ? "Unmute" : "Mute this theme"} aria-label={s.muted ? "Unmute" : "Mute"} onClick={() => api.setSignalMuted(s.id, !s.muted, user.id)}><i className={`ti ${s.muted ? "ti-volume" : "ti-volume-off"}`} /></button>}
      </div>
      {open && records && (
        <div className="records">
          <div className="tiny faint" style={{ marginBottom: 6 }}>
            Records behind this theme in the mock pack: {records.counts.contacts} support contacts · {records.counts.feedback} feedback items · {records.counts.web} web items. The headline volume ({fmt(s.volume)} {s.unit}) comes from the source system's totals.
          </div>
          {records.web.map((r) => <div key={r.id} className="rec"><span className="rid">{r.id}</span><div className="grow"><b>{r.title}</b><div className="tiny faint">{r.source} · {ago(r.created)}</div></div></div>)}
          {records.contacts.slice(0, 6).map((r) => <div key={r.id} className="rec"><span className="rid">{r.id}</span><div className="grow">“{r.text}”<div className="tiny faint">{r.channel} · {r.customerTier} · {r.category} · {ago(r.created)}</div></div></div>)}
          {records.feedback.slice(0, 3).map((r) => <div key={r.id} className="rec"><span className="rid">{r.id}</span><div className="grow">“{r.text}”<div className="tiny faint">{r.source} · {r.rating}★ · {ago(r.created)}</div></div></div>)}
          {!records.contacts.length && !records.feedback.length && !records.web.length && <div className="small faint">No raw records in the pack for this theme yet (M2 expands the pack).</div>}
        </div>)}
    </div>
  );
}

function RankingRules({ data, editable, user }) {
  const s = data.settings;
  const set = (patch) => api.updateSignalSettings(patch, user.id);
  const W = [["volume", "Volume", "how many records back it"], ["trend", "Trend", "growing over 8 weeks"], ["reach", "Reach", "how many sources agree"], ["fit", "Strategic fit", "matches a stream goal"]];
  return (
    <div className="card"><h3><i className="ti ti-adjustments" /> Ranking rules <span className="right faint">visible to everyone</span></h3>
      {W.map(([k, label, hint]) => (
        <div key={k} className="rule">
          <div style={{ width: 108 }}><div style={{ fontWeight: 600 }}>{label}</div><div className="tiny faint">{hint}</div></div>
          <input type="range" min="0" max="50" value={s.weights[k]} disabled={!editable} aria-label={`${label} weight`} onChange={(e) => set({ weights: { [k]: Number(e.target.value) } })} />
          <span className="val">{s.weights[k]}</span>
        </div>))}
      <div className="rule">
        <div style={{ width: 108 }}><div style={{ fontWeight: 600 }}>Cap</div><div className="tiny faint">themes shown</div></div>
        <input type="range" min="3" max="25" value={s.cap} disabled={!editable} aria-label="Cap" onChange={(e) => set({ cap: Number(e.target.value) })} />
        <span className="val">{s.cap}</span>
      </div>
      <div className="tiny faint" style={{ lineHeight: 1.5, marginTop: 10 }}>
        A factor is <b>strong</b> at ≥{fmt(s.thresholds.volume)} records, ≥{Math.round(s.thresholds.trend * 100)}% growth, or ≥{s.thresholds.reach} sources. <b>High</b> needs 3 strong factors, <b>Medium</b> needs 2. Weights set the score (0–100) used for order.
      </div>
      {editable && <button className="btn out sm" style={{ marginTop: 12 }} onClick={() => api.runAgent("agt-signals", user.id)}><i className="ti ti-player-play" /> Re-run signals agent</button>}
    </div>
  );
}
