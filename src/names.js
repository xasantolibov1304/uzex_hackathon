// UZEX lot nomlari ruscha (kirill) — oddiy o'zbek xaridori uchun qisqa, tushunarli o'zbekcha (lotin) nom yasaymiz.
// Usul: avval ma'lum iboralar tarjima qilinadi, qolgan kirill harflar lotinga o'giriladi. Asl nom alohida saqlanadi.

// Tartib muhim: uzunroq/aniqroq iboralar oldin
const PHRASES = [
  // umumiy tozalash
  [/\|\|/g, "II"], // UZEX'da "ЦЕМ II" ko'pincha "ЦЕМ ||" bo'lib yozilgan
  [/\s*\(?\s*тип сделки\s*[–—-]?\s*форвард\s*\)?/gi, " (forward bitim)"],
  [/\s*ГОСТ\s*[\d\s.\-–]+/gi, " "],
  [/(?<!\p{L})ЦЕМ(?!\p{L})/giu, "CEM"],
  [/(?<!\p{L})типа(?!\p{L})/giu, ""],
  [/от\s*([\d.,]+)\s*до\s*([\d.,]+)/gi, "$1–$2"],
  // shifer — "цемент" qoidasidan oldin turishi kerak
  [/листы\s+(?:хризотил|асбесто)цементные|шифер асбестовый|шифер/gi, "shifer"],
  // sement
  [/сульфатостойкий/gi, "sulfatga chidamli"],
  [/портландцементный|портландцемент/gi, "portlandsement"],
  [/с пуццоланой|пуццолановый/gi, "puzzolanli"],
  [/композиционный/gi, "kompozitsion"],
  [/тампонажный/gi, "tamponaj"],
  [/с добавками/gi, "qo'shimchali"],
  [/в бумажных мешках/gi, "qog'oz qoplarda"],
  [/в полипропиленовых мешках|в п\/п мешках/gi, "polipropilen qoplarda"],
  [/в мешках/gi, "qoplarda"],
  [/\(навал\)|навалом|навал/gi, "(to'kma)"],
  [/клинкер/gi, "klinker"],
  [/цемент/gi, "sement"],
  // metall
  [/композитная арматура/gi, "kompozit armatura"],
  [/арматура/gi, "armatura"],
  [/мерной длины/gi, "o'lchamli uzunlikda"],
  [/труба стальная прямоугольная/gi, "to'rtburchak po'lat quvur"],
  [/труба стальная/gi, "po'lat quvur"],
  [/катанка/gi, "katanka"],
  [/метров/gi, "m"],
  // yoqilg'i
  [/дизельное топливо/gi, "dizel yoqilg'isi"],
  [/топливо печное бытовое/gi, "maishiy pech yoqilg'isi"],
  [/летнее/gi, "yozgi"],
  [/зимнее/gi, "qishki"],
  [/бензин автомобильный|автобензин/gi, "benzin"],
  [/бензин/gi, "benzin"],
  [/сжиженный газ/gi, "suyultirilgan gaz"],
  [/пропан[- ]бутан технический/gi, "propan-butan (texnik)"],
  [/бурый уголь/gi, "qo'ng'ir ko'mir"],
  [/каменный уголь/gi, "tosh ko'mir"],
  [/уголь/gi, "ko'mir"],
  [/мазут/gi, "mazut"],
  [/битум/gi, "bitum"],
  // oziq-ovqat
  [/мука пшеничная/gi, "bug'doy uni"],
  [/хлебопекарная/gi, "nonbop"],
  [/высшего сорта|высший сорт/gi, "oliy nav"],
  [/(\d)\s*[- ]?\s*(?:го\s*)?сорт[ау]?(?!\p{L})/giu, "$1-nav"],
  [/обога[щш]енная\s+витаминно[- ]минеральной смесью/gi, "vitaminlangan"],
  [/пшеница/gi, "bug'doy"],
  [/сахар[- ]песок|сахар/gi, "shakar"],
  [/масло хлопковое|хлопковое масло/gi, "paxta yog'i"],
  [/масло подсолнечное|подсолнечное масло/gi, "kungaboqar yog'i"],
  [/комбикорм/gi, "omuxta em"],
  [/полноценный/gi, "to'liq qiymatli"],
  [/для бройлеров/gi, "broylerlar uchun"],
  [/для\s+к\.?\s*р\.?\s*с\.?/gi, "qoramol uchun"],
  [/отруб[иь]?/gi, "kepak"],
  [/шрот/gi, "shrot"],
  [/шелуха/gi, "shelxa"],
  // qurilish va boshqalar
  [/(\d+)-волновые/gi, "$1 to'lqinli"],
  [/кирпич/gi, "g'isht"],
  [/стекло/gi, "oyna"],
  [/масло моторное|моторное масло/gi, "motor moyi"],
  [/масло дизельное/gi, "dizel moyi"],
  [/масло трансмиссионное/gi, "transmissiya moyi"],
  [/масло гидравлическое/gi, "gidravlik moy"],
  [/масло индустриальное/gi, "sanoat moyi"],
  [/масло/gi, "moy"],
  [/ректификованный этиловый спирт|этиловый спирт ректификованный/gi, "rektifikatsiyalangan etil spirti"],
  [/этиловый спирт/gi, "etil spirti"],
  [/полиэтилен/gi, "polietilen"],
  [/полипропилен/gi, "polipropilen"],
  [/марки|марка/gi, "marka"],
];

