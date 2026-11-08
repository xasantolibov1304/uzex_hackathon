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

/** Faqat shu saytning o'z sahifalaridan kelgan so'rovlar (boshqa saytlar brauzer orqali foydalana olmasin). */
export function sameOrigin(req, res, next) {
  const origin = req.get("origin");
  if (!origin) return next(); // brauzer bir xil saytda Origin yubormasligi mumkin
  try {
    if (new URL(origin).host === req.get("host")) return next();
  } catch { /* noto'g'ri Origin */ }
  res.status(403).json({ error: "Ruxsat yo'q." });
}
