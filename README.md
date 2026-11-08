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
- **Narx kuzatuvi (Kuzatuv bo'limi).** Benzin (AI-80/92/95) narxiga obuna: yangi lotning 1 tonna narxi siz kutgan narxga teng yoki arzon bo'lsa, brauzerga push-xabar keladi. Agentga ham aytish mumkin: *"AI-92 tonnasi 13 mln dan tushsa xabar ber"*.
  - Server har 10 daqiqada (`ALERT_POLL_MIN`) UZEX lotlarini tekshiradi. Bir xil tur va hudud bo'yicha obunalar uchun UZEX'ga bitta so'rov ketadi.
  - Faqat obunadan **keyin paydo bo'lgan** lotlar haqida xabar beriladi, chunki UZEX ro'yxatida eskirgan narxli eski lotlar ham bor. Bozor kotirovkasidan ikki baravar arzon lot noto'g'ri ma'lumot deb hisoblanadi va o'tkazib yuboriladi.
  - Har bir lot bo'yicha xabar bir marta keladi. Xabar bosilganda o'sha lot oynasi ochiladi.

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
npm run dev               # http://localhost:3000 (server qayta yuklanadi, frontend — Vite HMR)
```

Production: `npm start` — avval frontendni yig'adi (`vite build` → `dist/`), keyin serverni ishga tushiradi. Faqat yig'ish: `npm run build`.

Ovoz bilan kiritish mikrofon ruxsatini talab qiladi. Brauzer buni faqat `localhost` yoki HTTPS'da beradi (Cloudflare tunnel ham HTTPS).

## Tuzilma

| Fayl | Vazifasi |
|---|---|
| `server.js` | REST API va agent uchun SSE oqimi (`/api/agent/stream`), ovozni matnga aylantirish (`/api/transcribe`) |
| `src/agent.js` | Avtonom Gemini agent. Tool'lar: `get_overview`, `search_prices`, `get_price_trend`, `search_lots`, `get_lot`, `get_profile`, `save_profile`, `create_order`, `get_orders` |
| `src/uzex.js` | UZEX va CBU ma'lumotlari: parse, kesh, toifalar, o'zbekcha→ruscha qidiruv |
| `src/alerts.js` | Narx kuzatuvi: obunalar (`data/alerts.json`), push kalitlari (`data/vapid.json`), fon tekshiruvi, web-push |
| `src/store.js` | Profil, buyurtmalar, DEMO yuborish, xarid arizasi (`data/db.json`) |
| `client/` | Frontend (React + Vite). Dev rejimida `server.js` Vite'ni middleware sifatida ishlatadi (bitta port) |
| `client/src/App.jsx` | Asosiy holat, agent oqimi (SSE), navigatsiya |
| `client/src/components/` | Agent ekrani, forma, buyurtma kartasi, Narxlar / Sotuvda / Buyurtmalar sahifalari, modallar |
| `client/src/hooks/` | Ovoz yozish (`useRecorder`), narx/lot qidiruvi (`useSearch`) |
| `client/src/lib/avatar.js` | WebGL avatar (shader) |
| `client/src/lib/speech.js`, `dock.js` | Agent nutqi va avatar ritmi; avatarning logo ⇄ markaz harakati |
| `client/src/styles.css` | Dark theme uslublari |
| `client/avatar-lab.html`, `client/src/lab/` | Avatar Lab (`/avatar-lab.html`) |

## Cheklovlar

- Birjaga yuborish DEMO rejimida ishlaydi. Yakuniy narx real savdoda aniqlanadi.
- Brauzerlarda o'zbek tilidagi ovoz kam uchraydi. Ovoz bo'lmasa, javob matn bo'lib chiqadi va avatar matn ritmiga mos harakatlanadi.
- Bitta umumiy foydalanuvchi bor (avtorizatsiya yo'q). Narx obunalari brauzerga bog'lanadi (`localStorage` dagi qurilma ID).
- Push-xabar brauzer ochiq bo'lganda keladi (sayt tabi yopiq bo'lsa ham). iPhone'da faqat sayt bosh ekranga qo'shilganda ishlaydi. Push `localhost` yoki HTTPS'da ishlaydi.
