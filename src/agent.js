// UZEX 2.0 — avtonom agent (Google Gemini + UZEX tool'lari).
// Foydalanuvchi "vazifa" beradi, agent o'zi: narxlarni tekshiradi → lot tanlaydi → hisoblaydi → profilni tekshiradi
// → buyurtma tayyorlaydi. Pul bilan bog'liq yagona qadam — foydalanuvchi "Tasdiqlash" tugmasini bosadi.
// Har bir qadam emit() orqali UI'ga jonli (SSE) uzatiladi.
import { ApiError, GoogleGenAI } from "@google/genai";
import crypto from "node:crypto";
import { CATEGORIES, REGIONS, getDaily, getKeyQuotes, getLot, getTodayOffers, getUsdUzs, norm, searchLots, searchPrices } from "./uzex.js";
import { ENTITY_TYPES, cancelOrder, createOrder, getOrder, getProfile, listOrders, saveProfile, tradingStatus } from "./store.js";
import { budgetPlan, costBreakdown, estimateMaterials } from "./planner.js";

const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";
const MAX_STEPS = 12;
const SESSION_TTL = 6 * 60 * 60_000;

const apiKey = () => process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
let client;
function getClient() {
  if (!apiKey()) throw new Error("NO_KEY");
  client ??= new GoogleGenAI({ apiKey: apiKey() });
  return client;
}
export const agentConfigured = () => Boolean(apiKey());

const LANG = { uz: "Uzbek (Latin script)", ru: "Russian", en: "English" };

