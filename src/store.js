// Buyurtmalar va foydalanuvchi profili (data/db.json).
// Agent buyurtmani tayyorlaydi (awaiting_confirmation) → foydalanuvchi tasdiqlaydi → DEMO birjaga yuboriladi (submitted).
// Haqiqiy UZEX'ga yuborish uchun ochiq API yo'q — confirmOrder() integratsiya nuqtasi.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { getLot } from "./uzex.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const DB_FILE = path.join(here, "..", "data", "db.json");

export const ENTITY_TYPES = { jismoniy: "Jismoniy shaxs", yatt: "Yakka tartibdagi tadbirkor (YaTT)", yuridik: "Yuridik shaxs" };

function fresh() {
  return { profile: {}, orders: [], createdAt: new Date().toISOString() };
}
let db = load();
function load() {
  try {
    const d = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
    return { createdAt: d.createdAt || new Date().toISOString(), profile: d.profile || {}, orders: Array.isArray(d.orders) ? d.orders : [] };
  } catch {
    return fresh();
  }
}
function save() {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  const tmp = DB_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

export class OrderError extends Error {}

// ---------- profil ----------
export function getProfile() {
  const p = db.profile;
  const missing = ["fullName", "entityType", "phone", "region"].filter((k) => !p[k]);
  if ((p.entityType === "yatt" || p.entityType === "yuridik") && !p.tin) missing.push("tin");
  return { ...p, entityTypeLabel: ENTITY_TYPES[p.entityType] || null, missing, complete: missing.length === 0 };
}
export function saveProfile(patch = {}) {
  const clean = {};
  if (patch.fullName) clean.fullName = String(patch.fullName).trim().slice(0, 120);
  if (patch.entityType) {
    if (!ENTITY_TYPES[patch.entityType]) throw new OrderError("entityType: jismoniy, yatt yoki yuridik bo'lishi kerak.");
    clean.entityType = patch.entityType;
  }
  if (patch.tin) {
    const tin = String(patch.tin).replace(/\D/g, "");
    if (tin.length !== 9) throw new OrderError("STIR 9 ta raqamdan iborat bo'lishi kerak.");
    clean.tin = tin;
  }
  if (patch.phone) {
    const ph = String(patch.phone).replace(/[^\d+]/g, "");
    if (ph.replace(/\D/g, "").length < 9) throw new OrderError("Telefon raqami noto'g'ri.");
    clean.phone = ph;
  }
  if (patch.region) clean.region = String(patch.region).trim().slice(0, 60);
  db.profile = { ...db.profile, ...clean };
  save();
  return getProfile();
}

// ---------- savdo kuni ----------
/** Keyingi ish kuni (Du–Ju), Toshkent vaqti bo'yicha, "YYYY-MM-DD". */
export function nextTradingDay(from = new Date()) {
  const [y, m, d] = from.toLocaleDateString("en-CA", { timeZone: "Asia/Tashkent" }).split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d));
  do day.setUTCDate(day.getUTCDate() + 1);
  while (day.getUTCDay() === 0 || day.getUTCDay() === 6);
  return day.toISOString().slice(0, 10);
}

// ---------- buyurtmalar ----------
function computed(o) {
  const total = Math.round(o.pricePerContract * o.contracts);
  return { ...o, quantity: o.qtyPerContract * o.contracts, total, depositSum: o.depositPct != null ? Math.round((total * o.depositPct) / 100) : null };
}
export const listOrders = () => db.orders.map(computed);
export function getOrder(id) {
  const o = db.orders.find((x) => x.id === id);
  if (!o) throw new OrderError("Buyurtma topilmadi.");
  return computed(o);
}

/** Agent chaqiradi: real lotdan buyurtma qoralamasi (foydalanuvchi tasdig'i kutiladi). */
export async function createOrder({ lotId, contracts, reason = "" }) {
  const n = Math.floor(Number(contracts));
  if (!Number.isFinite(n) || n < 1 || n > 1000) throw new OrderError("Lotlar soni 1 dan 1000 gacha bo'lishi kerak.");
  const prof = getProfile();
  if (!prof.complete) throw new OrderError(`Profil to'liq emas, yetishmayapti: ${prof.missing.join(", ")}. Foydalanuvchidan so'rab, save_profile chaqiring.`);
  const lot = await getLot(lotId);
  db.orders = db.orders.filter((o) => !(o.lotId === lot.id && o.status === "awaiting_confirmation"));
  const now = new Date().toISOString();
  const order = {
    id: "ord_" + crypto.randomBytes(4).toString("hex"),
    lotId: lot.id,
    product: lot.product,
    seller: lot.seller,
    unit: lot.unit,
    qtyPerContract: lot.qty,
    pricePerContract: lot.total,
    perTonne: lot.perTonne,
    depositPct: lot.depositPct,
    location: lot.location,
    deliveryBasis: lot.deliveryBasis,
    paymentForm: lot.paymentForm,
    url: lot.url,
    contracts: n,
    reason: String(reason).slice(0, 400),
    status: "awaiting_confirmation",
    tradingDate: nextTradingDay(),
    buyer: { fullName: prof.fullName, entityType: prof.entityType, tin: prof.tin || null, phone: prof.phone, region: prof.region },
    timeline: [{ at: now, text: "Agent lotni tanladi va buyurtma qoralamasini tayyorladi" }],
    createdAt: now,
  };
  db.orders.unshift(order);
  save();
  return computed(order);
}

