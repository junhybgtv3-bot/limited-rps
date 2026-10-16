// 최소 서비스 워커 — 설치 가능성(PWA) 조건 충족용.
// 실시간 게임이라 캐싱은 하지 않고 전부 네트워크로 통과시킨다.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
