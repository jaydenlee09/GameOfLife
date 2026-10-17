// ─── Completing things (shared XP rules) ──────────────────────────────────────
// Completing a time block or a task is the one place XP gets paid for them. The
// Calendar, the Tasks page and the focus debrief all complete through these, so
// the payout can't differ depending on where you tapped. Pure: each returns the
// XP awards plus a state updater; the caller applies both.

import { expandEventsForDates, getBlockOutcome } from './calendarUtils';
import { xpForBlockMinutes } from './xpUtils';

const blockMinutes = (ev) => (ev.endHour * 60 + ev.endMin) - (ev.startHour * 60 + ev.startMin);

const CHECKIN_STATUSES = ['done', 'partly', 'skipped'];

/**
 * Answer how a block instance (as expanded, with `_instanceDate`) went. XP is earned
 * from the block's scheduled length, split across its attributes: done pays it all,
 * partly half, skipped nothing. Partly can be raised to done later (pays the rest)
 * and skipped can be re-answered; done is final, and partly can't be lowered, so XP
 * is never taken back. Returns null when the answer changes nothing. `taskId` is
 * set when a task block is marked done, so the caller completes that task too.
 */
export const checkInBlock = (ev, status, { reason = null, now = Date.now() } = {}) => {
  if (!ev || !CHECKIN_STATUSES.includes(status)) return null;
  const prev = getBlockOutcome(ev)?.status || null;
  if (prev === status || prev === 'done' || (prev === 'partly' && status !== 'done')) return null;

  const attrs = ev.attributes || [];
  const each = Math.max(1, Math.floor(xpForBlockMinutes(blockMinutes(ev)) / Math.max(1, attrs.length)));
  const half = Math.max(1, Math.floor(each / 2));
  const pay = status === 'done' ? (prev === 'partly' ? each - half : each)
    : status === 'partly' ? half : 0;

  const outcome = { status, ...(status === 'skipped' && reason ? { reason } : {}), at: now };
  const closes = status !== 'skipped';
  const date = ev._instanceDate || ev.date;
  const recurring = ev.recurrence && ev.recurrence !== 'none';
  return {
    awards: pay > 0 ? attrs.map((stat) => ({ stat, amount: pay, source: 'calendar', label: ev.title })) : [],
    xp: pay > 0 ? pay * attrs.length : 0,
    taskId: status === 'done' ? ev.plan?.taskId ?? null : null,
    update: (events) => events.map((e) => {
      if (e.id !== ev.id) return e;
      if (!recurring) return { ...e, outcome, completed: closes };
      const dates = e.completedDates || [];
      return {
        ...e,
        outcomes: { ...e.outcomes, [date]: outcome },
        completedDates: closes && !dates.includes(date) ? [...dates, date] : dates,
      };
    }),
  };
};

/** Marking a block done (the grid's check, the focus debrief). Returns null if already done. */
export const completeBlock = (ev, opts) => checkInBlock(ev, 'done', opts);

/**
 * One task. XP is the task's own (timeframe-based) amount split across its
 * categories. The task stays in the list as completed (Tasks shows "Done today",
 * goal progress counts goal-linked ones); taskUtils.pruneDoneTasks clears old
 * ones. Awards share `ref` (the task id) so the completion counts once, not once
 * per stat; only the first is the counted one. Returns null if already done.
 */
export const completeTask = (task, now = Date.now()) => {
  if (!task || task.completed) return null;
  const cats = task.categories || (task.category ? [task.category] : []);
  const each = cats.length ? Math.floor(task.xp / cats.length) : 0;
  return {
    awards: cats.map((stat, i) => ({ stat, amount: each, source: 'task', label: task.text, ref: task.id, repeat: i > 0 })),
    xp: each * cats.length,
    categories: cats,
    update: (todos) => todos.map((t) => (t.id === task.id ? { ...t, completed: true, completedAt: now } : t)),
  };
};

/** The instance of block `id` on `dateKey` (recurring blocks expand per date), or null. */
export const findBlockInstance = (calendarEvents, id, dateKey) => {
  if (id == null || !dateKey) return null;
  return expandEventsForDates(calendarEvents || [], [dateKey]).find((ev) => String(ev.id) === String(id)) || null;
};
