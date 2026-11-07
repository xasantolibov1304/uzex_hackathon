import { useRef, useState } from "react";
import { api } from "../lib/api.js";

// Agent so'ragan forma (har bir maydon — alohida input)

const initialValue = (f) =>
  f.type === "select"
    ? ((f.options || []).some((o) => o.value === f.value) ? f.value : "")
    : String(f.value || "");

export default function FormCard({ form, isBusy, toast, onProfileSaved, sendTask }) {
  const [values, setValues] = useState(() => form.fields.map(initialValue));
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [msg, setMsg] = useState("");
  const inputs = useRef([]);

  const valueOf = (key) => {
    const i = form.fields.findIndex((f) => f.key === key);
    return i >= 0 ? values[i] : undefined;
  };
  // showIf: maydon boshqa maydon qiymatiga qarab ko'rinadi va majburiy bo'ladi
  const visible = (f) => !f.showIf || Object.entries(f.showIf).every(([k, vals]) => vals.includes(valueOf(k)));
  const required = (f) => (f.showIf ? visible(f) : Boolean(f.required));

  async function onSubmit(ev) {
    ev.preventDefault();
    if (isBusy()) return toast("Agent hali ishlayapti, biroz kuting");
    // Maydonlarni tekshirish
    const errs = {};
    let firstBad = -1;
    form.fields.forEach((f, i) => {
      const hidden = !visible(f);
      const v = values[i];
      let m = "";
      if (!hidden && required(f) && !v.trim()) m = "To'ldirilishi shart";
      else if (f.key === "phone" && v && v.replace(/\D/g, "").length < 9) m = "Telefon raqami noto'g'ri";
      else if (f.key === "tin" && !hidden && v && v.replace(/\D/g, "").length !== 9) m = "STIR 9 ta raqam";
      if (m) { errs[i] = m; if (firstBad < 0) firstBad = i; }
    });
    setErrors(errs);
    if (firstBad >= 0) { inputs.current[firstBad]?.focus(); return; }

    const out = {};
    form.fields.forEach((f, i) => { if (visible(f) && values[i].trim()) out[f.key] = values[i].trim(); });
    setSubmitting(true);
    try {
      if (form.purpose === "profile") {
        await api("/api/profile", { method: "PUT", body: out });
        onProfileSaved();
      }
      // Forma qulflanadi va qisqa xulosa ko'rsatiladi
      setDone(true);
      const labels = Object.fromEntries(form.fields.map((f) => [f.key, f]));
      const summary = Object.entries(out).map(([k, v]) => {
        const f = labels[k];
        const shown = f?.options?.find((o) => o.value === v)?.label || v;
        return `${f?.label || k}: ${shown}`;
      }).join("; ");
      sendTask(form.purpose === "profile"
        ? `[FORM ${form.id} profile] Foydalanuvchi formani to'ldirdi, profil saqlandi (${summary}). Vazifani davom ettir.`
        : `[FORM ${form.id}] ${JSON.stringify(out)}`, { hidden: true });
    } catch (e) {
      setSubmitting(false);
      setMsg(e.message);
    }
  }

  const setValue = (i, v) => setValues((arr) => arr.map((x, j) => (j === i ? v : x)));

  return (
    <form className={"form-card" + (done ? " done" : "")} noValidate onSubmit={onSubmit}>
      <div className="fc-head">
        <span className="fc-icon">📋</span>
        <div>
          <div className="fc-title">{form.title}</div>
          <div className="hint">{form.purpose === "profile" ? "Agent arizani shu ma'lumotlar bilan to'ldiradi" : "Agent davom etishi uchun to'ldiring"}</div>
        </div>
      </div>
      <div className="fc-table">
        {form.fields.map((f, i) => {
          const id = `${form.id}_${f.key}`;
          const err = errors[i];
          const common = {
            id, name: f.key, value: values[i], disabled: done, required: required(f),
            ref: (el) => (inputs.current[i] = el),
            onChange: (e) => setValue(i, e.target.value),
          };
          return (
            <div className={"fc-row" + (err ? " invalid" : "")} data-key={f.key} hidden={!visible(f)} key={`${f.key}_${i}`}>
              <label htmlFor={id}>{f.label}{required(f) && <> <span className="req">*</span></>}</label>
              <div className="fc-input">
                {f.type === "select" ? (
                  <select {...common}>
                    <option value="">Tanlang…</option>
                    {(f.options || []).map((o, k) => <option key={k} value={o.value}>{o.label}</option>)}
                  </select>
                ) : (
                  <input
                    {...common}
                    type={f.type === "number" ? "number" : f.type === "tel" ? "tel" : "text"}
                    placeholder={f.placeholder || ""}
                    inputMode={f.type === "tel" ? "tel" : undefined}
                    autoComplete={f.type === "tel" ? "tel" : f.key === "fullName" ? "name" : undefined}
                  />
                )}
                <div className="fc-err" hidden={!err}>{err || ""}</div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="fc-foot">
        {done ? (
          <div className="hint up">✓ Yuborildi</div>
        ) : (
          <>
            <div className="fc-msg hint">{msg && <span className="down">{msg}</span>}</div>
            <button className="btn" type="submit" disabled={submitting}>Yuborish</button>
          </>
        )}
      </div>
    </form>
  );
}
