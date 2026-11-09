// ─── Daily Log: "Start your day" ──────────────────────────────────────────────
// The morning journal the Daily Log walks through before noon. Pure (no React,
// no storage) so the step rules and suggestions can be checked in plain node.
//
// Saved on today's entry as `entry.morning` (all fields optional):
//   energy    1-5, how rested you woke up (the night's Body card has its own energy)
//   win       "Today is a win if I…" — the one thing that makes today count
//   obstacle  the "If…" half: what's most likely to knock you off track. With
//             `ifMoment` (every entry written since 2026-11-09) it's the moment
//             itself ("I reach for my phone") and reads "If ___, I will ___";
//             older entries hold a noun ("My phone") read "If ___ gets in the way".
//   plan      what you'll do when it happens (the "I will…" half of an if-then)
//   ifMoment  true when `obstacle` is a moment clause (see above)
//   remindAt  'HH:MM' or '': when to push the if-then to you (pushSchedule.js)
//   identity  "Today I'll be someone who…"
//   doneAt    ms timestamp of "Lock in my day"
//   result    'yes' | 'partly' | 'no' — tonight's Look back answer about `win`
//   planHeld  'yes' | 'partly' | 'no' | 'none' — tonight's answer about the if-then
//   coach, ifThenOptions, winCheck, rescue — what the AI said (morningCoach.js)
// Last night's sleep isn't stored here: it goes to healthLog[today] like the
// night routine's sleep card, so the Daily Score sees it either way.

import { getDayMode } from './homeUtils';
import { getFocusGoal, getNextStep } from './goalUtils';
import { shiftDateKey, SLEEP_MIN_HOURS } from './scoreUtils';

export const MORNING_STEP_KEYS = ['wake', 'focus', 'lockIn'];

export const MORNING_STEP_META = {
  wake: { label: 'Wake up', title: 'Good morning. How did you wake up?' },
  focus: { label: 'Focus', title: 'What makes today a win?' },
  lockIn: { label: 'Lock in', title: 'Decide now how you’ll handle the hard part.' },
};

export const WIN_RESULT_LABELS = { yes: 'Did it', partly: 'Partly', no: 'Not today' };
export const PLAN_HELD_LABELS = { yes: 'Held', partly: 'Partly', no: 'Broke', none: 'Never came up' };

const trim = (s) => (typeof s === 'string' ? s.trim() : '');

/** True once anything in this morning's journal has been filled in. */
export const hasMorning = (entry) => {
  const m = entry?.morning;
  return !!m && (m.energy > 0 || !!trim(m.win) || !!trim(m.obstacle) || !!trim(m.plan) || !!trim(m.identity));
};

/** Which steps are done. Wake up needs both sleep and how rested you feel. */
export const getMorningStatus = (entry, sleepLogged) => {
  const m = entry?.morning || {};
  return {
    wake: !!sleepLogged && m.energy > 0,
    focus: !!trim(m.win),
    lockIn: !!trim(m.obstacle) && !!trim(m.plan),
  };
};

/** Where to open: the locked-in card once done, else the first unfinished step. */
export const getMorningStart = (entry, status) => (
  entry?.morning?.doneAt ? 'locked' : MORNING_STEP_KEYS.find((k) => !status[k]) || 'lockIn'
);

/** Which half of today's Daily Log opens first: the morning journal in Home's morning window, until it's locked in. */
export const defaultLogView = (entry, now) => (
  getDayMode(now) === 'morning' && !entry?.morning?.doneAt ? 'morning' : 'night'
);

// "Finish the essay" reads as "Today is a win if I finish the essay"; leaves "I", "TV" etc. alone.
export const lowerFirst = (s) => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);

/**
 * One-tap answers for "Today is a win if I…", most important first: this week's
 * #1 priority, the focus goal's next step, then today's starred tasks. At most 3,
 * after the coach's options when there are any (at most 4 in all).
 */
export const getWinSuggestions = ({ todos = [], goals = [], weekPriority, todayKey, coachOptions = [] }) => {
  const out = [];
  const add = (source, text) => {
    const t = lowerFirst(trim(text));
    if (t && !out.some((s) => s.text.toLowerCase() === t.toLowerCase())) out.push({ source, text: t });
  };
  coachOptions.forEach((text) => add('coach', text));
  add('week', weekPriority);
  const goal = getFocusGoal(goals);
  if (goal) {
    const next = getNextStep(goal, todos);
    add('goal', next ? next.text : `move “${goal.title}” forward`);
  }
  todos.filter((t) => !t.completed && t.topDate === todayKey).forEach((t) => add('task', t.text));
  return out.slice(0, coachOptions.length ? 4 : 3);
};