const SYSTEM = `You are "UZEX 2.0", an AUTONOMOUS purchasing agent for UZEX (O'zbekiston Respublika tovar-xomashyo birjasi — the Uzbek commodity exchange, uzex.uz). Your users are ordinary people who know nothing about exchanges. They give you a TASK in plain words or by voice ("Toshkentda uy qurish uchun 20 tonna sement kerak"). Do the whole job yourself, end to end, with your tools — the user should not have to do the steps.

How to work on a task:
1. Understand what, how much, where and any preference (cheapest, nearest, a specific seller). Fill gaps with sensible defaults instead of asking: region → the profile's region if known, otherwise all regions; preference → a good price among the newest offers, close to the user.
2. Check the market price (search_prices, get_overview or get_price_trend) so you can judge whether a lot is fair.
3. Find offers (search_lots, sort "new"; also try "cheap" when price matters; use the region filter). Lot qty = amount in ONE contract, pricePerContract = price of ONE contract.
4. Pick the best lot and verify it with get_lot (deposit %, delivery, warehouse). Prefer lots priced near the current market quote; old contracts can have outdated prices — skip ones far from the market.
5. Compute contracts = ceil(needed quantity / qty per contract). Mention any surplus.
6. Check get_profile. If anything is missing, call request_form with purpose "profile" — the app shows a form with a separate input for every field. Do NOT list the fields or ask for them in your text; just write one short sentence like "Buyurtma uchun ma'lumotlaringizni formaga kiriting", then stop and wait. When you receive "[FORM ... profile]", the profile is already saved: call get_profile and continue the original task automatically (create_order) without asking again.
Whenever you need several pieces of information from the user (quantity, region, preferences…), use request_form with purpose "other" and one field per item instead of asking in prose. Answers arrive as "[FORM <id>] {json}".
6b. Who can buy: get_profile returns eligibility. If the buyer is an individual (entityType "jismoniy", canTradeDirectly false), do NOT prepare the order straight away. In one or two plain sentences explain that individuals cannot trade on UZEX directly, and offer the two options with request_form (purpose "other", one select field "Qanday davom etamiz?" with options like "Litsenziyali broker orqali xarid qilaman" and "YaTT sifatida ro'yxatdan o'taman"). Broker → create_order with via_broker: true and say the application will go to a broker. YaTT → request_form purpose "profile" so they set entity type YaTT and STIR, then continue. Mention briefly that this rule should be confirmed with UZEX or a broker.
7. Call create_order exactly once. The app then shows a confirmation card; the user presses "Tasdiqlash". Never say the order was sent before confirmation.
8. When you receive "[SYSTEM] Buyurtma ... tasdiqlandi", call get_orders and give a short final summary: what was ordered, total and deposit, trading day, demo reference, and what happens next.
Only ask questions when you truly cannot proceed (for example the product is ambiguous between very different goods). Do not ask permission between steps — just do them.

Planning tools (use them instead of doing math in your head):
- The user describes a project, not a quantity ("100 m² uy quryapman", "12 kub beton quyaman") → estimate_materials first. Say clearly it is a rough estimate by average norms and a builder should confirm. Then, if they want to buy, continue the normal buying flow for each material (one order per product).
- The user gives a budget ("50 million so'mim bor") → budget_plan. Skip options whose product is clearly a different good (e.g. clinker when they want cement) or priced far below the market (vsMarketPct strongly negative = likely an old contract).
- Before create_order, or whenever the user asks "jami qancha?", "hammasi bilan qancha to'layman?" → cost_breakdown for the chosen lot and contracts. Mention the deposit, that fees are not included unless shown, that EXW means transport is extra, and that the auction can raise the price.
Changing orders:
- "Make it 15 tonnes", "2 ta lot qil" → update_order (only for orders still awaiting confirmation; it shows a new confirmation card).
- "Cancel it", "bekor qil" → cancel_order. A draft (awaiting confirmation) is cancelled right away. An order already sent (submitted) needs the user's explicit "yes" in a NEW message: first call without confirmed, ask "Rostdan bekor qilaymi?", and only after they agree call again with confirmed: true. Never set confirmed: true on your own.
Use get_orders to find the order_id when the user says "the last order" / "that order".

Facts about UZEX buying (explain simply when useful; exact fees and requirements must be confirmed with UZEX or a broker): sellers list standard contracts (lots) with a base price ("bazis narx"); trading days are Mon–Fri; the auction can push the final price above the base price; a deposit (% of the lot price) is blocked before trading; payments are cashless; buyers usually participate through a licensed broker; "EXW" = the buyer collects from the seller's warehouse. In this app, sending the order to the exchange is a DEMO (UZEX has no public order API yet) — say so honestly if asked.

Trading days: each message carries [today:…]. If there is NO trading today, say so in one short phrase when it matters (prices or offers questions, preparing an order): prices are from the last trading day, and an order goes to the next trading day (give the weekday). Do not repeat it in every reply of the same conversation.

Data honesty: all numbers come from tools (live uzex.uz data). Never invent prices, lots, sellers or results. If a tool fails, say so.

Product names: UZEX lists products in Russian. Tools also give productUz / sellerUz / regionUz — plain Uzbek versions. In Uzbek replies always name products with productUz (e.g. "Portlandsement, qog'oz qoplarda"), never paste the long Russian name; in Russian replies use the original name.

Reply language: ALWAYS reply in the language the user actually wrote their latest message in — Uzbek (always in Latin script, even if they wrote in Cyrillic), Russian or English. The [lang:xx] tag is only the app's interface setting; it does NOT decide your reply language. Use it only when the message language is unclear (just numbers, a product name, a "[FORM …]" or "[SYSTEM] …" message) — and even then prefer the language the user has been writing in during this conversation. Form titles and labels you create follow the same rule.

Reply style: every final reply has TWO parts:

1. SPOKEN line, wrapped in <<say>>…<</say>>. This is the ONLY part read aloud. Talk like a friendly person on the phone, not like a report: 1–2 short sentences, at most ~25 words. Give the one thing that matters most (the answer, the price, or what the user must do next). Say numbers the way people say them out loud, rounded ("o'ttiz bir million so'm atrofida", "taxminan 6 million"), never digit strings, lot numbers, IDs, percentages with decimals, markdown or lists. Use natural spoken words ("Topdim!", "Yaxshi xabar:", "Bir muammo bor:"). If there are details below, you may end with a short pointer like "Tafsilotlarni pastga yozdim."
2. DETAILS for the chat (not read aloud), after the spoken line. Here put the exact numbers and facts: lot, seller, price per unit, total, deposit, delivery, surplus, risks, next steps. Short lines, "- " bullets, **bold** for key numbers; no tables or headings. Money in so'm with spaces ("6 200 000 so'm"), with everyday equivalents when helpful (per 50 kg bag, per litre, per kg). Explain an exchange term in a few words when you use it. Skip details entirely if the spoken line already says everything (e.g. a greeting or a one-line answer). Do not repeat the spoken line in the details.

Start EVERY final reply with a mood tag: <<calm>>, <<happy>>, <<excited>> or <<concerned>> (concerned = a problem, missing data or risk; happy/excited = order ready or confirmed). Example:
<<happy>><<say>>Topdim! Toshkentda yigirma tonna sement o'ttiz bir million so'm atrofida. Tafsilotlarni pastga yozdim.<</say>>
- Lot **№123456**, "Qizilqumsement" · 1 lot = 20 t
- Narx: **1 550 000 so'm/t** (50 kg qop ≈ 77 500 so'm)
- Jami: **31 000 000 so'm**, depozit 5% — 1 550 000 so'm

Regions: ${REGIONS.map((r) => r[0]).join(", ")}. Categories: ${CATEGORIES.map((c) => c.id + "=" + c.name).join(", ")}.`;

const fd = (name, description, props, required) =>
  props
    ? { name, description, parametersJsonSchema: { type: "object", properties: props, required: required ?? Object.keys(props), additionalProperties: false } }
    : { name, description };

