// ─── Focus insights ───────────────────────────────────────────────────────────
// Plain statistics over focus-session history: when you focus best, how often
// sessions end with the work finished, and what usually gets in the way. Computed
// in code (never guessed by the model) so the planner and the coach can cite real
// numbers. Pure: `now` is injected.

import { shiftDateKey } from './scoreUtils';
import { toDateKey } from './calendarUtils';

// Debrief options, shared by the debrief UI and the stats below.
export const FOCUS_OUTCOMES = [
  { id: 'done', label: 'Finished it' },
  { id: 'partial', label: 'Partly' },
  { id: 'no', label: "Didn't" },
];
export const FOCUS_BLOCKERS = [
  { id: 'phone', label: 'Phone' },
  { id: 'distracted', label: 'Wandering mind' },
  { id: 'unclear', label: 'Unclear next step' },
  { id: 'too-big', label: 'Task too big' },
  { id: 'interrupted', label: 'Interrupted' },
  { id: 'tired', label: 'Low energy' },
];
const OUTCOME_SCORE = { done: 1, partial: 0.5, no: 0 };
const WINDOW_HOURS = 2;
const LOOKBACK_DAYS = 30;
// A window needs this many sessions before it can be called a "best" window.
const MIN_SESSIONS_FOR_BEST = 2;

const fmtHour = (h) => `${String(h).padStart(2, '0')}:00`;

/**
 * Stats over completed sessions from the last 30 days.
 * Returns { sessions, minutes, debriefed, successRate, windows, best, topBlockers, planned }.
 * `successRate`s are 0..1 over debriefed sessions only (null when none were debriefed).
 */
export const computeFocusInsights = (sessions, now = new Date()) => {
  const from = shiftDateKey(toDateKey(now), -(LOOKBACK_DAYS - 1));
  const recent = (sessions || []).filter((s) => s?.completed && s.date >= from && Number.isFinite(s.startedAt));

  const rate = (list) => {
    const rated = list.filter((s) => OUTCOME_SCORE[s.debrief?.outcome] !== undefined);
    if (!rated.length) return null;
    return rated.reduce((sum, s) => sum + OUTCOME_SCORE[s.debrief.outcome], 0) / rated.length;
  };
  const minutesOf = (list) => list.reduce((sum, s) => sum + Math.floor((s.durationSecs || 0) / 60), 0);

  const buckets = new Map();
  recent.forEach((s) => {
    const start = Math.floor(new Date(s.startedAt).getHours() / WINDOW_HOURS) * WINDOW_HOURS;
    if (!buckets.has(start)) buckets.set(start, []);
    buckets.get(start).push(s);
  });
  const windows = [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([start, list]) => ({
      from: fmtHour(start),
      to: fmtHour(start + WINDOW_HOURS),
      sessions: list.length,
      minutes: minutesOf(list),
      successRate: rate(list),
    }));

  // Best = most focused minutes, discounted by how often sessions there fall short.
  const quality = (w) => w.minutes * (w.successRate ?? 0.75);
  const best = windows
    .filter((w) => w.sessions >= MIN_SESSIONS_FOR_BEST)
    .sort((a, b) => quality(b) - quality(a))
    .slice(0, 2);

  const blockerCounts = {};
  recent.forEach((s) => (s.debrief?.blockers || []).forEach((id) => { blockerCounts[id] = (blockerCounts[id] || 0) + 1; }));
  const topBlockers = Object.entries(blockerCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([id, count]) => ({ id, label: FOCUS_BLOCKERS.find((b) => b.id === id)?.label || id, count }));

  const planned = recent.filter((s) => s.blockId != null);

  return {
    sessions: recent.length,
    minutes: minutesOf(recent),
    debriefed: recent.filter((s) => s.debrief?.outcome).length,
    successRate: rate(recent),
    windows,
    best,
    topBlockers,
    planned: { sessions: planned.length, successRate: rate(planned) },
  };
};

/** One short line for the planner preview, or null with too little history. */
export const describeBestWindows = (insights) => {
  if (!insights?.best?.length) return null;
  const spans = insights.best.map((w) => `${w.from}–${w.to}`).join(' and ');
  return `You focus best ${spans} (last 30 days).`;
};

/**
 * The stored session record (pomodoroSessions entry). Block-linked sessions pay
 * no focus XP: completing the block pays for those minutes, once.
 */
export const makeFocusSession = ({
  startedAt, durationSecs, stat, xpAmount, intent, taskId, blockId, blockDate, parked = 0, debrief = null, now = new Date(),
}) => ({
  id: `${now.getTime()}-${Math.random().toString(36).slice(2, 6)}`,
  date: toDateKey(now),
  startedAt: startedAt || now.getTime() - durationSecs * 1000,
  completedAt: now.getTime(),
  durationSecs,
  xpAmount: blockId != null ? 0 : xpAmount,
  stat,
  completed: true,
  ...(intent?.trim() ? { intent: intent.trim() } : {}),
  ...(taskId != null ? { taskId: String(taskId) } : {}),
  ...(blockId != null ? { blockId: String(blockId), blockDate } : {}),
  ...(parked ? { parked } : {}),
  ...(debrief ? { debrief } : {}),
});
