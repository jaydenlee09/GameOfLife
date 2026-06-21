import { db } from '../firebase/config';
import { doc, getDocFromServer, onSnapshot, setDoc, writeBatch } from 'firebase/firestore';

const DATA_KEYS = [
  'gameOfLife_todos',
  'gameOfLife_habits',
  'gameOfLife_logs',
  'gameOfLife_chatHistory',
  'gameOfLife_calendarEvents',
  'gameOfLife_quickEvents',
  'gameOfLife_calendarDayEvents',
  'gameOfLife_commitmentArchive',
  'gameOfLife_challenges_v2',
  'gameOfLife_goals_v1',
  'gameOfLife_user',
  'gameOfLife_xpLog',
  'gameOfLife_pomodoroSessions',
  'gameOfLife_achievements',
  'gameOfLife_healthLog',
  'gameOfLife_weeklyReviews',
  'gameOfLife_shop',
];

const SHOP_KEY = 'gameOfLife_shop';
// Old key from before the Shop page rename; fallback-only read so data
// written under the old name (before this fix) isn't orphaned.
const LEGACY_SHOP_KEY = 'gameOfLife_rewards';

// Last value sent/received per key, so our own writes don't echo back
// through the onSnapshot listeners in subscribeToUserData and loop forever.
const lastWrittenValue = {};

export async function loadAllUserData(uid) {
  // Always fetch from the server to avoid stale in-memory cache returning
  // old data when another device has written more recent changes.
  const keysToFetch = [...DATA_KEYS, LEGACY_SHOP_KEY];
  const snapshots = await Promise.all(
    keysToFetch.map(key => getDocFromServer(doc(db, 'users', uid, 'data', key)))
  );
  const data = {};
  let hasAnyData = false;
  for (let i = 0; i < DATA_KEYS.length; i++) {
    if (snapshots[i].exists()) {
      data[DATA_KEYS[i]] = snapshots[i].data().value;
      hasAnyData = true;
    }
  }
  const legacySnap = snapshots[snapshots.length - 1];
  if (data[SHOP_KEY] === undefined && legacySnap.exists()) {
    data[SHOP_KEY] = legacySnap.data().value;
    hasAnyData = true;
  }
  for (const key of DATA_KEYS) {
    if (data[key] !== undefined) lastWrittenValue[key] = JSON.stringify(data[key]);
  }
  return hasAnyData ? data : null;
}

const debouncers = {};
const pendingWrites = {}; // { key: { uid, value } }

export function saveDataKey(uid, key, value) {
  pendingWrites[key] = { uid, value };
  clearTimeout(debouncers[key]);
  debouncers[key] = setTimeout(() => {
    delete pendingWrites[key];
    lastWrittenValue[key] = JSON.stringify(value);
    setDoc(doc(db, 'users', uid, 'data', key), { value }).catch(console.error);
  }, 500);
}

export function flushPendingWrites() {
  const entries = Object.entries(pendingWrites);
  if (entries.length === 0) return;
  for (const [key, { uid, value }] of entries) {
    clearTimeout(debouncers[key]);
    delete debouncers[key];
    delete pendingWrites[key];
    lastWrittenValue[key] = JSON.stringify(value);
    setDoc(doc(db, 'users', uid, 'data', key), { value }).catch(console.error);
  }
}

// Live cross-device updates. Returns a function that unsubscribes all of them.
export function subscribeToUserData(uid, onKeyChanged) {
  const unsubs = DATA_KEYS.map(key =>
    onSnapshot(doc(db, 'users', uid, 'data', key), snap => {
      if (!snap.exists()) return;
      const value = snap.data().value;
      const serialized = JSON.stringify(value);
      if (lastWrittenValue[key] === serialized) return; // echo of our own write/load
      lastWrittenValue[key] = serialized;
      onKeyChanged(key, value);
    })
  );
  return () => unsubs.forEach(unsub => unsub());
}

export async function migrateLocalStorageToFirestore(uid, currentData) {
  const batch = writeBatch(db);
  for (const key of DATA_KEYS) {
    const value = currentData[key];
    if (value !== undefined && value !== null) {
      batch.set(doc(db, 'users', uid, 'data', key), { value });
    }
  }
  await batch.commit();
}
