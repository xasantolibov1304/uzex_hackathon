# Oson Birja — UZEX uchun avtonom AI agent (hackathon MVP)

Birjani umuman bilmaydigan odam faqat **vazifa beradi** (matn yoki ovoz bilan): *"Toshkentda uy qurish uchun 20 tonna sement kerak"*.

Qolgan barcha ishni agent o'zi qiladi:
1. Birja narxlarini tekshiradi.
2. UZEX'dagi real takliflarni qidiradi.
3. Eng ma'qul lotni tanlaydi va shartlarini o'qiydi.
4. Kerakli lot sonini hisoblaydi.
5. Xaridor ma'lumotlarini tekshiradi; yetishmasa, faqat bir marta so'raydi.
6. Buyurtma va xarid arizasini tayyorlaydi.

Foydalanuvchi bajaradigan yagona qadam — **"Tasdiqlash"** tugmasini bosish (pul bilan bog'liq qaror). Shundan keyin agent buyurtmani birjaga yuboradi (DEMO) va yakuniy xulosa beradi.

## Imkoniyatlar

- **Agent ekrani.** Markazda jonli avatar (WebGL shisha shar), pastda vazifa maydoni va mikrofon. Agentning har bir qadami ekranda jonli ko'rinadi (SSE oqimi): ✓ belgisi, natija, topilgan lotlar.
- **Avatar.** Kutish holatida kichik va sekin harakatlanadi. Agent ishlayotganda kattalashib, tezlashadi. Gapirganda nutq ritmiga mos "uradi". Mikrofonga gapirilganda foydalanuvchi ovoziga reaksiya qiladi. Kayfiyatga qarab rangi o'zgaradi (xotirjam, xursand, ogohlantiruvchi).
- **Ovoz.**
  - Kiritish: brauzerda yozib olinadi → Gemini matnga aylantiradi → vazifa avtomatik yuboriladi.
  - Javob: brauzer ovoz sintezi orqali o'qiladi (qurilmada shu til uchun ovoz bo'lsa).
- **Tillar:** UZ / RU / EN. Agent tanlangan tilda javob beradi.
- **Narxlar, Sotuvda, Buyurtmalar** sahifalari. Ularda istalgan narx yoki lotni "✦ Agentga topshirish" tugmasi bilan agentga berish mumkin.
- **Xarid arizasi** avtomatik to'ldiriladi. Undan nusxa olish yoki chop etish mumkin.

## Ma'lumot manbalari (hammasi real, mock yo'q)

| Ma'lumot | Manba |
|---|---|
| Asosiy kotirovkalar, 10 kunlik dinamika | `uzex.uz/Quote/GetQuotes`, `/Quote/GetQuotesDayly` (JSON) |
| Haftalik kotirovkalar (~1000 tovar) | `uzex.uz/WeeklyQuotes` |
| Lotlar (kotirovkalash varag'i) va tafsilotlar | `uzex.uz/Trade/ContractsSumNew`, `/trade/offer/{id}` |
| Bugun savdoga qo'yilganlar | `uzex.uz/Trade/OffersSumNew` |
| USD kursi | `cbu.uz` |

UZEX'ning ommaviy API'si yo'q, shuning uchun HTML sahifalar serverda parse qilinadi va keshlanadi.

**DEMO qismi:** buyurtmani UZEX'ga yuborish. Buning uchun ochiq order API yo'q. Integratsiya nuqtasi `src/store.js` dagi `confirmOrder()` funksiyasi.

## Ishga tushirish

```bash
npm install
cp .env.example .env      # GEMINI_API_KEY (https://aistudio.google.com/apikey)
npm run dev               # http://localhost:3000 (kod o'zgarsa avtomatik qayta yuklanadi)
```

Ovoz bilan kiritish mikrofon ruxsatini talab qiladi. Brauzer buni faqat `localhost` yoki HTTPS'da beradi (Cloudflare tunnel ham HTTPS).

## Tuzilma

| Fayl | Vazifasi |
|---|---|
| `server.js` | REST API va agent uchun SSE oqimi (`/api/agent/stream`), ovozni matnga aylantirish (`/api/transcribe`) |
| `src/agent.js` | Avtonom Gemini agent. Tool'lar: `get_overview`, `search_prices`, `get_price_trend`, `search_lots`, `get_lot`, `get_profile`, `save_profile`, `create_order`, `get_orders` |
| `src/uzex.js` | UZEX va CBU ma'lumotlari: parse, kesh, toifalar, o'zbekcha→ruscha qidiruv |
| `src/store.js` | Profil, buyurtmalar, DEMO yuborish, xarid arizasi (`data/db.json`) |
| `public/avatar.js` | WebGL avatar (shader) |
| `public/app.js`, `index.html`, `style.css` | Dark theme interfeys (vanilla JS) |

## Cheklovlar

- Birjaga yuborish DEMO rejimida ishlaydi. Yakuniy narx real savdoda aniqlanadi.
- Brauzerlarda o'zbek tilidagi ovoz kam uchraydi. Ovoz bo'lmasa, javob matn bo'lib chiqadi va avatar matn ritmiga mos harakatlanadi.
- Bitta umumiy foydalanuvchi bor (avtorizatsiya yo'q).