// Tashkilot shakllari
// \b kirill harflarni tanimaydi — o'rniga Unicode harf chegarasi
const W = (src) => new RegExp(`(?<!\\p{L})(?:${src})(?!\\p{L})`, "gu");
const ORG = [
  [W("СП\\s*ООО|СП\\s*OOO"), "QK MChJ"], [W("ООО|OOO"), "MChJ"], [W("ОАО"), "OAJ"], [W("АО|AO|АO"), "AJ"],
  [W("ЧП"), "XK"], [W("ИП"), "YaTT"], [W("МЧЖ|MCHJ|MChJ"), "MChJ"],
];

const CYR = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "j", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n",
  о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "x", ц: "ts", ч: "ch", ш: "sh", щ: "sh", ъ: "'", ы: "i", ь: "",
  э: "e", ю: "yu", я: "ya", ў: "o'", қ: "q", ғ: "g'", ҳ: "h",
};
export function translit(s) {
  return String(s || "").replace(/[Ѐ-ӿ]/g, (ch) => {
    const lower = ch.toLowerCase();
    const out = CYR[lower] ?? ch;
    return ch === lower ? out : out.charAt(0).toUpperCase() + out.slice(1);
  });
}

const tidy = (s) =>
  s.replace(/\s+([,.)])/g, "$1").replace(/\(\s+/g, "(").replace(/\s{2,}/g, " ").replace(/^[\s,.;–-]+|[\s,;–-]+$/g, "").trim();

/** Ruscha mahsulot nomi → qisqa o'zbekcha nom. */
export function uzProduct(name) {
  let s = String(name || "");
  if (!s) return "";
  for (const [re, to] of PHRASES) s = s.replace(re, to);
  for (const [re, to] of ORG) s = s.replace(re, to);
  s = tidy(translit(s));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Sotuvchi/korxona nomi: tashkilot shakli o'zbekcha, harflar lotinda. */
export function uzOrg(name) {
  let s = String(name || "");
  for (const [re, to] of ORG) s = s.replace(re, to);
  return tidy(translit(s).replace(/[«»“”]/g, '"'));
}

/** Manzil: qisqartmalar o'zbekcha, harflar lotinda. */
export function uzPlace(name) {
  let s = String(name || "")
    .replace(/(?<!\p{L})г\.\s*/gu, "")
    .replace(/бухарская/gi, "Buxoro").replace(/самаркандская/gi, "Samarqand").replace(/ферганская/gi, "Farg'ona")
    .replace(/андижанская/gi, "Andijon").replace(/наманганская/gi, "Namangan").replace(/навоийская/gi, "Navoiy")
    .replace(/кашкадарьинская/gi, "Qashqadaryo").replace(/сурхандарьинская/gi, "Surxondaryo").replace(/джизакская/gi, "Jizzax")
    .replace(/сырдарьинская/gi, "Sirdaryo").replace(/хорезмская/gi, "Xorazm")
    .replace(/(\p{L}+?)(?:ский|ской)\s+(?:р-н|район)/giu, "$1 tumani")
    .replace(/област[ьи]|обл\.?|обль/gi, "viloyati")
    .replace(/\bр-н\.?|район(?:а)?/gi, "tumani")
    .replace(/(?<!\p{L})ул\.?\s*/giu, "ko'chasi ")
    .replace(/промзона/gi, "sanoat zonasi")
    .replace(/ташкентская/gi, "Toshkent")
    .replace(/ташкент/gi, "Toshkent");
  return tidy(translit(s));
}
