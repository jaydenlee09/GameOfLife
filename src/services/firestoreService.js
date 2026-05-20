import { db } from '../firebase/config';
import { doc, getDocFromServer, setDoc, writeBatch } from 'firebase/firestore';

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
  'gameOfLife_rewards',
];

export async function loadAllUserData(uid) {
  // Always fetch from the server to avoid stale in-memory cache returning
  // old data when another device has written more recent changes.
  const snapshots = await Promise.all(
    DATA_KEYS.map(key => getDocFromServer(doc(db, 'users', uid, 'data', key)))
  );
  const data = {};
  let hasAnyData = false;
  for (let i = 0; i < DATA_KEYS.length; i++) {
    if (snapshots[i].exists()) {
      data[DATA_KEYS[i]] = snapshots[i].data().value;
      hasAnyData = true;
    }
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
    setDoc(doc(db, 'users', uid, 'data', key), { value }).catch(console.error);
  }
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
