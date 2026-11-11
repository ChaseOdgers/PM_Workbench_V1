import { useState } from "react";
import Shell from "../components/Shell";
import { Modal, Field } from "../components/ui";
import { useSession } from "../auth";
import { useQuery } from "../api/hooks";
import * as api from "../api";
import { PERSONAS, APPROVER_ROLES, can } from "../lib/perms";

export default function Users() {
  const { ws, user } = useSession();
  const users = useQuery(() => api.listUsers(), []);
  const [edit, setEdit] = useState(null);
  const admin = can(user, "users.manage");
  return (
    <Shell title={<><i className="ti ti-users" style={{ color: "var(--navy)" }} /> Users &amp; roles</>}>
      <div className="pagehead"><div><h1>Users &amp; roles</h1>
        <p>Who can sign in, which role they have, and which value streams they can see. In a client build these come from SSO groups; here you can change them directly.</p></div>
        {admin && <div className="acts"><button className="btn primary sm" onClick={() => setEdit({ name: "", title: "", persona: "pm", streams: [ws.streams[0].id], approverRoles: [] })}><i className="ti ti-user-plus" /> Add user</button></div>}
      </div>
      <div className="table">
        <div className="tr head" style={{ gridTemplateColumns: "1.3fr 1fr 1.6fr 1fr 40px" }}><span>User</span><span>Role</span><span>Value streams</span><span>Approves</span><span /></div>
        {users?.map((u) => (
          <div key={u.id} className="tr" style={{ gridTemplateColumns: "1.3fr 1fr 1.6fr 1fr 40px" }}>
            <div className="row"><span className="av sm">{u.initials}</span><div><div className="lt">{u.name}</div><div className="ls">{u.title}{u.demo && " · demo login"}</div></div></div>
            <div><span className="pill agent"><i className={`ti ${PERSONAS[u.persona].icon}`} /> {PERSONAS[u.persona].label}</span></div>
            <div className="small soft">{u.streams.length === ws.streams.length ? "All value streams" : u.streams.map((s) => ws.streams.find((x) => x.id === s)?.name).join(", ")}</div>
            <div className="small soft">{u.approverRoles.join(", ") || "—"}</div>
            <div>{admin && <button className="iconbtn" aria-label={`Edit ${u.name}`} onClick={() => setEdit({ ...u })}><i className="ti ti-pencil" /></button>}</div>
          </div>))}
      </div>
      {edit && <UserModal ws={ws} initial={edit} onClose={() => setEdit(null)} onSave={async (u) => { await api.saveUser(u, user.id); setEdit(null); }} />}
    </Shell>
  );
}

function UserModal({ ws, initial, onClose, onSave }) {
  const [u, setU] = useState(initial);
  const toggle = (key, v) => setU({ ...u, [key]: u[key].includes(v) ? u[key].filter((x) => x !== v) : [...u[key], v] });
  const valid = u.name.trim() && u.streams.length;
  return (
    <Modal title={u.id ? `Edit ${initial.name}` : "Add user"} icon="ti-user" onClose={onClose}
      footer={<><button className="btn out sm" onClick={onClose}>Cancel</button><button className="btn primary sm" disabled={!valid} onClick={() => onSave(u)}>Save</button></>}>
      <Field label="Name"><input className="input" value={u.name} onChange={(e) => setU({ ...u, name: e.target.value })} /></Field>
      <Field label="Title"><input className="input" value={u.title} onChange={(e) => setU({ ...u, title: e.target.value })} /></Field>
      <Field label="Role"><select className="select" value={u.persona} onChange={(e) => setU({ ...u, persona: e.target.value })}>
        {Object.entries(PERSONAS).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}</select></Field>
      <Field label="Value streams">
        <div className="chips">{ws.streams.map((s) => (
          <label key={s.id} className="chip" style={{ cursor: "pointer" }}><input type="checkbox" checked={u.streams.includes(s.id)} onChange={() => toggle("streams", s.id)} /> {s.name}</label>))}</div>
      </Field>
      {u.persona === "reviewer" && <Field label="Approves gates for">
        <div className="chips">{APPROVER_ROLES.map((r) => (
          <label key={r} className="chip" style={{ cursor: "pointer" }}><input type="checkbox" checked={u.approverRoles.includes(r)} onChange={() => toggle("approverRoles", r)} /> {r}</label>))}</div>
      </Field>}
    </Modal>
  );
}
