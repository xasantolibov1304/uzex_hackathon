// UZEX 2.0 — avtonom AI agent uchun frontend (React)
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { OsonAvatar } from "./lib/avatar.js";
import { OsonSpeech } from "./lib/speech.js";
import { createDock } from "./lib/dock.js";
import { api, fetchTts, sessionId, streamAgent } from "./lib/api.js";
import { T, tr } from "./lib/i18n.js";
import { esc, mdLite, store } from "./lib/format.js";
import { useLiveState, useLots, usePrices } from "./hooks/useSearch.js";
import { useRecorder } from "./hooks/useRecorder.js";
import AgentView from "./components/AgentView.jsx";
import PricesView from "./components/PricesView.jsx";
import LotsView from "./components/LotsView.jsx";
import OrdersView from "./components/OrdersView.jsx";
import AlertsView from "./components/AlertsView.jsx";
import { deviceId } from "./lib/push.js";
import { ApplicationModal, LotModal, PriceModal } from "./components/Modals.jsx";

const SESSION = sessionId();
const TABS = [["agent", "Agent"], ["prices", "Narxlar"], ["lots", "Sotuvda"], ["alerts", "Kuzatuv"], ["orders", "Buyurtmalar"]];
const snapshot = (m) => ({ ...m, steps: m.steps.map((s) => ({ ...s })), forms: [...m.forms], alerts: [...m.alerts], alertOffers: [...m.alertOffers], charts: [...m.charts] });