const functionDeclarations = [
  fd("get_overview", "Main UZEX quotes now (price per unit, change %), whether lots are put up for trading today, USD rate, current date in Tashkent."),
  fd("search_prices", "Search UZEX weekly quotes (~1000 goods) by Uzbek Latin name, e.g. 'sement', 'benzin', 'bug'doy'. Current market price per unit.", {
    query: { type: "string" },
    category: { type: "string", enum: CATEGORIES.map((c) => c.id) },
  }, ["query"]),
  fd("get_price_trend", "Prices for each of the last 10 trading days for key goods (cement, rebar, fuels, oils, feed, plastics, gas, coal, slate).", { query: { type: "string" } }),
  fd("search_lots", "Search the UZEX quotation sheet for lots of a product (Uzbek or Russian query). Returns lot_id, product, seller, qty per contract, price per contract, price per tonne, warehouse region.", {
    query: { type: "string" },
    region: { type: "string", description: "Optional region, e.g. 'Toshkent'" },
    sort: { type: "string", enum: ["new", "cheap"], description: "new (default) = newest contracts; cheap = cheapest among the newest 100" },
  }, ["query"]),
  fd("get_lot", "Full details of one lot: deposit %, deposit sum, delivery basis, warehouse, producer, payment form, packaging, special conditions.", { lot_id: { type: "string" } }),
  fd("get_profile", "The buyer's saved profile and which fields are still missing for an order."),
  fd("save_profile", "Save buyer details the user told you. entityType: jismoniy | yatt | yuridik. tin (STIR, 9 digits) only for yatt/yuridik.", {
    fullName: { type: "string" },
    entityType: { type: "string", enum: Object.keys(ENTITY_TYPES) },
    tin: { type: "string" },
    phone: { type: "string" },
    region: { type: "string" },
  }, []),
  fd("create_order", "Create the purchase order for a lot. The app shows the user a confirmation card; it is sent to the exchange (demo) only after the user presses 'Tasdiqlash'. Requires a complete profile.", {
    lot_id: { type: "string" },
    contracts: { type: "integer", minimum: 1, maximum: 1000 },
    reason: { type: "string", description: "1-2 sentences in the user's language: why this lot and how the amount was computed" },
    via_broker: { type: "boolean", description: "true when an individual (jismoniy shaxs) chose to buy through a licensed broker" },
  }, ["lot_id", "contracts", "reason"]),
  fd("get_orders", "The user's orders with status (awaiting_confirmation, submitted, cancelled), totals, deposit, trading day, demo reference."),
  fd("request_form", "Show the user a form (one input per field) to collect information. purpose 'profile' = buyer details (the app builds the fields itself; pass fields: []). purpose 'other' = your own fields. After calling, stop and wait for '[FORM ...]'.", {
    purpose: { type: "string", enum: ["profile", "other"] },
    title: { type: "string", description: "Short form title in the user's language" },
    fields: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string" },
          label: { type: "string" },
          type: { type: "string", enum: ["text", "number", "tel", "select"] },
          options: { type: "array", items: { type: "string" } },
          placeholder: { type: "string" },
          required: { type: "boolean" },
        },
        required: ["key", "label", "type"],
      },
    },
  }, ["purpose", "title", "fields"]),
  fd("estimate_materials", "Rough material estimate for a building project from average construction norms: cement (tonnes + 50 kg bags), rebar (tonnes), slate sheets for the roof. Either area_m2 (total floor area) with floors and wall_type, or concrete_m3 for a concrete pour.", {
    area_m2: { type: "number", description: "Total floor area in m²" },
    floors: { type: "integer", minimum: 1, maximum: 5 },
    wall_type: { type: "string", enum: ["brick", "block", "frame"], description: "brick = g'isht, block = gazoblok/shlakoblok, frame = karkas/monolit" },
    roof: { type: "boolean", description: "Include slate roof (default true)" },
    concrete_m3: { type: "number", description: "Concrete volume in m³ (instead of area)" },
    concrete_grade: { type: "string", enum: ["M150", "M200", "M250", "M300", "M350"] },
  }, []),
  fd("budget_plan", "Given a budget in so'm, find how much of a product it buys on UZEX: best lots (cheapest among the newest), contracts affordable, quantity, leftover money, and how each price compares with the market quote.", {
    query: { type: "string", description: "Product in Uzbek, e.g. 'sement'" },
    budget_som: { type: "number" },
    region: { type: "string", description: "Optional region, e.g. 'Toshkent'" },
  }, ["query", "budget_som"]),
  fd("cost_breakdown", "Full cost of buying a lot: base price, price per unit and per everyday unit (bag/litre/kg), deposit, exchange/broker fees (if configured), total in so'm and USD, auction +5%/+10% scenarios, VAT, delivery (EXW = transport extra), payment terms, surplus/shortfall vs needed quantity.", {
    lot_id: { type: "string" },
    contracts: { type: "integer", minimum: 1, maximum: 1000 },
    needed_qty: { type: "number", description: "Optional: how much the user actually needs, to show surplus/shortfall" },
  }, ["lot_id", "contracts"]),
  fd("update_order", "Change the number of contracts of an order that is still awaiting confirmation. Shows a new confirmation card.", {
    order_id: { type: "string" },
    contracts: { type: "integer", minimum: 1, maximum: 1000 },
  }),
  fd("cancel_order", "Cancel an order. Drafts (awaiting confirmation) are cancelled immediately. Orders already submitted need confirmed: true, which you may set ONLY after the user explicitly agreed in a new message.", {
    order_id: { type: "string" },
    confirmed: { type: "boolean" },
  }, ["order_id"]),
];

