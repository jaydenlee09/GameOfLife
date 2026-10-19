// ─── Tasks: what's on today, what's stale, what got done ──────────────────────
// Pure helpers shared by the Tasks page, the Home tile, the morning push and the
// assistant, so "today's tasks" means the same thing everywhere. Dates are local
// YYYY-MM-DD keys; nothing here reads the clock unless a key isn't passed in.
//
// Task fields this file reads (all optional except text/timeFrame):
//   scheduledDate  day a day-task is for (null = the day it was added)
//   plannedFor     a week/month/year task pulled into a specific day
//   topDate        the day it was starred into that day's Top 3
//   dueDate        hard deadline
//   createdAt / completedAt  ms timestamps (old tasks: id is Date.now() at creation)

import { plannedTaskIds } from './calendarUtils';

export const TOP_LIMIT = 3;
// Finished tasks stay visible ("Done today") for a week, then get pruned.
export const DONE_KEEP_DAYS = 7;

export const XP_BY_TIMEFRAME = {
  today: 20,
  'this-week': 50,
  'this-month': 100,
  'this-year': 500,
};

export const TIMEFRAME_LABELS = {
  today: 'Today',
  'this-week': 'This week',
  'this-month': 'This month',
  'this-year': 'This year',
};

// Own date helpers (same as scoreUtils') so scoreUtils can import this file.
const pad = (n) => String(n).padStart(2, '0');
const keyOfDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const dateKeyOf = (ms) => keyOfDate(new Date(ms));
const getLocalDateKey = (offsetDays = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return keyOfDate(d);
};
export const shiftDateKey = (dateKey, offsetDays) => {
  const [y, m, d] = dateKey.split('-').map(Number);
  return keyOfDate(new Date(y, m - 1, d + offsetDays));
};
export const todayKey = () => getLocalDateKey(0);

const daysBetween = (fromKey, toKey) => {
  const [y1, m1, d1] = fromKey.split('-').map(Number);
  const [y2, m2, d2] = toKey.split('-').map(Number);
  return Math.round((new Date(y2, m2 - 1, d2) - new Date(y1, m1 - 1, d1)) / 86_400_000);
};

/** When the task was created (ms), falling back to its Date.now()-based id. */
export const createdAtOf = (t) => {
  if (Number.isFinite(t?.createdAt)) return t.createdAt;
  const id = Number(t?.id);
  return Number.isFinite(id) && id > 1e12 ? id : null;
};

/** A one-day task ('tomorrow' is a legacy timeframe the midnight rollover promotes). */
export const isDayTask = (t) => !t.timeFrame || t.timeFrame === 'today' || t.timeFrame === 'tomorrow';

/** The day a day-task is meant for. */
export const taskDayKey = (t) => {
  if (t.scheduledDate) return t.scheduledDate;
  const created = createdAtOf(t);
  return created ? dateKeyOf(created) : null;
};

/** Whole days an open day-task has been sitting past the day it was meant for. */
export const carriedDays = (t, today = getLocalDateKey(0)) => {
  if (t.completed || !isDayTask(t)) return 0;
  const day = taskDayKey(t);
  return day && day < today ? daysBetween(day, today) : 0;
};

export const isTop = (t, today = getLocalDateKey(0)) => t.topDate === today;

/** Days until the due date (negative = overdue), or null without one. */
export const dueInDays = (t, today = getLocalDateKey(0)) => (t.dueDate ? daysBetween(today, t.dueDate) : null);

/** Goal-linked week/month/year tasks only count for the goal's current period. */
const inCurrentPeriod = (t, periodKeys) => {
  if (!t.goalPeriodKey) return true;
  return t.goalPeriodKey === periodKeys[t.timeFrame];
};

export const currentPeriodKeys = (today = getLocalDateKey(0)) => {
  const [y, m, d] = today.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const dow = dt.getDay();
  const monday = shiftDateKey(today, dow === 0 ? -6 : 1 - dow);
  return { 'this-week': monday, 'this-month': `${y}-${pad(m)}`, 'this-year': String(y) };
};

/** On today's list: due by today, set for today, pulled into today, or starred today. */
export const isOnToday = (t, today = getLocalDateKey(0)) => {
  if (t.completed) return false;
  if (t.topDate === today || t.plannedFor === today) return true;
  const pushedLater = !!t.scheduledDate && t.scheduledDate > today;
  // A deadline pulls a task onto today, unless you deliberately pushed it to a later day.
  if (t.dueDate && t.dueDate <= today && !pushedLater) return true;
  if (isDayTask(t)) {
    if (t.timeFrame === 'tomorrow') return false; // promoted at midnight
    return !pushedLater;
  }
  return false;
};

/** Sort: overdue / due soonest first, then oldest first. */
const byUrgency = (today) => (a, b) => {
  const da = dueInDays(a, today);
  const db = dueInDays(b, today);
  if (da != null || db != null) {
    if (da == null) return 1;
    if (db == null) return -1;
    if (da !== db) return da - db;
  }
  return (createdAtOf(a) || 0) - (createdAtOf(b) || 0);
};

