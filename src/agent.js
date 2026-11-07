// Oson AI — avtonom agent (Google Gemini + UZEX tool'lari).
// Foydalanuvchi "vazifa" beradi, agent o'zi: narxlarni tekshiradi → lot tanlaydi → hisoblaydi → profilni tekshiradi
// → buyurtma tayyorlaydi. Pul bilan bog'liq yagona qadam — foydalanuvchi "Tasdiqlash" tugmasini bosadi.
// Har bir qadam emit() orqali UI'ga jonli (SSE) uzatiladi.
import { ApiError, GoogleGenAI } from "@google/genai";
import crypto from "node:crypto";
import { CATEGORIES, REGIONS, getDaily, getKeyQuotes, getLot, getTodayOffers, getUsdUzs, norm, searchLots, searchPrices } from "./uzex.js";
import { ENTITY_TYPES, createOrder, getProfile, listOrders, saveProfile } from "./store.js";

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

const SYSTEM = `You are "Oson AI", an AUTONOMOUS purchasing agent for UZEX (O'zbekiston Respublika tovar-xomashyo birjasi — the Uzbek commodity exchange, uzex.uz). Your users are ordinary people who know nothing about exchanges. They give you a TASK in plain words or by voice ("Toshkentda uy qurish uchun 20 tonna sement kerak"). Do the whole job yourself, end to end, with your tools — the user should not have to do the steps.

How to work on a task:
1. Understand what, how much, where and any preference (cheapest, nearest, a specific seller). Fill gaps with sensible defaults instead of asking: region → the profile's region if known, otherwise all regions; preference → a good price among the newest offers, close to the user.
2. Check the market price (search_prices, get_overview or get_price_trend) so you can judge whether a lot is fair.
3. Find offers (search_lots, sort "new"; also try "cheap" when price matters; use the region filter). Lot qty = amount in ONE contract, pricePerContract = price of ONE contract.
4. Pick the best lot and verify it with get_lot (deposit %, delivery, warehouse). Prefer lots priced near the current market quote; old contracts can have outdated prices — skip ones far from the market.
5. Compute contracts = ceil(needed quantity / qty per contract). Mention any surplus.
6. Check get_profile. If anything is missing, call request_form with purpose "profile" — the app shows a form with a separate input for every field. Do NOT list the fields or ask for them in your text; just write one short sentence like "Buyurtma uchun ma'lumotlaringizni formaga kiriting", then stop and wait. When you receive "[FORM ... profile]", the profile is already saved: call get_profile and continue the original task automatically (create_order) without asking again.
Whenever you need several pieces of information from the user (quantity, region, preferences…), use request_form with purpose "other" and one field per item instead of asking in prose. Answers arrive as "[FORM <id>] {json}".
7. Call create_order exactly once. The app then shows a confirmation card; the user presses "Tasdiqlash". Never say the order was sent before confirmation.
8. When you receive "[SYSTEM] Buyurtma ... tasdiqlandi", call get_orders and give a short final summary: what was ordered, total and deposit, trading day, demo reference, and what happens next.
Only ask questions when you truly cannot proceed (for example the product is ambiguous between very different goods). Do not ask permission between steps — just do them.

Facts about UZEX buying (explain simply when useful; exact fees and requirements must be confirmed with UZEX or a broker): sellers list standard contracts (lots) with a base price ("bazis narx"); trading days are Mon–Fri; the auction can push the final price above the base price; a deposit (% of the lot price) is blocked before trading; payments are cashless; buyers usually participate through a licensed broker; "EXW" = the buyer collects from the seller's warehouse. In this app, sending the order to the exchange is a DEMO (UZEX has no public order API yet) — say so honestly if asked.

Data honesty: all numbers come from tools (live uzex.uz data). Never invent prices, lots, sellers or results. If a tool fails, say so.

Reply style: the interface language is given as [lang:xx]. Reply in that language (uz = Uzbek Latin script). Short, warm, plain words; explain an exchange term in a few words when you use it. Use **bold** and "- " bullets sparingly; no tables or headings. Money in so'm with spaces ("6 200 000 so'm"), with everyday equivalents when helpful (per 50 kg bag, per litre, per kg). Your final text is also read aloud, so keep it under ~90 words unless listing order details.

Start EVERY final reply with a mood tag: <<calm>>, <<happy>>, <<excited>> or <<concerned>> (concerned = a problem, missing data or risk; happy/excited = order ready or confirmed).

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
  }),
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
      { key: "entityType", label: "Maqomi", type: "select", required: true, value: p.entityType || "", options: Object.entries(ENTITY_TYPES).map(([value, label]) => ({ value, label })) },
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
    default: return name;
  }
}
const somFmt = (n) => (n == null ? "—" : Math.round(n).toLocaleString("en-US").replace(/,/g, " ") + " so'm");
function stepDetail(name, r) {
  if (!r) return "";
  switch (name) {
    case "search_prices": return r.found ? `${r.found} ta tovar · ${r.items[0]?.name}: ${somFmt(r.items[0]?.priceSom)}/${r.items[0]?.unit}` : "Topilmadi";
    case "search_lots": return r.found ? `${r.found} ta taklif topildi` : "Taklif topilmadi";
    case "get_lot": return `${r.seller || r.product} · 1 lot = ${r.qtyPerContract} ${r.unit} · depozit ${r.depositPct ?? "—"}%`;
    case "get_profile": return r.complete ? `${r.fullName} · ${r.entityTypeLabel}` : `Yetishmayapti: ${r.missing.join(", ")}`;
    case "save_profile": return r.complete ? "Profil to'liq" : `Hali yetishmayapti: ${r.missing.join(", ")}`;
    case "create_order": return `${r.contracts} lot · ${somFmt(r.totalSom)} · tasdiqlash kutilmoqda`;
    case "get_price_trend": return r.items?.length ? `${r.items[0].name}: ${r.items[0].changePct10d}% (10 kun)` : "Ma'lumot yo'q";
    case "get_overview": return r.usdToUzs ? `${r.quotes.length} ta asosiy kotirovka · 1$ = ${Math.round(r.usdToUzs)} so'm` : "";
    case "get_orders": return `${r.orders.length} ta buyurtma`;
    default: return "";
  }
}

const round = (n) => (n == null ? null : Math.round(n));
const slimLot = (x) => ({
  lot_id: x.id, product: x.product, seller: x.seller, qtyPerContract: x.qty, unit: x.unit, pricePerContract: round(x.total),
  pricePerTonne: round(x.perTonne), pricePerUnit: round(x.perUnit), region: x.region ?? x.location, everyday: x.everyday,
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
      const o = await createOrder({ lotId: a.lot_id, contracts: a.contracts, reason: a.reason });
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
    const tag = `[lang:${LANG[lang] ? lang : "uz"}]${screen ? ` [screen:${screen}]` : ""}`;
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
            emit({ type: "step", id, status: "done", detail: stepDetail(fc.name, result) });
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
    const clean = (m ? reply.slice(m[0].length) : reply).replace(/<<\w+>>/g, "").trim();
    emit({ type: "reply", text: clean || "Kechirasiz, javob tayyorlay olmadim.", mood });
  } catch (err) {
    s.contents.length = checkpoint;
    throw err;
  } finally {
    s.busy = false;
  }
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
