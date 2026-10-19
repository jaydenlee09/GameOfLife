// ─── Calendar sidebar: slipped blocks, free slots, quick blocks, coming up ────
// Pure helpers behind the Calendar page's left column. Free time comes from the
// same planner window (wake → bed, minus blocks and fixed busy times) that
// Plan my day uses, so "free" means the same thing in both places.

import {
  buildDayEventTargetMs, toDateKey, expandEventsForDates, getBlockOutcome, getBlockStatus,
  blockEndMs, PLAN_KEPT_START,
} from './calendarUtils';
import { guessCategory, isCategoryId, storedCategoryFields } from './blockCategories';
import { checkInBlock } from './completionUtils';
import { computeFreeGaps } from './dayPlanner';
import { daysLeft, normalizeGoal } from './goalUtils';
import { dayLabel } from './taskUtils';

/**
 * A quick-block template's category, by the calendar's own rules so a template and
 * the blocks it makes share a color: the template's picked category, else what was
 * stored (by you or My Assistant) on a block with the same title, else a keyword
 * match, else Other. Returns (tmpl) => categoryId; build it once per render.
 */
export const templateCategoryLookup = (calendarEvents) => {
  const stored = new Map();
  for (const ev of calendarEvents || []) {
    const title = typeof ev?.title === 'string' ? ev.title.trim().toLowerCase() : '';
    if (title && isCategoryId(ev.category)) stored.set(title, ev.category);
  }
  return (tmpl) => {
    if (isCategoryId(tmpl?.category)) return tmpl.category;
    const title = typeof tmpl?.title === 'string' ? tmpl.title.trim() : '';
    return stored.get(title.toLowerCase()) || guessCategory(title) || 'other';
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

// ─── Missed: blocks that slipped, to reschedule or let go ────────────────────
// A slipped block is a missed (ended, never checked in) or skipped one from today or
// yesterday — the days a check-in still counts. Handling it stores `handled` on the
// block's outcome ('rescheduled' | 'let-go') so it leaves the list; an unanswered one
// is first checked in as Skipped ("Plans changed"), which pays no XP and keeps the
// day's score the same (missed and skipped both count as not kept).

export const blockMinutes = (ev) => (ev.endHour * 60 + ev.endMin) - (ev.startHour * 60 + ev.startMin);

/** Slipped blocks (instances) still to deal with, most recent first. */
export const getSlippedBlocks = (calendarEvents, now = new Date()) => {
  const nowMs = now.getTime();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  return expandEventsForDates(calendarEvents || [], [toDateKey(yesterday), toDateKey(now)])
    .filter((ev) => ev._instanceDate >= PLAN_KEPT_START && !getBlockOutcome(ev)?.handled)
    .filter((ev) => ['missed', 'skipped'].includes(getBlockStatus(ev, nowMs)))
    .sort((a, b) => blockEndMs(b) - blockEndMs(a));
};

/**
 * events => events that marks a slipped instance handled (`how`: 'rescheduled' |
 * 'let-go'), checking it in as Skipped first if it was never answered.
 */
export const handleSlippedBlock = (ev, how, now = Date.now()) => (events) => {
  const answered = getBlockOutcome(ev) ? events : (checkInBlock(ev, 'skipped', { reason: 'Plans changed', now })?.update(events) ?? events);
  const date = ev._instanceDate || ev.date;
  return answered.map((e) => {
    if (e.id !== ev.id) return e;
    if (!e.recurrence || e.recurrence === 'none') return e.outcome ? { ...e, outcome: { ...e.outcome, handled: how } } : e;
    const outcome = e.outcomes?.[date];
    return outcome ? { ...e, outcomes: { ...e.outcomes, [date]: { ...outcome, handled: how } } } : e;
  });
};

/** A fresh one-off copy of a slipped block on `dateKey` at `startMins`, same length, category and link. */
export const rescheduledCopy = (ev, dateKey, startMins, id = Date.now()) => {
  const start = Math.max(0, Math.min(startMins, 24 * 60 - 15));
  const end = Math.min(start + Math.max(15, blockMinutes(ev)), 24 * 60 - 1);
  const { id: _planId, ...plan } = ev.plan || {}; // a planner plan's id ties it to that day's plan
  return {
    id,
    title: ev.title,
    date: dateKey,
    startHour: Math.floor(start / 60), startMin: start % 60,
    endHour: Math.floor(end / 60), endMin: end % 60,
    xpAmount: ev.xpAmount ?? 20,
    recurrence: 'none', recurrenceDays: [], notes: ev.notes || '', subEvents: [], bonusTasks: [],
    completed: false, completedDates: [],
    ...storedCategoryFields(ev),
    ...(ev.plan?.kind ? { plan } : {}),
    rescheduledFrom: { id: ev.id, date: ev._instanceDate || ev.date },
  };
};

