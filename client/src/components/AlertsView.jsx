// Narx kuzatuvi: benzin narxi kutilgan darajaga tushganda brauzerga push-xabar.
import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { som, qty } from "../lib/format.js";
import { deviceId, enablePush, pushState } from "../lib/push.js";
import { EmptyBox } from "./PricesView.jsx";
import { ModalShell } from "./Modals.jsx";

const GRADES = [["ai92", "AI-92"], ["ai95", "AI-95"], ["ai80", "AI-80"], ["any", "Har qanday"]];
const LITRES_PER_TONNE = 1350; // benzin: 1 tonna ≈ 1350 litr
const grp = (n) => (n ? Math.round(n).toLocaleString("en-US").replace(/,/g, " ") : "");
const perLitre = (t) => (t ? `≈ ${grp(t / LITRES_PER_TONNE)} so'm/litr` : "");
const time = (iso) => (iso ? new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : "—");

/** Bildirishnoma holati va yoqish tugmasi (Kuzatuv sahifasida ham, agent kartochkasida ham). */
export function PushToggle({ compact = false, toast, onChange }) {
  const [state, setState] = useState("loading");
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(() => pushState().then(setState).catch(() => setState("off")), []);
  useEffect(() => { refresh(); }, [refresh]);

  async function enable() {
    setBusy(true);
    try { await enablePush(); toast?.("Bildirishnoma yoqildi"); onChange?.(); } catch (e) { toast?.(e.message); }
    setBusy(false);
    refresh();
  }
  async function test() {
    setBusy(true);
    try { await api("/api/push/test", { body: { deviceId: deviceId() } }); toast?.("Sinov xabari yuborildi"); } catch (e) { toast?.(e.message); }
    setBusy(false);
  }

  if (state === "loading") return null;
  if (state === "on") {
    return (
      <div className={"push-row on" + (compact ? " compact" : "")}>
        <span className="push-dot" aria-hidden="true" />
        <span>Bildirishnoma yoqilgan</span>
        {!compact && <button type="button" className="btn ghost sm" disabled={busy} onClick={test}>Sinov xabari</button>}
      </div>
    );
  }
  const note = state === "unsupported"
    ? "Bu brauzer push-xabarni qo'llab-quvvatlamaydi. iPhone'da saytni “Bosh ekranga qo'shish” kerak; kompyuterda Chrome, Edge yoki Firefox."
    : state === "denied"
      ? "Bildirishnoma brauzerda bloklangan. Manzil satridagi 🔒 belgisini bosib, ruxsat bering."
      : "Narx tushganda xabar kelishi uchun bildirishnomani yoqing. Sayt yopiq bo'lsa ham keladi (brauzer ochiq bo'lsa).";
  return (
    <div className={"push-row" + (compact ? " compact" : "")}>
      <span className="push-note">{note}</span>
      {state === "off" && <button type="button" className="btn sm" disabled={busy} onClick={enable}>🔔 Bildirishnomani yoqish</button>}
    </div>
  );
}

/** Agent lentasidagi kartochka: agent yaratgan obuna. */
export function AlertFeedCard({ data, toast, onOpenAlerts }) {
  const a = data.alert;
  return (
    <div className="alert-card feed">
      <div className="ac-head">
        <span className="ac-ico">⛽</span>
        <div className="ac-main">
          <div className="ac-title">{a.gradeLabel} · {som(a.maxPrice, { short: true })} / tonna yoki arzon</div>
          <div className="ac-sub">{a.region || "Barcha hududlar"} · {perLitre(a.maxPrice)}{a.market ? ` · bozor: ${som(a.market.pricePerTonne, { short: true })}` : ""}</div>
        </div>
      </div>
      {data.belowNow?.count > 0 && <div className="ac-status">Hozir ro'yxatda {data.belowNow.count} ta lot shu narxda yoki arzon (eski bo'lishi mumkin).</div>}
      <PushToggle compact toast={toast} />
      <button type="button" className="link-btn" onClick={onOpenAlerts}>Kuzatuv sahifasini ochish →</button>
    </div>
  );
}

