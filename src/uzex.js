// UZEX (O'zbekiston Respublika tovar-xomashyo birjasi) real ma'lumotlari — uzex.uz ochiq sahifalaridan.
// Rasmiy ommaviy API yo'q, shuning uchun:
//   - JSON:  /Quote/GetQuotes (asosiy kotirovkalar), /Quote/GetQuotesDayly (10 kunlik dinamika)
//   - HTML jadvallar: /WeeklyQuotes, /Trade/ContractsSumNew (kotirovkalash varag'i), /Trade/OffersSumNew,
//     /trade/offer/{id} (lot tafsilotlari) — serverda parse qilinadi.
// Saytga ortiqcha yuk tushmasligi uchun hamma narsa keshlanadi.
// Qo'shimcha: O'zbekiston Markaziy banki (cbu.uz) — USD kursi.

import { uzOrg, uzPlace, uzProduct } from "./names.js";

const BASE = "https://uzex.uz";
const UA = "Mozilla/5.0 (compatible; UZEX2/0.2; hackathon MVP)";

const cache = new Map();
async function cached(key, ttl, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < ttl) return hit.v;
  try {
    const v = await fn();
    cache.set(key, { t: Date.now(), v });
    return v;
  } catch (err) {
    if (hit) return hit.v; // tarmoq uzilsa — oxirgi REAL ma'lumot
    throw err;
  }
}
const MIN = 60_000;

async function get(path, { json = false, timeout = 20_000 } = {}) {
  const res = await fetch(BASE + path, {
    signal: AbortSignal.timeout(timeout),
    headers: { "user-agent": UA, accept: json ? "application/json" : "text/html", "accept-language": "uz,ru;q=0.8" },
  });
  if (!res.ok) throw new Error(`uzex.uz ${path} → HTTP ${res.status}`);
  return json ? res.json() : res.text();
}

