import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "../auth";
import * as api from "../api";
import { PERSONAS } from "../lib/perms";

export default function SignIn() {
  const { ws } = useSession();
  const nav = useNavigate();
  const [step, setStep] = useState("sso");
  const [busy, setBusy] = useState(false);
  const b = ws.brand;
  const demo = ws.users.filter((u) => u.demo);
  const others = ws.users.filter((u) => !u.demo);

  async function go(id) { await api.signIn(id); nav("/"); }
  function sso() { setBusy(true); setTimeout(() => { setBusy(false); setStep("pick"); }, 700); }

  return (
    <div className="signin" style={{ "--sidebar": b.sidebar, "--accent": b.accent, "--accent-d": b.accentD, "--accent-soft": b.accentSoft, "--navy": b.navy, "--navy-soft": b.navySoft }}>
      <div className="hero">
        <div className="row"><div className="glyph">PM</div><b>{ws.appName}</b></div>
        <div>
          <h1>Turn what your systems are saying into products your team can ship.</h1>
          <p>Agents read your connected sources, rank what matters, and help you shape, prototype and hand off opportunities, with governance built in.</p>
          <div className="loop">{["Connect context", "Agents raise signals", "Shape an opportunity", "Prototype with the team", "Hand off to engineering"].map((s) => <span key={s}>{s}</span>)}</div>
        </div>
        <div className="tiny" style={{ color: "var(--sidebar-mut)" }}>Demo workspace · {ws.client} mock data pack · nothing here is real client data</div>
      </div>
      <div className="form">
        {step === "sso" ? (
          <>
            <h2 style={{ fontSize: 24 }}>Sign in to {ws.client}</h2>
            <p className="soft" style={{ margin: "8px 0 24px", lineHeight: 1.5 }}>Your organization signs in with single sign-on.</p>
            <button className="btn primary" style={{ padding: "13px 18px" }} onClick={sso} disabled={busy}>
              {busy ? <i className="ti ti-loader-2 spin" /> : <i className="ti ti-shield-lock" />} Sign in with SSO ({ws.ssoProvider})
            </button>
            <div className="note" style={{ marginTop: 20 }}><i className="ti ti-info-circle" /><div>SSO is mocked in V1. A client build plugs in their identity provider (Okta, Entra ID or IBM Verify) and maps its groups to the four roles.</div></div>
          </>
        ) : (
          <>
            <h2 style={{ fontSize: 22 }}>Choose a demo login</h2>
            <p className="soft small" style={{ margin: "6px 0 18px" }}>Each role sees a different slice of the same workspace.</p>
            {demo.map((u) => (
              <button key={u.id} className="persona" onClick={() => go(u.id)}>
                <span className="pic"><i className={`ti ${PERSONAS[u.persona].icon}`} /></span>
                <span className="grow"><b>{PERSONAS[u.persona].label}</b> <span className="faint small">· {u.name}, {u.title}</span>
                  <div className="small soft" style={{ marginTop: 2 }}>{PERSONAS[u.persona].blurb}</div></span>
                <i className="ti ti-chevron-right faint" />
              </button>))}
            <details style={{ marginTop: 8 }}>
              <summary className="small soft" style={{ cursor: "pointer" }}>Other users in this workspace ({others.length})</summary>
              <div style={{ marginTop: 10 }}>{others.map((u) => (
                <button key={u.id} className="persona" onClick={() => go(u.id)}>
                  <span className="av sm">{u.initials}</span><span className="grow small"><b>{u.name}</b> · {u.title}</span>
                </button>))}</div>
            </details>
            <button className="btn link small" style={{ marginTop: 18, alignSelf: "flex-start" }} onClick={async () => { await api.resetDemo(); }}>
              <i className="ti ti-refresh" /> Reset demo data
            </button>
          </>
        )}
      </div>
    </div>
  );
}
