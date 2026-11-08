// Oson Birja service worker — faqat push-bildirishnomalar uchun (keshlash yo'q).
// Sayt tabi yopiq bo'lsa ham (brauzer ishlab turgan bo'lsa) narx haqidagi xabarni ko'rsatadi.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data?.text() }; }
  e.waitUntil(
    self.registration.showNotification(d.title || "Oson Birja", {
      body: d.body || "",
      icon: "/logo.svg",
      badge: "/logo.svg",
      tag: d.tag || undefined,
      data: { url: d.url || "/" },
    }),
  );
});

// Bildirishnoma bosilganda: ochiq tab bo'lsa — o'shanga o'tamiz, bo'lmasa yangisini ochamiz
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "/", self.location.origin).href;
  e.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const tab = tabs.find((c) => new URL(c.url).origin === self.location.origin);
    if (tab) {
      await tab.focus();
      return tab.navigate ? tab.navigate(url) : null;
    }
    return self.clients.openWindow(url);
  })());
});
