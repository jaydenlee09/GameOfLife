// ─── My Assistant: tool layer ─────────────────────────────────────────────────
// Every capability the agent has lives here, as a Gemini function declaration plus
// an executor. Tools come in three tiers:
//   read    — look data up; never changes anything.
//   auto    — safe additive changes; applied immediately, recorded with an undo.
//   confirm — edits/deletes; surfaced as an approve/reject card, applied on approval.
//
// Write tools never touch React state directly. `prepare` validates the model's
// args against a state snapshot and returns a pure `op` (plus its `inverse`), which
// `applySliceOp` applies to one state slice. The same pure function is used for the
// agent loop's working copy and for the real React setters, so what the agent "sees"
// mid-turn can't drift from what actually gets committed — and undo is just
// applying the inverse op.
//
// XP stays earned: no tool completes tasks, ticks habits, completes calendar blocks
// or resolves commitments, and undo refuses to remove anything XP was already
// earned on.

import { expandEventsForDates, isInstanceCompleted, getBlockOutcome } from './calendarUtils';
import {
  computeDailyScore, computeDailyScoreHistory, computeRankStatus, getLocalDateKey, shiftDateKey, STREAK_THRESHOLD,
} from './scoreUtils';
import { getHabitStreak } from './habitUtils';
import { getGoalProgress } from './goalUtils';
import { ACHIEVEMENTS } from './achievementsMeta';
import { carriedDays, isTop } from './taskUtils';

// How the user said a block went, when it wasn't simply done ("partly", "skipped: Distracted").
const checkInOf = (ev) => {
  const o = getBlockOutcome(ev);
  if (!o || o.status === 'done') return null;
  return o.reason ? `${o.status}: ${o.reason}` : o.status;
};

export const TASK_TIMEFRAME_XP = {
  today: 20,
  tomorrow: 30,
  'this-week': 50,
  'this-month': 100,
};
const VALID_TIMEFRAMES = Object.keys(TASK_TIMEFRAME_XP);
const VALID_RECURRENCE = ['none', 'daily', 'weekly'];
export const MEMORY_KINDS = ['pattern', 'preference', 'fact', 'win'];
export const MEMORY_LIMIT = 60;

