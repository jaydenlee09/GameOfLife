// Shared habit helpers so every surface that toggles a habit (Tasks page, the
// daily check-in) awards exactly the same streak XP — one source of truth, no drift.

export const habitDateStr = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Old habits may carry a single `attribute`; normalise to an array (default Discipline).
export const getHabitAttrs = (habit) =>
  habit.attributes?.length ? habit.attributes : habit.attribute ? [habit.attribute] : ['discipline'];

// Consecutive-day streak ending at dateStr → XP = max(10, round(10 × streak/2)).
export const calcStreakXp = (history, dateStr) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const start = new Date(y, m - 1, d);
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const dd = new Date(start);
    dd.setDate(start.getDate() - i);
    if (history[habitDateStr(dd)]) streak++;
    else break;
  }
  return Math.max(10, Math.round(10 * (streak / 2)));
};

// Current consecutive-day streak. Alive if today OR yesterday is checked, so it
// doesn't drop to zero until a full day has been skipped.
export const getHabitStreak = (habit) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = habitDateStr(today);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const yesterdayStr = habitDateStr(yesterday);

  const hasToday = !!habit.history[todayStr];
  const hasYesterday = !!habit.history[yesterdayStr];
  if (!hasToday && !hasYesterday) return 0;

  let consecutive = 0;
  const startOffset = hasToday ? 0 : 1;
  for (let i = startOffset; i < 365; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    if (habit.history[habitDateStr(d)]) consecutive++;
    else break;
  }
  return Math.max(0, consecutive - 1);
};

// Longest consecutive-day run in the habit's whole history.
export const getHabitBestStreak = (habit) => {
  const dates = Object.keys(habit.history).sort();
  if (dates.length === 0) return 0;
  let best = 1;
  let current = 1;
  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(dates[i - 1]);
    const curr = new Date(dates[i]);
    const diff = (curr - prev) / (1000 * 60 * 60 * 24);
    if (diff === 1) {
      current++;
      if (current > best) best = current;
    } else {
      current = 1;
    }
  }
  return best;
};

export const getHabitTotalCompletions = (habit) => Object.keys(habit.history).length;

// Completions in the last `days` days, inclusive of today.
export const getHabitCompletionsInLastNDays = (habit, days) => {
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - (days - 1));
  return Object.keys(habit.history).filter(dateStr => new Date(dateStr + 'T00:00:00') >= cutoff).length;
};
