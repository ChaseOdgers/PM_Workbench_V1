import { Routes, Route, Navigate, useParams } from "react-router-dom";
import { useSession } from "./auth";
import SignIn from "./screens/SignIn";
import Signals from "./screens/Signals";
import Opportunities from "./screens/Opportunities";
import OpportunityDetail from "./screens/OpportunityDetail";
import PrototypeStudio from "./screens/PrototypeStudio";
import Handoff from "./screens/Handoff";
import ContextAgents from "./screens/ContextAgents";
import Governance from "./screens/Governance";
import Users from "./screens/Users";
import Reviews from "./screens/Reviews";
import Activity from "./screens/Activity";
import SharePrototype from "./screens/SharePrototype";

const HOME = { director: "/signals", pm: "/signals", admin: "/context", reviewer: "/reviews" };

function Guard({ children }) {
  const { user } = useSession();
  return user ? children : <Navigate to="/" replace />;
}

export default function App() {
  const { user } = useSession();
  return (
    <Routes>
      <Route path="/" element={user ? <Navigate to={HOME[user.persona]} replace /> : <SignIn />} />
      <Route path="/share/:oppId/:v" element={<SharePrototype />} />
      <Route path="/signals" element={<Guard><Signals /></Guard>} />
      <Route path="/opportunities" element={<Guard><Opportunities /></Guard>} />
      <Route path="/opportunities/:id" element={<Guard><OpportunityDetail /></Guard>} />
      <Route path="/opportunities/:id/prototype" element={<Guard><PrototypeStudio /></Guard>} />
      <Route path="/opportunities/:id/handoff" element={<Guard><Handoff /></Guard>} />
      <Route path="/context" element={<Guard><ContextAgents /></Guard>} />
      <Route path="/governance" element={<Guard><Governance /></Guard>} />
      <Route path="/users" element={<Guard><Users /></Guard>} />
      <Route path="/reviews" element={<Guard><Reviews /></Guard>} />
      <Route path="/activity" element={<Guard><Activity /></Guard>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
