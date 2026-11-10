// ─── Daily Log: the morning coach ─────────────────────────────────────────────
// Small tool-free structured-JSON calls around the morning journal, so none of
// them can change anything by itself. You still write the plan; the coach
// challenges it. Saved on `entry.morning` by the caller:
//   coach          { read, winOptions, generatedAt }   once per morning (older ones also
//                  carry obstacle/plan, which nothing reads any more)
//   ifThenOptions  { forWin, options: [{ when, then, at }], at }   on reaching Lock in, per win
//   identitySteps  { forIdentity, steps: [{ text, minutes }], at }   on tapping "Turn it into actions"
//   winCheck       { forWin, verdict, feedback, rewrite, freeMinutes, at,
//                    plan?: { forPlan, verdict, feedback, when, then } }   on Lock in
//   rescue         { forWin, note, step, count, at, dismissed }   on "Off track?" from Home
// Pure (`generate` is injected), so all of it can be checked in plain node.

import { computeDailyScore, shiftDateKey } from './scoreUtils';
import { getFocusGoal, getNextStep } from './goalUtils';
import { getTool } from './assistantTools';
import { computeFreeGaps } from './dayPlanner';
import { getYesterdayCommitment } from './homeUtils';
import { getImproveHistory } from './logPatterns';
import { isTop, todayQueue } from './taskUtils';
import {
  getMorningPatterns, getPatternLines, lowerFirst, morningIfThen, cleanMoment, cleanPlan, WIN_RESULT_LABELS, PLAN_HELD_LABELS,
} from './morningJournal';

const HISTORY_DAYS = 14;
const MAX_TASKS = 10;
export const RESCUE_MINUTES = 10;
export const WIN_VERDICTS = ['clear', 'vague', 'too_big'];
export const IF_THEN_OPTIONS = 3;

const STR = (description) => ({ type: 'STRING', description });

const toText = (value, max) => {
  const t = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  return t.length > max ? `${t.slice(0, max - 1).replace(/\s+\S*$/, '')}…` : t;
};
const parse = (raw) => (typeof raw === 'string' ? JSON.parse(raw || '{}') : raw || {});
const noEndPunctuation = (s) => s.replace(/[\s.,;:!]+$/, '').trim();

// The UI puts these right after "Today is a win if I…", "If…" and "I will…".
const asWin = (text) => lowerFirst(noEndPunctuation(text.replace(/^(today is a win if\s+)?(i\s+)?/i, '')));
const asMoment = (text) => lowerFirst(cleanMoment(text));
const asPlan = (text) => lowerFirst(cleanPlan(text));
const toMinutes = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(typeof hhmm === 'string' ? hhmm.trim() : '');
  return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const pad = (n) => String(n).padStart(2, '0');

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
  },
  required: ['read', 'winOptions'],
  propertyOrdering: ['read', 'winOptions'],
};

export const buildCoachSystemPrompt = (name) => `You are ${name}'s coach inside their self-improvement app "APEX". They're writing their morning journal. Help them choose a day they will actually keep. They make the final call.

PERSONA — DIRECT COACH: specific, honest, in their corner. Not hype, not generic motivation.

RULES:
- Use only the data given. Never invent facts, tasks, times, studies or quotes.
- countedPatterns are exact counts: quote them as they are, and never claim a pattern they don't show. With little history, say less and lean on today's data.
- Size today to how they woke up: short sleep or low rest means a smaller win. If recent wins keep ending "Not today", suggest something they can finish.
- Prefer wins that move their focus goal, this week's priority or their North Star.
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
  return { read, winOptions };
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

// ─── Part 1b: if-then options for today's win ─────────────────────────────────

const IF_THEN_ITEM = {
  type: 'OBJECT',
  properties: {
    when: STR('The moment it happens. Reads right after "If" and before ", I will". A cue they will notice as it happens: a time, place, feeling or urge, e.g. "I open my phone between blocks" or "it\'s 3pm and I feel the slump". A clause with a verb, never a bare noun. Lowercase start (except "I"), max 14 words.'),
    then: STR('Reads right after "I will". One small action they can do on the spot, in under 2 minutes, that gets them back to today\'s win. Lowercase start, max 14 words.'),
    at: STR('24h "HH:MM" when this moment is most likely today, read from their calendar and history, or "" when it can come at any time.'),
  },
  required: ['when', 'then', 'at'],
  propertyOrdering: ['when', 'then', 'at'],
};

export const IF_THEN_SCHEMA = {
  type: 'OBJECT',
  properties: {
    options: { type: 'ARRAY', items: IF_THEN_ITEM, description: `${IF_THEN_OPTIONS} if-then plans, each about a different thing that could knock them off today's win.` },
  },
  required: ['options'],
};