// ---------- HTML parse yordamchilari ----------
const decode = (s) =>
  String(s ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, x) => String.fromCodePoint(parseInt(x, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
function tableRows(html) {
  return [...html.matchAll(/<tr>\s*(<td[\s\S]*?)<\/tr>/g)].map((r) => [...r[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => decode(m[1])));
}
/** "13 662 785.10", "15 727 470,26", "870000000,0000", "3,62%" → son */
function num(s) {
  if (s == null) return null;
  let t = String(s).replace(/[%\s ]/g, "");
  if (t.includes(",") && t.includes(".")) t = t.replace(/,/g, "");
  else t = t.replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// ---------- normalizatsiya va toifalar ----------
const HOMOGLYPH = { а: "a", е: "e", о: "o", р: "p", с: "c", х: "x", у: "y", к: "k", м: "m", т: "t", і: "i" };
/** Qidiruv uchun: kichik harf, apostroflar bir xil, lotinga o'xshash kirill harflari lotinga. */
export function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[‘’ʻʼ`´]/g, "'")
    .replace(/[аеорсхукмті]/g, (c) => HOMOGLYPH[c])
    .replace(/\s+/g, " ")
    .trim();
}

export const CATEGORIES = [
  { id: "fuel", name: "Yoqilg'i", icon: "⛽", re: /benzin|бензин|dizel|дизел|yoqil|yo'il|топлив|\bgaz\b|газ|mazut|мазут|kerosin|керосин|neft|нефт|motor moy|мотор|sanoat moy|саноат|битум|bitum/i },
  { id: "build", name: "Qurilish", icon: "🧱", re: /sement|цемент|armatura|арматур|shifer|шифер|g'isht|кирпич|beton|бетон|blok|блок|prokat|прокат|klinker|клинкер|shisha|стекл|yog'och|лесо|древес|ohak|известь/i },
  { id: "food", name: "Oziq-ovqat va em", icon: "🌾", re: /bug'doy|пшениц|\bun\b|uni\b|мук|shakar|сахар|yog'i|масло|guruch|рис\b|\bem\b|\bем\b|корм|omuxta|омухта|shrot|шрот|shulxa|шелух|kunjara|\btuz\b|соль|arpa|ячмен|makkajo|кукуруз/i },
  { id: "cotton", name: "Paxta va to'qimachilik", icon: "🧶", re: /paxta|пахта|хлоп|пряж|tola\b|волокн/i },
  { id: "chem", name: "Kimyo va o'g'itlar", icon: "🧪", re: /polietilen|полиэт|полиэтилен|polipropilen|полипроп|oltingugurt|сера\b|ammiak|аммиак|selitra|селитр|sulfat|сульфат|soda|сода|karbamid|карбамид|o'g'it|удобр|kislota|кислот|spirt|спирт|xlor|хлор|gipoxlorit|гипохлорит|aviner|ammofos|ammafos|аммофос|azot|азот|antifriz|антифриз|polielektrolit|kaliy|калий|fosfat|фосфат|superfos|суперфос/i },
  { id: "metal", name: "Metall va oltin", icon: "🥇", re: /oltin|золот|kumush|серебр|\bmis\b|мис\b|медь|меди|katod|катод|alyumin|алюмин|\brux\b|цинк|po'lat|стал|metall|металл/i },
  { id: "coal", name: "Ko'mir", icon: "⛏️", re: /ko'mir|кўмир|угол|уголь|антрацит/i },
];
const OTHER = { id: "other", name: "Boshqa", icon: "📦" };
export function categorize(name) {
  const raw = String(name || "");
  const n = norm(raw);
  const c = CATEGORIES.find((c) => c.re.test(raw) || c.re.test(n));
  if (!c) return OTHER;
  return { id: c.id, name: c.name, icon: c.icon };
}

/** Nomdan o'lchov birligini taxmin qilish (UZEX kotirovkalari odatda 1 tonna uchun). */
function unitFromName(name) {
  const n = norm(name);
  if (/litr/.test(n)) return "litr";
  if (/gramm/.test(n)) return "gramm";
  if (/donasi|\(dona|dona\)/.test(n) || /донаси/i.test(name)) return "dona";
  if (/\(kg\)/.test(n)) return "kg";
  return "tonna";
}
const UNIT_MAP = {
  тонна: "tonna", тн: "tonna", кг: "kg", килограмм: "kg", литр: "litr", декалитр: "dekalitr", штука: "dona", шт: "dona",
  грамм: "gramm", "кубический метр": "m³", "куб.м": "m³", м3: "m³", метр: "metr", "погонный метр": "metr",
  "квадратный метр": "m²", пара: "juft", упаковка: "qadoq", рулон: "rulon", мешок: "qop",
};
export const unitUz = (u) => UNIT_MAP[String(u || "").toLowerCase().trim()] || String(u || "").trim();

/**
 * Oddiy odam uchun tushunarli hisob: "1 qop ≈ ...", "1 litr ≈ ...", "1 kg ≈ ...".
 * pricePerUnit — 1 birlik (unit) narxi so'mda.
 */
export function everydayPrice(name, unit, pricePerUnit) {
  if (!pricePerUnit || unit !== "tonna") return null;
  const raw = String(name);
  const n = norm(raw);
  if (/sement|klinker/.test(n) || /цемент|клинкер/i.test(raw)) return { label: "1 qop (50 kg)", price: Math.round(pricePerUnit / 20) };
  if (/benzin/.test(n) || /бензин/i.test(raw)) return { label: "1 litr (taxminan)", price: Math.round(pricePerUnit / 1350) };
  if (/dizel|yoqilg'isi|yo'ilg'isi/.test(n) || /дизел|топлив/i.test(raw)) return { label: "1 litr (taxminan)", price: Math.round(pricePerUnit / 1190) };
  return { label: "1 kg", price: Math.round(pricePerUnit / 1000) };
}

// O'zbekcha so'z → UZEX lotlari (ruscha nomlar) uchun qidiruv so'zi
const LOT_SYNONYMS = [
  [/sement|tsement/, "портландцемент"], [/benzin/, "бензин"], [/dizel|solyarka/, "дизель"], [/suyultirilgan gaz|propan/, "сжиженный газ"],
  [/tabiiy gaz/, "природный газ"], [/armatura/, "арматура"], [/bug'doy un|\bun\b|\buni\b/, "мука"], [/bug'doy/, "пшеница"],
  [/shakar/, "сахар"], [/paxta yog'|o'simlik yog'|\byog'/, "масло"], [/paxta tola|paxta/, "хлопок"], [/ko'mir/, "уголь"],
  [/shifer/, "шифер"], [/g'isht/, "кирпич"], [/\bmis\b/, "медь"], [/oltin/, "золото"], [/polietilen/, "полиэтилен"],
  [/polipropilen/, "полипропилен"], [/oltingugurt/, "сера"], [/selitra/, "селитра"], [/ammiak/, "аммиак"], [/o'g'it/, "удобрение"],
  [/karbamid/, "карбамид"], [/omuxta em|\bem\b/, "комбикорм"], [/shrot|kunjara/, "шрот"], [/shulxa|sheluxa/, "шелуха"],
  [/guruch/, "рис"], [/\btuz\b/, "соль"], [/soda/, "сода"], [/spirt/, "спирт"], [/mazut/, "мазут"], [/bitum/, "битум"],
  [/yog'och|taxta/, "лес"], [/shisha|oyna/, "стекло"], [/kerosin/, "керосин"], [/motor moy|\bmoy\b/, "масло"], [/metall|prokat/, "прокат"],
  [/ohak/, "известь"], [/beton/, "бетон"], [/makkajo'xori/, "кукуруза"], [/arpa/, "ячмень"],
];
export function lotQuery(q) {
  const n = norm(q);
  for (const [re, ru] of LOT_SYNONYMS) if (re.test(n)) return ru;
  return String(q || "").trim();
}

// ---------- 1) Asosiy kotirovkalar (JSON) ----------
export function getKeyQuotes() {
  return cached("quotes", 10 * MIN, async () => {
    const rows = await get("/Quote/GetQuotes", { json: true });
    return rows.map((r) => {
      const name = String(r.name || "").trim();
      const price = num(r.summa);
      const diff = num(r.difference) ?? 0;
      const pct = Math.abs(num(r.percent) ?? 0) * Math.sign(diff);
      const unit = unitFromName(name);
      return { name, price, change: diff, changePct: pct, unit, category: categorize(name), everyday: everydayPrice(name, unit, price) };
    });
  });
}

// ---------- 2) 10 kunlik dinamika (JSON, tonna narxi ming so'mda) ----------
export function getDaily() {
  return cached("daily", 10 * MIN, async () => {
    const rows = await get("/Quote/GetQuotesDayly", { json: true });
    return rows.map((r) => {
      const name = String(r.name || "").trim();
      const perPiece = /донаси|donasi/i.test(name);
      const k = perPiece ? 1 : 1000;
      const points = (r.points || []).map((p) => Math.round(p * k));
      const first = points[0];
      const last = points.at(-1);
      return {
        name,
        unit: perPiece ? "dona" : "tonna",
        days: r.createdDate || [],
        points,
        price: last,
        changePct: first ? ((last - first) / first) * 100 : 0,
        category: categorize(name),
      };
    });
  });
}

// ---------- 3) Haftalik kotirovkalar (HTML) ----------
export function getWeekly() {
  return cached("weekly", 30 * MIN, async () => {
    const html = await get("/WeeklyQuotes?Length=1000", { timeout: 30_000 });
    return tableRows(html)
      .filter((r) => r.length >= 7)
      .map((r) => {
        const unit = unitFromName(r[1]);
        const price = num(r[2]);
        return {
          name: r[1],
          price,
          change: num(r[3]) ?? 0,
          changePct: num(r[4]) ?? 0,
          week: `${r[5]}–${r[6]}`,
          unit,
          category: categorize(r[1]),
          everyday: everydayPrice(r[1], unit, price),
          _end: dmy(r[6]),
        };
      })
      .sort((a, b) => b._end - a._end); // eng yangi hafta birinchi
  });
}
/** "30.10.2026" → timestamp */
function dmy(s) {
  const m = String(s || "").match(/(\d{2})\.(\d{2})\.(\d{4})/);
  return m ? Date.UTC(+m[3], +m[2] - 1, +m[1]) : 0;
}
export async function searchPrices(q, { category = "", limit = 30 } = {}) {
  let all = await getWeekly();
  if (category) all = all.filter((x) => x.category.id === category);
  const terms = norm(q).split(" ").filter(Boolean);
  const list = terms.length ? all.filter((x) => terms.every((t) => norm(x.name).includes(t))) : all;
  return { total: list.length, items: list.slice(0, limit) };
}

// ---------- 4) Kotirovkalash varag'i: sotuvdagi lotlar (HTML) ----------
const ORG_RE = /\s(?=(?:АО|ООО|OOO|ИП|ЧП|УП|СП|ЧФ|ЧК|ФХ|СК|MChJ|MCHJ|AJ|XK|QK|МЧЖ|АЖ|ХК|«)\s)/;
const SPEC_RE = /^(ГОСТ|ТУ\b|ТШ|O'z|O‘z|Uz|ISO|СТ\b|ОСТ|DSt)/i;
/** "Mahsulot , Sotuvchi" yoki "Mahsulot АО "Sotuvchi" , ГОСТ ..." → [mahsulot, sotuvchi] */
function splitSeller(full) {
  full = String(full || "").trim();
  const k = full.indexOf(" , ");
  let head = full, tail = "";
  if (k > 0) {
    head = full.slice(0, k).trim();
    tail = full.slice(k + 3).trim();
    if (!SPEC_RE.test(tail)) return [head, tail];
  }
  const m = head.split(ORG_RE);
  if (m.length > 1) {
    const product = m[0].trim() + (tail ? ` (${tail})` : "");
    return [product, head.slice(m[0].length).trim()];
  }
  const j = head.indexOf(", ");
  if (j > 0 && !tail) return [head.slice(0, j).trim(), head.slice(j + 2).trim()];
  return [full, ""];
}
/** 1 tonna narxi (birlik tonna yoki kg bo'lsa) — lotlarni solishtirish uchun. */
const perTonne = (unit, perUnit) => (perUnit == null ? null : unit === "tonna" ? perUnit : unit === "kg" ? perUnit * 1000 : null);

function parseLot(r) {
  const [product, seller] = splitSeller(r[1]);
  const qty = num(r[2]);
  const total = num(r[4]);
  const unit = unitUz(r[3]);
  const perUnit = qty ? total / qty : null;
  const pt = perTonne(unit, perUnit);
  return {
    id: r[0],
    product,
    productUz: uzProduct(product), // oddiy o'zbekcha nom (asl ruscha nom — product)
    seller,
    sellerUz: uzOrg(seller),
    qty,
    unit,
    total,
    perUnit,
    perTonne: pt,
    region: r[5],
    regionUz: uzPlace(r[5]),
    category: categorize(product),
    everyday: everydayPrice(product, "tonna", pt),
    url: `${BASE}/trade/offer/${encodeURIComponent(r[0])}`,
  };
}
/**
 * Ba'zi lotlarda bazis narxi "1" kabi to'ldirilmagan qiymat — ularni chiqarib tashlaymiz:
 * bir xil birlikdagi lotlar medianasidan 5 baravar arzon/qimmat bo'lsa, ishonchsiz deb hisoblanadi.
 */
function dropOutliers(list) {
  const key = (x) => (x.perTonne != null ? "t" : x.unit);
  const val = (x) => x.perTonne ?? x.perUnit;
  const groups = {};
  for (const x of list) (groups[key(x)] ||= []).push(val(x));
  const med = {};
  for (const [k, arr] of Object.entries(groups)) {
    const s = arr.filter((v) => v > 0).sort((a, b) => a - b);
    med[k] = s[Math.floor(s.length / 2)];
  }
  return list.filter((x) => {
    const m = med[key(x)];
    const v = val(x);
    return v > 0 && (!m || groups[key(x)].length < 5 || (v > m / 5 && v < m * 5));
  });
}
// Viloyat: o'zbekcha nom → lotlardagi yozilish variantlari (ko'pincha ruscha)
export const REGIONS = [
  ["Toshkent", ["toshkent", "ташкент", "таш "], ["tashkent", "таш обл", "г.таш", "г таш", "ташк"]],
  ["Samarqand", ["samarqand", "самарканд"], ["самарк"]],
  ["Buxoro", ["buxoro", "бухар"], ["бухар"]],
  ["Farg'ona", ["farg'ona", "фергана"], ["ферган", "fargona"]],
  ["Andijon", ["andijon", "андижан"], ["андижан"]],
  ["Namangan", ["namangan", "наманган"], ["наманган"]],
  ["Qashqadaryo", ["qashqadaryo", "кашкадар"], ["кашкадар", "карши", "qarshi"]],
  ["Surxondaryo", ["surxondaryo", "сурхандар"], ["сурхандар", "термез", "termiz"]],
  ["Jizzax", ["jizzax", "джизак"], ["джизак", "жиззах"]],
  ["Sirdaryo", ["sirdaryo", "сырдар"], ["сырдар", "гулистан", "guliston"]],
  ["Navoiy", ["navoiy", "навои"], ["навои"]],
  ["Xorazm", ["xorazm", "хорезм"], ["хорезм", "ургенч", "urganch"]],
  ["Qoraqalpog'iston", ["qoraqalpog'iston", "каракалпак", "nukus"], ["каракалпак", "нукус", "nukus"]],
];
function regionKeys(region) {
  const r = norm(region);
  const hit = REGIONS.find(([uz, alts]) => norm(uz).startsWith(r.slice(0, 5)) || alts.some((a) => r.includes(norm(a).slice(0, 5))));
  return hit ? [...new Set([norm(hit[0]), ...hit[1].map(norm), ...hit[2].map(norm)])] : [r];
}

/** Lotlarni qidirish. q o'zbekcha bo'lsa ham bo'ladi ("sement" → "цемент"). */
export async function searchLots(q, { sort = "new", region = "", limit = 50 } = {}) {
  const term = lotQuery(q);
  if (!term) return { query: "", total: 0, items: [] };
  const rows = await cached(`lots:${term.toLowerCase()}`, 10 * MIN, async () => {
    const html = await get(`/Trade/ContractsSumNew?Length=500&Search=${encodeURIComponent(term)}`, { timeout: 30_000 });
    return tableRows(html).filter((r) => r.length >= 6).map(parseLot);
  });
  // Bekor qilingan ("аннул.") va narxi to'ldirilmagan shartnomalarni chiqarib tashlaymiz
  let list = dropOutliers(rows.filter((x) => x.total > 1000 && !/аннул/i.test(x.product + " " + x.seller)));
  const hidden = rows.length - list.length;
  if (region) {
    const keys = regionKeys(region);
    list = list.filter((x) => keys.some((k) => norm(x.region).includes(k)));
  }
  // Kotirovkalash varag'ida sana yo'q, lekin shartnoma raqami qancha katta bo'lsa — shuncha yangi
  // (eski shartnomalarning bazis narxi eskirgan bo'ladi). Shuning uchun:
  //   "new"   — eng yangilari birinchi (standart)
  //   "cheap" — eng yangi 100 ta ichidan 1 tonna (yoki 1 birlik) narxi eng arzonlari
  const byNew = (a, b) => (Number(b.id) || 0) - (Number(a.id) || 0);
  if (sort === "new" || sort === "cheap") list = [...list].sort(byNew);
  if (sort === "cheap") {
    const g = (x) => (x.perTonne != null ? 0 : 1);
    const v = (x) => x.perTonne ?? x.perUnit ?? Infinity;
    list = list.slice(0, 100).sort((a, b) => g(a) - g(b) || v(a) - v(b));
  }
  return { query: term, total: list.length, hiddenUnreliable: hidden, items: list.slice(0, limit) };
}

// ---------- 5) Lot tafsilotlari (HTML) ----------
const DETAIL_KEYS = {
  "Standart kontraktning raqami": "id", Nomi: "fullName", "O'lchov birligi": "unitRaw", Lot: "qty", Valyuta: "currency",
  "Bazis narxi": "total", "Depozit miqdori": "deposit", "Yetkazib berish bazisi": "deliveryBasis", "Joylashgan joyi": "location",
  "Ishlab chiqaruvchi": "producer", "Shartnoma turi": "contractType", "To'lov shakli": "paymentForm",
  "Yetkazib berish sharti": "deliveryTerm", "To'lov shartlari": "paymentTerm", "QQS to'lovchilari to'g'risida ma'lumot": "vat",
  Qadoqlanishi: "packaging", "Alohida shartlar": "specialTerms",
};
const RU_UZ = { сум: "so'm", внутренний: "ichki", безналичный: "pul o'tkazish (naqd emas)", наличный: "naqd", Узб: "O'zbekiston" };
export function getLot(id) {
  const clean = String(id || "").replace(/[^\w-]/g, "");
  if (!clean) return Promise.reject(new Error("Lot raqami noto'g'ri"));
  return cached(`lot:${clean}`, 30 * MIN, async () => {
    const html = await get(`/trade/offer/${clean}`);
    const d = {};
    for (const r of tableRows(html)) {
      const key = DETAIL_KEYS[r[0]];
      if (key) d[key] = r[1] ?? "";
    }
    if (!d.id) throw new Error("Bunday lot UZEX saytida topilmadi");
    const [product, seller] = splitSeller(d.fullName || "");
    const qty = num(d.qty);
    const total = num(d.total);
    const unit = unitUz(d.unitRaw);
    const depositPct = num(d.deposit);
    const perUnit = qty ? total / qty : null;
    const pt = perTonne(unit, perUnit);
    const tr = (s) => RU_UZ[s] || s;
    return {
      id: d.id,
      product,
      productUz: uzProduct(product),
      seller,
      sellerUz: uzOrg(seller),
      locationUz: uzPlace(d.location),
      unit,
      qty,
      total,
      perUnit,
      perTonne: pt,
      currency: tr(d.currency),
      depositPct,
      depositSum: depositPct != null && total ? Math.round((total * depositPct) / 100) : null,
      deliveryBasis: d.deliveryBasis,
      pickupYourself: /EXW/i.test(d.deliveryBasis || ""),
      location: d.location,
      producer: tr(d.producer),
      contractType: tr(d.contractType),
      paymentForm: tr(d.paymentForm),
      deliveryTerm: d.deliveryTerm,
      paymentTerm: d.paymentTerm,
      vat: (d.vat || "").replace(/Tashkilotingiz QQS.*$/, "").trim(),
      packaging: d.packaging,
      specialTerms: d.specialTerms,
      category: categorize(product),
      everyday: everydayPrice(product, "tonna", pt),
      url: `${BASE}/trade/offer/${clean}`,
    };
  });
}

// ---------- 6) Bugun savdoga qo'yilganlar ----------
export function getTodayOffers() {
  return cached("today", 10 * MIN, async () => {
    const html = await get("/Trade/OffersSumNew?Length=500", { timeout: 30_000 });
    const rows = tableRows(html).filter((r) => r.length >= 9);
    return {
      count: rows.length,
      items: rows.slice(0, 100).map((r) => ({
        id: r[0], name: r[1], auction: r[2], qty: num(r[3]), unit: unitUz(r[4]), startPrice: num(r[5]), contracts: num(r[6]), region: r[7], date: r[8],
      })),
    };
  });
}

// ---------- 7) Markaziy bank kursi ----------
export function getUsdUzs() {
  return cached("usduzs", 60 * MIN, async () => {
    const res = await fetch("https://cbu.uz/uz/arkhiv-kursov-valyut/json/USD/", { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`cbu.uz HTTP ${res.status}`);
    const [row] = await res.json();
    return { rate: Number(row.Rate), date: row.Date, source: "O'zR Markaziy banki" };
  });
}
