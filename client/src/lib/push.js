// Brauzer push-bildirishnomalari: service worker, ruxsat so'rash, obunani serverga yuborish.
import { api } from "./api.js";

/** Qurilma identifikatori — narx obunalari shu brauzerga bog'lanadi (avtorizatsiya yo'q). */
export function deviceId() {
  let id = null;
  try { id = localStorage.getItem("osonDevice"); } catch { /* */ }
  if (!id) {
    id = (crypto.randomUUID?.() || String(Math.random()).slice(2) + Date.now()).replace(/[^\w-]/g, "");
    try { localStorage.setItem("osonDevice", id); } catch { /* */ }
  }
  return id;
}

export const pushSupported = () =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && window.isSecureContext;

/** "unsupported" | "denied" | "off" | "on" */
export async function pushState() {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

function b64ToBytes(b64) {
  const s = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}
const bytesToB64Url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Foydalanuvchi tugmani bosganda chaqiriladi (brauzerlar ruxsatni faqat bosish orqali so'rashga yo'l qo'yadi). */
export async function enablePush() {
  if (!pushSupported()) throw new Error("Bu brauzer push-bildirishnomani qo'llab-quvvatlamaydi (iPhone'da saytni bosh ekranga qo'shing).");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Bildirishnomaga ruxsat berilmadi. Brauzer sozlamalaridan ruxsat bering.");
  const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  const { publicKey } = await api("/api/push/key");
  let sub = await reg.pushManager.getSubscription();
  // Server kaliti o'zgargan bo'lsa (masalan, data/vapid.json qayta yaratilgan) — eski obunani yangilaymiz
  if (sub && (!sub.options?.applicationServerKey || bytesToB64Url(sub.options.applicationServerKey) !== publicKey)) {
    await sub.unsubscribe();
    sub = null;
  }
  sub ||= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
  return api("/api/push/subscribe", { body: { deviceId: deviceId(), subscription: sub.toJSON() } });
}

export async function disablePush() {
  const reg = await navigator.serviceWorker?.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  await sub?.unsubscribe();
  return api("/api/push/unsubscribe", { body: { deviceId: deviceId() } });
}
