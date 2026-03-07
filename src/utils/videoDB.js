// ─── IndexedDB helpers for persisting video blobs ────────────────────────────
//
// DB: "GameOfLifeVideoDB"
// Object store: "videos"  –  key is the log date string "YYYY-MM-DD"
// Value: the raw File / Blob object

const DB_NAME = 'GameOfLifeVideoDB';
const STORE_NAME = 'videos';
const DB_VERSION = 1;

let _dbPromise = null;

function openDB() {
  if (_dbPromise) return _dbPromise;

  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => {
      _dbPromise = null; // allow retry
      reject(e.target.error);
    };
  });

  return _dbPromise;
}

/**
 * Save a video Blob/File for a given log date.
 * @param {string} dateKey  "YYYY-MM-DD"
 * @param {Blob|File} blob
 */
export async function saveVideo(dateKey, blob) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(blob, dateKey);
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Retrieve the video Blob for a given log date.
 * Resolves with the Blob, or null if not found.
 * @param {string} dateKey  "YYYY-MM-DD"
 * @returns {Promise<Blob|null>}
 */
export async function getVideo(dateKey) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(dateKey);
    req.onsuccess = (e) => resolve(e.target.result ?? null);
    req.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Delete the stored video for a given log date.
 * @param {string} dateKey  "YYYY-MM-DD"
 */
export async function deleteVideo(dateKey) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(dateKey);
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e.target.error);
  });
}
