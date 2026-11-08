import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CATEGORIES, REGIONS, getDaily, getKeyQuotes, getLot, getTodayOffers, getUsdUzs, searchLots, searchPrices } from "./src/uzex.js";
import { OrderError, applicationText, cancelOrder, confirmOrder, getProfile, listOrders, saveProfile, tradingStatus } from "./src/store.js";
import { agentConfigured, describeAgentError, resetSession, runTask, transcribe } from "./src/agent.js";
import { speak } from "./src/voice.js";
import { cors, rateLimit, sameOrigin } from "./src/ratelimit.js";
import { AlertError, GRADES, checkAlerts, createAlert, deleteAlert, listAlerts, marketRef, pushPublicKey, removeSubscription, saveSubscription, sendTest, startAlertScheduler } from "./src/alerts.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === "production" || process.argv.includes("--production");
const app = express();
// Hosting (Railway, Render, Nginx…) proksi orqali ishlaganda haqiqiy IP X-Forwarded-For'da keladi.
// TRUST_PROXY = proksilar soni (production'da standart 1, lokalda 0).
app.set("trust proxy", Number(process.env.TRUST_PROXY ?? (isProd ? 1 : 0)));
app.use("/api", cors); // frontend boshqa domenda (Netlify) bo'lganda — CORS_ORIGINS
app.use("/api/transcribe", express.json({ limit: "12mb" }));
app.use(express.json({ limit: "20kb" }));

const wrap = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch((err) => {
    if (err instanceof OrderError || err instanceof AlertError) return res.status(400).json({ error: err.message });
    console.error(err?.message || err);
    res.status(502).json({ error: "UZEX ma'lumotlarini olishda xato. Birozdan so'ng qayta urinib ko'ring." });
  });

app.get("/api/config", (_req, res) =>
  res.json({ aiEnabled: agentConfigured(), categories: CATEGORIES.map(({ re, ...c }) => c), regions: REGIONS.map((r) => r[0]) }),
);

// ---------- UZEX ma'lumotlari ----------
app.get("/api/overview", wrap(async (_req, res) => {
  const [quotes, daily, today, usd] = await Promise.all([getKeyQuotes(), getDaily().catch(() => []), getTodayOffers().catch(() => null), getUsdUzs().catch(() => null)]);
  res.json({ quotes, daily, today, usdUzs: usd, trading: tradingStatus(), source: "uzex.uz", fetchedAt: Date.now() });
}));
app.get("/api/prices", wrap(async (req, res) => {
  res.json(await searchPrices(String(req.query.q || "").slice(0, 80), { category: String(req.query.category || ""), limit: 60 }));
}));
app.get("/api/lots", wrap(async (req, res) => {
  const q = String(req.query.q || "").slice(0, 80);
  if (!q.trim()) return res.json({ query: "", total: 0, items: [] });
  res.json(await searchLots(q, { sort: req.query.sort === "cheap" ? "cheap" : "new", region: String(req.query.region || "").slice(0, 40), limit: 60 }));
}));
app.get("/api/lots/:id", wrap(async (req, res) => {
  try {
    res.json(await getLot(req.params.id));
  } catch (e) {
    if (/topilmadi|noto'g'ri/.test(e.message)) return res.status(404).json({ error: e.message });
    throw e;
  }
}));

// ---------- profil va buyurtmalar ----------
app.get("/api/profile", (_req, res) => res.json(getProfile()));
app.put("/api/profile", wrap(async (req, res) => res.json(saveProfile(req.body || {}))));
app.get("/api/orders", (_req, res) => res.json(listOrders()));
app.post("/api/orders/:id/confirm", wrap(async (req, res) => res.json(confirmOrder(req.params.id))));
app.post("/api/orders/:id/cancel", wrap(async (req, res) => res.json(cancelOrder(req.params.id))));
app.get("/api/orders/:id/application", wrap(async (req, res) => res.type("text/plain; charset=utf-8").send(applicationText(req.params.id))));

// ---------- narx kuzatuvi: push-bildirishnoma obunalari ----------
// deviceId — brauzerdagi tasodifiy identifikator (localStorage); avtorizatsiya yo'q, bitta qurilma = bitta obunachi
const alertLimit = rateLimit({ max: Number(process.env.ALERT_LIMIT ?? 60), windowMs: 10 * 60_000 });
const dev = (req) => String(req.body?.deviceId ?? req.query.deviceId ?? "");
app.get("/api/push/key", (_req, res) => res.json({ publicKey: pushPublicKey(), grades: Object.entries(GRADES).map(([id, g]) => ({ id, label: g.label })) }));
app.post("/api/push/subscribe", sameOrigin, alertLimit, wrap(async (req, res) => res.json(saveSubscription(dev(req), req.body?.subscription))));
app.post("/api/push/unsubscribe", sameOrigin, alertLimit, wrap(async (req, res) => res.json(removeSubscription(dev(req)))));
app.post("/api/push/test", sameOrigin, alertLimit, wrap(async (req, res) => res.json(await sendTest(dev(req)))));
app.get("/api/alerts", wrap(async (req, res) => res.json(await listAlerts(dev(req)))));
app.get("/api/alerts/market", wrap(async (req, res) => {
  const g = String(req.query.grade || "");
  if (!GRADES[g]) return res.status(400).json({ error: "Benzin turi noto'g'ri." });
  res.json({ grade: g, market: await marketRef(g) });
}));
app.post("/api/alerts", sameOrigin, alertLimit, wrap(async (req, res) => {
  const { grade, region, maxPrice } = req.body || {};
  res.json(await createAlert({ deviceId: dev(req), grade, region, maxPrice }));
}));
app.delete("/api/alerts/:id", sameOrigin, alertLimit, wrap(async (req, res) => res.json(deleteAlert(dev(req), req.params.id))));
app.post("/api/alerts/check", sameOrigin, alertLimit, wrap(async (req, res) => {
  const id = dev(req);
  await listAlerts(id); // deviceId tekshiruvi
  const r = await checkAlerts(id);
  res.json({ ...r, ...(await listAlerts(id)) });
}));

