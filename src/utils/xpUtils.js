// ─── XP = your Daily Scores, banked ──────────────────────────────────────────
// XP is no longer paid per action. Each day pays round(Daily Score × 10) XP, so a
// 7.4 day is 74 XP and a wasted day is ~0, and every level costs the same 500 XP
// (about a week of 7/10 days). Level therefore counts good days, and any point of
// it can be traced to the day that earned it.
//
// Finished days are BANKED ({ dateKey: xp }). The xpLog the score reads tasks from
// is capped at 500 entries, so scoring old days live would slowly lose their task
// credit and shrink your XP. Instead, the last XP_LIVE_DAYS days stay live (late
// block check-ins and past-log edits still count) and older days are frozen once
// banked. Today is always live and never banked.

import { computeDailyScore, getEarliestActivityKey, shiftDateKey } from './scoreUtils';

export const XP_PER_POINT = 10;
export const XP_PER_LEVEL = 500;
export const XP_LIVE_DAYS = 7;
// What a "solid day" pays, for the "days to next level" estimate.
export const SOLID_DAY_SCORE = 7;

export const xpForScore = (score) => Math.round((Number(score) || 0) * XP_PER_POINT);

export const levelForXp = (total) => ({
  level: Math.floor(total / XP_PER_LEVEL) + 1,
  into: total % XP_PER_LEVEL,
  cap: XP_PER_LEVEL,
});

/**
 * Bring the bank up to date for every finished day (earliest activity → yesterday).
 * Banked days older than the live window are left alone; everything else is scored.
 * Returns the SAME object when nothing changed, so callers can compare by reference.
 */
export const updateXpBank = (inputs, bank, todayKey) => {
  const current = bank || {};
  const earliest = getEarliestActivityKey(inputs);
  if (!earliest || earliest >= todayKey) return current;
  const liveFrom = shiftDateKey(todayKey, -XP_LIVE_DAYS);
  let next = null;
  for (let key = earliest; key < todayKey; key = shiftDateKey(key, 1)) {
    if (key < liveFrom && key in current) continue;
    const xp = xpForScore(computeDailyScore(inputs, key).score);
    if (current[key] !== xp) {
      if (!next) next = { ...current };
      next[key] = xp;
    }
  }
  return next || current;
};

/**
 * Every day's XP, oldest first: banked days before today, then today (live).
 * Each entry is { dateKey, xp, today }.
 */
export const getXpSeries = (bank, todayKey, todayScore) => {
  const past = Object.entries(bank || {})
    .filter(([k]) => k < todayKey)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([dateKey, xp]) => ({ dateKey, xp, today: false }));
  return [...past, { dateKey: todayKey, xp: xpForScore(todayScore), today: true }];
};

/** Totals for display (from getXpSeries): level, progress into it, today's share, days to the next level. */
export const getXpStatus = (series) => {
  const total = series.reduce((s, d) => s + d.xp, 0);
  const todayXp = series[series.length - 1].xp;
  const { level, into, cap } = levelForXp(total);
  const solidXp = xpForScore(SOLID_DAY_SCORE);
  return {
    total,
    level,
    into,
    cap,
    todayXp,
    // Today's XP that sits inside the current level's bar (all of it, unless today crossed a level).
    todayInLevel: Math.min(todayXp, into),
    daysToNext: Math.ceil((cap - into) / solidXp),
    daysTracked: series.filter(d => !d.today).length + 1,
  };
};

/**
 * The days whose XP filled `level` (from reaching level-1 to reaching `level`),
 * oldest first, each with its share counted in full. Used by the level-up card.
 */
export const daysThatBuiltLevel = (series, level) => {
  const start = (level - 2) * XP_PER_LEVEL; // XP where level-1 began
  const end = (level - 1) * XP_PER_LEVEL;   // XP where `level` began
  const out = [];
  let before = 0;
  for (const d of series) {
    const after = before + d.xp;
    if (d.xp > 0 && after > start && before < end) out.push(d);
    before = after;
  }
  return out;
};

// The amounts below are what an activity event records in the xpLog (the activity
// log Daily Score counts tasks from). They no longer move XP or level.

/** Activity amount for a focus session: 1 per minute focused. */
export const xpForFocusMinutes = (mins) => Math.max(1, Math.round(mins));

/** Activity amount for a completed time block: 1 per scheduled minute. */
export const xpForBlockMinutes = (mins) => Math.max(1, Math.round(mins));
