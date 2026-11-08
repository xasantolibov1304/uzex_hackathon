// Agent nutqi. Ikki narsa alohida yuradi:
//  1) OVOZ — faqat qisqa "spoken" gap o'qiladi. Avval server ovozi (Gemini TTS, inson ovoziga yaqin) olinadi;
//     u kelmasa — brauzer ovozi (speechSynthesis). Avatar ovozning HAQIQIY balandligi bo'yicha "uradi"
//     (WebAudio analyser); brauzer ovozida esa matndan hisoblangan bo'g'in ritmi bilan.
//  2) MATN — chatdagi to'liq javob (spoken + tafsilotlar) tez yoziladi, ovozni kutmaydi.
// Ilova (App.jsx) ham, Avatar Lab ham shu bitta koddan foydalanadi.
//
// const sp = OsonSpeech(avatar);
// sp.say(shownText, { spoken, audio: Promise<Blob|null>, lang: "uz", voice: true, onFrame(n, done), onEnd() });
// sp.stop();  sp.hasVoice("ru")

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
  const level = (v) => (avatar.drive || avatar.setLevel)(v);

  let ctx = null; // AudioContext (bir marta yaratiladi)
  const getCtx = () => (ctx ??= new (window.AudioContext || window.webkitAudioContext)());

  // iPhone/Safari: ovoz faqat foydalanuvchi bosgandan keyin "ochiladi". Bizning ovoz esa javob kelgach
  // (bir necha soniyadan so'ng) boshlanadi — shuning uchun birinchi bosishdayoq AudioContext'ni ochib,
  // jim 1 namunani o'ynatib qo'yamiz. Shundan keyin Web Audio orqali istalgan paytda ovoz chiqara olamiz.
  const unlock = () => {
    try {
      // iOS 16.4+: telefon "jim" rejimda bo'lsa ham agent ovozi eshitilsin (media kabi)
      if (navigator.audioSession) navigator.audioSession.type = "playback";
      const c = getCtx();
      if (c.state !== "running") c.resume().catch(() => {});
      const src = c.createBufferSource();
      src.buffer = c.createBuffer(1, 1, 22050);
      src.connect(c.destination);
      src.start(0);
    } catch { /* ovoz qo'llab-quvvatlanmaydi */ }
  };
  const UNLOCK_EVENTS = ["pointerdown", "touchend", "keydown"];
  UNLOCK_EVENTS.forEach((e) => window.addEventListener(e, unlock, { passive: true }));

  let run = null;
  function stop() {
    if (run) {
      run.cancelled = true;
      clearInterval(run.timer);
      clearTimeout(run.guard);
      try { run.source?.stop(); } catch { /* allaqachon to'xtagan */ }
      run = null;
    }
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

  /** Server ovozini o'ynatadi; avatar ovoz balandligiga qarab harakatlanadi. true = o'ynadi. */
  // <audio> elementi o'rniga Web Audio (decode → BufferSource): iOS'da ochilgan AudioContext orqali
  // bosishdan keyin ham ishlaydi, <audio>.play() esa bloklanadi.
  async function playAudio(r, blob, onStart) {
    try {
      const c = getCtx();
      if (c.state !== "running") await c.resume().catch(() => {});
      if (c.state !== "running") return false; // hali hech narsa bosilmagan — brauzer ovozni bloklagan
      const data = await c.decodeAudioData(await blob.arrayBuffer());
      if (r.cancelled) return true;
      onStart?.(data.duration);
      const src = c.createBufferSource();
      src.buffer = data;
      const an = c.createAnalyser();
      an.fftSize = 512;
      src.connect(an);
      an.connect(c.destination);
      r.source = src;
      const buf = new Uint8Array(an.fftSize);
      r.meter = () => {
        an.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) { const d = (buf[i] - 128) / 128; sum += d * d; }
        return Math.min(1, Math.sqrt(sum / buf.length) * 4.2);
      };
      await new Promise((resolve) => {
        src.onended = resolve;
        src.start(0);
        // Xavfsizlik: onended kelmasa ham abadiy kutmaylik
        setTimeout(resolve, data.duration * 1000 + 1500);
      });
      return true;
    } catch {
      r.meter = null;
      return false;
    }
  }

  /** Brauzer ovozi (zaxira): gaplarga bo'lib o'qiydi — tabiiyroq pauzalar bilan. */
  function speakBrowser(r, spoken, voice) {
    return new Promise((resolve) => {
      const parts = spoken.match(/[^.!?]+[.!?]*/g)?.map((s) => s.trim()).filter(Boolean) || [spoken];
      let offset = 0;
      r.rhythm = { text: spoken, pos: 0, pauseUntil: 0 };
      parts.forEach((part, idx) => {
        const u = new SpeechSynthesisUtterance(part);
        const base = offset;
        offset += part.length + 1;
        u.voice = voice;
        u.lang = voice.lang;
        u.rate = 0.98;
        u.pitch = 1 + (idx % 2 ? -0.03 : 0.03); // gaplar orasida yengil intonatsiya farqi
        u.onstart = () => { r.started = true; r.rhythm.pos = Math.max(r.rhythm.pos, base); };
        u.onboundary = (e) => { if (e.charIndex != null) r.rhythm.pos = Math.max(r.rhythm.pos * 0.5 + (base + e.charIndex) * 0.5, base + e.charIndex - 2); };
        if (idx === parts.length - 1) u.onend = u.onerror = () => resolve();
        synth.speak(u);
      });
      // Ovoz "osilib" qolsa ham abadiy kutmaylik
      r.guard = setTimeout(resolve, (spoken.length / 9) * 1000 + 4000);
    });
  }

  function say(text, opts = {}) {
    stop();
    const { lang = "uz", voice: wantVoice = true, onFrame = () => {}, onEnd, audio } = opts;
    const shown = String(text);
    const spoken = plain(opts.spoken ?? shown);
    const browserVoice = wantVoice && spoken ? pick(lang) : null;
    const withVoice = wantVoice && spoken && (audio || browserVoice);
    // Server ovozi bo'lsa — matn ovoz tayyor bo'lguncha kutadi (gate), so'ng ovoz bilan birga yoziladi:
    // birinchi `leadLen` belgi (aytilayotgan gap) ovoz davomiyligiga moslab, qolgan tafsilotlar — tezroq.
    const leadLen = Math.min(shown.length, Math.max(0, opts.leadLen ?? 0));
    const r = (run = {
      timer: 0, guard: 0, typed: 0, voiceDone: !withVoice, typingDone: false, meter: null, rhythm: null,
      started: false, cancelled: false, gate: Boolean(withVoice && audio), leadCps: 0,
    });
    avatar.setState("speaking");
    onFrame(0, false); // ovoz tayyorlanayotganda — faqat miltillovchi kursor

    // Ovozsiz rejimda avatar yozilayotgan matn ritmida "gapiradi"
    if (!withVoice) r.rhythm = { text: plain(shown), pos: 0, pauseUntil: 0, follow: true };

    const baseCps = withVoice ? 60 : 32; // chatda yozish tezligi (belgi/soniya)
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

      // 1) matn
      if (!r.typingDone && !r.gate) {
        // Aytilgan gap — ovoz tezligida; undan keyingi tafsilotlar — tez (o'qishga tayyor bo'lsin)
        const cps = r.leadCps ? (r.typed < leadLen ? r.leadCps : 140) : baseCps;
        r.typed = Math.min(shown.length, r.typed + cps * dt);
        onFrame(Math.ceil(r.typed), false);
        if (r.typed >= shown.length) r.typingDone = true;
      }

      // 2) avatar
      if (r.meter) {
        level(r.meter());
      } else if (r.rhythm) {
        const rh = r.rhythm;
        if (rh.follow) rh.pos = r.typed * (rh.text.length / Math.max(1, shown.length));
        else if (r.started && now >= rh.pauseUntil) {
          const prev = Math.floor(rh.pos);
          rh.pos = Math.min(rh.text.length, rh.pos + 14 * dt);
          const i = Math.floor(rh.pos);
          if (i > prev && /[.!?]/.test(rh.text[i - 1] || "")) rh.pauseUntil = now + 220;
        }
        level(now < rh.pauseUntil ? 0.03 : levelAt(rh.text, Math.floor(rh.pos)));
      } else if (!r.voiceDone) {
        level(0.1 + Math.random() * 0.08); // ovoz tayyorlanmoqda — yengil "nafas"
      }

      if (r.typingDone && r.voiceDone) finish();
    }, 40);

    if (withVoice) {
      (async () => {
        let played = false;
        if (audio) {
          // Server ovozi 9 soniyada kelmasa — brauzer ovoziga o'tamiz
          const blob = await Promise.race([audio.catch(() => null), new Promise((res) => setTimeout(() => res(null), 9000))]);
          if (r.cancelled) return;
          if (blob) {
            r.started = true;
            played = await playAudio(r, blob, (duration) => {
              // Ovoz boshlanayotgan paytda matn ham boshlanadi; aytilgan gap ovoz bilan bir vaqtda tugaydi
              if (leadLen) r.leadCps = leadLen / Math.max(0.8, duration * 0.92);
              r.gate = false;
            });
          }
        }
        r.gate = false; // ovoz kelmadi/bloklandi — matnni kutdirib qo'ymaymiz
        if (!played && !r.cancelled && browserVoice) await speakBrowser(r, spoken, browserVoice);
        r.meter = null;
        r.rhythm = null;
        r.voiceDone = true;
      })();
    }
  }

  const destroy = () => {
    stop();
    synth?.removeEventListener?.("voiceschanged", load);
    UNLOCK_EVENTS.forEach((e) => window.removeEventListener(e, unlock));
    ctx?.close?.();
    ctx = null;
  };
  return { say, stop, destroy, hasVoice: (l) => Boolean(pick(l)), voiceName: (l) => pick(l)?.name || null };
}
