// ─── My Assistant: Plan My Day ────────────────────────────────────────────────
// Turns open tasks, goals and habits into a time-blocked day. The split of work:
//   code  — works out the free gaps (your hours minus what's already booked) and
//           your best focus windows, then validates every block the model returns;
//   model — one structured-JSON Gemini call with no tools picks what goes where.
// So the model can't double-book you, schedule outside your hours, or write
// anything: the plan is a proposal the user reviews, then adds in one step.

import { expandEventsForDates, toDateKey } from './calendarUtils';
import { getGoalProgress, getActiveGoals, getGoalActivity, getNextStep, daysLeft } from './goalUtils';
import { getHabitStreak } from './habitUtils';
import { shiftDateKey } from './scoreUtils';
import { computeFocusInsights, describeBestWindows } from './focusInsights';

// ─── Settings (stored as user.planner) ───────────────────────────────────────
export const DEFAULT_PLANNER_SETTINGS = { configured: false, wake: '07:00', bed: '23:00', busy: [] };
export const PLAN_KINDS = ['task', 'goal', 'habit', 'break'];
const GRID = 15;
const MIN_BLOCK = 15;
const MAX_BLOCK = 120;
const MAX_BLOCKS = 16;
const DAY_END = 24 * 60;

const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;
export const toMinutes = (hhmm) => {
  const match = TIME_RE.exec(typeof hhmm === 'string' ? hhmm.trim() : '');
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};
export const fromMinutes = (mins) => {
  const m = Math.max(0, Math.min(DAY_END, Math.round(mins)));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
const snapUp = (mins) => Math.ceil(mins / GRID) * GRID;
const snapDown = (mins) => Math.floor(mins / GRID) * GRID;
const text = (value, max = 200) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const sameId = (a, b) => a != null && b != null && String(a) === String(b);

/** Cleans stored or edited settings. A bedtime at/before wake means midnight. */
export const normalizePlannerSettings = (raw) => {
  const wake = toMinutes(raw?.wake) ?? toMinutes(DEFAULT_PLANNER_SETTINGS.wake);
  let bed = toMinutes(raw?.bed) ?? toMinutes(DEFAULT_PLANNER_SETTINGS.bed);
  if (bed <= wake) bed = DAY_END;
  const busy = (Array.isArray(raw?.busy) ? raw.busy : [])
    .map((b, i) => {
      const start = toMinutes(b?.start);
      const end = toMinutes(b?.end);
      const days = [...new Set((Array.isArray(b?.days) ? b.days : []).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
      if (start == null || end == null || end <= start || !days.length) return null;
      return { id: b.id || `busy_${i}`, label: text(b.label, 40) || 'Busy', days, start: fromMinutes(start), end: fromMinutes(end) };
    })
    .filter(Boolean);
  return { configured: !!raw?.configured, wake: fromMinutes(wake), bed: bed === DAY_END ? '00:00' : fromMinutes(bed), busy };
};

const bedMinutes = (settings) => {
  const bed = toMinutes(settings.bed);
  return bed == null || bed <= toMinutes(settings.wake) ? DAY_END : bed;
};

// ─── Free time ────────────────────────────────────────────────────────────────
/** Merges overlapping [start, end) intervals. */
const mergeIntervals = (intervals) => {
  const sorted = intervals.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const merged = [];
  sorted.forEach((i) => {
    const last = merged[merged.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else merged.push({ start: i.start, end: i.end });
  });
  return merged;
};

/**
 * The plannable window for `dateKey` and the free gaps inside it, in minutes.
 * Today starts at the next 15-minute mark after `now`. Every calendar block
 * counts as busy (done or not), plus the user's fixed busy times for that
 * weekday. No-Phone blocks are free: they're compatible with focused work.
 * Returns { start, end, gaps: [{start,end}], busy: [{start,end,title}] } where
 * busy lists only what overlaps the window.
 */
export const computeFreeGaps = ({ dateKey, settings, endTime, now = new Date(), calendarEvents = [] }) => {
  const s = normalizePlannerSettings(settings);
  const isToday = dateKey === toDateKey(now);
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const start = Math.max(toMinutes(s.wake), isToday ? snapUp(nowMins) : 0);
  const override = toMinutes(endTime);
  const end = override != null && override > 0 ? override : bedMinutes(s);

  const weekday = new Date(`${dateKey}T00:00:00`).getDay();
  const busy = [
    ...expandEventsForDates(calendarEvents, [dateKey]).map((ev) => ({
      start: ev.startHour * 60 + ev.startMin, end: ev.endHour * 60 + ev.endMin, title: ev.title,
    })),
    ...s.busy.filter((b) => b.days.includes(weekday)).map((b) => ({ start: toMinutes(b.start), end: toMinutes(b.end), title: b.label })),
  ].sort((a, b) => a.start - b.start);

  const gaps = [];
  let cursor = start;
  mergeIntervals(busy).forEach((b) => {
    if (b.start > cursor) gaps.push({ start: cursor, end: Math.min(b.start, end) });
    cursor = Math.max(cursor, b.end);
  });
  if (cursor < end) gaps.push({ start: cursor, end });

  return {
    start,
    end,
    gaps: gaps
      .map((g) => ({ start: snapUp(g.start), end: snapDown(g.end) }))
      .filter((g) => g.end - g.start >= MIN_BLOCK),
    // Only what overlaps the window matters (school at 9 is irrelevant at 5pm).
    busy: busy.filter((b) => b.end > start && b.start < end),
  };
};

// ─── Context for the model ────────────────────────────────────────────────────
const habitName = (h) => h.name || h.text || 'Unnamed habit';

/** Tasks worth planning for `dateKey`: due by then, set for today, or this week's. */
const planTasks = (todos, dateKey, plannedTaskIds) => {
  const soon = shiftDateKey(dateKey, 3);
  return (todos || [])
    .filter((t) => !t.completed && !plannedTaskIds.has(String(t.id)))
    .filter((t) => (t.dueDate && t.dueDate <= soon)
      || (t.timeFrame === 'today' && (!t.scheduledDate || t.scheduledDate <= dateKey))
      || t.timeFrame === 'tomorrow'
      || t.timeFrame === 'this-week')
    .slice(0, 30)
    .map((t) => ({
      id: String(t.id),
      text: t.text,
      timeFrame: t.timeFrame,
      ...(t.dueDate ? { dueDate: t.dueDate, overdue: t.dueDate < dateKey } : {}),
      ...(t.goalId != null ? { goalId: String(t.goalId) } : {}),
      ...(t.notes ? { notes: text(t.notes, 160) } : {}),
      ...(t.subtasks?.length ? { subtasksLeft: t.subtasks.filter((st) => !st.completed).length } : {}),
    }));
};

const planGoals = (state, now) => getActiveGoals(state.goals)
  .slice(0, 8)
  .map((g) => {
    const progress = getGoalProgress(g);
    const activity = getGoalActivity(g, state, now);
    const next = getNextStep(g, state.todos || []);
    const left = daysLeft(g, now);
    return {
      id: String(g.id),
      title: g.title,
      ...(g.deadline ? { deadline: g.deadline, daysLeft: left } : {}),
      pinned: !!g.pinned,
      progress: `${progress.done}/${progress.total}${g.unit ? ` ${g.unit}` : ''}`,
      ...(next ? { nextStep: next.text } : {}),
      daysSinceProgress: activity.daysQuiet,
    };
  });

/** Ids of tasks already sitting in an unfinished planned block that day. */
const alreadyPlannedTaskIds = (calendarEvents, dateKey) => new Set(
  expandEventsForDates(calendarEvents || [], [dateKey])
    .filter((ev) => ev.plan?.taskId != null && !ev.completed)
    .map((ev) => String(ev.plan.taskId)),
);

export const buildPlanContext = (state, { dateKey, settings, endTime, now = new Date() }) => {
  const free = computeFreeGaps({ dateKey, settings, endTime, now, calendarEvents: state.calendarEvents });
  const insights = computeFocusInsights(state.pomodoroSessions, now);
  const isToday = dateKey === toDateKey(now);
  const reviews = state.weeklyReviews || {};
  const latestReview = Object.keys(reviews).sort().pop();
  const durations = (state.pomodoroSessions || []).filter((s) => s.completed).slice(0, 20).map((s) => Math.round(s.durationSecs / 60)).sort((a, b) => a - b);

  return {
    name: state.user?.name || 'you',
    date: dateKey,
    weekday: new Date(`${dateKey}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long' }),
    now: isToday ? fromMinutes(now.getHours() * 60 + now.getMinutes()) : null,
    window: `${fromMinutes(free.start)}-${fromMinutes(free.end)}`,
    freeGaps: free.gaps.map((g) => `${fromMinutes(g.start)}-${fromMinutes(g.end)}`),
    alreadyBooked: free.busy.map((b) => `${fromMinutes(b.start)}-${fromMinutes(b.end)} ${b.title}`),
    tasks: planTasks(state.todos, dateKey, alreadyPlannedTaskIds(state.calendarEvents, dateKey)),
    goals: planGoals(state, now),
    habits: (state.habits || [])
      .filter((h) => !isToday || !h.history?.[dateKey])
      .map((h) => ({ id: String(h.id), name: habitName(h), streak: getHabitStreak({ ...h, history: h.history || {} }) })),
    focus: {
      bestWindows: insights.best.map((w) => `${w.from}-${w.to}`),
      finishRate: insights.successRate == null ? null : Math.round(insights.successRate * 100),
      topBlockers: insights.topBlockers.map((b) => b.label),
      typicalSessionMinutes: durations.length ? durations[Math.floor(durations.length / 2)] : null,
    },
    northStar: state.user?.northStar?.vision || null,
    weekPriority: latestReview ? reviews[latestReview]?.priority?.trim() || null : null,
    memory: (state.assistantMemory || []).filter((m) => m.kind === 'preference' || m.kind === 'pattern').map((m) => m.text).slice(0, 15),
  };
};

// ─── The model call ───────────────────────────────────────────────────────────
const STR = (description) => ({ type: 'STRING', description });

export const PLAN_SCHEMA = {
  type: 'OBJECT',
  properties: {
    summary: STR('1-2 sentences: the shape of the day and why, citing their data (best focus window, deadline, stalled goal). Under 40 words.'),
    blocks: {
      type: 'ARRAY',
      description: 'The plan in time order.',
      items: {
        type: 'OBJECT',
        properties: {
          kind: { type: 'STRING', enum: PLAN_KINDS },
          title: STR('Short block title, under 50 characters. For a task, its text (shortened if needed).'),
          start: STR('HH:MM 24h on a 15-minute boundary, inside a free gap.'),
          end: STR('HH:MM 24h, after start, inside the same free gap.'),
          taskId: STR('For kind=task: the task id. Omit otherwise.'),
          goalId: STR('For kind=goal: the goal id. Omit otherwise.'),
          habitId: STR('For kind=habit: the habit id. Omit otherwise.'),
          intent: STR('What "done" looks like at the end of this block, as one concrete sentence they can check. Empty for breaks.'),
          reason: STR('Why this slot, under 15 words.'),
        },
        required: ['kind', 'title', 'start', 'end'],
        propertyOrdering: ['kind', 'title', 'start', 'end', 'taskId', 'goalId', 'habitId', 'intent', 'reason'],
      },
    },
    unscheduled: {
      type: 'ARRAY',
      description: "Important items that didn't fit, with why. Empty if everything fit.",
      items: { type: 'OBJECT', properties: { title: STR('Item.'), reason: STR('Why it was left out, under 15 words.') }, required: ['title', 'reason'] },
    },
  },
  required: ['summary', 'blocks', 'unscheduled'],
  propertyOrdering: ['summary', 'blocks', 'unscheduled'],
};

export const buildPlanSystemPrompt = (name) => `You are ${name}'s planning coach inside their self-improvement app "APEX". Build a realistic, time-blocked plan for the day you're given.

RULES:
- Only use the free gaps listed. Never overlap "alreadyBooked". Start and end on 15-minute boundaries.
- Hardest, most important work goes in their best focus windows (focus.bestWindows). If there's no history, mornings are a safe default.
- Priority: overdue or due-soon tasks, then this week's #1 priority, pinned goals and goals with a close deadline (daysLeft), then other tasks. A goal with many daysSinceProgress deserves a goal block even with no task for it; use its nextStep as the intent.
- Deep work blocks are 25-90 minutes; small tasks can share one 30-minute admin block. After any block of 50+ minutes, add a 10-15 minute break (kind=break).
- Habits not done yet get short blocks (15 minutes) at sensible times.
- Leave slack: fill at most about 75% of the free time. Don't plan the last 30 minutes before bed.
- If focus.finishRate is low or focus.topBlockers shows "Task too big"/"Unclear next step", make blocks shorter and intents smaller and more concrete.
- Every non-break block gets an intent: a concrete, checkable outcome ("Draft intro + 2 sections of the essay"), not a restatement of the title.
- Respect what memory says about how they like to work.
- If something important can't fit, put it in unscheduled instead of cramming.
- Plain text only, no markdown.`;

// ─── Validation ───────────────────────────────────────────────────────────────
const fitsGap = (block, gaps) => gaps.some((g) => block.start >= g.start && block.end <= g.end);
const overlaps = (a, b) => a.start < b.end && b.start < a.end;

/** True if `block` (minutes) sits inside a free gap and overlaps none of `others`. */
export const canPlace = (block, others, gaps) =>
  block.end > block.start && fitsGap(block, gaps) && !others.some((o) => o.id !== block.id && overlaps(block, o));

/**
 * Turns the model's JSON into a safe plan: times snapped to the grid and clipped to
 * the free gap they start in, overlaps dropped, unknown ids removed.
 * Returns { summary, blocks, unscheduled, dropped }.
 */
export const normalizePlan = (raw, { gaps, tasks = [], goals = [], habits = [] }) => {
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const accepted = [];
  let dropped = 0;

  const candidates = (Array.isArray(data?.blocks) ? data.blocks : [])
    .map((b) => ({ ...b, startMins: toMinutes(b?.start), endMins: toMinutes(b?.end) }))
    .filter((b) => b.startMins != null && b.endMins != null)
    .sort((a, b) => a.startMins - b.startMins);
  dropped += (Array.isArray(data?.blocks) ? data.blocks.length : 0) - candidates.length;

  candidates.forEach((b, i) => {
    const kind = PLAN_KINDS.includes(b.kind) ? b.kind : 'task';
    // Breaks only live in the preview, so they may sit on a 5-minute grid.
    const step = kind === 'break' ? 5 : GRID;
    if (b.endMins <= b.startMins) { dropped++; return; }
    let start = Math.floor(b.startMins / step) * step;
    // Length as asked for, rounded to the grid and capped.
    const duration = Math.min(MAX_BLOCK, Math.max(step, Math.round((b.endMins - b.startMins) / step) * step));
    const gap = gaps.find((g) => start >= g.start && start < g.end) || gaps.find((g) => g.start >= start && g.start < start + duration);
    if (!gap) { dropped++; return; }
    start = Math.max(start, gap.start);
    // A block that starts inside the previous one slides later, keeping its
    // length as far as the gap allows.
    const prev = accepted[accepted.length - 1];
    if (prev && start < prev.end) start = Math.ceil(prev.end / step) * step;
    const end = Math.min(start + duration, gap.end);
    if (end - start < (kind === 'break' ? 5 : MIN_BLOCK)) { dropped++; return; }

    const task = kind === 'task' ? tasks.find((t) => sameId(t.id, b.taskId)) : null;
    const goal = kind === 'goal' ? goals.find((g) => sameId(g.id, b.goalId)) : null;
    const habit = kind === 'habit' ? habits.find((h) => sameId(h.id, b.habitId)) : null;

    accepted.push({
      id: `pb_${i}_${start}`,
      kind,
      title: text(b.title, 60) || task?.text?.slice(0, 60) || goal?.title?.slice(0, 60) || habit?.name || (kind === 'break' ? 'Break' : 'Focus block'),
      start,
      end,
      ...(task ? { taskId: task.id } : {}),
      ...(goal ? { goalId: goal.id } : {}),
      ...(habit ? { habitId: habit.id } : {}),
      intent: kind === 'break' ? '' : text(b.intent, 200),
      reason: text(b.reason, 120),
    });
  });

  if (accepted.length > MAX_BLOCKS) {
    dropped += accepted.length - MAX_BLOCKS;
    accepted.length = MAX_BLOCKS;
  }
  const summary = text(data?.summary, 400);
  if (!accepted.some((b) => b.kind !== 'break')) {
    throw new Error("The plan came back empty — there may not be enough free time left today. Try a later end time or plan tomorrow.");
  }
  return {
    summary,
    blocks: accepted,
    unscheduled: (Array.isArray(data?.unscheduled) ? data.unscheduled : [])
      .map((u) => ({ title: text(u?.title, 80), reason: text(u?.reason, 120) }))
      .filter((u) => u.title)
      .slice(0, 6),
    dropped,
  };
};

/** Moves one block by `delta` minutes if it still fits; returns the new blocks or null. */
export const shiftPlanBlock = (blocks, blockId, delta, gaps) => {
  const block = blocks.find((b) => b.id === blockId);
  if (!block) return null;
  const moved = { ...block, start: block.start + delta, end: block.end + delta };
  if (!canPlace(moved, blocks, gaps)) return null;
  return blocks.map((b) => (b.id === blockId ? moved : b)).sort((a, b) => a.start - b.start);
};

/**
 * Calendar events for the non-break blocks. Each carries `plan` so the Calendar
 * can show it as planned and offer "Start focus" with the intent prefilled.
 */
export const planToEvents = (blocks, { dateKey, planId, makeId = () => Date.now() + Math.floor(Math.random() * 10_000) }) => {
  const used = new Set();
  return blocks.filter((b) => b.kind !== 'break').map((b) => {
    let id = makeId();
    while (used.has(id)) id += 1;
    used.add(id);
    return {
      id,
      title: b.title,
      date: dateKey,
      startHour: Math.floor(b.start / 60), startMin: b.start % 60,
      endHour: Math.floor(b.end / 60), endMin: b.end % 60,
      xpAmount: 20,
      recurrence: 'none',
      recurrenceDays: [],
      notes: [b.intent && `Goal: ${b.intent}`, b.reason].filter(Boolean).join('\n'),
      subEvents: [],
      bonusTasks: [],
      completed: false,
      completedDates: [],
      plan: {
        id: planId,
        kind: b.kind,
        intent: b.intent,
        ...(b.taskId ? { taskId: b.taskId } : {}),
        ...(b.goalId ? { goalId: b.goalId } : {}),
        ...(b.habitId ? { habitId: b.habitId } : {}),
      },
    };
  });
};

/**
 * Builds a plan proposal for one day. `generate` is injected (geminiGenerateJson
 * in the app) so this stays testable. Nothing is written; the caller shows it.
 */
export const generateDayPlan = async ({ state, dateKey, settings, endTime, generate, now = new Date() }) => {
  const context = buildPlanContext(state, { dateKey, settings, endTime, now });
  const { gaps } = computeFreeGaps({ dateKey, settings, endTime, now, calendarEvents: state.calendarEvents });
  if (!gaps.length) throw new Error('No free time left in that window. Pick a later end time, or plan another day.');

  const response = await generate({
    systemPrompt: buildPlanSystemPrompt(context.name),
    contents: [{ role: 'user', parts: [{ text: `Plan my day for ${dateKey}. Here is everything you need, as JSON:\n${JSON.stringify(context)}` }] }],
    schema: PLAN_SCHEMA,
  });
  const plan = normalizePlan(response.text, {
    gaps, tasks: context.tasks, goals: context.goals, habits: context.habits,
  });
  return {
    ...plan,
    id: `plan_${now.getTime()}`,
    dateKey,
    gaps,
    generatedAt: now.getTime(),
    insightsLine: describeBestWindows(computeFocusInsights(state.pomodoroSessions, now)),
  };
};
