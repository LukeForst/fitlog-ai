const CACHE = "fitlog-ai-v1";
const ASSETS = ["./", "./index.html", "./app.js", "./logic.js", "./styles.css", "./manifest.webmanifest", "./icon.png"];
self.addEventListener("install", event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener("fetch", event => event.respondWith(caches.match(event.request).then(response => response || fetch(event.request))));
