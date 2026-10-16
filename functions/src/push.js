// ─── Push tick: the logic behind the scheduled function ───────────────────────
// Kept free of firebase-functions so it can be run against fakes in tests; the
// deployable wrapper is index.js. Imports the app's own src/utils (bundled by
// build.mjs), so push timing and content follow exactly the same rules as the app.

import { decidePushes, markPushesSent, withPushDefaults, MORNING_PUSH_PROMPT, splitMorningBrief } from '../../src/utils/pushSchedule';
import { runAssistantTurn } from '../../src/utils/assistantUtils';
import { TOOL_DECLARATIONS, getTool } from '../../src/utils/assistantTools';

// App data each tick needs, keyed by the state name the shared utils expect.
// These are the same Firestore docs App.jsx syncs (users/{uid}/data/{key} → { value }).
const STATE_KEYS = {
  user: 'gameOfLife_user',
  todos: 'gameOfLife_todos',
  habits: 'gameOfLife_habits',
  logs: 'gameOfLife_logs',
  healthLog: 'gameOfLife_healthLog',
  foodPoints: 'gameOfLife_foodPoints',
  pomodoroSessions: 'gameOfLife_pomodoroSessions',
  goals: 'gameOfLife_goals_v1',
  weeklyReviews: 'gameOfLife_weeklyReviews',
  xpLog: 'gameOfLife_xpLog',
  commitmentArchive: 'gameOfLife_commitmentArchive',
  calendarEvents: 'gameOfLife_calendarEvents',
  noPhoneBlocks: 'gameOfLife_noPhoneBlocks',
  calendarDayEvents: 'gameOfLife_calendarDayEvents',
  achievements: 'gameOfLife_achievements',
  shop: 'gameOfLife_shop',
  brainDumpNotes: 'gameOfLife_brainDump',
  assistantMemory: 'gameOfLife_assistantMemory',
  assistantCheckins: 'gameOfLife_assistantCheckins',
  logReviews: 'gameOfLife_logReviews',
};
const SETTINGS_KEY = 'gameOfLife_pushSettings';
const PUSH_STATE_KEY = 'gameOfLife_pushState';

// The server may only look things up; it never writes app data.
export const READ_ONLY_DECLARATIONS = TOOL_DECLARATIONS.filter((d) => getTool(d.name)?.tier === 'read');

const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

const pad = (n) => String(n).padStart(2, '0');
const localDateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const isValidTimeZone = (tz) => {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
};

const readValue = (snap, fallback) => (snap.exists ? snap.data()?.value ?? fallback : fallback);

const loadState = async (db, uid) => {
  const entries = Object.entries(STATE_KEYS);
  const snaps = await db.getAll(...entries.map(([, key]) => db.doc(`users/${uid}/data/${key}`)));
  const state = {};
  entries.forEach(([name], i) => { state[name] = readValue(snaps[i], undefined); });
  state.user = { name: 'you', level: 1, xp: 0, stats: {}, ...state.user };
  return state;
};

const writeMorningBrief = async ({ state, generate, log }) => {
  const result = await runAssistantTurn({
    history: [],
    userMessage: MORNING_PUSH_PROMPT,
    state,
    validStats: Object.keys(state.user?.stats || {}),
    generate,
    maxRounds: 4,
  });
  if (result.applied.length || result.proposed.length) log('morning brief tried to change data; ignored');
  return splitMorningBrief(result.text);
};

/**
 * Processes one user at instant `nowMs`. Returns a summary for logging.
 * Sets process.env.TZ to the user's timezone: the shared utils read local time.
 */
export const processUser = async ({ db, messaging, generate, uid, nowMs, log = () => {} }) => {
  const settingsRef = db.doc(`users/${uid}/data/${SETTINGS_KEY}`);
  const stateRef = db.doc(`users/${uid}/data/${PUSH_STATE_KEY}`);
  const [settingsSnap, pushStateSnap] = await db.getAll(settingsRef, stateRef);
  const settings = withPushDefaults(readValue(settingsSnap, {}));
  if (!settings.enabled || !settings.tokens.length) return { uid, skipped: 'disabled' };
  if (!settings.timezone || !isValidTimeZone(settings.timezone)) return { uid, skipped: 'no timezone' };
  process.env.TZ = settings.timezone; // Node re-reads TZ on assignment
  const now = new Date(nowMs);

  const state = await loadState(db, uid);
  let pushState = readValue(pushStateSnap, {});
  const pushes = decidePushes(now, settings, state, pushState);
  if (!pushes.length) return { uid, sent: [] };

  const today = localDateKey(now);
  for (const push of pushes) {
    // Skip the AI brief if the app already gave today's in-app morning check-in.
    if (!push.ai || !generate || state.assistantCheckins?.morning === today) continue;
    try {
      const brief = await writeMorningBrief({ state, generate, log });
      if (brief.pushBody) {
        push.body = brief.pushBody;
        pushState = { ...pushState, morningBrief: { date: today, text: brief.chatText, at: now.getTime() } };
      }
    } catch (err) {
      log(`morning brief failed, using template: ${err.message}`);
    }
  }

  const deadTokens = new Set();
  const delivered = [];
  for (const push of pushes) {
    const messages = settings.tokens.map(({ token }) => ({
      token,
      data: { id: push.id, title: push.title, body: push.body, page: push.page },
      webpush: { headers: { Urgency: 'high', TTL: '3600' } },
    }));
    const res = await messaging.sendEach(messages);
    res.responses.forEach((r, i) => {
      if (!r.success && DEAD_TOKEN_CODES.has(r.error?.code)) deadTokens.add(messages[i].token);
      if (!r.success) log(`send ${push.id} failed: ${r.error?.code || r.error?.message}`);
    });
    // Retry next tick (still inside the window) unless at least one device got it
    // or every failure was a dead token that will never accept it.
    const allDead = res.responses.every((r) => r.success || DEAD_TOKEN_CODES.has(r.error?.code));
    if (res.successCount > 0 || allDead) delivered.push(push.id);
  }

  await stateRef.set({ value: markPushesSent(pushState, delivered, now) });

  if (deadTokens.size) {
    // Transaction: the client may be adding a token at the same moment.
    await db.runTransaction(async (tx) => {
      const fresh = withPushDefaults(readValue(await tx.get(settingsRef), {}));
      tx.set(settingsRef, { value: { ...fresh, tokens: fresh.tokens.filter((t) => !deadTokens.has(t.token)) } });
    });
  }
  return { uid, sent: delivered, removedTokens: deadTokens.size };
};

/** One scheduled tick over every user. */
export const runPushTick = async ({ db, messaging, generate, nowMs = Date.now(), log = () => {} }) => {
  const users = await db.collection('users').listDocuments();
  const results = [];
  // Sequential on purpose: process.env.TZ is process-wide.
  for (const userRef of users) {
    try {
      results.push(await processUser({ db, messaging, generate, uid: userRef.id, nowMs, log }));
    } catch (err) {
      log(`user ${userRef.id} failed: ${err.stack || err.message}`);
    }
  }
  return results;
};
