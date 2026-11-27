// T2-E 52 (answers 2875 to 2878): this browser's push subscription. The service worker is public/yx-sw.js (caches
// nothing). One subscription per device; it is removed on sign-out (removePushOnSignOut) and when push is turned off.
import { apiFetch } from './api-client';

export type PushDevice = 'on' | 'off' | 'blocked' | 'unsupported' | 'ios-install';

const supported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
/** An iPhone or iPad in Safari, not opened from the Home Screen: Apple allows push only to the installed web app. */
export function iosNeedsInstall(nav: { userAgent: string; standalone?: boolean } = navigator as Navigator & { standalone?: boolean }, standalone = typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches): boolean {
  return /iPhone|iPad|iPod/.test(nav.userAgent) && !(nav.standalone || standalone);
}

const b64ToBytes = (b64: string) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};
const keyText = (k: ArrayBuffer | null) => (k ? btoa(String.fromCharCode(...new Uint8Array(k))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : '');

async function registration() {
  return navigator.serviceWorker.register('/yx-sw.js', { scope: '/' });
}

export async function pushDevice(): Promise<PushDevice> {
  if (typeof window === 'undefined') return 'unsupported';
  if (iosNeedsInstall()) return 'ios-install';
  if (!supported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  const reg = await navigator.serviceWorker.getRegistration('/');
  return (await reg?.pushManager.getSubscription()) ? 'on' : 'off';
}

/** Asks the browser, subscribes with the server's public key and saves this device for me. */
export async function turnPushOn(publicKey: string, token?: string): Promise<PushDevice> {
  if (!supported()) return 'unsupported';
  if ((await Notification.requestPermission()) !== 'granted') return 'blocked';
  const reg = await registration();
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) }));
  await apiFetch('/notifications/push/subscription', { method: 'PUT', body: JSON.stringify({ endpoint: sub.endpoint, p256dh: keyText(sub.getKey('p256dh')), auth: keyText(sub.getKey('auth')), userAgent: navigator.userAgent.slice(0, 400) }) }, token);
  return 'on';
}

/** Push off for this device: the server forgets it and the browser drops it. */
export async function turnPushOff(token?: string): Promise<PushDevice> {
  if (!supported()) return 'unsupported';
  const reg = await navigator.serviceWorker.getRegistration('/');
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await apiFetch('/notifications/push/subscription', { method: 'DELETE', body: JSON.stringify({ endpoint: sub.endpoint }) }, token).catch(() => undefined);
    await sub.unsubscribe().catch(() => undefined);
  }
  return 'off';
}

/** Sign-out: this device stops getting pushes for the person who signed out. Never blocks signing out. */
export async function removePushOnSignOut(): Promise<void> {
  try {
    if (supported()) await turnPushOff();
  } catch {
    /* signing out carries on */
  }
}