/** Profil formasi — maydonlar server tomonidan belgilanadi, mavjud qiymatlar oldindan to'ldiriladi. */
function profileForm(title) {
  const p = getProfile();
  return {
    id: "f_" + crypto.randomBytes(4).toString("hex"),
    purpose: "profile",
    title: title || "Xaridor ma'lumotlari",
    fields: [
      { key: "fullName", label: "F.I.Sh yoki korxona nomi", type: "text", required: true, placeholder: "Ali Valiyev", value: p.fullName || "" },
      {
        key: "entityType", label: "Maqomi", type: "select", required: true, value: p.entityType || "",
        options: Object.entries(ENTITY_TYPES).map(([value, label]) => ({ value, label })),
        notes: { jismoniy: "Diqqat: UZEX qoidalariga ko'ra jismoniy shaxslar birjada bevosita savdo qilmaydi — xarid litsenziyali broker orqali yoki YaTT sifatida amalga oshiriladi. Agent ikkala yo'lni tushuntiradi." },
      },
      { key: "tin", label: "STIR", type: "text", required: false, placeholder: "9 ta raqam (YaTT / yuridik shaxs uchun)", value: p.tin || "", showIf: { entityType: ["yatt", "yuridik"] } },
      { key: "phone", label: "Telefon", type: "tel", required: true, placeholder: "+998 90 123 45 67", value: p.phone || "" },
      { key: "region", label: "Hudud", type: "select", required: true, value: p.region || "", options: REGIONS.map((r) => ({ value: r[0], label: r[0] })) },
    ],
    missing: p.missing,
  };
}

// Foydalanuvchiga ko'rinadigan qadam nomlari
function stepLabel(name, a = {}) {
  switch (name) {
    case "get_overview": return "Birjadagi umumiy holat va asosiy narxlarni ko'ryapman";
    case "search_prices": return `“${a.query}” bo'yicha birja narxlarini tekshiryapman`;
    case "get_price_trend": return `“${a.query}” narxining 10 kunlik dinamikasini ko'ryapman`;
    case "search_lots": return `UZEX'da “${a.query}” takliflarini qidiryapman${a.region ? ` · ${a.region}` : ""}${a.sort === "cheap" ? " · eng arzonlari" : ""}`;
    case "get_lot": return `Lot №${a.lot_id} shartlarini o'qiyapman`;
    case "get_profile": return "Xaridor ma'lumotlarini tekshiryapman";
    case "save_profile": return "Ma'lumotlaringizni saqlayapman";
    case "create_order": return `Buyurtma va arizani tayyorlayapman · lot №${a.lot_id} × ${a.contracts}`;
    case "get_orders": return "Buyurtma holatini tekshiryapman";
    case "request_form": return a.purpose === "profile" ? "Xaridor ma'lumotlari uchun forma tayyorlayapman" : "Kerakli ma'lumotlar uchun forma tayyorlayapman";
    case "estimate_materials": return a.concrete_m3 ? `${a.concrete_m3} m³ beton uchun materialni hisoblayapman` : `${a.area_m2 ?? "?"} m² uy uchun kerakli materiallarni hisoblayapman`;
    case "budget_plan": return `${somFmt(a.budget_som)} byudjetga “${a.query}” qancha kelishini hisoblayapman${a.region ? ` · ${a.region}` : ""}`;
    case "cost_breakdown": return `Lot №${a.lot_id} × ${a.contracts} uchun to'liq xarajatni hisoblayapman`;
    case "update_order": return `Buyurtmani o'zgartiryapman · ${a.contracts} lot`;
    case "cancel_order": return "Buyurtmani bekor qilyapman";
    default: return name;
  }
}
// Qadam tugagach — o'tgan zamonda ("qidiryapman" → "qidirdim")
function stepDoneLabel(name, a = {}) {
  switch (name) {
    case "get_overview": return "Birjadagi umumiy holat va asosiy narxlarni ko'rib chiqdim";
    case "search_prices": return `“${a.query}” bo'yicha birja narxlarini tekshirdim`;
    case "get_price_trend": return `“${a.query}” narxining 10 kunlik dinamikasini ko'rdim`;
    case "search_lots": return `UZEX'da “${a.query}” takliflarini qidirdim${a.region ? ` · ${a.region}` : ""}${a.sort === "cheap" ? " · eng arzonlari" : ""}`;
    case "get_lot": return `Lot №${a.lot_id} shartlarini o'qib chiqdim`;
    case "get_profile": return "Xaridor ma'lumotlarini tekshirdim";
    case "save_profile": return "Ma'lumotlaringizni saqladim";
    case "create_order": return `Buyurtma va arizani tayyorladim · lot №${a.lot_id} × ${a.contracts}`;
    case "get_orders": return "Buyurtma holatini tekshirdim";
    case "request_form": return "Forma tayyor — to'ldirishingizni kutyapman";
    case "estimate_materials": return a.concrete_m3 ? `${a.concrete_m3} m³ beton uchun materialni hisobladim` : `${a.area_m2 ?? "?"} m² uy uchun materiallarni hisobladim`;
    case "budget_plan": return `${somFmt(a.budget_som)} byudjetga “${a.query}” qancha kelishini hisobladim`;
    case "cost_breakdown": return `Lot №${a.lot_id} × ${a.contracts} uchun to'liq xarajatni hisobladim`;
    case "update_order": return `Buyurtmani o'zgartirdim · ${a.contracts} lot`;
    case "cancel_order": return "Buyurtma bo'yicha so'rovni bajardim";
    default: return stepLabel(name, a);
  }
}

