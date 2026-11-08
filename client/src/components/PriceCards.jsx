// Agent ekranining bosh sahifasi: UZEX'ning haqiqiy (haftalik) narxlari asosidagi dashboard.
// 1-qator: bozor holati (o'lchagich) · asosiy narxlar (jadval) · haftalik o'zgarish (ustunlar)
// 2-qator: agentga tayyor vazifalar (rangli bannerlar) · 3-qator: qanday ishlaydi
import { som } from "../lib/format.js";

const I = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
const ICONS = {
  cement: <svg {...I}><path d="M6 6.5c0-1.4 2.7-2.5 6-2.5s6 1.1 6 2.5" /><path d="M6 6.5 5 19c0 .6 3.1 1 7 1s7-.4 7-1L18 6.5" /><path d="M9 11h6M9 14.5h6" /></svg>,
  flour: <svg {...I}><path d="M12 21V9" /><path d="M12 9c-2.2-.3-3.5-1.8-3.5-4 2.2.3 3.5 1.8 3.5 4Zm0 0c2.2-.3 3.5-1.8 3.5-4-2.2.3-3.5 1.8-3.5 4Z" /><path d="M12 14c-2.2-.3-3.5-1.8-3.5-4 2.2.3 3.5 1.8 3.5 4Zm0 0c2.2-.3 3.5-1.8 3.5-4-2.2.3-3.5 1.8-3.5 4Z" /></svg>,
  diesel: <svg {...I}><path d="M12 3.5S6.5 9.6 6.5 14a5.5 5.5 0 0 0 11 0c0-4.4-5.5-10.5-5.5-10.5Z" /><path d="M9.5 14.5a2.5 2.5 0 0 0 2.5 2.5" /></svg>,
  rebar: <svg {...I}><path d="M4 18 18 4M7 20 20 7" /><path d="m6 14 2 2M9 11l2 2M12 8l2 2M15 5l2 2" /></svg>,
  petrol: <svg {...I}><path d="M5 20V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v14M4 20h12M8 8h4" /><path d="M15 10h2a1.5 1.5 0 0 1 1.5 1.5V16a1.5 1.5 0 0 0 3 0V9l-3-3" /></svg>,
  mic: <svg {...I}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" /></svg>,
  search: <svg {...I}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></svg>,
  check: <svg {...I}><path d="M20 6 9 17l-5-5" /></svg>,
  chev: <svg {...I} width="18" height="18"><path d="m9 6 6 6-6 6" /></svg>,
};

// Haftalik kotirovkalardan tovarni topish: naqshlar ustuvorlik tartibida
const GOODS = [
  { key: "cement", res: [/portlandsement.*qop/i, /portlandsement|sement/i] },
  { key: "flour", res: [/bug.doy uni/i] },
  { key: "diesel", res: [/^dizel yoqilg.isi$/i, /dizel/i] },
  { key: "rebar", res: [/armatura/i] },
  { key: "petrol", res: [/benzin\s+\S-92$/i, /benzin/i] },
];
const pick = (quotes, res) => { for (const re of res) { const q = quotes.find((x) => re.test(x.name)); if (q) return q; } return null; };
const pctTxt = (n) => `${n > 0 ? "+" : ""}${(Number(n) || 0).toFixed(1)}%`;
const dir = (n) => (n > 0.05 ? "up" : n < -0.05 ? "down" : "flat");
// Kirill harflari aralash nomlarni (masalan "Аvtobenzin") lotinga keltirish
const clean = (s) => String(s || "").replace(/А/g, "A").replace(/а/g, "a").replace(/М/g, "M").replace(/о/g, "o").replace(/\s+/g, " ").trim();

