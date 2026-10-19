// ─── Calendar sidebar: time left, free slots, what's coming up ────────────────
// Pure helpers behind the Calendar page's left column. Free time comes from the
// same planner window (wake → bed, minus blocks and fixed busy times) that
// Plan my day uses, so "free" means the same thing in both places.

import { buildDayEventTargetMs, toDateKey } from './calendarUtils';
import { computeFreeGaps } from './dayPlanner';
import { daysLeft, normalizeGoal } from './goalUtils';
import { dayLabel } from './taskUtils';

const sum = (gaps) => gaps.reduce((n, g) => n + (g.end - g.start), 0);

/**
 * What's left of today: { start, end, windowMins, freeMins, bookedMins, nextGap, ended }.
 * `nextGap` is { start, end, isNow } (minutes since midnight) or null; `ended` means
 * bedtime has passed.
 */
export const getTimeLeft = ({ planner, calendarEvents, now = new Date() }) => {
  const { start, end, gaps } = computeFreeGaps({ dateKey: toDateKey(now), settings: planner, now, calendarEvents });
  const windowMins = Math.max(0, end - start);
  const freeMins = Math.min(windowMins, sum(gaps));
  const first = gaps[0] || null;
  return {
    start,
    end,
    windowMins,
    freeMins,
    bookedMins: windowMins - freeMins,
    nextGap: first ? { ...first, isNow: first.start <= start } : null,
    ended: windowMins === 0,
  };
};

/** Start (minutes) of the first free stretch of `minutes` on `dateKey`, or null. */
export const findFreeSlot = ({ dateKey, minutes, planner, calendarEvents, now = new Date() }) => {
  const { gaps } = computeFreeGaps({ dateKey, settings: planner, now, calendarEvents });
  return gaps.find((g) => g.end - g.start >= minutes)?.start ?? null;
};

const fmtClock = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h < 12 ? 'AM' : 'PM';
  const hour = h % 12 || 12;
  return m ? `${hour}:${String(m).padStart(2, '0')} ${suffix}` : `${hour} ${suffix}`;
};

/**
 * The sidebar's "Coming up": upcoming day events (deadlines and reminders) and
 * goal deadlines within `goalDays` (plus overdue ones), soonest first. Each entry:
 * { kind: 'event'|'goal', key, id, title, dateKey, time?, color?, targetMs, when, meta, tone }.
 */
export const getComingUp = ({ dayEvents, goals, now = new Date(), goalDays = 14, limit = 8 }) => {
  const nowMs = now.getTime();
  const today = toDateKey(now);
  const entries = [];

  for (const [dateKey, items] of Object.entries(dayEvents && typeof dayEvents === 'object' ? dayEvents : {})) {
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      const targetMs = buildDayEventTargetMs(dateKey, item?.time);
      if (!targetMs || targetMs < nowMs) continue;
      const days = Math.round((buildDayEventTargetMs(dateKey, null) - buildDayEventTargetMs(today, null)) / 86_400_000);
      const time = typeof item?.time === 'string' && /^\d{2}:\d{2}$/.test(item.time) ? fmtClock(item.time) : null;
      entries.push({
        kind: 'event',
        key: `e-${dateKey}-${item?.id}`,
        id: item?.id,
        title: item?.title || 'Untitled',
        dateKey,
        time: item?.time || null, // raw HH:MM, for the edit form
        color: item?.color || '#38bdf8',
        targetMs,
        when: time ? `${dayLabel(dateKey, today)} · ${time}` : dayLabel(dateKey, today),
        meta: days <= 0 ? 'Today' : `${days}d`,
        tone: days <= 0 ? 'soon' : null,
      });
    }
  }

  for (const raw of goals || []) {
    const goal = normalizeGoal(raw);
    if (goal.completed || !goal.deadline) continue;
    const left = daysLeft(goal, now);
    if (left > goalDays) continue;
    entries.push({
      kind: 'goal',
      key: `g-${goal.id}`,
      id: goal.id,
      title: goal.title || 'Untitled goal',
      dateKey: goal.deadline,
      targetMs: buildDayEventTargetMs(goal.deadline, null),
      when: left < 0 ? 'Goal deadline passed' : `Goal due ${dayLabel(goal.deadline, today)}`,
      meta: left < 0 ? `${-left}d late` : left === 0 ? 'Today' : `${left}d`,
      tone: left < 0 ? 'late' : left <= 1 ? 'soon' : null,
    });
  }

  return entries.sort((a, b) => a.targetMs - b.targetMs).slice(0, limit);
};
