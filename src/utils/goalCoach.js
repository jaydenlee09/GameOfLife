// ─── My Assistant as a goal coach ─────────────────────────────────────────────
// Four tool-free structured-JSON calls (like the Daily Log review), so none of them
// can change anything by themselves:
//   draftGoal        rough idea → a full, editable goal (measure, milestones, this
//                    week's tasks, a habit, obstacle + if-then plan)
//   suggestNextStep  the one next milestone when a goal has run out of steps
//   getUnstuck       the smallest step for a goal that has gone quiet or fallen behind
//   recalibrate      Sunday: plan vs what happened, as a few concrete changes
// Everything the model returns is validated here (dates, lengths, ids), and the
// UI applies a suggestion only when the user taps it. No path pays XP: steps the
// coach adds pay when they're completed, like any other.

import {
  describeGoal, getGoalActivity, getGoalPace, getGoalProgress, getActiveGoals, getFocusGoals,
  goalDateKey, makeGoal, patchGoal, addMilestone, paceLabel,
} from './goalUtils';
import { makeTask } from './taskUtils';
import { computeFreeGaps, planToEvents } from './dayPlanner';

const STR = (description) => ({ type: 'STRING', description });
const INT = (description) => ({ type: 'INTEGER', description });
const ENUM = (values, description) => ({ type: 'STRING', enum: values, description });
const ARR = (items, description) => ({ type: 'ARRAY', items, description });

export const HOURS_PER_WEEK = [
  { id: '1', label: '1h a week', hours: 1 },
  { id: '3', label: '3h a week', hours: 3 },
  { id: '5', label: '5h+ a week', hours: 5 },
];

const MAX_MILESTONES = 6;
const MAX_TASKS = 2;
const MAX_CHANGES = 3;
const MAX_DEADLINE_YEARS = 3;

// ─── Shared helpers ──────────────────────────────────────────────────────────

const toText = (value, max) => {
  const t = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  return t.length > max ? `${t.slice(0, max - 1).replace(/\s+\S*$/, '')}…` : t;
};

const parse = (raw) => (typeof raw === 'string' ? JSON.parse(raw || '{}') : raw || {});

const shiftKey = (key, days) => {
  const [y, m, d] = key.split('-').map(Number);
  return goalDateKey(new Date(y, m - 1, d + days));
};

/** A YYYY-MM-DD that's after today and within a few years, else null. */
const futureDate = (value, now) => {
  const key = typeof value === 'string' ? value.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  if (goalDateKey(date) !== key) return null;
  const today = goalDateKey(now);
  return key > today && key <= shiftKey(today, MAX_DEADLINE_YEARS * 365) ? key : null;
};

const uniqueTexts = (list, max, maxLen) => {
  const seen = new Set();
  return (Array.isArray(list) ? list : [])
    .map((x) => toText(x, maxLen))
    .filter((x) => x && !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase()))
    .slice(0, max);
};

const habitName = (h) => h?.name || h?.text || '';

const recentEvents = (goal, state, now, days = 14) => {
  const since = shiftKey(goalDateKey(now), -days);
  return getGoalActivity(goal, state, now).events
    .filter((e) => e.date >= since)
    .slice(0, 12)
    .map((e) => `${e.date} ${e.kind}${e.label ? `: ${toText(e.label, 60)}` : ''}${e.minutes ? ` (${e.minutes}m)` : ''}`);
};

const goalFacts = (goal, state, now) => ({
  title: goal.title,
  summary: describeGoal(goal, state, now),
  deadline: goal.deadline || null,
  ...(goal.targetValue != null ? { number: `${goal.currentValue || 0}/${goal.targetValue}${goal.unit ? ` ${goal.unit}` : ''}` } : {}),
  milestonesDone: (goal.milestones || []).filter((m) => m.completed).map((m) => m.text),
  milestonesOpen: (goal.milestones || []).filter((m) => !m.completed).map((m) => m.text),
  openTasks: (state.todos || []).filter((t) => String(t.goalId) === String(goal.id) && !t.completed).map((t) => t.text).slice(0, 6),
  recentProgress: recentEvents(goal, state, now),
  ...(goal.obstacle ? { obstacle: goal.obstacle } : {}),
  ...(goal.ifThenPlan ? { ifThenPlan: goal.ifThenPlan } : {}),
});

const baseContext = (state, now) => ({
  today: `${goalDateKey(now)} (${now.toLocaleDateString('en-US', { weekday: 'long' })})`,
  northStar: state.user?.northStar?.vision?.trim() || null,
});

