// ─── Weekly Review: the "Weekly Reset" ────────────────────────────────────────
// Sunday's guided routine: look back on the week, reflect (drafted by AI), check
// goals, plan next week, commit. Everything here is pure (no React, no storage)
// so the week math, the plan loop and the AI draft can be checked in plain node.
//
// A review is stored under the Monday of the week it REVIEWS
// (weeklyReviews['2026-10-12'] reviews Oct 12-18), and the plan it makes runs the
// following week. Fields (all optional, so older reviews keep working):
//   wins / blockers / lessons   string[]  the reflection (older reviews have the
//                                         wentWell / heldBack / improvements strings)
//   priority                    string    next week's #1 priority (same field as before)
//   outcomes                    [{ text, taskId }]  3 results for next week; taskId once
//                                         it was added to Tasks
//   experiment                  { text, why } | null  one daily yes/no change for next week
//   lastWeek                    { priority: 'yes'|'partly'|'no', outcomes: { [i]: bool },
//                                 experiment: 'keep'|'tweak'|'drop' }  how the previous
//                                         review's plan went
//   draft                       the AI's suggestions, saved once per week
//   goalCoach                   the goal recalibration (goalCoach.js)
//   seen                        { [step]: true } once a step was opened
//   completedAt, stats          set when the week is locked in
// Each Daily Log entry may carry experiment: { week, text, done } — the nightly tick.

import { computeDailyScore, getEarliestActivityKey, shiftDateKey, STREAK_THRESHOLD } from './scoreUtils';
import { getMondayOf, getScoreLeaksForDays, getWeekDeltas } from './statsInsights';
import { getActiveGoals, getFocusGoals, describeGoal, getGoalActivity } from './goalUtils';
import { makeTask } from './taskUtils';
import EMOTIONS from './logMeta';

// Sunday from this hour (and Monday, for a week left unreviewed) the app starts asking.
export const RESET_FROM_HOUR = 17;

export const STEP_KEYS = ['week', 'reflect', 'goals', 'plan', 'commit'];

export const STEP_META = {
  week: { label: 'Your week', title: 'Here’s how your week actually went.' },
  reflect: { label: 'Reflect', title: 'What should you take from it?' },
  goals: { label: 'Goals', title: 'Are your goals still on track?' },
  plan: { label: 'Plan', title: 'Make next week a good one.' }, // 'this week' on a late Reset (WeeklyResetFlow)
  commit: { label: 'Commit', title: 'Lock in your week.' },
};

const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const WEEKDAY_NAME = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MAX_ITEMS = 5;

const clean = (list) => (Array.isArray(list) ? list.map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean) : []);
const round1 = (n) => Math.round(n * 10) / 10;
const average = (nums) => (nums.length ? round1(nums.reduce((s, n) => s + n, 0) / nums.length) : null);

export const weekDays = (mondayKey) => Array.from({ length: 7 }, (_, i) => shiftDateKey(mondayKey, i));
export const nextWeekOf = (mondayKey) => shiftDateKey(mondayKey, 7);

const dayOfWeek = (dateKey) => {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
};

/** "Oct 13 – 19" (or "Oct 27 – Nov 2"). */
export const formatWeekRange = (mondayKey) => {
  const [y, m, d] = mondayKey.split('-').map(Number);
  const mon = new Date(y, m - 1, d);
  const sun = new Date(y, m - 1, d + 6);
  const month = (date) => date.toLocaleDateString('en-US', { month: 'short' });
  return `${month(mon)} ${mon.getDate()} – ${mon.getMonth() === sun.getMonth() ? '' : `${month(sun)} `}${sun.getDate()}`;
};

// ─── Which week, which plan ───────────────────────────────────────────────────

/**
 * The week the Reset works on today: on Sunday, the week that's ending; any other
 * day, last week (a week left unreviewed on Sunday can still be done late).
 */
export const getReviewWeek = (todayKey) => {
  const monday = getMondayOf(todayKey);
  return dayOfWeek(todayKey) === 0 ? monday : shiftDateKey(monday, -7);
};

