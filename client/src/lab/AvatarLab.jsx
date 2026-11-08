// Avatar Lab — holatlar, kayfiyat va animatsiyani sinash sahifasi (/avatar-lab.html)
import { useEffect, useRef, useState } from "react";
import { OsonAvatar } from "../lib/avatar.js";
import { OsonSpeech } from "../lib/speech.js";

const STATES = { idle: "Kutish", thinking: "O'ylash", working: "Ishlash", speaking: "Gapirish", listening: "Tinglash" };
const MOODS = { calm: "Xotirjam", happy: "Xursand", excited: "Hayajonli", concerned: "Xavotirli" };
const SIZES = { idle: 180, thinking: 260, working: 260, speaking: 280, listening: 260 };
const TUNE = [
  ["speed", "Tezlik", 0.2, 3, 0.05],
  ["glow", "Soya", 0.3, 2.5, 0.05],
  ["swirl", "Burilishlar soni", 0, 3, 0.05],
  ["rimWidth", "Kataklar oralig'i", 0.3, 3, 0.05],
  ["detail", "Yaltiroqlik", 0, 2, 0.05],
  ["response", "Ovozga sezgirlik", 0.2, 2, 0.05],
];
const DEFAULT_TEXT = "Assalomu alaykum! Toshkent viloyatidan 20 tonna sement topdim. Jami summa 12 million 100 ming so'm. Tasdiqlash tugmasini bosing.";

