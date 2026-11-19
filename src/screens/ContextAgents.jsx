import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Shell from "../components/Shell";
import { Modal, Field } from "../components/ui";
import { parseFile, guessMapping } from "../lib/ingest";
import { FEEDS } from "../lib/feeds";
import { useSession } from "../auth";
import { useQuery } from "../api/hooks";
import * as api from "../api";
import { can } from "../lib/perms";
import { ago, fmt } from "../lib/format";

const KINDS = [["file", "ti-file-upload", "Imported files · real data"], ["api", "ti-plug-connected", "APIs & live systems"], ["docs", "ti-folders", "Document repositories"], ["web", "ti-world-search", "Web crawl"], ["manual", "ti-pencil", "Manual entry"]];
const GROUPS = [["ingestion", "Ingestion agents", "keep the context layer fresh"], ["analysis", "Analyst agents", "find patterns and check policy"], ["operational", "Operational agents", "act for customers, inside guardrails"]];
const SCHEDULES = ["live", "hourly", "daily", "weekly"];

export default function ContextAgents() {
  const { ws, user, stream } = useSession();
  const nameOf = (id) => ws.users.find((u) => u.id === id)?.name || id;
  const [tab, setTab] = useState("sources");
  const sources = useQuery(() => api.listSources(), []);
  const agents = useQuery(() => api.listAgents(), []);
  const notes = useQuery(() => api.listNotes(stream.id), [stream.id]);
  const [adding, setAdding] = useState(false);
  const [noting, setNoting] = useState(false);
  const admin = can(user, "sources.manage");
  if (!sources || !agents) return <Shell title="Context & agents" />;
  const records = sources.reduce((n, s) => n + s.records, 0);
  const live = agents.filter((a) => a.state === "running").length;

  return (
    <Shell title={<><i className="ti ti-database" style={{ color: "var(--navy)" }} /> Context &amp; agents</>}>
      <div className="pagehead"><div><h1>Context &amp; agents</h1>
        <p>What the Workbench knows, and the agents that gather and analyze it. Every source is read by an agent on a schedule; analyst agents reason over the result and the PM sees only the short, ranked output.</p></div>
        <div className="acts">
          {can(user, "opp.edit") && <button className="btn out sm" onClick={() => setNoting(true)}><i className="ti ti-note" /> Add context note</button>}
          {admin && <button className="btn primary sm" onClick={() => setAdding(true)}><i className="ti ti-plus" /> Add source</button>}
        </div>
      </div>
      <div className="cols3" style={{ gridTemplateColumns: "repeat(4,1fr)", marginBottom: 18 }}>
        {[[sources.length, "connected sources"], [fmt(records), "records in the context layer"], [`${live} / ${agents.length}`, "agents running"], [ago(sources.map((s) => s.lastSync).filter(Boolean).sort().pop()), "last sync"]].map(([n, l]) => (
          <div key={l} className="card" style={{ padding: "13px 16px" }}><div style={{ fontFamily: "var(--cond)", fontSize: 25, fontWeight: 700, color: "var(--navy)" }}>{n}</div><div className="tiny faint">{l}</div></div>))}
      </div>
      <div className="tabs">
        <button className={tab === "sources" ? "on" : ""} onClick={() => setTab("sources")}><i className="ti ti-database" /> Sources <span className="ct">{sources.length}</span></button>
        <button className={tab === "agents" ? "on" : ""} onClick={() => setTab("agents")}><i className="ti ti-robot" /> Agents <span className="ct">{agents.length}</span></button>
        <button className={tab === "notes" ? "on" : ""} onClick={() => setTab("notes")}><i className="ti ti-note" /> Notes · {stream.name} <span className="ct">{notes?.length || 0}</span></button>
      </div>

      {tab === "sources" && KINDS.map(([k, icon, label]) => {
        const list = sources.filter((s) => s.kind === k);
        if (!list.length) return null;
        return (
          <div key={k}>
            <div className="srcgroup"><i className={`ti ${icon}`} /> {label}</div>
            <div className="table">{list.map((s) => <SourceRow key={s.id} s={s} agents={agents} admin={admin} user={user} />)}</div>
          </div>);
      })}

      {tab === "agents" && (
        <>
          <div className="card" style={{ marginBottom: 16, display: "flex", gap: 14, alignItems: "center", background: "var(--navy)", color: "#fff", borderColor: "var(--navy)" }}>
            <div className="lic" style={{ background: "rgba(255,255,255,.12)", borderColor: "transparent", color: "#fff" }}><i className="ti ti-sitemap" /></div>
            <div className="grow"><div className="lt">Orchestrator <span className="tag" style={{ marginLeft: 6 }}>mocked in V1</span></div>
              <div className="small" style={{ color: "#C4D3E4", marginTop: 2 }}>Supervises every agent below: routes work, enforces each guardrail and stops an agent that misbehaves. A client build could run this on watsonx Orchestrate.</div></div>
          </div>
          {GROUPS.map(([g, label, hint]) => (
            <div key={g}>
              <div className="srcgroup">{label} <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 500 }}>· {hint}</span></div>
              <div className="stack" style={{ gap: 10 }}>{agents.filter((a) => a.group === g).map((a) => <AgentCard key={a.id} a={a} user={user} />)}</div>
            </div>))}
        </>)}

      {tab === "notes" && (
        <div className="table">
          {notes?.map((n) => <div key={n.id} className="lrow"><div className="lic"><i className="ti ti-note" /></div><div className="grow"><div className="small">{n.text}</div><div className="ls">{nameOf(n.by)} · {ago(n.at)}</div></div></div>)}
          <div className="lrow" style={{ cursor: "pointer" }} onClick={() => setNoting(true)}><div className="lic" style={{ background: "var(--accent-soft)", color: "var(--accent-d)" }}><i className="ti ti-plus" /></div>
            <div><div className="lt" style={{ color: "var(--accent-d)" }}>Add context the systems don't have yet</div><div className="ls">e.g. a decision from today's leadership review</div></div></div>
        </div>)}

      {adding && <AddSourceModal agents={agents} user={user} stream={stream} streams={ws.streams} onClose={() => setAdding(false)} />}
      {noting && <NoteModal stream={stream} user={user} onClose={() => { setNoting(false); setTab("notes"); }} />}
    </Shell>
  );
}