/** True when a review was locked in (older reviews were saved with completedAt too). */
export const isReviewDone = (review) => !!review?.completedAt;

/**
 * The plan running on `dateKey`: the one made in the previous week's review, once
 * it was locked in. Null when there isn't one.
 */
export const getActivePlan = (weeklyReviews, dateKey) => {
  const week = getMondayOf(dateKey);
  const reviewKey = shiftDateKey(week, -7);
  const review = weeklyReviews?.[reviewKey];
  if (!isReviewDone(review)) return null;
  const outcomes = (review.outcomes || []).filter((o) => o?.text?.trim());
  const experiment = review.experiment?.text?.trim() ? { text: review.experiment.text.trim(), why: review.experiment.why || '' } : null;
  const priority = review.priority?.trim() || null;
  if (!priority && !outcomes.length && !experiment) return null;
  return { week, reviewKey, priority, outcomes, experiment };
};

/** Should the app be asking for this week's Reset right now? Returns the week key or null. */
export const getResetDue = (weeklyReviews, now) => {
  const day = now.getDay();
  const hour = now.getHours();
  if (!((day === 0 && hour >= RESET_FROM_HOUR) || day === 1)) return null;
  const pad = (n) => String(n).padStart(2, '0');
  const todayKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const key = getReviewWeek(todayKey);
  return isReviewDone(weeklyReviews?.[key]) ? null : key;
};

// ─── The week in numbers ──────────────────────────────────────────────────────

/**
 * One entry per day Mon-Sun with its Daily Score: 'cleared' at the streak bar,
 * 'today' while today is still running, 'future', 'before' (no tracking yet), or
 * 'missed'. Plus the average so far against the same weekdays of the week before.
 */
export const getWeekScores = (data, mondayKey, todayKey) => {
  const earliest = getEarliestActivityKey(data);
  const days = weekDays(mondayKey).map((dateKey, i) => {
    if (dateKey > todayKey) return { dateKey, letter: WEEKDAY_LETTERS[i], score: null, status: 'future' };
    const score = computeDailyScore(data, dateKey).score;
    const status = score >= STREAK_THRESHOLD ? 'cleared'
      : dateKey === todayKey ? 'today'
      : (!earliest || dateKey < earliest) ? 'before'
      : 'missed';
    return { dateKey, letter: WEEKDAY_LETTERS[i], score, status };
  });
  const counted = days.filter((d) => d.status !== 'future' && d.status !== 'before');
  const prevScores = counted.map((d) => computeDailyScore(data, shiftDateKey(d.dateKey, -7)).score);
  return {
    days,
    cleared: days.filter((d) => d.status === 'cleared').length,
    average: average(counted.map((d) => d.score)),
    previousAverage: prevScores.some((s) => s > 0) ? average(prevScores) : null,
    threshold: STREAK_THRESHOLD,
  };
};

/** Finished days of the week (today is still running), for the leak math. */
export const finishedDays = (mondayKey, todayKey) => weekDays(mondayKey).filter((k) => k < todayKey);

/** Biggest leak + strength over the week's finished days, and like-for-like stat deltas. */
export const getWeekInsights = (data, mondayKey, todayKey) => {
  const days = finishedDays(mondayKey, todayKey);
  const leaks = days.length ? getScoreLeaksForDays(data, days, days.length === 7 ? 'this week' : `${WEEKDAY_NAME[0]}–${WEEKDAY_NAME[days.length - 1]}`) : null;
  const sunday = shiftDateKey(mondayKey, 6);
  const deltas = getWeekDeltas(data, todayKey < sunday ? todayKey : sunday);
  return { leaks, deltas };
};

// ─── How last week's plan went ────────────────────────────────────────────────

/** Nightly experiment ticks for the plan week, up to `todayKey`. */
export const getExperimentTicks = (logs, planWeek, todayKey) => {
  const days = weekDays(planWeek).filter((k) => k <= todayKey);
  const ticks = days.map((dateKey) => {
    const e = logs?.[dateKey]?.experiment;
    return { dateKey, done: e?.week === planWeek ? e.done : null };
  });
  return { days: ticks, done: ticks.filter((t) => t.done === true).length, answered: ticks.filter((t) => t.done != null).length };
};

