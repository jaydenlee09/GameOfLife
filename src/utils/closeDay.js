// ─── Daily Log: "Close the Day" ───────────────────────────────────────────────
// The night routine the Daily Log walks through for today's entry. Everything in
// here is pure (no React, no storage) so the step rules, the carry-forward loop,
// the nightly prompt and the XP rules can be checked in plain node.
//
// Entry fields the routine adds (all optional, so older entries keep working):
//   dayRating  1-10, how the day felt (separate from the computed Daily Score)
//   loopCheck  { from, text, result: 'yes' | 'partly' | 'no' } — did you work on
//              the last entry's "improve" item?
//   prompt     { id, text, answer } — tonight's rotating question, text frozen
//   closedAt   ms timestamp of the last "Close the day"

import { shiftDateKey } from './scoreUtils';
import { getFocusGoal } from './goalUtils';

export const STEP_KEYS = ['lookBack', 'checkIn', 'reflect', 'tomorrow', 'finish'];

export const STEP_META = {
  lookBack: { label: 'Look back', title: 'Before anything else, close yesterday’s loop.' },
  checkIn: { label: 'Check in', title: 'How was today?' },
  reflect: { label: 'Reflect', title: 'What did today teach you?' },
  tomorrow: { label: 'Tomorrow', title: 'One promise to tomorrow’s you.' },
  finish: { label: 'Finish', title: 'Close the day.' },
};

const clean = (list) => (Array.isArray(list) ? list.map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean) : []);

// ─── Look back ────────────────────────────────────────────────────────────────

// How far back an unlogged gap can be bridged when carrying an "improve" item forward.
export const CARRY_LOOKBACK_DAYS = 3;

/** The newest "improve" item from the last few days' entries (not today's), or null. */
export const getCarryForward = (logs, todayKey) => {
  for (let i = 1; i <= CARRY_LOOKBACK_DAYS; i++) {
    const from = shiftDateKey(todayKey, -i);
    const items = clean(logs?.[from]?.improve);
    if (items.length) return { from, text: items[0], daysAgo: i };
  }
  return null;
};

/**
 * What the Look back step shows. `commitment` is homeUtils' getYesterdayCommitment
 * result (same pending rule as Home's tile). An answered loopCheck wins over a
 * fresh carry-forward so editing older entries can't change what was answered.
 */
export const getLookBack = ({ entry, logs, logReviews, todayKey, commitment }) => {
  const answered = entry?.loopCheck?.text ? { from: entry.loopCheck.from, text: entry.loopCheck.text } : null;
  const carry = answered || getCarryForward(logs, todayKey);
  const focus = logReviews?.[shiftDateKey(todayKey, -1)]?.tomorrowFocus?.trim() || null;
  const hasCommitment = commitment?.status && commitment.status !== 'none';
  return { commitment, carry, focus, hasContent: !!(hasCommitment || carry || focus) };
};

// ─── Steps ────────────────────────────────────────────────────────────────────

/** True once tonight's commitment text has been held-to-commit (the archive has that exact text). */
export const isCommitmentLocked = (entry, commitmentArchive, dateKey) => {
  const text = entry?.commitment?.trim();
  return !!text && (commitmentArchive || []).some((a) => a.date === dateKey && a.text === text);
};

/** Which steps are done. Look back is done when nothing in it is still waiting on an answer. */
export const getStepStatus = ({ entry, lookBack, commitmentLocked }) => ({
  lookBack: !lookBack.hasContent || (
    lookBack.commitment?.status !== 'pending' && (!lookBack.carry || !!entry?.loopCheck?.result)
  ),
  checkIn: (entry?.emotions?.length > 0) || entry?.dayRating > 0,
  reflect: clean(entry?.proud).length > 0,
  tomorrow: !!commitmentLocked,
  finish: !!entry?.closedAt,
});

/** The steps to show: Look back is dropped when there's nothing to look back on. */
export const getSteps = (lookBack) => STEP_KEYS.filter((key) => key !== 'lookBack' || lookBack.hasContent);

/** Where to open: the first unfinished step, or Finish when everything is done. */
export const getFirstOpenStep = (steps, status) => steps.find((key) => !status[key]) || 'finish';

// ─── Tonight's prompt ─────────────────────────────────────────────────────────

