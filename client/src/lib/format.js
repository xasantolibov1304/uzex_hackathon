// Formatlash yordamchilari (eski app.js dan o'zgarishsiz ko'chirilgan)

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const grp = (n) => Math.round(n).toLocaleString("en-US").replace(/,/g, " ");
export function som(n, { short = false } = {}) {
  if (n == null || !Number.isFinite(n)) return "—";
  if (short && Math.abs(n) >= 1e9) return (n / 1e9).toFixed(2).replace(/\.?0+$/, "") + " mlrd so'm";
  if (short && Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2).replace(/\.?0+$/, "") + " mln so'm";
  return grp(n) + " so'm";
}
export const pct = (n) => (n > 0 ? "+" : "") + (Number(n) || 0).toFixed(2) + "%";
export const cls = (n) => (n > 0 ? "up" : n < 0 ? "down" : "");
export const qty = (n) => (n == null ? "—" : Number(n).toLocaleString("en-US", { maximumFractionDigits: 3 }).replace(/,/g, " "));
export const dateUz = (s) => { const [y, m, d] = String(s).split("-"); return d ? `${d}.${m}.${y}` : s; };

/** Agent javobi uchun juda sodda markdown: **qalin**, ro'yxatlar, paragraflar. Matn avval escape qilinadi — xavfsiz HTML. */
export function mdLite(text) {
  let html = "", inList = false;
  for (const raw of esc(text).split("\n")) {
    const line = raw.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\*\*/g, "");
    const m = line.match(/^\s*(?:[-•*]|\d+\.)\s+(.*)/);
    if (m) { if (!inList) { html += "<ul>"; inList = true; } html += `<li>${m[1]}</li>`; continue; }
    if (inList) { html += "</ul>"; inList = false; }
    if (line.trim()) html += `<p>${line}</p>`;
  }
  return html + (inList ? "</ul>" : "");
}

export const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* */ } },
};
