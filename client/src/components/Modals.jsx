import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { cls, esc, pct, qty, som } from "../lib/format.js";
import { EmptyBox, Skeleton } from "./PricesView.jsx";

function ModalShell({ title, sub, onClose, children }) {
  return (
    <div className="modal" id="modal">
      <div className="modal-backdrop" onClick={onClose}></div>
      <div className="modal-body" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
        <div className="modal-head">
          <div><div className="modal-title" id="modalTitle">{title}</div><div className="hint" id="modalSub">{sub || ""}</div></div>
          <button className="icon-btn" onClick={onClose} aria-label="Yopish">✕</button>
        </div>
        <div id="modalContent">{children}</div>
      </div>
    </div>
  );
}

// ---------- narx grafigi ----------
function Chart({ pts, labels }) {
  const [tip, setTip] = useState(null);
  const W = 600, H = 200, P = 6;
  const min = Math.min(...pts), max = Math.max(...pts), span = max - min || 1;
  const x = (i) => P + (i / (pts.length - 1 || 1)) * (W - 2 * P);
  const y = (v) => P + (1 - (v - min) / span) * (H - 2 * P);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p).toFixed(1)}`).join("");
  const onMove = (ev) => {
    const r = ev.currentTarget.getBoundingClientRect();
    const rel = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
    const i = Math.round(rel * (pts.length - 1));
    setTip({ left: Math.min(r.width - 70, Math.max(70, rel * r.width)), text: `${som(pts[i])} · ${labels[i] || ""}` });
  };
  return (
    <div className="chart" id="pChart">
      <div className="chart-tip" hidden={!tip} style={tip ? { left: tip.left + "px" } : undefined}>{tip?.text}</div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" onPointerMove={onMove} onPointerLeave={() => setTip(null)}>
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#5b7bff" /><stop offset="1" stopColor="#f062b4" /></linearGradient>
          <linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7a6bff" stopOpacity=".25" /><stop offset="1" stopColor="#7a6bff" stopOpacity="0" /></linearGradient>
        </defs>
        <path d={`${line}L${x(pts.length - 1)},${H}L${x(0)},${H}Z`} fill="url(#f)" />
        <path d={line} fill="none" stroke="url(#g)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

export function PriceModal({ q, d, onClose, onDelegate, onFindLots }) {
  const word = q.name.split(/[\s(]/)[0];
  return (
    <ModalShell title={q.name} sub={`${q.category.icon} ${q.category.name}${q.week ? " · hafta " + q.week : ""}`} onClose={onClose}>
      <div className="big-price">{som(q.price)} <span className={`pill ${cls(q.changePct)}`} style={{ fontSize: 14 }}>{pct(q.changePct)}</span></div>
      <div className="hint">1 {q.unit} uchun birja kotirovkasi</div>
      {q.everyday ? <div className="everyday">Oddiy hisobda: <b>{q.everyday.label} ≈ {som(q.everyday.price)}</b></div> : null}
      {d ? (
        <>
          <Chart pts={d.points} labels={d.days.map((x) => `${x}-kun`)} />
          <div className="hint" style={{ textAlign: "center" }}>Oxirgi 10 savdo kuni: <b className={cls(d.changePct)}>{pct(d.changePct)}</b></div>
        </>
      ) : null}
      <div className="oc-actions">
        <button className="btn big" onClick={() => onDelegate(`${word} sotib olmoqchiman — eng ma'qul taklifni topib, buyurtmani tayyorla`)}>✦ Agentga topshirish</button>
        <button className="btn ghost" onClick={() => onFindLots(word)}>Sotuvdagi takliflar</button>
      </div>
    </ModalShell>
  );
}

const clampCount = (v) => Math.max(1, Math.min(1000, Math.floor(Number(v) || 1)));

