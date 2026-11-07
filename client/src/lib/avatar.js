// Oson AI avatari — shisha shar ichidagi energiya (WebGL fragment shader).
// Holatlar (silliq o'tish bilan): idle · thinking · working · speaking · listening
// Kayfiyat: calm · happy · excited · concerned
// API: OsonAvatar.mount(canvas, params?) → { setState, setMood, setLevel, drive, setParams, getParams, destroy }
// Sozlamalar /avatar-lab.html da tanlanib, localStorage("osonAvatarParams") orqali ilovaga o'tadi.

export const OsonAvatar = (() => {
  const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;
  const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;   // oqim soati (tezlik holatga bog'liq)
uniform float uReal;   // haqiqiy vaqt (pulsatsiyalar uchun)
uniform float uLevel;  // ovoz/nutq kuchi 0..1
uniform float uThink, uWork, uSpeak, uListen; // holat og'irliklari 0..1
uniform float uGlow, uSwirl, uRimW, uDetail;
uniform vec3 uColA, uColB, uColC;

const float PI = 3.14159265;
float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y);
}
float fbm(vec2 p){ float v = 0.0, a = 0.5; mat2 m = mat2(1.6, 1.2, -1.2, 1.6); for (int i = 0; i < 5; i++){ v += a*noise(p); p = m*p; a *= 0.5; } return v; }
float fbm3(vec2 p){ float v = 0.0, a = 0.55; mat2 m = mat2(1.5, 1.0, -1.0, 1.5); for (int i = 0; i < 3; i++){ v += a*noise(p); p = m*p; a *= 0.45; } return v/0.9; }
mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5*uRes) / min(uRes.x, uRes.y);
  float t = uTime, rt = uReal, L = uLevel;
  float ang = atan(uv.y, uv.x);

  // Radius: nafas + nutq kengayishi + gapirganda halqa to'lqini
  float breath = 0.012*sin(rt*1.1);
  float R = 0.33*(1.0 + breath + 0.14*L*uSpeak + 0.05*L*uListen);
  // Gapirganda halqada nozik to'lqin (cos — burchak bo'yicha uzluksiz)
  float wave = (0.0045*cos(ang*4.0 + rt*6.0) + 0.0025*cos(ang*7.0 - rt*9.0)) * L * uSpeak;
  float Rw = R + wave;
  float d = length(uv);
  float inside = smoothstep(Rw + 0.004, Rw - 0.004, d);

  // Soxta 3D: sfera normali — markaz bo'rtib, chetlar siqilib ko'rinadi (shisha linza)
  vec2 sp = uv / R;
  float rr = clamp(length(sp), 0.0, 1.0);
  float z = sqrt(max(0.0, 1.0 - rr*rr));
  vec2 bp = sp / (0.55 + 0.45*z);

  // Ichki oqim: aylanish + domain warp
  float spin = t*(0.12 + uSwirl*(0.35*uThink + 0.7*uWork + 0.25*uSpeak)) - 0.2*uListen*rt;
  vec2 p = rot(spin) * bp;
  vec2 w = vec2(fbm3(p*1.2 + vec2(t*0.11, 0.0)), fbm3(p*1.2 + vec2(3.1, -t*0.13)));
  vec2 p2 = p*(0.8 + 0.5*uDetail) + (w - 0.5)*(1.4 + 0.7*L);
  float f = fbm3(p2 + vec2(t*0.15, -t*0.06));
  float g = mix(fbm3(p2*1.6 - vec2(t*0.1, t*0.12) + 5.0), fbm(p2*1.6 + 9.0), 0.25*uDetail);
  // Yumshoq nurli pardalar (veil) va kam sonli silliq tolalar (silk)
  float veil = pow(smoothstep(0.30, 0.85, f), 1.6);
  float silk = exp(-pow((g - 0.52)*9.0, 2.0)) * (0.35 + 0.65*uDetail);

  // Energiya bir tomonga to'planadi va asta aylanadi (videodagidek); markaz qorong'i va shaffof
  vec2 dir = vec2(cos(t*0.22 + 2.0), sin(t*0.22 + 2.0));
  float side = smoothstep(-0.9, 0.9, dot(sp, dir));
  float edge = smoothstep(0.15, 1.0, rr);

  vec3 col = vec3(0.0);
  col += uColA * veil * edge * (0.25 + 1.05*side) * (0.9 + 1.4*L);
  col += uColB * silk * edge * (0.2 + 0.9*side) * (0.8 + 1.6*L);
  col += mix(uColA, uColB, f) * veil * silk * 0.6 * side;

  // Kometa izi: markazdan chetga oqadigan yorqin chiziq (ishlash/o'ylashda kuchli)
  float ca = t*0.45 + 1.3;
  float da = abs(mod(ang - ca + PI, 2.0*PI) - PI);
  float tail = exp(-da*da*(26.0 - 10.0*rr)) * smoothstep(0.05, 0.35, rr) * smoothstep(1.0, 0.55, rr);
  col += mix(uColA, uColB, rr) * tail * (0.25 + 0.7*uWork + 0.4*uThink + 0.5*L);

  // Markazdagi yulduz (nurli uchqun)
  vec2 c = sp - 0.07*vec2(sin(t*0.6), cos(t*0.8));
  float cd = length(c);
  float star = 0.018/(cd + 0.03) + exp(-cd*14.0)*0.35;
  star += (exp(-abs(c.x)*55.0)*exp(-abs(c.y)*5.0) + exp(-abs(c.y)*55.0)*exp(-abs(c.x)*5.0)) * 0.22;
  star *= 0.55 + 0.9*L + 0.3*uThink*(0.5 + 0.5*sin(rt*5.0));
  col += mix(uColC, vec3(1.0), 0.65) * star;

  // Tinglash: ichkariga oquvchi halqalar
  float rings = 0.5 + 0.5*sin(rr*28.0 + rt*7.0);
  col += uColA * rings * pow(rr, 2.5) * 0.3 * uListen * (0.35 + L);

  // Shisha: chetga yaqin ichki yorug'lik (fresnel) va yaltiroq dog'
  col += mix(uColA, uColB, 0.5 + 0.5*sp.y) * pow(rr, 7.0) * 0.45;
  col *= inside;
  vec2 hl = sp - vec2(-0.42, 0.48);
  col += vec3(1.0) * exp(-dot(hl, hl)*16.0) * 0.07 * inside;

  // Halqa (rim): burchak bo'yicha uzluksiz gradient
  float hue = 0.5 + 0.5*cos(ang - t*(0.35 + 1.1*uWork) + 0.6);
  vec3 rimCol = mix(uColA, uColB, hue);
  float rimW = uRimW*0.0045 + 0.003*L;
  float rim = exp(-abs(d - Rw)/rimW);
  float seg = 0.5 + 0.5*cos(ang*3.0 - rt*5.5);           // ishlash: yuguruvchi segmentlar
  float rimMul = mix(1.0, 0.35 + 1.35*seg, uWork);
  rimMul *= 1.0 + 0.4*uThink*sin(rt*3.5);                // o'ylash: pulsatsiya
  col += rimCol * rim * rimMul * (1.25 + 1.6*L) * uGlow;

  // Tashqi nur (halo)
  float halo = exp(-max(d - Rw, 0.0)*(10.0 - 4.5*L)) * (1.0 - inside);
  col += rimCol * halo * (0.14 + 0.55*L + 0.12*(uThink + uWork)) * uGlow;

  col = 1.0 - exp(-col*1.35);
  float alpha = clamp(max(max(col.r, col.g), col.b)*1.6, 0.0, 1.0);
  gl_FragColor = vec4(col, alpha);
}`;

  const MOODS = {
    calm: [[0.36, 0.5, 1.0], [0.96, 0.4, 0.74], [0.6, 0.72, 1.0]],
    happy: [[0.66, 0.44, 1.0], [1.0, 0.45, 0.7], [1.0, 0.84, 0.96]],
    excited: [[0.28, 0.66, 1.0], [1.0, 0.3, 0.58], [1.0, 1.0, 1.0]],
    concerned: [[1.0, 0.56, 0.28], [0.95, 0.28, 0.4], [1.0, 0.78, 0.5]],
    listening: [[0.22, 0.86, 0.92], [0.42, 0.52, 1.0], [0.75, 1.0, 1.0]],
  };
  // Har bir holatda ichki oqim tezligi va "fon" faolligi
  const STATE = {
    idle: { speed: 0.10, base: 0.0 },
    thinking: { speed: 0.55, base: 0.18 },
    working: { speed: 0.9, base: 0.28 },
    speaking: { speed: 0.5, base: 0.02 },
    listening: { speed: 0.35, base: 0.06 },
  };
  const DEFAULTS = { speed: 1, glow: 1, swirl: 1, rimWidth: 1, detail: 0.5, response: 1 };

  function loadSaved() {
    try { return JSON.parse(localStorage.getItem("osonAvatarParams") || "null") || {}; } catch { return {}; }
  }

  function mount(canvas, initial) {
    const params = { ...DEFAULTS, ...loadSaved(), ...(initial || {}) };
    const gl = canvas.getContext("webgl", { premultipliedAlpha: false, alpha: true, antialias: true });
    const st = {
      state: "idle", mood: "calm", level: 0, target: 0, drive: 0, driveAt: 0,
      w: { thinking: 0, working: 0, speaking: 0, listening: 0 },
      col: MOODS.calm.map((c) => c.slice()), speed: STATE.idle.speed,
    };
    const api = {
      /** Bir martalik impuls (masalan, "qadam bajarildi"): tez ko'tariladi, asta so'nadi. */
      setLevel(v) { st.target = Math.max(st.target, Math.max(0, Math.min(1, v)) * params.response); },
      /** Uzluksiz signal (nutq ritmi, mikrofon): darajani bevosita boshqaradi — bo'g'inlar orasida aniq pasayadi. */
      drive(v) { st.drive = Math.max(0, Math.min(1, v)) * params.response; st.driveAt = performance.now(); },
      setState(s) { if (STATE[s]) { st.state = s; canvas.dataset.state = s; } },
      setMood(m) { if (MOODS[m]) st.mood = m; },
      setParams(p) { Object.assign(params, p); },
      getParams() { return { ...params }; },
      get debug() { return { state: st.state, mood: st.mood, level: +st.level.toFixed(3), weights: { ...st.w } }; },
      /** Animatsiya siklini to'xtatadi (React komponenti unmount bo'lganda). */
      destroy() { stopped = true; cancelAnimationFrame(raf); },
    };
    let stopped = false;
    let raf = 0;
    canvas.dataset.state = "idle";
    if (!gl) { canvas.classList.add("no-webgl"); return api; }

    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = {};
    for (const n of ["uRes", "uTime", "uReal", "uLevel", "uThink", "uWork", "uSpeak", "uListen", "uGlow", "uSwirl", "uRimW", "uDetail", "uColA", "uColB", "uColC"]) U[n] = gl.getUniformLocation(prog, n);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let clock = 0;
    const t0 = performance.now();
    let last = t0;
    const ease = (cur, tgt, k) => cur + (tgt - cur) * k;

    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cw = Math.round(canvas.clientWidth * dpr), ch = Math.round(canvas.clientHeight * dpr);
      if (cw && ch && (canvas.width !== cw || canvas.height !== ch)) { canvas.width = cw; canvas.height = ch; }

      // Holat og'irliklari silliq o'zgaradi (keskin sakrash yo'q)
      for (const k of Object.keys(st.w)) st.w[k] = ease(st.w[k], st.state === k ? 1 : 0, 1 - Math.exp(-dt * 4));
      const S = STATE[st.state];
      st.speed = ease(st.speed, S.speed, 1 - Math.exp(-dt * 2.5));

      // Daraja: tashqi impulslar (nutq/mikrofon) + holat foni; tez ko'tariladi, sekin tushadi
      const think = st.state === "thinking" ? 0.08 * (0.5 + 0.5 * Math.sin(now / 300)) : 0;
      const driven = now - st.driveAt < 160; // uzluksiz signal kelib turibdimi
      const tgt = Math.max(st.target, S.base + think, driven ? st.drive : 0);
      const fall = driven ? 14 : 5; // nutqda tez pasayish → puls aniq ko'rinadi
      st.level = ease(st.level, tgt, tgt > st.level ? 1 - Math.exp(-dt * 26) : 1 - Math.exp(-dt * fall));
      st.target *= Math.exp(-dt * 9);

      const want = MOODS[st.state === "listening" ? "listening" : st.mood];
      for (let i = 0; i < 3; i++) for (let k = 0; k < 3; k++) st.col[i][k] = ease(st.col[i][k], want[i][k], 1 - Math.exp(-dt * 3));

      clock += dt * (reduce ? 0.08 : (st.speed + 0.6 * st.level) * params.speed);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(U.uRes, canvas.width, canvas.height);
      gl.uniform1f(U.uTime, clock);
      gl.uniform1f(U.uReal, reduce ? 0 : (now - t0) / 1000);
      gl.uniform1f(U.uLevel, Math.min(1, st.level));
      gl.uniform1f(U.uThink, st.w.thinking);
      gl.uniform1f(U.uWork, st.w.working);
      gl.uniform1f(U.uSpeak, st.w.speaking);
      gl.uniform1f(U.uListen, st.w.listening);
      gl.uniform1f(U.uGlow, params.glow);
      gl.uniform1f(U.uSwirl, params.swirl);
      gl.uniform1f(U.uRimW, params.rimWidth);
      gl.uniform1f(U.uDetail, params.detail);
      gl.uniform3fv(U.uColA, st.col[0]);
      gl.uniform3fv(U.uColB, st.col[1]);
      gl.uniform3fv(U.uColC, st.col[2]);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (!stopped) raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return api;
  }
  return { mount, DEFAULTS, MOODS: Object.keys(MOODS).filter((m) => m !== "listening"), STATES: Object.keys(STATE) };
})();