/**
 * Every open/finished task sorted into the page's sections. Each task lands in
 * exactly one of: top, carried, today, upcoming, later (open) or doneToday.
 */
export const bucketTasks = (todos, today = getLocalDateKey(0)) => {
  const periodKeys = currentPeriodKeys(today);
  const out = { top: [], carried: [], today: [], upcoming: [], later: { 'this-week': [], 'this-month': [], 'this-year': [] }, doneToday: [] };

  for (const t of todos || []) {
    if (t.completed) {
      if (t.completedAt && dateKeyOf(t.completedAt) === today) out.doneToday.push(t);
      continue;
    }
    if (isOnToday(t, today)) {
      if (isTop(t, today)) out.top.push(t);
      else if (carriedDays(t, today) > 0) out.carried.push(t);
      else out.today.push(t);
    } else if (isDayTask(t)) {
      out.upcoming.push(t);
    } else if (out.later[t.timeFrame] && inCurrentPeriod(t, periodKeys)) {
      out.later[t.timeFrame].push(t);
    }
  }

  const urgent = byUrgency(today);
  out.top.sort((a, b) => (a.topAt || 0) - (b.topAt || 0));
  out.carried.sort((a, b) => carriedDays(b, today) - carriedDays(a, today) || urgent(a, b));
  out.today.sort(urgent);
  out.upcoming.sort((a, b) => (upcomingKey(a) || '').localeCompare(upcomingKey(b) || '') || urgent(a, b));
  Object.values(out.later).forEach((list) => list.sort(urgent));
  out.doneToday.sort((a, b) => b.completedAt - a.completedAt);
  return out;
};

/** The future day an upcoming day-task lands on ('tomorrow' legacy → day after creation). */
export const upcomingKey = (t) => {
  if (t.scheduledDate) return t.scheduledDate;
  if (t.timeFrame === 'tomorrow') {
    const created = createdAtOf(t);
    return created ? shiftDateKey(dateKeyOf(created), 1) : null;
  }
  return taskDayKey(t);
};

/** Today's open tasks in the order the user should do them: Top 3, then the rest. */
export const todayQueue = (todos, today = getLocalDateKey(0)) => {
  const b = bucketTasks(todos, today);
  return [...b.top, ...b.carried, ...b.today];
};

/** Drop finished non-goal tasks older than DONE_KEEP_DAYS (goal progress counts its own). */
export const pruneDoneTasks = (todos, today = getLocalDateKey(0)) => {
  const cutoff = shiftDateKey(today, -DONE_KEEP_DAYS);
  const next = todos.filter((t) => !(t.completed && t.goalId == null && (!t.completedAt || dateKeyOf(t.completedAt) < cutoff)));
  return next.length === todos.length ? todos : next;
};

/**
 * Tasks completed, counted once per task. Before attributes were removed a task
 * logged one xpLog event per stat, sharing a `ref` (the task id); events from
 * before `ref` existed are grouped by day + label instead.
 */
export const countTaskCompletions = (xpLog, dateKeys) => {
  const days = dateKeys == null ? null : new Set([].concat(dateKeys));
  const seen = new Set();
  for (const e of xpLog || []) {
    if (e.source !== 'task' || (days && !days.has(e.date))) continue;
    seen.add(e.ref != null ? `ref:${e.ref}` : `${e.date}|${e.label}`);
  }
  return seen.size;
};

/** Labels of tasks completed on `dateKey`, once each. */
export const taskLabelsCompletedOn = (xpLog, dateKey) => {
  const seen = new Map();
  for (const e of xpLog || []) {
    if (e.source !== 'task' || e.date !== dateKey) continue;
    const k = e.ref != null ? `ref:${e.ref}` : `${e.date}|${e.label}`;
    if (!seen.has(k)) seen.set(k, e.label);
  }
  return [...seen.values()].filter(Boolean);
};

// ─── Labels ───────────────────────────────────────────────────────────────────
const fromKey = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** "Today", "Tomorrow", "Wednesday" (this week), else "Mon, Oct 26". */
export const dayLabel = (key, today = getLocalDateKey(0)) => {
  const diff = daysBetween(today, key);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1 && diff < 7) return fromKey(key).toLocaleDateString(undefined, { weekday: 'long' });
  return fromKey(key).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
};

/** Due-date chip: { text, tone: 'danger' | 'warning' | null }, or null. */
export const dueLabel = (t, today = getLocalDateKey(0)) => {
  const d = dueInDays(t, today);
  if (d == null) return null;
  if (d < 0) return { text: `Overdue ${-d}d`, tone: 'danger' };
  if (d === 0) return { text: 'Due today', tone: 'warning' };
  if (d === 1) return { text: 'Due tomorrow', tone: 'warning' };
  if (d < 7) return { text: `Due ${fromKey(t.dueDate).toLocaleDateString(undefined, { weekday: 'short' })}`, tone: null };
  return { text: `Due ${fromKey(t.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`, tone: null };
};