/** One-tap answers for "If…": the moment, not the thing ("If I reach for my phone, I will…"). */
export const MOMENT_SUGGESTIONS = ['I reach for my phone', 'I feel tired or low', 'I want to put it off', 'I lose focus after lunch'];

const noEndPunctuation = (s) => s.replace(/[\s.,;:!]+$/, '').trim();

/** The "If" half as it reads after "If": no leading "if"/"when", no trailing comma, no "I will…" half pasted in. */
export const cleanMoment = (text) => noEndPunctuation(trim(text)
  .replace(/^(if|when|whenever)\s+/i, '')
  .replace(/,?\s*(then\s+)?i(\s+will|'ll)\s+.*$/i, ''));

/** The "I will" half as it reads after "I will". */
export const cleanPlan = (text) => noEndPunctuation(trim(text).replace(/^(then\s+)?i(\s+will|'ll)\s+/i, ''));

/** "If I reach for my phone, I will put it in the other room", or '' while either half is empty. */
export const morningIfThen = (morning) => {
  const obstacle = morning?.ifMoment ? cleanMoment(morning?.obstacle) : trim(morning?.obstacle);
  const plan = morning?.ifMoment ? cleanPlan(morning?.plan) : trim(morning?.plan);
  if (!obstacle || !plan) return '';
  return morning.ifMoment
    ? `If ${lowerFirst(obstacle)}, I will ${lowerFirst(plan)}`
    : `If ${lowerFirst(obstacle)} gets in the way, I will ${lowerFirst(plan)}`;
};

/** 'HH:MM' → "3:00 PM", or '' when it isn't a time. */
export const formatRemindAt = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return '';
  return new Date(2000, 0, 1, Number(m[1]), Number(m[2])).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

const pairKey = (when, then) => `${cleanMoment(when).toLowerCase()}|${cleanPlan(then).toLowerCase()}`;

/** True when today's if-then is exactly one of `pairs` ({ when, then }), i.e. picked, not written. */
export const isPickedPlan = (morning, pairs = []) => {
  if (!morning?.ifMoment || !trim(morning.obstacle) || !trim(morning.plan)) return false;
  const key = pairKey(morning.obstacle, morning.plan);
  return pairs.some((p) => pairKey(p.when, p.then) === key);
};

/** Your own if-thens that held ("Held" tonight) in the last 4 weeks, newest first, no repeats. */
export const getPastPlans = (logs, todayKey, limit = 2) => {
  const out = [];
  for (let i = 1; i <= PATTERN_DAYS && out.length < limit; i += 1) {
    const m = logs?.[shiftDateKey(todayKey, -i)]?.morning;
    if (!m?.ifMoment || m.planHeld !== 'yes' || !morningIfThen(m)) continue;
    const pair = { when: cleanMoment(m.obstacle), then: cleanPlan(m.plan) };
    if (!out.some((p) => pairKey(p.when, p.then) === pairKey(pair.when, pair.then))) out.push(pair);
  }
  return out;
};

/** One line for the AI's context, or null when the morning journal is empty. */
export const describeMorning = (entry) => {
  if (!hasMorning(entry)) return null;
  const m = entry.morning;
  const parts = [];
  if (trim(m.win)) parts.push(`today is a win if they ${trim(m.win)}${m.result ? ` (tonight they said: ${WIN_RESULT_LABELS[m.result]})` : ''}`);
  if (morningIfThen(m)) {
    const remind = formatRemindAt(m.remindAt);
    parts.push(`if-then plan: "${morningIfThen(m)}"${remind ? ` (reminder at ${remind})` : ''}${m.planHeld ? ` (tonight they said: ${PLAN_HELD_LABELS[m.planHeld]})` : ''}`);
  } else if (trim(m.obstacle)) parts.push(m.ifMoment ? `expects trouble when ${cleanMoment(m.obstacle)}` : `expects "${trim(m.obstacle)}" to get in the way`);
  if (trim(m.identity)) parts.push(`today they'll be someone who ${trim(m.identity)}`);
  if (m.energy > 0) parts.push(`woke up ${m.energy}/5 rested`);
  if (m.rescue?.count > 0) parts.push(`tapped "Off track?" ${m.rescue.count} time${m.rescue.count === 1 ? '' : 's'}`);
  return parts.join('; ');
};

// ─── What the mornings add up to ──────────────────────────────────────────────
// Counted here, never by the model, so a pattern can't claim more than happened.
// A win only counts as done on "Did it" ("Partly" isn't), so every number can be
// traced back to specific days.

export const PATTERN_DAYS = 28;
const MIN_SPLIT_DAYS = 3;

const tally = (rows) => ({ did: rows.filter((r) => r.result === 'yes').length, days: rows.length });

/** The last 4 weeks of finished mornings (today excluded), counted. */
export const getMorningPatterns = (logs, healthLog, todayKey) => {
  const rows = Array.from({ length: PATTERN_DAYS }, (_, i) => shiftDateKey(todayKey, i - PATTERN_DAYS))
    .map((date) => ({ ...logs?.[date]?.morning, sleepHours: healthLog?.[date]?.sleepHours }))
    .filter((m) => trim(m.win) || morningIfThen(m));
  const answered = rows.filter((m) => trim(m.win) && m.result);
  const withSleep = answered.filter((m) => m.sleepHours != null);
  const withRest = answered.filter((m) => m.energy > 0);
  const plans = rows.filter((m) => morningIfThen(m) && m.planHeld && m.planHeld !== 'none');

  const obstacles = new Map();
  rows.filter((m) => trim(m.obstacle)).forEach((m) => {
    const text = m.ifMoment ? cleanMoment(m.obstacle) : trim(m.obstacle);
    const key = text.toLowerCase();
    const o = obstacles.get(key) || { text, times: 0 };
    obstacles.set(key, { ...o, times: o.times + 1 });
  });

  return {
    wins: tally(answered),
    sleptWell: tally(withSleep.filter((m) => m.sleepHours >= SLEEP_MIN_HOURS)),
    sleptShort: tally(withSleep.filter((m) => m.sleepHours < SLEEP_MIN_HOURS)),
    rested: tally(withRest.filter((m) => m.energy >= 4)),
    tired: tally(withRest.filter((m) => m.energy < 4)),
    plans: { held: plans.filter((m) => m.planHeld === 'yes').length, cameUp: plans.length },
    topObstacle: [...obstacles.values()].sort((a, b) => b.times - a.times)[0] || null,
  };
};

const hasBothSides = (a, b) => a.days >= MIN_SPLIT_DAYS && b.days >= MIN_SPLIT_DAYS;

/** The patterns worth saying out loud: nothing shows until it has enough days behind it. */
export const getPatternLines = (p) => {
  const lines = [];
  if (p.wins.days >= MIN_SPLIT_DAYS) lines.push(`You did your win on ${p.wins.did} of ${p.wins.days} days.`);
  if (hasBothSides(p.sleptWell, p.sleptShort)) {
    lines.push(`After ${SLEEP_MIN_HOURS}h+ sleep you did it ${p.sleptWell.did} of ${p.sleptWell.days} days; on less, ${p.sleptShort.did} of ${p.sleptShort.days}.`);
  }
  if (hasBothSides(p.rested, p.tired)) {
    lines.push(`Waking up rested (4-5) you did it ${p.rested.did} of ${p.rested.days} days; otherwise, ${p.tired.did} of ${p.tired.days}.`);
  }
  if (p.plans.cameUp >= MIN_SPLIT_DAYS) lines.push(`Your if-then held ${p.plans.held} of the ${p.plans.cameUp} times it came up.`);
  if (p.topObstacle?.times >= MIN_SPLIT_DAYS) lines.push(`“${lowerFirst(p.topObstacle.text)}” came up in your if-then ${p.topObstacle.times} times.`);
  return lines;
};

/** One week's mornings for the Weekly Reset: counts, plus who they said they'd be. */
export const getWeekMornings = (logs, days) => {
  const mornings = days.map((date) => ({ date, entry: logs?.[date] })).filter((d) => hasMorning(d.entry));
  const answered = mornings.filter((d) => trim(d.entry.morning.win) && d.entry.morning.result);
  const plans = mornings.filter((d) => morningIfThen(d.entry.morning) && d.entry.morning.planHeld && d.entry.morning.planHeld !== 'none');

  const identities = new Map();
  mornings.filter((d) => trim(d.entry.morning.identity)).forEach(({ entry }) => {
    const { identity, result } = entry.morning;
    const key = trim(identity).toLowerCase();
    const row = identities.get(key) || { text: trim(identity), days: 0, didWin: 0 };
    identities.set(key, { ...row, days: row.days + 1, didWin: row.didWin + (result === 'yes' ? 1 : 0) });
  });

  return {
    written: mornings.length,
    wins: tally(answered.map((d) => d.entry.morning)),
    plans: { held: plans.filter((d) => d.entry.morning.planHeld === 'yes').length, cameUp: plans.length },
    identities: [...identities.values()].sort((a, b) => b.days - a.days),
  };
};
