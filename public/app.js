"use strict";
// Oson Birja — avtonom AI agent uchun frontend (vanilla JS)

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* */ } },
};

const state = {
  cfg: { aiEnabled: false, categories: [], regions: [] },
  lang: store.get("osonLang") || "uz",
  voiceOn: store.get("osonVoice") !== "0",
  tab: "agent",
  busy: false,
  overview: null,
  weekly: null,
  orders: [],
  priceCat: "",
  lot: null,
};

// ---------- matnlar (agent ekrani) ----------
const T = {
  uz: {
    intro: "Menga vazifa bering — qolganini o'zim bajaraman.",
    placeholder: "Masalan: Toshkentda 20 tonna sement kerak",
    examples: ["Toshkentda uy uchun 20 tonna sement kerak", "Samarqandda nonvoyxonaga 5 tonna un top", "Eng arzon dizel yoqilg'isini topib buyurtma qil", "Birja o'zi nima? Oddiy tushuntir"],
    working: "Agent ishlayapti", done: (n) => `${n} ta qadam bajarildi`, failed: "Xatolik",
    confirm: "Tasdiqlash", cancel: "Bekor qilish", app: "Arizani ko'rish", awaiting: "Tasdiqlash kutilmoqda", submitted: "Birjaga yuborildi (DEMO)", cancelled: "Bekor qilingan",
    order: "Buyurtma", listening: "Tinglayapman… gapirib bo'lgach yana bosing", transcribing: "Ovozingizni matnga aylantiryapman…",
  },
  ru: {
    intro: "Дайте мне задачу — остальное я сделаю сам.",
    placeholder: "Например: нужно 20 тонн цемента в Ташкенте",
    examples: ["Нужно 20 тонн цемента в Ташкенте для дома", "Найди 5 тонн муки в Самарканде", "Найди самое дешёвое дизтопливо и оформи заказ", "Что такое биржа? Объясни просто"],
    working: "Агент работает", done: (n) => `Выполнено шагов: ${n}`, failed: "Ошибка",
    confirm: "Подтвердить", cancel: "Отменить", app: "Заявка", awaiting: "Ждёт подтверждения", submitted: "Отправлено на биржу (DEMO)", cancelled: "Отменён",
    order: "Заказ", listening: "Слушаю… нажмите ещё раз, когда закончите", transcribing: "Распознаю голос…",
  },
  en: {
    intro: "Give me a task — I'll handle the rest.",
    placeholder: "e.g. I need 20 tonnes of cement in Tashkent",
    examples: ["I need 20 tonnes of cement in Tashkent", "Find 5 tonnes of flour in Samarkand", "Find the cheapest diesel and place an order", "What is a commodity exchange? Explain simply"],
    working: "Agent is working", done: (n) => `${n} steps done`, failed: "Error",
    confirm: "Confirm", cancel: "Cancel", app: "Application", awaiting: "Awaiting confirmation", submitted: "Sent to exchange (DEMO)", cancelled: "Cancelled",
    order: "Order", listening: "Listening… tap again when done", transcribing: "Transcribing…",
  },
};
const t = () => T[state.lang] || T.uz;

// ---------- formatlash ----------
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const grp = (n) => Math.round(n).toLocaleString("en-US").replace(/,/g, " ");
function som(n, { short = false } = {}) {
  if (n == null || !Number.isFinite(n)) return "—";
  if (short && Math.abs(n) >= 1e9) return (n / 1e9).toFixed(2).replace(/\.?0+$/, "") + " mlrd so'm";
  if (short && Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2).replace(/\.?0+$/, "") + " mln so'm";
  return grp(n) + " so'm";
}
const pct = (n) => (n > 0 ? "+" : "") + (Number(n) || 0).toFixed(2) + "%";
const cls = (n) => (n > 0 ? "up" : n < 0 ? "down" : "");
const qty = (n) => (n == null ? "—" : Number(n).toLocaleString("en-US", { maximumFractionDigits: 3 }).replace(/,/g, " "));
const dateUz = (s) => { const [y, m, d] = String(s).split("-"); return d ? `${d}.${m}.${y}` : s; };
function mdLite(text) {
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

async function api(path, opts) {
  const init = opts ? { method: opts.method || "POST", headers: { "content-type": "application/json" }, body: opts.body ? JSON.stringify(opts.body) : undefined } : {};
  const res = await fetch(path, init);
  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("json") ? await res.json().catch(() => ({})) : await res.text();
  if (!res.ok) throw new Error(data?.error || "Xato yuz berdi");
  return data;
}
let toastTimer;
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 3200);
}
const skeleton = (n = 3) => '<div class="skeleton"></div>'.repeat(n);
const emptyBox = (html) => `<div class="empty">${html}</div>`;

// ---------- avatar ----------
const avatar = window.OsonAvatar.mount($("#avatar"));

