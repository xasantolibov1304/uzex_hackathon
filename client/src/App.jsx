// Oson Birja — avtonom AI agent uchun frontend (React)
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { OsonAvatar } from "./lib/avatar.js";
import { OsonSpeech } from "./lib/speech.js";
import { createDock } from "./lib/dock.js";
import { api, sessionId, streamAgent } from "./lib/api.js";
import { T, tr } from "./lib/i18n.js";
import { esc, mdLite, store } from "./lib/format.js";
import { useLiveState, useLots, usePrices } from "./hooks/useSearch.js";
import { useRecorder } from "./hooks/useRecorder.js";
import AgentView from "./components/AgentView.jsx";
import PricesView from "./components/PricesView.jsx";
import LotsView from "./components/LotsView.jsx";
import OrdersView from "./components/OrdersView.jsx";
import { ApplicationModal, LotModal, PriceModal } from "./components/Modals.jsx";

const SESSION = sessionId();
const TABS = [["agent", "Agent"], ["prices", "Narxlar"], ["lots", "Sotuvda"], ["orders", "Buyurtmalar"]];
const snapshot = (m) => ({ ...m, steps: m.steps.map((s) => ({ ...s })), forms: [...m.forms] });

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
    say: (text, l, onFrame, onEnd) => speechRef.current?.say(text, { lang: l, voice: voiceRef.current, onFrame, onEnd }),
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
    const run = { kind: "run", id: `r${n}`, title: tt().working, count: "", stepsHidden: true, collapsed: false, steps: [], lots: null, forms: [], orderId: null, replyHtml: "" };
    runsRef.current.set(run.id, run);
    setFeed((f) => [...f, ...(hidden ? [] : [{ kind: "user", id: `u${n}`, text }]), snapshot(run)]);
    const commit = () => { const snap = snapshot(run); setFeed((f) => f.map((it) => (it.id === run.id ? snap : it))); };
    let doneCount = 0;
    avatar.setState("thinking");
    scrollFeed();

    const onEvent = (ev) => {
      switch (ev.type) {
        case "thinking":
          if (!run.steps.some((s) => s.status === "running")) avatar.setState("thinking");
          break;
        case "step": {
          run.stepsHidden = false;
          let s = run.steps.find((x) => x.id === ev.id);
          if (!s) {
            s = { id: ev.id, label: ev.label, status: "running", detail: "" };
            run.steps.push(s);
            avatar.setState("working");
            avatar.setLevel(0.5);
          }
          if (ev.status !== "running") {
            s.status = ev.status;
            s.detail = ev.detail || "";
            doneCount++;
            avatar.setLevel(0.7);
          }
          run.count = `· ${doneCount}`;
          commit();
          scrollFeed();
          break;
        }
        case "lots":
          run.lots = ev.items;
          commit();
          break;
        case "order":
          setOrdersById((m) => ({ ...m, [ev.order.id]: ev.order }));
          run.orderId = ev.order.id;
          commit();
          loadOrders();
          scrollFeed();
          break;
        case "profile":
          if (tabRef.current === "orders") loadProfile();
          break;
        case "form":
          run.forms.push(ev.form);
          commit();
          scrollFeed();
          break;
        case "reply": {
          run.collapsed = true;
          run.title = tt().done(doneCount);
          if (!doneCount) run.stepsHidden = true;
          commit();
          avatar.setMood(ev.mood || "calm");
          speech.say(ev.text, langRef.current, (k, end) => {
            run.replyHtml = mdLite(ev.text.slice(0, k)) + (end ? "" : '<span class="caret"></span>');
            commit();
            if (k % 60 === 0) scrollFeed();
          }, () => setTimeout(() => avatar.setMood("calm"), 2500));
          break;
        }
        case "error":
          run.replyHtml = `<p class="reply err">${esc(ev.error)}</p>`;
          run.title = tt().failed;
          commit();
          avatar.setMood("concerned");
          avatar.setState("idle");
          break;
      }
    };

    try {
      await streamAgent({ sessionId: SESSION, text, lang: langRef.current, screen: tabRef.current }, onEvent);
    } catch (e) {
      onEvent({ type: "error", error: e.message });
    } finally {
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
    try { await api("/api/profile", { method: "PUT", body }); toast("Saqlandi"); loadProfile(); } catch (e) { toast(e.message); }
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
  fns.current = { sendTask, toggleSteps, openLot, orderAction, toast, onProfileSaved: () => { if (tabRef.current === "orders") loadProfile(); } };
  const ctx = useMemo(() => ({
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
          <span className="logo-slot" id="logoSlot" ref={logoSlotRef} aria-hidden="true"></span>
          <span className="brand-name">Oson<span className="dot">·</span>Birja</span>
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
          <button className="icon-btn" id="voiceToggle" title="Agent ovozi" aria-pressed={String(voiceOn)} aria-label="Agent ovozi" onClick={toggleVoice}>{voiceOn ? "🔊" : "🔈"}</button>
          <div className="langs" role="group" aria-label="Til">
            {["uz", "ru", "en"].map((l) => <button key={l} className={lang === l ? "active" : undefined} onClick={() => setLang(l)}>{l.toUpperCase()}</button>)}
          </div>
        </div>
      </header>

      <main>
        <AgentView active={tab === "agent"} started={started} ready={ready} aiEnabled={cfg.aiEnabled} t={t} feed={feed}
          ordersById={ordersById} lang={lang} stageSlotRef={stageSlotRef} ctx={ctx} />
        <PricesView active={tab === "prices"} categories={cfg.categories} prices={prices} overview={overview} onOpenPrice={openPrice} />
        <LotsView active={tab === "lots"} regions={cfg.regions} lots={lots} onOpenLot={openLot} />
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
      <canvas id="avatar" className="avatar-fly" ref={canvasRef} role="img" aria-label="Oson AI agent avatari"></canvas>
    </>
  );
}
