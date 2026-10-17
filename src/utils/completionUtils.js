// ─── Completing things (shared XP rules) ──────────────────────────────────────
// Completing a time block or a task is the one place XP gets paid for them. The
// Calendar, the Tasks page and the focus debrief all complete through these, so
// the payout can't differ depending on where you tapped. Pure: each returns the
// XP awards plus a state updater; the caller applies both.

import { expandEventsForDates, isInstanceCompleted } from './calendarUtils';
import { xpForBlockMinutes } from './xpUtils';

const blockMinutes = (ev) => (ev.endHour * 60 + ev.endMin) - (ev.startHour * 60 + ev.startMin);

/**
 * One block instance (as expanded, with `_instanceDate`). XP is earned from the
 * block's scheduled length, split across its attributes. Returns null if done.
 */
export const completeBlock = (ev) => {
  if (!ev || isInstanceCompleted(ev)) return null;
  const attrs = ev.attributes || [];
  const total = xpForBlockMinutes(blockMinutes(ev));
  const each = Math.max(1, Math.floor(total / Math.max(1, attrs.length)));
  const recurring = ev.recurrence && ev.recurrence !== 'none';
  return {
    awards: attrs.map((stat) => ({ stat, amount: each, source: 'calendar', label: ev.title })),
    xp: attrs.length ? each * attrs.length : 0,
    update: (events) => events.map((e) => {
      if (e.id !== ev.id) return e;
      return recurring ? { ...e, completedDates: [...(e.completedDates || []), ev._instanceDate] } : { ...e, completed: true };
    }),
  };
};

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