// ---------- avatar joylashuvi: logo ⇄ markaz ----------
// Kutishda avatar header'dagi logo o'rnida turadi. Foydalanuvchi harakat qilsa (yozish, mikrofon,
// vazifa) yoki agent ishlayotgan/gapirayotgan bo'lsa — markazga uchib keladi; hammasi tugagach qaytadi.
const dock = (() => {
  const canvas = $("#avatar");
  const BASE = 300;          // canvas CSS o'lchami (transform: scale bilan kichraytiriladi)
  const ORB = 0.66;          // shar diametri canvas'ning ~66% i (qolgani — nur)
  const ACTIVE = new Set(["thinking", "working", "speaking", "listening"]);
  let mode = "logo";
  let backTimer = null;
  let flyTimer = null;
  let lastT = "";
  let focused = false;

  const recording = () => { try { return Boolean(mic.rec) || mic.mode === "transcribing"; } catch { return false; } }; // mic quyida e'lon qilinadi
  const wantCenter = () =>
    ACTIVE.has($("#stageSlot").dataset.state) || state.busy || recording() ||
    (focused && state.tab === "agent") || ($("#taskInput").value.trim() !== "" && state.tab === "agent");

  function setMode(m) {
    if (m === mode) return;
    mode = m;
    document.body.classList.toggle("av-center", m === "center");
    canvas.classList.add("flying");
    clearTimeout(flyTimer);
    flyTimer = setTimeout(() => canvas.classList.remove("flying"), 850);
  }
  /** Holat o'zgarganda chaqiriladi: markazga darhol, logoga — biroz kutib (agent gapini tugatgach). */
  function update() {
    if (wantCenter()) {
      clearTimeout(backTimer);
      backTimer = null;
      setMode("center");
    } else if (mode === "center" && !backTimer) {
      backTimer = setTimeout(() => { backTimer = null; if (!wantCenter()) setMode("logo"); }, 2200);
    }
  }
  // Har kadrda canvas'ni tanlangan "langar" (logo yoki markaz joyi) ustiga qo'yamiz
  function place() {
    const slot = $("#stageSlot");
    const useCenter = mode === "center" && state.tab === "agent" && slot.offsetWidth > 0;
    const r = (useCenter ? slot : $("#logoSlot")).getBoundingClientRect();
    const size = useCenter ? r.width : r.width / ORB; // logo joyida shar logo o'lchamida ko'rinadi
    const s = size / BASE;
    const x = r.left + r.width / 2 - size / 2;
    const y = r.top + r.height / 2 - size / 2;
    const tf = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${s.toFixed(4)})`;
    if (tf !== lastT) { canvas.style.transform = tf; lastT = tf; }
    requestAnimationFrame(place);
  }
  requestAnimationFrame(place);
  const input = $("#taskInput");
  input.addEventListener("focus", () => { focused = true; update(); });
  input.addEventListener("blur", () => { focused = false; update(); });
  input.addEventListener("input", update);
  return { update };
})();

// avatar.setState → markazdagi joy o'lchami va joylashuv ham yangilanadi (speech.js ham shu orqali chaqiradi)
const rawSetState = avatar.setState;
avatar.setState = (s) => {
  rawSetState(s);
  $("#stageSlot").dataset.state = s;
  dock.update();
};
avatar.setState("idle");

// ---------- ovoz chiqarish (TTS) va "gapirish" animatsiyasi ----------
// Nutq dvigateli public/speech.js da (Avatar Lab bilan umumiy) — puls matn ritmidan hisoblanadi
const tts = window.OsonSpeech(avatar);
const speech = {
  say: (text, lang, onFrame, onEnd) => tts.say(text, { lang, voice: state.voiceOn, onFrame, onEnd }),
  stop: () => tts.stop(),
  hasVoice: (l) => tts.hasVoice(l),
};

// ---------- agent ----------
function sessionId() {
  let id = null;
  try { id = sessionStorage.getItem("osonAgentSession"); } catch { /* */ }
  if (!id) {
    id = crypto.randomUUID?.() || String(Math.random()).slice(2) + Date.now();
    try { sessionStorage.setItem("osonAgentSession", id); } catch { /* */ }
  }
  return id;
}
const SESSION = sessionId();

function renderIntro() {
  $("#introText").textContent = state.cfg.aiEnabled ? t().intro : "AI agent o'chiq: serverda GEMINI_API_KEY sozlanmagan. Narxlar va takliflar bo'limlari ishlaydi.";
  $("#taskInput").placeholder = t().placeholder;
  $("#examples").innerHTML = t().examples.map((e) => `<button class="chip" data-task="${esc(e)}">${esc(e)}</button>`).join("");
}

function newRun() {
  const run = document.createElement("div");
  run.className = "run";
  run.innerHTML = `<div class="steps" hidden><div class="steps-head"><span><b class="st-title">${esc(t().working)}</b> <span class="st-count"></span></span><span>▾</span></div></div>
    <div class="lots-peek" hidden></div><div class="order-slot"></div><div class="reply"></div>`;
  $("#feed").appendChild(run);
  run.querySelector(".steps-head").addEventListener("click", () => run.querySelector(".steps").classList.toggle("collapsed"));
  return run;
}
const scrollFeed = () => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });

async function sendTask(text, { hidden = false } = {}) {
  text = String(text || "").trim();
  if (!text || state.busy) return;
  if (!state.cfg.aiEnabled) return toast("AI agent sozlanmagan (GEMINI_API_KEY)");
  setTab("agent");
  $(".agent-view").classList.add("started");
  speech.stop();
  state.busy = true;
  $("#sendBtn").disabled = true;
  $("#taskInput").value = "";
  if (!hidden) {
    const u = document.createElement("div");
    u.className = "msg-user";
    u.textContent = text;
    $("#feed").appendChild(u);
  }
  const run = newRun();
  const steps = run.querySelector(".steps");
  const stepEls = {};
  let doneCount = 0;
  avatar.setState("thinking");
  scrollFeed();

  const onEvent = (ev) => {
    switch (ev.type) {
      case "thinking":
        if (!run.querySelector(".step.running")) avatar.setState("thinking");
        break;
      case "step": {
        steps.hidden = false;
        let el = stepEls[ev.id];
        if (!el) {
          el = document.createElement("div");
          el.className = "step running";
          el.innerHTML = `<span class="ic"></span><div><div class="lb">${esc(ev.label)}</div><div class="dt"></div></div>`;
          steps.appendChild(el);
          stepEls[ev.id] = el;
          avatar.setState("working");
          avatar.setLevel(0.5);
        }
        if (ev.status !== "running") {
          el.className = `step ${ev.status}`;
          el.querySelector(".ic").textContent = ev.status === "done" ? "✓" : "!";
          el.querySelector(".dt").textContent = ev.detail || "";
          doneCount++;
          avatar.setLevel(0.7);
        }
        run.querySelector(".st-count").textContent = `· ${doneCount}`;
        scrollFeed();
        break;
      }
      case "lots": {
        const peek = run.querySelector(".lots-peek");
        peek.hidden = false;
        peek.innerHTML = ev.items.map((l) => `<button class="peek" data-lot="${esc(l.lot_id)}"><div class="t">${esc(l.product)}</div><div class="s">${esc(l.seller || "")} · ${esc((l.region || "").slice(0, 40))}</div>
          <div class="p">${l.pricePerTonne != null ? som(l.pricePerTonne, { short: true }) + " / t" : som(l.pricePerUnit, { short: true }) + " / " + esc(l.unit)}</div></button>`).join("");
        break;
      }
      case "order":
        run.querySelector(".order-slot").replaceChildren(orderCard(ev.order));
        loadOrders();
        scrollFeed();
        break;
      case "profile":
        if (state.tab === "orders") loadProfile();
        break;
      case "form":
        run.querySelector(".order-slot").before(formCard(ev.form));
        scrollFeed();
        break;
      case "reply": {
        steps.classList.add("collapsed");
        run.querySelector(".st-title").textContent = t().done(doneCount);
        if (!doneCount) steps.hidden = true;
        avatar.setMood(ev.mood || "calm");
        const box = run.querySelector(".reply");
        speech.say(ev.text, state.lang, (n, end) => {
          box.innerHTML = mdLite(ev.text.slice(0, n)) + (end ? "" : '<span class="caret"></span>');
          if (n % 60 === 0) scrollFeed();
        }, () => setTimeout(() => avatar.setMood("calm"), 2500));
        break;
      }
      case "error":
        run.querySelector(".reply").innerHTML = `<p class="reply err">${esc(ev.error)}</p>`;
        run.querySelector(".st-title").textContent = t().failed;
        avatar.setMood("concerned");
        avatar.setState("idle");
        break;
    }
  };

  try {
    const res = await fetch("/api/agent/stream", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: SESSION, text, lang: state.lang, screen: state.tab }),
    });
    if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error || "Agent bilan aloqa yo'q");
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const chunk = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const line = chunk.split("\n").find((l) => l.startsWith("data: "));
        if (line) onEvent(JSON.parse(line.slice(6)));
      }
    }
  } catch (e) {
    onEvent({ type: "error", error: e.message });
  } finally {
    state.busy = false;
    $("#sendBtn").disabled = false;
    if ($("#avatar").dataset.state !== "speaking") avatar.setState("idle");
  }
}

// ---------- agent so'ragan forma (har bir maydon — alohida input) ----------
function formCard(form) {
  const el = document.createElement("form");
  el.className = "form-card";
  el.noValidate = true;
  const fieldHtml = (f) => {
    const id = `${form.id}_${f.key}`;
    const req = f.required ? ' <span class="req">*</span>' : "";
    const input = f.type === "select"
      ? `<select id="${id}" name="${esc(f.key)}"${f.required ? " required" : ""}><option value="">Tanlang…</option>${(f.options || []).map((o) => `<option value="${esc(o.value)}"${o.value === f.value ? " selected" : ""}>${esc(o.label)}</option>`).join("")}</select>`
      : `<input id="${id}" name="${esc(f.key)}" type="${f.type === "number" ? "number" : f.type === "tel" ? "tel" : "text"}" value="${esc(f.value || "")}" placeholder="${esc(f.placeholder || "")}"${f.required ? " required" : ""}${f.type === "tel" ? ' inputmode="tel" autocomplete="tel"' : ""}${f.key === "fullName" ? ' autocomplete="name"' : ""}/>`;
    return `<div class="fc-row" data-key="${esc(f.key)}"${f.showIf ? ` data-showif='${esc(JSON.stringify(f.showIf))}'` : ""}><label for="${id}">${esc(f.label)}${req}</label><div class="fc-input">${input}<div class="fc-err" hidden></div></div></div>`;
  };
  el.innerHTML = `<div class="fc-head"><span class="fc-icon">📋</span><div><div class="fc-title">${esc(form.title)}</div>
      <div class="hint">${form.purpose === "profile" ? "Agent arizani shu ma'lumotlar bilan to'ldiradi" : "Agent davom etishi uchun to'ldiring"}</div></div></div>
    <div class="fc-table">${form.fields.map(fieldHtml).join("")}</div>
    <div class="fc-foot"><div class="fc-msg hint"></div><button class="btn" type="submit">Yuborish</button></div>`;
  const applyShowIf = () => {
    el.querySelectorAll("[data-showif]").forEach((row) => {
      const cond = JSON.parse(row.dataset.showif);
      const ok = Object.entries(cond).every(([k, vals]) => vals.includes(el.elements[k]?.value));
      row.hidden = !ok;
      const inp = row.querySelector("input,select");
      inp.required = ok;
      row.querySelector("label .req")?.remove();
      if (ok) row.querySelector("label").insertAdjacentHTML("beforeend", ' <span class="req">*</span>');
    });
  };
  el.addEventListener("change", applyShowIf);
  applyShowIf();
  el.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (state.busy) return toast("Agent hali ishlayapti, biroz kuting");
    // Maydonlarni tekshirish
    let bad = false;
    el.querySelectorAll(".fc-row").forEach((row) => {
      const inp = row.querySelector("input,select");
      const err = row.querySelector(".fc-err");
      let msg = "";
      if (!row.hidden && inp.required && !inp.value.trim()) msg = "To'ldirilishi shart";
      else if (inp.name === "phone" && inp.value && inp.value.replace(/\D/g, "").length < 9) msg = "Telefon raqami noto'g'ri";
      else if (inp.name === "tin" && !row.hidden && inp.value && inp.value.replace(/\D/g, "").length !== 9) msg = "STIR 9 ta raqam";
      err.textContent = msg;
      err.hidden = !msg;
      row.classList.toggle("invalid", Boolean(msg));
      if (msg && !bad) { inp.focus(); bad = true; }
    });
    if (bad) return;
    const values = {};
    el.querySelectorAll(".fc-row").forEach((row) => {
      const inp = row.querySelector("input,select");
      if (!row.hidden && inp.value.trim()) values[inp.name] = inp.value.trim();
    });
    const btn = el.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      if (form.purpose === "profile") {
        await api("/api/profile", { method: "PUT", body: values });
        if (state.tab === "orders") loadProfile();
      }
      // Forma qulflanadi va qisqa xulosa ko'rsatiladi
      el.classList.add("done");
      el.querySelectorAll("input,select").forEach((i) => (i.disabled = true));
      el.querySelector(".fc-foot").innerHTML = `<div class="hint up">✓ Yuborildi</div>`;
      const labels = Object.fromEntries(form.fields.map((f) => [f.key, f]));
      const summary = Object.entries(values).map(([k, v]) => {
        const f = labels[k];
        const shown = f?.options?.find((o) => o.value === v)?.label || v;
        return `${f?.label || k}: ${shown}`;
      }).join("; ");
      sendTask(form.purpose === "profile"
        ? `[FORM ${form.id} profile] Foydalanuvchi formani to'ldirdi, profil saqlandi (${summary}). Vazifani davom ettir.`
        : `[FORM ${form.id}] ${JSON.stringify(values)}`, { hidden: true });
    } catch (e) {
      btn.disabled = false;
      el.querySelector(".fc-msg").innerHTML = `<span class="down">${esc(e.message)}</span>`;
    }
  });
  return el;
}

