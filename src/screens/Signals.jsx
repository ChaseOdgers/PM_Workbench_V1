import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Shell from "../components/Shell";
import { Empty, Spark } from "../components/ui";
import { useSession } from "../auth";
import { useQuery } from "../api/hooks";
import * as api from "../api";
import { GettingStarted } from "./Watchers";
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
      <GettingStarted />
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
            <div className="sigtit grow">{s.theme}{s.generatedBy && <span className="tag" style={{ marginLeft: 8, verticalAlign: 2, background: "var(--green-soft)", color: "var(--green-ink)", borderColor: "transparent" }}><i className="ti ti-bolt" style={{ fontSize: 11 }} /> real data</span>}</div>
            <span className={`status ${s.severity === "High" ? "block" : s.severity === "Medium" ? "flag" : "none"}`}>{s.severity}</span>
          </div>
          <div className="why"><b>Why #{rank || "–"}:</b> {s.why}</div>
          <div className="factors">
            {[["volume", "ti-stack-2", "Volume"], ["trend", "ti-trending-up", "Trend"], ["reach", "ti-affiliate", "Sources"], ["fit", "ti-target", "Goal fit"]].map(([k, ic, lb]) => (
              <span key={k} className={`factor ${f[k].strong ? "on" : ""}`} title={`${s.points?.[k] ?? 0} of ${s.score} points from ${lb.toLowerCase()}`}><i className={`ti ${ic}`} /> {lb} <b className="pts">+{s.points?.[k] ?? 0}</b></span>))}
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
            Records behind this theme in the context layer: {records.counts.contacts} support contacts · {records.counts.feedback} feedback items · {records.counts.web} web items.{s.series ? " Measured weekly in analytics or the warehouse: the volume is the last 12 weeks' total." : s.generatedBy ? " Raised from real data: the volume is the record count." : ` The headline volume (${fmt(s.volume)} ${s.unit}) comes from the source system's totals.`}
          </div>
          {s.series && <div className="row small" style={{ gap: 10, padding: "6px 0" }}><i className="ti ti-chart-line" /><span className="grow">{s.metricLabel || s.theme} · weekly from {s.sources.map((x) => x.system).join(", ")}</span>
            <span className="mono tiny">{s.series.slice(-6).map((w) => w.value.toLocaleString()).join(" · ")}</span></div>}
          {records.web.map((r, i) => <div key={r.id + i} className="rec"><span className="rid">{r.id}</span><div className="grow"><b>{r.url ? <a href={r.url} target="_blank" rel="noreferrer">{r.title}</a> : r.title}</b><div className="tiny faint">{r.source} · {ago(r.created)}</div></div></div>)}
          {records.contacts.slice(0, 6).map((r, i) => <div key={r.id + i} className="rec"><span className="rid">{r.id}</span><div className="grow">“{r.text}”<div className="tiny faint">{[r.channel, r.customerTier, r.category, ago(r.created)].filter(Boolean).join(" · ")}</div></div></div>)}
          {records.feedback.slice(0, 3).map((r, i) => <div key={r.id + i} className="rec"><span className="rid">{r.id}</span><div className="grow">“{r.text}”<div className="tiny faint">{[r.source, r.rating ? `${r.rating}★` : "", ago(r.created)].filter(Boolean).join(" · ")}</div></div></div>)}
          {!records.contacts.length && !records.feedback.length && !records.web.length && <div className="small faint">No raw records in the pack for this theme yet (M2 expands the pack).</div>}
        </div>)}
    </div>
  );
}

export const RANK_PRESETS = [
  { id: "balanced", label: "Balanced", icon: "ti-scale", hint: "A bit of everything. Good default.", weights: { volume: 30, trend: 25, reach: 20, fit: 25 } },
  { id: "volume", label: "Biggest problems", icon: "ti-stack-2", hint: "Most customers affected rises to the top.", weights: { volume: 55, trend: 15, reach: 15, fit: 15 } },
  { id: "trend", label: "Fastest growing", icon: "ti-trending-up", hint: "Catch issues early, while they're still climbing.", weights: { volume: 15, trend: 55, reach: 15, fit: 15 } },
  { id: "fit", label: "Strategy first", icon: "ti-target", hint: "Themes tied to this year's stream goals lead.", weights: { volume: 20, trend: 15, reach: 15, fit: 50 } },
];
const same = (a, b) => ["volume", "trend", "reach", "fit"].every((k) => a[k] === b[k]);

function RankingRules({ data, editable, user }) {
  const s = data.settings;
  const set = (patch) => api.updateSignalSettings(patch, user.id);
  const current = RANK_PRESETS.find((p) => same(p.weights, s.weights));
  return (
    <div className="card"><h3><i className="ti ti-adjustments" /> How signals are ranked <span className="right faint">visible to everyone</span></h3>
      <div className="tiny" style={{ lineHeight: 1.5, color: "var(--ink-soft)" }}>
        The signals agent scores every theme out of 100 from four things it can count in the data: <b>how many records</b> mention it, <b>whether it's growing</b> over 8 weeks, <b>how many sources</b> agree, and <b>whether it matches a stream goal</b>. Each card shows where its points came from.
      </div>
      <div className="tiny faint" style={{ margin: "12px 0 6px", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em" }}>Rank by</div>
      <div className="presets">
        {RANK_PRESETS.map((p) => (
          <button key={p.id} className={`preset ${current?.id === p.id ? "on" : ""}`} disabled={!editable} onClick={() => set({ weights: p.weights })}>
            <i className={`ti ${p.icon}`} /><div><b>{p.label}</b><div className="tiny faint">{p.hint}</div></div>
          </button>))}
      </div>
      {!current && <div className="tiny faint" style={{ marginTop: 6 }}>Custom mix in use ({["volume", "trend", "reach", "fit"].map((k) => s.weights[k]).join(" / ")}).</div>}
      <div className="row" style={{ marginTop: 12, gap: 8 }}>
        <span className="tiny" style={{ fontWeight: 600, whiteSpace: "nowrap" }}>Show top</span>
        <select value={s.cap} disabled={!editable} aria-label="Show top" onChange={(e) => set({ cap: Number(e.target.value) })}>
          {[...new Set([5, 10, 15, 25, s.cap])].sort((a, b) => a - b).map((n) => <option key={n} value={n}>{n} themes</option>)}
        </select>
        <span className="tiny faint">the rest stay below, nothing is hidden</span>
      </div>
      <div className="tiny faint" style={{ lineHeight: 1.5, marginTop: 10 }}>
        <b>High</b> = 3 of 4 are strong (≥{fmt(s.thresholds.volume)} records, ≥{Math.round(s.thresholds.trend * 100)}% growth, ≥{s.thresholds.reach} sources, goal match). <b>Medium</b> = 2.
      </div>
      {editable && <button className="btn out sm" style={{ marginTop: 12 }} onClick={() => api.runAgent("agt-signals", user.id)}><i className="ti ti-player-play" /> Re-run signals agent</button>}
    </div>
  );
}
