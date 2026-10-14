/*
 * Service worker do Auction Analysis.
 *
 * - Páginas (navegação): rede primeiro, cache como reserva. Assim um deploy novo
 *   aparece na hora quando há internet, e o app ainda abre no galpão sem sinal.
 * - /assets/*: nomes com hash, nunca mudam de conteúdo, então cache primeiro.
 * - /api/*: nunca passa pelo cache.
 * - Fotos de outros domínios: ignoradas pelo worker.
 */
const VERSION = 'v3';
const SHELL = `auctionanalysis-shell-${VERSION}`;
const ASSETS = `auctionanalysis-assets-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(['/', '/manifest.webmanifest'])));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== SHELL && k !== ASSETS).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put('/', copy));
          return res;
        })
        .catch(() => caches.match('/')),
    );
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(ASSETS).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Demais arquivos estáticos (ícones, manifest): rede, com cache como reserva.
  event.respondWith(fetch(req).catch(() => caches.match(req)));
});