function SourceRow({ s, agents, admin, user }) {
  const [editTag, setEditTag] = useState(false);
  const [tag, setTag] = useState(s.tag);
  const busy = s.status === "connecting" || s.status === "syncing";
  return (
    <div className="lrow">
      <div className="lic"><i className={`ti ${s.icon}`} /></div>
      <div className="grow">
        <div className="lt">{s.name} {s.real && <span className="tag" style={{ marginLeft: 4, background: "var(--green-soft)", color: "var(--green-ink)", borderColor: "transparent" }}><i className="ti ti-bolt" style={{ fontSize: 11 }} /> real data</span>}</div>
        <div className="ls">{s.system} · {s.access} · {fmt(s.records)} records · read by <b className="soft">{s.agent?.name || "—"}</b>{s.config?.terms ? <> · searching “{s.config.terms}”</> : null}</div>
        {s.status === "error" && s.error && <div className="tiny" style={{ color: "var(--red-ink)", marginTop: 3 }}><i className="ti ti-alert-triangle" /> {s.error}</div>}
      </div>
      {editTag ? (
        <input className="input" style={{ width: 160, padding: "5px 9px", fontSize: 12 }} autoFocus value={tag} onChange={(e) => setTag(e.target.value)}
          onBlur={async () => { setEditTag(false); if (tag !== s.tag) await api.updateSource(s.id, { tag }, user.id); }} onKeyDown={(e) => e.key === "Enter" && e.target.blur()} />
      ) : <span className="tag" style={{ cursor: admin ? "pointer" : "default", background: "var(--navy-soft)", color: "var(--navy)", borderColor: "transparent" }} onClick={() => admin && setEditTag(true)} title={admin ? "AI-generated tag. Click to edit" : "AI-generated tag"}>{s.tag}{admin && <i className="ti ti-pencil" style={{ fontSize: 11, marginLeft: 4 }} />}</span>}
      {s.config?.feed && admin && <button className="iconbtn" title="Sync now" aria-label={`Sync ${s.name} now`} disabled={busy} onClick={() => api.syncSource(s.id, user.id).catch(() => {})}><i className="ti ti-refresh" /></button>}
      {admin && s.kind !== "manual" && s.kind !== "file" ? (
        <select className="select" style={{ width: 100, padding: "5px 8px", fontSize: 12 }} value={s.schedule} aria-label="Schedule" onChange={(e) => api.updateSource(s.id, { schedule: e.target.value }, user.id)}>
          {SCHEDULES.map((x) => <option key={x}>{x}</option>)}</select>
      ) : <span className="tag">{s.schedule}</span>}
      <span className={`status ${s.status}`} style={{ width: 118, justifyContent: "center" }}>{busy && <i className="ti ti-loader-2 spin" />}{s.status}{s.lastSync && !busy ? ` · ${ago(s.lastSync)}` : ""}</span>
      {admin && <button className="iconbtn danger" title="Disconnect" aria-label={`Disconnect ${s.name}`} onClick={() => api.removeSource(s.id, user.id)}><i className="ti ti-plug-x" /></button>}
    </div>
  );
}

