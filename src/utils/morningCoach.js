// ─── Daily Log: the morning coach ─────────────────────────────────────────────
// Three small tool-free structured-JSON calls around the morning journal, so none
// of them can change anything by itself. You still write the plan; the coach
// challenges it. Saved on `entry.morning` by the caller:
//   coach     { read, winOptions, obstacle, plan, generatedAt }   once per morning
//   winCheck  { forWin, verdict, feedback, rewrite, freeMinutes, at }   on Lock in
//   rescue    { forWin, note, step, count, at, dismissed }   on "Off track?" from Home
// Pure (`generate` is injected), so all of it can be checked in plain node.

import { computeDailyScore, shiftDateKey } from './scoreUtils';
import { getFocusGoal, getNextStep } from './goalUtils';
import { getTool } from './assistantTools';
import { computeFreeGaps } from './dayPlanner';
import { getYesterdayCommitment } from './homeUtils';
import { getImproveHistory } from './logPatterns';
import { isTop, todayQueue } from './taskUtils';
import { getMorningPatterns, getPatternLines, lowerFirst, morningIfThen, WIN_RESULT_LABELS, PLAN_HELD_LABELS } from './morningJournal';

const HISTORY_DAYS = 14;
const MAX_TASKS = 10;
export const RESCUE_MINUTES = 10;
export const WIN_VERDICTS = ['clear', 'vague', 'too_big'];

const STR = (description) => ({ type: 'STRING', description });

const toText = (value, max) => {
  const t = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  return t.length > max ? `${t.slice(0, max - 1).replace(/\s+\S*$/, '')}…` : t;
};
const parse = (raw) => (typeof raw === 'string' ? JSON.parse(raw || '{}') : raw || {});
const noEndPunctuation = (s) => s.replace(/[\s.,;:!]+$/, '').trim();

// The UI puts these right after "Today is a win if I…", "If … gets in the way" and "I will…".
const asWin = (text) => lowerFirst(noEndPunctuation(text.replace(/^(today is a win if\s+)?(i\s+)?/i, '')));
const asObstacle = (text) => lowerFirst(noEndPunctuation(text.replace(/^(if|when)\s+/i, '').replace(/\s+gets? in the way[.!]?$/i, '')));
const asPlan = (text) => lowerFirst(noEndPunctuation(text.replace(/^i\s+will\s+/i, '')));

/** Minutes still free today, from the same rules Plan My Day schedules with. */
export const freeMinutesLeft = (state, dateKey, now = new Date()) => computeFreeGaps({
  dateKey, now, settings: state.user?.planner, calendarEvents: state.calendarEvents || [],
}).gaps.reduce((sum, g) => sum + (g.end - g.start), 0);

const calendarToday = (state, dateKey) => getTool('get_calendar')
  .run({ from: dateKey, to: dateKey }, { state })
  .blocks.map(({ time, title, done }) => ({ time, title, done }));

const tasksToday = (state, dateKey) => todayQueue(state.todos || [], dateKey)
  .slice(0, MAX_TASKS)
  .map((t) => (isTop(t, dateKey) ? `[Top 3] ${t.text}` : t.text));

const focusGoalContext = (state) => {
  const goal = getFocusGoal(state.goals);
  if (!goal) return null;
  return { title: goal.title, nextStep: getNextStep(goal, state.todos || [])?.text || null };
};

// ─── Part 1: the coach's read ─────────────────────────────────────────────────

export const COACH_SCHEMA = {
  type: 'OBJECT',
  properties: {
    read: STR('2 sentences, max 45 words: what today calls for, based on how they woke up and how their recent days went. Cite something real (a number, a repeat, last night\'s promise). If the data says to go smaller today, say so.'),
    winOptions: { type: 'ARRAY', items: STR('Reads right after "Today is a win if I". Lowercase start, starts with a verb, checkable tonight with a yes or no, max 12 words.'), description: '3 different options, using the real names of their tasks, goals or blocks.' },
    obstacle: STR('The thing most likely to knock them off track today, from their own history. A short noun phrase that reads in "If ___ gets in the way". Max 8 words.'),
    plan: STR('What they will do when it happens. Reads after "I will". Lowercase start, a concrete action they can do on the spot, max 14 words.'),
  },
  required: ['read', 'winOptions', 'obstacle', 'plan'],
  propertyOrdering: ['read', 'winOptions', 'obstacle', 'plan'],
};

export const buildCoachSystemPrompt = (name) => `You are ${name}'s coach inside their self-improvement app "APEX". They're writing their morning journal. Help them choose a day they will actually keep. They make the final call.

PERSONA — DIRECT COACH: specific, honest, in their corner. Not hype, not generic motivation.

RULES:
- Use only the data given. Never invent facts, tasks, times, studies or quotes.
- countedPatterns are exact counts: quote them as they are, and never claim a pattern they don't show. With little history, say less and lean on today's data.
- Size today to how they woke up: short sleep or low rest means a smaller win. If recent wins keep ending "Not today", suggest something they can finish.
- Prefer wins that move their focus goal, this week's priority or their North Star.
- The obstacle should come from what actually got in the way (ifThenResult, improve notes), not a generic one. If a plan keeps failing, offer a different plan.
- Speak to them as "you". Plain text, no markdown, no emojis.`;

