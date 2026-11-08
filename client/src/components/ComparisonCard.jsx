// Agent "show_comparison" tool'i chizgan solishtirish kartasi. Bitta ma'lumot — 4 xil ko'rinish (tepada almashtirgich):
//  Qiymatlar (lotlar, tovarlar, hududlar):  bar (gorizontal) · column (ustunlar) · donut (doira, ulush) · diff (bozor/eng arzoniga nisbatan farq)
//  Qatorlar (kunlar bo'yicha narx):          line (chiziq) · area (maydon) · column (oxirgi narxlar) · change (davr ichidagi o'zgarish %)
// Birinchi ochiladigan ko'rinishni agent tanlaydi (chart.kind). Ostida — ikkilamchi ko'rsatkichlar jadvali.
import { memo, useEffect, useState } from "react";

const L = {
  uz: {
    mln: "mln", mlrd: "mlrd", diff: "Farq", cheapest: "Eng arzon", priciest: "Eng qimmat", vs: "bozorga nisbatan", times: "marta farq",
    share: "ulush", vsMin: "eng arzoniga nisbatan", change: "davr ichida",
    views: { bar: "Chiziqlar", column: "Ustunlar", donut: "Doira", diff: "Farq", line: "Grafik", area: "Maydon", change: "O'zgarish" },
  },
  ru: {
    mln: "млн", mlrd: "млрд", diff: "Разница", cheapest: "Дешевле всех", priciest: "Дороже всех", vs: "к рынку", times: "раза разница",
    share: "доля", vsMin: "к самому дешёвому", change: "за период",
    views: { bar: "Полосы", column: "Столбцы", donut: "Кольцо", diff: "Разница", line: "График", area: "Область", change: "Изменение" },
  },
  en: {
    mln: "M", mlrd: "B", diff: "Difference", cheapest: "Cheapest", priciest: "Most expensive", vs: "vs market", times: "× gap",
    share: "share", vsMin: "vs cheapest", change: "over period",
    views: { bar: "Bars", column: "Columns", donut: "Donut", diff: "Gap", line: "Line", area: "Area", change: "Change" },
  },
};
const VALUE_VIEWS = ["bar", "column", "donut", "diff"];
const SERIES_VIEWS = ["line", "area", "column", "change"];
const SERIES = ["#2f6bff", "#12a150", "#e8a10d", "#e5372b", "#8b5cf6", "#0ea5a4", "#db2777", "#6b6e76"];
const TONE = { lo: "#12a150", hi: "#e5372b", "": "#2f6bff" };

