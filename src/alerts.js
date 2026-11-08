// Narx kuzatuvi (obuna): benzin lotining 1 tonna narxi foydalanuvchi kutgan narxga tushganda brauzerga push-xabar.
//
// Qanday ishlaydi (ticket_tracking'dagi g'oya, Node'da):
//  1. Obuna yaratilganda hozir ro'yxatda turgan lotlar "ko'rilgan" deb belgilanadi (baseline) — UZEX ro'yxatida
//     eskirgan narxli eski lotlar ham bor, ular yolg'on xabar bermasligi uchun FAQAT YANGI paydo bo'lgan lotlar tekshiriladi.
//  2. Har ALERT_POLL_MIN daqiqada (standart 10 — lotlar keshi ham 10 daqiqa) bir xil (tur + hudud) obunalar
//     guruhlanadi va UZEX'ga bitta so'rov ketadi.
//  3. Yangi lot narxi ≤ chegara bo'lsa → push. Har bir lot bo'yicha bir marta (seen ro'yxati).
//     Bozor kotirovkasidan 2 baravar arzon lot — ehtimol noto'g'ri to'ldirilgan, xabar berilmaydi.
//
// Ma'lumot: data/alerts.json (qurilmalar va obunalar), data/vapid.json (push kalitlari, .env'da bo'lmasa avtomatik).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import webpush from "web-push";
import { getDaily, searchLots, searchPrices } from "./uzex.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(here, "..", "data");
const DB_FILE = path.join(DATA, "alerts.json");
const VAPID_FILE = path.join(DATA, "vapid.json");
const POLL_MS = Math.max(2, Number(process.env.ALERT_POLL_MIN) || 10) * 60_000;
const MAX_ALERTS_PER_DEVICE = 10;

export class AlertError extends Error {}

// ---------- benzin turlari ----------
export const GRADES = {
  ai80: { label: "AI-80", term: "АИ-80", quote: /[АA]-?80|\(80\)/i },
  ai92: { label: "AI-92", term: "АИ-92", quote: /[АA]-?92/i },
  ai95: { label: "AI-95", term: "АИ-95", quote: /[АA]-?95/i },
  any: { label: "Har qanday benzin", term: "бензин", quote: /benzin/i },
};

// ---------- saqlash ----------
function load() {
  try {
    const d = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
    return { devices: d.devices && typeof d.devices === "object" ? d.devices : {}, alerts: Array.isArray(d.alerts) ? d.alerts : [] };
  } catch {
    return { devices: {}, alerts: [] };
  }
}
let db = load();
function save() {
  fs.mkdirSync(DATA, { recursive: true });
  const tmp = DB_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

// ---------- push kalitlari (VAPID) ----------
function vapidKeys() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  }
  try {
    const k = JSON.parse(fs.readFileSync(VAPID_FILE, "utf8"));
    if (k.publicKey && k.privateKey) return k;
  } catch { /* hali yaratilmagan */ }
  const k = webpush.generateVAPIDKeys();
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(VAPID_FILE, JSON.stringify(k, null, 2), { mode: 0o600 });
  console.log("🔑 Push kalitlari yaratildi: data/vapid.json");
  return k;
}
const VAPID = vapidKeys();
// Push xizmatlari (Apple, Google) aloqa manzilini talab qiladi — production'da VAPID_SUBJECT'ni haqiqiy manzilga qo'ying
webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:noreply@oson-birja.app", VAPID.publicKey, VAPID.privateKey);
export const pushPublicKey = () => VAPID.publicKey;

// Server faqat ma'lum push xizmatlariga so'rov yuboradi (endpoint foydalanuvchidan keladi — SSRF'dan himoya)
const PUSH_HOSTS = ["fcm.googleapis.com", "push.services.mozilla.com", "push.apple.com", "notify.windows.com"];
function allowedEndpoint(endpoint) {
  try {
    const u = new URL(endpoint);
    return u.protocol === "https:" && PUSH_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith("." + h));
  } catch {
    return false;
  }
}

const cleanDevice = (id) => {
  const s = String(id || "");
  if (!/^[\w-]{8,64}$/.test(s)) throw new AlertError("Qurilma identifikatori noto'g'ri.");
  return s;
};

// ---------- qurilma (push obunasi) ----------
export function saveSubscription(deviceId, sub) {
  const id = cleanDevice(deviceId);
  if (!sub || typeof sub.endpoint !== "string" || !allowedEndpoint(sub.endpoint)) throw new AlertError("Push obunasi noto'g'ri yoki bu brauzer qo'llab-quvvatlanmaydi.");
  const keys = sub.keys || {};
  if (typeof keys.p256dh !== "string" || typeof keys.auth !== "string" || keys.p256dh.length > 200 || keys.auth.length > 100) throw new AlertError("Push kalitlari noto'g'ri.");
  db.devices[id] = { sub: { endpoint: sub.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } }, savedAt: new Date().toISOString() };
  save();
  return deviceStatus(id);
}
export function removeSubscription(deviceId) {
  const id = cleanDevice(deviceId);
  delete db.devices[id];
  save();
  return deviceStatus(id);
}
export function deviceStatus(deviceId) {
  const id = cleanDevice(deviceId);
  return { subscribed: Boolean(db.devices[id]?.sub), alerts: db.alerts.filter((a) => a.deviceId === id).length };
}