/** Agent taklifi: so'ralgan narxda lot yo'q → "Narx tushsa xabar beraymi?" (bir bosishda obuna). */
export function AlertOfferCard({ offer, toast, onOpenAlerts }) {
  const [phase, setPhase] = useState("ask"); // ask | saving | done | no
  async function accept() {
    setPhase("saving");
    try {
      await api("/api/alerts", { body: { deviceId: deviceId(), grade: offer.grade, region: offer.region, maxPrice: offer.maxPrice } });
      setPhase("done");
    } catch (e) {
      toast?.(e.message);
      setPhase("ask");
    }
  }
  const m = offer.market?.pricePerTonne;
  return (
    <div className="alert-card feed offer">
      <div className="ac-head">
        <span className="ac-ico">🔔</span>
        <div className="ac-main">
          <div className="ac-title">{phase === "done" ? "Narx kuzatilmoqda" : "Bu narxda lot yo'q. Narx tushsa xabar beraymi?"}</div>
          <div className="ac-sub">
            {offer.gradeLabel} · {som(offer.maxPrice, { short: true })} / tonna yoki arzon ({perLitre(offer.maxPrice)}) · {offer.region || "Barcha hududlar"}
          </div>
          {(m || offer.cheapestNow) && (
            <div className="ac-sub">
              {m ? <>Bozor narxi: {som(m, { short: true })} / t ({perLitre(m)})</> : null}
              {m && offer.cheapestNow ? " · " : ""}
              {offer.cheapestNow ? <>hozir eng arzoni: {som(offer.cheapestNow, { short: true })} / t</> : null}
            </div>
          )}
        </div>
      </div>
      {phase === "ask" || phase === "saving" ? (
        <div className="offer-actions">
          <button type="button" className="btn sm" disabled={phase === "saving"} onClick={accept}>🔔 Ha, kuzat</button>
          <button type="button" className="btn ghost sm" disabled={phase === "saving"} onClick={() => setPhase("no")}>Yo'q, kerak emas</button>
        </div>
      ) : phase === "no" ? (
        <div className="ac-status">Kuzatuv sozlanmadi. Keyinroq “Kuzatuv” bo'limidan qo'shishingiz mumkin.</div>
      ) : (
        <>
          <div className="ac-status">✓ Shu narxda yoki arzonroq yangi lot chiqishi bilan xabar beramiz.</div>
          <PushToggle compact toast={toast} />
          <button type="button" className="link-btn" onClick={onOpenAlerts}>Kuzatuv sahifasini ochish →</button>
        </>
      )}
    </div>
  );
}

