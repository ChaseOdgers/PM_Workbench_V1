import { Link } from "react-router-dom";
import Shell from "../components/Shell";
import { Empty } from "../components/ui";
import { useSession } from "../auth";
import { useQuery } from "../api/hooks";
import * as api from "../api";
import { ago } from "../lib/format";

export default function Reviews() {
  const { user } = useSession();
  const q = useQuery(() => api.listReviewQueue(user), [user.id]);
  const pending = q?.filter((r) => r.review.status === "pending") || [];
  const done = q?.filter((r) => r.review.status !== "pending") || [];
  const Row = ({ r }) => (
    <Link to={`/opportunities/${r.opp.id}`} className="tr click" style={{ gridTemplateColumns: "1.6fr 1.2fr 1fr 110px", textDecoration: "none", color: "inherit" }}>
      <div><div className="oid">{r.opp.id} · {r.stream}</div><div className="lt">{r.opp.title}</div></div>
      <div><div className="small" style={{ fontWeight: 600 }}>{r.gate.name}</div><div className="ls">Triggered: {r.reason}</div></div>
      <div className="small soft">{r.gate.approverRole} · {r.gate.action === "block" ? "blocks handoff" : "flag only"}</div>
      <div><span className={`status ${r.review.status}`}>{r.review.status}{r.review.at ? ` · ${ago(r.review.at)}` : ""}</span></div>
    </Link>);
  return (
    <Shell title={<><i className="ti ti-gavel" style={{ color: "var(--navy)" }} /> Review queue</>}>
      <div className="pagehead"><div><h1>Review queue</h1>
        <p>Opportunities that hit a gate you approve for ({user.approverRoles.join(", ")}). Open one to read the evidence and prototype, then approve or reject with a comment.</p></div></div>
      <h3 className="srcgroup"><i className="ti ti-clock" /> Waiting on you · {pending.length}</h3>
      {pending.length ? <div className="table">{pending.map((r) => <Row key={r.opp.id + r.gate.id} r={r} />)}</div>
        : <Empty icon="ti-circle-check" title="Nothing waiting" text="New reviews appear here when an opportunity with one of your gates moves into Prototype." />}
      {done.length > 0 && <><h3 className="srcgroup" style={{ marginTop: 24 }}><i className="ti ti-history" /> Decided</h3>
        <div className="table">{done.map((r) => <Row key={r.opp.id + r.gate.id} r={r} />)}</div></>}
    </Shell>
  );
}
