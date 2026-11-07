import { qty, som } from "../lib/format.js";
import { EmptyBox, Skeleton } from "./PricesView.jsx";

export const LOT_CHIPS = ["sement", "armatura", "benzin", "dizel", "un", "bug'doy", "paxta yog'i", "shifer", "ko'mir", "o'g'it"];

export default function LotsView({ active, regions, lots, onOpenLot }) {
  const { q, setQ, region, setRegion, sort, setSort, list, info, load } = lots;
  return (
    <section className={"view page" + (active ? " active" : "")} data-view="lots">
      <h1 className="page-title">Birjadagi takliflar <span>kotirovkalash varag'i · uzex.uz</span></h1>
      <form className="search" id="lotForm" role="search" onSubmit={(e) => { e.preventDefault(); load(); }}>
        <input id="lotQ" type="search" placeholder="Nima kerak? Masalan: sement" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} />
        <select id="lotRegion" aria-label="Hudud" value={region} onChange={(e) => { setRegion(e.target.value); load(); }}>
          <option value="">Barcha hududlar</option>
          {regions.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select id="lotSort" aria-label="Saralash" value={sort} onChange={(e) => { setSort(e.target.value); load(); }}>
          <option value="new">Eng yangi</option><option value="cheap">Eng arzon</option>
        </select>
        <button className="btn" type="submit">Izlash</button>
      </form>
      <div className="cats" id="lotChips">
        {LOT_CHIPS.map((c) => <button className="chip" key={c} onClick={() => { setQ(c); load(); }}>{c}</button>)}
      </div>
      <div className="hint" id="lotInfo">
        {info && <>“{info.q}”{info.query.toLowerCase() !== info.q.toLowerCase() ? ` (birjada: ${info.query})` : ""} — <b>{info.total}</b> ta taklif · narx — bazis (boshlang'ich) narx</>}
      </div>
      <div className="grid" id="lotList">
        {list.kind === "hint" && <EmptyBox>Nima kerakligini yozing yoki tayyor tugmalardan birini bosing. Yoki pastdagi maydonda agentga vazifa bering — u o'zi topib beradi.</EmptyBox>}
        {list.kind === "loading" && <Skeleton n={6} />}
        {list.kind === "error" && <EmptyBox>{list.message}</EmptyBox>}
        {list.kind === "items" && (list.items.length
          ? list.items.map((l, i) => (
            <button className="card" key={`${l.id}_${i}`} onClick={() => onOpenLot(l.id)}>
              <span className="ico">{l.category.icon}</span>
              <div className="body">
                <div className="t">{l.product}</div>
                <div className="s">{l.seller || "Sotuvchi ko'rsatilmagan"} · 📍 {l.region}</div>
                <div className="p"><b>{l.perTonne != null ? som(l.perTonne, { short: true }) + " / tonna" : som(l.perUnit, { short: true }) + " / " + l.unit}</b><span className="hint">1 lot = {qty(l.qty)} {l.unit}</span></div>
                {l.everyday ? <div className="s">{l.everyday.label} ≈ {som(l.everyday.price)}</div> : null}
              </div>
            </button>
          ))
          : <EmptyBox>Bu so'rov bo'yicha taklif topilmadi.</EmptyBox>)}
      </div>
    </section>
  );
}