/** "From yesterday" / "4 days old" for a carried-over task, else null. */
export const carriedLabel = (t, today = getLocalDateKey(0)) => {
  const n = carriedDays(t, today);
  if (!n) return null;
  return n === 1 ? 'From yesterday' : `${n} days old`;
};

/** Subtitle for a Later group: when the period ends. */
export const periodLabel = (timeFrame, today = getLocalDateKey(0)) => {
  const keys = currentPeriodKeys(today);
  if (timeFrame === 'this-week') return `Ends ${dayLabel(shiftDateKey(keys['this-week'], 6), today)}`;
  if (timeFrame === 'this-month') return fromKey(`${keys['this-month']}-01`).toLocaleDateString(undefined, { month: 'long' });
  if (timeFrame === 'this-year') return keys['this-year'];
  return '';
};

// ─── Edits (each returns the fields to patch) ─────────────────────────────────
/** Put a task on today's list without changing what kind of task it is. */
export const bringToTodayFields = (t, today = getLocalDateKey(0)) => (isDayTask(t)
  ? { timeFrame: 'today', scheduledDate: today }
  : { plannedFor: today });

/**
 * Move a task to `when`: 'today' | 'tomorrow' | a date key | a Later timeframe.
 * Day moves clear a stale star; XP follows the timeframe, as at creation.
 */
export const whenFields = (when, today = getLocalDateKey(0)) => {
  if (XP_BY_TIMEFRAME[when] && when !== 'today') {
    return { timeFrame: when, xp: XP_BY_TIMEFRAME[when], scheduledDate: null, plannedFor: null };
  }
  const day = when === 'today' ? today : when === 'tomorrow' ? shiftDateKey(today, 1) : when;
  return { timeFrame: 'today', xp: XP_BY_TIMEFRAME.today, scheduledDate: day, plannedFor: null, ...(day !== today ? { topDate: null } : {}) };
};

/** Which "when" chip a task currently matches. */
export const whenOf = (t, today = getLocalDateKey(0)) => {
  if (!isDayTask(t)) return t.timeFrame;
  const day = t.timeFrame === 'tomorrow' ? upcomingKey(t) : (t.scheduledDate && t.scheduledDate > today ? t.scheduledDate : today);
  if (day === today) return 'today';
  if (day === shiftDateKey(today, 1)) return 'tomorrow';
  return day;
};

/** A new task. `when` as in whenFields. */
export const makeTask = ({ text, when = 'today', top = false, now = Date.now() }, today = getLocalDateKey(0)) => {
  const placed = whenFields(when, today);
  // A star means "today": a task for a later day can't take one yet.
  const starred = top && !(placed.timeFrame === 'today' && placed.scheduledDate !== today);
  return {
    id: now,
    createdAt: now,
    text,
    ...placed,
    // A plain "today" task needs no date: it belongs to the day it was added.
    scheduledDate: placed.scheduledDate === today ? null : placed.scheduledDate,
    completed: false,
    notes: '',
    subtasks: [],
    dueDate: null,
    ...(starred ? { topDate: today, topAt: now } : { topDate: null }),
  };
};

/** Legacy 'tomorrow' tasks → today-tasks scheduled for the day after they were added. */
export const migrateLegacyTomorrow = (todos, today = getLocalDateKey(0)) => {
  if (!todos.some((t) => t.timeFrame === 'tomorrow')) return todos;
  return todos.map((t) => {
    if (t.timeFrame !== 'tomorrow') return t;
    const day = upcomingKey(t);
    return { ...t, timeFrame: 'today', xp: XP_BY_TIMEFRAME.today, scheduledDate: day && day > today ? day : null };
  });
};

/**
 * This week's open tasks that don't have a time block yet (today or in the week
 * ahead, so one dragged onto tomorrow counts as placed), for the Calendar's tray:
 * `top` + `rest` are today's queue (Top 3, then carried and today's); `upcoming` is
 * the next six days as [{ dateKey, tasks }], each day-task on its own day and a
 * week/month/year task on its due date.
 */
export const getUnscheduledTasks = (todos, calendarEvents, today = getLocalDateKey(0)) => {
  const week = Array.from({ length: 7 }, (_, i) => shiftDateKey(today, i));
  const planned = plannedTaskIds(calendarEvents, week);
  const open = (t) => !planned.has(String(t.id));
  const b = bucketTasks(todos || [], today);
  const later = Object.values(b.later).flat();
  const upcoming = week.slice(1)
    .map((dateKey) => ({
      dateKey,
      tasks: [
        ...b.upcoming.filter((t) => upcomingKey(t) === dateKey),
        ...later.filter((t) => t.dueDate === dateKey),
      ].filter(open),
    }))
    .filter((day) => day.tasks.length);
  return { top: b.top.filter(open), rest: [...b.carried, ...b.today].filter(open), upcoming };
};
