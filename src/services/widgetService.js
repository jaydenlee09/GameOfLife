// ─── Home Screen widget: client side ──────────────────────────────────────────
// The widget (a Scriptable script on the iPhone) can't sign in, so it reads one
// public, read-only doc: widgets/{token} = { uid, updatedAt, json }, where `json`
// is the snapshot from widgetSnapshot.js. The token is 128 random bits and lives
// only in the user's copy of the script; "Reset link" swaps it for a new one.
//
// Settings live in users/{uid}/data/gameOfLife_widget ({ value: { token, timezone } }),
// outside App's synced-state machinery like the push settings: only this module
// writes them, on an explicit user action. The server tick reads them to refresh
// the widget while the app is closed.
//
// Firestore rules must allow it (paste into the Rules tab):
//   match /widgets/{token} {
//     allow get: if true;
//     allow create: if request.auth != null && request.resource.data.uid == request.auth.uid;
//     allow update: if request.auth != null && resource.data.uid == request.auth.uid
//                   && request.resource.data.uid == request.auth.uid;
//     allow delete: if request.auth != null && resource.data.uid == request.auth.uid;
//   }

import { deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db, firebaseConfig } from '../firebase/config';
import widgetSource from '../widget/apexWidget.scriptable.js?raw';

const SETTINGS_KEY = 'gameOfLife_widget';
const settingsRef = (uid) => doc(db, 'users', uid, 'data', SETTINGS_KEY);
const widgetRef = (token) => doc(db, 'widgets', token);

const newToken = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
const timezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

const friendly = (err) => (err?.code === 'permission-denied'
  ? new Error('Firebase blocked the widget. Add the widgets rule in Firebase → Firestore → Rules, then try again.')
  : err);

/** Where the widget reads its snapshot (Firestore REST, no sign-in). */
export const widgetDocUrl = (token) =>
  `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/widgets/${token}`;

/** The Scriptable script with this user's private link and the app's address filled in. */
export const buildWidgetScript = (token, appUrl = window.location.origin) => widgetSource
  .replace('__APEX_DOC_URL__', () => widgetDocUrl(token))
  .replace('__APEX_APP_URL__', () => appUrl);

/** Live widget settings ({ token, timezone } or null when off). Returns an unsubscribe fn. */
export const subscribeWidgetSettings = (uid, callback) => onSnapshot(
  settingsRef(uid),
  (snap) => callback(snap.exists() ? snap.data().value || null : null),
  () => callback(null),
);

/** Writes the snapshot the widget shows. `snapshot` null = "open APEX to fill in". */
export const publishWidgetSnapshot = async (uid, token, snapshot) => {
  try {
    await setDoc(widgetRef(token), { uid, updatedAt: Date.now(), json: JSON.stringify(snapshot) });
  } catch (err) {
    throw friendly(err);
  }
};

/**
 * Turns the widget on (or gives it a new link when `previousToken` is passed).
 * Writes the public doc first, so a missing Firestore rule fails here, before the
 * settings point at a doc nobody can write. Returns the saved settings.
 */
export const enableWidget = async (uid, previousToken = null) => {
  const token = newToken();
  await publishWidgetSnapshot(uid, token, null);
  const value = { token, timezone: timezone(), createdAt: Date.now() };
  await setDoc(settingsRef(uid), { value });
  if (previousToken) await deleteDoc(widgetRef(previousToken)).catch(() => {});
  return value;
};

/** Turns the widget off: the old script stops getting data. */
export const disableWidget = async (uid, token) => {
  await setDoc(settingsRef(uid), { value: null });
  if (token) await deleteDoc(widgetRef(token)).catch(() => {});
  return null;
};

/** Keeps the stored timezone current (the server computes "today" in it). */
export const syncWidgetTimezone = async (uid, settings) => {
  if (!settings?.token || settings.timezone === timezone()) return;
  await setDoc(settingsRef(uid), { value: { ...settings, timezone: timezone() } });
};
