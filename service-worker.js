// 货物进出记录 — Service Worker
// 缓存策略：本地资源优先走 cache-first + 后台更新；数据本身保存在 localStorage，
// 不经过 Service Worker，因此离线状态下依然可以查看、新增、删除记录。

const CACHE_NAME = 'stock-inout-cache-v1';

// 需要预缓存的同源资源（请确保这些文件与 service-worker.js 在同一目录下）
const LOCAL_ASSETS = [
  './inout-record.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// 跨域资源（如 CDN 上的 xlsx 解析库），尽力缓存，失败不影响整体安装
const CDN_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      try {
        await cache.addAll(LOCAL_ASSETS);
      } catch (err) {
        console.log('[SW] 部分本地资源缓存失败：', err);
      }

      await Promise.all(
        CDN_ASSETS.map(async (url) => {
          try {
            const res = await fetch(url, { mode: 'no-cors' });
            await cache.put(url, res);
          } catch (err) {
            console.log('[SW] CDN 资源缓存失败（不影响离线使用主功能）：', url);
          }
        })
      );

      self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
      self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    (async () => {
      const cached = await caches.match(event.request);

      const networkFetch = fetch(event.request)
        .then((networkResponse) => {
          // 只缓存有效响应（包括跨域的 opaque 响应）
          if (networkResponse && (networkResponse.ok || networkResponse.type === 'opaque')) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(() => cached);

      // 命中缓存则立即返回，同时后台更新缓存；否则等待网络请求
      return cached || networkFetch;
    })()
  );
});
