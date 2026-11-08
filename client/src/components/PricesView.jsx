import { cls, pct, som } from "../lib/format.js";

export function Skeleton({ n = 3 }) {
  return Array.from({ length: n }, (_, i) => <div className="skeleton" key={i}></div>);
}
export const EmptyBox = ({ children }) => <div className="empty">{children}</div>;

function Spark({ points, w = 160, h = 34 }) {
  if (!points?.length) return null;
  const min = Math.min(...points), max = Math.max(...points), span = max - min || 1;
  const d = points.map((p, i) => `${i ? "L" : "M"}${((i / (points.length - 1 || 1)) * w).toFixed(1)},${(h - 3 - ((p - min) / span) * (h - 6)).toFixed(1)}`).join("");
  const c = points.at(-1) > points[0] ? "var(--up)" : points.at(-1) < points[0] ? "var(--down)" : "var(--blue)";
  return <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none"><path d={d} fill="none" stroke={c} strokeWidth="2" vectorEffect="non-scaling-stroke" /></svg>;
}

function PriceCard({ q, onOpen }) {
  return (
    <button className="card" onClick={() => onOpen(q.name)}>
      <span className="ico">{q.category.icon}</span>
      <div className="body">
        <div className="t">{q.name}</div>
        <div className="s">{q.week ? q.week + " · " : ""}1 {q.unit} uchun</div>
        <div className="p"><b>{som(q.price, { short: true })}</b><span className={`pill ${cls(q.changePct)}`}>{pct(q.changePct)}</span></div>
        {q.everyday ? <div className="s">{q.everyday.label} ≈ {som(q.everyday.price)}</div> : null}
      </div>
    </button>
  );
}

export default function PricesView({ active, categories, prices, overview, onOpenPrice }) {
  const { q, setQ, cat, setCat, list, info, load } = prices;
  const all = [{ id: "", name: "Hammasi", icon: "" }, ...categories];
  const daily = overview?.daily || [];
  return (
    <section className={"view page" + (active ? " active" : "")} data-view="prices">
      <h1 className="page-title">Birja narxlari <span>haftalik kotirovkalar · uzex.uz</span></h1>
      <form className="search" id="priceForm" role="search" onSubmit={(e) => { e.preventDefault(); load(); }}>
        <input id="priceQ" type="search" placeholder="Masalan: sement, benzin, un, armatura" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn" type="submit">Izlash</button>
      </form>
      <div className="cats" id="priceCats">
        {all.map((c) => (
          <button key={c.id || "_all"} className={"chip" + (c.id === cat ? " active" : "")} onClick={() => { setCat(c.id); load(); }}>
            {c.icon ? c.icon + " " : ""}{c.name}
          </button>
        ))}
      </div>
      <div className="hint" id="priceInfo">{info}</div>
      <div className="grid" id="priceList">
        {list.kind === "loading" && <Skeleton n={4} />}
        {list.kind === "error" && <EmptyBox>{list.message}</EmptyBox>}
        {list.kind === "items" && (list.items.length
          ? list.items.map((it, i) => <PriceCard key={`${it.name}_${i}`} q={it} onOpen={onOpenPrice} />)
          : <EmptyBox>Hech narsa topilmadi. Masalan: <b>sement</b>, <b>benzin</b>, <b>bug'doy</b>.</EmptyBox>)}
      </div>
      <h2 className="sub-title">Oxirgi 10 savdo kuni</h2>
      <div className="grid mini-grid" id="dailyList">
        {overview && (daily.length
          ? daily.map((x, i) => (
            <button className="mini" key={`${x.name}_${i}`} onClick={() => onOpenPrice(x.name)}>
              <div className="t">{x.category.icon} {x.name}</div>
              <Spark points={x.points} />
              <div className="hint"><b style={{ color: "var(--text)" }}>{som(x.price, { short: true })}</b> <span className={cls(x.changePct)}>{pct(x.changePct)}</span></div>
            </button>
          ))
          : <EmptyBox>Kunlik dinamika hozircha mavjud emas.</EmptyBox>)}
      </div>
    </section>
  );
}
