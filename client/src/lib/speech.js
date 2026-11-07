// Agent nutqi: matnni (imkon bo'lsa) ovoz chiqarib o'qiydi va avatarni BO'G'IN RITMIDA "uradi".
// Muhim: Chrome'ning Google ovozlari `onboundary` hodisasini yubormaydi, shuning uchun puls
// matndan hisoblangan ritm bilan yuritiladi; `onboundary` kelsa — ritm unga sinxronlanadi.
// Ilova (App.jsx) ham, Avatar Lab ham shu bitta koddan foydalanadi.
//
// const sp = OsonSpeech(avatar);
// sp.say(text, { lang: "uz", voice: true, onFrame(n, done), onEnd() });  sp.stop();  sp.hasVoice("ru")

export function OsonSpeech(avatar) {
  const synth = window.speechSynthesis;
  let voices = [];
  const load = () => (voices = synth ? synth.getVoices() : []);
  load();
  synth?.addEventListener?.("voiceschanged", load);
  const pick = (lang) =>
    voices.find((v) => v.lang?.toLowerCase().startsWith(lang) && /google|natural|premium|enhanced|neural/i.test(v.name)) ||
    voices.find((v) => v.lang?.toLowerCase().startsWith(lang));

  const VOWEL = /[aeiouyаеёиоуыэюяўі]/i;
  const plain = (s) => String(s).replace(/\*\*/g, "").replace(/^\s*[-•*]\s+/gm, "").replace(/\s+/g, " ").trim();

  let run = null;
  function stop() {
    if (run) { clearInterval(run.timer); clearTimeout(run.guard); run = null; }
    synth?.cancel();
  }

  /** Belgining "ovoz kuchi": unli — zarba, undosh — o'rta, bo'shliq — tushish, tinish belgisi — pauza. */
  function levelAt(text, i) {
    const c = text[i] || " ";
    if (/[.!?…]/.test(c)) return 0;
    if (/[,;:—–-]/.test(c)) return 0.02;
    if (/\s/.test(c)) return 0.06;
    if (VOWEL.test(c)) return 0.62 + Math.random() * 0.38;
    return 0.28 + Math.random() * 0.22;
  }

  function say(text, opts = {}) {
    stop();
    const { lang = "uz", voice: wantVoice = true, onFrame = () => {}, onEnd } = opts;
    const shown = String(text);
    const spoken = plain(shown);
    const voice = wantVoice ? pick(lang) : null;
    const r = (run = { timer: 0, guard: 0, pos: 0, pauseUntil: 0, spokenDone: !voice, started: !voice, t0: performance.now() });
    const cps = voice ? 14 : 32; // o'qish tezligi (belgi/soniya)
    avatar.setState("speaking");

    const finish = () => {
      if (run !== r) return;
      clearInterval(r.timer);
      clearTimeout(r.guard);
      run = null;
      onFrame(shown.length, true);
      avatar.setState("idle");
      onEnd?.();
    };

    let last = performance.now();
    r.timer = setInterval(() => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      if (voice && !r.started) {
        if (synth.speaking) r.started = true;
        else if (now - r.t0 > 1500) { r.started = true; r.spokenDone = true; } // ovoz boshlanmadi → ovozsiz davom
        else return;
      }
      if (now >= r.pauseUntil) {
        const prev = Math.floor(r.pos);
        r.pos = Math.min(spoken.length, r.pos + cps * dt);
        const i = Math.floor(r.pos);
        if (i > prev && /[.!?]/.test(spoken[i - 1] || "")) r.pauseUntil = now + (voice ? 220 : 160); // gap oxirida to'xtash
        (avatar.drive || avatar.setLevel)(levelAt(spoken, i));
      } else {
        (avatar.drive || avatar.setLevel)(0.03);
      }
      // Ekrandagi matn nutq bilan bir joyda yuradi
      const ratio = spoken.length ? r.pos / spoken.length : 1;
      onFrame(Math.min(shown.length, Math.ceil(shown.length * ratio)), false);
      if (r.pos >= spoken.length) {
        if (r.spokenDone) finish();
        else (avatar.drive || avatar.setLevel)(0.12 + Math.random() * 0.1); // ovoz hali tugamagan — yengil "nafas"
      }
    }, 40);

    if (voice) {
      const u = new SpeechSynthesisUtterance(spoken);
      u.voice = voice;
      u.lang = voice.lang;
      u.rate = 1.03;
      u.onstart = () => { r.started = true; };
      u.onboundary = (e) => { if (run === r && e.charIndex != null) r.pos = Math.max(r.pos * 0.5 + e.charIndex * 0.5, e.charIndex - 2); };
      u.onend = u.onerror = () => { r.spokenDone = true; r.pos = spoken.length; };
      synth.speak(u);
      // Ovoz "osilib" qolsa ham animatsiya abadiy davom etmasin
      r.guard = setTimeout(() => { r.spokenDone = true; r.pos = spoken.length; }, (spoken.length / 9) * 1000 + 4000);
    }
  }

  const destroy = () => { stop(); synth?.removeEventListener?.("voiceschanged", load); };
  return { say, stop, destroy, hasVoice: (l) => Boolean(pick(l)), voiceName: (l) => pick(l)?.name || null };
}