const grp = (n) => Math.round(n).toLocaleString("en-US").replace(/,/g, " ");
function fmt(v, unit = "", l = L.uz) {
  if (v == null || !Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  const s = a >= 1e9 ? (v / 1e9).toFixed(2).replace(/\.?0+$/, "") + " " + l.mlrd
    : a >= 1e6 ? (v / 1e6).toFixed(2).replace(/\.?0+$/, "") + " " + l.mln
    : a >= 100 ? grp(v)
    : (+v.toFixed(2)).toString();
  return unit ? `${s} ${unit}` : s;
}
const pctTxt = (p) => `${p > 0 ? "+" : ""}${p.toFixed(1)}%`;
const short = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const nums = (pts) => (pts || []).filter((p) => p != null && Number.isFinite(p));

/** Eng arzoni / eng qimmati (faqat qiymatlar farq qilsa). */
function tones(items) {
  const vals = items.map((x) => x.value);
  const min = Math.min(...vals), hi = Math.max(...vals);
  const many = items.length > 1 && min !== hi;
  return items.map((x) => (many && x.value === min ? "lo" : many && x.value === hi ? "hi" : ""));
}

/** Kartani bosganda lot ochiladigan qator (lot_id bo'lsa — tugma). */
function Clickable({ lotId, onOpenLot, className, children }) {
  return lotId && onOpenLot
    ? <button type="button" className={className} onClick={() => onOpenLot(lotId)}>{children}</button>
    : <div className={className}>{children}</div>;
}

/* ---------- 1. Gorizontal chiziqlar ---------- */
function BarView({ items, chart, l, onOpenLot }) {
  const [grown, setGrown] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setGrown(true)); return () => cancelAnimationFrame(id); }, []);
  const ref = chart.reference?.value ?? null;
  const max = Math.max(...items.map((x) => x.value), ref ?? 0) * 1.04 || 1;
  const tn = tones(items);
  return (
    <div className="cmp-bars">
      {items.map((x, i) => {
        const vsRef = ref ? ((x.value - ref) / ref) * 100 : null;
        return (
          <Clickable key={i} lotId={x.lot_id} onOpenLot={onOpenLot} className={"cmp-row " + tn[i]}>
            <div className="cmp-lbl">
              <b title={x.label}>{x.label}</b>
              {x.sublabel && <span title={x.sublabel}>{x.sublabel}</span>}
            </div>
            <div className="cmp-track">
              <i className="cmp-fill" style={{ width: grown ? `${(x.value / max) * 100}%` : 0, transitionDelay: `${i * 70}ms` }} />
              {ref != null && <i className="cmp-ref" style={{ left: `${(ref / max) * 100}%` }} />}
            </div>
            <div className="cmp-val">
              <b>{fmt(x.value, chart.unit, l)}</b>
              {tn[i] && <span className={"cmp-tag " + tn[i]}>{tn[i] === "lo" ? l.cheapest : l.priciest}</span>}
              {!tn[i] && vsRef != null && <span className={vsRef > 0 ? "down" : "up"}>{pctTxt(vsRef)} {l.vs}</span>}
            </div>
          </Clickable>
        );
      })}
    </div>
  );
}

/* ---------- 2. Vertikal ustunlar ---------- */
function ColumnView({ items, chart, l, colors }) {
  const W = 640, H = 250, P = { l: 8, r: 8, t: 26, b: 40 };
  const ref = chart.reference?.value ?? null;
  const max = Math.max(...items.map((x) => x.value), ref ?? 0) * 1.08 || 1;
  const tn = tones(items);
  const n = items.length;
  const slot = (W - P.l - P.r) / n;
  const bw = Math.min(72, slot * 0.62);
  const y = (v) => P.t + (1 - v / max) * (H - P.t - P.b);
  const maxChars = Math.max(6, Math.floor(slot / 7.5));
  return (
    <svg className="cmp-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={chart.title}>
      <line x1={P.l} x2={W - P.r} y1={H - P.b} y2={H - P.b} className="grid" />
      {items.map((x, i) => {
        const cx = P.l + slot * (i + 0.5);
        const top = y(x.value);
        const color = colors ? colors[i] : TONE[tn[i]];
        return (
          <g key={i}>
            <title>{`${x.label}: ${fmt(x.value, chart.unit, l)}`}</title>
            <rect x={cx - bw / 2} y={top} width={bw} height={Math.max(1, H - P.b - top)} rx="8" fill={color} className="col" style={{ animationDelay: `${i * 70}ms` }} />
            <text x={cx} y={top - 8} textAnchor="middle" className="vl">{fmt(x.value, "", l)}</text>
            <text x={cx} y={H - P.b + 18} textAnchor="middle" className="xl">{short(x.label, maxChars)}</text>
            {x.sublabel && <text x={cx} y={H - P.b + 33} textAnchor="middle" className="ax">{short(x.sublabel, maxChars)}</text>}
          </g>
        );
      })}
      {ref != null && <line x1={P.l} x2={W - P.r} y1={y(ref)} y2={y(ref)} className="refl" />}
    </svg>
  );
}

