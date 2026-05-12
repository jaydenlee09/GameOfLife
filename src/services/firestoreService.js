import { db } from '../firebase/config';
import { doc, getDoc, setDoc, writeBatch } from 'firebase/firestore';

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
  const snapshots = await Promise.all(
    DATA_KEYS.map(key => getDoc(doc(db, 'users', uid, 'data', key)))
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

export function saveDataKey(uid, key, value) {
  clearTimeout(debouncers[key]);
  debouncers[key] = setTimeout(() => {
    setDoc(doc(db, 'users', uid, 'data', key), { value }).catch(console.error);
  }, 3000);
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