const somFmt = (n) => (n == null ? "—" : Math.round(n).toLocaleString("en-US").replace(/,/g, " ") + " so'm");
function stepDetail(name, r) {
  if (!r) return "";
  switch (name) {
    case "search_prices": {
      if (!r.found) return "Birja kotirovkalarida topilmadi";
      const it = r.items[0];
      const ch = it?.weeklyChangePct ? ` · haftada ${it.weeklyChangePct > 0 ? "+" : ""}${Number(it.weeklyChangePct).toFixed(1)}%` : "";
      return `${r.found} ta kotirovka · ${it?.name}: ${somFmt(it?.priceSom)}/${it?.unit}${ch}`;
    }
    case "search_lots": {
      if (!r.found) return "Mos taklif topilmadi";
      const priced = r.items.filter((x) => x.pricePerTonne);
      const best = priced.sort((a, b) => a.pricePerTonne - b.pricePerTonne)[0];
      const sellers = new Set(r.items.map((x) => x.seller).filter(Boolean)).size;
      return `${r.found} ta taklif · ${sellers} ta sotuvchi${best ? ` · eng arzoni ${somFmt(best.pricePerTonne)}/t` : ""}`;
    }
    case "get_lot": return `${r.seller || r.product} · 1 lot = ${r.qtyPerContract} ${r.unit} · ${somFmt(r.pricePerContract)} · depozit ${r.depositPct ?? "—"}%${r.deliveryBasis ? ` · ${r.deliveryBasis}` : ""}`;
    case "get_profile": return r.complete ? `${r.fullName} · ${r.entityTypeLabel}` : `Yetishmayapti: ${r.missing.join(", ")}`;
    case "save_profile": return r.complete ? "Profil to'liq" : `Hali yetishmayapti: ${r.missing.join(", ")}`;
    case "create_order": return `${r.contracts} lot · ${somFmt(r.totalSom)} · tasdiqlash kutilmoqda`;
    case "get_price_trend": return r.items?.length ? `${r.items[0].name}: ${r.items[0].changePct10d}% (10 kun)` : "Ma'lumot yo'q";
    case "get_overview": return r.usdToUzs ? `${r.quotes.length} ta asosiy kotirovka · 1$ = ${Math.round(r.usdToUzs)} so'm` : "";
    case "get_orders": return `${r.orders.length} ta buyurtma`;
    case "estimate_materials":
      return r.items.map((i) => `${i.product}: ${i.min === i.max ? i.min : `${i.min}–${i.max}`} ${i.unit === "tonna" ? "t" : i.unit}${i.bags50kg ? ` (${i.bags50kg[0]}–${i.bags50kg[1]} qop)` : ""}`).join(" · ");
    case "budget_plan": {
      const o = r.options?.[0];
      return o ? `${r.options.length} ta variant · eng ko'pi: ${o.quantity} ${o.unit === "tonna" ? "t" : o.unit} (${o.contracts} lot) · qoldiq ${somFmt(o.leftoverSom)}` : "Byudjet yetmaydi yoki taklif topilmadi";
    }
    case "cost_breakdown": {
      const l = r.lines;
      return `Jami ${somFmt(l.totalKnownSom)}${l.totalUsd ? ` (~$${l.totalUsd.toLocaleString("en-US")})` : ""} · depozit ${somFmt(l.depositSom)} · auksionda +10% bo'lsa ${somFmt(l.ifAuctionPlus10PctSom)}`;
    }
    case "update_order": return r.error ? r.error : `${r.contracts} lot · ${somFmt(r.totalSom)} · yangi tasdiqlash kartasi`;
    case "cancel_order": return r.status === "needs_confirmation" ? "Tasdiqlash kerak — buyurtma allaqachon yuborilgan" : r.status === "cancelled" ? "Buyurtma bekor qilindi" : "";
    default: return "";
  }
}

const round = (n) => (n == null ? null : Math.round(n));
const slimLot = (x) => ({
  lot_id: x.id, product: x.product, productUz: x.productUz, seller: x.seller, sellerUz: x.sellerUz, qtyPerContract: x.qty, unit: x.unit, pricePerContract: round(x.total),
  pricePerTonne: round(x.perTonne), pricePerUnit: round(x.perUnit), region: x.region ?? x.location, regionUz: x.regionUz ?? x.locationUz, everyday: x.everyday,
});