export default function App() {
  const [cfg, setCfg, cfgRef] = useLiveState({ aiEnabled: false, categories: [], regions: [] });
  const [ready, setReady] = useState(false); // /api/config so'rovi tugadimi
  const [lang, setLangState, langRef] = useLiveState(() => store.get("osonLang") || "uz");
  const [voiceOn, setVoiceOn, voiceRef] = useLiveState(() => store.get("osonVoice") !== "0");
  const [tab, setTabState, tabRef] = useLiveState("agent");
  const [busy, setBusy, busyRef] = useLiveState(false);
  const [started, setStarted] = useState(false);
  const [feed, setFeed] = useState([]);
  const [ordersById, setOrdersById] = useState({});
  const [orders, setOrders] = useState([]);
  const [profile, setProfile] = useState(null);
  const [profileVer, setProfileVer] = useState(0);
  const [overview, setOverview, overviewRef] = useLiveState(null);
  const [modal, setModal, modalRef] = useLiveState(null);
  const [toastState, setToastState] = useState({ msg: "", shown: false });
  const [taskText, setTaskText, taskTextRef] = useLiveState("");
  const [scrollTick, setScrollTick] = useState(0);

  const prices = usePrices();
  const lots = useLots();
  const t = tr(lang);

  const canvasRef = useRef(null);
  const stageSlotRef = useRef(null);
  const logoSlotRef = useRef(null);
  const inputRef = useRef(null);
  const avatarRef = useRef(null);
  const speechRef = useRef(null);
  const dockRef = useRef(null);
  const focusedRef = useRef(false);
  const runsRef = useRef(new Map());
  const seq = useRef(0);
  const toastTimer = useRef(0);

  // ---------- toast ----------
  const toast = useCallback((msg) => {
    setToastState({ msg, shown: true });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastState((s) => ({ ...s, shown: false })), 3200);
  }, []);

  // ---------- avatar va nutq (mount bo'lgach haqiqiy obyektga uzatiladi) ----------
  const avatar = useMemo(() => ({
    setState: (s) => avatarRef.current?.setState(s),
    setMood: (m) => avatarRef.current?.setMood(m),
    setLevel: (v) => avatarRef.current?.setLevel(v),
    drive: (v) => avatarRef.current?.drive(v),
  }), []);
  const speech = useMemo(() => ({
    say: (text, l, onFrame, onEnd, extra = {}) => speechRef.current?.say(text, { lang: l, voice: voiceRef.current, onFrame, onEnd, ...extra }),
    stop: () => speechRef.current?.stop(),
    hasVoice: (l) => Boolean(speechRef.current?.hasVoice(l)),
  }), [voiceRef]);
  const dockUpdate = () => dockRef.current?.update();

  // ---------- ma'lumot yuklash ----------
  const loadOrders = useCallback(async () => {
    const list = await api("/api/orders").catch(() => []);
    setOrders(list);
    return list;
  }, []);
  const loadProfile = useCallback(async () => {
    const p = await api("/api/profile").catch(() => ({}));
    setProfile(p);
    setProfileVer((v) => v + 1);
  }, []);
  const loadOverview = useCallback(async () => {
    try { setOverview(await api("/api/overview")); } catch { /* */ }
  }, [setOverview]);

  // ---------- navigatsiya ----------
  function setTab(next) {
    setTabState(next);
    if (next === "prices" && !prices.weeklyRef.current) prices.load();
    if (next === "lots" && !lots.startedRef.current) lots.load();
    if (next === "orders") { loadProfile(); loadOrders(); }
    if (next !== "agent") window.scrollTo({ top: 0 });
    dockUpdate();
  }
  function setLang(l) {
    const v = T[l] ? l : "uz";
    setLangState(v);
    store.set("osonLang", v);
    document.documentElement.lang = v;
  }
  const closeModal = () => setModal(null);
  const scrollFeed = () => setScrollTick((n) => n + 1);

  // ---------- agent ----------
  async function sendTask(raw, { hidden = false } = {}) {
    const text = String(raw || "").trim();
    if (!text || busyRef.current) return;
    if (!cfgRef.current.aiEnabled) return toast("AI agent sozlanmagan (GEMINI_API_KEY)");
    setTab("agent");
    setStarted(true);
    speech.stop();
    setBusy(true);
    setTaskText("");
    const tt = () => tr(langRef.current);
    const n = ++seq.current;
    const run = { kind: "run", id: `r${n}`, title: tt().working, count: "", stepsHidden: true, collapsed: false, steps: [], lots: null, forms: [], alerts: [], alertOffers: [], charts: [], orderId: null, replyHtml: "" };
    runsRef.current.set(run.id, run);
    setFeed((f) => [...f, ...(hidden ? [] : [{ kind: "user", id: `u${n}`, text }]), snapshot(run)]);
    const commit = () => { const snap = snapshot(run); setFeed((f) => f.map((it) => (it.id === run.id ? snap : it))); };
    let doneCount = 0;
    avatar.setState("thinking");
    scrollFeed();

    // ---------- Qadamlarni birma-bir ko'rsatish ----------
    // Server hodisalari juda tez (va parallel) keladi. Foydalanuvchi agent nima qilayotganini ko'rishi uchun
    // ular navbatga olinadi va BITTADAN o'ynatiladi: har bir qadam kamida STEP_MIN davomida "bajarilmoqda"
    // holatida turadi, so'ng natijasi chiqadi. Qadamlar orasida — "o'ylayapman" bosqichlari.
    const STEP_MIN = 1150, THINK_MIN = 900, GAP = 280;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const queue = [];
    let wake = null;
    const push = (a) => { queue.push(a); wake?.(); };
    const nextAction = async () => { while (!queue.length) await new Promise((r) => (wake = r)); wake = null; return queue.shift(); };
    const results = new Map(); // qadam id → yakuniy hodisa (done/error)
    const waiters = new Map();
    let streamDone = false;
    const resultOf = (id) => (results.has(id) || streamDone ? Promise.resolve(results.get(id)) : new Promise((r) => waiters.set(id, r)));
    const settle = () => { streamDone = true; for (const r of waiters.values()) r(undefined); waiters.clear(); };

    let think = null; // hozir ko'rinayotgan "o'ylayapman" qatori
    let thinkNo = 0;
    const addRow = (row) => { run.stepsHidden = false; run.steps.push(row); commit(); scrollFeed(); return row; };
    const closeThink = async (label) => {
      if (!think) return;
      const left = think.t0 + THINK_MIN - performance.now();
      if (left > 0) await sleep(left);
      think.status = "done";
      think.label = label || (think.id === "t1" ? tt().think.firstDone : tt().think.nextDone);
      commit();
      think = null;
      await sleep(GAP);
    };

    const onEvent = (ev) => {
      if (ev.type === "step" && ev.status !== "running") {
        results.set(ev.id, ev);
        waiters.get(ev.id)?.(ev);
        waiters.delete(ev.id);
      } else if (ev.type !== "end") {
        // Javob kelishi bilan ovozni darhol so'raymiz — qadamlar animatsiyasi davomida tayyor bo'lib turadi
        if (ev.type === "reply" && voiceRef.current && String(ev.spoken || "").trim()) {
          ev.audio = fetchTts({ text: String(ev.spoken).trim(), lang: ev.lang || langRef.current, mood: ev.mood });
        }
        push(ev);
      }
    };

    const play = async (ev) => {
      switch (ev.type) {
        case "thinking": {
          if (think) break;
          think = addRow({ id: `t${++thinkNo}`, kind: "think", label: thinkNo === 1 ? tt().think.first : tt().think.next, status: "running", detail: "", t0: performance.now() });
          avatar.setState("thinking");
          break;
        }
        case "step": {
          await closeThink();
          const s = addRow({ id: ev.id, kind: "tool", label: ev.label, status: "running", detail: "", t0: performance.now() });
          run.title = tt().working;
          avatar.setState("working");
          avatar.setLevel(0.5);
          const res = await resultOf(ev.id);
          const left = s.t0 + STEP_MIN + Math.random() * 450 - performance.now();
          if (left > 0) await sleep(left);
          s.status = res?.status || "done";
          if (res?.label) s.label = res.label;
          s.detail = res?.detail || "";
          doneCount++;
          run.count = `· ${doneCount}`;
          avatar.setLevel(0.7);
          commit();
          await sleep(GAP);
          break;
        }
        case "lots": {
          // Bir nechta qidiruv (masalan, eng arzon + eng qimmat) bo'lsa — takliflar qo'shiladi, takrorlar tashlanadi
          const seen = new Set((run.lots || []).map((l) => l.lot_id));
          run.lots = [...(run.lots || []), ...ev.items.filter((l) => !seen.has(l.lot_id))];
          commit();
          scrollFeed();
          await sleep(500);
          break;
        }
        case "order":
          await closeThink();
          setOrdersById((m) => ({ ...m, [ev.order.id]: ev.order }));
          if (ev.replaced) { loadOrders(); break; } // o'zgartirilgan eski qoralama — faqat eski kartochka yangilanadi
          run.orderId = ev.order.id;
          commit();
          loadOrders();
          scrollFeed();
          await sleep(500);
          break;
        case "profile":
          if (tabRef.current === "orders") loadProfile();
          break;
        case "alert_offer":
          await closeThink();
          run.alertOffers.push(ev.offer);
          commit();
          scrollFeed();
          await sleep(400);
          break;
        case "alert":
          await closeThink();
          run.alerts.push({ alert: ev.alert, belowNow: ev.belowNow, subscribed: ev.subscribed });
          commit();
          scrollFeed();
          await sleep(400);
          break;
        case "chart":
          await closeThink();
          run.charts.push(ev.chart);
          commit();
          scrollFeed();
          await sleep(600);
          break;
        case "form":
          await closeThink();
          run.forms.push(ev.form);
          commit();
          scrollFeed();
          break;
        case "reply": {
          await closeThink(tt().think.final);
          run.title = tt().done(doneCount);
          if (!doneCount) run.stepsHidden = true;
          commit();
          avatar.setMood(ev.mood || "calm");
          // Ovozda faqat qisqa gap (spoken) o'qiladi; chatda — shu gap + tafsilotlar
          const spoken = String(ev.spoken || "").trim();
          const shown = [spoken, ev.text].filter(Boolean).join("\n");
          const l = ev.lang || langRef.current; // javob tili (yozilgan tilga qarab), interfeys tili emas
          const audio = voiceRef.current && spoken ? (ev.audio || fetchTts({ text: spoken, lang: l, mood: ev.mood })) : null;
          speech.say(shown, l, (k, end) => {
            run.replyHtml = mdLite(shown.slice(0, k)) + (end ? "" : '<span class="caret"></span>');
            commit();
            if (k % 60 === 0) scrollFeed();
          }, () => setTimeout(() => avatar.setMood("calm"), 2500), { spoken, audio, leadLen: spoken.length });
          break;
        }
        case "error":
          if (think) { think.status = "error"; think = null; }
          run.replyHtml = `<p class="reply err">${esc(ev.error)}</p>`;
          run.title = tt().failed;
          commit();
          avatar.setMood("concerned");
          avatar.setState("idle");
          break;
      }
    };

    // Avvalgi vazifalarning qadamlari yig'iladi — tarix ixcham qoladi, joriy vazifa esa to'liq ko'rinadi
    setFeed((f) => f.map((it) => {
      if (it.kind !== "run" || it.id === run.id) return it;
      const r = runsRef.current.get(it.id);
      if (!r || r.collapsed) return it;
      r.collapsed = true;
      return snapshot(r);
    }));

    const pump = (async () => {
      for (;;) {
        const ev = await nextAction();
        if (ev.type === "__end") break;
        // Bitta hodisadagi xato butun oqimni to'xtatmasin (aks holda javob chiqmaydi va tugma bloklanib qoladi)
        try { await play(ev); } catch (err) { console.error("[agent event]", ev.type, err); }
      }
      if (think) { think.status = "done"; think = null; commit(); }
    })();

    try {
      await streamAgent({ sessionId: SESSION, text, lang: langRef.current, screen: tabRef.current, deviceId: deviceId() }, onEvent);
    } catch (e) {
      push({ type: "error", error: e.message });
    } finally {
      settle();
      push({ type: "__end" });
      await pump;
      setBusy(false);
      if (canvasRef.current?.dataset.state !== "speaking") avatar.setState("idle");
    }
  }

  function toggleSteps(id) {
    const run = runsRef.current.get(id);
    if (!run) return;
    run.collapsed = !run.collapsed;
    const snap = snapshot(run);
    setFeed((f) => f.map((it) => (it.id === id ? snap : it)));
  }

  // ---------- buyurtmalar ----------
  async function showApplication(id) {
    try {
      const txt = await api(`/api/orders/${id}/application`);
      setModal({ type: "app", text: txt, seq: ++seq.current });
    } catch (e) { toast(e.message); }
  }
  async function orderAction(id, act) {
    if (act === "app") return showApplication(id);
    try {
      const o = await api(`/api/orders/${id}/${act}`, {});
      setOrdersById((m) => ({ ...m, [id]: o }));
      setOrders((list) => list.map((x) => (x.id === id ? o : x)));
      loadOrders();
      if (act === "confirm") {
        avatar.setMood("excited");
        avatar.setLevel(1);
        // Agent yakuniy qadamlarni o'zi bajaradi va xulosa beradi
        sendTask(`[SYSTEM] Buyurtma ${id} foydalanuvchi tomonidan tasdiqlandi.`, { hidden: true });
      } else toast("Buyurtma bekor qilindi");
    } catch (e) {
      toast(e.message);
    }
  }
  async function saveProfile(body) {
    try { await api("/api/profile", { method: "PUT", body }); toast("Saqlandi"); loadProfile(); return true; } catch (e) { toast(e.message); return false; }
  }

  // ---------- narxlar va lotlar ----------
  function findQuote(name) {
    const ov = overviewRef.current;
    return prices.weeklyRef.current?.find((q) => q.name === name) || ov?.quotes.find((q) => q.name === name) || ov?.daily.find((q) => q.name === name);
  }
  function openPrice(name) {
    const q = findQuote(name);
    if (!q) return;
    const d = overviewRef.current?.daily.find((x) => x.name === name);
    setModal({ type: "price", q, d, seq: ++seq.current });
  }
  const openLot = (id) => setModal({ type: "lot", id, seq: ++seq.current });
  function delegate(text) { closeModal(); sendTask(text); }
  function findLots(word) {
    closeModal();
    lots.setQ(word);
    setTab("lots");
    lots.load();
  }

  // ---------- ovoz yozish ----------
  const recDeps = useRef(null);
  recDeps.current = {
    avatar, toast,
    isBusy: () => busyRef.current,
    aiEnabled: () => cfgRef.current.aiEnabled,
    setTab, speechStop: speech.stop,
    lang: () => langRef.current,
    sendTask,
    setInputText: (text) => {
      flushSync(() => setTaskText(text));
      const inp = inputRef.current;
      inp.focus();
      inp.setSelectionRange(text.length, text.length);
    },
  };
  const recorder = useRecorder(recDeps);
  const recorderRef = useRef(recorder);
  recorderRef.current = recorder;

  function toggleVoice() {
    const v = !voiceRef.current;
    setVoiceOn(v);
    store.set("osonVoice", v ? "1" : "0");
    if (!v) speech.stop();
    toast(v ? (speech.hasVoice(langRef.current) ? "Agent ovozi yoqildi" : "Ovoz yoqildi, lekin brauzerda bu til uchun ovoz topilmadi") : "Agent ovozi o'chirildi");
  }

  // Lenta komponentlari uchun barqaror (o'zgarmas) funksiyalar — memo ishlashi uchun
  const fns = useRef(null);
  fns.current = { sendTask, toggleSteps, openLot, orderAction, toast, setTab, onProfileSaved: () => { if (tabRef.current === "orders") loadProfile(); } };
  const ctx = useMemo(() => ({
    openAlerts: () => fns.current.setTab("alerts"),
    sendTask: (...a) => fns.current.sendTask(...a),
    toggleSteps: (id) => fns.current.toggleSteps(id),
    openLot: (id) => fns.current.openLot(id),
    orderAction: (id, act) => fns.current.orderAction(id, act),
    toast: (m) => fns.current.toast(m),
    onProfileSaved: () => fns.current.onProfileSaved(),
    isBusy: () => busyRef.current,
  }), [busyRef]);

  // ---------- avatar + joylashuv: bir marta ----------
  useEffect(() => {
    const canvas = canvasRef.current;
    const raw = OsonAvatar.mount(canvas);
    const dock = createDock({
      canvas,
      stageSlot: () => stageSlotRef.current,
      logoSlot: () => logoSlotRef.current,
      env: () => ({ tab: tabRef.current, busy: busyRef.current, recording: recorderRef.current.isActive(), focused: focusedRef.current, inputValue: taskTextRef.current }),
    });
    // avatar.setState → markazdagi joy o'lchami va joylashuv ham yangilanadi (speech.js ham shu orqali chaqiradi)
    const rawSetState = raw.setState;
    raw.setState = (s) => {
      rawSetState(s);
      if (stageSlotRef.current) stageSlotRef.current.dataset.state = s;
      dock.update();
    };
    avatarRef.current = raw;
    dockRef.current = dock;
    // Nutq dvigateli lib/speech.js da (Avatar Lab bilan umumiy) — puls matn ritmidan hisoblanadi
    speechRef.current = OsonSpeech(raw);
    raw.setState("idle");
    return () => {
      speechRef.current?.destroy();
      raw.destroy();
      dock.destroy();
      avatarRef.current = speechRef.current = dockRef.current = null;
    };
  }, [tabRef, busyRef, taskTextRef]);

  // ---------- ishga tushirish ----------
  useEffect(() => {
    (async () => {
      try { setCfg(await api("/api/config")); } catch { /* */ }
      setLang(langRef.current);
      setReady(true);
      loadOverview();
      loadOrders();
      // Push-xabar bosilganda: /?lot=ID — o'sha lot oynasi ochiladi
      const lot = new URLSearchParams(location.search).get("lot");
      if (lot && /^[\w-]{1,32}$/.test(lot)) {
        history.replaceState(null, "", location.pathname);
        setTab("alerts");
        setModal({ type: "lot", id: lot, seq: ++seq.current });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Escape: avval yozuvni bekor qiladi, keyin modalni yopadi
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (recorderRef.current.isRecording()) return recorderRef.current.cancel();
      if (modalRef.current) setModal(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [modalRef, setModal]);

  // Lentaga yangi narsa qo'shilgach pastga aylantiramiz (DOM yangilangandan keyin)
  useEffect(() => {
    if (scrollTick) window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  }, [scrollTick]);

  const orderCount = orders.filter((o) => o.status !== "cancelled").length;

  return (
    <>
      <header className="top">
        <div className="brand">
          {/* Agent avatari (4×4 kub) kutishda shu yerda logo bo'lib turadi, ishlaganda markazga uchadi */}
          <span className="logo-slot" id="logoSlot" ref={logoSlotRef} aria-hidden="true"></span>
          <span className="brand-name">UZEX <span className="ver">2.0</span></span>
          <span className="badge" title="Birjaga yuborish demo rejimida">DEMO</span>
        </div>
        <nav className="seg" aria-label="Bo'limlar">
          {TABS.map(([id, label]) => (
            <button key={id} className={tab === id ? "active" : undefined} onClick={() => setTab(id)}>
              {label}
              {id === "orders" && <> <span className="count" id="orderCount" hidden={!orderCount}>{orderCount || ""}</span></>}
            </button>
          ))}
        </nav>
        <div className="right">
          <button className="icon-btn" id="voiceToggle" title="Agent ovozi" aria-pressed={String(voiceOn)} aria-label="Agent ovozi" onClick={toggleVoice}>
            {/* Karnay ikonkasi: yoqilgan — to'lqinlar, o'chirilgan — ustidan chiziq */}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M11 5 6 9H3v6h3l5 4V5Z" />
              {voiceOn
                ? <><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M18.5 5.5a9 9 0 0 1 0 13" /></>
                : <path d="m16 9 5 6m0-6-5 6" />}
            </svg>
          </button>
          <div className="langs" role="group" aria-label="Til">
            {["uz", "ru", "en"].map((l) => <button key={l} className={lang === l ? "active" : undefined} onClick={() => setLang(l)}>{l.toUpperCase()}</button>)}
          </div>
        </div>
      </header>

      <main>
        <AgentView active={tab === "agent"} started={started} ready={ready} aiEnabled={cfg.aiEnabled} t={t} feed={feed}
          ordersById={ordersById} lang={lang} stageSlotRef={stageSlotRef} quotes={overview?.quotes} trading={overview?.trading} usd={overview?.usdUzs} ctx={ctx} />
        <PricesView active={tab === "prices"} categories={cfg.categories} prices={prices} overview={overview} onOpenPrice={openPrice} />
        <LotsView active={tab === "lots"} regions={cfg.regions} lots={lots} onOpenLot={openLot} />
        <AlertsView active={tab === "alerts"} regions={cfg.regions} toast={toast} onOpenLot={openLot} />
        <OrdersView active={tab === "orders"} orders={orders} profile={profile} profileVer={profileVer} lang={lang}
          onSaveProfile={saveProfile} orderAction={ctx.orderAction} />
      </main>

      {/* Vazifa kiritish */}
      <div className="composer-wrap" id="composerWrap">
        <form
          className={"composer" + (recorder.ui.recording ? " recording" : "") + (recorder.ui.transcribing ? " transcribing" : "")}
          id="composer"
          onSubmit={(e) => { e.preventDefault(); if (recorder.isRecording()) recorder.finish(true); else sendTask(taskTextRef.current); }}
        >
          <button type="button" className="mic" id="micBtn" aria-label="Ovoz bilan vazifa berish" title="Ovoz bilan ayting" onClick={() => recorder.start()}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2Z" /></svg>
          </button>
          <button type="button" className="rec-btn rec-cancel" id="recCancel" aria-label="Yozuvni bekor qilish" title="Bekor qilish" onClick={() => recorder.cancel()}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6L19 6.4 17.6 5 12 10.6z" /></svg>
          </button>
          <input
            id="taskInput" ref={inputRef} autoComplete="off" placeholder={ready ? t.placeholder : ""} value={taskText}
            onChange={(e) => { setTaskText(e.target.value); dockUpdate(); }}
            onFocus={() => { focusedRef.current = true; dockUpdate(); }}
            onBlur={() => { focusedRef.current = false; dockUpdate(); }}
          />
          <canvas className="wave" id="wave" ref={recorder.waveRef} aria-hidden="true"></canvas>
          <button type="button" className="rec-btn rec-stop" id="recStop" aria-label="Yozishni to'xtatish va matnni tahrirlash" title="To'xtatish (matnni tahrirlash)" onClick={() => recorder.finish(false)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2" /></svg>
          </button>
          <button type="submit" className="send" id="sendBtn" aria-label="Yuborish" disabled={busy}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4l7 7-1.4 1.4L13 7.8V20h-2V7.8l-4.6 4.6L5 11z" /></svg>
          </button>
        </form>
        <div className="caption" id="caption">Ma'lumotlar: uzex.uz (real vaqt) · Birjaga yuborish — DEMO rejimi</div>
      </div>

      {/* Modal oyna (lot, narx, ariza) */}
      {modal?.type === "lot" && <LotModal key={modal.seq} id={modal.id} onClose={closeModal} onDelegate={delegate} />}
      {modal?.type === "price" && <PriceModal key={modal.seq} q={modal.q} d={modal.d} onClose={closeModal} onDelegate={delegate} onFindLots={findLots} />}
      {modal?.type === "app" && <ApplicationModal key={modal.seq} text={modal.text} onClose={closeModal} toast={toast} />}

      <div className="toast" id="toast" hidden={!toastState.shown}>{toastState.msg}</div>
      {/* Avatar: bitta canvas logo va markaz orasida "uchadi" */}
      <canvas id="avatar" className="avatar-fly" ref={canvasRef} role="img" aria-label="UZEX 2.0 agent avatari"></canvas>
    </>
  );
}
