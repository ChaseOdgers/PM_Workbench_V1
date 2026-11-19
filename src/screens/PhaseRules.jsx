import { useEffect, useState } from "react";
import { useQuery } from "../api/hooks";
import * as api from "../api";
import { itemId, whenLabel } from "../lib/phases";

// Governance → Phase checklists. The org sets a default; each value stream inherits it or
// customizes its own. Admins and directors edit; everyone can see the rules that apply to them.
export default function PhaseRules({ user, editable }) {
  const data = useQuery(() => api.getPhaseRules(), []);
  const [scope, setScope] = useState("org");
  const [draft, setDraft] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);

  const stored = data && (scope === "org" ? data.org : data.streams[scope]);
  const inherits = scope !== "org" && (!stored || stored.inherit);
  useEffect(() => { if (data) { setDraft(inherits ? null : structuredClone(stored)); setDirty(false); } }, [data, scope]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!data) return null;

  const streamName = (id) => data.list.find((s) => s.id === id)?.name;
  const shown = draft || data.org;
  const set = (next) => { setDraft({ ...next, preset: "custom" }); setDirty(true); setSaved(false); };
  const setItems = (tk, items) => set({ ...shown, transitions: { ...shown.transitions, [tk]: items } });
  const save = async (rules) => { await api.savePhaseRules(scope, rules, user.id); setDirty(false); setSaved(true); };
  const applyPreset = async (key) => {
    if (dirty && !window.confirm("Replace your unsaved changes with this preset?")) return;
    const r = await api.previewPreset(key);
    setDraft(r); setDirty(true); setSaved(false);
  };
  const presetName = (p) => (p === "custom" ? "Custom" : data.presets[p]?.label || p);
  const count = (r) => Object.values(r?.transitions || {}).flat();

  return (
    <div className="phasecfg">
      <div className="scopes">
        <div className="tiny faint" style={{ textTransform: "uppercase", letterSpacing: ".7px", fontWeight: 700, margin: "2px 4px 8px" }}>Applies to</div>
        <button className={`scope ${scope === "org" ? "on" : ""}`} onClick={() => setScope("org")}>
          <i className="ti ti-building" /><div className="grow"><div className="lt">Organization default</div><div className="tiny faint">{presetName(data.org.preset)} · {count(data.org).length} items</div></div></button>
        <div className="tiny faint" style={{ textTransform: "uppercase", letterSpacing: ".7px", fontWeight: 700, margin: "14px 4px 8px" }}>Teams</div>
        {data.list.map((s) => (
          <button key={s.id} className={`scope ${scope === s.id ? "on" : ""}`} onClick={() => setScope(s.id)}>
            <i className={`ti ${s.icon}`} /><div className="grow"><div className="lt">{s.name}</div>
              <div className="tiny faint">{s.inherit ? "Org default" : presetName(s.preset)}{s.open ? ` · ${s.blocked} of ${s.open} blocked` : ""}</div></div>
            {!s.inherit && <span className="tag" style={{ background: "var(--accent-soft)", color: "var(--accent-d)", borderColor: "transparent" }}>own rules</span>}
          </button>))}
      </div>

      <div className="grow" style={{ minWidth: 0 }}>
        <div className="row" style={{ alignItems: "flex-start", marginBottom: 12 }}>
          <div className="grow">
            <div style={{ fontWeight: 700, fontSize: 17 }}>{scope === "org" ? "Organization default" : streamName(scope)}</div>
            <div className="small faint">{scope === "org" ? "Every team uses these unless it sets its own." : inherits ? "This team uses the organization default." : "This team has its own rules, separate from the org default."}</div>
          </div>
          {editable && scope !== "org" && (inherits
            ? <button className="btn primary sm" onClick={() => { setDraft({ ...structuredClone(data.org), preset: data.org.preset }); setDirty(true); setSaved(false); }}><i className="ti ti-adjustments" /> Customize for this team</button>
            : <button className="btn out sm" onClick={() => window.confirm("Drop this team's rules and use the organization default?") && save({ inherit: true })}><i className="ti ti-arrow-back-up" /> Use org default</button>)}
        </div>

        {(!inherits || draft) && editable && (
          <div className="presets">
            {Object.entries(data.presets).map(([k, p]) => (
              <button key={k} className={`preset ${shown.preset === k ? "on" : ""}`} onClick={() => applyPreset(k)}>
                <div className="lt">{p.label}</div><div className="tiny faint" style={{ lineHeight: 1.4 }}>{p.blurb}</div></button>))}
          </div>)}

        {inherits && !draft && <div className="note" style={{ marginBottom: 12 }}><i className="ti ti-link" /><div>Showing the organization default ({presetName(data.org.preset)}). Changes to the org default apply here automatically.</div></div>}

        {scope === "org" && (
          <div className="card row" style={{ marginBottom: 12, gap: 12, padding: "12px 15px" }}>
            <i className="ti ti-hierarchy-3" style={{ fontSize: 20, color: "var(--navy)" }} />
            <div className="grow"><div className="lt">What teams can change</div><div className="tiny faint">Lock individual items below (<i className="ti ti-lock" />) so every team keeps them, or lock everything.</div></div>
            <select className="select" style={{ width: 300 }} disabled={!editable} value={shown.teamPolicy || "free"} onChange={(e) => set({ ...shown, teamPolicy: e.target.value })}>
              <option value="free">Teams can loosen or tighten (locked items stay)</option>
              <option value="tighten">Teams can only add or tighten</option>
            </select>
          </div>)}
        <div className="stack">
          {data.transitions.map((t) => (
            <TransitionCard key={t.key} t={t} items={shown.transitions[t.key] || []} checks={data.checks} who={data.who} when={data.when} gates={data.gates} groups={data.groups}
              scope={scope} orgItems={scope === "org" ? [] : (data.org.transitions[t.key] || []).filter((x) => x.locked || data.org.teamPolicy === "tighten")}
              target={shown.targets?.[t.key] ?? ""} onTarget={(v) => set({ ...shown, targets: { ...(shown.targets || {}), [t.key]: v ? Number(v) : undefined } })}
              edit={editable && (!inherits || !!draft)} onChange={(items) => setItems(t.key, items)} />))}
        </div>

        <div className="row" style={{ marginTop: 14, gap: 12 }}>
          <label className="row small" style={{ gap: 7, cursor: editable && (!inherits || draft) ? "pointer" : "default" }}>
            <input type="checkbox" disabled={!editable || (inherits && !draft)} checked={!!shown.allowOverride} onChange={(e) => set({ ...shown, allowOverride: e.target.checked })} />
            Directors can override a required item with a written reason (logged)</label>
          {editable && (!inherits || draft) && <>
            <span className="grow" />
            {saved && !dirty && <span className="tiny faint"><i className="ti ti-check" /> Saved. Open opportunities re-check right away.</span>}
            <button className="btn primary sm" disabled={!dirty} onClick={() => save(shown)}><i className="ti ti-device-floppy" /> Save {scope === "org" ? "org default" : "team rules"}</button>
          </>}
        </div>
      </div>
    </div>
  );
}