// `needs` gates templated prompts on data the user actually has.
export const PROMPTS = [
  { id: 'energy', text: 'What gave you energy today, and what drained it?' },
  { id: 'redo', text: 'If you could replay one hour of today, which would it be and what would you change?' },
  { id: 'avoid', text: 'What did you avoid today? What made it feel hard?' },
  { id: 'proud-quiet', text: 'What’s one small thing you did right that nobody saw?' },
  { id: 'time', text: 'Where did your time actually go today? Was that the plan?' },
  { id: 'excuse', text: 'What excuse did you hear yourself make today? Is it true?' },
  { id: 'people', text: 'Who made your day better, and did you tell them?' },
  { id: 'fear', text: 'What would you do tomorrow if you weren’t afraid of doing it badly?' },
  { id: 'focus', text: 'When were you most focused today? What made that possible?' },
  { id: 'distract', text: 'What pulled you off track today, and how could you see it coming next time?' },
  { id: 'body', text: 'How did your body feel today, and what was it telling you?' },
  { id: 'stop', text: 'What’s one thing you should stop doing?' },
  { id: 'start', text: 'What’s one thing you’ve been putting off that would take under 20 minutes?' },
  { id: 'future', text: 'Will today matter a year from now? Which part?' },
  { id: 'advice', text: 'What advice would you give a friend who had your day?' },
  { id: 'enough', text: 'What did you do today that was “good enough” but could have been great?' },
  { id: 'surprise', text: 'What surprised you today?' },
  { id: 'phone', text: 'When did you reach for your phone without deciding to? What were you avoiding?' },
  { id: 'hard-thing', text: 'What was the hardest thing you did today?' },
  { id: 'kept', text: 'Where did you keep a promise to yourself today, even a tiny one?' },
  { id: 'mood', text: 'What moment changed your mood today, for better or worse?' },
  { id: 'learn-more', text: 'What do you want to understand better by the end of this week?' },
  { id: 'gratitude', text: 'What are you grateful for tonight that you took for granted this morning?' },
  { id: 'system', text: 'What made today easier or harder than it needed to be? Can you set that up on purpose?' },
  { id: 'north-star', text: 'What did you do today that the person you’re becoming would do?', needs: 'northStar' },
  { id: 'north-star-gap', text: 'Where did today pull you away from your North Star?', needs: 'northStar' },
  { id: 'goal-step', text: 'What’s the next smallest step on “{goal}”?', needs: 'goal' },
  { id: 'goal-block', text: 'What’s really in the way of “{goal}” right now?', needs: 'goal' },
];

// Small, stable string hash (djb2) so the same date always picks the same prompt.
const hash = (str) => {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h;
};

/**
 * Tonight's question. Deterministic per date (every device agrees), never the same
 * as `lastId` (the previous entry's prompt), and templated prompts only appear
 * when there's a North Star / focus goal to fill them with.
 */
export const pickPrompt = (dateKey, { northStar, goalTitle, lastId } = {}) => {
  const pool = PROMPTS.filter((p) => !p.needs || (p.needs === 'northStar' ? !!northStar : !!goalTitle));
  let index = hash(dateKey) % pool.length;
  if (pool[index].id === lastId) index = (index + 1) % pool.length;
  const prompt = pool[index];
  return { id: prompt.id, text: prompt.text.replace('{goal}', goalTitle || '') };
};

/** The prompt id the most recent earlier entry used (within the last week), so two nights don't repeat. */
export const getLastPromptId = (logs, todayKey) => {
  for (let i = 1; i <= 7; i++) {
    const id = logs?.[shiftDateKey(todayKey, -i)]?.prompt?.id;
    if (id) return id;
  }
  return null;
};

// ─── Lessons ──────────────────────────────────────────────────────────────────

/** Every "one thing I learned", newest first. */
export const getLessons = (logs) => Object.entries(logs || {})
  .filter(([, entry]) => entry?.learned?.trim())
  .map(([date, entry]) => ({ date, text: entry.learned.trim() }))
  .sort((a, b) => b.date.localeCompare(a.date));

const ANNIVERSARIES = [
  { days: 365, label: 'A year ago tonight' },
  { days: 90, label: 'Three months ago' },
  { days: 30, label: 'A month ago tonight' },
  { days: 7, label: 'A week ago tonight' },
];

/**
 * One older lesson to bring back tonight: an exact week / month / 3-month / year
 * anniversary when there is one, otherwise a stable pick from lessons at least a
 * week old. Null when there's nothing old enough yet.
 */