/* ---------- 3. Doira (har birining umumiydagi ulushi) ---------- */
function DonutView({ items, chart, l, onOpenLot }) {
  const total = items.reduce((s, x) => s + Math.max(0, x.value), 0) || 1;
  const R = 70, C = 2 * Math.PI * R;
  const vals = items.map((x) => x.value);
  const min = Math.min(...vals), hi = Math.max(...vals);
  let acc = 0;
  return (
    <div className="cmp-donut">
      <svg viewBox="0 0 200 200" role="img" aria-label={chart.title}>
        <circle cx="100" cy="100" r={R} className="track" />
        <g className="ring">
          {items.map((x, i) => {
            const frac = Math.max(0, x.value) / total;
            const seg = (
              <circle key={i} cx="100" cy="100" r={R} fill="none" stroke={SERIES[i % SERIES.length]} strokeWidth="26"
                strokeDasharray={`${Math.max(0, frac * C - 2)} ${C}`} strokeDashoffset={-acc * C} transform="rotate(-90 100 100)">
                <title>{`${x.label}: ${fmt(x.value, chart.unit, l)} (${(frac * 100).toFixed(1)}%)`}</title>
              </circle>
            );
            acc += frac;
            return seg;
          })}
        </g>
        {items.length > 1 && min > 0 ? (
          <>
            <text x="100" y="98" textAnchor="middle" className="big">{(hi / min).toFixed(1)}×</text>
            <text x="100" y="118" textAnchor="middle" className="ax">{l.times}</text>
          </>
        ) : null}
      </svg>
      <div className="cmp-dl">
        {items.map((x, i) => (
          <Clickable key={i} lotId={x.lot_id} onOpenLot={onOpenLot} className="cmp-dl-row">
            <i style={{ background: SERIES[i % SERIES.length] }} />
            <span className="n" title={x.label}>{x.label}{x.sublabel && <small title={x.sublabel}>{x.sublabel}</small>}</span>
            <b>{fmt(x.value, chart.unit, l)}</b>
            <em>{((Math.max(0, x.value) / total) * 100).toFixed(1)}%</em>
          </Clickable>
        ))}
      </div>
    </div>
  );
}

/* ---------- 4. Farq: bazaga nisbatan % (manfiy — chapga, musbat — o'ngga) ---------- */
function DiffView({ rows, baseLabel, onOpenLot, goodUp = false }) {
  const [grown, setGrown] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setGrown(true)); return () => cancelAnimationFrame(id); }, []);
  const neg = Math.max(0, ...rows.map((r) => -r.pct));
  const pos = Math.max(0, ...rows.map((r) => r.pct));
  const span = neg + pos || 1;
  const zero = (neg / span) * 100;
  return (
    <div className="cmp-bars">
      {rows.map((r, i) => {
        const w = (Math.abs(r.pct) / span) * 100;
        const good = goodUp ? r.pct > 0 : r.pct < 0;
        const cls = Math.abs(r.pct) < 0.05 ? "flat" : good ? "good" : "bad";
        return (
          <Clickable key={i} lotId={r.lot_id} onOpenLot={onOpenLot} className="cmp-row">
            <div className="cmp-lbl">
              <b title={r.label}>{r.label}</b>
              {r.sublabel && <span title={r.sublabel}>{r.sublabel}</span>}
            </div>
            <div className="cmp-track diverge">
              <i className="cmp-zero" style={{ left: `${zero}%` }} />
              <i className={"cmp-fill " + cls} style={{ left: r.pct < 0 ? `${zero - (grown ? w : 0)}%` : `${zero}%`, width: grown ? `${Math.max(w, 0.6)}%` : 0, transitionDelay: `${i * 70}ms` }} />
            </div>
            <div className="cmp-val">
              <b className={cls === "good" ? "up" : cls === "bad" ? "down" : ""}>{pctTxt(r.pct)}</b>
              <span>{baseLabel}</span>
            </div>
          </Clickable>
        );
      })}
    </div>
  );
}

