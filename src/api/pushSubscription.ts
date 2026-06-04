import { client } from './client'

let subscribed = false

export async function subscribeToPush() {
  if (subscribed) return
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.log('[push] not supported')
    return
  }

  try {
    // Register service worker
    const registration = await navigator.serviceWorker.register('/chat/sw.js')
    console.log('[push] SW registered')

    // Get VAPID public key
    const { publicKey } = await client.get<{ publicKey: string }>('/push/vapid-key')
    if (!publicKey) {
      console.log('[push] no VAPID key configured')
      return
    }

    // Check if already subscribed
    let subscription = await registration.pushManager.getSubscription()
    if (!subscription) {
      // Request permission and subscribe
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        console.log('[push] permission denied')
        return
      }

      // Convert VAPID key from base64url to Uint8Array
      const urlBase64ToUint8Array = (base64String: string) => {
        const padding = '='.repeat((4 - base64String.length % 4) % 4)
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
        const rawData = window.atob(base64)
        const outputArray = new Uint8Array(rawData.length)
        for (let i = 0; i < rawData.length; ++i) {
          outputArray[i] = rawData.charCodeAt(i)
        }
        return outputArray
      }

      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      })
      console.log('[push] subscribed')
    }

    // Send subscription to server
    await client.post('/push/subscribe', {
      subscription: subscription.toJSON(),
    })
    subscribed = true
    console.log('[push] subscription saved to server')

  } catch (err) {
    console.warn('[push] subscription failed:', err)
  }
}


export async function resubscribePush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('浏览器不支持推送通知')
  }

  const registration = await navigator.serviceWorker.register('/chat/sw.js')
  await navigator.serviceWorker.ready

  const existing = await registration.pushManager.getSubscription()
  if (existing) {
    await existing.unsubscribe()
    console.log('[push] old subscription removed')
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('通知权限未授予')
  }

  const { publicKey } = await client.get<{ publicKey: string }>('/push/vapid-key')
  if (!publicKey) throw new Error('服务器未配置 VAPID 密钥')

  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = '='.repeat((4 - base64String.length % 4) % 4)
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
    const rawData = window.atob(base64)
    const outputArray = new Uint8Array(rawData.length)
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i)
    }
    return outputArray
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  })

  await client.post('/push/subscribe', {
    subscription: subscription.toJSON(),
  })

  subscribed = true
  console.log('[push] re-subscribed successfully')
}