function AgentCard({ a, user }) {
  const [open, setOpen] = useState(false);
  const toggle = can(user, "agents.toggle");
  const manage = can(user, "agents.manage");
  return (
    <div className="card" style={{ opacity: a.state === "paused" ? .78 : 1 }}>
      <div className="row" style={{ alignItems: "flex-start", gap: 14 }}>
        <div className="lic" style={{ width: 42, height: 42, background: "var(--navy-soft)", borderColor: "transparent" }}><i className={`ti ${a.icon}`} /></div>
        <div className="grow">
          <div className="row" style={{ flexWrap: "wrap" }}><span className="lt">{a.name}</span><span className="oid">{a.code}</span><span className={`status ${a.state}`}>{a.state}</span></div>
          <div className="small soft" style={{ marginTop: 5, lineHeight: 1.5 }}>{a.job}</div>
          <div className="chips" style={{ marginTop: 9 }}>
            <span className="chip"><i className="ti ti-clock" /> {a.schedule}</span>
            <span className="chip"><i className="ti ti-activity" /> {a.stat}</span>
            <span className="chip"><i className="ti ti-shield-check" /> {a.guardrail}</span>
            {a.sources.length > 0 && <span className="chip"><i className="ti ti-database" /> reads {a.sources.length} source{a.sources.length > 1 ? "s" : ""}</span>}
            {a.runs[0] && <span className="chip"><i className="ti ti-history" /> last run {ago(a.runs[0].at)}</span>}
          </div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          {manage && a.schedule !== "per source" && (
            <select className="select" style={{ width: 104, padding: "5px 8px", fontSize: 12 }} value={a.schedule} aria-label="Agent schedule" onChange={(e) => api.updateAgent(a.id, { schedule: e.target.value }, user.id)}>
              {[...SCHEDULES, "on change"].map((x) => <option key={x}>{x}</option>)}</select>)}
          {toggle && <button className="iconbtn" title="Run now" aria-label={`Run ${a.name} now`} disabled={a.state === "paused"} onClick={() => api.runAgent(a.id, user.id)}><i className="ti ti-player-play" /></button>}
          {toggle && <button className="iconbtn" title={a.state === "running" ? "Pause" : "Resume"} aria-label={a.state === "running" ? `Pause ${a.name}` : `Resume ${a.name}`} onClick={() => api.updateAgent(a.id, { state: a.state === "running" ? "paused" : "running" }, user.id)}><i className={`ti ${a.state === "running" ? "ti-player-pause" : "ti-refresh"}`} /></button>}
          <button className="iconbtn" title="Recent runs" aria-label="Recent runs" onClick={() => setOpen(!open)}><i className={`ti ti-chevron-${open ? "up" : "down"}`} /></button>
        </div>
      </div>
      {open && (
        <div style={{ marginTop: 12, borderTop: "1px solid var(--line)", paddingTop: 8 }}>
          {a.sources.length > 0 && <div className="tiny faint" style={{ marginBottom: 6 }}>Reads: {a.sources.map((s) => `${s.name} (${s.schedule})`).join(" · ")}</div>}
          {a.runs.map((r) => (
            <div key={r.id} className="row small" style={{ padding: "5px 0" }}>
              <span className={`status ${r.result}`}>{r.result}</span><span className="grow soft">{r.note}</span>
              <span className="tiny faint">{fmt(r.recordsRead)} read · {ago(r.at)}</span>
            </div>))}
        </div>)}
    </div>
  );
}