const COACH_VOICE = `Speak to them as "you". Plain text, no markdown, no emojis. Be concrete: real numbers, real dates, verbs. Never invent facts about them; use only what's in the data.`;

const run = async (generate, { systemPrompt, context, schema }) => {
  const response = await generate({
    contents: [{ role: 'user', parts: [{ text: JSON.stringify(context) }] }],
    systemPrompt,
    schema,
  });
  return parse(response?.text);
};

// ─── 1. Draft a goal from a rough idea ───────────────────────────────────────

export const DRAFT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: STR('The goal, specific and measurable, in their voice. Max 70 characters. E.g. "Run a sub-25 minute 5k".'),
    deadline: STR('A realistic finish date, YYYY-MM-DD, after today. Use their own timing if they gave one.'),
    why: STR('One sentence on why this matters to them, tied to their North Star if it genuinely fits. Max 25 words.'),
    measureKind: ENUM(['number', 'milestones'], 'number when progress is one countable quantity (miles, books, dollars, kg); milestones otherwise.'),
    target: INT('For number: the target amount. Omit for milestones.'),
    unit: STR('For number: the unit, plural, lowercase (miles, books). Omit for milestones.'),
    milestones: ARR(STR('A milestone: a checkable result, not an activity. Max 70 characters.'), 'For milestones: 3-6 in order. The first must be doable this week within their time budget. Empty for number.'),
    tasks: ARR(STR('A concrete task for THIS week, starting with a verb. Max 80 characters.'), '1-2 tasks that start the goal this week. Not copies of milestones.'),
    habitExistingId: STR('Id of one of their existing habits that directly drives this goal, if any. Omit otherwise.'),
    habitNewName: STR('Only if no existing habit fits and a small DAILY habit would drive this goal: its name, max 30 characters (e.g. "Read 10 pages"). Omit otherwise.'),
    obstacle: STR('The inner obstacle most likely to stop them (a feeling, habit or excuse, not bad luck). Max 20 words.'),
    ifThenPlan: STR('"If <obstacle shows up>, then I will <specific action>." Max 25 words.'),
  },
  required: ['title', 'deadline', 'why', 'measureKind', 'milestones', 'tasks', 'obstacle', 'ifThenPlan'],
  propertyOrdering: ['title', 'deadline', 'why', 'measureKind', 'target', 'unit', 'milestones', 'tasks', 'habitExistingId', 'habitNewName', 'obstacle', 'ifThenPlan'],
};

export const buildDraftSystemPrompt = (name) => `You are ${name}'s goal coach inside their self-improvement app "APEX". They typed a rough goal. Turn it into a goal they can start this week, so they don't have to do the planning themselves.

RULES:
- Make it specific and measurable (Locke & Latham): a clear finish line, not "get better at".
- Size it to their time budget (hoursPerWeek). If none is given, assume about 3 hours a week. Pick a deadline that is ambitious but realistic for that budget; if they named a timeframe, respect it.
- Milestones are results in order, roughly evenly spaced to the deadline. The first one must fit in this week.
- This week's tasks are the very first actions, small enough to finish in one sitting.
- Prefer one of their existing habits (by id) over a new one, and only suggest a habit if doing it daily clearly drives the goal.
- The obstacle is inner (Oettingen's WOOP): what in them is most likely to get in the way. The if-then plan names the trigger and the exact response.
- If they described where they're starting from, build on it.
${COACH_VOICE}`;

export const buildDraftContext = (state, { text, hoursPerWeek = null, startingPoint = '' }, now = new Date()) => ({
  ...baseContext(state, now),
  roughGoal: toText(text, 200),
  hoursPerWeek,
  ...(startingPoint?.trim() ? { startingPoint: toText(startingPoint, 200) } : {}),
  otherGoals: getActiveGoals(state.goals).slice(0, 6).map((g) => g.title),
  habits: (state.habits || []).map((h) => ({ id: String(h.id), name: habitName(h) })),
});

/** The model's draft, validated into what the draft editor shows. */
export const normalizeDraft = (raw, { text, habits = [], now = new Date() }) => {
  const data = parse(raw);
  const title = toText(data.title, 90) || toText(text, 90);
  if (!title) throw new Error('The draft came back empty. Try again.');
  const target = Number.isFinite(Number(data.target)) ? Math.round(Number(data.target)) : 0;
  const isNumber = data.measureKind === 'number' && target > 0;
  const milestones = isNumber ? [] : uniqueTexts(data.milestones, MAX_MILESTONES, 90);

  let habit = null;
  const existing = habits.find((h) => String(h.id) === String(data.habitExistingId));
  const newName = toText(data.habitNewName, 40);
  const sameName = newName && habits.find((h) => habitName(h).trim().toLowerCase() === newName.toLowerCase());
  if (existing) habit = { existingId: existing.id, name: habitName(existing) };
  else if (sameName) habit = { existingId: sameName.id, name: habitName(sameName) };
  else if (newName) habit = { newName };

  return {
    title,
    deadline: futureDate(data.deadline, now),
    why: toText(data.why, 200),
    measure: isNumber ? { kind: 'number', target, unit: toText(data.unit, 20).toLowerCase() } : { kind: 'milestones' },
    milestones,
    tasks: uniqueTexts(data.tasks, MAX_TASKS, 120),
    habit,
    obstacle: toText(data.obstacle, 200),
    ifThenPlan: toText(data.ifThenPlan, 220),
  };
};