/** What the model sees: how they woke up, how recent mornings went, and what's on today. */
export const buildCoachContext = (state, dateKey, { weekPriority, logReviews } = {}, now = new Date()) => {
  const logs = state.logs || {};
  const entry = logs[dateKey] || {};
  const yesterday = shiftDateKey(dateKey, -1);
  const health = state.healthLog?.[dateKey] || {};
  const promise = getYesterdayCommitment(logs, state.commitmentArchive, now);
  const northStar = state.user?.northStar;

  const recentMornings = Array.from({ length: HISTORY_DAYS }, (_, i) => shiftDateKey(dateKey, i - HISTORY_DAYS))
    .map((date) => {
      const m = logs[date]?.morning;
      if (!m?.win?.trim()) return null;
      const sleep = state.healthLog?.[date]?.sleepHours;
      return {
        date,
        win: m.win.trim(),
        ...(m.result ? { result: WIN_RESULT_LABELS[m.result] } : {}),
        ...(morningIfThen(m) ? { ifThen: morningIfThen(m) } : {}),
        ...(m.planHeld ? { ifThenResult: PLAN_HELD_LABELS[m.planHeld] } : {}),
        ...(m.energy > 0 ? { restedOutOf5: m.energy } : {}),
        ...(sleep != null ? { sleepHours: Math.round(sleep * 10) / 10 } : {}),
      };
    })
    .filter(Boolean);

  return {
    now: `${dateKey} ${now.toTimeString().slice(0, 5)} (${now.toLocaleDateString('en-US', { weekday: 'long' })})`,
    wokeUp: {
      ...(health.sleepHours != null ? { sleepHours: Math.round(health.sleepHours * 10) / 10 } : {}),
      ...(entry.morning?.energy > 0 ? { restedOutOf5: entry.morning.energy } : {}),
    },
    lastNightsPromise: promise?.status && promise.status !== 'none' ? promise.text : null,
    lastNightsReviewSaidFocusOn: logReviews?.[yesterday]?.tomorrowFocus || null,
    yesterdayDailyScore: computeDailyScore(state, yesterday).score,
    assistantsLineForToday: state.user?.homeBrief?.date === dateKey ? state.user.homeBrief.text : null,
    recentMornings,
    countedPatterns: getPatternLines(getMorningPatterns(logs, state.healthLog, dateKey)),
    recentImproveNotes: getImproveHistory(logs, dateKey),
    calendarToday: calendarToday(state, dateKey),
    freeMinutesLeftToday: freeMinutesLeft(state, dateKey, now),
    tasksToday: tasksToday(state, dateKey),
    thisWeeksPriority: weekPriority || null,
    focusGoal: focusGoalContext(state),
    northStar: northStar?.vision?.trim() ? { vision: northStar.vision.trim(), identity: northStar.identity || [] } : null,
    knownAboutThem: (state.assistantMemory || []).slice(0, 10).map((m) => m.text),
  };
};

/** Validates the model's JSON into the stored shape (minus metadata). */
export const normalizeCoach = (raw) => {
  const data = parse(raw);
  const seen = new Set();
  const winOptions = (Array.isArray(data.winOptions) ? data.winOptions : [])
    .map((w) => asWin(toText(w, 110)))
    .filter((w) => w && !seen.has(w.toLowerCase()) && seen.add(w.toLowerCase()))
    .slice(0, 3);
  const read = toText(data.read, 320);
  if (!read) throw new Error('The coach’s read came back empty. Try again.');
  return { read, winOptions, obstacle: asObstacle(toText(data.obstacle, 70)), plan: asPlan(toText(data.plan, 120)) };
};

export const generateMorningCoach = async ({ state, dateKey, weekPriority, logReviews, generate, now = new Date() }) => {
  const context = buildCoachContext(state, dateKey, { weekPriority, logReviews }, now);
  const response = await generate({
    systemPrompt: buildCoachSystemPrompt(state.user?.name || 'the user'),
    contents: [{ role: 'user', parts: [{ text: `I'm writing my morning journal. Here's my context, as JSON:\n${JSON.stringify(context)}` }] }],
    schema: COACH_SCHEMA,
  });
  return { ...normalizeCoach(response.text), generatedAt: now.getTime() };
};

// ─── Part 2: the win check ────────────────────────────────────────────────────

export const WIN_CHECK_SCHEMA = {
  type: 'OBJECT',
  properties: {
    verdict: { type: 'STRING', enum: WIN_VERDICTS, description: '"clear": they could answer yes or no tonight and it fits today. "vague": they couldn\'t. "too_big": it can\'t fit in the free time left.' },
    feedback: STR('Empty when clear. Otherwise 1 sentence, max 25 words, saying what\'s off. For too_big, cite the free time.'),
    rewrite: STR('Empty when clear. Otherwise their win made checkable or smaller, keeping what they care about. Reads right after "Today is a win if I". Lowercase start, max 14 words.'),
  },
  required: ['verdict', 'feedback', 'rewrite'],
  propertyOrdering: ['verdict', 'feedback', 'rewrite'],
};

