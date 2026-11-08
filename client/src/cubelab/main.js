// Cube Lab — avatar g'oyasi: ajralgan (exploded) 4×4×4 kub, markazida porlovchi yadro.
// Oq mavzu: kubchalar oq shisha, qirralari logo ranglarida (tepada yashil, pastda ko'k),
// ichkaridagi yorug'lik kubchalarning ichki yuzlarini yashil/ko'k rangga bo'yaydi, orqada nur dastalari.
import * as THREE from "three";

const N = 4, H = (N - 1) / 2;
const C = { g1: "#12c26b", g2: "#3ee28c", b1: "#5b80ec", b2: "#3e5fd8" };
// Holatlar: gap — ajralish, spin — aylanish tezligi, every/dur — qatlam burilishlari, core — yadro kuchi
const STATES = {
  idle: { gap: 0.42, spin: 0.12, every: null, dur: 400, core: 0.55, ray: 0.55 },
  thinking: { gap: 0.55, spin: 0.22, every: 1100, dur: 650, core: 0.85, ray: 0.8 },
  working: { gap: 0.62, spin: 0.45, every: 80, dur: 340, core: 1.1, ray: 1 },
  speaking: { gap: 0.48, spin: 0.16, every: null, dur: 260, core: 0.9, ray: 0.85 },
  listening: { gap: 0.52, spin: 0.1, every: null, dur: 280, core: 0.8, ray: 0.75 },
};

const canvas = document.getElementById("cube");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
// Haqiqiy soyalar: markazdagi chiroq nuri kubchalar bilan to'siladi — faqat oraliqlardan chiqadi
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
camera.position.set(0, 0, 17);

// Yorug'lik: oq muhit + markazdagi rangli yadro (yashil va ko'k — ikki nuqtaviy chiroq)
scene.add(new THREE.HemisphereLight(0xffffff, 0xdfe8ea, 1.5));
const keyL = new THREE.DirectionalLight(0xffffff, 1.2);
keyL.position.set(-5, 8, 10);
scene.add(keyL);
// Old tomondan yumshoq to'ldiruvchi yorug'lik — tashqi yuzlar kulrang emas, oq ko'rinsin
const fillL = new THREE.DirectionalLight(0xffffff, 1.1);
fillL.position.set(4, -1, 12);
scene.add(fillL);
const coreG = new THREE.PointLight(C.g2, 60, 0, 1);
const coreB = new THREE.PointLight(C.b1, 60, 0, 1);
for (const l of [coreG, coreB]) {
  l.castShadow = true;
  l.shadow.mapSize.set(512, 512);
  l.shadow.bias = -0.004;
  l.shadow.radius = 3;
  l.shadow.camera.near = 0.05;
}
scene.add(coreG, coreB);

const cube = new THREE.Group();
const pivot = new THREE.Group();
cube.add(pivot);
scene.add(cube);

// Yadro: asosiy sahnada — kichik porlovchi shar; nur dastalari uchun alohida (1-qatlam) kattaroq oq "quyosh"
const core = new THREE.Mesh(new THREE.SphereGeometry(0.32, 32, 16), new THREE.MeshBasicMaterial({ color: 0xeafff4 }));
const sun = new THREE.Mesh(new THREE.SphereGeometry(1.15, 32, 16), new THREE.MeshBasicMaterial({ color: 0xffffff }));
sun.layers.set(1);
cube.add(core, sun);

// Kubchalar: oq shisha tana + logo rangidagi qirralar. Rang — kubchaning (x, y) joyiga qarab:
// tepa-chap to'q yashil, tepa-o'ng och yashil, past-chap och ko'k, past-o'ng to'q ko'k (logo)
const quadColor = (p) => (p.y > 0 ? (p.x < 0 ? C.g1 : C.g2) : (p.x < 0 ? C.b1 : C.b2));
const geo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
const edges = new THREE.EdgesGeometry(geo);
const bodyMats = {}, lineMats = {};
for (const hex of Object.values(C)) {
  bodyMats[hex] = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color("#ffffff").lerp(new THREE.Color(hex), 0.06),
    roughness: 0.28, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.12,
    emissive: new THREE.Color("#ffffff"), emissiveIntensity: 0.18,
  });
  lineMats[hex] = new THREE.LineBasicMaterial({ color: hex, transparent: true, opacity: 0.9 });
}
const cubies = [];
for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) for (let k = 0; k < N; k++) {
  const p = new THREE.Vector3(i - H, j - H, k - H);
  if (Math.max(Math.abs(p.x), Math.abs(p.y), Math.abs(p.z)) < H) continue; // faqat tashqi qobiq
  const hex = quadColor(p);
  const m = new THREE.Mesh(geo, bodyMats[hex]);
  m.castShadow = true;
  m.receiveShadow = true;
  m.add(new THREE.LineSegments(edges, lineMats[hex]));
  m.userData = { l: p.clone(), seed: Math.random() * 10 };
  cube.add(m);
  cubies.push(m);
}

