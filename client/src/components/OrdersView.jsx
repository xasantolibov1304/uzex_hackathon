import { useEffect, useState } from "react";
import OrderCard from "./OrderCard.jsx";
import { EmptyBox } from "./PricesView.jsx";
import { ModalShell } from "./Modals.jsx";
import { tr } from "../lib/i18n.js";
import { dateUz, qty, som, store } from "../lib/format.js";

/** Ro'yxat ko'rinishidagi bitta buyurtma: qisqa qator, bosilganda to'liq tafsilotlar ochiladi. */
function OrderRow({ order: o, lang, onAction, open, onToggle }) {
  const t = tr(lang);
  const st = { awaiting_confirmation: t.awaiting, submitted: t.submitted, cancelled: t.cancelled }[o.status];
  const bodyId = `orow_${o.id}`;
  return (
    <div className={"order-row" + (open ? " open" : "") + (o.status === "cancelled" ? " muted" : "")}>
      <button type="button" className="or-head" aria-expanded={open} aria-controls={bodyId} onClick={onToggle}>
        <span className={`status ${o.status}`}>{st}</span>
        <span className="or-main">
          <span className="or-title">{o.productUz || o.product}</span>
          <span className="or-sub">lot №{o.lotId} · {o.sellerUz || o.seller || ""}</span>
        </span>
        <span className="or-col or-qty">{qty(o.quantity)} {o.unit}<small>{o.contracts} lot</small></span>
        <span className="or-col or-date">{dateUz(o.tradingDate)}<small>savdo kuni</small></span>
        <span className="or-col or-total">{som(o.total)}<small>depozit {som(o.depositSum, { short: true })}</small></span>
        <span className="or-chev" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="or-body" id={bodyId}>
          <OrderCard order={o} lang={lang} onAction={onAction} embedded />
        </div>
      )}
    </div>
  );
}

const VIEW_KEY = "osonOrdersView";

const ENTITY = [["jismoniy", "Jismoniy shaxs"], ["yatt", "YaTT"], ["yuridik", "Yuridik shaxs"]];

function ProfileForm({ profile: p, onSave, onCancel }) {
  const [busy, setBusy] = useState(false);
  const f = (k, label, type = "text", ph = "") => (
    <div className="field"><label htmlFor={`pf_${k}`}>{label}</label><input id={`pf_${k}`} name={k} type={type} defaultValue={p[k] || ""} placeholder={ph} /></div>
  );
  async function onSubmit(e) {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.currentTarget).entries());
    Object.keys(body).forEach((k) => !body[k] && delete body[k]);
    setBusy(true);
    await onSave(body);
    setBusy(false);
  }
  return (
    <form className="fields profile-form" id="profileForm" onSubmit={onSubmit}>
      {f("fullName", "F.I.Sh yoki korxona nomi", "text", "Ali Valiyev")}
      <div className="field">
        <label htmlFor="pf_entityType">Maqomi</label>
        <select id="pf_entityType" name="entityType" defaultValue={ENTITY.some(([v]) => v === p.entityType) ? p.entityType : ""}>
          <option value="">—</option>
          {ENTITY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      {f("tin", "STIR (YaTT/yuridik)", "text", "9 ta raqam")}
      {f("phone", "Telefon", "tel", "+998 90 123 45 67")}
      {f("region", "Hudud", "text", "Toshkent")}
      <div className="profile-actions">
        <button className="btn" type="submit" disabled={busy}>{busy ? "Saqlanmoqda…" : "Saqlash"}</button>
        <button className="btn ghost" type="button" onClick={onCancel}>Bekor qilish</button>
      </div>
    </form>
  );
}

/** Profil holati — tugma ichida qisqa ko'rinadi: kim nomidan va to'liqmi. */
function profileSummary(p) {
  if (!p) return { text: "Yuklanmoqda…", ok: null };
  if (p.complete) return { text: [p.fullName, p.entityTypeLabel].filter(Boolean).join(" · "), ok: true };
  if (!p.fullName && !p.phone) return { text: "Hali kiritilmagan", ok: false };
  return { text: `${p.fullName || "Ism yo'q"} · ${p.missing?.length || 0} ta maydon yetishmayapti`, ok: false };
}

export default function OrdersView({ active, orders, profile, profileVer, lang, onSaveProfile, orderAction }) {
  const [open, setOpen] = useState(false);
  const [view, setViewState] = useState(() => (store.get(VIEW_KEY) === "list" ? "list" : "grid"));
  const [expanded, setExpanded] = useState(() => new Set());
  const setView = (v) => { setViewState(v); store.set(VIEW_KEY, v); };
  const toggle = (id) => setExpanded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allOpen = orders.length > 0 && orders.every((o) => expanded.has(o.id));
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const sum = profileSummary(profile);
  async function save(body) {
    if (await onSaveProfile(body)) setOpen(false);
  }

  return (
    <section className={"view page" + (active ? " active" : "")} data-view="orders">
      <div className="page-head">
        <h1 className="page-title">Buyurtmalarim <span>agent tayyorlagan xaridlar</span></h1>
        <button type="button" className="profile-btn" id="profileBtn" onClick={() => setOpen(true)} disabled={!profile}>
          <span className="pb-ico" aria-hidden="true">👤</span>
          <span className="pb-text">
            <b>Xaridor ma'lumotlari</b>
            <span className={"pb-sub" + (sum.ok === false ? " warn" : "")}>{sum.ok === true ? "✓ " : sum.ok === false ? "! " : ""}{sum.text}</span>
          </span>
        </button>
      </div>

      {open && profile && (
        <ModalShell title="Xaridor ma'lumotlari" sub="Agent arizani shu ma'lumotlar bilan to'ldiradi. Bo'sh bo'lsa, agentning o'zi so'raydi." onClose={() => setOpen(false)}>
          <ProfileForm key={profileVer} profile={profile} onSave={save} onCancel={() => setOpen(false)} />
        </ModalShell>
      )}

      {orders.length > 0 && (
        <div className="orders-bar">
          <span className="hint">{orders.length} ta buyurtma</span>
          <div className="orders-bar-r">
            {view === "list" && (
              <button type="button" className="link-btn" onClick={() => setExpanded(allOpen ? new Set() : new Set(orders.map((o) => o.id)))}>
                {allOpen ? "Hammasini yopish" : "Hammasini ochish"}
              </button>
            )}
            <div className="view-toggle" role="group" aria-label="Ko'rinish">
              <button type="button" aria-pressed={view === "grid"} title="Kartalar" aria-label="Kartalar ko'rinishi" onClick={() => setView("grid")}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></svg>
              </button>
              <button type="button" aria-pressed={view === "list"} title="Ro'yxat" aria-label="Ro'yxat ko'rinishi" onClick={() => setView("list")}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="3" rx="1.5" /><rect x="4" y="10.5" width="16" height="3" rx="1.5" /><rect x="4" y="16" width="16" height="3" rx="1.5" /></svg>
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={view === "list" && orders.length ? "orders-list" : "orders"} id="orderList">
        {orders.length
          ? orders.map((o) => (view === "list"
            ? <OrderRow key={o.id} order={o} lang={lang} onAction={orderAction} open={expanded.has(o.id)} onToggle={() => toggle(o.id)} />
            : <OrderCard key={o.id} order={o} lang={lang} onAction={orderAction} />))
          : <EmptyBox>Hali buyurtma yo'q. Pastdagi maydonda agentga vazifa bering — masalan: “Toshkentda 20 tonna sement kerak”.</EmptyBox>}
      </div>
    </section>
  );
}
