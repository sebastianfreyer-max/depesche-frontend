// Datenradar Service Worker – Mitteilungen, App-Badge und Offline-Start.
const CACHE = "datenradar-shell-v1";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./icon-180-v3.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Nur die App selbst (gleicher Ursprung) zwischenspeichern: online immer frisch, offline aus dem Speicher
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}); }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || (req.mode === "navigate" ? caches.match("./index.html") : undefined)))
  );
});

// Mitteilung anzeigen. Das Backend sendet das Format „Declarative Web Push" – neuere iPhones zeigen es
// direkt an, alle anderen Geräte landen hier.
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { notification: { title: "Datenradar", body: event.data ? event.data.text() : "" } }; }
  const n = data.notification || {};
  const title = n.title || "Datenradar";
  const options = {
    body: n.body || "",
    tag: n.tag,
    lang: n.lang || "de-DE",
    icon: "icon-192.png",
    badge: "icon-192.png",
    data: { url: n.navigate || "./" },
  };
  const tasks = [self.registration.showNotification(title, options)];
  if (typeof data.app_badge === "number" && self.navigator.setAppBadge) {
    tasks.push(self.navigator.setAppBadge(data.app_badge).catch(() => {}));
  }
  event.waitUntil(Promise.all(tasks));
});

// Tippen auf die Mitteilung: offene App nach vorn holen und das Ziel öffnen, sonst neu starten
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "./", self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (new URL(client.url).origin === new URL(target).origin) {
          client.postMessage({ type: "open", url: target });
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
