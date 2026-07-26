// ─── Daily Score & Streak ─────────────────────────────────────────────────────
// The Daily Score is the app's honest headline signal: a 0–10 number COMPUTED
// from what the user actually did (habits/tasks/screentime/log/commitment). Unlike XP,
// it can't be self-assigned. It powers both the Home hero and the character sheet,
// and — because every input is date-keyed — it can be computed for any past day,
// which is what makes the streak possible.

import RANK_TIERS from './rankMeta';

export const getLocalDateKey = (offsetDays = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Shift a YYYY-MM-DD key by a whole number of days (DST-safe via local Date math).
export const shiftDateKey = (dateKey, offsetDays) => {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d + offsetDays);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};

// Score for a single day. `dateKey` defaults to today; pass a past key to score history.
export const computeDailyScore = (
  habits, xpLog, logs, commitmentArchive, healthLog, dateKey = getLocalDateKey(0)
) => {
  const prevKey = shiftDateKey(dateKey, -1);

  // Habits: completed on this day / total
  const habitsTotal = habits.length;
  const habitsDone  = habits.filter(h => h.history?.[dateKey]).length;
  const habitScore  = habitsTotal > 0 ? (habitsDone / habitsTotal) * 10 : 0;

  // Tasks: task xp events logged on this day (3 tasks = full score)
  const tasksDone   = xpLog.filter(e => e.source === 'task' && e.date === dateKey).length;
  const taskScore   = Math.min(tasksDone / 3, 1) * 10;

  // Screentime: logged and kept at/under 1h (mirrors the "ideal" band in healthUtils) = full score
  const screentimeHours  = healthLog?.[dateKey]?.screentimeHours;
  const screentimeLogged = screentimeHours != null;
  const screentimeScore  = screentimeLogged && screentimeHours <= 1 ? 10 : 0;

  // Daily log filled?
  const dayLog      = logs?.[dateKey];
  const logFilled   = dayLog && ((dayLog.emotions?.length > 0) || dayLog.proud?.some(p => p?.trim()));
  const logScore    = logFilled ? 10 : 0;

  // Commitment: was the prior day's commitment kept?
  const lastCommit  = commitmentArchive.find(a => a.date === prevKey);
  const commitScore = lastCommit?.denied === false || (lastCommit?.confirmedOn && lastCommit.denied !== true) ? 10 : 0;

  const raw = habitScore * 0.3 + taskScore * 0.3 + screentimeScore * 0.2 + logScore * 0.1 + commitScore * 0.1;
  return {
    score: Math.round(raw * 10) / 10,
    breakdown: {
      habits:     { value: Math.round(habitScore * 10) / 10, weight: 30, label: `${habitsDone}/${habitsTotal} habits` },
      tasks:      { value: Math.round(taskScore  * 10) / 10, weight: 30, label: `${tasksDone} task${tasksDone !== 1 ? 's' : ''} done` },
      screentime: { value: screentimeScore, weight: 20, label: screentimeLogged ? `${Math.round(screentimeHours * 10) / 10}h screentime` : 'Screentime not logged' },
      log:        { value: logScore,   weight: 10, label: logFilled ? 'Log filled' : 'Log empty' },
      commitment: { value: commitScore, weight: 10, label: lastCommit ? (commitScore > 0 ? 'Commitment kept' : 'Commitment missed') : 'No commitment' },
    },
  };
};

// Day-by-day score history, oldest first — never averaged/blended, so a dip on any
// single day stays visible (mirrors the streak's own day-by-day mechanic below).
export const computeDailyScoreHistory = (
  habits, xpLog, logs, commitmentArchive, healthLog, days = 30
) => {
  const history = [];
  for (let i = days - 1; i >= 0; i--) {
    const dateKey = shiftDateKey(getLocalDateKey(0), -i);
    const { score } = computeDailyScore(habits, xpLog, logs, commitmentArchive, healthLog, dateKey);
    history.push({ dateKey, score });
  }
  return history;
};