// ---------- buyurtma kartasi ----------
function orderCard(o) {
  const el = document.createElement("div");
  el.className = "order-card";
  el.dataset.order = o.id;
  const st = { awaiting_confirmation: t().awaiting, submitted: t().submitted, cancelled: t().cancelled }[o.status];
  el.innerHTML = `
    <div class="oc-top">
      <div><div class="oc-label">${esc(t().order)} · lot №${esc(o.lotId)}</div><div class="oc-title">${esc(o.product)}</div><div class="hint">${esc(o.seller || "")}</div></div>
      <div><div class="oc-total">${som(o.total)}</div><div style="text-align:right;margin-top:4px"><span class="status ${o.status}">${esc(st)}</span></div></div>
    </div>
    <dl class="kv">
      <dt>Miqdor</dt><dd>${o.contracts} lot × ${qty(o.qtyPerContract)} ${esc(o.unit)} = <b>${qty(o.quantity)} ${esc(o.unit)}</b></dd>
      <dt>Depozit</dt><dd>${o.depositPct ?? "—"}% — ${som(o.depositSum)}</dd>
      <dt>Savdo kuni</dt><dd>${dateUz(o.tradingDate)}${o.exchangeRef ? ` · ${esc(o.exchangeRef)}` : ""}</dd>
      <dt>Ombor</dt><dd>${esc(o.location || "—")}</dd>
      <dt>Xaridor</dt><dd>${esc(o.buyer?.fullName || "—")} · ${esc(o.buyer?.phone || "")}</dd>
    </dl>
    ${o.reason ? `<div class="oc-reason">${esc(o.reason)}</div>` : ""}
    <div class="oc-actions">
      ${o.status === "awaiting_confirmation" ? `<button class="btn big" data-oc="confirm">${esc(t().confirm)}</button><button class="btn ghost" data-oc="cancel">${esc(t().cancel)}</button>` : ""}
      <button class="btn ghost" data-oc="app">${esc(t().app)}</button>
      <a class="btn ghost" href="${esc(o.url)}" target="_blank" rel="noopener">UZEX ↗</a>
    </div>
    ${o.timeline?.length > 1 ? `<ul class="timeline">${o.timeline.map((x) => `<li>${esc(x.text)}</li>`).join("")}</ul>` : ""}`;
  return el;
}
async function orderAction(id, act, btn) {
  if (act === "app") return showApplication(id);
  btn.disabled = true;
  try {
    const o = await api(`/api/orders/${id}/${act}`, {});
    $$(`[data-order="${id}"]`).forEach((c) => c.replaceWith(orderCard(o)));
    loadOrders();
    if (act === "confirm") {
      avatar.setMood("excited");
      avatar.setLevel(1);
      // Agent yakuniy qadamlarni o'zi bajaradi va xulosa beradi
      sendTask(`[SYSTEM] Buyurtma ${id} foydalanuvchi tomonidan tasdiqlandi.`, { hidden: true });
    } else toast("Buyurtma bekor qilindi");
  } catch (e) {
    toast(e.message);
    btn.disabled = false;
  }
}
async function showApplication(id) {
  try {
    const txt = await api(`/api/orders/${id}/application`);
    openModal("Xarid arizasi", "Agent avtomatik to'ldirdi", `<pre class="app" id="appText">${esc(txt)}</pre>
      <div class="oc-actions"><button class="btn" data-copy>Nusxa olish</button><button class="btn ghost" data-print>Chop etish</button></div>`);
  } catch (e) { toast(e.message); }
}