function AddSourceModal({ agents, user, stream, streams, onClose }) {
  const connectors = useQuery(() => api.listConnectors(), []);
  const [f, setF] = useState({ connectorId: "", name: "", schedule: "daily", agentId: "agt-ingest", tag: "" });
  const [result, setResult] = useState(null);
  const c = connectors?.find((x) => x.id === f.connectorId);
  const choose = (x) => setF({ ...f, connectorId: x.id, name: x.real ? "" : f.name || x.name, tag: x.tag, schedule: x.kind === "manual" ? "manual" : f.schedule });
  const chips = (list) => <div className="chips">{list.map((x) => (
    <button key={x.id} className="chip" style={{ cursor: "pointer", borderColor: f.connectorId === x.id ? "var(--accent)" : undefined, background: f.connectorId === x.id ? "var(--accent-soft)" : undefined }}
      onClick={() => choose(x)}><i className={`ti ${x.icon}`} /> {x.name}</button>))}</div>;

  if (result) return <ImportResult result={result} streams={streams} onClose={onClose} />;
  const body = (
    <>
      <Field label="Real data · works now">{connectors && chips(connectors.filter((x) => x.real))}</Field>
      <Field label="Simulated connectors · client build">{connectors && chips(connectors.filter((x) => !x.real))}</Field>
    </>);
  if (c?.id === "file") return <FileImport user={user} stream={stream} streams={streams} onDone={setResult} onClose={onClose} picker={body} />;
  if (c?.feed) return <FeedConnect c={c} user={user} stream={stream} streams={streams} onDone={setResult} onClose={onClose} picker={body} />;
  return (
    <Modal title="Add a source" icon="ti-plug-connected" onClose={onClose}
      footer={<><button className="btn out sm" onClick={onClose}>Cancel</button>
        <button className="btn primary sm" disabled={!c || !f.name.trim()} onClick={async () => { await api.addSource(f, user.id); onClose(); }}><i className="ti ti-plug-connected" /> Connect</button></>}>
      {body}
      {c && <>
        <Field label="Name in the Workbench"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <div className="row" style={{ alignItems: "flex-start" }}>
          <div className="grow"><Field label="Schedule"><select className="select" value={f.schedule} onChange={(e) => setF({ ...f, schedule: e.target.value })}>{[...SCHEDULES, "manual"].map((x) => <option key={x}>{x}</option>)}</select></Field></div>
          <div className="grow"><Field label="Read by"><select className="select" value={f.agentId} onChange={(e) => setF({ ...f, agentId: e.target.value })}>{agents.filter((a) => a.group === "ingestion").map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field></div>
        </div>
        <div className="note"><i className="ti ti-info-circle" /><div>Mocked connector: the Workbench simulates the handshake and first sync. In a client build this step asks for an API key or OAuth consent, read-only by default.</div></div>
      </>}
    </Modal>
  );
}

const MAP_FIELDS = [["text", "Record text", true], ["title", "Subject / title"], ["date", "Created date"], ["id", "Record ID"], ["category", "Category"], ["channel", "Channel / source"], ["rating", "Rating"], ["tier", "Customer tier"]];
const SAMPLES = [["support-tickets-sample.csv", "Support tickets (CSV, 240 rows)"], ["app-reviews-sample.json", "App reviews (JSON, 90 rows)"]];

function FileImport({ user, stream, streams, onDone, onClose, picker }) {
  const [file, setFile] = useState(null);
  const [map, setMap] = useState({});
  const [type, setType] = useState("support");
  const [streamId, setStreamId] = useState(stream.id);
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const load = (fileName, text) => {
    try {
      const p = parseFile(fileName, text);
      if (!p.rows.length) throw new Error("No rows found. Is the first row a header?");
      const m = guessMapping(p.headers);
      setFile({ fileName, ...p }); setMap(m); setType(m.rating ? "feedback" : "support"); setErr("");
      setName(fileName.replace(/\.(csv|json|txt)$/i, "").replace(/[-_]+/g, " ").replace(/^\w/, (x) => x.toUpperCase()));
    } catch (e) { setErr(`Couldn't read ${fileName}: ${e.message}`); setFile(null); }
  };
  const onPick = async (e) => { const fl = e.target.files?.[0]; if (fl) load(fl.name, await fl.text()); };
  const sample = async (fn) => {
    try { const r = await fetch(`${import.meta.env.BASE_URL}samples/${fn}`); if (!r.ok) throw new Error(r.status); load(fn, await r.text()); }
    catch (e) { setErr(`Couldn't load the sample: ${e.message}`); }
  };
  const go = async () => {
    setBusy(true);
    try { onDone(await api.importFile({ name: name.trim(), fileName: file.fileName, recordType: type, rows: file.rows, mapping: map, streamId }, user.id)); }
    catch (e) { setErr(e.message); setBusy(false); }
  };
  const preview = file?.rows.slice(0, 3) || [];
  return (
    <Modal wide title="Import a file" icon="ti-file-upload" onClose={onClose}
      footer={<><button className="btn out sm" onClick={onClose}>Cancel</button>
        <button className="btn primary sm" disabled={!file || !map.text || !name.trim() || busy} onClick={go}>{busy ? <i className="ti ti-loader-2 spin" /> : <i className="ti ti-file-import" />} Import {file ? file.rows.length.toLocaleString() : ""} records</button></>}>
      {picker}
      <div className="note"><i className="ti ti-bolt" /><div><b>Real data.</b> Upload any export (Salesforce, Zendesk, Jira, a survey tool, a spreadsheet saved as CSV). The file stays in this browser. The ingestion agent maps the columns, the signals agent themes every record and raises or corroborates signals. Up to 5,000 rows.</div></div>
      <div className="row" style={{ gap: 9, flexWrap: "wrap" }}>
        <label className="btn out sm" style={{ cursor: "pointer" }}><i className="ti ti-upload" /> Choose CSV or JSON<input type="file" accept=".csv,.json,.txt,text/csv,application/json" hidden onChange={onPick} /></label>
        <span className="tiny faint">or try a sample:</span>
        {SAMPLES.map(([fn, label]) => <button key={fn} className="btn link small" onClick={() => sample(fn)}><i className="ti ti-file-text" /> {label}</button>)}
      </div>
      {err && <div className="tiny" style={{ color: "var(--red-ink)" }}><i className="ti ti-alert-triangle" /> {err}</div>}
      {file && <>
        <div className="tiny faint"><b className="soft">{file.fileName}</b> · {file.total.toLocaleString()} rows · {file.headers.length} columns{file.truncated ? " · only the first 5,000 rows will be imported" : ""}</div>
        <div style={{ overflowX: "auto", border: "1px solid var(--line)", borderRadius: 9 }}>
          <table style={{ borderCollapse: "collapse", fontSize: 11.5, width: "100%" }}>
            <thead><tr>{file.headers.map((h) => <th key={h} style={{ textAlign: "left", padding: "6px 9px", background: "var(--surface-2)", borderBottom: "1px solid var(--line)", whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
            <tbody>{preview.map((r, i) => <tr key={i}>{file.headers.map((h) => <td key={h} style={{ padding: "5px 9px", borderBottom: "1px solid var(--line)", maxWidth: 260, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r[h]}</td>)}</tr>)}</tbody>
          </table>
        </div>
        <Field label="Map the columns (guessed from the headers; change any)">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 9 }}>
            {MAP_FIELDS.filter(([k]) => k !== "rating" || type === "feedback").filter(([k]) => k !== "tier" || type === "support").map(([k, label, req]) => (
              <label key={k} className="tiny faint" style={{ display: "flex", flexDirection: "column", gap: 3 }}>{label}{req ? " *" : ""}
                <select className="select" style={{ padding: "5px 8px", fontSize: 12 }} value={map[k] || ""} onChange={(e) => setMap({ ...map, [k]: e.target.value || undefined })}>
                  <option value="">{req ? "Choose…" : "— none —"}</option>{file.headers.map((h) => <option key={h}>{h}</option>)}</select></label>))}
          </div>
        </Field>
        <div className="row" style={{ alignItems: "flex-start" }}>
          <div className="grow"><Field label="These records are"><select className="select" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="support">Support tickets / cases</option><option value="feedback">Feedback, reviews or survey verbatims</option></select></Field></div>
          <div className="grow"><Field label="New themes go to"><select className="select" value={streamId} onChange={(e) => setStreamId(e.target.value)}>{streams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field></div>
          <div className="grow"><Field label="Name in the Workbench"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field></div>
        </div>
      </>}
    </Modal>
  );
}

function FeedConnect({ c, user, stream, streams, onDone, onClose, picker }) {
  const feed = FEEDS[c.feed];
  const [terms, setTerms] = useState(feed.defaults.terms);
  const [streamId, setStreamId] = useState(stream.id);
  const [name, setName] = useState(c.feed === "fedreg" ? "DOT rulemaking · Federal Register" : "Airline news · Hacker News");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true); setErr("");
    try { onDone(await api.connectFeed({ name: name.trim(), feed: c.feed, config: { ...feed.defaults, terms: terms.trim() }, streamId }, user.id)); }
    catch (e) { setErr(e.message); setBusy(false); }
  };
  return (
    <Modal title="Connect a live feed" icon={c.icon} onClose={onClose}
      footer={<><button className="btn out sm" onClick={onClose}>Cancel</button>
        <button className="btn primary sm" disabled={!terms.trim() || !name.trim() || busy} onClick={go}>{busy ? <i className="ti ti-loader-2 spin" /> : <i className="ti ti-plug-connected" />} Connect and sync</button></>}>
      {picker}
      <div className="note"><i className="ti ti-bolt" /><div><b>Real data, live.</b> {feed.help} The Workbench calls it straight from your browser; use the refresh button on the source to pull again.</div></div>
      <Field label="Search terms"><input className="input" value={terms} onChange={(e) => setTerms(e.target.value)} /></Field>
      {c.feed === "fedreg" && <div className="tiny faint" style={{ marginTop: -8 }}>Limited to the Department of Transportation, last 12 months.</div>}
      <div className="row" style={{ alignItems: "flex-start" }}>
        <div className="grow"><Field label="Name in the Workbench"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field></div>
        <div className="grow"><Field label="New themes go to"><select className="select" value={streamId} onChange={(e) => setStreamId(e.target.value)}>{streams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field></div>
      </div>
      {err && <div className="tiny" style={{ color: "var(--red-ink)" }}><i className="ti ti-alert-triangle" /> {err}</div>}
    </Modal>
  );
}

function ImportResult({ result, streams, onClose }) {
  const nav = useNavigate();
  const sname = (id) => streams.find((x) => x.id === id)?.name || id;
  const open = async (streamId) => { await api.setStream(streamId); onClose(); nav("/signals"); };
  const row = (x, verb) => (
    <div key={x.id + verb} className="lrow" style={{ padding: "9px 12px", cursor: "pointer" }} onClick={() => open(x.streamId)}>
      <span className={`status ${verb === "new" ? "ok" : "flag"}`}>{verb}</span>
      <div className="grow"><div className="small" style={{ fontWeight: 600 }}>{x.theme}</div><div className="tiny faint">{x.id} · {x.n.toLocaleString()} records · {sname(x.streamId)}</div></div>
      <i className="ti ti-arrow-right faint" />
    </div>);
  return (
    <Modal title="Synced" icon="ti-circle-check" onClose={onClose}
      footer={<><button className="btn out sm" onClick={onClose}>Done</button>
        {(result.created[0] || result.corroborated[0]) && <button className="btn primary sm" onClick={() => open((result.created[0] || result.corroborated[0]).streamId)}><i className="ti ti-radar-2" /> View signals</button>}</>}>
      <div className="row" style={{ gap: 10 }}>
        {[[result.records, "records in"], [result.created.length, "new signals"], [result.corroborated.length, "signals corroborated"], [result.unthemed ?? 0, "unclassified"]].map(([n, l]) => (
          <div key={l} className="card grow" style={{ padding: "10px 12px" }}><div style={{ fontFamily: "var(--cond)", fontSize: 22, fontWeight: 700, color: "var(--navy)" }}>{Number(n).toLocaleString()}</div><div className="tiny faint">{l}</div></div>))}
      </div>
      {result.discovered > 0 && <div className="tiny faint"><i className="ti ti-sparkles" /> {result.discovered} emerging theme{result.discovered > 1 ? "s" : ""} found in records no known theme matched.</div>}
      <div className="table">{result.created.map((x) => row(x, "new"))}{result.corroborated.map((x) => row(x, "corroborates"))}{result.updated.map((x) => row(x, "updated"))}</div>
      {!result.records && <div className="small faint">The feed returned nothing for those terms. Try broader terms, then use the source's refresh button.</div>}
    </Modal>
  );
}

function NoteModal({ stream, user, onClose }) {
  const [t, setT] = useState("");
  return (
    <Modal title={`Add a context note · ${stream.name}`} icon="ti-note" onClose={onClose}
      footer={<><button className="btn out sm" onClick={onClose}>Cancel</button><button className="btn primary sm" disabled={!t.trim()} onClick={async () => { await api.addNote(stream.id, t.trim(), user.id); onClose(); }}>Add note</button></>}>
      <div className="small soft">For things you learned before they reach a connected system, like a decision in a meeting. Agents read these alongside every other source.</div>
      <textarea className="textarea" autoFocus value={t} onChange={(e) => setT(e.target.value)} />
    </Modal>
  );
}
