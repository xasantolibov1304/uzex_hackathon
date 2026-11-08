// Oddiy xotiradagi so'rov cheklovi (har bir tashrif buyuruvchi IP manzili bo'yicha).
// Bitta server jarayoni uchun yetarli; bir nechta server bo'lsa — Redis kabi umumiy ombor kerak bo'ladi.

/**
 * limit({ max, windowMs }) → Express middleware.
 * Oyna ichida `max` dan ortiq so'rov kelsa — 429 va Retry-After sarlavhasi qaytariladi.
 */
export function rateLimit({ max, windowMs, message = "Juda ko'p so'rov. Birozdan so'ng qayta urinib ko'ring." }) {
  const hits = new Map(); // ip → { count, reset }
  // Eski yozuvlarni vaqti-vaqti bilan tozalaymiz (xotira o'smasin)
  setInterval(() => {
    const now = Date.now();
    for (const [ip, h] of hits) if (h.reset <= now) hits.delete(ip);
  }, windowMs).unref();

  return (req, res, next) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    let h = hits.get(ip);
    if (!h || h.reset <= now) hits.set(ip, (h = { count: 0, reset: now + windowMs }));
    h.count++;
    res.set("RateLimit-Limit", String(max));
    res.set("RateLimit-Remaining", String(Math.max(0, max - h.count)));
    if (h.count > max) {
      res.set("Retry-After", String(Math.ceil((h.reset - now) / 1000)));
      return res.status(429).json({ error: message });
    }
    next();
  };
}

// Frontend boshqa domenda bo'lsa (masalan Netlify), uning manzili: CORS_ORIGINS=https://oson-birja.netlify.app,https://...
const ALLOWED = String(process.env.CORS_ORIGINS || "").split(",").map((s) => s.trim().replace(/\/+$/, "")).filter(Boolean);
export const allowedOrigin = (origin) => Boolean(origin) && ALLOWED.includes(String(origin).replace(/\/+$/, ""));

/** CORS: faqat CORS_ORIGINS ro'yxatidagi frontend domenlariga ruxsat (preflight OPTIONS ham shu yerda). */
export function cors(req, res, next) {
  const origin = req.get("origin");
  if (allowedOrigin(origin)) {
    res.set({ "Access-Control-Allow-Origin": origin, Vary: "Origin", "Access-Control-Allow-Headers": "content-type", "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS", "Access-Control-Max-Age": "600" });
    if (req.method === "OPTIONS") return res.sendStatus(204);
  }
  next();
}

/** Faqat shu saytning o'z sahifalaridan (yoki CORS_ORIGINS'dagi frontenddan) kelgan so'rovlar. */
export function sameOrigin(req, res, next) {
  const origin = req.get("origin");
  if (!origin) return next(); // brauzer bir xil saytda Origin yubormasligi mumkin
  if (allowedOrigin(origin)) return next();
  try {
    if (new URL(origin).host === req.get("host")) return next();
  } catch { /* noto'g'ri Origin */ }
  res.status(403).json({ error: "Ruxsat yo'q." });
}
