// ─── Home Screen widget snapshot ──────────────────────────────────────────────
// The iPhone widget (a Scriptable script, see widgetScript.js) can't sign in, so it
// reads a small read-only summary instead: this snapshot, published to
// widgets/{token} by the app on every change and by the server tick every ~5 min.
// Built from the same helpers as Home, so the widget can never disagree with it.
//
// Time-based parts (what's on now / next, evening mode) are left to the widget:
// `items` holds today's and tomorrow's ranges and the widget picks by its own clock,
// so they stay right between refreshes.

import { computeDailyScore, computeStreak, computeRankStatus, scoreColor, REQUIRED_STREAK_DAYS } from './scoreUtils';
import { getDayItems, getNextMove, getCloseDaySteps } from './homeUtils';
import { toDateKey } from './calendarUtils';
import { todayQueue, TOP_LIMIT } from './taskUtils';
import { blockColor } from './blockCategories';

export const WIDGET_SNAPSHOT_VERSION = 1;

const MAX_ITEMS = 24;
const MAX_HABITS = 12;
const NO_PHONE_COLOR = '#ff453a';
const REMINDER_COLOR = '#ff9f0a';
const round1 = (n) => Math.round(n * 10) / 10;

/** Top 3 starred today (done ones keep their check), filled up from today's queue. */
const pickTasks = (todos, todayKey) => {
  const queue = todayQueue(todos || [], todayKey);
  const starred = (todos || [])
    .filter((t) => t.topDate === todayKey)
    .sort((a, b) => (a.topAt || 0) - (b.topAt || 0));
  const shown = starred.slice(0, TOP_LIMIT);
  for (const t of queue) {
    if (shown.length >= TOP_LIMIT) break;
    if (!shown.includes(t)) shown.push(t);
  }
  const openShown = shown.filter((t) => !t.completed).length;
  return {
    list: shown.map((t) => ({ text: t.text || 'Untitled', done: !!t.completed, top: t.topDate === todayKey })),
    more: Math.max(0, queue.length - openShown),
  };
};

/**
 * `state` carries the app's data (todos, habits, logs, xpLog, commitmentArchive,
 * healthLog, calendarEvents, noPhoneBlocks, calendarDayEvents, logReviews, user).
 * Pure apart from reading the local clock/timezone through `now`.
 */
export const buildWidgetSnapshot = (state, now) => {
  const todayKey = toDateKey(now);
  const scoreInputs = {
    habits: state.habits || [],
    xpLog: state.xpLog || [],
    logs: state.logs || {},
    commitmentArchive: state.commitmentArchive || [],
    healthLog: state.healthLog || {},
    calendarEvents: state.calendarEvents || [],
  };
  const { score } = computeDailyScore(scoreInputs, todayKey);
  const streak = computeStreak(scoreInputs);
  const { toThreshold, move } = getNextMove(scoreInputs, now);
  const rank = computeRankStatus(scoreInputs);

  const nowMs = now.getTime();
  const overrides = state.user?.categoryColors;
  const { events, blocks, reminders, plannedToday } = getDayItems({
    calendarEvents: state.calendarEvents,
    noPhoneBlocks: state.noPhoneBlocks,
    calendarDayEvents: state.calendarDayEvents,
    now,
  });
  const items = [
    ...events.map((e) => ({ kind: 'event', label: e.label, startMs: e.startMs, endMs: e.endMs, color: blockColor(e.ev, overrides) })),
    ...blocks.map((b) => ({ kind: 'block', label: b.label, startMs: b.startMs, endMs: b.endMs, color: NO_PHONE_COLOR })),
    ...reminders.map((r) => ({ kind: 'reminder', label: r.label, startMs: r.startMs, endMs: r.endMs, color: REMINDER_COLOR })),
  ]
    .filter((item) => item.endMs >= nowMs)
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs)
    .slice(0, MAX_ITEMS);

  const habits = state.habits || [];
  const habitsLeft = habits.filter((h) => !h.history?.[todayKey]);

  return {
    v: WIDGET_SNAPSHOT_VERSION,
    date: todayKey,
    generatedAt: nowMs,
    score: {
      value: score,
      color: scoreColor(score),
      streak,
      toThreshold: round1(toThreshold),
    },
    rank: {
      name: rank.tier.name,
      color: rank.tier.color,
      next: rank.nextTier ? { name: rank.nextTier.name, min: rank.nextTier.min, days: rank.nextTierStreak } : null,
      requiredDays: REQUIRED_STREAK_DAYS,
    },
    items,
    plannedToday,
    tasks: pickTasks(state.todos, todayKey),
    habits: {
      total: habits.length,
      left: habitsLeft.slice(0, MAX_HABITS).map((h) => h.name || h.text || 'Habit'),
      leftCount: habitsLeft.length,
    },
    move: move ? { text: move.text, gain: move.gain } : null,
    close: getCloseDaySteps({ logs: state.logs, logReviews: state.logReviews }, now)
      .map(({ label, done }) => ({ label, done })),
  };
};

/** The snapshot minus its timestamp, to tell whether anything actually changed. */
export const snapshotSignature = (snapshot) => JSON.stringify({ ...snapshot, generatedAt: 0 });
