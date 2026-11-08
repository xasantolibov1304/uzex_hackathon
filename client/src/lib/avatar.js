// UZEX 2.0 agent avatari — logodan yasalgan 3D 4×4×4 Rubik kubi (three.js).
// Har bir yuz — logo: 4 rangli kvadrat (har biri 2×2 stikerdan).
// Kutishda kub kameraga to'g'ri qaragan, oraliqsiz va yoritilmagan — aynan tekis logo bo'lib ko'rinadi.
// Faollashganda kub 3/4 burchakka buriladi, kubchalar ajraladi va qatlamlar haqiqiy Rubik kubidek aylanadi;
// ish tugagach barcha burilishlar teskari tartibda qaytariladi — kub yana logoga "yechiladi".
// Holatlar: idle · thinking · working · speaking · listening   Kayfiyat: calm · happy · excited · concerned
// API (avvalgi bilan bir xil): OsonAvatar.mount(canvas, params?) →
//   { setState, setMood, setLevel, drive, setParams, getParams, debug, destroy }
import * as THREE from "three";

// 3D kub — Rive fayli (avatar.riv) bo'lmaganda ishlatiladigan zaxira avatar
export const CubeAvatar = (() => {
  const N = 4;
  const H = (N - 1) / 2; // 1.5 — chekka kubchaning koordinatasi
  const FOV = 18;
  const FILL = 0.66; // kutishda kub yuzi canvas balandligining 66% i (dock.js dagi ORB bilan bir xil)

  // Logoning 4 rangi: chap-tepa, o'ng-tepa, chap-past, o'ng-past (sRGB)
  const MOODS = {
    calm: ["#12c26b", "#3ee28c", "#5b80ec", "#3e5fd8"],
    happy: ["#1ed07a", "#5ceca2", "#7096f6", "#5274e8"],
    excited: ["#00d670", "#2cf698", "#5484ff", "#2c5cfc"],
    concerned: ["#e2a026", "#f4c052", "#e87a5c", "#cc5c48"],
    listening: ["#10c8a8", "#46ecc8", "#5c9aff", "#3c70f2"],
  };
  // gap — kubchalar oralig'i, every — yangi burilish oralig'i (ms; null — faqat yechish), dur — burilish (ms)
  const STATE = {
    idle: { gap: 0, every: null, dur: 320, base: 0 },
    thinking: { gap: 0.07, every: 900, dur: 560, base: 0.12 },
    working: { gap: 0.08, every: 60, dur: 300, base: 0.2 },
    speaking: { gap: 0.06, every: null, dur: 220, base: 0.02 },
    listening: { gap: 0.07, every: null, dur: 240, base: 0.05 },
  };
  // speed — burilish tezligi, glow — yorug'lik, swirl — kub aylanishi, rimWidth — oraliq, detail — yaltiroqlik
  const DEFAULTS = { speed: 1, glow: 1, swirl: 1, rimWidth: 1, detail: 0.5, response: 1 };

  function loadSaved() {
    try { return JSON.parse(localStorage.getItem("osonAvatarParams") || "null") || {}; } catch { return {}; }
  }
  const easeIO = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
  const AX = ["x", "y", "z"];

  function mount(canvas, initial) {
    const params = { ...DEFAULTS, ...loadSaved(), ...(initial || {}) };
    const st = {
      state: "idle", mood: "calm", level: 0, target: 0, drive: 0, driveAt: 0, pop: 0,
      w: { thinking: 0, working: 0, speaking: 0, listening: 0 }, gap: 0,
      rx: 0, ry: 0, spin: 0,
    };
    const api = {
      /** Bir martalik impuls (masalan, "qadam bajarildi"): kub bir "sakraydi". */
      setLevel(v) { const x = Math.max(0, Math.min(1, v)) * params.response; st.target = Math.max(st.target, x); st.pop = Math.max(st.pop, x); },
      /** Uzluksiz signal (nutq ritmi, mikrofon). */
      drive(v) { st.drive = Math.max(0, Math.min(1, v)) * params.response; st.driveAt = performance.now(); },
      setState(s) { if (STATE[s]) { st.state = s; canvas.dataset.state = s; } },
      setMood(m) { if (MOODS[m] && m !== "listening") st.mood = m; },
      setParams(p) { Object.assign(params, p); },
      getParams() { return { ...params }; },
      get debug() { return { state: st.state, mood: st.mood, level: +st.level.toFixed(3), weights: { ...st.w }, scrambled: history.length }; },
      destroy() { stopped = true; cancelAnimationFrame(raf); try { renderer?.dispose(); } catch { /* */ } },
    };
    let stopped = false, raf = 0, renderer = null;
    const history = [];
    canvas.dataset.state = "idle";

    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
    } catch {
      canvas.classList.add("no-webgl");
      return api;
    }
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 100);
    // Kub yuzi (N birlik) ko'rinish balandligining FILL qismini egallaydi
    const DIST = N / (FILL * 2 * Math.tan((FOV / 2) * Math.PI / 180)) + H + 0.5;
    camera.position.set(0, 0, DIST);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.1);
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(-4, 6, 8);
    const rim = new THREE.DirectionalLight(0xcfe8ff, 0.6);
    rim.position.set(6, -2, -4);
    scene.add(hemi, key, rim);

    // Materiallar: 4 stiker rangi + ichki (to'q) qism. Kutishda emissive=rang, chiroqlar o'chiq → aniq logo rangi
    const stick = MOODS.calm.map((hex) => {
      const c = new THREE.Color(hex);
      return new THREE.MeshStandardMaterial({ color: c, emissive: c.clone(), emissiveIntensity: 1, roughness: 0.38, metalness: 0.05 });
    });
    // Ichki yuzlar (oraliqlar va burilishda ko'rinadi): kubchaning o'z rangining ochroq tusi — qora emas
    const WHITE = new THREE.Color("#ffffff");
    const innerOf = (c) => c.clone().lerp(WHITE, 0.45);
    const inner = stick.map((m) => new THREE.MeshStandardMaterial({ color: innerOf(m.color), emissive: innerOf(m.color), emissiveIntensity: 0.35, roughness: 0.55, metalness: 0 }));
    const targetCols = MOODS.calm.map((h) => new THREE.Color(h));

    // Yuz bo'yicha (u, v) o'qlari — har bir yuzda logo tashqaridan qaraganda bir xil ko'rinadi
    // Box material tartibi: +x, -x, +y, -y, +z, -z
    const FACES = [
      (p) => [-p.z, p.y], (p) => [p.z, p.y],
      (p) => [p.x, -p.z], (p) => [p.x, p.z],
      (p) => [p.x, p.y], (p) => [-p.x, p.y],
    ];
    const ext = (p) => [p.x === H, p.x === -H, p.y === H, p.y === -H, p.z === H, p.z === -H];
    const quadOf = ([u, v]) => (v > 0 ? 0 : 2) + (u < 0 ? 0 : 1);

    const cube = new THREE.Group();
    const pivot = new THREE.Group();
    cube.add(pivot);
    scene.add(cube);
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const cubies = [];
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) for (let k = 0; k < N; k++) {
      const p = new THREE.Vector3(i - H, j - H, k - H);
      const e = ext(p);
      if (!e.some(Boolean)) continue; // ichki kubchalar ko'rinmaydi
      const own = quadOf(FACES[e.findIndex(Boolean)](p)); // kubchaning asosiy rangi — birinchi tashqi yuzidan
      const mats = e.map((on, f) => (on ? stick[quadOf(FACES[f](p))] : inner[own]));
      const m = new THREE.Mesh(geo, mats);
      m.userData.l = p.clone(); // mantiqiy joy (-1.5..1.5, 0.5 qadam)
      m.userData.seed = Math.random() * 10;
      cube.add(m);
      cubies.push(m);
    }

    /* ---------- burilishlar ---------- */
    let anim = null; // { m: {a, layer, d}, undo, start, dur, list }
    let nextAt = 0;
    const inv = (m) => ({ ...m, d: -m.d });
    function begin(m, undo, dur, now) {
      const list = cubies.filter((c) => Math.abs(c.userData.l[AX[m.a]] - m.layer) < 0.01);
      list.forEach((c) => pivot.attach(c));
      anim = { m, undo, start: now, dur, list };
    }
    function finish() {
      pivot.rotation.set(0, 0, 0);
      pivot.rotation[AX[anim.m.a]] = anim.m.d * Math.PI / 2;
      pivot.updateMatrixWorld(true);
      const mtx = new THREE.Matrix4();
      for (const c of anim.list) {
        cube.attach(c);
        // Mantiqiy joyni ham xuddi shu burilish bilan yangilaymiz va 0.5 to'rga "yopishtiramiz"
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...AX.map((_, i) => (i === anim.m.a ? 1 : 0))), anim.m.d * Math.PI / 2);
        const l = c.userData.l.applyQuaternion(q);
        l.set(Math.round(l.x * 2) / 2, Math.round(l.y * 2) / 2, Math.round(l.z * 2) / 2);
        mtx.makeRotationFromQuaternion(c.quaternion);
        const el = mtx.elements;
        for (const idx of [0, 1, 2, 4, 5, 6, 8, 9, 10]) el[idx] = Math.round(el[idx]);
        c.quaternion.setFromRotationMatrix(mtx);
      }
      pivot.rotation.set(0, 0, 0);
      if (anim.undo) history.pop(); else history.push(anim.m);
      anim = null;
    }
    function pick() {
      const last = history[history.length - 1];
      if (last && (history.length >= 7 || (history.length >= 3 && Math.random() < 0.25))) return { m: inv(last), undo: true };
      for (;;) {
        const m = { a: (Math.random() * 3) | 0, layer: ((Math.random() * N) | 0) - H, d: Math.random() < 0.5 ? 1 : -1 };
        if (!last || !(last.a === m.a && last.layer === m.layer && last.d === -m.d)) return { m, undo: false };
      }
    }

    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const ease = (cur, tgt, k) => cur + (tgt - cur) * k;
    let last = performance.now();
    const TAU = Math.PI * 2;

    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = now / 1000;

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cw = canvas.clientWidth, ch = canvas.clientHeight;
      if (cw && ch && (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr))) {
        renderer.setPixelRatio(dpr);
        renderer.setSize(cw, ch, false);
        camera.aspect = cw / ch;
        camera.updateProjectionMatrix();
      }

      for (const k of Object.keys(st.w)) st.w[k] = ease(st.w[k], st.state === k ? 1 : 0, 1 - Math.exp(-dt * 4));
      const S = STATE[st.state];
      const act = Math.min(1, st.w.thinking + st.w.working + st.w.speaking + st.w.listening);

      // Daraja: nutq/mikrofon signali + holat foni
      const think = st.state === "thinking" ? 0.06 * (0.5 + 0.5 * Math.sin(now / 300)) : 0;
      const driven = now - st.driveAt < 160;
      const tgt = Math.max(st.target, S.base + think, driven ? st.drive : 0);
      st.level = ease(st.level, tgt, tgt > st.level ? 1 - Math.exp(-dt * 26) : 1 - Math.exp(-dt * (driven ? 14 : 5)));
      st.target *= Math.exp(-dt * 9);
      st.pop *= Math.exp(-dt * 7);
      const L = Math.min(1, st.level);

      // Ranglar (kayfiyat / tinglash) silliq o'zgaradi
      const pal = MOODS[st.state === "listening" ? "listening" : st.mood];
      for (let i = 0; i < 4; i++) {
        targetCols[i].set(pal[i]);
        stick[i].color.lerp(targetCols[i], 1 - Math.exp(-dt * 3));
        stick[i].emissive.copy(stick[i].color);
        // Kutishda — tekis logo (faqat emissive), faol holatda — haqiqiy 3D yorug'lik
        stick[i].emissiveIntensity = 1 - 0.78 * act;
        inner[i].color.copy(stick[i].color).lerp(WHITE, 0.45);
        inner[i].emissive.copy(inner[i].color);
      }
      hemi.intensity = 1.1 * act * params.glow;
      key.intensity = 1.6 * act * params.glow;
      rim.intensity = 0.6 * act * params.glow;
      for (const m of stick) m.roughness = 0.6 - 0.35 * Math.min(1, params.detail);

      st.gap = ease(st.gap, S.gap * params.rimWidth + 0.08 * L * st.w.speaking, 1 - Math.exp(-dt * 6));

      // ---- burilishlarni rejalash ----
      const speed = Math.max(0.2, params.speed) * (st.mood === "excited" ? 1.35 : st.mood === "concerned" ? 0.8 : 1);
      if (anim && now - anim.start >= anim.dur) { finish(); nextAt = now + (S.every ? S.every / speed : 60); }
      if (!anim && !reduce && now >= nextAt) {
        if (S.every) { const { m, undo } = pick(); begin(m, undo, S.dur / speed, now); }
        else if (history.length) begin(inv(history[history.length - 1]), true, S.dur / speed, now);
      }
      if (anim) {
        const p = easeIO(Math.min(1, (now - anim.start) / anim.dur));
        pivot.rotation.set(0, 0, 0);
        pivot.rotation[AX[anim.m.a]] = anim.m.d * (Math.PI / 2) * p;
      }

      // ---- kubchalar joyi: oraliq + nutq "nafasi" + tinglash to'lqini ----
      const sp = 1 + st.gap;
      for (const c of cubies) {
        const l = c.userData.l;
        let f = sp;
        if (!reduce) {
          const r = l.length();
          f += st.w.speaking * L * (0.06 + 0.16 * (0.5 + 0.5 * Math.sin(t * 9 + c.userData.seed * 3)));
          f += st.w.listening * (0.035 + 0.06 * L) * Math.sin(t * 6 - r * 2.2);
        }
        // pivot ichidagi kubchalar ham shu lokal koordinatada (pivot markazda)
        c.position.set(l.x * f, l.y * f, l.z * f);
      }

      // ---- butun kubning burchagi ----
      // Kutish: to'g'ri qarash (logo). Faol: 3/4 ko'rinish; ishlashda sekin aylanadi
      if (!reduce) st.spin += dt * 0.6 * st.w.working * params.swirl;
      if (st.w.working < 0.05) st.spin = ease(st.spin, Math.round(st.spin / TAU) * TAU, 1 - Math.exp(-dt * 2));
      const sway = reduce ? 0 : 0.12 * Math.sin(t * 0.9) * (st.w.thinking + st.w.listening);
      st.rx = ease(st.rx, 0.5 * act, 1 - Math.exp(-dt * 3));
      st.ry = ease(st.ry, -0.62 * act, 1 - Math.exp(-dt * 3));
      cube.rotation.set(st.rx + sway * 0.4, st.ry + st.spin + sway, 0);
      // 3/4 ko'rinishda kub kattaroq ko'rinadi — kichraytiramiz (canvas'dan chiqib ketmasin)
      const s = (1 - 0.36 * act) * (1 + 0.06 * L * st.w.speaking + 0.07 * st.pop);
      cube.scale.setScalar(s);

      renderer.render(scene, camera);
      if (!stopped) raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return api;
  }
  return { mount, DEFAULTS, MOODS: Object.keys(MOODS).filter((m) => m !== "listening"), STATES: Object.keys(STATE) };
})();

