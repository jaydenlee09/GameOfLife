/* APEX push service worker (Firebase Cloud Messaging).
 *
 * Lives in /public, so Vite doesn't process it: the Firebase web config arrives as
 * query params on the registration URL (see src/services/pushService.js). The
 * compat SDK version must match the `firebase` package in package.json.
 *
 * The server sends data-only messages and this worker shows them itself, so the
 * title/body/tap target are fully under our control. Tapping a notification
 * focuses an open APEX window and tells it which page to show, or opens one.
 */

// Registered before the Firebase scripts so it runs first on taps.
self.addEventListener('notificationclick', (event) => {
  const data = event.notification.data || {};
  if (!data.apex) return; // not ours — leave it to the Firebase SDK
  event.notification.close();
  const page = data.page || 'welcome';
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = windows.find((c) => new URL(c.url).origin === self.location.origin);
    if (open) {
      open.postMessage({ type: 'apex-navigate', page });
      return open.focus();
    }
    return self.clients.openWindow(`/?page=${encodeURIComponent(page)}`);
  })());
});

importScripts('https://www.gstatic.com/firebasejs/12.13.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.13.0/firebase-messaging-compat.js');

const params = new URL(self.location.href).searchParams;
firebase.initializeApp({
  apiKey: params.get('apiKey'),
  projectId: params.get('projectId'),
  messagingSenderId: params.get('messagingSenderId'),
  appId: params.get('appId'),
});

firebase.messaging().onBackgroundMessage((payload) => {
  const d = payload.data || {};
  return self.registration.showNotification(d.title || 'APEX', {
    body: d.body || '',
    icon: '/icons/icon-192.png',
    tag: d.id || undefined,
    data: { apex: true, page: d.page || 'welcome' },
  });
});