// ---------- ovoz bilan vazifa (STT) ----------
// Vidjet: [✕ bekor] [jonli to'lqin] [■ to'xtatish → matnni tahrirlash] [↑ yuborish]
const mic = { rec: null, chunks: [], stream: null, raf: 0, ctx: null, levels: [], lastPush: 0, mode: null, mime: "" };
const BAR_W = 3, BAR_GAP = 3;

async function startRecording() {
  if (mic.rec || mic.mode === "transcribing") return;
  if (state.busy) return toast("Agent hozir ishlayapti, biroz kuting");
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return toast("Brauzeringiz ovoz yozishni qo'llamaydi");
  if (!state.cfg.aiEnabled) return toast("AI agent sozlanmagan");
  try {
    mic.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch {
    return toast("Mikrofonga ruxsat berilmadi");
  }
  speech.stop();
  setTab("agent");
  mic.mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((m) => MediaRecorder.isTypeSupported?.(m)) || "";
  mic.rec = new MediaRecorder(mic.stream, mic.mime ? { mimeType: mic.mime } : undefined);
  mic.chunks = [];
  mic.levels = [];
  mic.rec.ondataavailable = (e) => e.data.size && mic.chunks.push(e.data);
  mic.rec.start(250);
  $("#composer").classList.add("recording");
  avatar.setState("listening");

  mic.ctx = new (window.AudioContext || window.webkitAudioContext)();
  const an = mic.ctx.createAnalyser();
  an.fftSize = 1024;
  mic.ctx.createMediaStreamSource(mic.stream).connect(an);
  const buf = new Uint8Array(an.fftSize);
  const canvas = $("#wave");
  const ctx2d = canvas.getContext("2d");
  const tick = (now) => {
    an.getByteTimeDomainData(buf);
    let sum = 0;
    for (const v of buf) sum += (v - 128) ** 2;
    const lvl = Math.min(1, Math.sqrt(sum / buf.length) / 38);
    avatar.drive(lvl);
    // Har ~70 ms da bitta ustuncha: yangisi o'ngda, eskilari chapga suriladi
    if (!mic.lastPush || now - mic.lastPush > 70) { mic.levels.push(lvl); mic.lastPush = now; if (mic.levels.length > 600) mic.levels.shift(); }
    drawWave(canvas, ctx2d);
    mic.raf = requestAnimationFrame(tick);
  };
  mic.raf = requestAnimationFrame(tick);
}
function drawWave(canvas, g) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  const step = BAR_W + BAR_GAP;
  const n = Math.floor(w / step);
  const lv = mic.levels.slice(-n);
  const offset = w - lv.length * step; // to'lqin o'ngdan boshlanadi
  for (let i = 0; i < n; i++) {
    const x = i * step + 1;
    const idx = i - (n - lv.length);
    if (idx < 0) { // hali yozilmagan joy — xira nuqtalar
      g.fillStyle = "rgba(138,138,156,.25)";
      g.fillRect(x, h / 2 - 1, BAR_W, 2);
      continue;
    }
    const v = Math.pow(lv[idx], 0.7);
    const bh = Math.max(2, v * (h - 6));
    g.fillStyle = "rgba(170,170,186,.85)";
    g.beginPath();
    g.roundRect ? g.roundRect(offset + idx * step + 1, (h - bh) / 2, BAR_W, bh, 1.5) : g.rect(offset + idx * step + 1, (h - bh) / 2, BAR_W, bh);
    g.fill();
  }
}
function teardownRecording() {
  cancelAnimationFrame(mic.raf);
  mic.stream?.getTracks().forEach((tr) => tr.stop());
  mic.ctx?.close();
  mic.stream = mic.ctx = null;
  mic.lastPush = 0;
}
/** ✕ — yozuv o'chiriladi, hech narsa yuborilmaydi. */
function cancelRecording() {
  if (!mic.rec) return;
  mic.rec.ondataavailable = null;
  mic.rec.onstop = null;
  try { mic.rec.stop(); } catch { /* */ }
  mic.rec = null;
  mic.chunks = [];
  teardownRecording();
  $("#composer").classList.remove("recording");
  avatar.setState("idle");
}
/** ■ (send=false) — matn kiritish maydoniga tushadi; ↑ (send=true) — darhol agentga yuboriladi. */
async function finishRecording(send) {
  if (!mic.rec) return;
  const rec = mic.rec;
  mic.mode = "transcribing";
  $("#composer").classList.add("transcribing");
  avatar.setState("thinking");
  const stopped = new Promise((ok) => (rec.onstop = ok));
  try { rec.stop(); } catch { /* */ }
  await stopped;
  mic.rec = null;
  teardownRecording();
  const blob = new Blob(mic.chunks, { type: rec.mimeType || mic.mime || "audio/webm" });
  const done = () => {
    mic.mode = null;
    $("#composer").classList.remove("recording", "transcribing");
    $("#taskInput").placeholder = t().placeholder;
  };
  try {
    if (blob.size < 1500) throw new Error("Ovoz juda qisqa — qaytadan urinib ko'ring");
    const data = await new Promise((ok, bad) => {
      const r = new FileReader();
      r.onload = () => ok(String(r.result).split(",")[1]);
      r.onerror = bad;
      r.readAsDataURL(blob);
    });
    const { text } = await api("/api/transcribe", { body: { data, mimeType: blob.type, lang: state.lang } });
    done();
    avatar.setState("idle");
    if (!text) return toast("Ovozdan matn ajratib bo'lmadi");
    if (send) sendTask(text);
    else {
      const inp = $("#taskInput");
      inp.value = text;
      inp.focus();
      inp.setSelectionRange(text.length, text.length);
    }
  } catch (e) {
    done();
    avatar.setState("idle");
    toast(e.message);
  }
}

