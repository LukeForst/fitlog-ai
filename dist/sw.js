const CACHE = "fitlog-ai-v2";
const ASSETS = ["./", "./index.html", "./app.js", "./logic.js", "./styles.css?v=2", "./manifest.webmanifest", "./icon.png"];
self.addEventListener("install", event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", event => event.respondWith(caches.match(event.request).then(response => response || fetch(event.request))));
