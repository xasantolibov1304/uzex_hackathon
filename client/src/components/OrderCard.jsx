import { useState } from "react";
import { tr } from "../lib/i18n.js";
import { dateUz, qty, som } from "../lib/format.js";

// Buyurtma kartasi (agent ekranida ham, "Buyurtmalar" sahifasida ham)
export default function OrderCard({ order: o, lang, onAction }) {
  const [pending, setPending] = useState(null);
  const t = tr(lang);
  const st = { awaiting_confirmation: t.awaiting, submitted: t.submitted, cancelled: t.cancelled }[o.status];

  async function act(a) {
    if (a === "app") return onAction(o.id, a);
    setPending(a);
    try { await onAction(o.id, a); } finally { setPending(null); }
  }

  return (
    <div className="order-card" data-order={o.id}>
      <div className="oc-top">
        <div>
          <div className="oc-label">{t.order} · lot №{o.lotId}</div>
          <div className="oc-title">{o.productUz || o.product}</div>
          {o.productUz && o.productUz !== o.product ? <div className="hint oc-orig">{o.product}</div> : null}
          <div className="hint">{o.sellerUz || o.seller || ""}</div>
        </div>
        <div>
          <div className="oc-total">{som(o.total)}</div>
          <div style={{ textAlign: "right", marginTop: 4 }}><span className={`status ${o.status}`}>{st}</span></div>
          {o.viaBroker ? <div style={{ textAlign: "right", marginTop: 4 }}><span className="status broker">{t.viaBroker}</span></div> : null}
        </div>
      </div>
      <dl className="kv">
        <dt>Miqdor</dt><dd>{o.contracts} lot × {qty(o.qtyPerContract)} {o.unit} = <b>{qty(o.quantity)} {o.unit}</b></dd>
        <dt>Depozit</dt><dd>{o.depositPct ?? "—"}% — {som(o.depositSum)}</dd>
        <dt>Savdo kuni</dt><dd>{dateUz(o.tradingDate)}{o.exchangeRef ? ` · ${o.exchangeRef}` : ""}</dd>
        <dt>Ombor</dt><dd>{o.locationUz || o.location || "—"}</dd>
        <dt>Xaridor</dt><dd>{o.buyer?.fullName || "—"} · {o.buyer?.phone || ""}</dd>
      </dl>
      {o.reason ? <div className="oc-reason">{o.reason}</div> : null}
      <div className="oc-actions">
        {o.status === "awaiting_confirmation" && (
          <>
            <button className="btn big" disabled={pending === "confirm"} onClick={() => act("confirm")}>{t.confirm}</button>
            <button className="btn ghost" disabled={pending === "cancel"} onClick={() => act("cancel")}>{t.cancel}</button>
          </>
        )}
        <button className="btn ghost" onClick={() => act("app")}>{t.app}</button>
        <a className="btn ghost" href={o.url} target="_blank" rel="noopener">UZEX ↗</a>
      </div>
      {o.timeline?.length > 1 ? <ul className="timeline">{o.timeline.map((x, i) => <li key={i}>{x.text}</li>)}</ul> : null}
    </div>
  );
}