// "dushanba, 9-noyabr" / "понедельник, 9 ноября" / "Monday, 9 November"
const UZ_DAYS = ["yakshanba", "dushanba", "seshanba", "chorshanba", "payshanba", "juma", "shanba"];
const UZ_MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
function dayName(iso, lang) {
  const [y, m, d] = String(iso).split("-").map(Number);
  if (!y) return iso;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (lang !== "ru" && lang !== "en") return `${UZ_DAYS[date.getUTCDay()]}, ${d}-${UZ_MONTHS[m - 1]}`;
  try {
    return date.toLocaleDateString(lang === "ru" ? "ru-RU" : "en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  } catch {
    return iso;
  }
}

/* ---------- 1. Bozor holati: katta raqam + taqsimot chizig'i + yo'nalishlar ---------- */
const CAT_IC = { build: "cement", fuel: "diesel", food: "flour" };
const SEG = 10; // yo'nalish qatoridagi segmentlar soni
function MoodCard({ quotes, d }) {
  const n = quotes.length;
  const up = quotes.filter((q) => q.changePct > 0.05).length;
  const down = quotes.filter((q) => q.changePct < -0.05).length;
  const flat = n - up - down;
  const state = up > down + 2 ? "rising" : down > up + 2 ? "falling" : "stable";
  const cats = Object.keys(d.cats).map((id) => {
    const xs = quotes.filter((q) => q.category?.id === id);
    const avg = xs.length ? xs.reduce((s, q) => s + (Number(q.changePct) || 0), 0) / xs.length : 0;
    return { id, avg, has: xs.length > 0 };
  }).filter((c) => c.has);
  const max = Math.max(0.5, ...cats.map((c) => Math.abs(c.avg)));
  const split = [["up", up], ["flat", flat], ["down", down]];
  const ticks = [...quotes].sort((a, b) => (Number(b.changePct) || 0) - (Number(a.changePct) || 0));
  return (
    <div className="dcard mood">
      <div className="dc-head">
        <span>{d.mood}</span>
        <span className={`m-pill ${state}`}>
          {/* Trend ikonkasi: o'sish ↗, tushish ↘, barqaror → */}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {state === "rising" ? <><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></>
              : state === "falling" ? <><path d="M3 7l6 6 4-4 8 8" /><path d="M15 17h6v-6" /></>
              : <><path d="M4 12h16" /><path d="M14 6l6 6-6 6" /></>}
          </svg>
          {d.short[state]}
        </span>
      </div>

      <div className="m-hero" title={d.moodSub(n, up)}>
        <div className="m-big">{up}<span>/{n}</span></div>
        <div className="m-sub">{d.moodOf(n)}</div>
      </div>

      {/* Har bir tovar — bitta tik: chapda qimmatlaganlar, o'rtada o'zgarmaganlar, o'ngda arzonlaganlar */}
      <div className="m-ticks" role="img" aria-label={split.map(([k, v]) => `${d.split[k]}: ${v}`).join(", ")}>
        {ticks.map((q, i) => <i key={i} className={dir(q.changePct)} data-tip={`${clean(q.name)} · ${pctTxt(q.changePct)}`} />)}
      </div>
      <ul className="m-legend">
        {split.map(([k, v]) => <li key={k} className={k}><i />{d.split[k]} <b>{v}</b></li>)}
      </ul>

      <div className="m-cats">
        <div className="m-cap">{d.catHead}</div>
        {cats.map((c) => (
          <div className="m-cat" key={c.id}>
            <i className="pt-ic">{ICONS[CAT_IC[c.id]]}</i>
            <span className="m-name">{d.cats[c.id]}</span>
            <span className={`m-seg ${dir(c.avg)}`} aria-hidden="true">
              {Array.from({ length: SEG }, (_, k) => <i key={k} className={k < Math.max(1, Math.round(Math.abs(c.avg) / max * SEG)) ? "on" : ""} />)}
            </span>
            <span className={`chg ${dir(c.avg)}`}>{pctTxt(c.avg)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- 2. Asosiy narxlar: jadval + dollar kursi ---------- */
function MainCard({ quotes, usd, t, d, onPick }) {
  const rows = GOODS.map((g) => ({ ...g, q: pick(quotes, g.res) })).filter((r) => r.q);
  const short = (n) => som(n, { short: true }).replace(/\s*so.m$/, "");
  // Diverging shkala: markazda 0, chapga arzonlash, o'ngga qimmatlash; ildiz shkala — kichik o'zgarishlar ham ko'rinsin
  const max = Math.max(1, ...rows.map((r) => Math.abs(Number(r.q.changePct) || 0)));
  const w = (p) => Math.max(p ? 6 : 0, Math.sqrt(Math.abs(p) / max) * 100);
  return (
    <div className="dcard main">
      <div className="dc-head">
        <span>{d.main}</span>
        <span className="mp-chip">{d.weekly}</span>
      </div>
      <div className="mp-list">
        {rows.map(({ key, q }) => {
          const title = key === "petrol" ? d.petrol : t.goods[key];
          const p = Number(q.changePct) || 0;
          const prev = Number(q.price) - (Number(q.change) || 0);
          const unit = t.per[q.unit] || q.unit;
          return (
            <button className="mp-row" key={key} onClick={() => onPick(t.goodsTask(title))} title={clean(q.name)}>
              <i className="pt-ic">{ICONS[key]}</i>
              <span className="mp-name">
                <b>{title}</b>
                <small>{d.prev}: {short(prev)}/{unit}</small>
              </span>
              <span className={`mp-div ${dir(p)}`} aria-hidden="true">
                <i style={{ width: w(p) / 2 + "%", [p < 0 ? "right" : "left"]: "50%" }} />
              </span>
              <span className="mp-val">
                <b>{short(q.price)}<small>/{unit}</small></b>
                <span className={`chg ${dir(p)}`}>{pctTxt(p)}</span>
              </span>
            </button>
          );
        })}
      </div>
      {usd?.rate ? (
        <div className="usd">
          <i className="usd-ic" aria-hidden="true">$</i>
          <div className="usd-t"><b>{d.usd}</b><span>{d.usdSub(usd.date)}</span></div>
          <div className="usd-v">{Math.round(usd.rate).toLocaleString("en-US").replace(/,/g, " ")}<small> so'm</small></div>
        </div>
      ) : null}
    </div>
  );
}

/* ---------- 3. Haftaning o'zgarishi: ikkita kichik karta (eng ko'p qimmatlagan / arzonlagan) ---------- */
function MoverCard({ list, kind, label }) {
  // list — shu yo'nalishdagi tovarlar, eng kattasi birinchi. O'ngda top-7 ustun: yetakchi to'liq rangda,
  // qolganlari shtrixlangan; sichqoncha bilan har bir ustun nomi va foizi ko'rinadi.
  const top = list[0];
  if (!top) return null;
  const xs = list.slice(0, 7);
  const max = Math.abs(top.changePct) || 1;
  return (
    <div className={"dcard mover mv-" + kind}>
      <div className="dc-head">
        <span>{label}</span>
        <span className="mv-ic" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            {kind === "up" ? <path d="M7 17 17 7M8 7h9v9" /> : <path d="M7 7l10 10M17 8v9H8" />}
          </svg>
        </span>
      </div>
      <div className="mv-row">
        <div className="mv-hero">
          <div className="mv-big">{pctTxt(top.changePct)}</div>
          <div className="mv-sub" title={clean(top.name)}>{clean(top.name)}</div>
        </div>
        <div className="mv-chart" role="img" aria-label={xs.map((q) => `${clean(q.name)} ${pctTxt(q.changePct)}`).join(", ")}>
          {xs.map((q, i) => (
            <span key={i} className={"mv-col" + (i === 0 ? " lead" : "")} data-tip={`${clean(q.name)} · ${pctTxt(q.changePct)}`}>
              <i style={{ height: Math.max(8, Math.abs(q.changePct) / max * 100) + "%" }} />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
function MoversCards({ quotes, d }) {
  const up = quotes.filter((q) => q.changePct > 0.05).sort((a, b) => b.changePct - a.changePct);
  const down = quotes.filter((q) => q.changePct < -0.05).sort((a, b) => a.changePct - b.changePct);
  return (
    <div className="dash-col">
      <MoverCard list={up} kind="up" label={d.gainer} />
      <MoverCard list={down} kind="down" label={d.loser} />
    </div>
  );
}

export default function PriceCards({ quotes, trading, usd, lang, t, onPick }) {
  const qs = quotes || [];
  if (!qs.length) return null;
  const d = t.dash;
  const closed = trading && trading.isTradingDay === false;
  return (
    <div className="goods">
      <div className="dash-row">
        <MoodCard quotes={qs} d={d} />
        <MainCard quotes={qs} usd={usd} t={t} d={d} onPick={onPick} />
        <MoversCards quotes={qs} d={d} />
      </div>
      {closed && (
        <div className="trade-closed" role="status">
          <span className="tc-dot" aria-hidden="true" />
          <span><b>{t.noTrading.title}</b> {t.noTrading.body(dayName(trading.nextTradingDay, lang))}</span>
        </div>
      )}

    </div>
  );
}
