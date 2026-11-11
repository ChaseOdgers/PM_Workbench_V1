import { createContext, useContext } from "react";
import { useQuery } from "./api/hooks";
import * as api from "./api";

const Ctx = createContext(null);

export function SessionProvider({ children }) {
  const session = useQuery(() => api.getSession(), []);
  const ws = useQuery(() => api.getWorkspace(), []);
  if (!ws) return null;
  const user = session ? ws.users.find((u) => u.id === session.userId) : null;
  const streamId = user ? (user.streams.includes(session.streamId) ? session.streamId : user.streams[0]) : null;
  const stream = ws.streams.find((s) => s.id === streamId);
  return <Ctx.Provider value={{ ws, user, stream, streamId }}>{children}</Ctx.Provider>;
}
export const useSession = () => useContext(Ctx);
