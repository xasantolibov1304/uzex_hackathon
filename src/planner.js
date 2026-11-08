// Xaridni rejalashtirish: material hisoblagich, byudjet bo'yicha qidiruv va to'liq xarajat hisobi.
// Hamma raqamlar shu yerda aniq hisoblanadi (LLM "taxmin qilib" hisoblamasin).
import { getLot, getUsdUzs, searchLots, searchPrices } from "./uzex.js";

const round = (n) => (n == null || !Number.isFinite(n) ? null : Math.round(n));
const r2 = (n) => Math.round(n * 100) / 100;

// Birja va broker komissiyalari: haqiqiy stavkalar broker/UZEX bilan aniqlanishi kerak.
// .env da berilsa hisobga qo'shiladi (masalan UZEX_FEE_PCT=0.15, BROKER_FEE_PCT=0.3), aks holda "aniqlanmagan".
const pct = (v) => (v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
export const feeRates = () => ({ exchangePct: pct(process.env.UZEX_FEE_PCT), brokerPct: pct(process.env.BROKER_FEE_PCT) });

// ---------- 1) Material hisoblagich ----------
// Taxminiy normalar: 1 m² umumiy maydon uchun (poydevor, devor qorishmasi, suvoq, styajka, plitalar bilan).
// Bular dastlabki reja uchun o'rtacha qiymatlar; aniq miqdorni loyiha/usta hisoblaydi.
const NORMS = {
  brick: { label: "g'isht devorli uy", cement: [0.1, 0.14], rebar: [0.015, 0.025] },
  block: { label: "blok (gazoblok/shlakoblok) devorli uy", cement: [0.08, 0.12], rebar: [0.015, 0.025] },
  frame: { label: "karkas/monolit beton uy", cement: [0.14, 0.2], rebar: [0.035, 0.05] },
};
// 1 m³ beton uchun sement (tonna) markaga qarab
const CEMENT_PER_M3 = { M150: 0.23, M200: 0.28, M250: 0.32, M300: 0.36, M350: 0.4 };
const SLATE_SHEET_M2 = 1.6; // bitta shifer varag'ining foydali yopish maydoni (taxminan)

export function estimateMaterials({ area_m2, floors = 1, wall_type = "brick", roof = true, concrete_m3, concrete_grade = "M200" } = {}) {
  const items = [];
  const notes = [];
  if (concrete_m3 > 0) {
    const grade = CEMENT_PER_M3[String(concrete_grade).toUpperCase()] ? String(concrete_grade).toUpperCase() : "M200";
    const t = concrete_m3 * CEMENT_PER_M3[grade];
    items.push({ product: "sement", unit: "tonna", min: r2(t), max: r2(t * 1.1), bags50kg: [Math.ceil((t * 1000) / 50), Math.ceil((t * 1.1 * 1000) / 50)] });
    notes.push(`${concrete_m3} m³ beton (${grade}) uchun; +10% zaxira bilan.`);
    return { mode: "concrete", items, notes, searchHint: ["sement"] };
  }
  const area = Number(area_m2);
  if (!(area > 0)) throw new Error("Maydon (area_m2) yoki beton hajmi (concrete_m3) kerak");
  const n = NORMS[wall_type] || NORMS.brick;
  const f = Math.max(1, Math.min(5, Math.round(Number(floors) || 1)));
  const range = ([a, b]) => [r2(area * a), r2(area * b)];
  const [cMin, cMax] = range(n.cement);
  const [rMin, rMax] = range(n.rebar);
  items.push({ product: "sement", unit: "tonna", min: cMin, max: cMax, bags50kg: [Math.ceil((cMin * 1000) / 50), Math.ceil((cMax * 1000) / 50)] });
  items.push({ product: "armatura", unit: "tonna", min: rMin, max: rMax });
  if (roof) {
    const roofArea = (area / f) * 1.35; // nishabli tom: yuqori qavat maydoni × ~1.35
    const sheets = Math.ceil((roofArea / SLATE_SHEET_M2) * 1.05);
    items.push({ product: "shifer", unit: "dona", min: sheets, max: Math.ceil(sheets * 1.1), roofAreaM2: round(roofArea) });
  }
  notes.push(`${area} m² umumiy maydon, ${f} qavat, ${n.label}. O'rtacha qurilish normalari bo'yicha taxminiy oraliq — aniq miqdorni loyiha yoki usta hisoblaydi.`);
  return { mode: "house", items, notes, searchHint: items.map((i) => i.product) };
}

// ---------- 2) Byudjet bo'yicha qidiruv ----------
export async function budgetPlan({ query, budget_som, region = "" }) {
  const budget = Number(budget_som);
  if (!(budget > 0)) throw new Error("Byudjet (so'm) kerak");
  const { exchangePct, brokerPct } = feeRates();
  const feeK = 1 + ((exchangePct || 0) + (brokerPct || 0)) / 100;

  const [lots, market] = await Promise.all([
    searchLots(query, { sort: "cheap", region, limit: 20 }),
    searchPrices(query, { limit: 3 }).catch(() => null),
  ]);
  const quote = market?.items?.[0];
  const options = [];
  let skippedOutdated = 0;
  for (const x of lots.items) {
    if (!x.total || !x.qty) continue;
    // Bozor narxidan 40% dan ko'p arzon bo'lsa — eski shartnoma bo'lishi mumkin, tavsiya qilmaymiz
    const perUnit = x.total / x.qty;
    if (quote?.price && quote.unit === x.unit && perUnit < quote.price * 0.6) { skippedOutdated++; continue; }
    const contracts = Math.floor(budget / (x.total * feeK));
    if (contracts < 1) continue;
    const total = contracts * x.total;
    options.push({
      lot_id: x.id, product: x.product, productUz: x.productUz, seller: x.seller, region: x.region ?? x.location,
      qtyPerContract: x.qty, unit: x.unit, pricePerContract: round(x.total), pricePerUnit: round(perUnit),
      contracts, quantity: r2(contracts * x.qty), totalSom: round(total), leftoverSom: round(budget - total * feeK),
      vsMarketPct: quote?.price && quote.unit === x.unit ? r2(((perUnit - quote.price) / quote.price) * 100) : null,
    });
  }
  options.sort((a, b) => b.quantity - a.quantity || a.pricePerUnit - b.pricePerUnit);
  const cheapestContract = lots.items.filter((x) => x.total).sort((a, b) => a.total - b.total)[0];
  return {
    budgetSom: round(budget),
    feesIncluded: exchangePct != null || brokerPct != null,
    marketPrice: quote ? { name: quote.name, priceSom: round(quote.price), unit: quote.unit } : null,
    options: options.slice(0, 5),
    skippedOutdated,
    note: options.length
      ? "Quantities use the base price; the auction can push the final price higher, so keep a reserve."
      : cheapestContract
        ? `Budget is not enough for even one contract. Cheapest contract: ${round(cheapestContract.total)} so'm (${cheapestContract.qty} ${cheapestContract.unit}).`
        : "No offers found.",
  };
}

// ---------- 3) To'liq xarajat hisobi ----------
export async function costBreakdown({ lot_id, contracts, needed_qty }) {
  const lot = await getLot(lot_id);
  const n = Math.max(1, Math.floor(Number(contracts) || 1));
  const usd = await getUsdUzs().catch(() => null);
  const { exchangePct, brokerPct } = feeRates();
  const base = lot.total * n;
  const exchangeFee = exchangePct != null ? base * (exchangePct / 100) : null;
  const brokerFee = brokerPct != null ? base * (brokerPct / 100) : null;
  const knownTotal = base + (exchangeFee || 0) + (brokerFee || 0);
  const quantity = lot.qty * n;
  const need = Number(needed_qty) > 0 ? Number(needed_qty) : null;
  return {
    lot_id: lot.id, product: lot.product, seller: lot.seller, unit: lot.unit,
    contracts: n, quantity: r2(quantity),
    surplus: need && quantity > need ? r2(quantity - need) : 0,
    shortfall: need && quantity < need ? r2(need - quantity) : 0,
    lines: {
      basePriceSom: round(base),
      pricePerUnitSom: round(lot.perUnit),
      everyday: lot.everyday, // masalan 1 qop (50 kg) yoki 1 litr narxi
      depositPct: lot.depositPct,
      depositSom: lot.depositPct != null ? round((base * lot.depositPct) / 100) : null,
      exchangeFeeSom: round(exchangeFee),
      brokerFeeSom: round(brokerFee),
      feesNote: exchangePct == null && brokerPct == null ? "Exchange and broker fees are NOT included — the exact rates must be confirmed with the broker." : null,
      totalKnownSom: round(knownTotal),
      totalUsd: usd?.rate ? round(knownTotal / usd.rate) : null,
      ifAuctionPlus5PctSom: round(knownTotal * 1.05),
      ifAuctionPlus10PctSom: round(knownTotal * 1.1),
      vat: lot.vat || null,
    },
    delivery: { basis: lot.deliveryBasis, pickupYourself: lot.pickupYourself, warehouse: lot.location, note: lot.pickupYourself ? "EXW: transport from the seller's warehouse is NOT included." : null },
    payment: { form: lot.paymentForm, term: lot.paymentTerm },
    explain: "The deposit is part of the price, blocked before trading (returned if you do not win). The auction can raise the final price above the base price.",
  };
}