// ---------- bozor mo'ljali (haftalik kotirovka) ----------
const refCache = new Map(); // grade → { at, value }
export async function marketRef(grade) {
  const hit = refCache.get(grade);
  if (hit && Date.now() - hit.at < 30 * 60_000) return hit.value;
  const g = GRADES[grade];
  let value = null;
  try {
    const w = await searchPrices("benzin", { limit: 60 });
    const items = w.items.filter((x) => /tonna/.test(x.unit) && x.price > 1e6 && g.quote.test(x.name));
    if (items.length) {
      const week = items[0].week; // eng so'nggi hafta birinchi keladi
      const prices = items.filter((x) => x.week === week).map((x) => x.price).sort((a, b) => a - b);
      value = { pricePerTonne: Math.round(prices[Math.floor(prices.length / 2)]), source: "UZEX haftalik kotirovka", period: week };
    }
    if (!value && grade === "ai80") {
      const d = (await getDaily()).find((x) => /БЕНЗИН \(80\)/i.test(x.name));
      if (d?.points?.length) value = { pricePerTonne: Math.round(d.points.at(-1)), source: "UZEX kunlik kotirovka", period: null };
    }
  } catch { /* mo'ljal bo'lmasa ham obuna ishlaydi */ }
  refCache.set(grade, { at: Date.now(), value });
  return value;
}

// ---------- lotlar ----------
async function currentLots(grade, region) {
  const r = await searchLots(GRADES[grade].term, { sort: "new", region, limit: 1000 });
  return r.items.filter((x) => /бензин/i.test(x.product) && x.perTonne != null);
}

const publicAlert = (a) => ({
  id: a.id, grade: a.grade, gradeLabel: GRADES[a.grade]?.label || a.grade, region: a.region, maxPrice: a.maxPrice,
  active: a.active, createdAt: a.createdAt, lastCheckedAt: a.lastCheckedAt, lastError: a.lastError, lastNewCount: a.lastNewCount ?? null,
  hits: a.hits.slice(0, 10), notifiedCount: a.notifiedCount || 0, pushError: a.pushError || null,
});

export async function listAlerts(deviceId) {
  const id = cleanDevice(deviceId);
  const mine = db.alerts.filter((a) => a.deviceId === id);
  const refs = Object.fromEntries(await Promise.all([...new Set(mine.map((a) => a.grade))].map(async (g) => [g, await marketRef(g)])));
  return { ...deviceStatus(id), pollMinutes: POLL_MS / 60_000, alerts: mine.map((a) => ({ ...publicAlert(a), market: refs[a.grade] || null })) };
}

/** Obuna yaratadi (bir xil tur + hudud bo'lsa — chegarani yangilaydi). */
export async function createAlert({ deviceId, grade, region = "", maxPrice }) {
  const id = cleanDevice(deviceId);
  if (!GRADES[grade]) throw new AlertError("Benzin turi: ai80, ai92, ai95 yoki any.");
  const price = Math.round(Number(String(maxPrice ?? "").replace(/[^\d.]/g, "")));
  if (!Number.isFinite(price) || price < 1_000_000 || price > 100_000_000) throw new AlertError("Narx 1 tonna uchun so'mda bo'lsin (1 000 000 – 100 000 000).");
  const reg = String(region || "").trim().slice(0, 40);

  const lots = await currentLots(grade, reg); // baseline: hozirgi lotlar "ko'rilgan"
  const existing = db.alerts.find((a) => a.deviceId === id && a.grade === grade && a.region === reg);
  let alert;
  if (existing) {
    existing.maxPrice = price;
    existing.active = true;
    alert = existing;
  } else {
    if (db.alerts.filter((a) => a.deviceId === id).length >= MAX_ALERTS_PER_DEVICE) throw new AlertError(`Ko'pi bilan ${MAX_ALERTS_PER_DEVICE} ta obuna.`);
    alert = {
      id: "al_" + crypto.randomBytes(4).toString("hex"), deviceId: id, grade, region: reg, maxPrice: price, active: true,
      createdAt: new Date().toISOString(), lastCheckedAt: new Date().toISOString(), lastError: null, lastNewCount: 0,
      seen: lots.map((x) => x.id), hits: [], notifiedCount: 0,
    };
    db.alerts.push(alert);
  }
  save();
  const market = await marketRef(grade);
  // Hozir ro'yxatda chegaradan arzon turganlar (eski bo'lishi mumkin — faqat ma'lumot uchun, xabar yuborilmaydi)
  const sane = (x) => !market || x.perTonne >= market.pricePerTonne * 0.5;
  const belowNow = lots.filter((x) => x.perTonne <= price && sane(x)).sort((a, b) => a.perTonne - b.perTonne);
  return {
    alert: { ...publicAlert(alert), market },
    subscribed: Boolean(db.devices[id]?.sub),
    belowNow: { count: belowNow.length, cheapest: belowNow.slice(0, 3).map(slimHit) },
  };
}

