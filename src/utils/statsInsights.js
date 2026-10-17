import { computeDailyScore, getEarliestActivityKey, getLocalDateKey, shiftDateKey, STREAK_THRESHOLD } from './scoreUtils';
import { computeStatsForDays, STAT_ITEMS } from './weekStatsUtils';

// Statistics page insights. Everything here is plain Daily Score math, never AI:
// day-by-day and traceable, so every number can be checked against a single day.

// The five Daily Score components, in the order the formula weights them. `weight`
// is the share of the 10-point score the component can contribute. `color` is the
// stacked-trend series color (validated categorical slots, dark surface).
export const SCORE_COMPONENTS = [
  { key: 'habits',     label: 'Habits',     weight: 0.3, color: '#3987e5', page: 'daily-log', fix: 'Open habits' },
  { key: 'tasks',      label: 'Tasks',      weight: 0.3, color: '#d95926', page: 'tasks',     fix: 'Open tasks' },
  { key: 'sleep',      label: 'Sleep',      weight: 0.2, color: '#199e70', page: 'daily-log', fix: 'Log sleep' },
  { key: 'log',        label: 'Daily Log',  weight: 0.1, color: '#c98500', page: 'daily-log', fix: 'Open Daily Log' },
  { key: 'commitment', label: 'Commitment', weight: 0.1, color: '#d55181', page: 'daily-log', fix: 'Set a commitment' },
];

const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
// Fewer finished days than this in the current week and the leak looks back 14 days,
// so a Monday morning isn't judged on a single day.
const MIN_WEEK_DAYS = 3;
const FALLBACK_DAYS = 14;

const round1 = (n) => Math.round(n * 10) / 10;

// Monday of the week containing `dateKey` (local, DST-safe via shiftDateKey).
export const getMondayOf = (dateKey) => {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dow = new Date(y, m - 1, d).getDay(); // 0 = Sun
  return shiftDateKey(dateKey, dow === 0 ? -6 : 1 - dow);
};

const daysFrom = (startKey, count) =>
  Array.from({ length: count }, (_, i) => shiftDateKey(startKey, i));

const scoreDay = (data, dateKey) =>
  computeDailyScore(data.habits || [], data.xpLog || [], data.logs || {}, data.commitmentArchive || [], data.healthLog || {}, dateKey);

/**
 * This week, Mon-Sun, one entry per day. A day "clears" at STREAK_THRESHOLD, the same
 * bar the streak uses. Today is 'today' until it clears (still in progress, not a miss),
 * and days before any tracked activity at all are 'before', not misses.
 */
export const getWeekVerdict = (data, todayKey = getLocalDateKey(0)) => {
  const monday = getMondayOf(todayKey);
  const earliest = getEarliestActivityKey(data.habits || [], data.xpLog || [], data.logs || {}, data.commitmentArchive || [], data.healthLog || {});
  const days = daysFrom(monday, 7).map((dateKey, i) => {
    const isFuture = dateKey > todayKey;
    const score = isFuture ? null : scoreDay(data, dateKey).score;
    const cleared = score != null && score >= STREAK_THRESHOLD;
    const status = isFuture ? 'future'
      : cleared ? 'cleared'
      : dateKey === todayKey ? 'today'
      : (!earliest || dateKey < earliest) ? 'before'
      : 'missed';
    return { dateKey, letter: WEEKDAY_LETTERS[i], score, status };
  });
  const lastWeekCleared = daysFrom(shiftDateKey(monday, -7), 7)
    .filter((k) => scoreDay(data, k).score >= STREAK_THRESHOLD).length;
  return {
    days,
    cleared: days.filter((d) => d.status === 'cleared').length,
    lastWeekCleared,
    threshold: STREAK_THRESHOLD,
  };
};

// The habit missed on the most days in the window (ties: first in list order).
const mostMissedHabit = (habits, dayKeys) => {
  let worst = null;
  for (const h of habits) {
    const done = dayKeys.filter((k) => h.history?.[k]).length;
    if (done < dayKeys.length && (!worst || done < worst.done)) worst = { name: h.name, done };
  }
  return worst;
};