// ---------- modal ----------
function openModal(title, sub, html) {
  $("#modalTitle").textContent = title;
  $("#modalSub").textContent = sub || "";
  $("#modalContent").innerHTML = html;
  $("#modal").hidden = false;
}
const closeModal = () => { $("#modal").hidden = true; state.lot = null; };

// ---------- narxlar ----------
async function loadOverview() {
  try {
    state.overview = await api("/api/overview");
    renderDaily();
  } catch { /* */ }
}
function priceCard(q) {
  return `<button class="card" data-price="${esc(q.name)}"><span class="ico">${q.category.icon}</span><div class="body">
    <div class="t">${esc(q.name)}</div><div class="s">${q.week ? esc(q.week) + " · " : ""}1 ${esc(q.unit)} uchun</div>
    <div class="p"><b>${som(q.price, { short: true })}</b><span class="pill ${cls(q.changePct)}">${pct(q.changePct)}</span></div>
    ${q.everyday ? `<div class="s">${esc(q.everyday.label)} ≈ ${som(q.everyday.price)}</div>` : ""}</div></button>`;
}
let priceReq = 0;
async function loadPrices() {
  const my = ++priceReq;
  $("#priceList").innerHTML = skeleton(4);
  try {
    const r = await api(`/api/prices?q=${encodeURIComponent($("#priceQ").value.trim())}&category=${encodeURIComponent(state.priceCat)}`);
    if (my !== priceReq) return;
    state.weekly = r.items;
    $("#priceInfo").textContent = `${r.total} ta tovar${r.total > r.items.length ? ` (birinchi ${r.items.length} tasi)` : ""} · narx — oxirgi savdo haftasidagi birja kotirovkasi`;
    $("#priceList").innerHTML = r.items.length ? r.items.map(priceCard).join("") : emptyBox("Hech narsa topilmadi. Masalan: <b>sement</b>, <b>benzin</b>, <b>bug'doy</b>.");
  } catch (e) {
    if (my === priceReq) $("#priceList").innerHTML = emptyBox(esc(e.message));
  }
}
function renderCats() {
  const all = [{ id: "", name: "Hammasi", icon: "" }, ...state.cfg.categories];
  $("#priceCats").innerHTML = all.map((c) => `<button class="chip${c.id === state.priceCat ? " active" : ""}" data-pricecat="${c.id}">${c.icon ? c.icon + " " : ""}${esc(c.name)}</button>`).join("");
}
function spark(points, w = 160, h = 34) {
  if (!points?.length) return "";
  const min = Math.min(...points), max = Math.max(...points), span = max - min || 1;
  const d = points.map((p, i) => `${i ? "L" : "M"}${((i / (points.length - 1 || 1)) * w).toFixed(1)},${(h - 3 - ((p - min) / span) * (h - 6)).toFixed(1)}`).join("");
  const c = points.at(-1) > points[0] ? "var(--up)" : points.at(-1) < points[0] ? "var(--down)" : "#7a7aff";
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><path d="${d}" fill="none" stroke="${c}" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
}
function renderDaily() {
  const list = state.overview?.daily || [];
  $("#dailyList").innerHTML = list.length
    ? list.map((x) => `<button class="mini" data-price="${esc(x.name)}"><div class="t">${x.category.icon} ${esc(x.name)}</div>${spark(x.points)}<div class="hint"><b style="color:var(--text)">${som(x.price, { short: true })}</b> <span class="${cls(x.changePct)}">${pct(x.changePct)}</span></div></button>`).join("")
    : emptyBox("Kunlik dinamika hozircha mavjud emas.");
}
function findQuote(name) {
  return state.weekly?.find((q) => q.name === name) || state.overview?.quotes.find((q) => q.name === name) || state.overview?.daily.find((q) => q.name === name);
}
function openPrice(name) {
  const q = findQuote(name);
  if (!q) return;
  const d = state.overview?.daily.find((x) => x.name === name);
  const word = q.name.split(/[\s(]/)[0];
  openModal(q.name, `${q.category.icon} ${q.category.name}${q.week ? " · hafta " + q.week : ""}`, `
    <div class="big-price">${som(q.price)} <span class="pill ${cls(q.changePct)}" style="font-size:14px">${pct(q.changePct)}</span></div>
    <div class="hint">1 ${esc(q.unit)} uchun birja kotirovkasi</div>
    ${q.everyday ? `<div class="everyday">Oddiy hisobda: <b>${esc(q.everyday.label)} ≈ ${som(q.everyday.price)}</b></div>` : ""}
    ${d ? `<div class="chart" id="pChart"><div class="chart-tip" hidden></div></div><div class="hint" style="text-align:center">Oxirgi 10 savdo kuni: <b class="${cls(d.changePct)}">${pct(d.changePct)}</b></div>` : ""}
    <div class="oc-actions"><button class="btn big" data-delegate="${esc(`${word} sotib olmoqchiman — eng ma'qul taklifni topib, buyurtmani tayyorla`)}">✦ Agentga topshirish</button>
    <button class="btn ghost" data-findlots="${esc(word)}">Sotuvdagi takliflar</button></div>`);
  if (d) drawChart($("#pChart"), d.points, d.days.map((x) => `${x}-kun`));
}
function drawChart(chart, pts, labels) {
  const W = 600, H = 200, P = 6;
  const min = Math.min(...pts), max = Math.max(...pts), span = max - min || 1;
  const x = (i) => P + (i / (pts.length - 1 || 1)) * (W - 2 * P);
  const y = (v) => P + (1 - (v - min) / span) * (H - 2 * P);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p).toFixed(1)}`).join("");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.innerHTML = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5b7bff"/><stop offset="1" stop-color="#f062b4"/></linearGradient>
    <linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7a6bff" stop-opacity=".25"/><stop offset="1" stop-color="#7a6bff" stop-opacity="0"/></linearGradient></defs>
    <path d="${line}L${x(pts.length - 1)},${H}L${x(0)},${H}Z" fill="url(#f)"/><path d="${line}" fill="none" stroke="url(#g)" stroke-width="2.5" vector-effect="non-scaling-stroke"/>`;
  chart.appendChild(svg);
  const tip = chart.querySelector(".chart-tip");
  svg.addEventListener("pointermove", (ev) => {
    const r = svg.getBoundingClientRect();
    const rel = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
    const i = Math.round(rel * (pts.length - 1));
    tip.hidden = false;
    tip.style.left = Math.min(r.width - 70, Math.max(70, rel * r.width)) + "px";
    tip.textContent = `${som(pts[i])} · ${labels[i] || ""}`;
  });
  svg.addEventListener("pointerleave", () => (tip.hidden = true));
}

// ---------- lotlar ----------
const LOT_CHIPS = ["sement", "armatura", "benzin", "dizel", "un", "bug'doy", "paxta yog'i", "shifer", "ko'mir", "o'g'it"];
let lotReq = 0;
async function loadLots() {
  const q = $("#lotQ").value.trim();
  if (!q) {
    $("#lotInfo").textContent = "";
    $("#lotList").innerHTML = emptyBox("Nima kerakligini yozing yoki tayyor tugmalardan birini bosing. Yoki pastdagi maydonda agentga vazifa bering — u o'zi topib beradi.");
    return;
  }
  const my = ++lotReq;
  $("#lotList").innerHTML = skeleton(6);
  try {
    const r = await api(`/api/lots?${new URLSearchParams({ q, region: $("#lotRegion").value, sort: $("#lotSort").value })}`);
    if (my !== lotReq) return;
    $("#lotInfo").innerHTML = r.total ? `“${esc(q)}”${r.query.toLowerCase() !== q.toLowerCase() ? ` (birjada: ${esc(r.query)})` : ""} — <b>${r.total}</b> ta taklif · narx — bazis (boshlang'ich) narx` : "";
    $("#lotList").innerHTML = r.items.length
      ? r.items.map((l) => `<button class="card" data-lot="${esc(l.id)}"><span class="ico">${l.category.icon}</span><div class="body">
          <div class="t">${esc(l.product)}</div><div class="s">${esc(l.seller || "Sotuvchi ko'rsatilmagan")} · 📍 ${esc(l.region)}</div>
          <div class="p"><b>${l.perTonne != null ? som(l.perTonne, { short: true }) + " / tonna" : som(l.perUnit, { short: true }) + " / " + esc(l.unit)}</b><span class="hint">1 lot = ${qty(l.qty)} ${esc(l.unit)}</span></div>
          ${l.everyday ? `<div class="s">${esc(l.everyday.label)} ≈ ${som(l.everyday.price)}</div>` : ""}</div></button>`).join("")
      : emptyBox("Bu so'rov bo'yicha taklif topilmadi.");
  } catch (e) {
    if (my === lotReq) $("#lotList").innerHTML = emptyBox(esc(e.message));
  }
}
async function openLot(id) {
  openModal(`Lot №${id}`, "", skeleton(2));
  try {
    const l = await api(`/api/lots/${encodeURIComponent(id)}`);
    state.lot = l;
    $("#modalTitle").textContent = l.product;
    $("#modalSub").textContent = l.seller ? `Sotuvchi: ${l.seller} · lot №${l.id}` : `Lot №${l.id}`;
    $("#modalContent").innerHTML = `
      <div class="big-price">${som(l.total)}</div>
      <div class="hint">1 lot (${qty(l.qty)} ${esc(l.unit)}) uchun bazis narx · ${l.perTonne != null ? som(l.perTonne) + " / tonna" : som(l.perUnit) + " / " + esc(l.unit)}</div>
      ${l.everyday ? `<div class="everyday">Oddiy hisobda: <b>${esc(l.everyday.label)} ≈ ${som(l.everyday.price)}</b></div>` : ""}
      <dl class="kv">
        <dt>Depozit</dt><dd>${l.depositPct != null ? `${l.depositPct}% — ${som(l.depositSum)} (kafolat puli)` : "—"}</dd>
        <dt>Yetkazish</dt><dd>${l.pickupYourself ? "EXW — ombordan o'zingiz olib ketasiz" : esc(l.deliveryBasis || "—")}</dd>
        <dt>Ombor</dt><dd>📍 ${esc(l.location || "—")}</dd>
        <dt>To'lov</dt><dd>${esc(l.paymentForm || "—")}</dd>
        <dt>UZEX</dt><dd><a href="${esc(l.url)}" target="_blank" rel="noopener">Saytda ko'rish ↗</a></dd>
      </dl>
      ${l.specialTerms && l.specialTerms !== "-" ? `<div class="special">${esc(l.specialTerms)}</div>` : ""}
      <div class="calc"><b>Necha lot kerak?</b>
        <div class="stepper"><button data-step="-1" aria-label="Kamaytirish">−</button><input id="lCount" type="number" min="1" max="1000" value="1" inputmode="numeric" aria-label="Lotlar soni"/><button data-step="1" aria-label="Ko'paytirish">+</button><span class="hint" id="lQty"></span></div>
        <div class="hint" id="lCalc"></div>
        <div class="oc-actions"><button class="btn big" id="lDelegate">✦ Agent buyurtma qilsin</button></div>
      </div>`;
    renderLotCalc();
  } catch (e) {
    $("#modalContent").innerHTML = emptyBox(esc(e.message));
  }
}
function renderLotCalc() {
  const l = state.lot;
  if (!l) return;
  const n = Math.max(1, Math.min(1000, Math.floor(Number($("#lCount").value) || 1)));
  const total = l.total * n;
  $("#lQty").textContent = `= ${qty(l.qty * n)} ${l.unit}`;
  $("#lCalc").innerHTML = `Jami (bazis narx): <b style="color:var(--text)">${som(total)}</b> · depozit: ${l.depositPct != null ? som((total * l.depositPct) / 100) : "—"}`;
}

// ---------- buyurtmalar va profil ----------
async function loadOrders() {
  state.orders = await api("/api/orders").catch(() => []);
  const n = state.orders.filter((o) => o.status !== "cancelled").length;
  $("#orderCount").textContent = n;
  $("#orderCount").hidden = !n;
  if (state.tab === "orders") renderOrders();
}
function renderOrders() {
  const list = $("#orderList");
  list.replaceChildren();
  if (!state.orders.length) {
    list.innerHTML = emptyBox("Hali buyurtma yo'q. Pastdagi maydonda agentga vazifa bering — masalan: “Toshkentda 20 tonna sement kerak”.");
    return;
  }
  state.orders.forEach((o) => list.appendChild(orderCard(o)));
}
async function loadProfile() {
  const p = await api("/api/profile").catch(() => ({}));
  const f = (k, label, type = "text", ph = "") => `<div class="field"><label for="pf_${k}">${label}</label><input id="pf_${k}" name="${k}" type="${type}" value="${esc(p[k] || "")}" placeholder="${esc(ph)}"/></div>`;
  $("#profileCard").innerHTML = `<h3>Xaridor ma'lumotlari</h3><div class="hint">Agent arizani shu ma'lumotlar bilan to'ldiradi. Bo'sh bo'lsa, agentning o'zi so'raydi.</div>
    <form class="fields" id="profileForm">
      ${f("fullName", "F.I.Sh yoki korxona nomi", "text", "Ali Valiyev")}
      <div class="field"><label for="pf_entityType">Maqomi</label><select id="pf_entityType" name="entityType"><option value="">—</option>
        ${[["jismoniy", "Jismoniy shaxs"], ["yatt", "YaTT"], ["yuridik", "Yuridik shaxs"]].map(([v, l]) => `<option value="${v}" ${p.entityType === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      ${f("tin", "STIR (YaTT/yuridik)", "text", "9 ta raqam")}
      ${f("phone", "Telefon", "tel", "+998 90 123 45 67")}
      ${f("region", "Hudud", "text", "Toshkent")}
      <div class="field" style="align-self:end"><button class="btn" type="submit" style="width:100%">Saqlash</button></div>
    </form>`;
}

// ---------- navigatsiya ----------
function setTab(tab) {
  state.tab = tab;
  $$(".view").forEach((v) => v.classList.toggle("active", v.dataset.view === tab));
  $$(".seg button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  if (tab === "prices" && !state.weekly) { renderCats(); loadPrices(); }
  if (tab === "lots" && !$("#lotList").innerHTML) loadLots();
  if (tab === "orders") { loadProfile(); loadOrders().then(renderOrders); }
  if (tab !== "agent") window.scrollTo({ top: 0 });
  dock.update();
}
function setLang(l) {
  state.lang = T[l] ? l : "uz";
  store.set("osonLang", state.lang);
  $$(".langs button").forEach((b) => b.classList.toggle("active", b.dataset.lang === state.lang));
  document.documentElement.lang = state.lang;
  renderIntro();
}

// ---------- hodisalar ----------
document.addEventListener("click", (ev) => {
  const b = ev.target.closest("button, [data-close]");
  if (!b) return;
  const d = b.dataset;
  if (b.matches("[data-close]")) return closeModal();
  if (d.tab) return setTab(d.tab);
  if (d.lang) return setLang(d.lang);
  if (d.task) return sendTask(d.task);
  if (d.delegate) { closeModal(); return sendTask(d.delegate); }
  if (d.findlots) { closeModal(); $("#lotQ").value = d.findlots; setTab("lots"); return loadLots(); }
  if (d.price) return openPrice(d.price);
  if (d.lot) return openLot(d.lot);
  if (d.pricecat != null) { state.priceCat = d.pricecat; renderCats(); return loadPrices(); }
  if (d.lotchip) { $("#lotQ").value = d.lotchip; return loadLots(); }
  if (d.step) { const i = $("#lCount"); i.value = Math.max(1, Math.min(1000, (Number(i.value) || 1) + Number(d.step))); return renderLotCalc(); }
  if (d.oc) return orderAction(b.closest("[data-order]").dataset.order, d.oc, b);
  if (d.copy != null) return navigator.clipboard?.writeText($("#appText").textContent).then(() => toast("Nusxa olindi"), () => toast("Nusxa olib bo'lmadi"));
  if (d.print != null) {
    const w = window.open("", "_blank");
    if (!w) return toast("Chop etish oynasi bloklandi");
    w.document.write(`<pre style="font:14px/1.6 monospace;white-space:pre-wrap">${esc($("#appText").textContent)}</pre>`);
    w.document.close();
    return w.print();
  }
  if (b.id === "lDelegate") {
    const l = state.lot;
    const n = Math.max(1, Math.floor(Number($("#lCount").value) || 1));
    closeModal();
    return sendTask(`Lot №${l.id} (${l.product}${l.seller ? ", " + l.seller : ""}) dan ${n} lot buyurtma qilib ber.`);
  }
  if (b.id === "micBtn") return startRecording();
  if (b.id === "recCancel") return cancelRecording();
  if (b.id === "recStop") return finishRecording(false);
  if (b.id === "voiceToggle") {
    state.voiceOn = !state.voiceOn;
    store.set("osonVoice", state.voiceOn ? "1" : "0");
    b.setAttribute("aria-pressed", String(state.voiceOn));
    b.textContent = state.voiceOn ? "🔊" : "🔈";
    if (!state.voiceOn) speech.stop();
    return toast(state.voiceOn ? (speech.hasVoice(state.lang) ? "Agent ovozi yoqildi" : "Ovoz yoqildi, lekin brauzerda bu til uchun ovoz topilmadi") : "Agent ovozi o'chirildi");
  }
});
document.addEventListener("input", (ev) => { if (ev.target.id === "lCount") renderLotCalc(); });
document.addEventListener("change", (ev) => { if (ev.target.id === "lotRegion" || ev.target.id === "lotSort") loadLots(); });
document.addEventListener("submit", async (ev) => {
  const f = ev.target;
  ev.preventDefault();
  if (f.id === "composer") return mic.rec ? finishRecording(true) : sendTask($("#taskInput").value);
  if (f.id === "priceForm") return loadPrices();
  if (f.id === "lotForm") return loadLots();
  if (f.id === "profileForm") {
    const body = Object.fromEntries(new FormData(f).entries());
    Object.keys(body).forEach((k) => !body[k] && delete body[k]);
    try { await api("/api/profile", { method: "PUT", body }); toast("Saqlandi"); loadProfile(); } catch (e) { toast(e.message); }
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (mic.rec) return cancelRecording();
  if (!$("#modal").hidden) closeModal();
});

// ---------- ishga tushirish ----------
(async function init() {
  $("#voiceToggle").setAttribute("aria-pressed", String(state.voiceOn));
  $("#voiceToggle").textContent = state.voiceOn ? "🔊" : "🔈";
  $("#lotChips").innerHTML = LOT_CHIPS.map((c) => `<button class="chip" data-lotchip="${esc(c)}">${esc(c)}</button>`).join("");
  try { state.cfg = await api("/api/config"); } catch { /* */ }
  $("#lotRegion").insertAdjacentHTML("beforeend", state.cfg.regions.map((r) => `<option>${esc(r)}</option>`).join(""));
  setLang(state.lang);
  loadOverview();
  loadOrders();
})();