export const buildWinCheckSystemPrompt = (name) => `You check ${name}'s one goal for today before they lock it in. Tonight they will be asked "Did you?", so it has to be answerable.

RULES:
- Default to "clear". Only push back on a real problem. Don't polish wording that already works.
- Never swap their goal for a different one. Keep their words where you can.
- Call it too_big only when it plainly can't fit in freeMinutesLeftToday, given the blocks in calendarToday.
- Use only the data given. Speak to them as "you". Plain text, no markdown, no emojis.`;

/** Validates the model's JSON. A verdict without a real alternative counts as clear: there's nothing to offer. */
export const normalizeWinCheck = (raw, win) => {
  const data = parse(raw);
  const rewrite = asWin(toText(data.rewrite, 130));
  const feedback = toText(data.feedback, 200);
  const flagged = WIN_VERDICTS.includes(data.verdict) && data.verdict !== 'clear';
  if (!flagged || !feedback || !rewrite || rewrite.toLowerCase() === win.trim().toLowerCase()) {
    return { verdict: 'clear', feedback: '', rewrite: '' };
  }
  return { verdict: data.verdict, feedback, rewrite };
};

export const generateWinCheck = async ({ state, dateKey, win, generate, now = new Date() }) => {
  const freeMinutes = freeMinutesLeft(state, dateKey, now);
  const context = { todayIsAWinIfI: win.trim(), calendarToday: calendarToday(state, dateKey), freeMinutesLeftToday: freeMinutes };
  const response = await generate({
    systemPrompt: buildWinCheckSystemPrompt(state.user?.name || 'the user'),
    contents: [{ role: 'user', parts: [{ text: `Check my win for today, as JSON:\n${JSON.stringify(context)}` }] }],
    schema: WIN_CHECK_SCHEMA,
    thinking: false, // a small, well-specified job, and they're waiting on it
  });
  return { forWin: win.trim(), ...normalizeWinCheck(response.text, win), freeMinutes, at: now.getTime() };
};

// ─── Part 3: back on track ────────────────────────────────────────────────────

export const RESCUE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    note: STR('1 sentence, max 22 words, no guilt: what is still possible today, citing the real time or block left.'),
    step: STR(`The very next thing to do for the next ${RESCUE_MINUTES} minutes. Starts with a verb, the first physical action toward their win. Max 14 words.`),
  },
  required: ['note', 'step'],
  propertyOrdering: ['note', 'step'],
};

export const buildRescueSystemPrompt = (name) => `${name} tapped "Off track?" on their home screen. They're drifting from the win they set this morning. Get them moving again with one step.

RULES:
- One step only, small enough to start right now without deciding anything else.
- Serve their win. If there's no realistic way to finish it today, make the step the part that still counts, and say so without judging.
- Use their if-then plan if it fits. If previousStep is set, it didn't work: offer a different, smaller one.
- Use only the data given. Speak to them as "you". Plain text, no markdown, no emojis.`;

export const buildRescueContext = (state, dateKey, now = new Date()) => {
  const morning = state.logs?.[dateKey]?.morning || {};
  return {
    now: `${dateKey} ${now.toTimeString().slice(0, 5)}`,
    todayIsAWinIfI: morning.win?.trim() || null,
    ifThenPlan: morningIfThen(morning) || null,
    todayTheyWantToBeSomeoneWho: morning.identity?.trim() || null,
    restedOutOf5: morning.energy > 0 ? morning.energy : null,
    calendarToday: calendarToday(state, dateKey),
    freeMinutesLeftToday: freeMinutesLeft(state, dateKey, now),
    tasksToday: tasksToday(state, dateKey),
    previousStep: morning.rescue?.forWin === morning.win?.trim() ? morning.rescue?.step || null : null,
  };
};

export const normalizeRescue = (raw) => {
  const data = parse(raw);
  const step = noEndPunctuation(toText(data.step, 120));
  if (!step) throw new Error('No next step came back. Try again.');
  return { note: toText(data.note, 180), step };
};

export const generateRescue = async ({ state, dateKey, generate, now = new Date() }) => {
  const morning = state.logs?.[dateKey]?.morning;
  const win = morning?.win?.trim();
  if (!win) throw new Error('Set today’s win first.');
  const response = await generate({
    systemPrompt: buildRescueSystemPrompt(state.user?.name || 'the user'),
    contents: [{ role: 'user', parts: [{ text: `I'm off track. Here's my day, as JSON:\n${JSON.stringify(buildRescueContext(state, dateKey, now))}` }] }],
    schema: RESCUE_SCHEMA,
    thinking: false,
  });
  return { forWin: win, ...normalizeRescue(response.text), count: (morning.rescue?.count || 0) + 1, at: now.getTime(), dismissed: false };
};