/**
 * The plan from the review before `reviewKey` (it ran during `reviewKey`'s week),
 * with what happened: each outcome's task, and the experiment's ticks plus the
 * average Daily Score on days you did it vs days you didn't. Null without a plan.
 */
export const getPlanResults = (data, weeklyReviews, reviewKey, todayKey) => {
  const plan = getActivePlan(weeklyReviews, reviewKey);
  if (!plan) return null;
  const answers = weeklyReviews?.[reviewKey]?.lastWeek || {};
  const outcomes = plan.outcomes.map((o, i) => {
    const task = o.taskId != null ? (data.todos || []).find((t) => String(t.id) === String(o.taskId)) : null;
    const auto = !!task?.completed;
    const manual = answers.outcomes?.[i];
    return { index: i, text: o.text, auto, done: auto || manual === true, hasTask: !!task };
  });
  let experiment = null;
  if (plan.experiment) {
    const ticks = getExperimentTicks(data.logs, plan.week, todayKey);
    const scoreOf = (k) => computeDailyScore(data, k).score;
    const doneDays = ticks.days.filter((t) => t.done === true && t.dateKey < todayKey);
    const skippedDays = ticks.days.filter((t) => t.done === false && t.dateKey < todayKey);
    experiment = {
      ...plan.experiment,
      ...ticks,
      scoreDone: average(doneDays.map((t) => scoreOf(t.dateKey))),
      scoreSkipped: average(skippedDays.map((t) => scoreOf(t.dateKey))),
    };
  }
  return { ...plan, outcomes, experiment };
};

/**
 * Experiments you kept, newest first: the rules that proved themselves. A rule
 * kept again in a later week appears once, at its latest date.
 */
export const getPlaybook = (weeklyReviews) => {
  const seen = new Set();
  return Object.keys(weeklyReviews || {}).sort().reverse()
    .filter((key) => weeklyReviews[key]?.lastWeek?.experiment === 'keep')
    .map((key) => ({ keptOn: key, text: weeklyReviews[shiftDateKey(key, -7)]?.experiment?.text?.trim() }))
    .filter((r) => r.text && !seen.has(r.text.toLowerCase()) && seen.add(r.text.toLowerCase()));
};

// ─── Coming up next week ──────────────────────────────────────────────────────

/** One-off calendar blocks, day events and goal deadlines in the plan week, by date. */
export const getComingUp = ({ calendarEvents = [], calendarDayEvents = {}, goals = [] }, planWeek) => {
  const days = weekDays(planWeek);
  const items = [];
  calendarEvents.forEach((ev) => {
    if ((!ev.recurrence || ev.recurrence === 'none') && days.includes(ev.date) && ev.title?.trim()) {
      items.push({ date: ev.date, kind: 'block', text: ev.title.trim() });
    }
  });
  days.forEach((date) => (calendarDayEvents[date] || []).forEach((ev) => {
    if (ev?.title?.trim()) items.push({ date, kind: 'event', text: ev.title.trim() });
  }));
  goals.forEach((g) => {
    if (!g.completed && g.deadline && days.includes(g.deadline)) items.push({ date: g.deadline, kind: 'deadline', text: `${g.title} is due` });
  });
  return items.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 12);
};

/** The goals a Reset looks at: the focus goals, plus anything due by the end of the plan week. */
export const getResetGoals = (goals, reviewKey) => {
  const planEnd = weekDays(nextWeekOf(reviewKey))[6];
  return [...new Set([
    ...getFocusGoals(goals),
    ...(goals || []).filter((g) => !g.completed && g.deadline && g.deadline <= planEnd),
  ])];
};

// ─── Steps ────────────────────────────────────────────────────────────────────

/**
 * Which steps are done. A step counts only once you've opened it (`seen`), since
 * the AI draft fills Reflect and Plan before you've looked at them.
 */