async function runTool(name, a, emit) {
  switch (name) {
    case "get_overview": {
      const [quotes, today, usd] = await Promise.all([getKeyQuotes(), getTodayOffers().catch(() => null), getUsdUzs().catch(() => null)]);
      return {
        quotes: quotes.map((q) => ({ name: q.name, priceSom: round(q.price), unit: q.unit, changePct: +q.changePct.toFixed(2), everyday: q.everyday })),
        lotsPutUpToday: today?.count ?? "unknown",
        usdToUzs: usd?.rate ?? null,
        nowTashkent: new Date().toLocaleString("en-GB", { timeZone: "Asia/Tashkent", weekday: "long", day: "numeric", month: "long", year: "numeric" }),
        trading: tradingStatus(),
      };
    }
    case "search_prices": {
      const r = await searchPrices(a.query || "", { category: a.category || "", limit: 12 });
      return { found: r.total, items: r.items.map((x) => ({ name: x.name, priceSom: round(x.price), unit: x.unit, weeklyChangePct: x.changePct, week: x.week, everyday: x.everyday })) };
    }
    case "get_price_trend": {
      const all = await getDaily();
      const q = norm(a.query);
      const ru = { sement: "цемент", benzin: "бензин", dizel: "дизел", armatura: "арматур", gaz: "газ", "ko'mir": "кўмир", shifer: "шифер", shrot: "шрот", em: "ем", polietilen: "полиэтилен", polipropilen: "полипропилен", "paxta yog'": "пахта", moy: "мой" };
      const key = norm(Object.entries(ru).find(([k]) => q.includes(k))?.[1] || q);
      const items = all.filter((x) => norm(x.name).includes(key));
      return items.length
        ? { items: items.map((x) => ({ name: x.name, unit: x.unit, days: x.days, pricesSom: x.points, changePct10d: +x.changePct.toFixed(2) })) }
        : { items: [], note: "No 10-day series. Available: " + all.map((x) => x.name).join(", ") };
    }
    case "search_lots": {
      const r = await searchLots(a.query, { region: a.region || "", sort: a.sort === "cheap" ? "cheap" : "new", limit: 8 });
      const items = r.items.map(slimLot);
      if (items.length) emit({ type: "lots", query: a.query, items: items.slice(0, 4) });
      return { searchedFor: r.query, found: r.total, items };
    }
    case "get_lot": {
      const l = await getLot(a.lot_id);
      return { ...slimLot(l), depositPct: l.depositPct, depositSom: l.depositSum, deliveryBasis: l.deliveryBasis, warehouse: l.location, producer: l.producer, paymentForm: l.paymentForm, packaging: l.packaging, specialConditions: l.specialTerms, url: l.url };
    }
    case "get_profile":
      return getProfile();
    case "save_profile": {
      const p = saveProfile(a);
      emit({ type: "profile", profile: p });
      return p;
    }
    case "create_order": {
      const o = await createOrder({ lotId: a.lot_id, contracts: a.contracts, reason: a.reason, viaBroker: a.via_broker === true });
      emit({ type: "order", order: o });
      return { order_id: o.id, status: o.status, contracts: o.contracts, quantity: o.quantity, unit: o.unit, totalSom: o.total, depositPct: o.depositPct, depositSom: o.depositSum, tradingDate: o.tradingDate, note: "Confirmation card shown. Waiting for the user to press Tasdiqlash." };
    }
    case "request_form": {
      const form = a.purpose === "profile"
        ? profileForm(a.title)
        : {
            id: "f_" + crypto.randomBytes(4).toString("hex"),
            purpose: "other",
            title: String(a.title || "Ma'lumot kerak").slice(0, 120),
            fields: (Array.isArray(a.fields) ? a.fields : []).slice(0, 10).map((f) => ({
              key: String(f.key || "").replace(/[^\w]/g, "").slice(0, 40) || "field",
              label: String(f.label || f.key || "").slice(0, 80),
              type: ["text", "number", "tel", "select"].includes(f.type) ? f.type : "text",
              options: Array.isArray(f.options) ? f.options.slice(0, 20).map((o) => ({ value: String(o), label: String(o) })) : undefined,
              placeholder: f.placeholder ? String(f.placeholder).slice(0, 80) : "",
              required: f.required !== false,
              value: "",
            })),
          };
      if (!form.fields.length) throw new Error("Form has no fields");
      emit({ type: "form", form });
      return { status: "form_shown", form_id: form.id, note: "The form is on screen. Stop now and wait for the user to submit it. Do not repeat the fields in text." };
    }
    case "get_orders":
      return { orders: listOrders().slice(0, 10).map((o) => ({ order_id: o.id, product: o.product, lot_id: o.lotId, contracts: o.contracts, quantity: o.quantity, unit: o.unit, totalSom: o.total, depositSom: o.depositSum, status: o.status, tradingDate: o.tradingDate, demoRef: o.exchangeRef || null })) };
    case "estimate_materials":
      return estimateMaterials(a);
    case "budget_plan":
      return budgetPlan(a);
    case "cost_breakdown":
      return costBreakdown(a);
    case "update_order": {
      const old = getOrder(a.order_id);
      if (old.status !== "awaiting_confirmation") {
        return { error: old.status === "submitted" ? "This order was already submitted and cannot be changed. Offer to cancel it and prepare a new one." : "This order is cancelled. Prepare a new order instead." };
      }
      // Eski qoralama o'chirilmaydi, "bekor qilingan" bo'ladi — ekrandagi eski kartochka ham shunga yangilanadi
      emit({ type: "order", order: cancelOrder(old.id), replaced: true });
      const o = await createOrder({ lotId: old.lotId, contracts: a.contracts, reason: old.reason, viaBroker: old.viaBroker });
      emit({ type: "order", order: o });
      return { order_id: o.id, previous_order_id: old.id, contracts: o.contracts, quantity: o.quantity, unit: o.unit, totalSom: o.total, depositSom: o.depositSum, note: "New confirmation card shown; the old draft was replaced." };
    }
    case "cancel_order": {
      const o = getOrder(a.order_id);
      if (o.status === "cancelled") return { status: "cancelled", note: "Already cancelled." };
      if (o.status === "submitted" && a.confirmed !== true) {
        return { status: "needs_confirmation", note: "Order was already sent (demo). Ask the user to confirm the cancellation in a new message, then call again with confirmed: true." };
      }
      const c = cancelOrder(o.id);
      emit({ type: "order", order: c });
      return { status: c.status, order_id: c.id, product: c.product };
    }
    default:
      throw new Error(`Unknown tool ${name}`);
  }
}