export const buildIfThenSystemPrompt = (name) => `You write if-then plans for ${name} in their self-improvement app "APEX". They just set today's win in their morning journal. Each plan names the moment they're most likely to slip and the one thing they'll do right then, so they don't have to decide in the moment.

RULES:
- Each plan reads as one sentence: "If <when>, I will <then>." Write only the two halves.
- <when> is a moment they'll notice as it happens (a time, a place, a feeling, an urge), not a vague state like "I get distracted" or a bare noun like "my phone".
- <then> is tiny and physical: something they can do right there in under 2 minutes that points them back at today's win. Not "try harder", "stay focused" or "be disciplined".
- Make the ${IF_THEN_OPTIONS} plans about different threats (say, distraction, low energy, not starting), most likely first.
- Build from their history: a moment that keeps showing up in recentPlans or improve notes comes first. A plan that "Held" can come back; one that "Broke" needs a different <then>. Size it to how they woke up.
- Use real names from their win, tasks and calendar. Use only the data given; never invent facts or times. Give <at> only when the calendar or their history points to one.
- Speak as them ("I"). Plain text, no markdown, no emojis.`;

/** What the model sees for the if-then options: today's win, what's on today, and how past plans went. */
export const buildIfThenContext = (state, dateKey, win, now = new Date()) => {
  const logs = state.logs || {};
  const health = state.healthLog?.[dateKey] || {};
  const recentPlans = Array.from({ length: HISTORY_DAYS }, (_, i) => shiftDateKey(dateKey, i - HISTORY_DAYS))
    .map((date) => {
      const m = logs[date]?.morning;
      const ifThen = morningIfThen(m);
      if (!ifThen) return null;
      return { date, ifThen, ...(m.planHeld ? { result: PLAN_HELD_LABELS[m.planHeld] } : {}), ...(m.result ? { winResult: WIN_RESULT_LABELS[m.result] } : {}) };
    })
    .filter(Boolean);
  return {
    now: `${dateKey} ${now.toTimeString().slice(0, 5)} (${now.toLocaleDateString('en-US', { weekday: 'long' })})`,
    todayIsAWinIfI: win.trim(),
    wokeUp: {
      ...(health.sleepHours != null ? { sleepHours: Math.round(health.sleepHours * 10) / 10 } : {}),
      ...(logs[dateKey]?.morning?.energy > 0 ? { restedOutOf5: logs[dateKey].morning.energy } : {}),
    },
    recentPlans,
    countedPatterns: getPatternLines(getMorningPatterns(logs, state.healthLog, dateKey)),
    recentImproveNotes: getImproveHistory(logs, dateKey),
    calendarToday: calendarToday(state, dateKey),
    freeMinutesLeftToday: freeMinutesLeft(state, dateKey, now),
    tasksToday: tasksToday(state, dateKey),
    focusGoal: focusGoalContext(state),
    knownAboutThem: (state.assistantMemory || []).slice(0, 10).map((m) => m.text),
  };
};

/** Validates the options: both halves present, no repeats, and a time only when it's still ahead today. */
export const normalizeIfThens = (raw, now = new Date()) => {
  const data = parse(raw);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const seen = new Set();
  const options = (Array.isArray(data.options) ? data.options : [])
    .map((o) => {
      const when = asMoment(toText(o?.when, 120));
      const then = asPlan(toText(o?.then, 120));
      const mins = toMinutes(o?.at);
      return { when, then, at: mins != null && mins > nowMin ? `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}` : '' };
    })
    .filter((o) => o.when && o.then && !seen.has(o.when.toLowerCase()) && seen.add(o.when.toLowerCase()))
    .slice(0, IF_THEN_OPTIONS);
  if (!options.length) throw new Error('No if-then plans came back. Try again.');
  return options;
};

export const generateIfThenOptions = async ({ state, dateKey, win, generate, now = new Date() }) => {
  if (!win?.trim()) throw new Error('Set today’s win first.');
  const response = await generate({
    systemPrompt: buildIfThenSystemPrompt(state.user?.name || 'the user'),
    contents: [{ role: 'user', parts: [{ text: `Write my if-then plans for today, as JSON:\n${JSON.stringify(buildIfThenContext(state, dateKey, win, now))}` }] }],
    schema: IF_THEN_SCHEMA,
    thinking: false, // they're looking at the step, waiting on it
  });
  return { forWin: win.trim(), options: normalizeIfThens(response.text, now), at: now.getTime() };
};

// ─── Part 1c: proof for "Today I'll be someone who…" ─────────────────────────
// Turns the identity line into a few small things to do today that prove it,
// each one tap from becoming a task. Saved as `morning.identitySteps`.

