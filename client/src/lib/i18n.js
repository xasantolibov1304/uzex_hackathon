// Matnlar (agent ekrani)
export const T = {
  uz: {
    intro: "Menga vazifa bering — qolganini o'zim bajaraman.",
    placeholder: "Masalan: Toshkentda 20 tonna sement kerak",
    examples: ["Toshkentda uy uchun 20 tonna sement kerak", "Samarqandda nonvoyxonaga 5 tonna un top", "Eng arzon dizel yoqilg'isini topib buyurtma qil", "Birja o'zi nima? Oddiy tushuntir"],
    working: "Agent ishlayapti", done: (n) => `${n} ta qadam bajarildi`, failed: "Xatolik",
    confirm: "Tasdiqlash", cancel: "Bekor qilish", app: "Arizani ko'rish", awaiting: "Tasdiqlash kutilmoqda", submitted: "Birjaga yuborildi (DEMO)", cancelled: "Bekor qilingan",
    order: "Buyurtma", listening: "Tinglayapman… gapirib bo'lgach yana bosing", transcribing: "Ovozingizni matnga aylantiryapman…",
  },
  ru: {
    intro: "Дайте мне задачу — остальное я сделаю сам.",
    placeholder: "Например: нужно 20 тонн цемента в Ташкенте",
    examples: ["Нужно 20 тонн цемента в Ташкенте для дома", "Найди 5 тонн муки в Самарканде", "Найди самое дешёвое дизтопливо и оформи заказ", "Что такое биржа? Объясни просто"],
    working: "Агент работает", done: (n) => `Выполнено шагов: ${n}`, failed: "Ошибка",
    confirm: "Подтвердить", cancel: "Отменить", app: "Заявка", awaiting: "Ждёт подтверждения", submitted: "Отправлено на биржу (DEMO)", cancelled: "Отменён",
    order: "Заказ", listening: "Слушаю… нажмите ещё раз, когда закончите", transcribing: "Распознаю голос…",
  },
  en: {
    intro: "Give me a task — I'll handle the rest.",
    placeholder: "e.g. I need 20 tonnes of cement in Tashkent",
    examples: ["I need 20 tonnes of cement in Tashkent", "Find 5 tonnes of flour in Samarkand", "Find the cheapest diesel and place an order", "What is a commodity exchange? Explain simply"],
    working: "Agent is working", done: (n) => `${n} steps done`, failed: "Error",
    confirm: "Confirm", cancel: "Cancel", app: "Application", awaiting: "Awaiting confirmation", submitted: "Sent to exchange (DEMO)", cancelled: "Cancelled",
    order: "Order", listening: "Listening… tap again when done", transcribing: "Transcribing…",
  },
};
export const tr = (lang) => T[lang] || T.uz;