export const getStepStatus = ({ review, lastPlan }) => {
  const seen = review?.seen || {};
  return {
    week: !!seen.week && (!lastPlan || ((!lastPlan.priority || !!review?.lastWeek?.priority) && (!lastPlan.experiment || !!review?.lastWeek?.experiment))),
    reflect: !!seen.reflect && (clean(review?.wins).length > 0 || clean(review?.blockers).length > 0),
    goals: !!seen.goals,
    plan: !!seen.plan && !!review?.priority?.trim(),
    commit: isReviewDone(review),
  };
};

export const getFirstOpenStep = (status) => STEP_KEYS.find((key) => !status[key]) || 'commit';

/** Tidies a list the user edited: trimmed, no blanks, at most MAX_ITEMS. */
export const tidyList = (list) => clean(list).slice(0, MAX_ITEMS);

/**
 * Locking in: outcomes become this-week tasks that start in the plan week (once; a
 * renamed outcome renames its open task). Returns { todos, outcomes }: the new todo
 * list and the outcomes with their task ids.
 */
export const syncOutcomeTasks = ({ outcomes, todos, planWeek, addTasks, now = Date.now(), todayKey }) => {
  let next = todos;
  const kept = (outcomes || []).filter((o) => o?.text?.trim()).slice(0, 3);
  const out = kept.map((o, i) => {
    const text = o.text.trim();
    const task = o.taskId != null ? next.find((t) => String(t.id) === String(o.taskId)) : null;
    if (task) {
      if (task.text !== text && !task.completed) next = next.map((t) => (t.id === task.id ? { ...t, text } : t));
      return { text, taskId: task.id };
    }
    if (!addTasks) return { text, taskId: null };
    // startsOn keeps a task made on Sunday in Upcoming until Monday (taskUtils.bucketTasks).
    const made = { ...makeTask({ text, when: 'this-week', now: now + i }, todayKey), startsOn: planWeek };
    next = [...next, made];
    return { text, taskId: made.id };
  });
  return { todos: next, outcomes: out };
};

// ─── AI draft ─────────────────────────────────────────────────────────────────
// One tool-free structured-JSON call when the Reset opens. It drafts the
// reflection and next week's plan; nothing is saved until you lock the week in.

const STR = (description) => ({ type: 'STRING', description });
const LIST = (description) => ({ type: 'ARRAY', items: { type: 'STRING' }, description });
const emotionLabel = (id) => EMOTIONS.find((e) => e.id === id)?.label || id;
const cut = (text, max) => {
  const t = typeof text === 'string' ? text.trim().replace(/\s+/g, ' ') : '';
  return t.length > max ? `${t.slice(0, max - 1).replace(/\s+\S*$/, '')}…` : t;
};
const dayName = (dateKey) => WEEKDAY_NAME[(dayOfWeek(dateKey) + 6) % 7];