export const generateGoalDraft = async ({ state, input, generate, now = new Date() }) => {
  if (!input?.text?.trim()) throw new Error('Type the goal first.');
  const raw = await run(generate, {
    systemPrompt: buildDraftSystemPrompt(state.user?.name || 'the user'),
    context: buildDraftContext(state, input, now),
    schema: DRAFT_SCHEMA,
  });
  return normalizeDraft(raw, { text: input.text, habits: state.habits || [], now });
};

/**
 * What tapping "Create goal" does, as data: the goal, the tasks to add, and the
 * habit to create or link. `draft` is the edited draft; `includeTasks` / `includeHabit`
 * are the editor's toggles.
 */
export const draftToRecords = (draft, { includeTasks = true, includeHabit = true, now = Date.now() } = {}) => {
  let goal = makeGoal({ title: draft.title, deadline: draft.deadline || null, now });
  goal = patchGoal(goal, {
    notes: draft.why || '',
    obstacle: draft.obstacle || '',
    ifThenPlan: draft.ifThenPlan || '',
    ...(draft.measure?.kind === 'number' && draft.measure.target > 0
      ? { targetValue: draft.measure.target, unit: draft.measure.unit || '', currentValue: 0 }
      : {}),
  }, now);
  (draft.measure?.kind === 'number' ? [] : draft.milestones || []).forEach((text, i) => {
    goal = addMilestone(goal, text, now + i + 1);
  });
  const tasks = includeTasks
    ? (draft.tasks || []).map((text, i) => ({ ...makeTask({ text, when: 'this-week', now: now + 10 + i }), goalId: goal.id }))
    : [];
  const habit = !includeHabit || !draft.habit ? null
    : draft.habit.existingId != null
      ? { linkId: draft.habit.existingId }
      : { create: { id: now + 20, name: draft.habit.newName, history: {}, goalId: goal.id } };
  return { goal, tasks, habit };
};

// ─── 2. The next step when a goal has run out of them ────────────────────────

export const NEXT_STEP_SCHEMA = {
  type: 'OBJECT',
  properties: {
    text: STR('The next milestone: a checkable result that moves the goal forward from where it is now. Max 70 characters.'),
    why: STR('Why this is the right next step, from their progress. Max 18 words.'),
  },
  required: ['text', 'why'],
  propertyOrdering: ['text', 'why'],
};

export const buildNextStepSystemPrompt = (name) => `You are ${name}'s goal coach inside their self-improvement app "APEX". One of their goals has no open step left. Suggest the single next step (for a goal measured by a number, a concrete task for this week that raises the number; otherwise the next milestone), building on what's done (milestonesDone, recentProgress) and sized so it can be finished within a week or two. Never repeat a done milestone.
${COACH_VOICE}`;

const normalizeStep = (raw, goal) => {
  const data = parse(raw);
  const text = toText(data.text, 90);
  if (!text) throw new Error('No step came back. Try again.');
  if ((goal.milestones || []).some((m) => m.text.trim().toLowerCase() === text.toLowerCase())) {
    throw new Error('It suggested a step you already have. Try again.');
  }
  return { text, why: toText(data.why, 140) };
};

export const generateNextStep = async ({ state, goal, generate, now = new Date() }) => {
  const raw = await run(generate, {
    systemPrompt: buildNextStepSystemPrompt(state.user?.name || 'the user'),
    context: { ...baseContext(state, now), goal: goalFacts(goal, state, now) },
    schema: NEXT_STEP_SCHEMA,
  });
  return normalizeStep(raw, goal);
};

// ─── 3. Get unstuck ──────────────────────────────────────────────────────────

export const UNSTUCK_SCHEMA = {
  type: 'OBJECT',
  properties: {
    step: STR('The smallest useful step, doable in one sitting today: starts with a verb, names exactly what to do. Max 80 characters.'),
    minutes: INT('How long it takes: 5 to 30.'),
    why: STR('One line on why this gets it moving again, from their data. Max 20 words.'),
  },
  required: ['step', 'minutes', 'why'],
  propertyOrdering: ['step', 'minutes', 'why'],
};