/** Foydalanuvchi tasdiqlaydi → DEMO rejimda birjaga yuboriladi (haqiqiy integratsiya nuqtasi). */
export function confirmOrder(id) {
  const o = db.orders.find((x) => x.id === id);
  if (!o) throw new OrderError("Buyurtma topilmadi.");
  if (o.status !== "awaiting_confirmation") throw new OrderError("Bu buyurtma allaqachon ko'rib chiqilgan.");
  const now = new Date().toISOString();
  o.status = "submitted";
  o.tradingDate = nextTradingDay();
  o.confirmedAt = now;
  o.exchangeRef = "DEMO-" + crypto.randomBytes(3).toString("hex").toUpperCase();
  o.timeline.push(
    { at: now, text: "Foydalanuvchi buyurtmani tasdiqladi" },
    { at: now, text: "Xarid arizasi avtomatik to'ldirildi" },
    { at: now, text: `Depozit hisoblandi (${o.depositPct ?? "—"}%)` },
    { at: now, text: `Buyurtma birjaga yuborildi (DEMO ${o.exchangeRef}), savdo kuni ${o.tradingDate}` },
  );
  save();
  return computed(o);
}
export function cancelOrder(id) {
  const o = db.orders.find((x) => x.id === id);
  if (!o) throw new OrderError("Buyurtma topilmadi.");
  if (o.status !== "cancelled") {
    o.status = "cancelled";
    o.timeline.push({ at: new Date().toISOString(), text: "Buyurtma bekor qilindi" });
    save();
  }
  return computed(o);
}

const fmt = (n) => (n == null ? "—" : Math.round(n).toLocaleString("en-US").replace(/,/g, " "));
/** Xarid arizasi matni (shablon — raqamlar aniq, LLM ishtirokisiz). */
export function applicationText(id) {
  const o = getOrder(id);
  const b = o.buyer || {};
  return [
    "BIRJA SAVDOSIDA XARID QILISH UCHUN BUYURTMA (ARIZA)",
    `Buyurtma: ${o.id}${o.exchangeRef ? ` · ${o.exchangeRef}` : ""}`,
    `Sana: ${new Date(o.confirmedAt || o.createdAt).toLocaleDateString("ru-RU", { timeZone: "Asia/Tashkent" })}`,
    "",
    "XARIDOR",
    `  F.I.Sh / nomi: ${b.fullName || "—"}`,
    `  Maqomi: ${ENTITY_TYPES[b.entityType] || "—"}`,
    `  STIR: ${b.tin || "—"}`,
    `  Telefon: ${b.phone || "—"}`,
    `  Hudud: ${b.region || "—"}`,
    "",
    "TOVAR",
    `  Nomi: ${o.product}`,
    `  Standart shartnoma (lot) №: ${o.lotId}`,
    `  Sotuvchi: ${o.seller || "—"}`,
    `  Miqdor: ${o.contracts} lot × ${fmt(o.qtyPerContract)} ${o.unit} = ${fmt(o.quantity)} ${o.unit}`,
    `  Bazis narx (1 lot): ${fmt(o.pricePerContract)} so'm`,
    `  Jami (bazis narx bo'yicha): ${fmt(o.total)} so'm`,
    `  Depozit: ${o.depositPct ?? "—"}% = ${fmt(o.depositSum)} so'm`,
    `  Yetkazib berish: ${o.deliveryBasis || "—"}; ombor: ${o.location || "—"}`,
    `  To'lov shakli: ${o.paymentForm || "—"}`,
    `  Savdo kuni: ${o.tradingDate}`,
    "",
    "Izoh: yakuniy narx birja savdosida aniqlanadi va bazis narxdan yuqori bo'lishi mumkin.",
    "",
    "Xaridor imzosi: ____________________",
  ].join("\n");
}
