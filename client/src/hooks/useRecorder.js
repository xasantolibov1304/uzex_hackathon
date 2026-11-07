import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";

// Ovoz bilan vazifa (STT)
// Vidjet: [✕ bekor] [jonli to'lqin] [■ to'xtatish → matnni tahrirlash] [↑ yuborish]
const BAR_W = 3, BAR_GAP = 3;

function drawWave(canvas, g, levels) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  const step = BAR_W + BAR_GAP;
  const n = Math.floor(w / step);
  const lv = levels.slice(-n);
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

/**
 * deps (har renderda yangilanadigan ref): { avatar, toast, isBusy, aiEnabled, setTab, speechStop, lang, sendTask, setInputText }
 * @returns {{ ui: {recording:boolean, transcribing:boolean}, isActive(): boolean, isRecording(): boolean, start, cancel, finish, waveRef }}
 */
export function useRecorder(depsRef) {
  const mic = useRef({ rec: null, chunks: [], stream: null, raf: 0, ctx: null, levels: [], lastPush: 0, mode: null, mime: "" }).current;
  const waveRef = useRef(null);
  const [ui, setUi] = useState({ recording: false, transcribing: false });

  const teardown = useCallback(() => {
    cancelAnimationFrame(mic.raf);
    mic.stream?.getTracks().forEach((tr) => tr.stop());
    mic.ctx?.close();
    mic.stream = mic.ctx = null;
    mic.lastPush = 0;
  }, [mic]);

  const start = useCallback(async () => {
    const d = depsRef.current;
    if (mic.rec || mic.mode === "transcribing") return;
    if (d.isBusy()) return d.toast("Agent hozir ishlayapti, biroz kuting");
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return d.toast("Brauzeringiz ovoz yozishni qo'llamaydi");
    if (!d.aiEnabled()) return d.toast("AI agent sozlanmagan");
    try {
      mic.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      return d.toast("Mikrofonga ruxsat berilmadi");
    }
    d.speechStop();
    d.setTab("agent");
    mic.mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((m) => MediaRecorder.isTypeSupported?.(m)) || "";
    mic.rec = new MediaRecorder(mic.stream, mic.mime ? { mimeType: mic.mime } : undefined);
    mic.chunks = [];
    mic.levels = [];
    mic.rec.ondataavailable = (e) => e.data.size && mic.chunks.push(e.data);
    mic.rec.start(250);
    setUi({ recording: true, transcribing: false });
    d.avatar.setState("listening");

    mic.ctx = new (window.AudioContext || window.webkitAudioContext)();
    const an = mic.ctx.createAnalyser();
    an.fftSize = 1024;
    mic.ctx.createMediaStreamSource(mic.stream).connect(an);
    const buf = new Uint8Array(an.fftSize);
    const tick = (now) => {
      an.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += (v - 128) ** 2;
      const lvl = Math.min(1, Math.sqrt(sum / buf.length) / 38);
      depsRef.current.avatar.drive(lvl);
      // Har ~70 ms da bitta ustuncha: yangisi o'ngda, eskilari chapga suriladi
      if (!mic.lastPush || now - mic.lastPush > 70) { mic.levels.push(lvl); mic.lastPush = now; if (mic.levels.length > 600) mic.levels.shift(); }
      const canvas = waveRef.current;
      if (canvas) drawWave(canvas, canvas.getContext("2d"), mic.levels);
      mic.raf = requestAnimationFrame(tick);
    };
    mic.raf = requestAnimationFrame(tick);
  }, [depsRef, mic]);

  /** ✕ — yozuv o'chiriladi, hech narsa yuborilmaydi. */
  const cancel = useCallback(() => {
    if (!mic.rec) return;
    mic.rec.ondataavailable = null;
    mic.rec.onstop = null;
    try { mic.rec.stop(); } catch { /* */ }
    mic.rec = null;
    mic.chunks = [];
    teardown();
    setUi({ recording: false, transcribing: false });
    depsRef.current.avatar.setState("idle");
  }, [depsRef, mic, teardown]);

  /** ■ (send=false) — matn kiritish maydoniga tushadi; ↑ (send=true) — darhol agentga yuboriladi. */
  const finish = useCallback(async (send) => {
    if (!mic.rec) return;
    const d = depsRef.current;
    const rec = mic.rec;
    mic.mode = "transcribing";
    setUi({ recording: true, transcribing: true });
    d.avatar.setState("thinking");
    const stopped = new Promise((ok) => (rec.onstop = ok));
    try { rec.stop(); } catch { /* */ }
    await stopped;
    mic.rec = null;
    teardown();
    const blob = new Blob(mic.chunks, { type: rec.mimeType || mic.mime || "audio/webm" });
    const done = () => {
      mic.mode = null;
      setUi({ recording: false, transcribing: false });
    };
    try {
      if (blob.size < 1500) throw new Error("Ovoz juda qisqa — qaytadan urinib ko'ring");
      const data = await new Promise((ok, bad) => {
        const r = new FileReader();
        r.onload = () => ok(String(r.result).split(",")[1]);
        r.onerror = bad;
        r.readAsDataURL(blob);
      });
      const { text } = await api("/api/transcribe", { body: { data, mimeType: blob.type, lang: depsRef.current.lang() } });
      done();
      depsRef.current.avatar.setState("idle");
      if (!text) return depsRef.current.toast("Ovozdan matn ajratib bo'lmadi");
      if (send) depsRef.current.sendTask(text);
      else depsRef.current.setInputText(text);
    } catch (e) {
      done();
      depsRef.current.avatar.setState("idle");
      depsRef.current.toast(e.message);
    }
  }, [depsRef, mic, teardown]);

  // Komponent yo'qolsa mikrofonni bo'shatamiz
  useEffect(() => () => { if (mic.rec) { mic.rec.ondataavailable = mic.rec.onstop = null; try { mic.rec.stop(); } catch { /* */ } mic.rec = null; } teardown(); }, [mic, teardown]);

  return {
    ui,
    waveRef,
    isActive: () => Boolean(mic.rec) || mic.mode === "transcribing",
    isRecording: () => Boolean(mic.rec),
    start, cancel, finish,
  };
}