/* ---------- qatlam burilishlari (Rubik) ---------- */
const AX = ["x", "y", "z"];
const history = [];
let anim = null, nextAt = 0;
const inv = (m) => ({ ...m, d: -m.d });
const easeIO = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
function begin(m, undo, dur, now) {
  const list = cubies.filter((c) => Math.abs(c.userData.l[AX[m.a]] - m.layer) < 0.01);
  list.forEach((c) => pivot.attach(c));
  anim = { m, undo, start: now, dur, list };
}
function finish() {
  pivot.rotation.set(0, 0, 0);
  pivot.rotation[AX[anim.m.a]] = anim.m.d * Math.PI / 2;
  pivot.updateMatrixWorld(true);
  const axis = new THREE.Vector3(...AX.map((_, i) => (i === anim.m.a ? 1 : 0)));
  const q = new THREE.Quaternion().setFromAxisAngle(axis, anim.m.d * Math.PI / 2);
  const mtx = new THREE.Matrix4();
  for (const c of anim.list) {
    cube.attach(c);
    const l = c.userData.l.applyQuaternion(q);
    l.set(Math.round(l.x * 2) / 2, Math.round(l.y * 2) / 2, Math.round(l.z * 2) / 2);
    mtx.makeRotationFromQuaternion(c.quaternion);
    for (const i of [0, 1, 2, 4, 5, 6, 8, 9, 10]) mtx.elements[i] = Math.round(mtx.elements[i]);
    c.quaternion.setFromRotationMatrix(mtx);
  }
  pivot.rotation.set(0, 0, 0);
  if (anim.undo) history.pop(); else history.push(anim.m);
  anim = null;
}
function pick() {
  const last = history[history.length - 1];
  if (last && (history.length >= 6 || (history.length >= 3 && Math.random() < 0.25))) return { m: inv(last), undo: true };
  for (;;) {
    const m = { a: (Math.random() * 3) | 0, layer: ((Math.random() * N) | 0) - H, d: Math.random() < 0.5 ? 1 : -1 };
    if (!last || !(last.a === m.a && last.layer === m.layer && last.d === -m.d)) return { m, undo: false };
  }
}

/* ---------- boshqaruv ---------- */
let state = "idle";
const ui = { spread: 1, light: 1 };
document.getElementById("states").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-s]");
  if (!b) return;
  state = b.dataset.s;
  document.querySelectorAll("#states button").forEach((x) => x.classList.toggle("active", x === b));
});
document.getElementById("spread").addEventListener("input", (e) => { ui.spread = +e.target.value; });
document.getElementById("light").addEventListener("input", (e) => { ui.light = +e.target.value; });

/* ---------- kadr ---------- */
const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const ease = (a, b, k) => a + (b - a) * k;
const cur = { gap: 0.3, spin: 0.12, core: 0.55, ray: 0.55, w: { speaking: 0, listening: 0, thinking: 0 } };
let rotY = 0.7, last = performance.now();

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // Tor ekranda kub sig'ishi uchun kamera uzoqlashadi
  camera.position.z = 19 * Math.max(1, 0.85 / camera.aspect);
  camera.updateProjectionMatrix();
}
/* ---------- Nur dastalari (volumetrik "god rays") ----------
 1) Okklyuziya: oq "quyosh" (yadro) qora fonda, kubchalar uning oldida QORA siluet — nur faqat oraliqlardan ko'rinadi.
 2) Radial xiralash: bu tasvir yadrodan tashqariga "cho'ziladi" — kubchalar orasidan chiquvchi dastalar hosil bo'ladi.
 3) Kompozitsiya: oq sahifada "qo'shiladigan" yorug'lik ko'rinmaydi, shuning uchun dastalar yashil/ko'k RANG
    sifatida (shaffoflik = nur kuchi) kub ustidan chiziladi. */