/* ---------- Rive avatari (client/public/avatar.riv) + zaxira ----------
 Dizayner Rive'da avatar.riv tayyorlaganda ilova uni avtomatik ishlatadi (spec: docs/rive-avatar.md).
 Fayl bo'lmasa yoki yuklanmasa — 3D kub (CubeAvatar). API bir xil, shuning uchun App.jsx, speech.js va
 avatar-lab o'zgarmaydi. Canvas'da faqat bitta kontekst bo'lishi mumkin (2D yoki WebGL), shu sabab
 avval fayl borligini tekshiramiz, keyin qaysi avatarni ishga tushirishni hal qilamiz. */
const RIVE_STATES = { idle: 0, thinking: 1, working: 2, speaking: 3, listening: 4 };
const RIVE_MOODS = { calm: 0, happy: 1, excited: 2, concerned: 3 };

async function riveFileUrl() {
  // Sinov uchun (faqat dev): ?riv=https://... bilan boshqa .riv faylni ochish mumkin
  const override = import.meta.env.DEV ? new URLSearchParams(location.search).get("riv") : null;
  const url = override || "/avatar.riv";
  try {
    const r = await fetch(url, { method: override ? "GET" : "HEAD", cache: "no-store" });
    const type = r.headers.get("content-type") || "";
    return r.ok && !type.includes("text/html") ? url : null;
  } catch {
    return null;
  }
}