function TransitionCard({ t, items, checks, who, when, gates, groups, scope, orgItems, target, onTarget, edit, onChange }) {
  const [adding, setAdding] = useState("");
  const [text, setText] = useState("");
  // Org items a team must keep: shown read-only at the top unless the team already has them.
  const inherited = orgItems.filter((oi) => !items.some((x) => x.id === oi.id));
  const lockedIds = new Set(orgItems.map((x) => x.id));
  const all = [...inherited.map((x) => ({ ...x, inheritedRow: true })), ...items];
  const req = all.filter((i) => i.level === "required").length;
  const upd = (k, patch) => onChange(items.map((x, j) => (j === k ? { ...x, ...patch } : x)));
  const add = () => {
    const it = adding === "manual" ? { check: "manual", label: text.trim(), level: "required", who: "pm", group: "Consult" } : { check: adding, level: "required", group: checks[adding].data ? "Evidence" : "Ready", ...(checks[adding].takesN ? { n: checks[adding].n } : {}) };
    const id = itemId(t.key, it);
    if (items.some((x) => x.id === id)) return;
    onChange([...items, { id, ...it }]); setAdding(""); setText("");
  };
  const whenOpts = [["always", "Always applies"], ...gates.map((g) => [`gate:${g.id}`, `Only when ${g.name} triggers`]), ...Object.entries(when).filter(([k]) => k !== "always")];
  return (
    <div className="card">
      <h3><i className="ti ti-arrow-right" /> {t.label} <span className="right faint" style={{ textTransform: "none", letterSpacing: 0 }}>{t.hint} · {req} required · {all.length - req} nice to have</span></h3>
      <div className="row tiny faint" style={{ margin: "-6px 0 8px", gap: 10, flexWrap: "wrap" }}>
        <span><i className="ti ti-robot" /> checked automatically · <i className="ti ti-database" /> uses connected data · <i className="ti ti-signature" /> a task a person marks done</span>
        <span className="grow" />
        <span className="row" style={{ gap: 6 }}><i className="ti ti-clock" /> Target time in {t.from}:
          {edit ? <input className="input inl" type="number" min="1" style={{ width: 64, flex: "none" }} placeholder="—" value={target} onChange={(e) => onTarget(e.target.value)} /> : <b>{target || "none"}</b>} days</span>
      </div>
      {all.length === 0 && <div className="small faint" style={{ padding: "4px 0 8px" }}>No requirements. Ideas move straight through.</div>}
      {all.map((it, idx) => {
        const k = idx - inherited.length;
        const c = checks[it.check];
        const ro = !edit || it.inheritedRow;
        const fromOrg = it.inheritedRow || lockedIds.has(it.id);
        return (
          <div key={(it.id || "") + idx} className="cfgrow" style={it.inheritedRow ? { background: "var(--surface-2)", margin: "0 -8px", padding: "8px" } : null}>
            <i className={`ti ${it.check === "manual" ? "ti-signature" : c?.data ? "ti-database" : "ti-robot"} faint`} title={it.check === "manual" ? "A person signs this off" : c?.data ? "Checked against the connected data" : "The Workbench checks this automatically"} />
            <div className="grow small">
              {it.check === "manual"
                ? (!ro ? <input className="input inl" value={it.label} onChange={(e) => upd(k, { label: e.target.value })} /> : it.label)
                : c?.takesN
                  ? <span className="row" style={{ gap: 6 }}>{c.label.split("N")[0]}{!ro ? <input className="input inl" type="number" min="1" style={{ width: 66, flex: "none" }} value={it.n ?? c.n} onChange={(e) => upd(k, { n: Math.max(1, Number(e.target.value) || 1) })} /> : <b>{it.n ?? c.n}</b>}{c.label.split("N").slice(1).join("N")}</span>
                  : c?.label || it.check}
              <div className="tiny faint row" style={{ marginTop: 3, gap: 8, flexWrap: "wrap" }}>
                {it.check === "manual" && <span>Signed off by: {!ro
                  ? <select className="select" style={{ width: "auto", padding: "2px 6px", fontSize: 11.5, display: "inline-block" }} value={it.who} onChange={(e) => upd(k, { who: e.target.value })}>{Object.entries(who).map(([w, l]) => <option key={w} value={w}>{l}</option>)}</select>
                  : who[it.who] || "Anyone"}</span>}
                {!ro ? <select className="select" style={{ width: "auto", padding: "2px 6px", fontSize: 11.5 }} value={it.group || ""} onChange={(e) => upd(k, { group: e.target.value })} aria-label="Section"><option value="">Section…</option>{groups.map((x) => <option key={x}>{x}</option>)}</select>
                  : it.group && <span className="tag" style={{ fontSize: 10 }}>{it.group}</span>}
                {!ro ? <select className="select" style={{ width: "auto", padding: "2px 6px", fontSize: 11.5 }} value={it.when || "always"} onChange={(e) => upd(k, { when: e.target.value })} aria-label="Applies when">{whenOpts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                  : it.when && it.when !== "always" && <span><i className="ti ti-filter" /> {whenLabel(it.when, gates)}</span>}
                {fromOrg && <span style={{ color: "var(--navy)" }}><i className="ti ti-lock" /> set by the organization</span>}
              </div>
            </div>
            {scope === "org" && edit && <button className={`iconbtn ${it.locked ? "on" : ""}`} title={it.locked ? "Locked: every team keeps this item" : "Lock so every team keeps this item"} aria-label="Lock for all teams" onClick={() => upd(k, { locked: !it.locked })}
              style={it.locked ? { color: "var(--navy)", borderColor: "var(--navy)", background: "var(--navy-soft)" } : null}><i className={`ti ${it.locked ? "ti-lock" : "ti-lock-open"}`} /></button>}
            {!ro ? <select className="select" style={{ width: 128, padding: "4px 8px", fontSize: 12 }} value={it.level} disabled={fromOrg && it.level === "required"} onChange={(e) => upd(k, { level: e.target.value })} aria-label="Level">
              <option value="required">Required</option><option value="recommended">Nice to have</option></select>
              : <span className={`lvl ${it.level}`}>{it.level === "required" ? "required" : "nice to have"}</span>}
            {!ro && !fromOrg && <button className="iconbtn" aria-label="Remove" onClick={() => onChange(items.filter((_, j) => j !== k))}><i className="ti ti-x" /></button>}
          </div>);
      })}
      {edit && (
        <div className="row" style={{ marginTop: 10, gap: 8, flexWrap: "wrap" }}>
          <select className="select" style={{ width: 320, padding: "5px 8px", fontSize: 12.5 }} value={adding} onChange={(e) => setAdding(e.target.value)} aria-label="Add a requirement">
            <option value="">Add a requirement…</option>
            <optgroup label="From connected data">{Object.entries(checks).filter(([, c]) => c.data).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}</optgroup>
            <optgroup label="Checked automatically">{Object.entries(checks).filter(([, c]) => !c.data).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}</optgroup>
            <optgroup label="A task someone does"><option value="manual">Custom task (e.g. consult the devs, present at council)</option></optgroup>
          </select>
          {adding === "manual" && <input className="input inl" style={{ maxWidth: 320 }} placeholder="What needs to be done?" value={text} onChange={(e) => setText(e.target.value)} />}
          {adding && <button className="btn out sm" disabled={adding === "manual" && !text.trim()} onClick={add}><i className="ti ti-plus" /> Add</button>}
        </div>)}
    </div>
  );
}
