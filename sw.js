importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: 'AIzaSyBZpcSyibLfX_AJDxfsAz7VJid_Cjrvlnw',
  authDomain: 'matos-gestao-de-alugeis.firebaseapp.com',
  projectId: 'matos-gestao-de-alugeis',
  storageBucket: 'matos-gestao-de-alugeis.firebasestorage.app',
  messagingSenderId: '106797791955',
  appId: '1:106797791955:web:62f7a01f93bd8383fd7226',
  measurementId: 'G-XK3NCD25B8',
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();
const CACHE = 'matos-public-shell-v4';
const SHELL = ['/', '/index.html', '/style.css'];
const PUBLIC_DESTINATIONS = new Set(['document', 'style', 'script', 'image', 'font', 'manifest']);
const PRIVATE_PATH_PREFIXES = ['/auth/', '/rest/', '/storage/', '/functions/'];

function isPublicAssetRequest(request) {
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  if (PRIVATE_PATH_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) return false;
  return request.mode === 'navigate' || PUBLIC_DESTINATIONS.has(request.destination);
}

function canStoreResponse(response) {
  if (!response?.ok || response.type !== 'basic') return false;
  const cacheControl = response.headers.get('cache-control') || '';
  return !/no-store|private/i.test(cacheControl);
}

function safeNotificationUrl(rawUrl) {
  try {
    const url = new URL(rawUrl || '/', self.location.origin);
    return url.origin === self.location.origin ? `${url.pathname}${url.search}${url.hash}` : '/';
  } catch {
    return '/';
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (!isPublicAssetRequest(event.request)) return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (canStoreResponse(response)) {
          const copy = response.clone();
          event.waitUntil(
            caches
              .open(CACHE)
              .then((cache) => cache.put(event.request, copy))
              .catch(() => {}),
          );
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        if (event.request.mode === 'navigate') {
          return (await caches.match('/index.html')) || Response.error();
        }
        return Response.error();
      }),
  );
});

messaging.onBackgroundMessage((payload) => {
  const notification = payload.notification || {};
  const data = payload.data || {};
  self.registration.showNotification(notification.title || 'Matos – Gestão de Aluguéis', {
    body: notification.body || data.body || 'Você tem uma nova notificação.',
    tag: data.tag || 'matos-alerta',
    data: { url: safeNotificationUrl(data.url) },
    renotify: true,
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = safeNotificationUrl(event.notification.data?.url);
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow ? clients.openWindow(url) : null;
    }),
  );
});
