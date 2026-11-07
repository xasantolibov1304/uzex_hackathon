// Avatar joylashuvi: logo ⇄ markaz.
// Kutishda avatar header'dagi logo o'rnida turadi. Foydalanuvchi harakat qilsa (yozish, mikrofon,
// vazifa) yoki agent ishlayotgan/gapirayotgan bo'lsa — markazga uchib keladi; hammasi tugagach qaytadi.
// React tashqarisida ishlaydi (har kadrda transform) — komponentlarni qayta render qilmaydi.

const BASE = 300; // canvas CSS o'lchami (transform: scale bilan kichraytiriladi)
const ORB = 0.66; // shar diametri canvas'ning ~66% i (qolgani — nur)
const ACTIVE = new Set(["thinking", "working", "speaking", "listening"]);

/**
 * @param {{ canvas: HTMLCanvasElement, stageSlot: () => HTMLElement|null, logoSlot: () => HTMLElement|null,
 *           env: () => { tab: string, busy: boolean, recording: boolean, focused: boolean, inputValue: string } }} o
 */
export function createDock({ canvas, stageSlot, logoSlot, env }) {
  let mode = "logo";
  let backTimer = null;
  let flyTimer = null;
  let lastT = "";
  let raf = 0;

  const wantCenter = () => {
    const e = env();
    return ACTIVE.has(stageSlot()?.dataset.state) || e.busy || e.recording ||
      (e.focused && e.tab === "agent") || (e.inputValue.trim() !== "" && e.tab === "agent");
  };

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
    const slot = stageSlot();
    const logo = logoSlot();
    if (slot && logo) {
      const useCenter = mode === "center" && env().tab === "agent" && slot.offsetWidth > 0;
      const r = (useCenter ? slot : logo).getBoundingClientRect();
      const size = useCenter ? r.width : r.width / ORB; // logo joyida shar logo o'lchamida ko'rinadi
      const s = size / BASE;
      const x = r.left + r.width / 2 - size / 2;
      const y = r.top + r.height / 2 - size / 2;
      const tf = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${s.toFixed(4)})`;
      if (tf !== lastT) { canvas.style.transform = tf; lastT = tf; }
    }
    raf = requestAnimationFrame(place);
  }
  raf = requestAnimationFrame(place);

  function destroy() {
    cancelAnimationFrame(raf);
    clearTimeout(backTimer);
    clearTimeout(flyTimer);
    document.body.classList.remove("av-center");
  }
  return { update, destroy };
}
