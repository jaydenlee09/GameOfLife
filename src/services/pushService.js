// ─── Push notifications: client side ──────────────────────────────────────────
// Registers the FCM service worker, gets this device's push token, and keeps the
// user's push settings in Firestore (users/{uid}/data/gameOfLife_pushSettings,
// same `{ value }` shape as every other data doc). The Cloud Function in
// functions/ reads that doc on its 5-minute schedule and sends the pushes.
//
// The settings doc is deliberately NOT part of App's synced-state machinery: only
// this module writes it, and only on an explicit user action.

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { app, db, firebaseConfig } from '../firebase/config';
import { withPushDefaults } from '../utils/pushSchedule';

const SETTINGS_KEY = 'gameOfLife_pushSettings';
const SW_SCOPE = '/firebase-cloud-messaging-push-scope';
const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;
const DEVICE_TOKEN_KEY = 'gameOfLife_pushToken'; // this device's token (local only)

const settingsRef = (uid) => doc(db, 'users', uid, 'data', SETTINGS_KEY);

export const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;

/**
 * What this device can do. `status` is one of:
 * 'unsupported' | 'needs-install' (iPhone in a Safari tab) | 'no-key' | 'denied' | 'ready'
 */
export const getPushSupport = async () => {
  if (isIos() && !isStandalone()) return { status: 'needs-install' };
  if (!('serviceWorker' in navigator) || !('Notification' in window) || !('PushManager' in window)) return { status: 'unsupported' };
  const { isSupported } = await import('firebase/messaging');
  if (!(await isSupported())) return { status: 'unsupported' };
  if (!VAPID_KEY) return { status: 'no-key' };
  if (Notification.permission === 'denied') return { status: 'denied' };
  return { status: 'ready', permission: Notification.permission };
};

const registerWorker = () => {
  const params = new URLSearchParams({
    apiKey: firebaseConfig.apiKey,
    projectId: firebaseConfig.projectId,
    messagingSenderId: firebaseConfig.messagingSenderId,
    appId: firebaseConfig.appId,
  });
  return navigator.serviceWorker.register(`/firebase-messaging-sw.js?${params}`, { scope: SW_SCOPE });
};

const fetchToken = async () => {
  const { getMessaging, getToken } = await import('firebase/messaging');
  const registration = await registerWorker();
  return getToken(getMessaging(app), { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
};

export const loadPushSettings = async (uid) => {
  const snap = await getDoc(settingsRef(uid));
  return withPushDefaults(snap.exists() ? snap.data().value : {});
};

export const savePushSettings = async (uid, settings) => {
  const value = withPushDefaults(settings);
  await setDoc(settingsRef(uid), { value });
  return value;
};

const deviceLabel = () => (isIos() ? 'iPhone' : /Android/.test(navigator.userAgent) ? 'Android' : 'Browser');

const withToken = (settings, token) => ({
  ...settings,
  tokens: [
    ...(settings.tokens || []).filter((t) => t.token !== token),
    { token, platform: deviceLabel(), addedAt: Date.now() },
  ],
});

/** Must run inside a tap/click (iOS only shows the permission prompt then). Returns saved settings. */
export const enablePushOnThisDevice = async (uid) => {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error(permission === 'denied'
    ? 'Notifications are blocked. Turn them on for APEX in Settings → Notifications, then try again.'
    : 'Permission was not granted.');
  const token = await fetchToken();
  if (!token) throw new Error('Could not get a push token from Firebase.');
  localStorage.setItem(DEVICE_TOKEN_KEY, token);
  const current = await loadPushSettings(uid);
  return savePushSettings(uid, {
    ...withToken(current, token),
    enabled: true,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    appUrl: window.location.origin,
  });
};

/** Stops pushes to this device only. */
export const disablePushOnThisDevice = async (uid) => {
  const token = localStorage.getItem(DEVICE_TOKEN_KEY);
  try {
    const { getMessaging, deleteToken } = await import('firebase/messaging');
    await deleteToken(getMessaging(app));
  } catch { /* token may already be gone */ }
  localStorage.removeItem(DEVICE_TOKEN_KEY);
  const current = await loadPushSettings(uid);
  const tokens = (current.tokens || []).filter((t) => t.token !== token);
  return savePushSettings(uid, { ...current, tokens, enabled: tokens.length > 0 && current.enabled });
};

export const thisDeviceToken = () => localStorage.getItem(DEVICE_TOKEN_KEY);

/**
 * On app open: FCM tokens rotate, so re-fetch silently (no prompt — permission is
 * already granted) and update the stored token/timezone if they changed.
 */
export const refreshPushToken = async (uid) => {
  const previous = localStorage.getItem(DEVICE_TOKEN_KEY);
  if (!previous || Notification.permission !== 'granted' || !VAPID_KEY) return;
  const token = await fetchToken();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const current = await loadPushSettings(uid);
  const known = current.tokens.some((t) => t.token === token);
  if (token === previous && known && current.timezone === timezone) return;
  localStorage.setItem(DEVICE_TOKEN_KEY, token);
  const tokens = withToken({ tokens: current.tokens.filter((t) => t.token !== previous) }, token).tokens;
  await savePushSettings(uid, { ...current, tokens, timezone });
};

/** Pushes that arrive while APEX is open in the foreground: show them anyway. */
export const listenForegroundPushes = async () => {
  const { getMessaging, onMessage } = await import('firebase/messaging');
  return onMessage(getMessaging(app), async ({ data = {} }) => {
    const registration = await navigator.serviceWorker.getRegistration(SW_SCOPE);
    registration?.showNotification(data.title || 'APEX', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      tag: data.id || undefined,
      data: { apex: true, page: data.page || 'welcome' },
    });
  });
};

// ─── Server-written state (morning brief hand-off) ────────────────────────────
const PUSH_STATE_KEY = 'gameOfLife_pushState';

/** Live updates of the server-owned push state doc. Returns an unsubscribe fn. */
export const subscribePushState = async (uid, callback) => {
  const { onSnapshot } = await import('firebase/firestore');
  return onSnapshot(doc(db, 'users', uid, 'data', PUSH_STATE_KEY), (snap) => {
    callback(snap.exists() ? snap.data().value || {} : {});
  }, () => callback({})); // e.g. rules deny it: treat as empty so nothing waits on it
};