// ---------- agent: vazifani bajarish (SSE oqimi) ----------
app.post("/api/agent/stream", async (req, res) => {
  const { sessionId, text, lang, screen, deviceId } = req.body || {};
  if (typeof sessionId !== "string" || !sessionId || typeof text !== "string" || !text.trim()) {
    return res.status(400).json({ error: "Vazifa bo'sh." });
  }
  res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" });
  let closed = false;
  res.on("close", () => (closed = true));
  const emit = (ev) => { if (!closed) res.write(`data: ${JSON.stringify(ev)}\n\n`); };
  const ping = setInterval(() => !closed && res.write(": ping\n\n"), 15_000);
  try {
    await runTask({ sessionId: sessionId.slice(0, 64), text: text.slice(0, 2000), lang: String(lang || "uz").slice(0, 2), screen: String(screen || "").slice(0, 120), deviceId: String(deviceId || "").slice(0, 64) }, emit);
  } catch (err) {
    console.error("[agent]", err?.status ?? "", err?.message);
    emit({ type: "error", error: describeAgentError(err) });
  } finally {
    clearInterval(ping);
    emit({ type: "end" });
    res.end();
  }
});
app.post("/api/agent/reset", (req, res) => {
  if (typeof req.body?.sessionId === "string") resetSession(req.body.sessionId);
  res.json({ ok: true });
});

// ---------- matn → ovoz (ElevenLabs, zaxira: bepul Edge neyron ovozlari) ----------
// Har bir tashrif buyuruvchiga 10 daqiqada 30 ta ovoz (bir javob = bitta ovoz)
const ttsLimit = rateLimit({ max: Number(process.env.TTS_LIMIT ?? 30), windowMs: 10 * 60_000, message: "Ovoz limiti tugadi. Birozdan so'ng qayta urinib ko'ring." });
app.post("/api/tts", sameOrigin, ttsLimit, async (req, res) => {
  const { text, lang, mood } = req.body || {};
  if (typeof text !== "string" || !text.trim()) return res.status(400).json({ error: "Matn bo'sh." });
  try {
    const { audio, provider } = await speak({ text: text.slice(0, 400), lang: String(lang || "uz").slice(0, 2), mood: String(mood || "calm").slice(0, 12) });
    res.type("audio/mpeg").set({ "cache-control": "no-store", "x-voice-provider": provider }).send(audio);
  } catch (err) {
    console.error("[tts]", err?.status ?? "", err?.message);
    res.status(502).json({ error: "Ovozni tayyorlab bo'lmadi." });
  }
});

// ---------- ovoz → matn ----------
app.post("/api/transcribe", async (req, res) => {
  const { data, mimeType, lang } = req.body || {};
  if (typeof data !== "string" || !data || !/^audio\//.test(String(mimeType))) return res.status(400).json({ error: "Audio topilmadi." });
  try {
    res.json({ text: await transcribe({ data, mimeType: String(mimeType).split(";")[0], lang }) });
  } catch (err) {
    console.error("[transcribe]", err?.status ?? "", err?.message);
    res.status(502).json({ error: describeAgentError(err) });
  }
});

// ---------- frontend (React, client/) ----------
// Production: `npm run build` natijasi (dist/) statik beriladi.
// Dev: Vite middleware rejimida — HMR bilan, API bilan bitta portda.
if (isProd) {
  app.use(express.static(path.join(here, "dist")));
} else {
  const [{ createServer }, { default: viteConfig }] = await Promise.all([import("vite"), import("./vite.config.js")]);
  // configFile: false — config to'g'ridan-to'g'ri import qilinadi (node --watch vaqtinchalik fayllarni ko'rib qayta ishga tushmasin)
  const vite = await createServer({ ...viteConfig, configFile: false, server: { middlewareMode: true }, appType: "mpa" });
  app.use(vite.middlewares);
}

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`UZEX 2.0 (agent): http://localhost:${PORT}`);
  startAlertScheduler(); // benzin narxi obunalarini fon rejimida tekshirish
  if (!agentConfigured()) console.log("⚠  GEMINI_API_KEY topilmadi — AI agent o'chiq (.env faylga qo'shing).");
});