export const IDENTITY_STEPS = 3;

export const IDENTITY_STEPS_SCHEMA = {
  type: 'OBJECT',
  properties: {
    steps: {
      type: 'ARRAY',
      description: `${IDENTITY_STEPS} small actions for today, each a different way to act like this person.`,
      items: {
        type: 'OBJECT',
        properties: {
          text: STR('The action as a task title, verb first, max 12 words, e.g. "Write 200 words of the essay before opening email".'),
          minutes: { type: 'INTEGER', description: 'Roughly how many minutes it takes (1-60).' },
        },
        required: ['text', 'minutes'],
        propertyOrdering: ['text', 'minutes'],
      },
    },
  },
  required: ['steps'],
};

export const buildIdentityStepsSystemPrompt = (name) => `${name} wrote "Today I'll be someone who…" in their morning journal in their self-improvement app "APEX". Turn that line into ${IDENTITY_STEPS} small actions they can do today that prove it to themselves. Each one becomes a task on today's list.

RULES:
- Each action is concrete and checkable tonight: a clear start, a clear done. Not "be more focused", "stay positive" or "try hard".
- Small: 1 to 30 minutes each, sized to how rested they woke up and the free time left today. At most one may run up to 60 minutes.
- Tie them to today: their win, tasks, calendar and focus goal, using the real names. Don't repeat a task already on today's list word for word; build on it instead (a first step, a when, a way to start).
- Make the ${IDENTITY_STEPS} different from each other (say, one early in the day, one at a hard moment, one that helps someone or their body).
- Use only the data given; never invent facts, people or times.
- Write them as task titles, verb first, no "I". Plain text, no markdown, no emojis.`;

/** What the model sees: the identity line, today's win, and what today already holds. */
export const buildIdentityStepsContext = (state, dateKey, identity, now = new Date()) => {
  const logs = state.logs || {};
  const morning = logs[dateKey]?.morning || {};
  const health = state.healthLog?.[dateKey] || {};
  const vision = state.user?.northStar?.vision?.trim();
  return {
    now: `${dateKey} ${now.toTimeString().slice(0, 5)} (${now.toLocaleDateString('en-US', { weekday: 'long' })})`,
    todayIllBeSomeoneWho: identity.trim(),
    ...(trimText(morning.win) ? { todayIsAWinIfI: trimText(morning.win) } : {}),
    ...(morningIfThen(morning) ? { ifThenPlan: morningIfThen(morning) } : {}),
    ...(vision ? { becoming: vision } : {}),
    wokeUp: {
      ...(health.sleepHours != null ? { sleepHours: Math.round(health.sleepHours * 10) / 10 } : {}),
      ...(morning.energy > 0 ? { restedOutOf5: morning.energy } : {}),
    },
    calendarToday: calendarToday(state, dateKey),
    freeMinutesLeftToday: freeMinutesLeft(state, dateKey, now),
    tasksToday: tasksToday(state, dateKey),
    focusGoal: focusGoalContext(state),
    knownAboutThem: (state.assistantMemory || []).slice(0, 10).map((m) => m.text),
  };
};

