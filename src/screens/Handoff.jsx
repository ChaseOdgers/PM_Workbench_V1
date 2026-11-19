import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Shell from "../components/Shell";
import { useSession } from "../auth";
import { useQuery, useAction } from "../api/hooks";
import * as api from "../api";
import { can } from "../lib/perms";
import { ago } from "../lib/format";
import { buildScenarios, packMarkdown, packFeature, packCsvAdo, packCsvJira } from "../lib/delivery";

const TYPES = ["functional", "edge", "negative", "compliance", "accessibility", "performance"];
const PRI = ["Must", "Should", "Could"];

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  Object.assign(document.createElement("a"), { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Keyed by id so moving between opportunities starts a fresh draft.
export default function HandoffRoute() {
  const { id } = useParams();
  return <Handoff key={id} id={id} />;
}

function Handoff({ id }) {
  const { user } = useSession();
  const nav = useNavigate();
  const o = useQuery(() => api.getOpportunity(id), [id]);
  const draft = useQuery(() => api.draftHandoff(id), [id]);
  const loaded = useQuery(() => api.getDeliveryPack(id), [id]);
  const [b, setB] = useState(null);
  const [pack, setPack] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState("stories");
  const [system, setSystem] = useState("ADO");
  const [exp, setExp] = useState(false);
  const { run, busy, error } = useAction();
  const timer = useRef(null);

  useEffect(() => { if (draft && !b) { setB(o?.handoff?.brief || draft); setSystem(draft.system); } }, [draft, o, b]);
  useEffect(() => { if (loaded && !pack) setPack(loaded.pack); }, [loaded, pack]);
  const done = !!o?.handoff;
  const editable = !!o && !done && (can(user, "handoff") || can(user, "opp.edit"));
  // Edits save themselves a moment after you stop typing.
  useEffect(() => {
    if (!dirty || !editable) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { api.saveDeliveryPack(id, pack, user.id); setDirty(false); }, 700);
    return () => clearTimeout(timer.current);
  }, [pack, dirty, editable, id, user.id]);

  if (!o || !b || !pack) return <Shell title="Delivery pack" />;
  const allowed = can(user, "handoff") && o.readiness.ready && !done;
  const canOverride = !done && !o.readiness.ready && o.readiness.checklist?.allowOverride && can(user, "phases.override");
  const change = (next) => { setPack(next); setDirty(true); };
  const setStory = (i, s) => change({ ...pack, stories: pack.stories.map((x, j) => (j === i ? s : x)) });
  const setTest = (i, t) => change({ ...pack, scenarios: pack.scenarios.map((x, j) => (j === i ? t : x)) });
  const acCount = pack.stories.reduce((n, s) => n + s.ac.length, 0);
  const inc = pack.scenarios.filter((t) => t.include);
  const exports = [
    ["Markdown pack (.md)", () => download(`${o.id}-delivery-pack.md`, packMarkdown(pack, b, o), "text/markdown")],
    ["Gherkin tests (.feature)", () => download(`${o.id}.feature`, packFeature(pack, b), "text/plain")],
    ["Azure DevOps import (.csv)", () => download(`${o.id}-ado-import.csv`, packCsvAdo(pack, b, o), "text/csv")],
    ["Jira import (.csv)", () => download(`${o.id}-jira-import.csv`, packCsvJira(pack, b, o), "text/csv")],
  ];

  return (
    <Shell title={<><Link to={`/opportunities/${id}`} className="mut mono" style={{ textDecoration: "none" }}>{id}</Link> <span className="mut">/</span> Delivery pack</>}>
      <Link to={`/opportunities/${id}`} className="backbtn"><i className="ti ti-arrow-left" /> Back to {id}</Link>
      <div className="pagehead"><div><h1>Delivery pack</h1>
        <p>{done ? `Handed off ${ago(o.handoff.at)} as ${o.handoff.system} epic ${o.handoff.epic}: ${o.handoff.stories} stories${o.handoff.tests ? `, ${o.handoff.tests} test cases` : ""}.`
          : "The delivery agent drafted user stories, acceptance criteria and test scenarios from this opportunity, its signals and customer records, the approved prototype and the governance gates. Edit anything; changes save as you go. Then push it, or export it for your team's tracker."}</p></div>
        <div className="acts">
          {editable && <button className="btn out sm" disabled={busy} title="Draft again from the current opportunity (replaces your edits)"
            onClick={() => window.confirm("Redraft the pack from the opportunity? Your edits will be replaced.") && run(async () => { const p = await api.regenerateDeliveryPack(id, user.id); setPack(p); setDirty(false); })}><i className="ti ti-refresh" /> Redraft</button>}
          <span style={{ position: "relative" }}>
            <button className="btn out sm" onClick={() => setExp(!exp)}><i className="ti ti-download" /> Export <i className="ti ti-chevron-down" /></button>
            {exp && <div className="menu" onMouseLeave={() => setExp(false)}>{exports.map(([l, f]) => <button key={l} onClick={() => { f(); setExp(false); }}>{l}</button>)}</div>}
          </span>
          {!done && <>
            <select className="select" style={{ width: 150, padding: "7px 10px", fontSize: 13 }} value={system} onChange={(e) => setSystem(e.target.value)} aria-label="Target system">
              <option value="ADO">Azure DevOps</option><option value="Jira">Jira</option></select>
            <button className="btn primary sm" disabled={!allowed || busy} onClick={() => run(async () => { await api.pushHandoff(id, b, system, user.id, pack); nav(`/opportunities/${id}`); })}><i className="ti ti-send" /> Push to {system}</button></>}
        </div>
      </div>
      {!done && !o.readiness.ready && <div className="note warn" style={{ marginBottom: 14 }}><i className="ti ti-lock" /><div className="grow">Draft mode. This team's handoff checklist still needs: {o.readiness.items.filter((i) => !i.ok && i.blocking !== false).map((i) => i.label).join("; ")}. You can still edit and export.
        {canOverride && <Override onGo={(reason) => run(async () => { await api.pushHandoff(id, b, system, user.id, pack, reason); nav(`/opportunities/${id}`); })} />}</div></div>}
      {error && <div className="tiny" style={{ color: "var(--red-ink)", margin: "-8px 0 12px" }}>{error}</div>}

      <div className="cols3" style={{ gridTemplateColumns: "repeat(5,1fr)", marginBottom: 16 }}>
        {[[pack.stories.length, "user stories"], [acCount, "acceptance criteria"], [inc.length, "test scenarios"], [inc.filter((t) => t.priority === "P1").length, "P1 tests"], [inc.filter((t) => t.automate).length, "automation candidates"]].map(([n, l]) => (
          <div key={l} className="card" style={{ padding: "12px 15px" }}><div style={{ fontFamily: "var(--cond)", fontSize: 24, fontWeight: 700, color: "var(--navy)" }}>{n}</div><div className="tiny faint">{l}</div></div>))}
      </div>
      <div className="tiny faint" style={{ margin: "-6px 0 10px" }}><i className="ti ti-robot" /> {pack.generator} · drafted {ago(pack.generatedAt)}{editable && (dirty ? " · saving…" : " · saved")}</div>

      <div className="tabs">
        <button className={tab === "stories" ? "on" : ""} onClick={() => setTab("stories")}><i className="ti ti-list-details" /> Stories &amp; AC <span className="ct">{pack.stories.length}</span></button>
        <button className={tab === "tests" ? "on" : ""} onClick={() => setTab("tests")}><i className="ti ti-test-pipe" /> Test scenarios <span className="ct">{inc.length}</span></button>
        <button className={tab === "ready" ? "on" : ""} onClick={() => setTab("ready")}><i className="ti ti-checklist" /> Dev readiness</button>
        <button className={tab === "brief" ? "on" : ""} onClick={() => setTab("brief")}><i className="ti ti-file-description" /> Brief</button>
      </div>

      {tab === "stories" && <div className="stack">
        {pack.stories.map((s, i) => <StoryCard key={s.id + i} s={s} edit={editable} tests={pack.scenarios.filter((t) => t.storyId === s.id && t.include).length}
          onChange={(x) => setStory(i, x)} onDelete={() => change({ ...pack, stories: pack.stories.filter((_, j) => j !== i), scenarios: pack.scenarios.filter((t) => t.storyId !== s.id) })} />)}
        {editable && <button className="btn out sm" style={{ alignSelf: "flex-start" }} onClick={() => {
          const n = Math.max(0, ...pack.stories.map((x) => Number(x.id.split("-")[1]) || 0)) + 1;
          change({ ...pack, stories: [...pack.stories, { id: `US-${n}`, title: "New story", asA: pack.persona, iWant: "", soThat: "", priority: "Should", size: "M", ac: [{ id: `AC-${n}.1`, given: "", when: "", then: "" }], edge: [], trace: { signals: [], gates: [], proto: null }, quote: null }] });
        }}><i className="ti ti-plus" /> Add story</button>}
      </div>}

      {tab === "tests" && <Tests pack={pack} edit={editable} setTest={setTest} rebuild={() => {
        if (!window.confirm("Rebuild test scenarios from the current stories? Edits to tests will be replaced.")) return;
        change({ ...pack, scenarios: buildScenarios(pack.stories, (o.gates || []).map((g) => g.id)) });
      }} />}

      {tab === "ready" && <div className="grid2">
        <div className="stack">
          <ListCard icon="ti-gauge" title="Non-functional requirements" items={pack.nfrs} edit={editable} onChange={(nfrs) => change({ ...pack, nfrs })} />
          <ListCard icon="ti-help-circle" title="Open questions for engineering" items={pack.questions} edit={editable} onChange={(questions) => change({ ...pack, questions })} />
        </div>
        <div className="stack">
          <ListCard icon="ti-flag" title="Definition of Ready" items={pack.dor} edit={editable} check onChange={(dor) => change({ ...pack, dor })} />
          <ListCard icon="ti-circle-check" title="Definition of Done" items={pack.dod} edit={editable} check onChange={(dod) => change({ ...pack, dod })} />
        </div>
      </div>}

      {tab === "brief" && <Brief b={b} setB={setB} done={done} />}

      {done && o.workItems.length > 0 && <div className="note" style={{ marginTop: 16 }}><i className="ti ti-circle-check" /><div>Created in {o.handoff.system}: {o.workItems.length} work items, epic {o.handoff.epic}. (Mock connector: a client build calls the {o.handoff.system} API. Until then, the CSV export imports straight into {o.handoff.system}.)</div></div>}
    </Shell>
  );
}

function Override({ onGo }) {
  const [open, setOpen] = useState(false);
  const [r, setR] = useState("");
  if (!open) return <div><button className="btn link small" style={{ padding: 0, marginTop: 4 }} onClick={() => setOpen(true)}><i className="ti ti-key" /> Override as director and push anyway</button></div>;
  return (
    <div className="row" style={{ marginTop: 8, gap: 8 }}>
      <input className="input inl" placeholder="Reason (logged on the opportunity)" value={r} onChange={(e) => setR(e.target.value)} />
      <button className="btn primary sm" disabled={!r.trim()} onClick={() => onGo(r.trim())}><i className="ti ti-key" /> Override and push</button>
    </div>);
}

function Txt({ value, onChange, edit, ph, big }) {
  if (!edit) return <span>{value || <span className="faint">—</span>}</span>;
  return <input className="input inl" style={big ? { fontSize: 15, fontWeight: 700 } : null} placeholder={ph} value={value} onChange={(e) => onChange(e.target.value)} />;
}

function StoryCard({ s, edit, tests, onChange, onDelete }) {
  const [open, setOpen] = useState(true);
  const set = (k, v) => onChange({ ...s, [k]: v });
  const setAc = (i, k, v) => set("ac", s.ac.map((a, j) => (j === i ? { ...a, [k]: v } : a)));
  const num = s.id.split("-")[1];
  return (
    <div className="card story">
      <div className="row" style={{ alignItems: "center", gap: 10 }}>
        <button className="iconbtn" onClick={() => setOpen(!open)} aria-label={open ? "Collapse" : "Expand"}><i className={`ti ti-chevron-${open ? "down" : "right"}`} /></button>
        <span className="oid">{s.id}</span>
        <div className="grow"><Txt big value={s.title} edit={edit} onChange={(v) => set("title", v)} /></div>
        {edit ? <select className="select" style={{ width: 92, padding: "4px 8px", fontSize: 12 }} value={s.priority} onChange={(e) => set("priority", e.target.value)} aria-label="Priority">{PRI.map((p) => <option key={p}>{p}</option>)}</select>
          : <span className={`status ${s.priority === "Must" ? "flag" : "none"}`}>{s.priority}</span>}
        {edit ? <select className="select" style={{ width: 62, padding: "4px 8px", fontSize: 12 }} value={s.size} onChange={(e) => set("size", e.target.value)} aria-label="Size">{["S", "M", "L"].map((p) => <option key={p}>{p}</option>)}</select>
          : <span className="tag">{s.size}</span>}
        <span className="tag" title="Test scenarios for this story"><i className="ti ti-test-pipe" style={{ fontSize: 11 }} /> {tests}</span>
        {edit && <button className="iconbtn danger" title="Delete story" aria-label={`Delete ${s.id}`} onClick={() => window.confirm(`Delete ${s.id} and its tests?`) && onDelete()}><i className="ti ti-trash" /></button>}
      </div>
      {open && <>
        <div className="userstory">
          <span><b>As a</b> <Txt value={s.asA} edit={edit} onChange={(v) => set("asA", v)} /></span>
          <span><b>I want</b> <Txt value={s.iWant} edit={edit} ph="what they need" onChange={(v) => set("iWant", v)} /></span>
          <span><b>so that</b> <Txt value={s.soThat} edit={edit} ph="the outcome" onChange={(v) => set("soThat", v)} /></span>
        </div>
        <div className="tiny faint" style={{ textTransform: "uppercase", letterSpacing: ".6px", fontWeight: 700, margin: "12px 0 6px" }}>Acceptance criteria</div>
        {s.ac.map((a, i) => (
          <div key={a.id + i} className="acrow">
            <span className="mono tiny faint" style={{ width: 52, flexShrink: 0, paddingTop: 7 }}>{a.id}</span>
            <div className="gwt">
              <span><b>Given</b> <Txt value={a.given} edit={edit} onChange={(v) => setAc(i, "given", v)} /></span>
              <span><b>When</b> <Txt value={a.when} edit={edit} onChange={(v) => setAc(i, "when", v)} /></span>
              <span><b>Then</b> <Txt value={a.then} edit={edit} onChange={(v) => setAc(i, "then", v)} /></span>
            </div>
            {a.src && <span className="tag" style={{ alignSelf: "flex-start", marginTop: 5, background: "var(--amber-soft)", color: "var(--amber-ink)", borderColor: "transparent" }}>{a.src}</span>}
            {edit && <button className="iconbtn" style={{ alignSelf: "flex-start" }} title="Remove criterion" aria-label={`Remove ${a.id}`} onClick={() => set("ac", s.ac.filter((_, j) => j !== i))}><i className="ti ti-x" /></button>}
          </div>))}
        {edit && <button className="btn link small" onClick={() => set("ac", [...s.ac, { id: `AC-${num}.${s.ac.length + 1}`, given: "", when: "", then: "" }])}><i className="ti ti-plus" /> Add criterion</button>}
        {(s.quote || s.trace.signals.length > 0 || s.trace.gates.length > 0 || s.trace.proto) && (
          <div className="trace">
            {s.quote && <div className="small soft" style={{ fontStyle: "italic" }}><i className="ti ti-quote" /> “{s.quote.text}” <span className="mono tiny faint">{s.quote.id}</span></div>}
            <div className="chips" style={{ marginTop: s.quote ? 7 : 0 }}>
              <span className="tiny faint">Traces to</span>
              {s.trace.signals.map((x) => <span key={x} className="chip" style={{ padding: "1px 8px", fontSize: 11 }}><i className="ti ti-radar-2" style={{ fontSize: 12 }} /> {x}</span>)}
              {s.trace.gates.map((x) => <span key={x} className="chip" style={{ padding: "1px 8px", fontSize: 11 }}><i className="ti ti-shield-check" style={{ fontSize: 12 }} /> {x.replace("gate-", "").toUpperCase()}</span>)}
              {s.trace.proto && <span className="chip" style={{ padding: "1px 8px", fontSize: 11 }}><i className="ti ti-device-desktop" style={{ fontSize: 12 }} /> prototype {s.trace.proto}</span>}
            </div>
          </div>)}
      </>}
    </div>
  );
}

function Tests({ pack, edit, setTest, rebuild }) {
  const [type, setType] = useState("all");
  const [open, setOpen] = useState(null);
  const counts = Object.fromEntries(TYPES.map((t) => [t, pack.scenarios.filter((x) => x.type === t).length]));
  const list = pack.scenarios.map((t, i) => [t, i]).filter(([t]) => type === "all" || t.type === type);
  return (
    <>
      <div className="row" style={{ marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <div className="seg">
          <button className={type === "all" ? "on" : ""} onClick={() => setType("all")}>All {pack.scenarios.length}</button>
          {TYPES.filter((t) => counts[t]).map((t) => <button key={t} className={type === t ? "on" : ""} onClick={() => setType(t)}>{t} {counts[t]}</button>)}
        </div>
        {edit && <button className="btn out sm" style={{ marginLeft: "auto" }} onClick={rebuild}><i className="ti ti-refresh" /> Rebuild from stories</button>}
      </div>
      <div className="table">
        <div className="trow head"><span>ID</span><span>Scenario</span><span>Story</span><span>Type</span><span>Pri</span><span>Auto</span><span>In</span></div>
        {list.map(([t, i]) => (
          <div key={t.id + i}>
            <div className="trow" style={{ opacity: t.include ? 1 : .5 }} onClick={() => setOpen(open === t.id ? null : t.id)}>
              <span className="mono tiny">{t.id}</span>
              <span className="small" style={{ fontWeight: 600 }}>{t.title}</span>
              <span className="mono tiny faint">{t.storyId}{t.acId ? ` · ${t.acId}` : ""}</span>
              <span><span className={`ttype ${t.type}`}>{t.type}{t.gate ? ` · ${t.gate}` : ""}</span></span>
              <span className="tiny">{t.priority}</span>
              <span onClick={(e) => e.stopPropagation()}>{edit ? <input type="checkbox" checked={t.automate} aria-label={`Automate ${t.id}`} onChange={(e) => setTest(i, { ...t, automate: e.target.checked })} /> : t.automate ? "yes" : "manual"}</span>
              <span onClick={(e) => e.stopPropagation()}>{edit ? <input type="checkbox" checked={t.include} aria-label={`Include ${t.id}`} onChange={(e) => setTest(i, { ...t, include: e.target.checked })} /> : t.include ? "✓" : ""}</span>
            </div>
            {open === t.id && (
              <div className="texp">
                {["given", "when", "then"].map((k) => (
                  <div key={k} className="row" style={{ alignItems: "flex-start", gap: 10, marginBottom: 6 }}>
                    <b className="tiny" style={{ width: 46, textTransform: "uppercase", paddingTop: edit ? 7 : 0, color: "var(--navy)" }}>{k}</b>
                    <div className="grow small"><Txt value={t[k]} edit={edit} onChange={(v) => setTest(i, { ...t, [k]: v })} /></div>
                  </div>))}
              </div>)}
          </div>))}
      </div>
      <div className="tiny faint" style={{ marginTop: 10 }}>Every acceptance criterion gets a functional test. Edge and negative cases come from the theme playbook, compliance and accessibility tests from the gates this opportunity triggered. Click a row for its steps.</div>
    </>
  );
}

function ListCard({ icon, title, items, edit, check, onChange }) {
  return (
    <div className="card"><h3><i className={`ti ${icon}`} /> {title}</h3>
      {items.map((x, i) => (
        <div key={i} className="row" style={{ alignItems: "flex-start", gap: 8, padding: "4px 0" }}>
          <i className={`ti ${check ? "ti-square" : "ti-point"} faint`} style={{ marginTop: edit ? 8 : 2 }} />
          <div className="grow small">{edit ? <input className="input inl" value={x} onChange={(e) => onChange(items.map((y, j) => (j === i ? e.target.value : y)))} /> : x}</div>
          {edit && <button className="iconbtn" aria-label="Remove" onClick={() => onChange(items.filter((_, j) => j !== i))}><i className="ti ti-x" /></button>}
        </div>))}
      {edit && <button className="btn link small" onClick={() => onChange([...items, ""])}><i className="ti ti-plus" /> Add</button>}
    </div>
  );
}

function Brief({ b, setB, done }) {
  return (
    <div className="brief">
      <h1 style={{ fontSize: 22, margin: "0 0 18px" }}>{b.title}</h1>
      <h2><i className="ti ti-target" /> Scope</h2>
      {done ? <p style={{ lineHeight: 1.55 }}>{b.scope}</p> : <textarea className="textarea" value={b.scope} onChange={(e) => setB({ ...b, scope: e.target.value })} />}
      <h2><i className="ti ti-circle-off" /> Non-goals</h2>
      {done ? <ul>{b.nonGoals.split("\n").filter(Boolean).map((l, i) => <li key={i}>{l}</li>)}</ul>
        : <textarea className="textarea" style={{ minHeight: 40 + b.nonGoals.split("\n").length * 22 }} value={b.nonGoals} onChange={(e) => setB({ ...b, nonGoals: e.target.value })} />}
      <h2><i className="ti ti-radar-2" /> Linked signals</h2>
      <ul>{b.signals.map((s) => <li key={s.id}><span className="mono tiny">{s.id}</span> {s.theme} · {s.volume.toLocaleString()} {s.unit}</li>)}</ul>
      <h2><i className="ti ti-paperclip" /> Evidence</h2>
      {b.evidence.length ? <ul>{b.evidence.map((e, i) => <li key={i}>{e}</li>)}</ul> : <div className="small faint">None attached.</div>}
      <h2><i className="ti ti-device-desktop" /> Approved prototype</h2>
      {b.prototype ? <div className="small">v{b.prototype.v}: {b.prototype.note} · <a href={b.prototype.link} target="_blank" rel="noreferrer">open</a></div> : <div className="small faint">No version approved yet.</div>}
      <h2><i className="ti ti-shield-check" /> Governance</h2>
      <ul>{b.gates.map((g) => <li key={g.name}>{g.name}: <span className={`status ${g.status === "not started" ? "none" : g.status}`}>{g.status}</span>{g.status === "approved" && ` by ${g.by}`}</li>)}</ul>
    </div>
  );
}
