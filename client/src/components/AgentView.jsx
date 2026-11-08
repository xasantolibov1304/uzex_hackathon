import { memo } from "react";
import { som } from "../lib/format.js";
import { tr } from "../lib/i18n.js";
import ComparisonCard from "./ComparisonCard.jsx";
import FormCard from "./FormCard.jsx";
import OrderCard from "./OrderCard.jsx";
import PriceCards from "./PriceCards.jsx";
import { AlertFeedCard, AlertOfferCard } from "./AlertsView.jsx";

// Qadam ikonkasi: bajarilayotganda — aylanuvchi halqa, tugaganda — turiga qarab belgi
function StepIcon({ s }) {
  if (s.status === "running") return <span className="st-spin" />;
  if (s.status === "error") return <b>!</b>;
  if (s.kind === "think") {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" fill="currentColor" />
        <path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" fill="currentColor" opacity=".7" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const secs = (s) => (s.t1 && s.t0 ? `${((s.t1 - s.t0) / 1000).toFixed(1)}s` : "");

// Qadamlar to'plami: eng yangi qadam tepada, eskilari orqaga suriladi (bildirishnomalar to'plami kabi).
// Sarlavha bosilsa — barcha qadamlar ro'yxat bo'lib ochiladi.
const STACK_DEPTH = 3; // orqada ko'rinadigan kartalar soni (+1 — chiqib ketayotgani uchun)
function StepStack({ run, ctx }) {
  const all = [...run.steps].reverse();
  const shown = run.expanded ? all : all.slice(0, STACK_DEPTH + 1);
  return (
    <div className={"steps" + (run.expanded ? " expanded" : "")} hidden={run.stepsHidden}>
      <button type="button" className="steps-head" onClick={() => ctx.toggleSteps(run.id)} aria-expanded={!!run.expanded}>
        <span><b className="st-title">{run.title}</b> <span className="st-count">{run.count}</span></span>
        <span className="st-caret" aria-hidden="true">▾</span>
      </button>
      <div className="st-stack" style={{ "--n": Math.min(all.length, STACK_DEPTH) }}>
        {shown.map((s, d) => (
          <div
            className={`st-card ${s.kind || "tool"} ${s.status}`}
            key={s.id}
            data-d={d === 0 ? "top" : d >= STACK_DEPTH ? "gone" : "back"}
            style={{ "--d": d, zIndex: shown.length - d }}
            aria-hidden={!run.expanded && d > 0 ? true : undefined}
            onClick={!run.expanded && d > 0 ? () => ctx.toggleSteps(run.id) : undefined}
          >
            <div className="st-in">
              <span className="st-ic"><StepIcon s={s} /></span>
              <div className="st-body">
                <div className="st-lb">{s.label}{s.status === "running" && <span className="dots" aria-hidden="true"><i /><i /><i /></span>}</div>
                {s.detail && <div className="st-dt">{s.detail}</div>}
              </div>
              <span className="st-time">{secs(s)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const Run = memo(function Run({ run, order, lang, ctx }) {
  return (
    <div className="run">
      <StepStack run={run} ctx={ctx} />
      <div className="lots-head" hidden={!run.lots?.length}>
        <span className="lots-title">{tr(lang).lotsTitle}</span>
        <span className="lots-n" key={run.lots?.length}>{run.lots?.length || 0}</span>
      </div>
      <div className="lots-peek" hidden={!run.lots}>
        {(run.lots || []).map((l, i) => (
          <button className="peek" key={`${l.lot_id}_${i}`} style={{ "--i": Math.min(i, 6) }} onClick={() => ctx.openLot(l.lot_id)}>
            <div className="t" title={l.product}>{l.productUz || l.product}</div>
            <div className="s">{l.sellerUz || l.seller || ""} · {(l.regionUz || l.region || "").slice(0, 40)}</div>
            <div className="p">{l.pricePerTonne != null ? som(l.pricePerTonne, { short: true }) + " / t" : som(l.pricePerUnit, { short: true }) + " / " + l.unit}</div>
          </button>
        ))}
      </div>
      {(run.charts || []).map((c) => (
        <ComparisonCard key={c.id} chart={c} lang={lang} onOpenLot={ctx.openLot} />
      ))}
      {run.forms.map((f, i) => (
        <FormCard key={`${f.id}_${i}`} form={f} isBusy={ctx.isBusy} toast={ctx.toast} onProfileSaved={ctx.onProfileSaved} sendTask={ctx.sendTask} />
      ))}
      {(run.alertOffers || []).map((o) => (
        <AlertOfferCard key={o.id} offer={o} toast={ctx.toast} onOpenAlerts={ctx.openAlerts} />
      ))}
      {(run.alerts || []).map((a, i) => (
        <AlertFeedCard key={`${a.alert.id}_${i}`} data={a} toast={ctx.toast} onOpenAlerts={ctx.openAlerts} />
      ))}
      <div className="order-slot">{order && <OrderCard order={order} lang={lang} onAction={ctx.orderAction} />}</div>
      {/* Matn oldin escape qilinadi (mdLite) — xavfsiz */}
      <div className="reply" dangerouslySetInnerHTML={{ __html: run.replyHtml }} />
    </div>
  );
});

export default function AgentView({ active, started, ready, aiEnabled, t, feed, ordersById, lang, stageSlotRef, quotes, trading, usd, ctx }) {
  return (
    <section className={"view agent-view" + (active ? " active" : "") + (started ? " started" : "")} data-view="agent">
      <div className="stage" id="stage">
        <div className="stage-slot" id="stageSlot" ref={stageSlotRef} aria-hidden="true"></div>
        <div className="intro" id="intro">
          {ready && aiEnabled && <h1 className="hello">{t.dash.hello}</h1>}
          <p className="intro-text" id="introText">
            {ready ? (aiEnabled ? t.intro : "AI agent o'chiq: serverda GEMINI_API_KEY sozlanmagan. Narxlar va takliflar bo'limlari ishlaydi.") : ""}
          </p>
          {ready && <PriceCards quotes={quotes} trading={trading} usd={usd} lang={lang} t={t} onPick={ctx.sendTask} />}
        </div>
      </div>
      <div className="feed" id="feed" aria-live="polite">
        {feed.map((it) =>
          it.kind === "user"
            ? <div className="msg-user" key={it.id}>{it.text}</div>
            : <Run key={it.id} run={it} order={it.orderId ? ordersById[it.orderId] : null} lang={lang} ctx={ctx} />,
        )}
      </div>
    </section>
  );
}