export const buildUnstuckSystemPrompt = (name) => `You are ${name}'s goal coach inside their self-improvement app "APEX". This goal has stalled (gone quiet or fallen behind pace). Give the smallest step that restarts momentum: lower the bar until it's almost too easy, 5-30 minutes, today. If their obstacle or if-then plan fits, use it.
${COACH_VOICE}`;

export const generateUnstuck = async ({ state, goal, generate, now = new Date() }) => {
  const a = getGoalActivity(goal, state, now);
  const raw = await run(generate, {
    systemPrompt: buildUnstuckSystemPrompt(state.user?.name || 'the user'),
    context: { ...baseContext(state, now), goal: { ...goalFacts(goal, state, now), daysQuiet: a.daysQuiet } },
    schema: UNSTUCK_SCHEMA,
  });
  const data = parse(raw);
  const step = toText(data.step, 120);
  if (!step) throw new Error('No step came back. Try again.');
  const minutes = Math.min(30, Math.max(5, Math.round(Number(data.minutes) / 5) * 5 || 15));
  return { step, minutes, why: toText(data.why, 140) };
};

// ─── 4. Weekly recalibration ─────────────────────────────────────────────────

export const CHANGE_TYPES = ['moveDeadline', 'setTarget', 'addMilestone', 'dropMilestone', 'addTask'];

export const RECALIBRATE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    goals: ARR({
      type: 'OBJECT',
      properties: {
        goalId: STR('The goal id from the data.'),
        verdict: STR('One honest sentence on how the week went for this goal, citing the numbers. Max 25 words.'),
        changes: ARR({
          type: 'OBJECT',
          properties: {
            type: ENUM(CHANGE_TYPES, 'moveDeadline (date), setTarget (target, number goals only), addMilestone (text), dropMilestone (milestoneId of an open milestone), addTask (text, for next week).'),
            date: STR('moveDeadline: the new YYYY-MM-DD.'),
            target: INT('setTarget: the new target.'),
            text: STR('addMilestone / addTask: the text, max 80 characters.'),
            milestoneId: STR('dropMilestone: the id.'),
            reason: STR('Why, in under 15 words.'),
          },
          required: ['type', 'reason'],
        }, 'At most 3. Empty when the plan is working.'),
      },
      required: ['goalId', 'verdict', 'changes'],
    }, 'One entry per goal in the data.'),
  },
  required: ['goals'],
};

export const buildRecalibrateSystemPrompt = (name) => `You are ${name}'s goal coach inside their self-improvement app "APEX". It's their weekly review. For each goal, compare the plan (deadline, pace, milestones, tasks) with what actually happened this week, and recalibrate so next week is realistic.

RULES:
- Be honest and specific: cite what they did (thingsDone, focus minutes, pace).
- If they're behind, prefer making next week smaller and concrete (an addTask, a smaller addMilestone) before moving the deadline. Move the deadline only when the pace makes it clearly unreachable.
- If it's going well, say so and change nothing, or add the next step.
- Every goal needs at least one concrete step for next week: if it has no open milestone or task, add one. For goals with a number, add tasks, not milestones.
- Use only ids from the data. Max 3 changes per goal.
${COACH_VOICE}`;

export const buildRecalibrateContext = (state, now = new Date()) => ({
  ...baseContext(state, now),
  goals: getFocusGoals(state.goals).map((g) => {
    const a = getGoalActivity(g, state, now);
    const pace = getGoalPace(g, now);
    return {
      id: String(g.id),
      ...goalFacts(g, state, now),
      openMilestones: (g.milestones || []).filter((m) => !m.completed).map((m) => ({ id: String(m.id), text: m.text })),
      last7Days: { thingsDone: a.weekCount, focusMinutes: a.weekMinutes },
      pace: paceLabel(pace),
      progress: `${Math.round(getGoalProgress(g).ratio * 100)}%`,
    };
  }),
});

