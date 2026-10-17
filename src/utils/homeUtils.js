// ─── Home screen logic ────────────────────────────────────────────────────────
// Pure helpers behind Home's "what do I do now" surfaces. Everything takes `now`
// explicitly so it's clock-testable; nothing here writes state.

import {
  toDateKey, parseDateKey, buildDayEventTargetMs, expandEventsForDates, isInstanceCompleted,
} from './calendarUtils';
import { computeDailyScore, STREAK_THRESHOLD } from './scoreUtils';
import { countTaskCompletions } from './taskUtils';

const EVENING_FROM = 20;
const MORNING_WINDOW = [4, 12];

/** 'morning' (4–11h), 'evening' (20–23h) or 'day' (everything else, incl. after midnight). */
export const getDayMode = (now) => {
  const hour = now.getHours();
  if (hour >= EVENING_FROM) return 'evening';
  if (hour >= MORNING_WINDOW[0] && hour < MORNING_WINDOW[1]) return 'morning';
  return 'day';
};

/**
 * What's on now / next across time blocks, No Phone blocks and reminders, for today
 * and tomorrow. Time blocks keep their expanded instance (`ev`) so Home can start a
 * focus session on them. `plannedToday` says whether today has any time block at all.
 */
export const getNextUp = ({ calendarEvents, noPhoneBlocks, calendarDayEvents, now }) => {
  const nowMs = now.getTime();
  const todayKey = toDateKey(now);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateKeys = [todayKey, toDateKey(tomorrow)];

  const toRange = (ev, kind) => {
    const parts = parseDateKey(ev._instanceDate);
    if (!parts) return null;
    const { y, m, d } = parts;
    return {
      kind,
      id: `${kind}-${ev.id}-${ev._instanceDate}`,
      label: ev.title ?? ev.label ?? 'Untitled',
      startMs: new Date(y, m - 1, d, ev.startHour, ev.startMin, 0, 0).getTime(),
      endMs: new Date(y, m - 1, d, ev.endHour, ev.endMin, 0, 0).getTime(),
      ev: kind === 'event' ? ev : null,
    };
  };

  const allEvents = expandEventsForDates(calendarEvents || [], dateKeys);
  const plannedToday = allEvents.some((ev) => ev._instanceDate === todayKey);
  const events = allEvents
    .filter((ev) => !isInstanceCompleted(ev))
    .map((ev) => toRange(ev, 'event'))
    .filter(Boolean);
  const blocks = expandEventsForDates(noPhoneBlocks || [], dateKeys)
    .filter((ev) => !isInstanceCompleted(ev))
    .map((ev) => toRange(ev, 'block'))
    .filter(Boolean);
  const reminders = dateKeys.flatMap((dk) =>
    (calendarDayEvents?.[dk] || []).map((ev) => {
      const t = buildDayEventTargetMs(dk, ev.time);
      return t ? { kind: 'reminder', id: `reminder-${ev.id}-${dk}`, label: ev.title || 'Untitled', startMs: t, endMs: t, ev: null } : null;
    }).filter(Boolean)
  );

  const noPhoneActive = blocks.some((b) => b.startMs <= nowMs && nowMs < b.endMs);
  const current = events.find((e) => e.startMs <= nowMs && nowMs < e.endMs) || null;
  const next = [...events, ...blocks, ...reminders]
    .filter((c) => c.startMs > nowMs)
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs)[0] || null;
  const activeBlock = current ? null : blocks.find((b) => b.startMs <= nowMs && nowMs < b.endMs) || null;
  const isToday = (item) => !!item && toDateKey(new Date(item.startMs)) === todayKey;

  return { current, next, nextIsToday: isToday(next), activeBlock, noPhoneActive, plannedToday };
};

/**
 * Yesterday's commitment and whether it still needs a check-in. The commitment tile
 * and the next-move hint both read this, so they can never disagree.
 */
export const getYesterdayCommitment = (logs, commitmentArchive, now) => {
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  const dateKey = toDateKey(y);
  const text = logs?.[dateKey]?.commitment?.trim() || '';
  const record = (commitmentArchive || []).find((a) => a.date === dateKey) || null;
  const status = !text ? 'none'
    : record?.denied === true ? 'missed'
      : record?.confirmedOn ? 'kept'
        : 'pending';
  return { dateKey, text, record, status, isPending: status === 'pending' };
};

// Which move to suggest first when two are worth the same, by time of day.
const MODE_ORDER = {
  morning: ['sleep', 'commitment', 'tasks', 'habits', 'log'],
  day: ['tasks', 'habits', 'commitment', 'sleep', 'log'],
  evening: ['log', 'habits', 'tasks', 'commitment', 'sleep'],
};

const round1 = (n) => Math.round(n * 10) / 10;

/**
 * The single action that raises today's Daily Score the most, computed from the
 * score's own formula (see computeDailyScore). Returns
 * { score, toThreshold, move: { key, text, gain, page } | null }.
 * `page` is where the action happens; null when it's on Home itself.
 */
export const getNextMove = ({ habits, xpLog, logs, commitmentArchive, healthLog }, now) => {
  const todayKey = toDateKey(now);
  const { score } = computeDailyScore(habits || [], xpLog || [], logs || {}, commitmentArchive || [], healthLog || {}, todayKey);
  const habitsTotal = (habits || []).length;
  const habitsDone = (habits || []).filter((h) => h.history?.[todayKey]).length;
  const tasksDone = countTaskCompletions(xpLog, todayKey);
  const sleepLogged = healthLog?.[todayKey]?.sleepHours != null;
  const entry = logs?.[todayKey];
  const logFilled = !!entry && ((entry.emotions?.length > 0) || entry.proud?.some((p) => p?.trim()));
  const commitment = getYesterdayCommitment(logs, commitmentArchive, now);

  const moves = [];
  if (habitsTotal > 0 && habitsDone < habitsTotal) {
    moves.push({ key: 'habits', text: 'Tick off a habit', gain: round1(3 / habitsTotal), page: null });
  }
  if (tasksDone < 3) moves.push({ key: 'tasks', text: 'Finish a task', gain: 1, page: null });
  if (!sleepLogged) moves.push({ key: 'sleep', text: 'Log your sleep (9h+ counts)', gain: 2, page: 'daily-log' });
  if (!logFilled) moves.push({ key: 'log', text: 'Fill in today’s Daily Log', gain: 1, page: 'daily-log' });
  if (commitment.isPending) moves.push({ key: 'commitment', text: 'Mark yesterday’s commitment', gain: 1, page: null });

  const order = MODE_ORDER[getDayMode(now)];
  moves.sort((a, b) => b.gain - a.gain || order.indexOf(a.key) - order.indexOf(b.key));

  return {
    score,
    toThreshold: score < STREAK_THRESHOLD ? round1(STREAK_THRESHOLD - score) : 0,
    move: moves[0] || null,
  };
};

/** The evening "close the day" checklist, in the order it's best done. */
export const getCloseDaySteps = ({ logs, logReviews }, now) => {
  const todayKey = toDateKey(now);
  const entry = logs?.[todayKey];
  const logFilled = !!entry && ((entry.emotions?.length > 0) || entry.proud?.some((p) => p?.trim()));
  return [
    { key: 'log', label: 'Fill in your Daily Log', done: logFilled },
    { key: 'commitment', label: 'Set tomorrow’s commitment', done: !!entry?.commitment?.trim() },
    { key: 'review', label: 'Submit & get your review', done: !!logReviews?.[todayKey] },
  ];
};