// Whole-day difference between two YYYY-MM-DD keys (laterKey - earlierKey), via
// local Y/M/D construction — mirrors shiftDateKey, DST-safe.
const daysBetweenKeys = (laterKey, earlierKey) => {
  const [y1, m1, d1] = laterKey.split('-').map(Number);
  const [y2, m2, d2] = earlierKey.split('-').map(Number);
  return Math.round((new Date(y1, m1 - 1, d1) - new Date(y2, m2 - 1, d2)) / 86400000);
};

// Earliest date the user has any tracked activity at all, across every input the
// Daily Score reads from. Used to cap how many consecutive days are REQUIRED to
// hold a rank, so a brand-new or returning user isn't stranded at the bottom tier
// just for lacking history yet (see computeRankStatus below).
const getEarliestActivityKey = (habits, xpLog, logs, commitmentArchive, healthLog) => {
  let earliest = null;
  const consider = (key) => { if (key && (!earliest || key < earliest)) earliest = key; };
  habits.forEach(h => Object.keys(h.history || {}).forEach(consider));
  xpLog.forEach(e => consider(e.date));
  Object.keys(healthLog || {}).forEach(consider);
  Object.keys(logs || {}).forEach(consider);
  commitmentArchive.forEach(a => consider(a.date));
  return earliest;
};

// A day "counts" toward the streak once it clears this score.
export const STREAK_THRESHOLD = 6;

// Consecutive days (ending today) at or above the threshold. Today is counted only
// once it clears the bar, but a below-bar *today* does NOT break the streak — the day
// is still in progress. The streak only breaks on a completed past day that fell short.
export const computeStreak = (
  habits, xpLog, logs, commitmentArchive, healthLog, threshold = STREAK_THRESHOLD
) => {
  const scoreOn = (key) =>
    computeDailyScore(habits, xpLog, logs, commitmentArchive, healthLog, key).score;

  const todayKey = getLocalDateKey(0);
  let streak = 0;
  let cursor = shiftDateKey(todayKey, -1); // start from yesterday (a completed day)
  for (let i = 0; i < 730 && scoreOn(cursor) >= threshold; i++) {
    streak++;
    cursor = shiftDateKey(cursor, -1);
  }
  if (scoreOn(todayKey) >= threshold) streak++; // today already earned it
  return streak;
};

// ─── Rank ─────────────────────────────────────────────────────────────────────
// Rank (see rankMeta.js) is a "maintain" system: to HOLD a tier, the Daily Score
// must clear that tier's own threshold for REQUIRED_STREAK_DAYS consecutive days
// running. Miss the bar once and you instantly fall to whatever tier your current
// streak still supports — fully traceable ("I held Locked In for 8 days," "the
// streak reset yesterday"), unlike a blended average.

export const REQUIRED_STREAK_DAYS = 5;

export const computeRankStatus = (habits, xpLog, logs, commitmentArchive, healthLog) => {
  const earliest = getEarliestActivityKey(habits, xpLog, logs, commitmentArchive, healthLog);
  if (!earliest) return { tier: RANK_TIERS[0], streakDays: 0, nextTier: RANK_TIERS[1], nextTierStreak: 0 };

  const daysTracked = daysBetweenKeys(getLocalDateKey(0), earliest) + 1;
  const requiredDays = Math.max(1, Math.min(REQUIRED_STREAK_DAYS, daysTracked));

  // Tier 0 (Drifting)'s own threshold is 0, which every day — including fabricated
  // pre-history before the user had any data — trivially clears, so computeStreak
  // at threshold 0 returns a phantom-inflated number, not a real day count. Drifting
  // is handled as the explicit floor below instead, using daysTracked (the same
  // real-history cap already used for requiredDays) as its honest streak length.
  let streakAbove = 0;
  for (let i = RANK_TIERS.length - 1; i >= 1; i--) {
    const streak = computeStreak(habits, xpLog, logs, commitmentArchive, healthLog, RANK_TIERS[i].min);
    if (streak >= requiredDays) {
      const nextTier = RANK_TIERS[i + 1] || null;
      return { tier: RANK_TIERS[i], streakDays: streak, nextTier, nextTierStreak: nextTier ? streakAbove : 0 };
    }
    streakAbove = streak;
  }
  return { tier: RANK_TIERS[0], streakDays: daysTracked, nextTier: RANK_TIERS[1], nextTierStreak: streakAbove };
};
