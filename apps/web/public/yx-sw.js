// T2-E 52 (answers 2875, 2876): the YukthiX service worker. It only shows pushes and opens their page; it caches
// nothing (no fetch handler, no Cache Storage), so no private page or data is ever kept on the device by it.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = {};
  }
  // A short neutral title only (the server never sends figures, names or ticket content).
  const title = typeof data.title === 'string' && data.title ? data.title.slice(0, 120) : 'You have something new in YukthiX';
  const url = typeof data.url === 'string' && data.url.startsWith('/') ? data.url : '/yx/notifications';
  event.waitUntil(self.registration.showNotification(title, { body: 'Open YukthiX to see it.', icon: '/icon.png', data: { url }, tag: url }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/yx/notifications', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((all) => {
      const same = all.find((c) => c.url === url);
      if (same) return same.focus();
      // The app asks for sign-in first when the session has ended, then opens the page.
      return self.clients.openWindow(url);
    }),
  );
});