/** Everything the draft looks at, as one plain object. */
export const buildResetContext = (state, reviewKey, todayKey, now = new Date()) => {
  const data = {
    habits: state.habits || [], xpLog: state.xpLog || [], logs: state.logs || {},
    commitmentArchive: state.commitmentArchive || [], healthLog: state.healthLog || {}, calendarEvents: state.calendarEvents || [],
    pomodoroSessions: state.pomodoroSessions || [], todos: state.todos || [], goals: state.goals || [],
  };
  const scores = getWeekScores(data, reviewKey, todayKey);
  const { leaks, deltas } = getWeekInsights(data, reviewKey, todayKey);
  const lastPlan = getPlanResults(data, state.weeklyReviews, reviewKey, todayKey);
  const answers = state.weeklyReviews?.[reviewKey]?.lastWeek || {};
  const days = weekDays(reviewKey).filter((k) => k <= todayKey);
  const planWeek = nextWeekOf(reviewKey);

  return {
    name: state.user?.name || 'you',
    weekReviewed: `${formatWeekRange(reviewKey)} (${reviewKey})`,
    today: `${todayKey} (${dayName(todayKey)})`,
    nextWeek: `${formatWeekRange(planWeek)} (${planWeek})`,
    northStar: state.user?.northStar?.vision?.trim()
      ? { vision: state.user.northStar.vision.trim(), identity: state.user.northStar.identity || [] }
      : null,
    dailyScores: scores.days.filter((d) => d.score != null).map((d) => `${dayName(d.dateKey)} ${d.score}${d.status === 'today' ? ' (so far)' : ''}`),
    averageScore: scores.average,
    averageScoreWeekBefore: scores.previousAverage,
    daysAtOrAbove6: scores.cleared,
    biggestLeaks: (leaks?.leaks || []).slice(0, 3).map((l) => `${l.label}: lost ${l.lost} points (${l.evidence})`),
    strength: leaks?.strength ? `${leaks.strength.label} (${leaks.strength.evidence})` : null,
    vsWeekBefore: deltas.map((d) => `${d.label}: ${d.fmt(d.value)} (week before ${d.fmt(d.before)})`),
    habits: data.habits.map((h) => `${h.name || h.text}: ${days.filter((k) => h.history?.[k]).length}/${days.length} days`),
    journal: days.map((k) => {
      const e = data.logs[k];
      if (!e) return null;
      const entry = {
        day: dayName(k),
        rating: e.dayRating || null,
        felt: (e.emotions || []).map(emotionLabel),
        proud: clean(e.proud).map((x) => cut(x, 120)),
        improve: clean(e.improve).map((x) => cut(x, 120)),
        learned: cut(e.learned, 160) || null,
        commitment: cut(e.commitment, 120) || null,
        notes: cut(e.notes, 200) || null,
        reviewSaid: cut(state.logReviews?.[k]?.headline, 160) || null,
      };
      return Object.fromEntries(Object.entries(entry).filter(([, v]) => (Array.isArray(v) ? v.length : v != null)));
    }).filter(Boolean),
    commitments: (() => {
      const recs = data.commitmentArchive.filter((c) => days.includes(c.date));
      return { kept: recs.filter((c) => c.confirmedOn).length, missed: recs.filter((c) => c.denied === true).length };
    })(),
    lastWeeksPlan: lastPlan ? {
      priority: lastPlan.priority,
      priorityHit: answers.priority || 'not answered yet',
      outcomes: lastPlan.outcomes.map((o) => `${o.text}: ${o.done ? 'done' : 'not done'}`),
      experiment: lastPlan.experiment ? {
        text: lastPlan.experiment.text,
        daysDone: `${lastPlan.experiment.done} of ${lastPlan.experiment.answered} answered`,
        avgScoreOnDaysDone: lastPlan.experiment.scoreDone,
        avgScoreOnDaysSkipped: lastPlan.experiment.scoreSkipped,
      } : null,
    } : null,
    playbook: getPlaybook(state.weeklyReviews).map((r) => r.text),
    goals: getActiveGoals(data.goals).slice(0, 6).map((g) => ({
      title: g.title,
      summary: describeGoal(g, data, now),
      deadline: g.deadline || null,
      thingsDoneLast7Days: getGoalActivity(g, data, now).weekCount,
    })),
    comingUpNextWeek: getComingUp({ calendarEvents: data.calendarEvents, calendarDayEvents: state.calendarDayEvents, goals: data.goals }, planWeek)
      .map((c) => `${dayName(c.date)}: ${c.text}`),
    whatYouKnowAboutThem: (state.assistantMemory || []).slice(0, 15).map((m) => `(${m.kind}) ${m.text}`),
  };
};