export default function AlertsView({ active, regions, toast, onOpenLot }) {
  const [data, setData] = useState(null);
  const [grade, setGrade] = useState("ai92");
  const [region, setRegion] = useState("");
  const [price, setPrice] = useState("");
  const [market, setMarket] = useState({});
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null);
  const [open, setOpen] = useState(false); // "Yangi obuna" popup

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const load = useCallback(async () => {
    try { setData(await api(`/api/alerts?deviceId=${encodeURIComponent(deviceId())}`)); } catch (e) { toast(e.message); }
  }, [toast]);
  useEffect(() => { if (active) load(); }, [active, load]);
  useEffect(() => {
    if (!active || market[grade] !== undefined) return;
    api(`/api/alerts/market?grade=${grade}`)
      .then((r) => setMarket((m) => ({ ...m, [grade]: r.market })))
      .catch(() => setMarket((m) => ({ ...m, [grade]: null })));
  }, [active, grade, market]);

  const ref = market[grade];
  const num = Number(price.replace(/\D/g, "")) || 0;

  async function submit(e) {
    e.preventDefault();
    if (!num) return toast("Narxni kiriting (1 tonna uchun, so'mda)");
    setBusy(true);
    try {
      const r = await api("/api/alerts", { body: { deviceId: deviceId(), grade, region, maxPrice: num } });
      setCreated(r);
      setOpen(false);
      setPrice("");
      toast("Obuna saqlandi");
      load();
    } catch (err) { toast(err.message); }
    setBusy(false);
  }
  async function remove(id) {
    try { await api(`/api/alerts/${id}`, { method: "DELETE", body: { deviceId: deviceId() } }); load(); } catch (e) { toast(e.message); }
  }
  async function checkNow() {
    setBusy(true);
    try {
      const r = await api("/api/alerts/check", { body: { deviceId: deviceId() } });
      setData(r);
      toast(r.found ? `${r.found} ta yangi mos lot topildi` : "Hozircha yangi mos lot yo'q");
    } catch (e) { toast(e.message); }
    setBusy(false);
  }

  return (
    <section className={"view page" + (active ? " active" : "")} data-view="alerts">
      <h1 className="page-title">Narx kuzatuvi <span>benzin narxi siz kutgan darajaga tushsa, xabar beramiz</span></h1>

      <div className="profile-card">
        <PushToggle toast={toast} onChange={load} />
      </div>

      {created && (
        <div className="af-done">
          ✓ {created.alert.gradeLabel} kuzatilmoqda: {som(created.alert.maxPrice, { short: true })} / tonna yoki arzon.
          {created.belowNow.count > 0
            ? <> Hozir ro'yxatda <b>{created.belowNow.count} ta</b> lot shu narxda yoki arzon — ular eski bo'lishi mumkin, xabar faqat <b>yangi</b> lotlar uchun keladi.</>
            : <> Hozircha bunday lot yo'q — yangisi chiqishi bilan xabar beramiz.</>}
          {!created.subscribed && <> <b>Bildirishnomani yoqishni unutmang.</b></>}
        </div>
      )}

      {open && (
        <ModalShell title="Yangi obuna" sub="Yangi benzin loti siz yozgan narxda yoki arzonroq chiqsa — xabar keladi" onClose={() => setOpen(false)}>
      <form className="alert-form" onSubmit={submit}>
        <div className="af-grid">
          <div className="field">
            <label>Benzin turi</label>
            <div className="af-chips">
              {GRADES.map(([id, label]) => (
                <button type="button" key={id} className={"chip" + (grade === id ? " active" : "")} aria-pressed={grade === id} onClick={() => setGrade(id)}>{label}</button>
              ))}
            </div>
          </div>
          <div className="field">
            <label htmlFor="afRegion">Ombor hududi</label>
            <select id="afRegion" value={region} onChange={(e) => setRegion(e.target.value)}>
              <option value="">Barcha hududlar</option>
              {regions.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="afPrice">Narx, 1 tonna uchun (so'm)</label>
            <input id="afPrice" inputMode="numeric" autoComplete="off" placeholder="masalan, 12 500 000" value={grp(num)} onChange={(e) => setPrice(e.target.value)} />
          </div>
        </div>
        <div className="af-ref">
          {ref === undefined && <span className="hint">Bozor narxi yuklanmoqda…</span>}
          {ref === null && <span className="hint">Bu tur uchun bozor kotirovkasi topilmadi.</span>}
          {ref && (
            <>
              <span>Bozor narxi: <b>{som(ref.pricePerTonne, { short: true })}</b> / tonna <span className="hint">({perLitre(ref.pricePerTonne)} · {ref.source}{ref.period ? `, ${ref.period}` : ""})</span></span>
              <span className="af-quick">
                {[5, 10, 15].map((p) => (
                  <button type="button" key={p} className="chip" onClick={() => setPrice(String(Math.round((ref.pricePerTonne * (1 - p / 100)) / 10000) * 10000))}>−{p}%</button>
                ))}
              </span>
            </>
          )}
        </div>
        <div className="af-submit">
          <button className="btn" type="submit" disabled={busy}>{busy ? "Saqlanmoqda…" : "🔔 Obuna bo'lish"}</button>
          <button className="btn ghost" type="button" onClick={() => setOpen(false)}>Bekor qilish</button>
          {num > 0 && <span className="hint">{som(num, { short: true })} / tonna · {perLitre(num)}</span>}
        </div>
      </form>
        </ModalShell>
      )}

      <div className="alerts-head">
        <h3>Obunalarim {data?.alerts?.length ? <span className="hint">· har {data.pollMinutes} daqiqada tekshiriladi</span> : null}</h3>
        <div className="alerts-actions">
          {data?.alerts?.length > 0 && <button type="button" className="btn ghost sm" disabled={busy} onClick={checkNow}>Hozir tekshirish</button>}
          <button type="button" className="btn sm" onClick={() => { setCreated(null); setOpen(true); }}>＋ Yangi obuna</button>
        </div>
      </div>
      <div className="alerts-list">
        {data && !data.alerts.length && <EmptyBox>Hali obuna yo'q. “＋ Yangi obuna” tugmasini bosing yoki agentga ayting: “AI-92 tonnasi 12 mln dan tushsa xabar ber”.</EmptyBox>}
        {data?.alerts.map((a) => (
          <div className="alert-card" key={a.id}>
            <div className="ac-head">
              <span className="ac-ico">⛽</span>
              <div className="ac-main">
                <div className="ac-title">{a.gradeLabel} · ≤ {som(a.maxPrice, { short: true })} / tonna</div>
                <div className="ac-sub">
                  {a.region || "Barcha hududlar"} · {perLitre(a.maxPrice)}
                  {a.market ? <> · bozor: {som(a.market.pricePerTonne, { short: true })}{a.maxPrice < a.market.pricePerTonne ? ` (${Math.round((1 - a.maxPrice / a.market.pricePerTonne) * 100)}% arzonroq kutyapsiz)` : ""}</> : null}
                </div>
              </div>
              <button type="button" className="icon-x" aria-label="Obunani o'chirish" title="O'chirish" onClick={() => remove(a.id)}>✕</button>
            </div>
            <div className="ac-status">
              {a.lastError ? <span className="err-t">{a.lastError}</span> : <>Oxirgi tekshiruv: {time(a.lastCheckedAt)}{a.lastNewCount != null ? ` · yangi lot: ${a.lastNewCount}` : ""}</>}
              {a.notifiedCount > 0 && <> · xabar yuborildi: {a.notifiedCount}</>}
              {a.pushError && <span className="err-t"> · xabar yetmadi (bildirishnoma o'chiq)</span>}
            </div>
            {a.hits.length > 0 && (
              <div className="ac-hits">
                {a.hits.map((h, i) => (
                  <button type="button" className="peek" key={`${h.lotId}_${i}`} onClick={() => onOpenLot(h.lotId)}>
                    <div className="t">{som(h.perTonne, { short: true })} / t{h.perLitre ? <span className="hint"> · {grp(h.perLitre)} so'm/l</span> : null}</div>
                    <div className="s">{String(h.region || "").slice(0, 48)}</div>
                    <div className="s">1 lot = {qty(h.qty)} {h.unit} · {time(h.at)}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
