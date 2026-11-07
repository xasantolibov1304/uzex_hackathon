import { useCallback, useRef, useState } from "react";
import { api } from "../lib/api.js";

/** useState + ref: async funksiyalar har doim eng so'nggi qiymatni o'qiydi. */
export function useLiveState(initial) {
  const [value, setValue] = useState(initial);
  const ref = useRef(value);
  const set = useCallback((v) => { ref.current = v; setValue(v); }, []);
  return [value, set, ref];
}

// list: { kind: "none" | "hint" | "loading" | "items" | "error", items?, message? }

export function usePrices() {
  const [q, setQ, qRef] = useLiveState("");
  const [cat, setCat, catRef] = useLiveState("");
  const [list, setList] = useState({ kind: "none" });
  const [info, setInfo] = useState("");
  const weeklyRef = useRef(null);
  const req = useRef(0);

  const load = useCallback(async () => {
    const my = ++req.current;
    setList({ kind: "loading" });
    try {
      const r = await api(`/api/prices?q=${encodeURIComponent(qRef.current.trim())}&category=${encodeURIComponent(catRef.current)}`);
      if (my !== req.current) return;
      weeklyRef.current = r.items;
      setInfo(`${r.total} ta tovar${r.total > r.items.length ? ` (birinchi ${r.items.length} tasi)` : ""} · narx — oxirgi savdo haftasidagi birja kotirovkasi`);
      setList({ kind: "items", items: r.items });
    } catch (e) {
      if (my === req.current) setList({ kind: "error", message: e.message });
    }
  }, [qRef, catRef]);

  return { q, setQ, cat, setCat, list, info, load, weeklyRef };
}

export function useLots() {
  const [q, setQ, qRef] = useLiveState("");
  const [region, setRegion, regionRef] = useLiveState("");
  const [sort, setSort, sortRef] = useLiveState("new");
  const [list, setList] = useState({ kind: "none" });
  const [info, setInfo] = useState(null);
  const startedRef = useRef(false);
  const req = useRef(0);

  const load = useCallback(async () => {
    startedRef.current = true;
    const q = qRef.current.trim();
    if (!q) {
      setInfo(null);
      setList({ kind: "hint" });
      return;
    }
    const my = ++req.current;
    setList({ kind: "loading" });
    try {
      const r = await api(`/api/lots?${new URLSearchParams({ q, region: regionRef.current, sort: sortRef.current })}`);
      if (my !== req.current) return;
      setInfo(r.total ? { q, query: r.query, total: r.total } : null);
      setList({ kind: "items", items: r.items });
    } catch (e) {
      if (my === req.current) setList({ kind: "error", message: e.message });
    }
  }, [qRef, regionRef, sortRef]);

  return { q, setQ, region, setRegion, sort, setSort, list, info, load, startedRef };
}
