import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "../api/hooks";
import * as api from "../api";
import { can } from "../lib/perms";
import { ago } from "../lib/format";
import { Modal, Field } from "../components/ui";
import { parseFile } from "../lib/ingest";
import { LOCAL_BASE, HOSTED_BASE } from "../lib/enterprise";

export const INTERVALS = [[15, "15 seconds"], [30, "30 seconds"], [60, "1 minute"], [300, "5 minutes"], [3600, "1 hour"]];
const MAP_FIELDS = [["text", "Record text", true], ["title", "Subject / title"], ["date", "Created date"], ["id", "Record ID"], ["category", "Category"], ["channel", "Channel / source"], ["rating", "Rating"], ["tier", "Customer tier"]];

// Re-render every second, for live countdowns.
function useTick() { const [, set] = useState(0); useEffect(() => { const t = setInterval(() => set((x) => x + 1), 1000); return () => clearInterval(t); }, []); }

/* ---------- connect any REST API ---------- */
export function RestConnect({ user, stream, streams, onDone, onClose, picker }) {
  const cfg = useQuery(() => api.getMockApi(), []);
  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const [base, setBase] = useState(null);
  const [cat, setCat] = useState(null);
  const [p, setP] = useState(null);
  const [map, setMap] = useState({});
  const [type, setType] = useState("support");
  const [name, setName] = useState("");
  const [streamId, setStreamId] = useState(stream.id);
  const [watch, setWatch] = useState(true);
  const [interval, setIntervalSec] = useState(30);
  const [minNew, setMinNew] = useState(10);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => { if (cfg && base == null) setBase(cfg.base === HOSTED_BASE ? LOCAL_BASE : cfg.base); }, [cfg, base]);

  const test = async (u = url, label) => {
    setBusy("test"); setErr(""); setP(null);
    try {
      const r = await api.probeApi(u.trim(), key.trim());
      setP(r); setMap(r.mapping || {}); setType(r.recordType || "support");
      if (label || !name) setName(label || u.split("?")[0].split("/").slice(-2).join(" ").replace(/\.json$/, "").replace(/[-_/]+/g, " ").replace(/^\w/, (x) => x.toUpperCase()));
    } catch (e) { setErr(`Couldn't use that endpoint: ${e.message}.`); }
    setBusy("");
  };
  const loadCat = async () => {
    setBusy("cat"); setErr("");
    try { setCat(await api.apiCatalog(base.trim())); } catch (e) { setErr(`Couldn't read the catalog at ${base}/v1/index.json: ${e.message}.`); }
    setBusy("");
  };
  const NAMES = { "salesforce/cases": "Salesforce cases", "chatbot/conversations": "Chatbot conversations", "medallia/responses": "Medallia survey responses", "appstore/reviews": "App store reviews", "cargo/exceptions": "Cargo shipment exceptions", "ops/disruptions": "Ops disruptions", "adobe/metrics": "Adobe Analytics metrics", "snowflake/kpis": "Snowflake KPIs" };
  const go = async () => {
    setBusy("connect"); setErr("");
    try {
      const r = await api.connectRest({ name: name.trim(), url: url.trim(), key: key.trim(), mapping: map, recordType: type, streamId, metrics: p.kind === "metrics",
        watch: watch ? { intervalSec: interval, rules: { minNew } } : null }, user.id);
      onDone({ ...r, watching: watch ? { interval, minNew } : null });
    } catch (e) { setErr(e.message); setBusy(""); }
  };
  return (
    <Modal wide title="Connect an API" icon="ti-api" onClose={onClose}
      footer={<><button className="btn out sm" onClick={onClose}>Cancel</button>
        <button className="btn primary sm" disabled={!p || (p.kind === "records" && !map.text) || !name.trim() || !!busy} onClick={go}>{busy === "connect" ? <i className="ti ti-loader-2 spin" /> : <i className="ti ti-plug-connected" />} Connect{watch ? " and watch" : ""}</button></>}>
      {picker}
      <div className="note"><i className="ti ti-bolt" /><div><b>Any existing API.</b> Paste an endpoint that returns JSON: a list of tickets, reviews or survey responses, or weekly metrics. The Workbench finds the records, maps the fields and themes every record into signals. No custom connector code.</div></div>
      <Field label="Endpoint URL">
        <div className="row" style={{ gap: 8 }}>
          <input className="input grow" placeholder="https://api.example.com/v1/cases" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && url.trim() && test()} />
          <input className="input" style={{ width: 170 }} placeholder="API key (optional)" value={key} onChange={(e) => setKey(e.target.value)} />
          <button className="btn out sm" disabled={!url.trim() || !!busy} onClick={() => test()}>{busy === "test" ? <i className="ti ti-loader-2 spin" /> : <i className="ti ti-plug" />} Test</button>
        </div>
      </Field>
      <div className="catbox">
        <div className="row" style={{ gap: 8 }}>
          <span className="small" style={{ fontWeight: 600 }}><i className="ti ti-server-2" /> Or pick from the mock enterprise API</span>
          <input className="input inl" style={{ maxWidth: 300 }} value={base || ""} onChange={(e) => setBase(e.target.value)} aria-label="Mock API base URL" />
          <button className="btn link small" disabled={!base || !!busy} onClick={loadCat}>{busy === "cat" ? "Loading…" : cat ? "Reload" : "Show endpoints"}</button>
        </div>
        {cat && <div className="chips" style={{ marginTop: 8 }}>{cat.map((c) => (
          <button key={c.endpoint} className="chip" style={{ cursor: "pointer", borderColor: url === c.url ? "var(--accent)" : undefined, background: url === c.url ? "var(--accent-soft)" : undefined }}
            onClick={() => { setUrl(c.url); test(c.url, NAMES[c.endpoint] || c.endpoint); }}><i className="ti ti-api" /> {c.endpoint} <b>{c.count}</b></button>))}</div>}
      </div>
      {err && <div className="tiny" style={{ color: "var(--red-ink)" }}><i className="ti ti-alert-triangle" /> {err}</div>}
      {p && p.kind === "metrics" && <div className="card" style={{ padding: 12 }}>
        <div className="small"><i className="ti ti-circle-check" style={{ color: "var(--green)" }} /> Found <b>{p.count}</b> weekly metric series under <span className="mono">{p.path}</span>. Each one updates or raises a signal.</div>
        {p.series.map((s) => <div key={s.label} className="tiny faint" style={{ marginTop: 4 }}>{s.label} · last week {Number(s.last).toLocaleString()} {s.unit}</div>)}
      </div>}
      {p && p.kind === "records" && <>
        <div className="small"><i className="ti ti-circle-check" style={{ color: "var(--green)" }} /> Connected. Found <b>{p.count.toLocaleString()}</b> records under <span className="mono">{p.path}</span>, {p.headers.length} fields.</div>
        <div style={{ overflowX: "auto", border: "1px solid var(--line)", borderRadius: 9 }}>
          <table style={{ borderCollapse: "collapse", fontSize: 11.5, width: "100%" }}>
            <thead><tr>{p.headers.slice(0, 7).map((h) => <th key={h} style={{ textAlign: "left", padding: "6px 9px", background: "var(--surface-2)", borderBottom: "1px solid var(--line)", whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
            <tbody>{p.preview.map((r, i) => <tr key={i}>{p.headers.slice(0, 7).map((h) => <td key={h} style={{ padding: "5px 9px", borderBottom: "1px solid var(--line)", maxWidth: 220, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r[h]}</td>)}</tr>)}</tbody>
          </table>
        </div>
        <Field label="Fields (guessed; change any)">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 9 }}>
            {MAP_FIELDS.filter(([k]) => k !== "rating" || type === "feedback").map(([k, label, req]) => (
              <label key={k} className="tiny faint" style={{ display: "flex", flexDirection: "column", gap: 3 }}>{label}{req ? " *" : ""}
                <select className="select" style={{ padding: "5px 8px", fontSize: 12 }} value={map[k] || ""} onChange={(e) => setMap({ ...map, [k]: e.target.value || undefined })}>
                  <option value="">{req ? "Choose…" : "— none —"}</option>{p.headers.map((h) => <option key={h}>{h}</option>)}</select></label>))}
          </div>
        </Field>
        <div className="row" style={{ alignItems: "flex-start" }}>
          <div className="grow"><Field label="These records are"><select className="select" value={type} onChange={(e) => setType(e.target.value)}><option value="support">Support cases / tickets / chats</option><option value="feedback">Feedback, reviews or survey responses</option></select></Field></div>
          <div className="grow"><Field label="New themes go to"><select className="select" value={streamId} onChange={(e) => setStreamId(e.target.value)}>{streams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field></div>
        </div>
      </>}
      {p && <>
        <Field label="Name in the Workbench"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <div className="watchbox">
          <label className="row small" style={{ gap: 8, fontWeight: 600, cursor: "pointer" }}><input type="checkbox" checked={watch} onChange={(e) => setWatch(e.target.checked)} /><i className="ti ti-eye" /> Have an agent watch this source for opportunities</label>
          {watch && <div className="small soft row" style={{ gap: 6, flexWrap: "wrap", marginTop: 8 }}>Check it every
            <select className="select" style={{ width: "auto", padding: "3px 8px", fontSize: 12.5 }} value={interval} onChange={(e) => setIntervalSec(Number(e.target.value))}>{INTERVALS.map(([s, l]) => <option key={s} value={s}>{l}</option>)}</select>
            and draft an opportunity when a theme gets
            <input className="input inl" type="number" min="1" style={{ width: 62, flex: "none" }} value={minNew} onChange={(e) => setMinNew(Math.max(1, Number(e.target.value) || 1))} />
            new records between checks.</div>}
        </div>
      </>}
    </Modal>
  );
}

/* ---------- watcher agents ---------- */
export function WatcherCard({ a, user, sources }) {
  useTick();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const edit = can(user, "agents.watch");
  const runs = useQuery(() => api.listAgents().then((all) => all.find((x) => x.id === a.id)?.runs || []), [a.id, a.lastRun]);
  const next = a.lastRun ? Math.max(0, Math.ceil((Date.parse(a.lastRun) + a.intervalSec * 1000 - Date.now()) / 1000)) : 0;
  const srcs = a.sourceIds.map((id) => sources.find((s) => s.id === id)).filter(Boolean);
  const set = (patch) => api.updateWatcher(a.id, patch, user.id);
  return (
    <div className={`card watcher ${a.state}`}>
      <div className="row" style={{ alignItems: "flex-start", gap: 14 }}>
        <div className="lic wicon"><i className="ti ti-eye" />{a.state === "running" && <span className="pulse" />}</div>
        <div className="grow">
          <div className="row" style={{ gap: 8 }}><span className="lt">{a.name}</span><span className="mono tiny faint">{a.code}</span>
            <span className={`status ${a.state === "running" ? "ok" : "none"}`}>{a.state === "running" ? (busy ? "checking…" : "watching") : "paused"}</span></div>
          <div className="small soft" style={{ marginTop: 4 }}>Watches {srcs.map((s) => s.name).join(", ") || "no sources"} · {a.lastRun ? `last check ${ago(a.lastRun)}` : "first check starting"}{a.state === "running" && a.lastRun ? ` · next in ${next}s` : ""}</div>
          <div className="small row" style={{ gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            <i className="ti ti-rule" style={{ color: "var(--navy)" }} /> Every
            {edit ? <select className="select" style={{ width: "auto", padding: "2px 7px", fontSize: 12.5 }} value={a.intervalSec} onChange={(e) => set({ intervalSec: Number(e.target.value) })}>{INTERVALS.map(([s, l]) => <option key={s} value={s}>{l}</option>)}</select> : <b>{a.intervalSec}s</b>}
            , draft an opportunity when a theme gets
            {edit ? <input className="input inl" type="number" min="1" style={{ width: 58, flex: "none" }} value={a.rules.minNew} onChange={(e) => set({ rules: { minNew: Math.max(1, Number(e.target.value) || 1) } })} /> : <b>{a.rules.minNew}</b>}
            new records between checks
          </div>
          <label className="tiny soft row" style={{ gap: 6, marginTop: 6, flexWrap: "wrap" }}>
            <input type="checkbox" disabled={!edit} checked={!!a.rules.growthOn} onChange={(e) => set({ rules: { growthOn: e.target.checked } })} />
            …or when a theme with {a.rules.minRecords}+ records grows {a.rules.growth}%+ over 8 weeks</label>
          {a.drafted?.length > 0 && <div className="chips" style={{ marginTop: 8 }}><span className="tiny faint">Drafted</span>{a.drafted.map((id) => <Link key={id} to={`/opportunities/${id}`} className="chip" style={{ padding: "1px 8px", fontSize: 11.5 }}><i className="ti ti-bulb" /> {id}</Link>)}</div>}
          <div className="runlog">
            {(runs || []).slice(0, 5).map((r) => <div key={r.id} className="tiny"><span className="faint mono">{new Date(r.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}</span> <span style={r.result === "error" ? { color: "var(--red-ink)" } : null}>{r.note}</span></div>)}
            {!runs?.length && <div className="tiny faint">No checks yet.</div>}
          </div>
        </div>
        {edit && <div className="stack" style={{ gap: 6 }}>
          <button className="btn out sm" disabled={busy} onClick={async () => { setBusy(true); await api.checkNow(a.id); setBusy(false); }}>{busy ? <i className="ti ti-loader-2 spin" /> : <i className="ti ti-refresh" />} Check now</button>
          <button className="btn out sm" onClick={() => set({ state: a.state === "running" ? "paused" : "running" })}><i className={`ti ${a.state === "running" ? "ti-player-pause" : "ti-player-play"}`} /> {a.state === "running" ? "Pause" : "Resume"}</button>
          <button className="btn link small" onClick={() => window.confirm(`Remove ${a.name}?`) && api.deleteWatcher(a.id, user.id)}>Remove</button>
        </div>}
      </div>
      {a.drafted?.length === 0 && a.checks > 0 && <div className="tiny faint" style={{ marginTop: 8 }}><i className="ti ti-info-circle" /> Demo: in a terminal, run <span className="mono">npm run surge -- wifi 30</span> to send 30 new complaints to the mock API, then watch this card.</div>}
      {false && nav}
    </div>
  );
}

export function NewWatcher({ user, sources, onClose }) {
  const real = sources.filter((s) => s.config?.rest || s.config?.api || s.config?.url || s.config?.feed);
  const [sel, setSel] = useState(real.slice(0, 1).map((s) => s.id));
  const [interval, setIntervalSec] = useState(30);
  const [minNew, setMinNew] = useState(10);
  const [name, setName] = useState("");
  return (
    <Modal title="New watcher agent" icon="ti-eye" onClose={onClose}
      footer={<><button className="btn out sm" onClick={onClose}>Cancel</button>
        <button className="btn primary sm" disabled={!sel.length} onClick={async () => { await api.createWatcher({ name: name.trim() || `Watching ${sources.find((s) => s.id === sel[0])?.name}${sel.length > 1 ? ` +${sel.length - 1}` : ""}`, sourceIds: sel, intervalSec: interval, rules: { minNew } }, user.id); onClose(); }}><i className="ti ti-eye" /> Start watching</button></>}>
      {!real.length && <div className="note warn"><i className="ti ti-plug-off" /><div>Connect an API or feed first. Watchers poll sources that can be pulled again.</div></div>}
      <Field label="Sources to watch">{real.map((s) => (
        <label key={s.id} className="row small" style={{ gap: 8, padding: "4px 0", cursor: "pointer" }}><input type="checkbox" checked={sel.includes(s.id)} onChange={(e) => setSel(e.target.checked ? [...sel, s.id] : sel.filter((x) => x !== s.id))} /><i className={`ti ${s.icon}`} /> {s.name} <span className="faint tiny">{s.system}</span></label>))}</Field>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <div className="grow"><Field label="Check every"><select className="select" value={interval} onChange={(e) => setIntervalSec(Number(e.target.value))}>{INTERVALS.map(([s, l]) => <option key={s} value={s}>{l}</option>)}</select></Field></div>
        <div className="grow"><Field label="Draft an opportunity at (new records on a theme)"><input className="input" type="number" min="1" value={minNew} onChange={(e) => setMinNew(Math.max(1, Number(e.target.value) || 1))} /></Field></div>
      </div>
      <Field label="Name (optional)"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Watching Salesforce cases" /></Field>
    </Modal>
  );
}

/* ---------- empty-workspace guide ---------- */
export function GettingStarted() {
  const s = useQuery(() => api.getOnboarding(), []);
  if (!s || !s.fresh) return null;
  const steps = [
    ["Connect an existing API", s.sources > 0, "Context & agents → Add source → REST API. Paste an endpoint or pick one from the mock enterprise API.", "/context?add=rest", "Add source"],
    ["Its records become signals", s.signals > 0, "The signals agent themes every record and ranks what's rising.", "/signals", "View signals"],
    ["An agent watches the source", s.watchers > 0, "A watcher agent polls the API on a schedule and compares each check with the last.", "/context?tab=agents", "View agents"],
    ["The agent drafts an opportunity", s.drafted > 0, "When a theme spikes, the agent drafts an opportunity in Sense. Demo it: npm run surge -- wifi 30", "/opportunities", "View opportunities"],
  ];
  const done = steps.filter((x) => x[1]).length;
  if (done === steps.length) return null;
  return (
    <div className="card gs">
      <div className="row" style={{ marginBottom: 10 }}><b className="grow">New workspace · getting started</b><span className="tiny faint">{done} of {steps.length}</span></div>
      <div className="gsgrid">{steps.map(([t, ok, hint, to, cta], i) => (
        <div key={t} className={`gsstep ${ok ? "ok" : ""}`}>
          <div className="row" style={{ gap: 8 }}><span className="gsn">{ok ? <i className="ti ti-check" /> : i + 1}</span><b className="small">{t}</b></div>
          <div className="tiny soft" style={{ margin: "6px 0 8px" }}>{hint}</div>
          {!ok && <Link to={to} className="btn link small" style={{ padding: 0 }}>{cta} <i className="ti ti-arrow-right" /></Link>}
        </div>))}</div>
    </div>
  );
}

/* ---------- toasts for agent notifications ---------- */
let seen = null;
export function Toasts() {
  const list = useQuery(() => api.listNotifications(), []);
  const [shown, setShown] = useState([]);
  const nav = useNavigate();
  useEffect(() => {
    if (!list) return;
    if (seen == null) { seen = new Set(list.map((n) => n.id)); return; }
    const fresh = list.filter((n) => !seen.has(n.id));
    fresh.forEach((n) => seen.add(n.id));
    if (fresh.length) {
      setShown((s) => [...fresh.reverse(), ...s].slice(0, 4));
      fresh.forEach((n) => setTimeout(() => setShown((s) => s.filter((x) => x.id !== n.id)), n.kind === "drafted" ? 14000 : 8000));
    }
  }, [list]);
  if (!shown.length) return null;
  return (
    <div className="toasts">{shown.map((n) => (
      <div key={n.id} className={`toast ${n.kind}`} onClick={() => { if (n.link) nav(n.link); setShown((s) => s.filter((x) => x.id !== n.id)); }}>
        <i className={`ti ${n.kind === "drafted" ? "ti-bulb" : n.kind === "evidence" ? "ti-trending-up" : "ti-eye"}`} />
        <div className="grow"><div className="tiny" style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: ".6px", opacity: .8 }}>{n.kind === "drafted" ? "Opportunity drafted" : n.kind === "evidence" ? "New evidence" : "Agent"}</div><div className="small">{n.text}</div></div>
      </div>))}</div>
  );
}

export { parseFile };
