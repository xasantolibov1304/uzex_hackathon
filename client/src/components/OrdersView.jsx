import OrderCard from "./OrderCard.jsx";
import { EmptyBox } from "./PricesView.jsx";

const ENTITY = [["jismoniy", "Jismoniy shaxs"], ["yatt", "YaTT"], ["yuridik", "Yuridik shaxs"]];

function ProfileCard({ profile: p, onSave }) {
  const f = (k, label, type = "text", ph = "") => (
    <div className="field"><label htmlFor={`pf_${k}`}>{label}</label><input id={`pf_${k}`} name={k} type={type} defaultValue={p[k] || ""} placeholder={ph} /></div>
  );
  function onSubmit(e) {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.currentTarget).entries());
    Object.keys(body).forEach((k) => !body[k] && delete body[k]);
    onSave(body);
  }
  return (
    <>
      <h3>Xaridor ma'lumotlari</h3>
      <div className="hint">Agent arizani shu ma'lumotlar bilan to'ldiradi. Bo'sh bo'lsa, agentning o'zi so'raydi.</div>
      <form className="fields" id="profileForm" onSubmit={onSubmit}>
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
        <div className="field" style={{ alignSelf: "end" }}><button className="btn" type="submit" style={{ width: "100%" }}>Saqlash</button></div>
      </form>
    </>
  );
}

export default function OrdersView({ active, orders, profile, profileVer, lang, onSaveProfile, orderAction }) {
  return (
    <section className={"view page" + (active ? " active" : "")} data-view="orders">
      <h1 className="page-title">Buyurtmalarim <span>agent tayyorlagan xaridlar</span></h1>
      <div className="profile-card" id="profileCard">
        {profile && <ProfileCard key={profileVer} profile={profile} onSave={onSaveProfile} />}
      </div>
      <div className="orders" id="orderList">
        {orders.length
          ? orders.map((o) => <OrderCard key={o.id} order={o} lang={lang} onAction={orderAction} />)
          : <EmptyBox>Hali buyurtma yo'q. Pastdagi maydonda agentga vazifa bering — masalan: “Toshkentda 20 tonna sement kerak”.</EmptyBox>}
      </div>
    </section>
  );
}