const trimText = (s) => (typeof s === 'string' ? s.trim() : '');
const asTaskTitle = (text) => {
  const t = noEndPunctuation(text.replace(/^(i\s+will\s+|i'll\s+|i\s+)/i, ''));
  return t ? t[0].toUpperCase() + t.slice(1) : '';
};

/** Validates the steps: a title, no repeats, minutes clamped to 1-60. */
export const normalizeIdentitySteps = (raw) => {
  const data = parse(raw);
  const seen = new Set();
  const steps = (Array.isArray(data.steps) ? data.steps : [])
    .map((s) => {
      const minutes = Math.round(Number(s?.minutes));
      return { text: asTaskTitle(toText(s?.text, 100)), minutes: Number.isFinite(minutes) ? Math.min(60, Math.max(1, minutes)) : null };
    })
    .filter((s) => s.text && !seen.has(s.text.toLowerCase()) && seen.add(s.text.toLowerCase()))
    .slice(0, IDENTITY_STEPS);
  if (!steps.length) throw new Error('No steps came back. Try again.');
  return steps;
};

export const generateIdentitySteps = async ({ state, dateKey, identity, generate, now = new Date() }) => {
  if (!identity?.trim()) throw new Error('Finish the sentence first.');
  const response = await generate({
    systemPrompt: buildIdentityStepsSystemPrompt(state.user?.name || 'the user'),
    contents: [{ role: 'user', parts: [{ text: `Turn this into actions for today, as JSON:\n${JSON.stringify(buildIdentityStepsContext(state, dateKey, identity, now))}` }] }],
    schema: IDENTITY_STEPS_SCHEMA,
    thinking: false, // they tapped and are waiting on it
  });
  return { forIdentity: identity.trim(), steps: normalizeIdentitySteps(response.text), at: now.getTime() };
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

const PLAN_CHECK_PROPS = {
  planVerdict: { type: 'STRING', enum: ['clear', 'vague'], description: '"clear": the If is a moment they\'d notice as it happens and the I will is a concrete action they can do right then. "vague": either half isn\'t.' },
  planFeedback: STR('Empty when clear. Otherwise 1 sentence, max 22 words, saying which half is vague and why.'),
  planWhen: STR('Empty when clear. Otherwise their If made into a moment they\'d notice. Reads right after "If", lowercase start (except "I"), max 14 words.'),
  planThen: STR('Empty when clear. Otherwise their I will made into one small action they can do on the spot. Reads right after "I will", lowercase start, max 14 words.'),
};

/** The win check's schema; with a plan to check, it also checks the if-then. */
export const winCheckSchema = (withPlan) => (withPlan ? {
  ...WIN_CHECK_SCHEMA,
  properties: { ...WIN_CHECK_SCHEMA.properties, ...PLAN_CHECK_PROPS },
  required: [...WIN_CHECK_SCHEMA.required, ...Object.keys(PLAN_CHECK_PROPS)],
  propertyOrdering: [...WIN_CHECK_SCHEMA.propertyOrdering, ...Object.keys(PLAN_CHECK_PROPS)],
} : WIN_CHECK_SCHEMA);

export const buildWinCheckSystemPrompt = (name, withPlan = false) => `You check ${name}'s one goal for today before they lock it in. Tonight they will be asked "Did you?", so it has to be answerable.${withPlan ? ' You also check the if-then plan they wrote for the moment they\'re most likely to slip ("If <when>, I will <then>").' : ''}

RULES:
- Default to "clear". Only push back on a real problem. Don't polish wording that already works.
- Never swap their goal for a different one. Keep their words where you can.
- Call it too_big only when it plainly can't fit in freeMinutesLeftToday, given the blocks in calendarToday.${withPlan ? `
- The plan is vague when the If isn't a moment they'd notice as it happens ("I get distracted", "things come up") or the I will isn't a concrete action ("try harder", "stay focused"). A rewrite keeps their situation and their idea, just sharper. Never swap in a different threat.` : ''}
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

/** The if-then half of the check. Only a real, different rewrite counts as vague. */
export const normalizePlanCheck = (raw, plan) => {
  const data = parse(raw);
  const forPlan = morningIfThen({ ifMoment: true, obstacle: plan.when, plan: plan.then });
  const when = asMoment(toText(data.planWhen, 120));
  const then = asPlan(toText(data.planThen, 120));
  const feedback = toText(data.planFeedback, 180);
  const rewritten = morningIfThen({ ifMoment: true, obstacle: when, plan: then });
  if (data.planVerdict !== 'vague' || !feedback || !rewritten || rewritten.toLowerCase() === forPlan.toLowerCase()) {
    return { forPlan, verdict: 'clear', feedback: '', when: '', then: '' };
  }
  return { forPlan, verdict: 'vague', feedback, when, then };
};

/** `plan` ({ when, then }) is the if-then they wrote themselves; leave it out to check only the win. */
export const generateWinCheck = async ({ state, dateKey, win, plan = null, generate, now = new Date() }) => {
  const withPlan = !!(plan?.when?.trim() && plan?.then?.trim());
  const freeMinutes = freeMinutesLeft(state, dateKey, now);
  const context = {
    todayIsAWinIfI: win.trim(),
    ...(withPlan ? { ifThenPlan: { when: cleanMoment(plan.when), then: cleanPlan(plan.then) } } : {}),
    calendarToday: calendarToday(state, dateKey),
    freeMinutesLeftToday: freeMinutes,
  };
  const response = await generate({
    systemPrompt: buildWinCheckSystemPrompt(state.user?.name || 'the user', withPlan),
    contents: [{ role: 'user', parts: [{ text: `Check my ${withPlan ? 'win and if-then plan' : 'win'} for today, as JSON:\n${JSON.stringify(context)}` }] }],
    schema: winCheckSchema(withPlan),
    thinking: false, // a small, well-specified job, and they're waiting on it
  });
  return {
    forWin: win.trim(),
    ...normalizeWinCheck(response.text, win),
    ...(withPlan ? { plan: normalizePlanCheck(response.text, plan) } : {}),
    freeMinutes,
    at: now.getTime(),
  };
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