function mountRive(canvas, src, initial, onFail) {
  const st = { state: "idle", mood: "calm", level: 0, target: 0, drive: 0, driveAt: 0 };
  const params = { ...CubeAvatar.DEFAULTS, ...(initial || {}) };
  let rive = null, inputs = {}, raf = 0, stopped = false, sent = -1;
  canvas.dataset.state = "idle";

  const send = () => {
    if (inputs.state) inputs.state.value = RIVE_STATES[st.state];
    if (inputs.mood) inputs.mood.value = RIVE_MOODS[st.mood] ?? 0;
  };
  (async () => {
    try {
      const { Rive, Layout, Fit, Alignment, RuntimeLoader } = await import("@rive-app/canvas");
      const wasm = (await import("@rive-app/canvas/rive.wasm?url")).default;
      RuntimeLoader.setWasmUrl(wasm); // WASM o'zimizdan — tashqi CDN kerak emas
      if (stopped) return;
      rive = new Rive({
        src, canvas, autoplay: true, stateMachines: "Avatar", // asosiy (default) artboard ishlatiladi
        layout: new Layout({ fit: Fit.Contain, alignment: Alignment.Center }),
        onLoad: () => {
          rive.resizeDrawingSurfaceToCanvas();
          for (const i of rive.stateMachineInputs("Avatar") || []) inputs[i.name] = i;
          send();
        },
        onLoadError: () => { if (!stopped) onFail(true); },
      });
    } catch {
      if (!stopped) onFail(!!rive);
    }
  })();

  // Ovoz darajasi: nutq/mikrofon signali tez ko'tariladi, sekin tushadi → "level" (0..100)
  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const driven = now - st.driveAt < 160;
    const tgt = Math.max(st.target, driven ? st.drive : 0);
    st.level += (tgt - st.level) * (tgt > st.level ? 1 - Math.exp(-dt * 26) : 1 - Math.exp(-dt * (driven ? 14 : 5)));
    st.target *= Math.exp(-dt * 9);
    const v = Math.round(Math.min(1, st.level) * 100);
    if (inputs.level && v !== sent) { inputs.level.value = v; sent = v; }
    if (!stopped) raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  return {
    setLevel(v) { const x = Math.max(0, Math.min(1, v)) * params.response; st.target = Math.max(st.target, x); inputs.pulse?.fire?.(); },
    drive(v) { st.drive = Math.max(0, Math.min(1, v)) * params.response; st.driveAt = performance.now(); },
    setState(s) { if (s in RIVE_STATES) { st.state = s; canvas.dataset.state = s; send(); } },
    setMood(m) { if (m in RIVE_MOODS) { st.mood = m; send(); } },
    setParams(p) { Object.assign(params, p); },
    getParams() { return { ...params }; },
    get debug() { return { state: st.state, mood: st.mood, level: +st.level.toFixed(3), weights: {}, rive: !!rive, inputs: Object.keys(inputs) }; },
    destroy() { stopped = true; cancelAnimationFrame(raf); try { rive?.cleanup(); } catch { /* */ } },
  };
}