export function LotModal({ id, onClose, onDelegate }) {
  const [state, setState] = useState({ lot: null, error: null });
  const [count, setCount] = useState("1");
  useEffect(() => {
    let alive = true;
    api(`/api/lots/${encodeURIComponent(id)}`)
      .then((l) => alive && setState({ lot: l, error: null }))
      .catch((e) => alive && setState({ lot: null, error: e.message }));
    return () => { alive = false; };
  }, [id]);

  const l = state.lot;
  if (!l) {
    return (
      <ModalShell title={`Lot №${id}`} sub="" onClose={onClose}>
        {state.error != null ? <EmptyBox>{state.error}</EmptyBox> : <Skeleton n={2} />}
      </ModalShell>
    );
  }
  const n = clampCount(count);
  const total = l.total * n;
  const step = (k) => setCount(String(Math.max(1, Math.min(1000, (Number(count) || 1) + k))));
  return (
    <ModalShell title={l.product} sub={l.seller ? `Sotuvchi: ${l.seller} · lot №${l.id}` : `Lot №${l.id}`} onClose={onClose}>
      <div className="big-price">{som(l.total)}</div>
      <div className="hint">1 lot ({qty(l.qty)} {l.unit}) uchun bazis narx · {l.perTonne != null ? som(l.perTonne) + " / tonna" : som(l.perUnit) + " / " + l.unit}</div>
      {l.everyday ? <div className="everyday">Oddiy hisobda: <b>{l.everyday.label} ≈ {som(l.everyday.price)}</b></div> : null}
      <dl className="kv">
        <dt>Depozit</dt><dd>{l.depositPct != null ? `${l.depositPct}% — ${som(l.depositSum)} (kafolat puli)` : "—"}</dd>
        <dt>Yetkazish</dt><dd>{l.pickupYourself ? "EXW — ombordan o'zingiz olib ketasiz" : l.deliveryBasis || "—"}</dd>
        <dt>Ombor</dt><dd>📍 {l.location || "—"}</dd>
        <dt>To'lov</dt><dd>{l.paymentForm || "—"}</dd>
        <dt>UZEX</dt><dd><a href={l.url} target="_blank" rel="noopener">Saytda ko'rish ↗</a></dd>
      </dl>
      {l.specialTerms && l.specialTerms !== "-" ? <div className="special">{l.specialTerms}</div> : null}
      <div className="calc"><b>Necha lot kerak?</b>
        <div className="stepper">
          <button onClick={() => step(-1)} aria-label="Kamaytirish">−</button>
          <input id="lCount" type="number" min="1" max="1000" value={count} onChange={(e) => setCount(e.target.value)} inputMode="numeric" aria-label="Lotlar soni" />
          <button onClick={() => step(1)} aria-label="Ko'paytirish">+</button>
          <span className="hint" id="lQty">= {qty(l.qty * n)} {l.unit}</span>
        </div>
        <div className="hint" id="lCalc">Jami (bazis narx): <b style={{ color: "var(--text)" }}>{som(total)}</b> · depozit: {l.depositPct != null ? som((total * l.depositPct) / 100) : "—"}</div>
        <div className="oc-actions">
          <button className="btn big" id="lDelegate" onClick={() => {
            const k = Math.max(1, Math.floor(Number(count) || 1));
            onDelegate(`Lot №${l.id} (${l.product}${l.seller ? ", " + l.seller : ""}) dan ${k} lot buyurtma qilib ber.`);
          }}>✦ Agent buyurtma qilsin</button>
        </div>
      </div>
    </ModalShell>
  );
}

export function ApplicationModal({ text, onClose, toast }) {
  const copy = () => navigator.clipboard?.writeText(text).then(() => toast("Nusxa olindi"), () => toast("Nusxa olib bo'lmadi"));
  const print = () => {
    const w = window.open("", "_blank");
    if (!w) return toast("Chop etish oynasi bloklandi");
    w.document.write(`<pre style="font:14px/1.6 monospace;white-space:pre-wrap">${esc(text)}</pre>`);
    w.document.close();
    w.print();
  };
  return (
    <ModalShell title="Xarid arizasi" sub="Agent avtomatik to'ldirdi" onClose={onClose}>
      <pre className="app" id="appText">{text}</pre>
      <div className="oc-actions"><button className="btn" onClick={copy}>Nusxa olish</button><button className="btn ghost" onClick={print}>Chop etish</button></div>
    </ModalShell>
  );
}