// ─── Small helpers ────────────────────────────────────────────────────────────
const makeId = (prefix) => `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
// Tasks and calendar blocks use numeric ids everywhere else in the app.
const makeNumericId = () => Date.now() + Math.floor(Math.random() * 10_000);
const sameId = (a, b) => String(a) === String(b);
const toTrimmedString = (value) => (typeof value === 'string' ? value.trim() : '');
const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const fmtTime = (h, m) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
const has = (args, key) => args != null && args[key] !== undefined && args[key] !== null;

const parseTimeLike = (timeString) => {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(toTrimmedString(timeString));
  if (!match) return null;
  return { hour: Number(match[1]), minute: Number(match[2]) };
};

const normalizeDateKey = (value) => {
  const text = toTrimmedString(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
};

const normalizeRecurrenceDays = (value, recurrence) => {
  if (recurrence !== 'weekly' || !Array.isArray(value)) return [];
  const days = value
    .map((day) => Math.floor(toNumber(day, NaN)))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
  return [...new Set(days)].sort((a, b) => a - b);
};

const filterStats = (value, validStats) =>
  (Array.isArray(value) ? value : []).filter((stat) => validStats.includes(stat));

// Calendar times snap to the app's 15-minute grid; end must land after start.
const normalizeTimeRange = (startArg, endArg) => {
  const start = parseTimeLike(startArg);
  const end = parseTimeLike(endArg);
  if (!start) throw new Error('startTime must be HH:MM (24h).');
  if (!end) throw new Error('endTime must be HH:MM (24h).');
  const startTotal = start.hour * 60 + Math.floor(start.minute / 15) * 15;
  const endTotal = end.hour * 60 + Math.floor(end.minute / 15) * 15;
  if (endTotal <= startTotal) throw new Error('endTime must be after startTime.');
  return {
    startHour: Math.floor(startTotal / 60), startMin: startTotal % 60,
    endHour: Math.floor(endTotal / 60), endMin: endTotal % 60,
  };
};

// Inclusive list of YYYY-MM-DD keys, capped so a read can't explode the context.
const resolveRange = (args, defaultFrom, defaultTo, maxDays = 31) => {
  let from = normalizeDateKey(args?.from) || defaultFrom;
  let to = normalizeDateKey(args?.to) || defaultTo;
  if (from > to) [from, to] = [to, from];
  const keys = [];
  for (let key = from; key <= to && keys.length < maxDays; key = shiftDateKey(key, 1)) keys.push(key);
  return keys;
};

const findTask = (state, taskId) => {
  const task = (state.todos || []).find((t) => sameId(t.id, taskId));
  if (!task) throw new Error(`No task with id ${taskId}. Call get_tasks for current ids.`);
  return task;
};
const findEvent = (state, eventId) => {
  const event = (state.calendarEvents || []).find((e) => sameId(e.id, eventId));
  if (!event) throw new Error(`No calendar block with id ${eventId}. Call get_calendar for current ids.`);
  return event;
};
const findGoal = (state, goalId) => {
  const goal = (state.goals || []).find((g) => sameId(g.id, goalId));
  if (!goal) throw new Error(`No goal with id ${goalId}. Call get_goals for current ids.`);
  return goal;
};

// ─── Pure state ops (shared by the agent loop, the React setters, and undo) ──
export const applySliceOp = (slice, op) => {
  const list = Array.isArray(slice) ? slice : [];
  switch (op.kind) {
    case 'insert':
      return [...list, op.item];
    case 'remove':
      return list.filter((item) => !sameId(item.id, op.id));
    case 'insertMany':
      return [...list, ...op.items];
    // Removes a batch (e.g. a day plan) but keeps anything already completed:
    // XP earned on it stays earned.
    case 'removeMany': {
      const ids = new Set(op.ids.map(String));
      return list.filter((item) => !ids.has(String(item.id)) || item.completed || item.completedDates?.length);
    }
    case 'restore': {
      if (list.some((item) => sameId(item.id, op.item.id))) return list;
      const next = [...list];
      next.splice(clamp(op.index ?? next.length, 0, next.length), 0, op.item);
      return next;
    }
    case 'patch':
      return list.map((item) => (sameId(item.id, op.id) ? { ...item, ...op.fields } : item));
    case 'addMilestone':
      return list.map((goal) => (sameId(goal.id, op.goalId)
        ? { ...goal, milestones: [...(goal.milestones || []), op.milestone], updatedAt: Date.now() }
        : goal));
    case 'removeMilestone':
      return list.map((goal) => (sameId(goal.id, op.goalId)
        ? { ...goal, milestones: (goal.milestones || []).filter((m) => !sameId(m.id, op.milestoneId)) }
        : goal));
    case 'setField':
      return { ...(slice || {}), [op.field]: op.value };
    default:
      throw new Error(`Unknown op kind: ${op.kind}`);
  }
};

export const applyOpToState = (state, op) => ({
  ...state,
  [op.collection]: applySliceOp(state[op.collection], op),
});

// Undo must never claw back XP that was genuinely earned after the agent acted.
export const undoBlocker = (inverse, state) => {
  if (inverse.kind === 'remove' && inverse.collection === 'todos') {
    const task = (state.todos || []).find((t) => sameId(t.id, inverse.id));
    if (task?.completed) return 'That task is already completed — the XP was earned, so it stays.';
  }
  if (inverse.kind === 'remove' && inverse.collection === 'calendarEvents') {
    const event = (state.calendarEvents || []).find((e) => sameId(e.id, inverse.id));
    if (event?.completed || event?.completedDates?.length) {
      return 'That block was already completed — the XP was earned, so it stays.';
    }
  }
  if (inverse.kind === 'removeMany') {
    const ids = new Set(inverse.ids.map(String));
    const left = (state[inverse.collection] || []).filter((item) => ids.has(String(item.id)));
    if (left.length && left.every((item) => item.completed || item.completedDates?.length)) {
      return 'Every one of those is already completed — the XP was earned, so they stay.';
    }
  }
  if (inverse.kind === 'removeMilestone') {
    const goal = (state.goals || []).find((g) => sameId(g.id, inverse.goalId));
    const milestone = goal?.milestones?.find((m) => sameId(m.id, inverse.milestoneId));
    if (milestone?.completed) return 'That milestone is already done — the XP was earned, so it stays.';
  }
  return null;
};

// ─── Schema shorthands (Gemini OpenAPI-subset schema) ────────────────────────
const S = (description) => ({ type: 'STRING', description });
const I = (description) => ({ type: 'INTEGER', description });
const B = (description) => ({ type: 'BOOLEAN', description });
const E = (values, description) => ({ type: 'STRING', enum: values, description });
const ARR = (items, description) => ({ type: 'ARRAY', items, description });
// No-arg tools get no schema at all: Gemini rejects an OBJECT with empty properties.
const OBJ = (properties = {}, required = []) => (Object.keys(properties).length
  ? { type: 'OBJECT', properties, ...(required.length ? { required } : {}) }
  : undefined);
const STAT_LIST = ARR({ type: 'STRING' }, 'Stat keys this relates to (see VALID STAT KEYS in your instructions).');
const DATE_RANGE = {
  from: S('Start date YYYY-MM-DD (inclusive).'),
  to: S('End date YYYY-MM-DD (inclusive). Max 31 days per call.'),
};
const WEEKDAYS = ARR({ type: 'INTEGER' }, "For weekly recurrence: weekdays 0-6 (Sun=0…Sat=6), e.g. every Mon = [1], every Sat & Sun = [0,6]. Omit to repeat on the start date's own weekday.");

// ─── Read tools ───────────────────────────────────────────────────────────────
const READ_TOOLS = [
  {
    name: 'get_tasks',
    description: 'List tasks with their ids, timeframe, stats and notes. Use before editing or deleting a task.',
    parameters: OBJ({ include_completed: B('Also include completed tasks (default false).') }),
    run: (args, { state }) => ({
      tasks: (state.todos || [])
        .filter((t) => args?.include_completed || !t.completed)
        .map((t) => ({
          id: String(t.id),
          text: t.text,
          timeFrame: t.timeFrame,
          categories: t.categories || (t.category ? [t.category] : []),
          completed: !!t.completed,
          ...(t.scheduledDate ? { scheduledDate: t.scheduledDate } : {}),
          ...(t.dueDate ? { dueDate: t.dueDate } : {}),
          ...(isTop(t) ? { topThreeToday: true } : {}),
          ...(carriedDays(t) > 0 ? { carriedOverDays: carriedDays(t) } : {}),
          ...(t.notes ? { notes: t.notes } : {}),
          ...(t.goalId != null ? { goalId: String(t.goalId) } : {}),
          ...(t.subtasks?.length ? { subtasks: `${t.subtasks.filter((s) => s.completed).length}/${t.subtasks.length} done` } : {}),
        })),
    }),
  },
  {
    name: 'get_calendar',
    description: "Time blocks, No Phone blocks and reminders for a date range (default: today + next 6 days). Each block's eventId is what move/delete take; recurring blocks appear once per occurrence with the same eventId.",
    parameters: OBJ(DATE_RANGE),
    run: (args, { state }) => {
      const today = getLocalDateKey(0);
      const keys = resolveRange(args, today, shiftDateKey(today, 6));
      const byStart = (a, b) => (a._instanceDate.localeCompare(b._instanceDate)) || ((a.startHour * 60 + a.startMin) - (b.startHour * 60 + b.startMin));
      const blocks = expandEventsForDates(state.calendarEvents || [], keys).sort(byStart).map((ev) => ({
        eventId: String(ev.id),
        date: ev._instanceDate,
        time: `${fmtTime(ev.startHour, ev.startMin)}-${fmtTime(ev.endHour, ev.endMin)}`,
        title: ev.title,
        recurrence: ev.recurrence || 'none',
        done: !!isInstanceCompleted(ev),
        ...(checkInOf(ev) ? { checkIn: checkInOf(ev) } : {}),
        ...(ev.attributes?.length ? { attributes: ev.attributes } : {}),
        ...(ev.notes ? { notes: ev.notes } : {}),
      }));
      const noPhone = expandEventsForDates(state.noPhoneBlocks || [], keys).sort(byStart).map((b) => ({
        date: b._instanceDate,
        time: `${fmtTime(b.startHour, b.startMin)}-${fmtTime(b.endHour, b.endMin)}`,
        honored: !!isInstanceCompleted(b),
      }));
      const reminders = keys.flatMap((key) => (state.calendarDayEvents?.[key] || [])
        .map((r) => ({ date: key, title: r.title, ...(r.time ? { time: r.time } : {}) })));
      return { range: `${keys[0]}..${keys[keys.length - 1]}`, blocks, noPhone, reminders };
    },
  },
  {
    name: 'get_goals',
    description: 'Goals with ids, period, progress, milestones (with ids), obstacle and if-then plan.',
    parameters: OBJ({ include_completed: B('Also include completed goals (default false).') }),
    run: (args, { state }) => ({
      goals: (state.goals || [])
        .filter((g) => args?.include_completed || !g.completed)
        .map((g) => {
          const progress = getGoalProgress(g);
          const touched = g.updatedAt || g.createdAt;
          return {
            id: String(g.id),
            title: g.title,
            period: g.period,
            periodKey: g.periodKey,
            pinned: !!g.pinned,
            completed: !!g.completed,
            progress: `${progress.done}/${progress.total}${g.unit ? ` ${g.unit}` : ''} (${Math.round(progress.ratio * 100)}%)`,
            milestones: (g.milestones || []).map((m) => ({ id: String(m.id), text: m.text, completed: !!m.completed })),
            ...(g.obstacle ? { obstacle: g.obstacle } : {}),
            ...(g.ifThenPlan ? { ifThenPlan: g.ifThenPlan } : {}),
            ...(touched ? { lastUpdated: new Date(touched).toISOString().slice(0, 10) } : {}),
          };
        }),
    }),
  },
  {
    name: 'get_habits',
    description: 'Habits with current streak, whether done today, and the last 14 days (oldest→newest, x = done, . = missed).',
    parameters: OBJ(),
    run: (_args, { state }) => {
      const today = getLocalDateKey(0);
      const last14 = Array.from({ length: 14 }, (_, i) => shiftDateKey(today, i - 13));
      return {
        habits: (state.habits || []).map((h) => {
          const history = h.history || {};
          return {
            id: String(h.id),
            name: h.name || h.text,
            streak: getHabitStreak({ ...h, history }),
            doneToday: !!history[today],
            last14: last14.map((key) => (history[key] ? 'x' : '.')).join(''),
          };
        }),
      };
    },
  },
  {
    name: 'get_journal',
    description: 'Daily Log journal entries (emotions, proud of, wants to improve, learned, commitment for tomorrow, 1-10 day rating, nightly question answer, whether they worked on the last improve item) for a date range (default last 7 days).',
    parameters: OBJ(DATE_RANGE),
    run: (args, { state }) => {
      const today = getLocalDateKey(0);
      const keys = resolveRange(args, shiftDateKey(today, -6), today);
      const entries = keys.filter((key) => state.logs?.[key]).map((key) => {
        const e = state.logs[key];
        const clean = (list) => (Array.isArray(list) ? list.filter((x) => x?.trim()) : []);
        return {
          date: key,
          ...(e.emotions?.length ? { emotions: e.emotions } : {}),
          ...(clean(e.proud).length ? { proud: clean(e.proud) } : {}),
          ...(clean(e.improve).length ? { improve: clean(e.improve) } : {}),
          ...(e.learned?.trim() ? { learned: e.learned } : {}),
          ...(e.commitment?.trim() ? { commitmentForNextDay: e.commitment } : {}),
          ...(e.dayRating ? { dayRating: e.dayRating } : {}),
          ...(e.prompt?.answer?.trim() ? { nightlyQuestion: { question: e.prompt.text, answer: e.prompt.answer } } : {}),
          ...(e.loopCheck?.result ? { workedOnLastImprove: { item: e.loopCheck.text, answer: e.loopCheck.result } } : {}),
        };
      });
      return { entries, daysWithoutEntry: keys.filter((key) => !state.logs?.[key]) };
    },
  },
  {
    name: 'get_health',
    description: 'Health log (sleep hours, energy 1-5, workouts, screen time, water) for a date range (default last 7 days).',
    parameters: OBJ(DATE_RANGE),
    run: (args, { state }) => {
      const today = getLocalDateKey(0);
      const keys = resolveRange(args, shiftDateKey(today, -6), today);
      return {
        days: keys.filter((key) => state.healthLog?.[key]).map((key) => {
          const e = state.healthLog[key];
          return {
            date: key,
            ...(e.sleepHours != null ? { sleepHours: Math.round(e.sleepHours * 10) / 10 } : {}),
            ...(e.energyLevel ? { energy: e.energyLevel } : {}),
            ...(e.workouts?.length ? { workouts: e.workouts.map((w) => w.type) } : {}),
            ...(e.screentimeHours != null ? { screenTimeHours: Math.round(e.screentimeHours * 10) / 10 } : {}),
            ...(e.waterGlasses ? { waterBottles: e.waterGlasses } : {}),
          };
        }),
        foodBudget: state.foodPoints?.balance ?? null,
      };
    },
  },
  {
    name: 'get_score_history',
    description: `Day-by-day Daily Score (0-10) history, today's breakdown, and rank. A day counts toward the streak at ${STREAK_THRESHOLD}+.`,
    parameters: OBJ({ days: I('How many days back, including today (default 14, max 60).') }),
    run: (args, { state }) => {
      const days = clamp(Math.round(toNumber(args?.days, 14)), 1, 60);
      const today = computeDailyScore(state);
      const rank = computeRankStatus(state);
      return {
        history: computeDailyScoreHistory(state, days),
        today: { score: today.score, breakdown: Object.fromEntries(Object.entries(today.breakdown).map(([k, v]) => [k, `${v.label} → ${v.value}/10 (weight ${v.weight}%)`])) },
        rank: { tier: rank.tier.name, streakDays: rank.streakDays, nextTier: rank.nextTier?.name || null, nextTierMin: rank.nextTier?.min ?? null },
      };
    },
  },
  {
    name: 'get_focus_sessions',
    description: 'Focus/pomodoro minutes per day for the last N days.',
    parameters: OBJ({ days: I('Days back including today (default 7, max 31).') }),
    run: (args, { state }) => {
      const n = clamp(Math.round(toNumber(args?.days, 7)), 1, 31);
      const today = getLocalDateKey(0);
      const keys = Array.from({ length: n }, (_, i) => shiftDateKey(today, i - n + 1));
      const sessions = (state.pomodoroSessions || []).filter((s) => s.completed);
      return {
        days: keys.map((key) => {
          const daySessions = sessions.filter((s) => s.date === key);
          return { date: key, minutes: daySessions.reduce((sum, s) => sum + Math.floor((s.durationSecs || 0) / 60), 0), sessions: daySessions.length };
        }),
      };
    },
  },
  {
    name: 'get_xp_breakdown',
    description: 'Where XP came from over the last N days: totals by stat and by source (task, habit, calendar, focus, commitment…).',
    parameters: OBJ({ days: I('Days back including today (default 7, max 60).') }),
    run: (args, { state }) => {
      const n = clamp(Math.round(toNumber(args?.days, 7)), 1, 60);
      const since = shiftDateKey(getLocalDateKey(0), -(n - 1));
      const byStat = {};
      const bySource = {};
      (state.xpLog || []).filter((e) => e.date >= since).forEach((e) => {
        byStat[e.stat] = (byStat[e.stat] || 0) + e.amount;
        bySource[e.source] = (bySource[e.source] || 0) + e.amount;
      });
      return { since, byStat, bySource };
    },
  },
  {
    name: 'get_commitments',
    description: 'Daily commitments (made in the Daily Log for the next day) and whether each was kept, missed or is still unresolved.',
    parameters: OBJ({ days: I('Days back (default 14, max 60).') }),
    run: (args, { state }) => {
      const n = clamp(Math.round(toNumber(args?.days, 14)), 1, 60);
      const since = shiftDateKey(getLocalDateKey(0), -n);
      return {
        commitments: (state.commitmentArchive || [])
          .filter((c) => c.date >= since)
          .sort((a, b) => b.date.localeCompare(a.date))
          .map((c) => ({
            madeOn: c.date,
            text: c.text,
            status: c.denied === true ? 'missed' : c.confirmedOn ? 'kept' : 'unresolved',
          })),
      };
    },
  },
  {
    name: 'get_weekly_reviews',
    description: 'The most recent Weekly Review entries (priority, improvements, what held them back, …), keyed by week-start Monday.',
    parameters: OBJ({ count: I('How many recent reviews (default 2, max 8).') }),
    run: (args, { state }) => {
      const count = clamp(Math.round(toNumber(args?.count, 2)), 1, 8);
      const reviews = state.weeklyReviews || {};
      return {
        reviews: Object.keys(reviews).sort().reverse().slice(0, count).map((week) => ({
          week,
          ...Object.fromEntries(Object.entries(reviews[week] || {}).filter(([, v]) => typeof v === 'string' ? v.trim() : v != null)),
        })),
      };
    },
  },
  {
    name: 'search_brain_dump',
    description: 'Search Brain Dump notes by text (case-insensitive). Empty query returns the 20 newest.',
    parameters: OBJ({ query: S('Text to search for.') }),
    run: (args, { state }) => {
      const query = toTrimmedString(args?.query).toLowerCase();
      const notes = (state.brainDumpNotes || [])
        .filter((n) => n.text?.trim() && (!query || n.text.toLowerCase().includes(query)))
        .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0))
        .slice(0, 20);
      return { notes: notes.map((n) => ({ id: String(n.id), text: n.text })) };
    },
  },
  {
    name: 'get_wishlist',
    description: 'Unpurchased Reward Shop wishlist items (bought by spending earned XP).',
    parameters: OBJ(),
    run: (_args, { state }) => ({
      items: (state.shop?.items || []).filter((i) => !i.purchased).map((i) => ({
        name: i.name, price: Number(i.price) || 0, ...(i.priority ? { priority: i.priority } : {}),
      })),
    }),
  },
  {
    name: 'get_achievements',
    description: 'Unlocked achievements and the ones still locked (useful for suggesting the next milestone).',
    parameters: OBJ(),
    run: (_args, { state }) => {
      const unlocked = state.achievements || {};
      return {
        unlocked: ACHIEVEMENTS.filter((a) => unlocked[a.id]).map((a) => a.label),
        locked: ACHIEVEMENTS.filter((a) => !unlocked[a.id]).map((a) => `${a.label}: ${a.desc}`),
      };
    },
  },
];