const occRT = new THREE.WebGLRenderTarget(1, 1);
const rayRT = new THREE.WebGLRenderTarget(1, 1);
const black = new THREE.MeshBasicMaterial({ color: 0x000000 });
const quadGeo = new THREE.PlaneGeometry(2, 2);
const VERT = "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }";
const blurMat = new THREE.ShaderMaterial({
  uniforms: { tOcc: { value: occRT.texture }, uLight: { value: new THREE.Vector2(0.5, 0.5) }, uDensity: { value: 0.96 }, uDecay: { value: 0.975 }, uWeight: { value: 0.5 } },
  vertexShader: VERT,
  fragmentShader: `
    uniform sampler2D tOcc; uniform vec2 uLight; uniform float uDensity, uDecay, uWeight; varying vec2 vUv;
    const int S = 120;
    void main(){
      vec2 d = (vUv - uLight) * (uDensity / float(S));
      // Tasodifiy siljish (dither) — pog'onali chiziqlar ko'rinmasin
      float j = fract(sin(dot(vUv, vec2(12.9898, 78.233))) * 43758.5453);
      vec2 tc = vUv - d * j;
      float illum = 1.0, acc = 0.0;
      for (int i = 0; i < S; i++) { tc -= d; acc += texture2D(tOcc, tc).r * illum * uWeight; illum *= uDecay; }
      gl_FragColor = vec4(vec3(acc), 1.0);
    }`,
  depthTest: false, depthWrite: false,
});
const compMat = new THREE.ShaderMaterial({
  uniforms: { tRays: { value: rayRT.texture }, uLight: { value: new THREE.Vector2(0.5, 0.5) }, uAspect: { value: 1 }, uTime: { value: 0 }, uStrength: { value: 1 },
    cA: { value: new THREE.Color(C.g2) }, cB: { value: new THREE.Color(C.b1) } },
  vertexShader: VERT,
  fragmentShader: `
    uniform sampler2D tRays; uniform vec2 uLight; uniform float uAspect, uTime, uStrength; uniform vec3 cA, cB; varying vec2 vUv;
    void main(){
      float r = texture2D(tRays, vUv).r * uStrength;
      vec2 p = vUv - uLight; p.x *= uAspect;
      float ang = atan(p.y, p.x);
      // Dastalar burchak bo'yicha yashil ↔ ko'k almashadi, markazga yaqin — oqroq
      vec3 col = mix(cA, cB, 0.5 + 0.5 * sin(ang * 2.0 + uTime * 0.25));
      col = mix(col, vec3(1.0), 0.18 + smoothstep(0.25, 0.0, length(p)) * 0.5);
      // Yumshoq egri chiziq: kuchsiz nurlar ko'rinadi, kuchlilari ranglarni "bosib" ketmaydi
      float a = 1.0 - exp(-r * 2.2);
      gl_FragColor = vec4(col, a * 0.72);
    }`,
  transparent: true, depthTest: false, depthWrite: false,
});
const fsScene = new THREE.Scene(), fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const fsQuad = new THREE.Mesh(quadGeo, blurMat);
fsScene.add(fsQuad);