/* ---------- Kunlar bo'yicha qatorlar: chiziq yoki maydon ---------- */
function LineView({ series, chart, l, area }) {
  const W = 640, H = 220, P = { l: 56, r: 12, t: 12, b: 26 };
  const n = Math.max(...series.map((s) => s.points.length));
  const all = series.flatMap((s) => nums(s.points));
  if (!all.length) return null;
  let lo = Math.min(...all), hi = Math.max(...all);
  if (chart.reference) { lo = Math.min(lo, chart.reference.value); hi = Math.max(hi, chart.reference.value); }
  if (area) lo = Math.min(lo, 0);
  const pad = (hi - lo) * 0.1 || Math.abs(hi) * 0.05 || 1;
  if (!area) lo -= pad;
  hi += pad;
  const x = (i) => P.l + (n === 1 ? (W - P.l - P.r) / 2 : (i / (n - 1)) * (W - P.l - P.r));
  const y = (v) => P.t + (1 - (v - lo) / (hi - lo)) * (H - P.t - P.b);
  const ticks = [0, 0.5, 1].map((f) => lo + f * (hi - lo));
  const xl = chart.xLabels || [];
  return (
    <svg className="cmp-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={chart.title}>
      <defs>
        {series.map((_, k) => (
          <linearGradient key={k} id={`${chart.id}-g${k}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={SERIES[k % SERIES.length]} stopOpacity=".28" />
            <stop offset="1" stopColor={SERIES[k % SERIES.length]} stopOpacity="0" />
          </linearGradient>
        ))}
      </defs>
      {ticks.map((v, i) => (
        <g key={i}>
          <line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} className="grid" />
          <text x={P.l - 8} y={y(v) + 4} textAnchor="end" className="ax">{fmt(v, "", l)}</text>
        </g>
      ))}
      {xl.length > 0 && [0, Math.floor((n - 1) / 2), n - 1].filter((v, i, a) => a.indexOf(v) === i).map((i) => (
        <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} className="ax">{xl[i] ?? ""}</text>
      ))}
      {chart.reference && <line x1={P.l} x2={W - P.r} y1={y(chart.reference.value)} y2={y(chart.reference.value)} className="refl" />}
      {series.map((s, k) => {
        const pts = s.points.map((v, i) => (v == null ? null : [x(i), y(v)])).filter(Boolean);
        if (!pts.length) return null;
        const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join("");
        const last = pts.at(-1);
        const base = y(lo).toFixed(1);
        return (
          <g key={k} style={{ color: SERIES[k % SERIES.length] }}>
            {area && <path d={`${d}L${last[0].toFixed(1)} ${base}L${pts[0][0].toFixed(1)} ${base}Z`} fill={`url(#${chart.id}-g${k})`} className="ar" />}
            <path d={d} className="ln" pathLength="1" />
            <circle cx={last[0]} cy={last[1]} r="4" className="dot" />
          </g>
        );
      })}
    </svg>
  );
}

/* ---------- Pastki qator: bozor narxi, farq, qatorlar legendasi ---------- */
function Foot({ chart, items, series, l }) {
  const ref = chart.reference;
  const vals = items.map((x) => x.value);
  const min = Math.min(...vals), hi = Math.max(...vals);
  return (
    <div className="cmp-foot">
      {series && series.map((s, k) => {
        const p = nums(s.points);
        const ch = p.length > 1 && p[0] ? ((p.at(-1) - p[0]) / p[0]) * 100 : null;
        return (
          <span className="cmp-legend" key={k}>
            <i style={{ background: SERIES[k % SERIES.length] }} />{s.label}: <b>{fmt(p.at(-1), chart.unit, l)}</b>
            {ch != null && <span className={ch > 0 ? "up" : ch < 0 ? "down" : ""}> {pctTxt(ch)}</span>}
          </span>
        );
      })}
      {ref && <span className="cmp-legend"><i className="cmp-ref-key" />{ref.label}: <b>{fmt(ref.value, chart.unit, l)}</b></span>}
      {!series && items.length > 1 && min !== hi && min > 0 && (
        <span className="cmp-diff">{l.diff}: <b>{fmt(hi - min, chart.unit, l)}</b> <span className="down">({pctTxt(((hi - min) / min) * 100)})</span></span>
      )}
    </div>
  );
}

const VIEW_ICONS = {
  bar: <path d="M4 6h10M4 12h16M4 18h7" />,
  column: <path d="M6 20V11M12 20V4M18 20v-6" />,
  donut: <><circle cx="12" cy="12" r="7.5" /><path d="M12 4.5V9M19.2 14.2l-4.3-1.3" /></>,
  diff: <path d="M12 4v16M12 8h7M5 13h7M12 18h4" />,
  line: <path d="m4 17 5-6 4 3 7-8" />,
  area: <><path d="m4 16 5-6 4 3 7-8v15H4Z" opacity=".25" fill="currentColor" stroke="none" /><path d="m4 16 5-6 4 3 7-8" /></>,
  change: <path d="M12 4v16M12 7h6M6 12h6M12 17h8" />,
};

export default memo(function ComparisonCard({ chart, lang, onOpenLot }) {
  const l = L[chart.lang] || L[lang] || L.uz; // grafik tili — javob tili (server aniqlaydi)
  const series = chart.items.filter((x) => nums(x.points).length >= 2);
  const isSeries = series.length > 0;
  // Qiymat: berilgan value yoki qatorning oxirgi nuqtasi
  const items = chart.items.map((x) => ({ ...x, value: x.value ?? nums(x.points).at(-1) ?? null })).filter((x) => x.value != null);
  const views = (isSeries ? SERIES_VIEWS : VALUE_VIEWS).filter((v) => (v === "donut" ? items.length > 1 : true));
  const [view, setView] = useState(views.includes(chart.kind) ? chart.kind : views[0]);
  const rows = (chart.rows || []).filter((r) => r.values?.some(Boolean));

  let body;
  if (view === "line" || view === "area") body = <LineView series={series} chart={chart} l={l} area={view === "area"} />;
  else if (view === "column") body = <ColumnView items={items} chart={chart} l={l} colors={isSeries ? items.map((_, i) => SERIES[i % SERIES.length]) : null} />;
  else if (view === "donut") body = <DonutView items={items} chart={chart} l={l} onOpenLot={onOpenLot} />;
  else if (view === "diff") {
    const base = chart.reference?.value || Math.min(...items.map((x) => x.value));
    const baseLabel = chart.reference?.value ? l.vs : l.vsMin;
    body = <DiffView rows={items.map((x) => ({ ...x, pct: base ? ((x.value - base) / base) * 100 : 0 }))} baseLabel={baseLabel} onOpenLot={onOpenLot} />;
  } else if (view === "change") {
    body = <DiffView rows={series.map((s) => { const p = nums(s.points); return { ...s, pct: p[0] ? ((p.at(-1) - p[0]) / p[0]) * 100 : 0 }; })} baseLabel={l.change} goodUp />;
  } else body = <BarView items={items} chart={chart} l={l} onOpenLot={onOpenLot} />;

  return (
    <div className="cmp-card">
      <div className="cmp-head">
        <div className="cmp-title">
          <b>{chart.title}</b>
          {chart.valueLabel && <span>{chart.valueLabel}</span>}
        </div>
        {views.length > 1 && (
          <div className="cmp-views" role="tablist">
            {views.map((v) => (
              <button key={v} type="button" role="tab" aria-selected={view === v} className={view === v ? "on" : ""} onClick={() => setView(v)} title={l.views[v]}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{VIEW_ICONS[v]}</svg>
                <span>{l.views[v]}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {/* key — ko'rinish almashganda animatsiya qaytadan o'ynaydi */}
      <div className="cmp-body" key={view}>{body}</div>
      <Foot chart={chart} items={items} series={isSeries && (view === "line" || view === "area") ? series : null} l={l} />
      {rows.length > 0 && (
        <div className="cmp-table-wrap">
          <table className="cmp-table">
            <thead>
              <tr><th />{chart.items.map((x, i) => <th key={i} title={x.label}>{x.label}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}><th>{r.label}</th>{chart.items.map((_, j) => <td key={j}>{r.values[j] || "—"}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
});