const evidenceFor = (key, { full, n, dayKeys, data, breakdowns }) => {
  switch (key) {
    case 'habits': {
      const habits = data.habits || [];
      if (habits.length === 0) return 'No habits set up yet';
      const worst = mostMissedHabit(habits, dayKeys);
      const base = `Every habit done on ${full} of ${n} days`;
      return worst?.name ? `${base}. Most missed: ${worst.name} (${worst.done}/${n})` : base;
    }
    case 'tasks':
      return `3+ tasks done on ${full} of ${n} days`;
    case 'sleep': {
      const unlogged = breakdowns.filter((b) => b.sleep.label === 'Sleep not logged').length;
      const base = `Over 9h on ${full} of ${n} nights`;
      return unlogged > 0 ? `${base}, ${unlogged} not logged` : base;
    }
    case 'log':
      return `Daily Log filled on ${full} of ${n} days`;
    case 'commitment': {
      const none = breakdowns.filter((b) => b.commitment.label === 'No commitment').length;
      const base = `Commitment kept on ${full} of ${n} days`;
      return none > 0 ? `${base}, ${none} with none set` : base;
    }
    default:
      return '';
  }
};

/**
 * Where the Daily Score lost points, per component, over finished days only (today
 * is still in progress). Window: this week's finished days, or the last 14 finished
 * days when the week is too young. `lost` is in Daily Score points, summed across
 * days: (10 - component value) x weight, so a missed 9h night costs exactly 2.0.
 */
export const getScoreLeaks = (data, todayKey = getLocalDateKey(0)) => {
  const yesterday = shiftDateKey(todayKey, -1);
  const monday = getMondayOf(todayKey);
  const weekFinished = monday <= yesterday ? daysFrom(monday, 7).filter((k) => k <= yesterday) : [];
  const useWeek = weekFinished.length >= MIN_WEEK_DAYS;
  const dayKeys = useWeek ? weekFinished : daysFrom(shiftDateKey(yesterday, -(FALLBACK_DAYS - 1)), FALLBACK_DAYS);
  const windowLabel = useWeek ? 'this week' : `in the last ${FALLBACK_DAYS} days`;

  const scored = dayKeys.map((k) => scoreDay(data, k));
  const breakdowns = scored.map((s) => s.breakdown);
  const n = dayKeys.length;
  const empty = scored.every((s) => s.score === 0);

  const components = SCORE_COMPONENTS.map((c) => {
    const values = breakdowns.map((b) => b[c.key].value);
    const lost = round1(values.reduce((sum, v) => sum + (10 - v) * c.weight, 0));
    const full = values.filter((v) => v === 10).length;
    return {
      ...c,
      lost,
      full,
      evidence: evidenceFor(c.key, { full, n, dayKeys, data, breakdowns }),
    };
  });

  // Stable sort keeps formula order on ties, so equal losses favor the heavier weight.
  const leaks = components.filter((c) => c.lost > 0).sort((a, b) => b.lost - a.lost);
  const biggest = leaks[0] || null;

  // Strength: the component at full marks on the most days, at least half of them,
  // and never the same thing we just called the biggest leak.
  const strength = components
    .filter((c) => c.key !== biggest?.key && c.full * 2 >= n && c.full > 0)
    .sort((a, b) => b.full - a.full)[0] || null;

  return { windowLabel, days: n, empty, components, leaks, biggest, strength };
};

const DELTA_KEYS = ['tasksCompleted', 'habitsCompleted', 'focusMinutes', 'avgSleep', 'workouts'];

/**
 * This week so far (Mon..today) vs the same weekdays last week, so a Wednesday is
 * never compared against a whole finished week.
 */
export const getWeekDeltas = (data, todayKey = getLocalDateKey(0)) => {
  const monday = getMondayOf(todayKey);
  const thisDays = daysFrom(monday, 7).filter((k) => k <= todayKey);
  const lastDays = thisDays.map((k) => shiftDateKey(k, -7));
  const args = [data.xpLog || [], data.pomodoroSessions || [], data.habits || [], data.todos || [], data.logs || {}, data.goals || [], data.healthLog || {}];
  const now = computeStatsForDays(thisDays, ...args);
  const prev = computeStatsForDays(lastDays, ...args);

  return DELTA_KEYS.map((key) => {
    const item = STAT_ITEMS.find((s) => s.key === key);
    const value = now[key];
    const before = prev[key];
    // Average sleep only compares when both weeks actually have sleep logged.
    const comparable = key !== 'avgSleep' || (value > 0 && before > 0);
    const delta = comparable ? (key === 'avgSleep' ? round1(value - before) : value - before) : null;
    return { key, label: item.label, Icon: item.Icon, fmt: item.fmt, value, before, delta };
  });
};