function resizeRT() {
  const pr = renderer.getPixelRatio();
  const w = Math.max(1, Math.round(innerWidth * pr * 0.5)), h = Math.max(1, Math.round(innerHeight * pr * 0.5));
  occRT.setSize(w, h);
  rayRT.setSize(w, h);
}
addEventListener("resize", () => { resize(); resizeRT(); });
resize();
resizeRT();
const lightNdc = new THREE.Vector3();

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const t = now / 1000;
  const S = STATES[state];
  const k = 1 - Math.exp(-dt * 3);
  for (const s of Object.keys(cur.w)) cur.w[s] = ease(cur.w[s], state === s ? 1 : 0, 1 - Math.exp(-dt * 4));

  // Nutq ritmi (sinov uchun sun'iy): bo'g'inlarga o'xshash pulslar
  const L = cur.w.speaking * Math.max(0, Math.sin(t * 7.3) * 0.6 + Math.sin(t * 13.1 + 1) * 0.4) ** 1.5;

  cur.gap = ease(cur.gap, (S.gap + (state === "thinking" ? 0.06 * Math.sin(t * 2) : 0)) * ui.spread + 0.22 * L, 1 - Math.exp(-dt * (L ? 12 : 3)));
  cur.spin = ease(cur.spin, S.spin, k);
  cur.core = ease(cur.core, (S.core + 0.6 * L) * ui.light, 1 - Math.exp(-dt * 8));
  cur.ray = ease(cur.ray, S.ray * ui.light, k);

  // Qatlam burilishlari: ishlashda chalkashtiradi, boshqa holatlarda teskari tartibda yechadi
  if (anim && now - anim.start >= anim.dur) { finish(); nextAt = now + (S.every || 80); }
  if (!anim && !reduce && now >= nextAt) {
    if (S.every) { const { m, undo } = pick(); begin(m, undo, S.dur, now); }
    else if (history.length) begin(inv(history[history.length - 1]), true, S.dur, now);
  }
  if (anim) {
    const p = easeIO(Math.min(1, (now - anim.start) / anim.dur));
    pivot.rotation.set(0, 0, 0);
    pivot.rotation[AX[anim.m.a]] = anim.m.d * (Math.PI / 2) * p;
  }

  // Kubchalar joyi: ajralish + tinglash to'lqini + nutqda har biri o'z ritmida
  const sp = 1 + cur.gap;
  for (const c of cubies) {
    const l = c.userData.l;
    let f = sp;
    if (!reduce) {
      f += cur.w.listening * 0.12 * Math.sin(t * 5 - l.length() * 1.8);
      f += cur.w.speaking * L * 0.1 * Math.sin(t * 11 + c.userData.seed);
    }
    c.position.set(l.x * f, l.y * f, l.z * f);
  }

  // Yadro: yashil va ko'k chiroqlar markaz atrofida aylanadi — ichki yuzlar rangi o'zgarib turadi
  const r = 0.35;
  coreG.position.set(Math.cos(t * 0.9) * r, Math.sin(t * 1.3) * r, Math.sin(t * 0.9) * r);
  coreB.position.set(-coreG.position.x, -coreG.position.y, -coreG.position.z);
  coreG.intensity = 150 * cur.core;
  coreB.intensity = 135 * cur.core;
  const pulse = 1 + 0.08 * Math.sin(t * 2.2) + 0.5 * L;
  core.scale.setScalar(0.8 + 0.4 * cur.core + 0.3 * L);
  sun.scale.setScalar((0.75 + 0.45 * cur.core) * pulse);

  // Butun kub: rasmga o'xshash burchakdan (tepadan, burchakka) qaraydi va sekin aylanadi
  if (!reduce) rotY += dt * cur.spin;
  const sway = reduce ? 0 : 0.06 * Math.sin(t * 0.7);
  cube.rotation.set(0.52 + sway, rotY, 0);

  // 1) Okklyuziya: avval faqat "quyosh" (1-qatlam), so'ng kubchalar qora — chuqurlik bo'yicha uni to'sadi
  renderer.setRenderTarget(occRT);
  renderer.setClearColor(0x000000, 1);
  renderer.clear();
  camera.layers.set(1);
  renderer.render(scene, camera);
  camera.layers.set(0);
  scene.overrideMaterial = black;
  const sh = renderer.shadowMap.enabled;
  renderer.shadowMap.enabled = false;
  renderer.autoClear = false;
  core.visible = false;
  renderer.render(scene, camera);
  core.visible = true;
  scene.overrideMaterial = null;
  renderer.shadowMap.enabled = sh;

  // 2) Radial xiralash yadroning ekrandagi joyidan
  cube.localToWorld(lightNdc.set(0, 0, 0)).project(camera);
  const lu = (lightNdc.x + 1) / 2, lv = (lightNdc.y + 1) / 2;
  blurMat.uniforms.uLight.value.set(lu, lv);
  fsQuad.material = blurMat;
  renderer.setRenderTarget(rayRT);
  renderer.clear();
  renderer.render(fsScene, fsCam);

  // 3) Asosiy sahna (shaffof fon) + ustidan rangli dastalar
  renderer.setRenderTarget(null);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(scene, camera);
  compMat.uniforms.uLight.value.set(lu, lv);
  compMat.uniforms.uAspect.value = camera.aspect;
  compMat.uniforms.uTime.value = t;
  compMat.uniforms.uStrength.value = 1.0 * cur.ray;
  fsQuad.material = compMat;
  renderer.render(fsScene, fsCam);
  renderer.autoClear = true;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