export const pickResurfacedLesson = (logs, todayKey) => {
  for (const { days, label } of ANNIVERSARIES) {
    const date = shiftDateKey(todayKey, -days);
    const text = logs?.[date]?.learned?.trim();
    if (text) return { date, text, label };
  }
  const cutoff = shiftDateKey(todayKey, -7);
  const older = getLessons(logs).filter((l) => l.date < cutoff);
  if (!older.length) return null;
  const pick = older[hash(`lesson:${todayKey}`) % older.length];
  return { ...pick, label: null };
};

// ─── Tomorrow ─────────────────────────────────────────────────────────────────

/**
 * Up to 3 commitment ideas: tonight's "improve" items, the focus goal's next
 * milestone, and tonight's pattern flags. Deduplicated, case-insensitively.
 */
export const getCommitmentSuggestions = ({ entry, goals, now, flags = [] }) => {
  const out = [];
  const add = (source, text) => {
    const t = text?.trim();
    if (t && !out.some((s) => s.text.toLowerCase() === t.toLowerCase())) out.push({ source, text: t });
  };
  clean(entry?.improve).forEach((t) => add('improve', t));
  const goal = getFocusGoal(goals, now);
  if (goal) {
    const next = (goal.milestones || []).find((m) => !m.completed && m.text?.trim());
    add('goal', next ? `${next.text.trim()} (${goal.title})` : `Move “${goal.title}” forward`);
  }
  flags.forEach((f) => add('pattern', f.tryTomorrow));
  return out.slice(0, 3);
};

const IF_THEN_RE = /^(?:when|if)\s+(.*?),\s*i will\b\s*(.*)$/i;

/** Splits "When X, I will Y" back into its two halves, or null if it isn't one. */
export const parseIfThen = (text) => {
  const match = IF_THEN_RE.exec(text?.trim() || '');
  return match ? { cue: match[1], action: match[2] } : null;
};

export const composeIfThen = (cue, action) => (cue || action ? `When ${cue}, I will ${action}` : '');

// ─── Health XP ────────────────────────────────────────────────────────────────

// The same once-per-day health rewards the old "Save Today's Log" button gave,
// now paid at "Close the day". Each reward is tracked by key, so closing again
// after logging a workout pays the workout without repaying sleep.
export const HEALTH_AWARDS = [
  {
    key: 'sleep',
    earned: (h) => h.sleepHours >= 8 && h.sleepHours <= 10,
    awards: [{ stat: 'health', amount: 20, label: 'Good sleep logged' }],
  },
  {
    key: 'workout',
    earned: (h) => (h.workouts?.length || 0) > 0,
    awards: [
      { stat: 'strength', amount: 15, label: 'Workout logged' },
      { stat: 'health', amount: 15, label: 'Workout logged' },
    ],
  },
  {
    key: 'energy',
    earned: (h) => h.energyLevel >= 4,
    awards: [{ stat: 'mentalHealth', amount: 10, label: 'High energy day' }],
  },
  {
    key: 'food',
    earned: (h, foodNet) => foodNet > 0,
    awards: [
      { stat: 'health', amount: 10, label: 'Ate well' },
      { stat: 'discipline', amount: 5, label: 'Stayed on food budget' },
    ],
  },
];

/**
 * Health rewards earned but not yet paid today. A legacy entry (`xpAwarded: true`
 * with no `xpAwardedFor`) was paid by the old Save button, so it owes nothing.
 */
export const getPendingHealthAwards = (healthEntry = {}, foodEntries = []) => {
  if (healthEntry.xpAwarded === true && !Array.isArray(healthEntry.xpAwardedFor)) return { keys: [], awards: [] };
  const paid = new Set(healthEntry.xpAwardedFor || []);
  const foodNet = foodEntries.reduce((sum, e) => sum + (e.points || 0), 0);
  const due = HEALTH_AWARDS.filter((r) => !paid.has(r.key) && r.earned(healthEntry, foodNet));
  return { keys: due.map((r) => r.key), awards: due.flatMap((r) => r.awards) };
};

/** Sleep length from bed/wake "HH:MM" times, wrapping past midnight; null if either is missing. */
export const calcSleepHours = (bed, wake) => {
  if (!bed || !wake) return null;
  const [bh, bm] = bed.split(':').map(Number);
  const [wh, wm] = wake.split(':').map(Number);
  let mins = (wh * 60 + wm) - (bh * 60 + bm);
  if (mins < 0) mins += 24 * 60;
  return Math.round((mins / 60) * 10) / 10;
};