export function deleteAlert(deviceId, alertId) {
  const id = cleanDevice(deviceId);
  const before = db.alerts.length;
  db.alerts = db.alerts.filter((a) => !(a.id === alertId && a.deviceId === id));
  if (db.alerts.length === before) throw new AlertError("Obuna topilmadi.");
  save();
  return { ok: true };
}

const slimHit = (x) => ({ lotId: x.id, product: x.productUz || x.product, perTonne: Math.round(x.perTonne), qty: x.qty, unit: x.unit, region: x.regionUz || x.region, perLitre: x.everyday?.price ? Math.round(x.everyday.price) : null });
const fmt = (n) => Math.round(n).toLocaleString("en-US").replace(/,/g, " ");

// ---------- push yuborish ----------
async function push(deviceId, payload) {
  const dev = db.devices[deviceId];
  if (!dev?.sub) return { sent: false, reason: "no_subscription" };
  try {
    await webpush.sendNotification(dev.sub, JSON.stringify(payload), { TTL: 12 * 3600, urgency: "high" });
    return { sent: true };
  } catch (e) {
    // 404/410 — brauzer obunani bekor qilgan: qurilmani o'chiramiz
    if (e.statusCode === 404 || e.statusCode === 410) { delete db.devices[deviceId]; save(); return { sent: false, reason: "expired" }; }
    console.error("[push]", e.statusCode ?? "", e.body || e.message);
    return { sent: false, reason: "error" };
  }
}

export async function sendTest(deviceId) {
  const id = cleanDevice(deviceId);
  const r = await push(id, { title: "🔔 Oson Birja: sinov xabari", body: "Bildirishnomalar ishlayapti. Benzin narxi tushsa, shu yerga xabar keladi.", url: "/", tag: "test" });
  if (!r.sent) throw new AlertError(r.reason === "no_subscription" || r.reason === "expired" ? "Bu brauzerda bildirishnoma yoqilmagan." : "Xabarni yuborib bo'lmadi.");
  return { ok: true };
}

async function notify(alert, hits) {
  const best = hits[0];
  const g = GRADES[alert.grade];
  const litre = best.perLitre ? ` (≈ ${fmt(best.perLitre)} so'm/litr)` : "";
  const r = await push(alert.deviceId, {
    title: `⛽ ${g.label}: ${fmt(best.perTonne)} so'm/tonna`,
    body: `Siz kutgan narxga tushdi${litre}. 📍 ${String(best.region || "").slice(0, 60)} · 1 lot = ${fmt(best.qty)} ${best.unit}` +
      (hits.length > 1 ? ` · yana ${hits.length - 1} ta lot` : ""),
    url: `/?lot=${encodeURIComponent(best.lotId)}`,
    tag: `alert-${alert.id}-${best.lotId}`,
  });
  alert.pushError = r.sent ? null : r.reason;
  if (r.sent) alert.notifiedCount = (alert.notifiedCount || 0) + 1;
}

// ---------- tekshiruv ----------
let checking = null;
/** Faol obunalarni tekshiradi. only — faqat shu qurilma obunalari ("Hozir tekshirish" tugmasi). */
export function checkAlerts(only) {
  if (checking) return checking;
  checking = (async () => {
    const active = db.alerts.filter((a) => a.active && (!only || a.deviceId === only));
    const groups = new Map();
    for (const a of active) {
      const k = `${a.grade}|${a.region}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(a);
    }
    let found = 0;
    for (const list of groups.values()) {
      const { grade, region } = list[0];
      let lots;
      try {
        lots = await currentLots(grade, region);
      } catch (e) {
        for (const a of list) a.lastError = "UZEX ma'lumotini olib bo'lmadi";
        console.error("[alerts]", grade, region, e.message);
        continue;
      }
      const market = await marketRef(grade);
      const now = new Date().toISOString();
      for (const a of list) {
        const seen = new Set(a.seen);
        const fresh = lots.filter((x) => !seen.has(x.id));
        fresh.forEach((x) => seen.add(x.id));
        a.seen = [...seen].slice(-3000);
        a.lastCheckedAt = now;
        a.lastError = null;
        a.lastNewCount = fresh.length;
        const hits = fresh
          .filter((x) => x.perTonne <= a.maxPrice && (!market || x.perTonne >= market.pricePerTonne * 0.5))
          .sort((x, y) => x.perTonne - y.perTonne)
          .map(slimHit);
        if (!hits.length) continue;
        found += hits.length;
        a.hits = [...hits.map((h) => ({ ...h, at: now })), ...a.hits].slice(0, 20);
        await notify(a, hits);
      }
    }
    save();
    return { checked: active.length, found };
  })().finally(() => { checking = null; });
  return checking;
}

let timer = null;
export function startAlertScheduler() {
  if (timer) return;
  timer = setInterval(() => checkAlerts().catch((e) => console.error("[alerts]", e.message)), POLL_MS);
  timer.unref();
}
