import { useEffect, useState, useCallback } from "react";
import { subscribe } from "./db";

// Runs an API call and re-runs it whenever the mock DB changes.
// Keeps the last result while refetching, so screens don't flicker.
export function useQuery(fn, deps = []) {
  const [data, setData] = useState(null);
  const [rev, setRev] = useState(0);
  useEffect(() => subscribe(() => setRev((r) => r + 1)), []);
  useEffect(() => {
    let live = true;
    Promise.resolve(fn()).then((v) => live && setData(v));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, rev]);
  return data;
}

// Wraps a mutation so the screen can show a busy state and an error message.
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const run = useCallback(async (fn) => {
    setBusy(true); setError(null);
    try { return await fn(); } catch (e) { setError(e.message); return null; } finally { setBusy(false); }
  }, []);
  return { run, busy, error, setError };
}