export const RESET_SCHEMA = {
  type: 'OBJECT',
  properties: {
    headline: STR('One-sentence verdict on the week, specific to it, with a number. Max 22 words.'),
    wins: LIST('2-4 real wins from the week, each citing what they did or wrote. One sentence each.'),
    blockers: LIST('1-3 things that held them back, said plainly, each citing the data (a leak, a pattern, repeated "improve" items).'),
    lessons: LIST('1-2 lessons to carry forward: principles about how they work best, drawn from this week. Not tasks.'),
    priority: STR('Next week\'s ONE priority: the outcome that would make it a good week. Specific, max 90 characters, no "and".'),
    priorityWhy: STR('One sentence on why this priority, tied to their North Star or a goal when it genuinely fits. Max 25 words.'),
    outcomes: LIST('Exactly 3 concrete, checkable results for next week, each starting with a verb, max 80 characters. Doable alongside what is coming up.'),
    experimentText: STR('ONE small daily behavior to try every day next week, aimed at the biggest leak or blocker. Yes/no checkable each night, starts with a verb, max 80 characters. E.g. "Phone charges outside the bedroom by 10:30pm".'),
    experimentWhy: STR('One sentence: which leak or blocker it targets, with the number. Max 25 words.'),
  },
  required: ['headline', 'wins', 'blockers', 'lessons', 'priority', 'priorityWhy', 'outcomes', 'experimentText', 'experimentWhy'],
  propertyOrdering: ['headline', 'wins', 'blockers', 'lessons', 'priority', 'priorityWhy', 'outcomes', 'experimentText', 'experimentWhy'],
};

export const buildResetSystemPrompt = (name) => `You are ${name}'s personal coach inside their self-improvement app "APEX". It's their Weekly Reset: you draft the week's review and next week's plan so they only have to edit it, not write it from scratch.

PERSONA — DIRECT COACH: honest and specific, genuinely in their corner. Name real wins; say plainly what held them back. No sugarcoating, no lecturing, no generic advice.

RULES:
- Every point must come from the data: Daily Scores, leaks, habits, journal, commitments, last week's plan, goals and what you know about them. Never invent facts. Cite real numbers.
- The plan must be realistic for a normal week with what's coming up. Make the priority serve their most important goal or North Star when one fits.
- The experiment is ONE small daily habit change, checkable yes/no each night, aimed squarely at the biggest leak or blocker. Don't repeat a rule already in their playbook. If last week's experiment clearly worked or clearly failed, build on that.
- If last week's priority or outcomes weren't done, say so in blockers and size next week accordingly.
- Speak to them as "you". Plain text, no markdown, no emojis. Each list item one sentence, under 25 words.`;

/** Validates the model's JSON into the saved draft (minus metadata). */
export const normalizeResetDraft = (raw) => {
  const data = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw || {};
  const list = (value, max, len) => clean(value).map((x) => cut(x, len)).slice(0, max);
  const draft = {
    headline: cut(data.headline, 200),
    wins: list(data.wins, 4, 200),
    blockers: list(data.blockers, 3, 200),
    lessons: list(data.lessons, 2, 200),
    priority: cut(data.priority, 100),
    priorityWhy: cut(data.priorityWhy, 200),
    outcomes: list(data.outcomes, 3, 90),
    experiment: cut(data.experimentText, 90) ? { text: cut(data.experimentText, 90), why: cut(data.experimentWhy, 200) } : null,
  };
  if (!draft.headline || !draft.priority) throw new Error('The draft came back incomplete. Try again.');
  return draft;
};

/**
 * Generates the draft. `generate` is geminiGenerateJson in the app (injected so this
 * stays testable). `logReviews` is passed separately: it isn't part of the agent's state.
 */
export const generateResetDraft = async ({ state, reviewKey, todayKey, logReviews, generate, now = new Date() }) => {
  const context = buildResetContext({ ...state, logReviews: logReviews || state.logReviews }, reviewKey, todayKey, now);
  const response = await generate({
    systemPrompt: buildResetSystemPrompt(context.name),
    contents: [{ role: 'user', parts: [{ text: `Draft my Weekly Reset. Here is everything you need, as JSON:\n${JSON.stringify(context)}` }] }],
    schema: RESET_SCHEMA,
  });
  return { ...normalizeResetDraft(response?.text), at: now.getTime() };
};

/** The draft's suggestions copied into an unstarted review (fields you already wrote win). */
export const applyDraft = (review, draft) => ({
  ...review,
  draft,
  wins: review?.wins ?? draft.wins,
  blockers: review?.blockers ?? draft.blockers,
  lessons: review?.lessons ?? draft.lessons,
  priority: review?.priority ?? draft.priority,
  outcomes: review?.outcomes ?? draft.outcomes.map((text) => ({ text, taskId: null })),
  experiment: review?.experiment !== undefined ? review.experiment : draft.experiment,
});
