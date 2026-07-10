// Web push service worker: notification with one-click actions.
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'AskHumanToWork', {
      body: data.body ?? '',
      data: { url: data.url, actions: data.actions },
      icon: '/icon.png',
      actions: data.actions
        ? [
            { action: 'complete', title: '✓ Done' },
            { action: 'snooze1h', title: '💤 1 hour' },
          ]
        : [],
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const { url, actions } = event.notification.data ?? {};
  if (event.action && actions?.[event.action]) {
    // Signed action URL — no session needed.
    event.waitUntil(fetch(actions[event.action], { method: 'GET' }));
    return;
  }
  if (url) event.waitUntil(clients.openWindow(url));
});