// ─── Write tools ──────────────────────────────────────────────────────────────
const AUTO_TOOLS = [
  {
    name: 'create_task',
    description: 'Create a task. Applied immediately (user can undo). XP is set automatically from the timeframe.',
    parameters: OBJ({
      text: S('The task, phrased as a concrete action.'),
      timeFrame: E(VALID_TIMEFRAMES, 'When it is due (default today).'),
      categories: STAT_LIST,
      notes: S('Optional extra detail.'),
      goalId: S('Optional id of the goal this task moves forward.'),
    }, ['text']),
    prepare: (args, { state, validStats }) => {
      const text = toTrimmedString(args?.text);
      if (!text) throw new Error('Task text is required.');
      const asked = VALID_TIMEFRAMES.includes(args?.timeFrame) ? args.timeFrame : 'today';
      // "Tomorrow" is a today-task scheduled for tomorrow (how the Tasks page stores it).
      const timeFrame = asked === 'tomorrow' ? 'today' : asked;
      const categories = filterStats(args?.categories, validStats);
      const finalCategories = categories.length ? categories : ['discipline'];
      const goal = has(args, 'goalId') && toTrimmedString(String(args.goalId)) ? findGoal(state, args.goalId) : null;
      const item = {
        id: makeNumericId(),
        text,
        timeFrame,
        xp: TASK_TIMEFRAME_XP[timeFrame],
        categories: finalCategories,
        category: finalCategories[0],
        completed: false,
        notes: toTrimmedString(args?.notes),
        subtasks: [],
        createdAt: Date.now(),
        ...(asked === 'tomorrow' ? { scheduledDate: getLocalDateKey(1) } : {}),
        ...(goal ? { goalId: goal.id } : {}),
      };
      return {
        op: { collection: 'todos', kind: 'insert', item },
        inverse: { collection: 'todos', kind: 'remove', id: item.id },
        label: `Added task "${text}" (${asked})`,
        result: { taskId: String(item.id) },
      };
    },
  },
  {
    name: 'create_calendar_event',
    description: 'Add a time block to the calendar. Applied immediately (user can undo). Check get_calendar first so it does not collide with existing blocks.',
    parameters: OBJ({
      title: S('Block title.'),
      date: S('YYYY-MM-DD (the first occurrence if recurring).'),
      startTime: S('HH:MM 24h, on a 15-minute boundary.'),
      endTime: S('HH:MM 24h, after startTime.'),
      attributes: STAT_LIST,
      recurrence: E(VALID_RECURRENCE, 'Default none.'),
      recurrenceDays: WEEKDAYS,
      notes: S('Optional notes shown on hover.'),
    }, ['title', 'date', 'startTime', 'endTime']),
    prepare: (args, { validStats }) => {
      const title = toTrimmedString(args?.title);
      if (!title) throw new Error('Block title is required.');
      const date = normalizeDateKey(args?.date);
      if (!date) throw new Error('date must be YYYY-MM-DD.');
      const times = normalizeTimeRange(args?.startTime, args?.endTime);
      const recurrence = VALID_RECURRENCE.includes(args?.recurrence) ? args.recurrence : 'none';
      const item = {
        id: makeNumericId(),
        title,
        date,
        ...times,
        // XP for blocks is duration-based at completion time; this is just the stored default.
        xpAmount: 20,
        attributes: filterStats(args?.attributes, validStats),
        recurrence,
        recurrenceDays: normalizeRecurrenceDays(args?.recurrenceDays, recurrence),
        notes: toTrimmedString(args?.notes),
        subEvents: [],
        bonusTasks: [],
        completed: false,
        completedDates: [],
      };
      const repeat = recurrence === 'none' ? '' : `, repeats ${recurrence}`;
      return {
        op: { collection: 'calendarEvents', kind: 'insert', item },
        inverse: { collection: 'calendarEvents', kind: 'remove', id: item.id },
        label: `Scheduled "${title}" ${date} ${fmtTime(times.startHour, times.startMin)}-${fmtTime(times.endHour, times.endMin)}${repeat}`,
        result: { eventId: String(item.id) },
      };
    },
  },
  {
    name: 'create_quick_event_template',
    description: 'Create a reusable time-block template on the Calendar page. Applied immediately (user can undo).',
    parameters: OBJ({
      title: S('Template title.'),
      duration: I('Minutes, 15-720 (default 60).'),
      attributes: STAT_LIST,
      recurrence: E(VALID_RECURRENCE, 'Default none.'),
      recurrenceDays: WEEKDAYS,
      color: S('Optional hex color like #818cf8.'),
    }, ['title']),
    prepare: (args, { validStats }) => {
      const title = toTrimmedString(args?.title);
      if (!title) throw new Error('Template title is required.');
      const recurrence = VALID_RECURRENCE.includes(args?.recurrence) ? args.recurrence : 'none';
      const item = {
        id: makeId('tmpl'),
        title,
        duration: clamp(Math.round(toNumber(args?.duration, 60)), 15, 720),
        attributes: filterStats(args?.attributes, validStats),
        xpAmount: 20,
        recurrence,
        recurrenceDays: normalizeRecurrenceDays(args?.recurrenceDays, recurrence),
        color: /^#[0-9a-fA-F]{6}$/.test(toTrimmedString(args?.color)) ? args.color : '#818cf8',
      };
      return {
        op: { collection: 'quickEvents', kind: 'insert', item },
        inverse: { collection: 'quickEvents', kind: 'remove', id: item.id },
        label: `Created template "${title}" (${item.duration} min)`,
        result: { templateId: item.id },
      };
    },
  },
  {
    name: 'add_brain_dump_note',
    description: 'Capture a thought or idea as a Brain Dump note. Applied immediately (user can undo).',
    parameters: OBJ({ text: S('The note text.') }, ['text']),
    prepare: (args, { state }) => {
      const text = toTrimmedString(args?.text);
      if (!text) throw new Error('Note text is required.');
      // Lay agent notes out on a loose grid so they don't stack on one spot.
      const n = (state.brainDumpNotes || []).length;
      const now = Date.now();
      const item = { id: makeId('note'), text, x: 40 + (n % 4) * 240, y: 40 + (Math.floor(n / 4) % 6) * 150, createdAt: now, updatedAt: now };
      return {
        op: { collection: 'brainDumpNotes', kind: 'insert', item },
        inverse: { collection: 'brainDumpNotes', kind: 'remove', id: item.id },
        label: `Saved Brain Dump note "${text.length > 60 ? `${text.slice(0, 57)}…` : text}"`,
        result: { noteId: item.id },
      };
    },
  },
  {
    name: 'add_goal_milestone',
    description: 'Add a milestone (a concrete next step) to an existing goal. Applied immediately (user can undo).',
    parameters: OBJ({ goalId: S('Goal id from get_goals.'), text: S('The milestone.') }, ['goalId', 'text']),
    prepare: (args, { state }) => {
      const goal = findGoal(state, args?.goalId);
      if (goal.completed) throw new Error('That goal is already completed.');
      const text = toTrimmedString(args?.text);
      if (!text) throw new Error('Milestone text is required.');
      const milestone = { id: makeId('m'), text, completed: false };
      return {
        op: { collection: 'goals', kind: 'addMilestone', goalId: goal.id, milestone },
        inverse: { collection: 'goals', kind: 'removeMilestone', goalId: goal.id, milestoneId: milestone.id },
        label: `Added milestone "${text}" to "${goal.title}"`,
        result: { milestoneId: milestone.id },
      };
    },
  },
  {
    name: 'remember',
    description: `Save a durable insight about the user to long-term memory (max ${MEMORY_LIMIT}). Use for patterns, preferences, facts and wins that should shape future coaching — not one-off details.`,
    parameters: OBJ({
      text: S('One sentence, written so it is useful months from now, e.g. "Skips workouts after nights under 6h sleep."'),
      kind: E(MEMORY_KINDS, 'pattern = recurring behavior, preference = how they like to work, fact = life context, win = notable achievement.'),
    }, ['text']),
    prepare: (args, { state }) => {
      const text = toTrimmedString(args?.text);
      if (!text) throw new Error('Memory text is required.');
      const memory = state.assistantMemory || [];
      if (memory.some((m) => m.text.trim().toLowerCase() === text.toLowerCase())) throw new Error('Already remembered.');
      if (memory.length >= MEMORY_LIMIT) throw new Error(`Memory is full (${MEMORY_LIMIT}). Forget or merge an outdated entry first.`);
      const item = { id: makeId('mem'), text, kind: MEMORY_KINDS.includes(args?.kind) ? args.kind : 'fact', createdAt: Date.now() };
      return {
        op: { collection: 'assistantMemory', kind: 'insert', item },
        inverse: { collection: 'assistantMemory', kind: 'remove', id: item.id },
        label: `Remembered: ${text}`,
        result: { memoryId: item.id },
      };
    },
  },
  {
    name: 'forget',
    description: 'Remove an outdated or wrong entry from long-term memory. Applied immediately (user can undo).',
    parameters: OBJ({ memoryId: S('Memory id from the LONG-TERM MEMORY section.') }, ['memoryId']),
    prepare: (args, { state }) => {
      const memory = state.assistantMemory || [];
      const index = memory.findIndex((m) => sameId(m.id, args?.memoryId));
      if (index === -1) throw new Error(`No memory with id ${args?.memoryId}.`);
      const item = memory[index];
      return {
        op: { collection: 'assistantMemory', kind: 'remove', id: item.id },
        inverse: { collection: 'assistantMemory', kind: 'restore', item, index },
        label: `Forgot: ${item.text}`,
        result: { forgotten: item.text },
      };
    },
  },
];

