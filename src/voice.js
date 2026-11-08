// Agent ovozi. Ikki manba:
//  1) ElevenLabs (ELEVENLABS_API_KEY bo'lsa) — eng tabiiy ovoz, o'zbek va rus tillarini qo'llaydi (eleven_v4).
//  2) Microsoft Edge "Read aloud" neyron ovozlari (msedge-tts) — bepul, kalitsiz. ElevenLabs ishlamasa
//     (kalit yo'q, kredit tugagan, tarmoq xatosi) avtomatik shunga o'tiladi — taqdimotda ovoz hech qachon o'chmaydi.
//
// .env sozlamalari (barchasi ixtiyoriy):
//   ELEVENLABS_API_KEY=...            ELEVENLABS_MODEL=eleven_v4 (yoki eleven_v4_turbo — tezroq, arzonroq)
//   ELEVENLABS_VOICE_UZ=rwtcHtZgYU6HN2zLNBlf (standart)   ELEVENLABS_VOICE_RU=HcaxAsrhw4ByUo4CBCBN (standart)   ELEVENLABS_VOICE_EN, yoki hammasi uchun ELEVENLABS_VOICE_ID (standart: George)
//   TTS_VOICE_UZ=uz-UZ-SardorNeural   TTS_VOICE_RU=ru-RU-SvetlanaNeural   TTS_VOICE_EN=en-US-AvaNeural
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

const MOODS = ["calm", "happy", "excited", "concerned"];
const cache = new Map(); // matn → mp3 (oxirgi 30 ta)
const remember = (key, mp3) => {
  cache.set(key, mp3);
  if (cache.size > 30) cache.delete(cache.keys().next().value);
  return mp3;
};

// ---------- 1) ElevenLabs ----------
const EL_DEFAULT_VOICE = "JBFqnCBsd6RMkjVDRZzb"; // George
const EL = {
  // ELEVENLABS_ENABLED=0 — kalitni o'chirmasdan ElevenLabs'ni vaqtincha o'chirish (test uchun): Edge ovozi ishlatiladi
  key: () => (/^(0|false|off|no)$/i.test(process.env.ELEVENLABS_ENABLED || "") ? "" : process.env.ELEVENLABS_API_KEY?.trim()),
  model: () => process.env.ELEVENLABS_MODEL || "eleven_v4",
  // Har bir til uchun alohida ovoz: ELEVENLABS_VOICE_UZ / _RU / _EN, bo'lmasa ELEVENLABS_VOICE_ID, bo'lmasa standart
  voice: (lang) =>
    process.env[`ELEVENLABS_VOICE_${lang.toUpperCase()}`] ||
    ({ uz: "rwtcHtZgYU6HN2zLNBlf", ru: "HcaxAsrhw4ByUo4CBCBN" }[lang] || "") ||
    process.env.ELEVENLABS_VOICE_ID ||
    EL_DEFAULT_VOICE,
};
// Kayfiyat → ifodalilik: past stability = jonliroq, style = hissiyot kuchi, speed = tezlik
const EL_SETTINGS = {
  calm: { stability: 0.5, similarity_boost: 0.8, style: 0.2, speed: 1.0 },
  happy: { stability: 0.4, similarity_boost: 0.8, style: 0.45, speed: 1.05 },
  excited: { stability: 0.32, similarity_boost: 0.8, style: 0.6, speed: 1.08 },
  concerned: { stability: 0.6, similarity_boost: 0.8, style: 0.15, speed: 0.95 },
};
// Kredit tugasa yoki kalit noto'g'ri bo'lsa — har safar urinib vaqt yo'qotmaslik uchun biroz to'xtatamiz
let elPausedUntil = 0;