export default function AvatarLab() {
  const canvasRef = useRef(null);
  const meterRef = useRef(null);
  const hudRef = useRef(null);
  const av = useRef(null);
  const sp = useRef(null);
  const ui = useRef({ state: "idle", autoSize: true, hold: false, level: 0, timers: [] });
  const mic = useRef({ stream: null, ctx: null, raf: 0 });

  const [state, setStateUi] = useState("idle");
  const [mood, setMoodUi] = useState("calm");
  const [size, setSizeUi] = useState(180);
  const [autoSize, setAutoSizeUi] = useState(true);
  const [hold, setHoldUi] = useState(false);
  const [level, setLevelUi] = useState(0);
  const [light, setLight] = useState(false);
  const [text, setText] = useState(DEFAULT_TEXT);
  const [ttsInfo, setTtsInfo] = useState("");
  const [micLabel, setMicLabel] = useState("🎙 Mikrofonni yoqish");
  const [micOn, setMicOn] = useState(false);
  const [params, setParamsUi] = useState(null);
  const [applyLabel, setApplyLabel] = useState("Ilovada qo'llash");

  // --- Holat va kayfiyat ---
  function setState(s) {
    ui.current.state = s;
    av.current.setState(s);
    setStateUi(s);
    if (ui.current.autoSize) setSizeUi(SIZES[s]);
  }
  function setMood(m) {
    av.current.setMood(m);
    setMoodUi(m);
  }

  // --- Nutq: ilova bilan AYNAN BIR XIL dvigatel (speech.js) ---
  function speakSynthetic(t, done) {
    stopAll();
    setState("speaking");
    setTtsInfo("Ovozsiz rejim: puls matn ritmidan (agentda ovoz bo'lmaganda xuddi shunday).");
    sp.current.say(t, { voice: false, onEnd: () => { setState("idle"); done?.(); } });
  }
  function speakTts(t) {
    const lang = ["uz", "ru", "en"].find((l) => sp.current.hasVoice(l));
    if (!lang) { setTtsInfo("Brauzerda mos ovoz topilmadi — ovozsiz rejim ishlatildi."); return speakSynthetic(t); }
    stopAll();
    setState("speaking");
    setTtsInfo(`Ovoz: ${sp.current.voiceName(lang)} (${lang}) — puls matn ritmidan, brauzer so'z chegarasini yuborsa sinxronlanadi.`);
    sp.current.say(t, { lang, voice: true, onEnd: () => setState("idle") });
  }

  // --- Mikrofon ---
  async function toggleMic() {
    const m = mic.current;
    if (m.stream) return stopMic();
    try { m.stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { setMicLabel("🎙 Ruxsat berilmadi"); return; }
    stopAll(false);
    setState("listening");
    setMicLabel("■ Mikrofonni o'chirish");
    setMicOn(true);
    m.ctx = new (window.AudioContext || window.webkitAudioContext)();
    const an = m.ctx.createAnalyser();
    an.fftSize = 512;
    m.ctx.createMediaStreamSource(m.stream).connect(an);
    const buf = new Uint8Array(an.fftSize);
    const tick = () => {
      an.getByteTimeDomainData(buf);
      let s = 0;
      for (const v of buf) s += (v - 128) ** 2;
      av.current.drive(Math.min(1, Math.sqrt(s / buf.length) / 40));
      m.raf = requestAnimationFrame(tick);
    };
    tick();
  }
  function stopMic() {
    const m = mic.current;
    if (!m.stream) return;
    cancelAnimationFrame(m.raf);
    m.stream.getTracks().forEach((t) => t.stop());
    m.ctx?.close();
    m.stream = null;
    setMicLabel("🎙 Mikrofonni yoqish");
    setMicOn(false);
    setState("idle");
  }

  // --- Ssenariy ---
  function scenario() {
    stopAll();
    setMood("calm");
    const at = (ms, fn) => ui.current.timers.push(setTimeout(fn, ms));
    setState("listening");
    for (let k = 0; k < 24; k++) at(k * 90, () => av.current.setLevel(0.2 + Math.random() * 0.6)); // foydalanuvchi gapirmoqda
    at(2300, () => setState("thinking"));
    at(4300, () => setState("working"));
    for (let k = 0; k < 4; k++) at(4600 + k * 700, () => av.current.setLevel(0.7)); // qadam bajarildi impulslari
    at(7600, () => {
      setMood("happy");
      speakSynthetic("Toshkentdan 20 tonna sement topdim, buyurtma tayyor. Tasdiqlash tugmasini bosing.", () => ui.current.timers.push(setTimeout(() => setMood("calm"), 2000)));
    });
  }

  function stopAll(resetMic = true) {
    ui.current.timers.forEach(clearTimeout);
    ui.current.timers = [];
    sp.current.stop();
    if (resetMic) stopMic();
  }

  // --- Sozlash ---
  function tune(k, v) {
    av.current.setParams({ [k]: v });
    setParamsUi(av.current.getParams());
  }
  function apply() {
    try { localStorage.setItem("osonAvatarParams", JSON.stringify(av.current.getParams())); setApplyLabel("✓ Saqlandi — ilovani yangilang"); }
    catch { setApplyLabel("Saqlab bo'lmadi"); }
    setTimeout(() => setApplyLabel("Ilovada qo'llash"), 2500);
  }
  function reset() {
    av.current.setParams({ ...OsonAvatar.DEFAULTS });
    try { localStorage.removeItem("osonAvatarParams"); } catch { /* */ }
    setParamsUi(av.current.getParams());
  }

  // --- mount: avatar, nutq, HUD, "ushlab turish" ---
  useEffect(() => {
    av.current = OsonAvatar.mount(canvasRef.current);
    sp.current = OsonSpeech(av.current);
    av.current.setState("idle");
    av.current.setMood("calm");
    setParamsUi(av.current.getParams());
    const holdTimer = setInterval(() => { if (ui.current.hold) av.current.setLevel(ui.current.level); }, 50);
    const hudTimer = setInterval(() => {
      const d = av.current.debug;
      if (meterRef.current) meterRef.current.style.width = (d.level * 100).toFixed(0) + "%";
      if (hudRef.current) {
        hudRef.current.textContent = `holat: ${d.state}   kayfiyat: ${d.mood}   daraja: ${d.level.toFixed(2)}\n` +
          Object.entries(d.weights).map(([k, v]) => `${k}:${v.toFixed(2)}`).join("  ");
      }
    }, 100);
    const m = mic.current;
    const u = ui.current;
    return () => {
      clearInterval(holdTimer);
      clearInterval(hudTimer);
      u.timers.forEach(clearTimeout);
      cancelAnimationFrame(m.raf);
      m.stream?.getTracks().forEach((t) => t.stop());
      m.ctx?.close();
      m.stream = null;
      sp.current?.destroy();
      av.current?.destroy();
    };
  }, []);

  const btns = (map, cur, fn) => Object.entries(map).map(([k, l]) => <button key={k} className={k === cur ? "on" : ""} onClick={() => fn(k)}>{l}</button>);

  return (
    <>
      <div className={"stage" + (light ? " light" : "")} id="stage">
        <a className="back" href="/">← Ilovaga qaytish</a>
        <canvas id="av" ref={canvasRef} aria-label="Avatar" style={{ width: size + "px", height: size + "px" }}></canvas>
        <div className="meter" title="Joriy daraja"><i id="meter" ref={meterRef}></i></div>
        <div className="hud" id="hud" ref={hudRef}></div>
      </div>

      <aside>
        <h1>Avatar Lab</h1>
        <div className="hint">Holatlar, kayfiyat va animatsiyani shu yerda sinab ko'ring. Yoqqan sozlamani "Ilovada qo'llash" bilan saqlang.</div>

        <h2>Holat</h2>
        <div className="row" id="states">{btns(STATES, state, (k) => { stopAll(); setState(k); })}</div>

        <h2>Kayfiyat</h2>
        <div className="row" id="moods">{btns(MOODS, mood, setMood)}</div>

        <h2>Ovoz kuchi (qo'lda)</h2>
        <label className="sl">Daraja <input type="range" id="level" min="0" max="1" step="0.01" value={level}
          onChange={(e) => { const v = +e.target.value; setLevelUi(v); ui.current.level = v; av.current.setLevel(v); }} /><output id="levelOut">{level.toFixed(2)}</output></label>
        <div className="row">
          <button id="pulse" onClick={() => av.current.setLevel(1)}>Bitta impuls</button>
          <button id="holdLevel" className={hold ? "on" : ""} onClick={() => { const h = !ui.current.hold; ui.current.hold = h; setHoldUi(h); }}>Ushlab turish: {hold ? "yoqiq" : "o'chiq"}</button>
        </div>

        <h2>Nutq simulyatori</h2>
        <textarea id="speechText" value={text} onChange={(e) => setText(e.target.value)}></textarea>
        <div className="row" style={{ marginTop: 6 }}>
          <button id="speakSim" className="primary" onClick={() => speakSynthetic(text)}>▶ Gapirish (sintetik ritm)</button>
          <button id="speakTts" onClick={() => speakTts(text)}>🔊 Brauzer ovozi bilan</button>
          <button id="stopSpeak" onClick={() => { stopAll(); setState("idle"); }}>■ To'xtatish</button>
        </div>
        <div className="hint" id="ttsInfo">{ttsInfo}</div>

        <h2>Mikrofon</h2>
        <div className="row"><button id="mic" className={micOn ? "on" : ""} onClick={toggleMic}>{micLabel}</button></div>
        <div className="hint">Avatar "tinglash" holatiga o'tadi va ovozingizga reaksiya qiladi.</div>

        <h2>Ssenariy</h2>
        <div className="row"><button id="scenario" className="primary" onClick={scenario}>▶ Agentning to'liq ish oqimi</button></div>
        <div className="hint">tinglash → o'ylash → ishlash → gapirish (xursand) → kutish</div>

        <h2>Ko'rinish</h2>
        <label className="sl">O'lcham <input type="range" id="size" min="80" max="480" step="10" value={size}
          onChange={(e) => { ui.current.autoSize = false; setAutoSizeUi(false); setSizeUi(+e.target.value); }} /><output id="sizeOut">{size}</output></label>
        <div className="row">
          <button id="autoSize" className={autoSize ? "on" : ""} onClick={() => {
            const a = !ui.current.autoSize;
            ui.current.autoSize = a;
            setAutoSizeUi(a);
            if (a) setSizeUi(SIZES[ui.current.state]);
          }}>Holatga qarab o'lcham: {autoSize ? "yoqiq" : "o'chiq"}</button>
          <button id="bg" onClick={() => setLight((l) => !l)}>Fon: {light ? "yorug'" : "qorong'i"}</button>
        </div>

        <h2>Sozlash</h2>
        <div id="tune">
          {params && TUNE.map(([k, l, mn, mx, st]) => (
            <label className="sl" key={k}>{l} <input type="range" min={mn} max={mx} step={st} value={params[k]} onChange={(e) => tune(k, +e.target.value)} /><output>{(+params[k]).toFixed(2)}</output></label>
          ))}
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <button id="apply" className="primary" onClick={apply}>{applyLabel}</button>
          <button id="reset" onClick={reset}>Standartga qaytarish</button>
        </div>
        <pre id="paramsOut">{params ? JSON.stringify(params, null, 2) : ""}</pre>
      </aside>
    </>
  );
}
