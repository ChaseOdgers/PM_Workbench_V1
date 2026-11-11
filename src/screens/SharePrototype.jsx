import { useParams } from "react-router-dom";
import { useQuery } from "../api/hooks";
import * as api from "../api";

// The link a PM shares with the team. V1 has no backend, so it opens in the same browser only.
export default function SharePrototype() {
  const { oppId, v } = useParams();
  const html = useQuery(() => api.getVersionHtml(oppId, v), [oppId, v]);
  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <div style={{ background: "#12233A", color: "#fff", padding: "8px 16px", fontSize: 13, display: "flex", gap: 10 }}>
        <b>Shared prototype</b><span style={{ opacity: .7 }}>{oppId} · v{v}</span>
        <span style={{ marginLeft: "auto", opacity: .7 }}>Send feedback to the PM; they'll paste it into the studio.</span>
      </div>
      {html ? <iframe title={`${oppId} v${v}`} srcDoc={html} sandbox="allow-same-origin" style={{ flex: 1, border: "none" }} />
        : <div style={{ padding: 40, fontFamily: "system-ui" }}>This version isn't in this browser's demo data. In V1, share links work on the machine that made them.</div>}
    </div>
  );
}