/** Ilova shu obyektni ishlatadi: avatar.riv bo'lsa — Rive, bo'lmasa — 3D kub. */
export const OsonAvatar = {
  ...CubeAvatar,
  mount(canvas, initial) {
    // Haqiqiy avatar tayyor bo'lguncha chaqiruvlarni yozib boramiz, keyin unga o'tkazamiz
    let impl = null, destroyed = false;
    const pending = { state: "idle", mood: "calm", params: null };
    const useCube = () => {
      if (destroyed) return;
      impl = CubeAvatar.mount(canvas, initial);
      if (pending.params) impl.setParams(pending.params);
      impl.setMood(pending.mood);
      impl.setState(pending.state);
    };
    riveFileUrl().then((src) => {
      if (destroyed) return;
      if (!src) return useCube();
      impl = mountRive(canvas, src, initial, (contextTaken) => {
        impl?.destroy();
        // Rive canvas'ni egallab bo'lgan bo'lsa, unda WebGL ochib bo'lmaydi — statik logo ko'rsatamiz
        if (contextTaken) { canvas.classList.add("no-webgl"); impl = null; } else useCube();
      });
      impl.setMood(pending.mood);
      impl.setState(pending.state);
    });
    canvas.dataset.state = "idle";
    return {
      setLevel: (v) => impl?.setLevel(v),
      drive: (v) => impl?.drive(v),
      setState: (s) => { pending.state = s; canvas.dataset.state = s; impl?.setState(s); },
      setMood: (m) => { pending.mood = m; impl?.setMood(m); },
      setParams: (p) => { pending.params = { ...(pending.params || {}), ...p }; impl?.setParams(p); },
      getParams: () => impl?.getParams() || { ...CubeAvatar.DEFAULTS, ...(initial || {}), ...(pending.params || {}) },
      get debug() { return impl?.debug || { state: pending.state, mood: pending.mood, level: 0, weights: {} }; },
      destroy: () => { destroyed = true; impl?.destroy(); },
    };
  },
};
