// Pure, state-free helpers for expanding stored calendar events/blocks
// (including daily/weekly recurrence and exception dates) into concrete
// per-date instances. Shared by CalendarPage and WelcomePage.

export const toDateKey = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const parseDateKey = (dateKey) => {
  const [y, m, d] = String(dateKey || '').split('-').map(Number);
  if (!y || !m || !d) return null;
  return { y, m, d };
};

export const buildDayEventTargetMs = (dateKey, timeHHMM) => {
  const parts = parseDateKey(dateKey);
  if (!parts) return null;
  let hour = 23;
  let minute = 59;
  if (typeof timeHHMM === 'string' && /^\d{2}:\d{2}$/.test(timeHHMM)) {
    const [h, m] = timeHHMM.split(':').map(Number);
    if (Number.isFinite(h) && Number.isFinite(m)) {
      hour = Math.min(23, Math.max(0, h));
      minute = Math.min(59, Math.max(0, m));
    }
  }
  return new Date(parts.y, parts.m - 1, parts.d, hour, minute, 0, 0).getTime();
};

export const fmtRemaining = (targetMs, nowMs) => {
  if (!targetMs || !nowMs) return '';
  const diffMs = targetMs - nowMs;
  if (diffMs <= 0) return 'Passed';
  const totalMins = Math.max(0, Math.ceil(diffMs / 60000));
  const days = Math.floor(totalMins / (60 * 24));
  const hours = Math.floor((totalMins - days * 24 * 60) / 60);
  const mins = totalMins % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
};

// What kind of block it is (matching the Plan My Day preview): task/goal/habit
// blocks carry `plan.kind`; anything else is a plain event. Blocks are colored by
// category (see blockCategories.js); the kind colors only mark unscheduled tasks.
export const BLOCK_KIND_COLORS = { task: '#38bdf8', goal: '#30d158', habit: '#ff9f0a', event: '#5e5ce6' };
export const BLOCK_KIND_LABELS = { task: 'Task', goal: 'Goal', habit: 'Habit', event: 'Event' };
export const blockKind = (ev) => (Object.hasOwn(BLOCK_KIND_COLORS, ev?.plan?.kind ?? '') ? ev.plan.kind : 'event');

export const cloneSubEvents = (subEvents = []) => subEvents.map((subEvent) => ({ ...subEvent }));
export const normalizeBonusTask = (task = {}, index = 0) => ({
  id: task.id ?? `bonus-${index}-${task.title || 'task'}`,
  title: task.title || '',
  xpAmount: Number(task.xpAmount) || 10,
  completed: Boolean(task.completed),
  completedDates: Array.isArray(task.completedDates) ? [...task.completedDates] : [],
});
export const cloneBonusTasks = (bonusTasks = []) => bonusTasks.map((task, index) => normalizeBonusTask(task, index));
export const normalizeEvent = (ev = {}) => ({
  ...ev,
  subEvents: cloneSubEvents(ev.subEvents || []),
  bonusTasks: cloneBonusTasks(ev.bonusTasks || []),
  completedDates: Array.isArray(ev.completedDates) ? [...ev.completedDates] : [],
  // Which weekdays (0=Sun…6=Sat) a 'weekly' recurrence lands on. Empty/missing
  // falls back to the item's own anchor-date weekday — see expandEventsForDates.
  recurrenceDays: Array.isArray(ev.recurrenceDays) ? [...ev.recurrenceDays] : [],
});

export const expandEventsForDates = (storedEvents, dateKeys) => {
  const result = [];
  for (const ev of storedEvents) {
    const normalizedEvent = normalizeEvent(ev);
    if (normalizedEvent.recurrence === 'none' || !normalizedEvent.recurrence) {
      if (dateKeys.includes(normalizedEvent.date)) result.push({ ...normalizedEvent, _instanceDate: normalizedEvent.date });
    } else if (normalizedEvent.recurrence === 'daily') {
      for (const dk of dateKeys) {
        if (dk >= normalizedEvent.date) result.push({ ...normalizedEvent, _instanceDate: dk, _isVirtual: dk !== normalizedEvent.date });
      }
    } else if (normalizedEvent.recurrence === 'weekly') {
      const evDay = new Date(normalizedEvent.date + 'T00:00:00').getDay();
      const days = normalizedEvent.recurrenceDays.length ? normalizedEvent.recurrenceDays : [evDay];
      for (const dk of dateKeys) {
        const dkDay = new Date(dk + 'T00:00:00').getDay();
        if (dk >= normalizedEvent.date && days.includes(dkDay)) result.push({ ...normalizedEvent, _instanceDate: dk, _isVirtual: dk !== normalizedEvent.date });
      }
    }
  }
  return result.filter(ev => {
    if (ev._exceptDates?.includes(ev._instanceDate)) return false;
    if (ev._forwardDeleteFrom && ev._instanceDate >= ev._forwardDeleteFrom) return false;
    return true;
  });
};

export const isInstanceCompleted = (ev) => {
  if (ev.recurrence === 'none' || !ev.recurrence) return ev.completed;
  return ev.completedDates?.includes(ev._instanceDate);
};

