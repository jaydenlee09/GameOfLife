// ─── Daily Log: "Start your day" ──────────────────────────────────────────────
// The morning journal the Daily Log walks through before noon. Pure (no React,
// no storage) so the step rules and suggestions can be checked in plain node.
//
// Saved on today's entry as `entry.morning` (all fields optional):
//   energy    1-5, how rested you woke up (the night's Body card has its own energy)
//   win       "Today is a win if I…" — the one thing that makes today count
//   obstacle  what's most likely to knock you off track
//   plan      what you'll do when it happens (the "I will…" half of an if-then)
//   identity  "Today I'll be someone who…"
//   doneAt    ms timestamp of "Lock in my day"
//   result    'yes' | 'partly' | 'no' — tonight's Look back answer about `win`
// Last night's sleep isn't stored here: it goes to healthLog[today] like the
// night routine's sleep card, so the Daily Score sees it either way.

import { getDayMode } from './homeUtils';
import { getFocusGoal, getNextStep } from './goalUtils';

export const MORNING_STEP_KEYS = ['wake', 'focus', 'lockIn'];

export const MORNING_STEP_META = {
  wake: { label: 'Wake up', title: 'Good morning. How did you wake up?' },
  focus: { label: 'Focus', title: 'What makes today a win?' },
  lockIn: { label: 'Lock in', title: 'Decide now how you’ll handle the hard part.' },
};

export const WIN_RESULT_LABELS = { yes: 'Did it', partly: 'Partly', no: 'Not today' };

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
const lowerFirst = (s) => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);

/**
 * One-tap answers for "Today is a win if I…", most important first: this week's
 * #1 priority, the focus goal's next step, then today's starred tasks. At most 3.
 */
export const getWinSuggestions = ({ todos = [], goals = [], weekPriority, todayKey }) => {
  const out = [];
  const add = (source, text) => {
    const t = lowerFirst(trim(text));
    if (t && !out.some((s) => s.text.toLowerCase() === t.toLowerCase())) out.push({ source, text: t });
  };
  add('week', weekPriority);
  const goal = getFocusGoal(goals);
  if (goal) {
    const next = getNextStep(goal, todos);
    add('goal', next ? next.text : `move “${goal.title}” forward`);
  }
  todos.filter((t) => !t.completed && t.topDate === todayKey).forEach((t) => add('task', t.text));
  return out.slice(0, 3);
};

/** One-tap answers for "What could knock me off track?" (they read as "If ___ gets in the way"). */
export const OBSTACLE_SUGGESTIONS = ['My phone', 'Feeling tired', 'Putting it off', 'Losing focus after lunch'];

/** "When my phone buzzes, I will…" style if-then line, or '' while either half is empty. */
export const morningIfThen = (morning) => {
  const obstacle = trim(morning?.obstacle);
  const plan = trim(morning?.plan);
  return obstacle && plan ? `If ${lowerFirst(obstacle)} gets in the way, I will ${lowerFirst(plan)}` : '';
};

/** One line for the AI's context, or null when the morning journal is empty. */
export const describeMorning = (entry) => {
  if (!hasMorning(entry)) return null;
  const m = entry.morning;
  const parts = [];
  if (trim(m.win)) parts.push(`today is a win if they ${trim(m.win)}${m.result ? ` (tonight they said: ${WIN_RESULT_LABELS[m.result]})` : ''}`);
  if (morningIfThen(m)) parts.push(`if-then plan: "${morningIfThen(m)}"`);
  else if (trim(m.obstacle)) parts.push(`expects "${trim(m.obstacle)}" to get in the way`);
  if (trim(m.identity)) parts.push(`today they'll be someone who ${trim(m.identity)}`);
  if (m.energy > 0) parts.push(`woke up ${m.energy}/5 rested`);
  return parts.join('; ');
};
