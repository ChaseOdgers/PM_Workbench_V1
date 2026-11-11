import { useEffect } from "react";
import { cx } from "../lib/format";

export function Modal({ title, icon, onClose, children, footer, wide }) {
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="modalbg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cx("modal", wide && "wide")} role="dialog" aria-label={title}>
        <div className="mh">{icon && <i className={`ti ${icon}`} />}{title}
          <button className="iconbtn" onClick={onClose} aria-label="Close"><i className="ti ti-x" /></button></div>
        <div className="mb">{children}</div>
        {footer && <div className="mf">{footer}</div>}
      </div>
    </div>
  );
}

export const PHASES = ["Sense", "Shape", "Prototype", "Handoff"];
export function PhaseTrack({ phase }) {
  const ci = PHASES.indexOf(phase);
  return (
    <div className="ptrack">
      {PHASES.map((p, i) => (
        <span key={p} style={{ display: "contents" }}>
          <div className={cx("pstep", i < ci && "done", i === ci && "now")}>
            <span className="pip">{i < ci || (i === ci && phase === "Handoff") ? <i className="ti ti-check" /> : i + 1}</span>{p}
          </div>
          {i < PHASES.length - 1 && <span className={cx("pbar", i < ci && "done")} />}
        </span>
      ))}
    </div>
  );
}

export function Empty({ icon = "ti-inbox", title, text, children }) {
  return (
    <div className="empty"><i className={`ti ${icon}`} />
      <div className="et">{title}</div>{text && <div className="es">{text}</div>}
      {children && <div className="ebtns">{children}</div>}</div>
  );
}

export function Field({ label, children }) {
  return <div className="field"><label>{label}</label>{children}</div>;
}

export function Spark({ trend }) {
  const max = Math.max(...trend);
  return <div className="spark" aria-hidden>{trend.map((h, i) => <span key={i} className={i >= trend.length - 3 ? "hi" : ""} style={{ height: `${(h / max) * 100}%` }} />)}</div>;
}

export function Avatar({ user, sm }) {
  return <span className={cx("av", sm && "sm")} title={user?.name}>{user?.initials || "AI"}</span>;
}
