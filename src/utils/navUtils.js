// ─── Navigation helpers ───────────────────────────────────────────────────────
// Shared by the desktop sidebar, the ⌘K palette and App's keyboard shortcuts.
// Pure: everything takes `now` explicitly; nothing here writes state.

import { toDateKey, getPlanDay } from './calendarUtils';
import { todayQueue } from './taskUtils';
import { getDayMode, getCloseDaySteps } from './homeUtils';
import { getMondayKey } from './weekStatsUtils';

/** Alt+key → page. App's shortcut handler and the palette's hints both read this. */
export const ALT_PAGE_KEYS = {
  '1': 'statistics', '2': 'tasks', '3': 'daily-log', '4': 'timer', '5': 'calendar',
  '6': 'goals', '7': 'review', s: 'shop',
};

/** The Alt key for a page, e.g. 'tasks' → '2', or null. */
export const altKeyFor = (page) =>
  Object.keys(ALT_PAGE_KEYS).find((key) => ALT_PAGE_KEYS[key] === page) ?? null;

const WEEKLY_REVIEW_FROM = 12; // Sunday noon, same as the assistant's weekly check-in

const fmtTime = (h, m) => new Date(2000, 0, 1, h, m).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

/**
 * Small status hints for sidebar links, only where something needs you:
 * { [page]: { text?, tone?: 'alert' | 'live', dot?: true } }.
 */
export const getNavHints = ({ todos, calendarEvents, logs, logReviews, weeklyReviews }, now) => {
  const hints = {};
  const todayKey = toDateKey(now);

  const left = todayQueue(todos || [], todayKey).length;
  if (left > 0) hints.tasks = { text: `${left} left` };

  const plan = getPlanDay(calendarEvents || [], now);
  if (plan.missed > 0) hints.calendar = { text: `${plan.missed} to check in`, tone: 'alert' };
  else if (plan.current) hints.calendar = { text: 'now', tone: 'live' };
  else if (plan.next) hints.calendar = { text: fmtTime(plan.next.startHour, plan.next.startMin) };

  if (getDayMode(now) === 'evening' && getCloseDaySteps({ logs, logReviews }, now).some((s) => !s.done)) {
    hints['daily-log'] = { dot: true };
  }

  if (now.getDay() === 0 && now.getHours() >= WEEKLY_REVIEW_FROM && !weeklyReviews?.[getMondayKey(0)]?.completedAt) {
    hints.review = { dot: true };
  }

  return hints;
};

// ⌘ on Apple devices, Ctrl elsewhere — for the palette's shortcut and its label.
export const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const MOD_KEY_LABEL = IS_MAC ? '⌘' : 'Ctrl ';
export const ALT_KEY_LABEL = IS_MAC ? '⌥' : 'Alt ';

/** The shortcut key a keydown means, by physical key: Option+1 on a Mac types "¡", but its code is still Digit1. */
export const shortcutKeyOf = (e) => {
  if (e.code?.startsWith('Digit')) return e.code.slice(5);
  if (e.code?.startsWith('Key')) return e.code.slice(3).toLowerCase();
  return e.key?.toLowerCase();
};
