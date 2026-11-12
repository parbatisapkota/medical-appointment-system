/**
 * MedicalCare service worker
 * --------------------------
 * Phones require a service worker before they'll let people install the
 * site as an app ("Add to Home Screen" / "Install app").
 *
 * What it does:
 *   - Pages, styles, scripts and icons: always try the network first, so
 *     people get the newest version right after a push. If the phone is
 *     offline, fall back to the last saved copy, or to offline.html.
 *   - Patient data (/api/...): NEVER saved on the phone. It always comes
 *     straight from the server, so private information isn't left in the
 *     phone's storage and nobody sees out-of-date appointments.
 *
 * If you change the list of files below, bump CACHE_VERSION so phones
 * throw away the old saved copies.
 */

const CACHE_VERSION = "medicalcare-v1";

const PRECACHE_FILES = [
    "/offline.html",
    "/style.css",
    "/script.js",
    "/manifest.json",
    "/icons/icon-192.png",
    "/icons/icon-512.png",
    "/icons/apple-touch-icon.png",
    "/icons/favicon-32.png",
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_VERSION)
            .then((cache) => cache.addAll(PRECACHE_FILES))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", (event) => {
    // Delete saved copies from older versions of this file.
    event.waitUntil(
        caches.keys()
            .then((names) => Promise.all(
                names
                    .filter((name) => name !== CACHE_VERSION)
                    .map((name) => caches.delete(name))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", (event) => {
    const request = event.request;
    const url = new URL(request.url);

    // Only handle simple page/file loads from our own site.
    if (request.method !== "GET" || url.origin !== self.location.origin) {
        return;
    }

    // Patient data: let the browser talk to the server directly, no saving.
    if (url.pathname.startsWith("/api/")) {
        return;
    }

    event.respondWith(networkFirst(request));
});

async function networkFirst(request) {
    const cache = await caches.open(CACHE_VERSION);

    try {
        const response = await fetch(request);

        if (response.ok) {
            cache.put(request, response.clone());
        }

        return response;
    } catch (error) {
        // Offline: use the last saved copy if there is one.
        const saved = await cache.match(request, { ignoreSearch: true });

        if (saved) {
            return saved;
        }

        // A page we don't have saved: show the friendly offline page.
        if (request.mode === "navigate") {
            return cache.match("/offline.html");
        }

        return Response.error();
    }
}
