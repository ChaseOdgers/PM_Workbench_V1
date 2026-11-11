import Shell from "../components/Shell";
import { Empty } from "../components/ui";
import { useQuery } from "../api/hooks";
import * as api from "../api";
import { ago } from "../lib/format";

export default function Activity() {
  const items = useQuery(() => api.listAudit(100), []);
  return (
    <Shell title={<><i className="ti ti-history" style={{ color: "var(--navy)" }} /> Activity</>}>
      <div className="pagehead"><div><h1>Activity</h1><p>Every action taken in this workspace during the demo, newest first. This is the audit trail a client build would keep in its own store.</p></div></div>
      {items?.length ? (
        <div className="table">{items.map((a) => (
          <div key={a.id} className="lrow">
            <div className="lic"><i className="ti ti-point" /></div>
            <div className="grow"><div className="small"><b>{a.userName}</b> {a.action} <span className="mono">{a.target}</span></div>
              {a.detail && <div className="ls">{a.detail}</div>}</div>
            <span className="tiny faint">{ago(a.at)}</span>
          </div>))}</div>
      ) : <Empty icon="ti-history" title="No activity yet" text="Actions you take (promoting a signal, approving a gate, handing off) show up here." />}
    </Shell>
  );
}