const CONFIRM_TOOLS = [
  {
    name: 'update_task',
    description: 'Edit a task (text, timeframe, stats, notes). Needs the user\'s approval.',
    parameters: OBJ({
      taskId: S('Task id from get_tasks.'),
      text: S('New text.'),
      timeFrame: E(VALID_TIMEFRAMES, 'New timeframe.'),
      categories: STAT_LIST,
      notes: S('New notes.'),
    }, ['taskId']),
    prepare: (args, { state, validStats }) => {
      const task = findTask(state, args?.taskId);
      if (task.completed) throw new Error('That task is already completed.');
      const fields = {};
      const changes = [];
      if (has(args, 'text') && toTrimmedString(args.text) && args.text.trim() !== task.text) {
        fields.text = args.text.trim();
        changes.push(`rename to "${fields.text}"`);
      }
      if (args?.timeFrame === 'tomorrow') {
        const tomorrow = getLocalDateKey(1);
        if (task.timeFrame !== 'today' || task.scheduledDate !== tomorrow) {
          Object.assign(fields, { timeFrame: 'today', xp: TASK_TIMEFRAME_XP.today, scheduledDate: tomorrow });
          changes.push(`${task.timeFrame} → tomorrow`);
        }
      } else if (VALID_TIMEFRAMES.includes(args?.timeFrame) && args.timeFrame !== task.timeFrame) {
        fields.timeFrame = args.timeFrame;
        fields.xp = TASK_TIMEFRAME_XP[args.timeFrame];
        changes.push(`${task.timeFrame} → ${args.timeFrame}`);
      }
      if (has(args, 'categories')) {
        const categories = filterStats(args.categories, validStats);
        if (categories.length) {
          fields.categories = categories;
          fields.category = categories[0];
          changes.push(`stats: ${categories.join(', ')}`);
        }
      }
      if (has(args, 'notes') && toTrimmedString(args.notes) !== (task.notes || '')) {
        fields.notes = toTrimmedString(args.notes);
        changes.push('update notes');
      }
      if (!changes.length) throw new Error('Nothing to change.');
      const previous = Object.fromEntries(Object.keys(fields).map((key) => [key, task[key]]));
      return {
        op: { collection: 'todos', kind: 'patch', id: task.id, fields },
        inverse: { collection: 'todos', kind: 'patch', id: task.id, fields: previous },
        label: `Edit task "${task.text}": ${changes.join(', ')}`,
      };
    },
  },
  {
    name: 'delete_task',
    description: 'Delete a task that is no longer relevant. Needs the user\'s approval.',
    parameters: OBJ({ taskId: S('Task id from get_tasks.') }, ['taskId']),
    prepare: (args, { state }) => {
      const task = findTask(state, args?.taskId);
      const index = state.todos.indexOf(task);
      return {
        op: { collection: 'todos', kind: 'remove', id: task.id },
        inverse: { collection: 'todos', kind: 'restore', item: task, index },
        label: `Delete task "${task.text}"`,
      };
    },
  },
  {
    name: 'move_calendar_event',
    description: 'Reschedule a time block (new date and/or times). For a recurring block only the times can change, and the change applies to the whole series. Needs the user\'s approval.',
    parameters: OBJ({
      eventId: S('eventId from get_calendar.'),
      date: S('New date YYYY-MM-DD (one-off blocks only).'),
      startTime: S('New start HH:MM 24h.'),
      endTime: S('New end HH:MM 24h.'),
    }, ['eventId']),
    prepare: (args, { state }) => {
      const event = findEvent(state, args?.eventId);
      const recurring = event.recurrence && event.recurrence !== 'none';
      const fields = {};
      if (has(args, 'date')) {
        const date = normalizeDateKey(args.date);
        if (!date) throw new Error('date must be YYYY-MM-DD.');
        if (recurring && date !== event.date) throw new Error('Recurring blocks can only have their times changed here; the user can move single occurrences on the Calendar page.');
        if (date !== event.date) fields.date = date;
      }
      if (has(args, 'startTime') || has(args, 'endTime')) {
        const duration = (event.endHour * 60 + event.endMin) - (event.startHour * 60 + event.startMin);
        const start = has(args, 'startTime') ? args.startTime : fmtTime(event.startHour, event.startMin);
        let end = has(args, 'endTime') ? args.endTime : null;
        if (!end) {
          // Only a new start was given: keep the block's original length.
          const parsed = parseTimeLike(start);
          if (!parsed) throw new Error('startTime must be HH:MM (24h).');
          const endTotal = Math.min(parsed.hour * 60 + parsed.minute + duration, 23 * 60 + 45);
          end = fmtTime(Math.floor(endTotal / 60), endTotal % 60);
        }
        const times = normalizeTimeRange(start, end);
        Object.entries(times).forEach(([key, value]) => { if (event[key] !== value) fields[key] = value; });
      }
      if (!Object.keys(fields).length) throw new Error('Nothing to change.');
      const previous = Object.fromEntries(Object.keys(fields).map((key) => [key, event[key]]));
      const next = { ...event, ...fields };
      return {
        op: { collection: 'calendarEvents', kind: 'patch', id: event.id, fields },
        inverse: { collection: 'calendarEvents', kind: 'patch', id: event.id, fields: previous },
        label: `Move "${event.title}" to ${next.date} ${fmtTime(next.startHour, next.startMin)}-${fmtTime(next.endHour, next.endMin)}${recurring ? ' (whole series)' : ''}`,
      };
    },
  },
  {
    name: 'delete_calendar_event',
    description: 'Delete a time block. Deleting a recurring block removes the whole series. Needs the user\'s approval.',
    parameters: OBJ({ eventId: S('eventId from get_calendar.') }, ['eventId']),
    prepare: (args, { state }) => {
      const event = findEvent(state, args?.eventId);
      const index = state.calendarEvents.indexOf(event);
      const recurring = event.recurrence && event.recurrence !== 'none';
      return {
        op: { collection: 'calendarEvents', kind: 'remove', id: event.id },
        inverse: { collection: 'calendarEvents', kind: 'restore', item: event, index },
        label: `Delete "${event.title}"${recurring ? ' (entire recurring series)' : ` on ${event.date}`}`,
      };
    },
  },
  {
    name: 'update_goal',
    description: 'Edit a goal: title, WOOP obstacle, if-then plan, or pinned. Needs the user\'s approval.',
    parameters: OBJ({
      goalId: S('Goal id from get_goals.'),
      title: S('New title.'),
      obstacle: S('The main inner obstacle (WOOP).'),
      ifThenPlan: S('"If <obstacle>, then I will <action>."'),
      pinned: B('Pin or unpin the goal.'),
    }, ['goalId']),
    prepare: (args, { state }) => {
      const goal = findGoal(state, args?.goalId);
      const fields = {};
      ['title', 'obstacle', 'ifThenPlan'].forEach((key) => {
        if (has(args, key) && toTrimmedString(args[key]) !== (goal[key] || '')) fields[key] = toTrimmedString(args[key]);
      });
      if (fields.title === '') delete fields.title;
      if (typeof args?.pinned === 'boolean' && args.pinned !== !!goal.pinned) fields.pinned = args.pinned;
      if (!Object.keys(fields).length) throw new Error('Nothing to change.');
      const previous = Object.fromEntries(Object.keys(fields).map((key) => [key, goal[key]]));
      const now = Date.now();
      return {
        op: { collection: 'goals', kind: 'patch', id: goal.id, fields: { ...fields, updatedAt: now } },
        inverse: { collection: 'goals', kind: 'patch', id: goal.id, fields: { ...previous, updatedAt: goal.updatedAt } },
        label: `Update goal "${goal.title}": ${Object.keys(fields).join(', ')}`,
      };
    },
  },
  {
    name: 'set_north_star',
    description: "Write or revise the user's North Star: the person they are becoming. Only after they have said it in their own words. Needs the user's approval.",
    parameters: OBJ({
      vision: S('One or two sentences, first person: who they are becoming.'),
      identity: ARR({ type: 'STRING' }, 'Up to 5 short identity statements, e.g. "I train 5 days a week."'),
    }, ['vision']),
    prepare: (args, { state }) => {
      const vision = toTrimmedString(args?.vision);
      if (!vision) throw new Error('vision is required.');
      const identity = (Array.isArray(args?.identity) ? args.identity : []).map(toTrimmedString).filter(Boolean).slice(0, 5);
      const value = { vision, identity, updatedAt: Date.now() };
      return {
        op: { collection: 'user', kind: 'setField', field: 'northStar', value },
        inverse: { collection: 'user', kind: 'setField', field: 'northStar', value: state.user?.northStar ?? null },
        label: `Set North Star: "${vision}"`,
      };
    },
  },
];

// ─── Registry ─────────────────────────────────────────────────────────────────
const tiered = (tools, tier) => tools.map((tool) => ({ ...tool, tier }));
export const TOOLS = [
  ...tiered(READ_TOOLS, 'read'),
  ...tiered(AUTO_TOOLS, 'auto'),
  ...tiered(CONFIRM_TOOLS, 'confirm'),
];
const TOOL_MAP = Object.fromEntries(TOOLS.map((tool) => [tool.name, tool]));
export const getTool = (name) => TOOL_MAP[name] || null;

export const TOOL_DECLARATIONS = TOOLS.map(({ name, description, parameters }) => ({ name, description, ...(parameters ? { parameters } : {}) }));
