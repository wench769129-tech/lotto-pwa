// 離線快取：一律先抓網路（拿到最新版），網路失敗才用快取，所以改版不用清快取。
// 新版 sw.js 安裝後立刻接手（skipWaiting + clients.claim），app.js 偵測到換手會自動重新整理一次。
const CACHE = 'lotto-v5';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'picker.js', 'stats.js', 'checker.js', 'draw-tab.js', 'manifest.json', 'icons/icon.svg', 'icons/icon-192.png', 'icons/apple-touch-icon.png', '../split-risk/split-risk.js'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  // cache: 'reload' 略過瀏覽器 HTTP 快取，確保存進去的是伺服器上的新版
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))));
});

self.addEventListener('activate', (e) =>
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim())));

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then((res) => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
    }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