async function elevenLabs(say, lang, mood) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${EL.voice(lang)}?output_format=mp3_44100_64`, {
    method: "POST",
    headers: { "xi-api-key": EL.key(), "content-type": "application/json", accept: "audio/mpeg" },
    body: JSON.stringify({ text: say, model_id: EL.model(), language_code: lang, voice_settings: EL_SETTINGS[mood] }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // 401 = kalit noto'g'ri/ruxsat yo'q, 402/429 + quota = kredit tugagan → 10 daqiqa Edge ovozida ishlaymiz
    if (res.status === 401 || res.status === 402 || /quota|credits|invalid_api_key|authentication_error|missing_permissions/i.test(body)) {
      elPausedUntil = Date.now() + 10 * 60_000;
    }
    throw new Error(`ElevenLabs ${res.status}: ${body.slice(0, 160)}`);
  }
  const mp3 = Buffer.from(await res.arrayBuffer());
  if (!mp3.length) throw new Error("ElevenLabs: empty audio");
  return mp3;
}

// ---------- 2) Edge neyron ovozlari (bepul zaxira) ----------
const EDGE_VOICES = {
  uz: process.env.TTS_VOICE_UZ || "uz-UZ-SardorNeural",
  ru: process.env.TTS_VOICE_RU || "ru-RU-SvetlanaNeural",
  en: process.env.TTS_VOICE_EN || "en-US-AvaNeural",
};
const EDGE_PROSODY = {
  calm: { rate: "+3%", pitch: "+0Hz" },
  happy: { rate: "+7%", pitch: "+5Hz" },
  excited: { rate: "+11%", pitch: "+9Hz" },
  concerned: { rate: "-4%", pitch: "-4Hz" },
};
const xml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function edge(say, lang, mood) {
  const tts = new MsEdgeTTS();
  try {
    await tts.setMetadata(EDGE_VOICES[lang] || EDGE_VOICES.uz, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(xml(say), EDGE_PROSODY[mood]);
    const chunks = [];
    await Promise.race([
      (async () => { for await (const c of audioStream) chunks.push(c); })(),
      new Promise((_, rej) => setTimeout(() => rej(new Error("Edge TTS timeout")), 15_000)),
    ]);
    const mp3 = Buffer.concat(chunks);
    if (!mp3.length) throw new Error("Edge TTS: empty audio");
    return mp3;
  } finally {
    tts.close();
  }
}

/** Qisqa gapni ovozga aylantiradi. Natija: { audio: MP3 Buffer, provider: "elevenlabs" | "edge" }. */
export async function speak({ text, lang = "uz", mood = "calm" }) {
  const say = String(text || "").replace(/\s+/g, " ").trim().slice(0, 400);
  if (!say) throw new Error("EMPTY");
  // Ovoz tili matnning o'zidan aniqlanadi: kirill harflari ko'p bo'lsa — rus ovozi (o'zbekcha javoblar lotinda).
  // Masalan, ilova UZ rejimida bo'lsa-yu, foydalanuvchi ruscha yozib, agent ruscha javob bersa ham to'g'ri ovoz chiqadi.
  const cyr = (say.match(/[а-яё]/gi) || []).length;
  const lat = (say.match(/[a-z]/gi) || []).length;
  const l = cyr > lat ? "ru" : ["uz", "ru", "en"].includes(lang) ? lang : "uz";
  const m = MOODS.includes(mood) ? mood : "calm";

  if (EL.key() && Date.now() >= elPausedUntil) {
    const key = `el|${EL.model()}|${EL.voice(l)}|${l}|${m}|${say}`;
    if (cache.has(key)) return { audio: cache.get(key), provider: "elevenlabs" };
    try {
      return { audio: remember(key, await elevenLabs(say, l, m)), provider: "elevenlabs" };
    } catch (err) {
      console.warn("[tts] ElevenLabs ishlamadi, bepul ovozga o'tildi:", err.message);
    }
  }
  const key = `edge|${EDGE_VOICES[l]}|${m}|${say}`;
  if (cache.has(key)) return { audio: cache.get(key), provider: "edge" };
  return { audio: remember(key, await edge(say, l, m)), provider: "edge" };
}
