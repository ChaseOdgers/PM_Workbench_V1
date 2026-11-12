import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useSession } from "../auth";
import { useQuery } from "../api/hooks";
import * as api from "../api";
import { PERSONAS } from "../lib/perms";
import { ago } from "../lib/format";

const NAV = {
  director: [["portfolio", "ti-layout-dashboard", "Portfolio"], ["signals", "ti-radar-2", "Signals"], ["opportunities", "ti-bulb", "Opportunities"], ["context", "ti-database", "Context & agents"], ["governance", "ti-shield-check", "Governance"], ["activity", "ti-history", "Activity"]],
  pm: [["signals", "ti-radar-2", "Signals"], ["opportunities", "ti-bulb", "Opportunities"], ["context", "ti-database", "Context & agents"], ["governance", "ti-shield-check", "Governance"], ["activity", "ti-history", "Activity"]],
  admin: [["context", "ti-database", "Context & agents"], ["governance", "ti-shield-check", "Governance"], ["users", "ti-users", "Users & roles"], ["opportunities", "ti-bulb", "Opportunities"], ["activity", "ti-history", "Activity"]],
  reviewer: [["reviews", "ti-gavel", "Review queue"], ["opportunities", "ti-bulb", "Opportunities"], ["governance", "ti-shield-check", "Governance"]],
};

export default function Shell({ title, children }) {
  const { ws, user, stream } = useSession();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const counts = useQuery(async () => {
    const [sig, opps, q, src] = await Promise.all([
      api.listSignals(stream.id), api.listOpportunities(user.streams), api.listReviewQueue(user), api.listSources(),
    ]);
    const lastSync = src.map((s) => s.lastSync).filter(Boolean).sort().pop();
    return { signals: sig.top.length, opportunities: opps.filter((o) => o.streamId === stream.id || !["pm", "director"].includes(user.persona)).length, reviews: q.filter((r) => r.review.status === "pending").length, lastSync };
  }, [stream.id, user.id]);
  const b = ws.brand;
  const brandVars = { "--sidebar": b.sidebar, "--sidebar-2": b.sidebar2, "--sidebar-line": b.sidebarLine, "--accent": b.accent, "--accent-d": b.accentD, "--accent-soft": b.accentSoft, "--navy": b.navy, "--navy-soft": b.navySoft };
  const multi = user.streams.length > 1 && user.persona !== "reviewer";

  return (
    <div className="app" style={brandVars}>
      <aside className="side">
        <div className="brand"><div className="glyph">PM</div><div><div className="name">{ws.appName}</div><div className="sub">{ws.client.toUpperCase()} · V1</div></div></div>
        {user.persona !== "reviewer" && (
          <div className={`ctx ${multi ? "click" : ""}`} onClick={() => multi && setOpen(!open)}>
            <div className="lbl">Value stream</div>
            <div className="val"><span>{stream.name}</span>{multi && <i className="ti ti-selector" />}</div>
            {open && (
              <div className="vsmenu">
                {ws.streams.filter((s) => user.streams.includes(s.id)).map((s) => (
                  <div key={s.id} className={`vsitem ${s.id === stream.id ? "on" : ""}`} onClick={(e) => { e.stopPropagation(); setOpen(false); api.setStream(s.id); }}>
                    <i className={`ti ${s.icon}`} /> {s.name}
                  </div>))}
              </div>)}
          </div>)}
        <nav className="nav">
          <div className="grp">{PERSONAS[user.persona].label}</div>
          {NAV[user.persona].map(([path, icon, label]) => (
            <NavLink key={path} to={`/${path}`}>
              <i className={`ti ${icon}`} /><span>{label}</span>
              {counts && counts[path] != null && <span className="ct">{counts[path]}</span>}
            </NavLink>))}
          <div className="sync"><span className="pulse" /><span>Context synced {counts?.lastSync ? ago(counts.lastSync) : "…"}</span></div>
        </nav>
        <div className="me">
          <span className="av">{user.initials}</span>
          <div><div className="nm">{user.name}</div><div className="ro">{user.title}</div></div>
          <button title="Switch user / sign out" aria-label="Sign out" onClick={async () => { await api.signOut(); nav("/"); }}><i className="ti ti-logout" /></button>
        </div>
      </aside>
      <section className="main">
        <div className="top">
          <div className="tl">{title}</div>
          <div className="tools">
            <span className="rolechip"><i className={`ti ${PERSONAS[user.persona].icon}`} /> Signed in as {PERSONAS[user.persona].label}</span>
          </div>
        </div>
        <div className="scroll"><div className="wrap">{children}</div></div>
      </section>
    </div>
  );
}
