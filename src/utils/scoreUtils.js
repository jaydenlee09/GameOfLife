// ─── Daily Score & Streak ─────────────────────────────────────────────────────
// The Daily Score is the app's honest headline signal: a 0–10 number COMPUTED
// from what the user actually did (habits/tasks/sleep/log/commitment). Unlike XP,
// it can't be self-assigned. It powers both the Home hero and the character sheet,
// and — because every input is date-keyed — it can be computed for any past day,
// which is what makes the streak possible.

import RANK_TIERS from './rankMeta';
import { countTaskCompletions } from './taskUtils';
import { getPlanKept, PLAN_KEPT_START } from './calendarUtils';

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

// Weights in percent. Days from PLAN_KEPT_START on also score how well that day's
// time blocks were kept; earlier days keep the formula they were scored with, so
// history (and the streak and rank built on it) never shifts under you.
const WEIGHTS = { habits: 30, tasks: 30, sleep: 20, log: 10, commitment: 10 };
const WEIGHTS_WITH_PLAN = { habits: 25, tasks: 25, plan: 10, sleep: 20, log: 10, commitment: 10 };
export const scoreWeights = (dateKey) => (dateKey >= PLAN_KEPT_START ? WEIGHTS_WITH_PLAN : WEIGHTS);

const planLabel = (kept) => {
  if (!kept.total) return 'No blocks planned';
  const topReason = Object.entries(kept.reasons).sort((x, y) => y[1] - x[1])[0]?.[0];
  return [
    `${kept.done}/${kept.total} block${kept.total !== 1 ? 's' : ''} done`,
    kept.partly ? `${kept.partly} partly` : null,
    kept.skipped ? `${kept.skipped} skipped${topReason ? ` (${topReason})` : ''}` : null,
  ].filter(Boolean).join(' · ');
};

// Score for a single day. `inputs` is any object carrying { habits, xpLog, logs,
// commitmentArchive, healthLog, calendarEvents } (app state works as is; missing ones
// count as empty). `dateKey` defaults to today; pass a past key to score history.
export const computeDailyScore = (inputs, dateKey = getLocalDateKey(0)) => {
  if (!inputs || Array.isArray(inputs)) throw new TypeError('computeDailyScore takes an inputs object');
  const habits = inputs.habits || [];
  const xpLog = inputs.xpLog || [];
  const logs = inputs.logs || {};
  const commitmentArchive = inputs.commitmentArchive || [];
  const healthLog = inputs.healthLog || {};
  const calendarEvents = inputs.calendarEvents || [];
  const prevKey = shiftDateKey(dateKey, -1);
  const weights = scoreWeights(dateKey);

  // Habits: completed on this day / total
  const habitsTotal = habits.length;
  const habitsDone  = habits.filter(h => h.history?.[dateKey]).length;
  const habitScore  = habitsTotal > 0 ? (habitsDone / habitsTotal) * 10 : 0;

  // Tasks: tasks completed on this day, once each (3 = full score)
  const tasksDone   = countTaskCompletions(xpLog, dateKey);
  const taskScore   = Math.min(tasksDone / 3, 1) * 10;

  // Plan kept: share of the day's time blocks done (partly = half). No blocks = 0.
  const kept        = weights.plan ? getPlanKept(calendarEvents, dateKey) : null;
  const planScore   = kept?.total ? (kept.credit / kept.total) * 10 : 0;

  // Sleep: logged and over 9h = full score
  const sleepHours  = healthLog?.[dateKey]?.sleepHours;
  const sleepLogged = sleepHours != null;
  const sleepScore  = sleepLogged && sleepHours > 9 ? 10 : 0;

  // Daily log filled?
  const dayLog      = logs?.[dateKey];
  const logFilled   = dayLog && ((dayLog.emotions?.length > 0) || dayLog.proud?.some(p => p?.trim()));
  const logScore    = logFilled ? 10 : 0;

  // Commitment: was the prior day's commitment kept?
  const lastCommit  = commitmentArchive.find(a => a.date === prevKey);
  const commitScore = lastCommit?.denied === false || (lastCommit?.confirmedOn && lastCommit.denied !== true) ? 10 : 0;

  const values = { habits: habitScore, tasks: taskScore, plan: planScore, sleep: sleepScore, log: logScore, commitment: commitScore };
  const raw = Object.entries(weights).reduce((sum, [key, w]) => sum + values[key] * (w / 100), 0);
  const r1 = (n) => Math.round(n * 10) / 10;
  const breakdown = {
    habits:     { value: r1(habitScore), weight: weights.habits, label: `${habitsDone}/${habitsTotal} habits` },
    tasks:      { value: r1(taskScore),  weight: weights.tasks,  label: `${tasksDone} task${tasksDone !== 1 ? 's' : ''} done` },
    ...(kept ? { plan: { value: r1(planScore), weight: weights.plan, label: planLabel(kept), kept } } : {}),
    sleep:      { value: sleepScore, weight: weights.sleep, label: sleepLogged ? `${Math.round(sleepHours * 10) / 10}h sleep` : 'Sleep not logged' },
    log:        { value: logScore,   weight: weights.log,   label: logFilled ? 'Log filled' : 'Log empty' },
    commitment: {
      value: commitScore,
      weight: weights.commitment,
      label: !lastCommit ? 'No commitment'
        : commitScore > 0 ? 'Commitment kept'
          : lastCommit.denied === true ? 'Commitment missed' : 'Not marked yet',
    },
  };
  return { score: r1(raw), breakdown };
};

// Shared traffic-light color for a 0-10 Daily Score, so every surface that shows
// one (Home hero, character sheet, sidebar chip) grades it identically.
export const scoreColor = (score) =>
  score >= 8 ? '#30d158' : score >= 5 ? '#ff9f0a' : '#ff453a';

// Day-by-day score history, oldest first — never averaged/blended, so a dip on any
// single day stays visible (mirrors the streak's own day-by-day mechanic below).
export const computeDailyScoreHistory = (inputs, days = 30) => {
  const history = [];
  for (let i = days - 1; i >= 0; i--) {
    const dateKey = shiftDateKey(getLocalDateKey(0), -i);
    const { score } = computeDailyScore(inputs, dateKey);
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
export const getEarliestActivityKey = (inputs) => {
  const habits = inputs.habits || [];
  const xpLog = inputs.xpLog || [];
  const commitmentArchive = inputs.commitmentArchive || [];
  const { logs, healthLog } = inputs;
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
export const computeStreak = (inputs, threshold = STREAK_THRESHOLD) => {
  const scoreOn = (key) => computeDailyScore(inputs, key).score;

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

export const computeRankStatus = (inputs) => {
  const earliest = getEarliestActivityKey(inputs);
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
    const streak = computeStreak(inputs, RANK_TIERS[i].min);
    if (streak >= requiredDays) {
      const nextTier = RANK_TIERS[i + 1] || null;
      return { tier: RANK_TIERS[i], streakDays: streak, nextTier, nextTierStreak: nextTier ? streakAbove : 0 };
    }
    streakAbove = streak;
  }
  return { tier: RANK_TIERS[0], streakDays: daysTracked, nextTier: RANK_TIERS[1], nextTierStreak: streakAbove };
};