/** One validated change, or null when it doesn't apply to this goal. */
const normalizeChange = (c, goal, now) => {
  const reason = toText(c?.reason, 120);
  if (c?.type === 'moveDeadline') {
    const date = futureDate(c.date, now);
    return date && date !== goal.deadline ? { type: 'moveDeadline', date, reason } : null;
  }
  if (c?.type === 'setTarget') {
    const target = Math.round(Number(c.target));
    return goal.targetValue != null && target > 0 && target !== goal.targetValue ? { type: 'setTarget', target, reason } : null;
  }
  if (c?.type === 'addMilestone' || c?.type === 'addTask') {
    const text = toText(c.text, 90);
    // A number goal's % comes from the number: a milestone would replace it, so it's a task.
    const type = c.type === 'addMilestone' && goal.targetValue != null ? 'addTask' : c.type;
    return text ? { type, text, reason } : null;
  }
  if (c?.type === 'dropMilestone') {
    const m = (goal.milestones || []).find((x) => String(x.id) === String(c.milestoneId) && !x.completed);
    return m ? { type: 'dropMilestone', milestoneId: m.id, text: m.text, reason } : null;
  }
  return null;
};

export const normalizeRecalibration = (raw, goals, now = new Date()) => {
  const data = parse(raw);
  const byId = new Map(goals.map((g) => [String(g.id), g]));
  const seen = new Set();
  const out = (Array.isArray(data.goals) ? data.goals : []).map((entry) => {
    const goal = byId.get(String(entry?.goalId));
    if (!goal || seen.has(String(goal.id))) return null;
    seen.add(String(goal.id));
    const changes = (Array.isArray(entry.changes) ? entry.changes : [])
      .map((c) => normalizeChange(c, goal, now))
      .filter(Boolean)
      .slice(0, MAX_CHANGES)
      .map((c, i) => ({ ...c, id: `${goal.id}_${i}` }));
    return { goalId: goal.id, title: goal.title, verdict: toText(entry.verdict, 200), changes };
  }).filter(Boolean);
  if (!out.length) throw new Error('The review came back empty. Try again.');
  return out;
};

export const generateRecalibration = async ({ state, generate, now = new Date() }) => {
  const context = buildRecalibrateContext(state, now);
  if (!context.goals.length) throw new Error('No open goals to review.');
  const raw = await run(generate, {
    systemPrompt: buildRecalibrateSystemPrompt(state.user?.name || 'the user'),
    context,
    schema: RECALIBRATE_SCHEMA,
  });
  return { at: now.getTime(), goals: normalizeRecalibration(raw, getFocusGoals(state.goals), now) };
};

/** Applies one change: returns { goal } (the updated goal) and/or { task } (to add). */
export const applyCoachChange = (goal, change, now = Date.now()) => {
  if (change.type === 'moveDeadline') return { goal: patchGoal(goal, { deadline: change.date }, now) };
  if (change.type === 'setTarget') return { goal: patchGoal(goal, { targetValue: change.target }, now) };
  if (change.type === 'addMilestone') return { goal: addMilestone(goal, change.text, now) };
  if (change.type === 'dropMilestone') {
    return { goal: patchGoal(goal, { milestones: (goal.milestones || []).filter((m) => String(m.id) !== String(change.milestoneId) || m.completed) }, now) };
  }
  if (change.type === 'addTask') return { task: { ...makeTask({ text: change.text, when: 'this-week', now }), goalId: goal.id } };
  return {};
};

/** Short label for a change ("Move deadline to Nov 30"). */
export const changeLabel = (change) => {
  if (change.type === 'moveDeadline') {
    const [y, m, d] = change.date.split('-').map(Number);
    return `Move deadline to ${new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  }
  if (change.type === 'setTarget') return `Change target to ${change.target}`;
  if (change.type === 'addMilestone') return `Add milestone: ${change.text}`;
  if (change.type === 'dropMilestone') return `Drop milestone: ${change.text}`;
  if (change.type === 'addTask') return `Add task: ${change.text}`;
  return change.type;
};

// ─── Scheduling an unstuck step ──────────────────────────────────────────────

/**
 * The step as a goal time block in the first free gap that fits: today from the
 * next quarter hour, else tomorrow. Uses Plan My Day's free-time rules (wake/bed,
 * fixed busy times, existing blocks). Returns { event, dateKey } or null.
 */
export const scheduleStep = ({ goal, step, minutes, calendarEvents = [], settings, now = new Date() }) => {
  const length = Math.max(15, Math.ceil(minutes / 15) * 15);
  const today = goalDateKey(now);
  for (const dateKey of [today, shiftKey(today, 1)]) {
    const { gaps } = computeFreeGaps({ dateKey, settings, now, calendarEvents });
    const gap = gaps.find((g) => g.end - g.start >= length);
    if (!gap) continue;
    const [event] = planToEvents(
      [{ kind: 'goal', title: toText(step, 60), start: gap.start, end: gap.start + length, goalId: goal.id, intent: step, reason: '' }],
      { dateKey, planId: `coach_${now.getTime()}` },
    );
    return { event, dateKey };
  }
  return null;
};