// sessionId → { contents, touched, busy }. Tarix append-only (thought signature'lar saqlanadi).
const sessions = new Map();
function session(id) {
  const now = Date.now();
  for (const [k, s] of sessions) if (now - s.touched > SESSION_TTL) sessions.delete(k);
  let s = sessions.get(id);
  if (!s) sessions.set(id, (s = { contents: [], touched: now, busy: false }));
  s.touched = now;
  return s;
}
export const resetSession = (id) => sessions.delete(id);

/**
 * Vazifani bajaradi. emit(event) — UI uchun jonli hodisalar:
 *  {type:"thinking"} {type:"step", id, label, status:"running"|"done"|"error", detail}
 *  {type:"lots", items} {type:"order", order} {type:"profile", profile} {type:"reply", text, mood}
 */
export async function runTask({ sessionId, text, lang = "uz", screen = "" }, emit) {
  const s = session(sessionId);
  if (s.busy) throw Object.assign(new Error("BUSY"), { code: "BUSY" });
  s.busy = true;
  const checkpoint = s.contents.length;
  try {
    const ts = tradingStatus();
    const day = `[today:${ts.today}, ${ts.isTradingDay ? "trading day" : "NO trading today (weekend)"}, next trading day:${ts.nextTradingDay}]`;
    const tag = `[lang:${LANG[lang] ? lang : "uz"}] ${day}${screen ? ` [screen:${screen}]` : ""}`;
    s.contents.push({ role: "user", parts: [{ text: `${tag}\n${text}` }] });
    let reply = "";
    let stepNo = 0;
    for (let i = 0; i < MAX_STEPS; i++) {
      emit({ type: "thinking" });
      const response = await getClient().models.generateContent({
        model: MODEL,
        contents: s.contents,
        config: { systemInstruction: SYSTEM, tools: [{ functionDeclarations }], automaticFunctionCalling: { disable: true } },
      });
      const cand = response.candidates?.[0];
      if (!cand?.content?.parts?.length) {
        reply ||= "<<concerned>> Kechirasiz, bu vazifani bajara olmadim. Boshqacha yozib ko'ring.";
        break;
      }
      s.contents.push(cand.content);
      const out = cand.content.parts.filter((p) => p.text && !p.thought).map((p) => p.text).join("").trim();
      if (out) reply = out;
      const calls = response.functionCalls || [];
      if (!calls.length) break;

      const parts = await Promise.all(
        calls.map(async (fc) => {
          const id = `s${++stepNo}`;
          emit({ type: "step", id, tool: fc.name, label: stepLabel(fc.name, fc.args), status: "running" });
          let result;
          try {
            result = await runTool(fc.name, fc.args ?? {}, emit);
            emit({ type: "step", id, status: "done", label: stepDoneLabel(fc.name, fc.args), detail: stepDetail(fc.name, result) });
          } catch (e) {
            result = { error: e.message };
            emit({ type: "step", id, status: "error", detail: e.message });
          }
          return { functionResponse: { id: fc.id, name: fc.name, response: result } };
        }),
      );
      s.contents.push({ role: "user", parts });
    }
    if (s.contents.at(-1)?.role === "user") s.contents.push({ role: "model", parts: [{ text: reply || "..." }] });

    const m = reply.match(/^\s*<<(calm|happy|excited|concerned)>>\s*/i);
    const mood = m ? m[1].toLowerCase() : "calm";
    const { spoken, details } = splitReply((m ? reply.slice(m[0].length) : reply).replace(/<<(calm|happy|excited|concerned)>>/gi, ""));
    const finalSpoken = spoken || (details ? "" : "Kechirasiz, javob tayyorlay olmadim.");
    // Javob tili (ovoz uchun) — interfeys tilidan emas, javob matnining o'zidan
    emit({ type: "reply", spoken: finalSpoken, text: details, mood, lang: detectLang(`${finalSpoken} ${details}`, lang) });
  } catch (err) {
    s.contents.length = checkpoint;
    throw err;
  } finally {
    s.busy = false;
  }
}

