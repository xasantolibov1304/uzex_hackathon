export async function api(path, opts) {
  const init = opts ? { method: opts.method || "POST", headers: { "content-type": "application/json" }, body: opts.body ? JSON.stringify(opts.body) : undefined } : {};
  const res = await fetch(path, init);
  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("json") ? await res.json().catch(() => ({})) : await res.text();
  if (!res.ok) throw new Error(data?.error || "Xato yuz berdi");
  return data;
}

/** Agent vazifasini SSE oqimi orqali bajaradi; har bir hodisa onEvent ga uzatiladi. */
export async function streamAgent(body, onEvent) {
  const res = await fetch("/api/agent/stream", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error || "Agent bilan aloqa yo'q");
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const line = chunk.split("\n").find((l) => l.startsWith("data: "));
      if (line) onEvent(JSON.parse(line.slice(6)));
    }
  }
}

export function sessionId() {
  let id = null;
  try { id = sessionStorage.getItem("osonAgentSession"); } catch { /* */ }
  if (!id) {
    id = crypto.randomUUID?.() || String(Math.random()).slice(2) + Date.now();
    try { sessionStorage.setItem("osonAgentSession", id); } catch { /* */ }
  }
  return id;
}
