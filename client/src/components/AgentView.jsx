import { memo } from "react";
import { som } from "../lib/format.js";
import FormCard from "./FormCard.jsx";
import OrderCard from "./OrderCard.jsx";

const Run = memo(function Run({ run, order, lang, ctx }) {
  return (
    <div className="run">
      <div className={"steps" + (run.collapsed ? " collapsed" : "")} hidden={run.stepsHidden}>
        <div className="steps-head" onClick={() => ctx.toggleSteps(run.id)}>
          <span><b className="st-title">{run.title}</b> <span className="st-count">{run.count}</span></span><span>▾</span>
        </div>
        {run.steps.map((s) => (
          <div className={`step ${s.status}`} key={s.id}>
            <span className="ic">{s.status === "running" ? "" : s.status === "done" ? "✓" : "!"}</span>
            <div><div className="lb">{s.label}</div><div className="dt">{s.detail}</div></div>
          </div>
        ))}
      </div>
      <div className="lots-peek" hidden={!run.lots}>
        {(run.lots || []).map((l, i) => (
          <button className="peek" key={`${l.lot_id}_${i}`} onClick={() => ctx.openLot(l.lot_id)}>
            <div className="t">{l.product}</div>
            <div className="s">{l.seller || ""} · {(l.region || "").slice(0, 40)}</div>
            <div className="p">{l.pricePerTonne != null ? som(l.pricePerTonne, { short: true }) + " / t" : som(l.pricePerUnit, { short: true }) + " / " + l.unit}</div>
          </button>
        ))}
      </div>
      {run.forms.map((f, i) => (
        <FormCard key={`${f.id}_${i}`} form={f} isBusy={ctx.isBusy} toast={ctx.toast} onProfileSaved={ctx.onProfileSaved} sendTask={ctx.sendTask} />
      ))}
      <div className="order-slot">{order && <OrderCard order={order} lang={lang} onAction={ctx.orderAction} />}</div>
      {/* Matn oldin escape qilinadi (mdLite) — xavfsiz */}
      <div className="reply" dangerouslySetInnerHTML={{ __html: run.replyHtml }} />
    </div>
  );
});

export default function AgentView({ active, started, ready, aiEnabled, t, feed, ordersById, lang, stageSlotRef, ctx }) {
  return (
    <section className={"view agent-view" + (active ? " active" : "") + (started ? " started" : "")} data-view="agent">
      <div className="stage" id="stage">
        <div className="stage-slot" id="stageSlot" ref={stageSlotRef} aria-hidden="true"></div>
        <div className="intro" id="intro">
          <p className="intro-text" id="introText">
            {ready ? (aiEnabled ? t.intro : "AI agent o'chiq: serverda GEMINI_API_KEY sozlanmagan. Narxlar va takliflar bo'limlari ishlaydi.") : ""}
          </p>
          <div className="examples" id="examples">
            {ready && t.examples.map((e) => <button className="chip" key={e} onClick={() => ctx.sendTask(e)}>{e}</button>)}
          </div>
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