// ─── Block check-ins ──────────────────────────────────────────────────────────
// After a block ends you say how it went: done, partly or skipped (with a reason).
// One-off blocks keep that answer in `outcome`; recurring ones in `outcomes[date]`,
// mirroring `completed` / `completedDates`. Done and Partly still set those, so
// every "is this block finished" check elsewhere keeps working; a block completed
// before check-ins existed reads as done.

// "Plan kept" counts toward the Daily Score from this day on; earlier days keep the
// formula they were scored with, so past scores, the streak and rank don't move.
export const PLAN_KEPT_START = '2026-10-17';

export const SKIP_REASONS = ['Distracted', 'Ran over', 'Low energy', 'Plans changed', 'Forgot'];

// Share of a block that counts as kept.
export const PLAN_CREDIT = { done: 1, partly: 0.5, skipped: 0 };

const isOneOff = (ev) => ev.recurrence === 'none' || !ev.recurrence;

/** { status, reason?, at? } for this instance, or null when it hasn't been answered. */
export const getBlockOutcome = (ev) => {
  const stored = isOneOff(ev) ? ev.outcome : ev.outcomes?.[ev._instanceDate];
  if (stored?.status) return stored;
  return isInstanceCompleted(ev) ? { status: 'done' } : null;
};

const instanceMs = (ev, h, m) => {
  const parts = parseDateKey(ev._instanceDate || ev.date);
  return parts ? new Date(parts.y, parts.m - 1, parts.d, h, m, 0, 0).getTime() : null;
};
export const blockStartMs = (ev) => instanceMs(ev, ev.startHour, ev.startMin);
export const blockEndMs = (ev) => instanceMs(ev, ev.endHour, ev.endMin);

const fmtClock = (h, m) => `${h % 12 === 0 ? 12 : h % 12}${m ? `:${String(m).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`;
/** "2–3pm"-style range for check-in prompts and pushes, e.g. "9am–10:30am". */
export const blockRange = (ev) => `${fmtClock(ev.startHour, ev.startMin)}–${fmtClock(ev.endHour, ev.endMin)}`;

/** done | partly | skipped (answered) · missed (ended, unanswered) · now · upcoming */
export const getBlockStatus = (ev, nowMs) => {
  const outcome = getBlockOutcome(ev);
  if (outcome) return outcome.status;
  if (nowMs >= blockEndMs(ev)) return 'missed';
  return nowMs >= blockStartMs(ev) ? 'now' : 'upcoming';
};

/**
 * How well a day's plan was kept: every time block that day (recurring included)
 * counts; done = 1, partly = 0.5. `reasons` tallies why blocks were skipped.
 */
export const getPlanKept = (calendarEvents, dateKey) => {
  const blocks = expandEventsForDates(calendarEvents || [], [dateKey]);
  const out = { total: blocks.length, done: 0, partly: 0, skipped: 0, credit: 0, reasons: {} };
  for (const ev of blocks) {
    const outcome = getBlockOutcome(ev);
    if (!outcome) continue;
    out[outcome.status] += 1;
    out.credit += PLAN_CREDIT[outcome.status] || 0;
    if (outcome.status === 'skipped' && outcome.reason) out.reasons[outcome.reason] = (out.reasons[outcome.reason] || 0) + 1;
  }
  return out;
};

/**
 * Ended blocks still waiting for an answer, oldest first, from yesterday and today
 * (yesterday's still count toward yesterday's score until you answer them). Days
 * before check-ins existed are never asked about.
 */
export const getPendingCheckIns = (calendarEvents, now) => {
  const nowMs = now.getTime();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  return expandEventsForDates(calendarEvents || [], [toDateKey(yesterday), toDateKey(now)])
    .filter((ev) => ev._instanceDate >= PLAN_KEPT_START && getBlockStatus(ev, nowMs) === 'missed')
    .sort((a, b) => blockEndMs(a) - blockEndMs(b));
};

/**
 * Today at a glance, for the Calendar's Today strip: today's blocks in time order
 * with their status, planned minutes, how well the plan is kept, and the block on
 * now / up next (answered blocks are skipped, so marking one done early moves on).
 */
export const getPlanDay = (calendarEvents, now) => {
  const nowMs = now.getTime();
  const dateKey = toDateKey(now);
  const blocks = expandEventsForDates(calendarEvents || [], [dateKey])
    .sort((a, b) => blockStartMs(a) - blockStartMs(b))
    .map((ev) => ({ ev, status: getBlockStatus(ev, nowMs) }));
  return {
    dateKey,
    blocks,
    plannedMins: blocks.reduce((sum, { ev }) => sum + (ev.endHour * 60 + ev.endMin) - (ev.startHour * 60 + ev.startMin), 0),
    kept: getPlanKept(calendarEvents, dateKey),
    missed: blocks.filter((b) => b.status === 'missed').length,
    current: blocks.find((b) => b.status === 'now')?.ev || null,
    next: blocks.find((b) => b.status === 'upcoming')?.ev || null,
  };
};

/** Ids of tasks that already have a block on any of `dateKeys` (a skipped block frees its task again). */
export const plannedTaskIds = (calendarEvents, dateKeys) => new Set(
  expandEventsForDates(calendarEvents || [], dateKeys)
    .filter((ev) => ev.plan?.taskId != null && getBlockOutcome(ev)?.status !== 'skipped')
    .map((ev) => String(ev.plan.taskId)),
);