/**
 * Matn tilini taxminan aniqlaydi: kirill → ru; lotin → o'zbekcha yoki inglizcha (tipik so'zlar va harflar bo'yicha).
 * Aniqlab bo'lmasa — `fallback` (interfeys tili).
 */
export function detectLang(text, fallback = "uz") {
  const s = String(text || "").toLowerCase();
  const cyr = (s.match(/[а-яё]/g) || []).length;
  const lat = (s.match(/[a-z]/g) || []).length;
  if (cyr > lat) return "ru";
  if (!lat) return LANG[fallback] ? fallback : "uz";
  const count = (re) => (s.match(re) || []).length;
  const uz = count(/[oʻg][ʻ'’‘`]|\b(va|uchun|bilan|bu|bor|yo['’‘ʻ]q|kerak|narx\w*|so['’‘ʻ]m|tonna|topdim|qil\w*|lot\w*|sotuvchi|taxminan|atrofida|hozir|bo['’‘ʻ]yicha|yozdim|pastga|yaxshi)\b/g);
  const en = count(/\b(the|and|for|is|are|you|your|price|found|with|this|that|per|about|order|details|below)\b/g);
  if (uz === en) return LANG[fallback] ? fallback : "uz";
  return uz > en ? "uz" : "en";
}

/**
 * Javobni "ovozli qisqa gap" va "chatdagi tafsilotlar"ga ajratadi.
 * Model <<say>>…<</say>> yozmasa — birinchi 1–2 gap ovozga olinadi, qolgani tafsilot bo'ladi.
 */
export function splitReply(raw) {
  const text = String(raw || "").trim();
  const m = text.match(/<<say>>([\s\S]*?)(?:<<\/say>>|$)/i);
  if (m) {
    const spoken = m[1].replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
    const details = (text.slice(0, m.index) + "\n" + text.slice(m.index + m[0].length)).replace(/<<\/?say>>/gi, "").trim();
    return { spoken, details };
  }
  // Zaxira: birinchi abzasdan (ro'yxat bo'lmasa) 1–2 gapni olamiz
  const first = text.split(/\n/)[0] || "";
  if (/^\s*(?:[-•*]|\d+\.)\s/.test(first)) return { spoken: "", details: text };
  const sentences = first.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) || [first];
  let spoken = "";
  for (const s of sentences) {
    if (spoken && (spoken + s).length > 160) break;
    spoken += s;
  }
  spoken = spoken.trim();
  const details = (first.slice(spoken.length) + "\n" + text.split(/\n/).slice(1).join("\n")).trim();
  return { spoken: spoken.replace(/\*\*/g, ""), details };
}

/** Ovozli xabarni matnga aylantirish (Gemini audio tushunish). */
export async function transcribe({ data, mimeType, lang = "uz" }) {
  const r = await getClient().models.generateContent({
    model: MODEL,
    contents: [{
      role: "user",
      parts: [
        { inlineData: { mimeType, data } },
        { text: `Transcribe this voice message exactly as spoken. The speaker most likely uses ${LANG[lang] || LANG.uz} (Uzbek may be mixed with Russian words). Write Uzbek in Latin script. Output only the transcript, nothing else. If there is no speech, output nothing.` },
      ],
    }],
  });
  return (r.text || "").trim();
}

export function describeAgentError(err) {
  if (err?.message === "NO_KEY") return "AI agent sozlanmagan: serverda GEMINI_API_KEY o'rnatilmagan.";
  if (err?.code === "BUSY") return "Agent hali oldingi vazifa ustida ishlayapti, biroz kuting.";
  if (err instanceof ApiError) {
    if (err.status === 400 && /api key/i.test(err.message)) return "Gemini API kaliti noto'g'ri. .env faylini tekshiring.";
    if (err.status === 401 || err.status === 403) return "Gemini API kalitiga ruxsat yo'q.";
    if (err.status === 404) return `Gemini modeli topilmadi (${MODEL}).`;
    if (err.status === 429) return "AI hozir band (limit). Bir daqiqadan so'ng qayta urinib ko'ring.";
    return `AI xatosi (${err.status}). Qaytadan urinib ko'ring.`;
  }
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|timeout/i.test(err?.message || "")) return "AI serveriga ulanib bo'lmadi. Internetni tekshiring.";
  return "Kutilmagan xato yuz berdi. Qaytadan urinib ko'ring.";
}
