// Service Worker for Reverie Push Notifications

self.addEventListener('push', function(event) {
  let data = { title: '晨', body: '发来了一条消息' }
  try {
    data = event.data.json()
  } catch (e) {
    // fallback
  }

  const options = {
    body: data.body,
    icon: '/chat/favicon.ico',
    badge: '/chat/favicon.ico',
    tag: 'reverie-push',
    renotify: true,
    data: { url: '/chat/' },
  }

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  )
})

self.addEventListener('notificationclick', function(event) {
  event.notification.close()
  const url = event.notification.data?.url || '/chat/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      // If Reverie is already open, focus it
      for (const client of clientList) {
        if (client.url.includes('/chat') && 'focus' in client) {
          return client.focus()
        }
      }
      // Otherwise open a new window
      return clients.openWindow(url)
    })
  )
})
