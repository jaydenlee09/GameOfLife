// ─── Daily Log: "Help me improve" ─────────────────────────────────────────────
// When you write what you can improve, My Assistant can coach you on it on
// request: what's likely behind it, a few practical tips, and one small step for
// tomorrow written as an if-then plan you can commit to. One tool-free
// structured-JSON call (like "Learn more" on lessons), so it can't change
// anything. The result is saved on the entry as `improveCoach`, tied to the exact
// improve text it was written for (`forText`), so editing the notes marks it stale.

import { shiftDateKey } from './scoreUtils';
import { getFocusGoal } from './goalUtils';
import { expandEventsForDates } from './calendarUtils';
import { composeIfThen } from './closeDay';
import EMOTIONS from './logMeta';

const HISTORY_DAYS = 14;
const MAX_TOMORROW_BLOCKS = 10;

const STR = (description) => ({ type: 'STRING', description });

export const IMPROVE_COACH_SCHEMA = {
  type: 'OBJECT',
  properties: {
    focus: STR('The one thing from their notes you are coaching them on, in 2-6 words. If they wrote several, pick the one that would make tomorrow better the most (usually the one that keeps coming back).'),
    why: STR('2-3 sentences on what is most likely behind it, using their own data (repeats in recentImprove, whether they worked on it before, sleep, energy, mood). Honest and kind, no lecture. Max 60 words.'),
    tips: { type: 'ARRAY', items: STR('One practical tip, specific to them. Starts with a verb. Max 18 words.'), description: '2-3 tips.' },
    cue: STR('WHEN tomorrow: a specific moment or trigger, ideally an existing block from tomorrowBlocks or a daily routine ("I sit down at my desk at 9am"). Lowercase start, no leading "when". Max 12 words.'),
    action: STR('WHAT they will do: one small, concrete step that takes 2-30 minutes. Lowercase start, no leading "I will". Max 14 words.'),
  },
  required: ['focus', 'why', 'tips', 'cue', 'action'],
  propertyOrdering: ['focus', 'why', 'tips', 'cue', 'action'],
};

export const buildCoachSystemPrompt = (name) => `You are ${name}'s coach inside their self-improvement app "APEX". In their nightly journal they wrote what they can improve. Help them actually improve it, starting tomorrow.

RULES:
- Ground everything in what they wrote and the data you're given. Don't invent facts about them, studies, statistics or quotes.
- If the same thing keeps showing up in recentImprove, or workedOnIt says they didn't manage it, name that plainly and make tomorrow's step smaller and easier to start, not bigger.
- Tomorrow's step must be small enough that a tired version of them would still do it, and specific enough that they'll know when they did it.
- Speak to them as "you". Plain text, no markdown, no emojis.`;

const clean = (list) => (Array.isArray(list) ? list.map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean) : []);
const emotionLabel = (id) => EMOTIONS.find((e) => e.id === id)?.label || id;
const pad = (n) => String(n).padStart(2, '0');
const fmtTime = (h, m) => `${pad(h)}:${pad(m)}`;

/** The improve text a coach card is written for: the day's notes, one per line. */
export const improveText = (entry) => clean(entry?.improve).join('\n');

/** True when a saved coach card was written for older improve notes. */
export const isCoachStale = (entry) => !!entry?.improveCoach
  && entry.improveCoach.forText !== improveText(entry);

/** Tomorrow's step as one commitment line ("When X, I will Y"). */
export const coachStepText = (coach) => (coach?.cue && coach?.action ? composeIfThen(coach.cue, coach.action) : '');

/** What the model sees: tonight's notes, how past ones went, today, and tomorrow's plan. */
export const buildCoachContext = (state, dateKey, now = new Date()) => {
  const logs = state.logs || {};
  const entry = logs[dateKey] || {};
  const tomorrow = shiftDateKey(dateKey, 1);
  const health = state.healthLog?.[dateKey] || {};
  const goal = getFocusGoal(state.goals, now);

  const past = Array.from({ length: HISTORY_DAYS }, (_, i) => shiftDateKey(dateKey, i - HISTORY_DAYS));
  const recentImprove = past
    .map((date) => ({ date, items: clean(logs[date]?.improve) }))
    .filter((d) => d.items.length > 0);
  // Each entry's loopCheck answers whether the previous note was worked on.
  const workedOnIt = past
    .map((date) => logs[date]?.loopCheck)
    .filter((c) => c?.text && c?.result)
    .map((c) => ({ item: c.text, from: c.from, answer: c.result }));

  const tomorrowBlocks = expandEventsForDates(state.calendarEvents || [], [tomorrow])
    .sort((a, b) => (a.startHour * 60 + a.startMin) - (b.startHour * 60 + b.startMin))
    .slice(0, MAX_TOMORROW_BLOCKS)
    .map((ev) => ({ time: `${fmtTime(ev.startHour, ev.startMin)}-${fmtTime(ev.endHour, ev.endMin)}`, title: ev.title }));

  return {
    date: dateKey,
    wantsToImprove: clean(entry.improve),
    today: {
      ...(entry.dayRating ? { dayRatingOutOf10: entry.dayRating } : {}),
      ...(entry.emotions?.length ? { mood: entry.emotions.map(emotionLabel) } : {}),
      ...(health.sleepHours != null ? { sleepHours: Math.round(health.sleepHours * 10) / 10 } : {}),
      ...(health.energyLevel ? { energyOutOf5: health.energyLevel } : {}),
      ...(clean(entry.proud).length ? { wins: clean(entry.proud) } : {}),
    },
    recentImprove,
    workedOnIt,
    tomorrowBlocks,
    focusGoal: goal?.title || null,
    northStar: state.user?.northStar?.vision?.trim() || null,
  };
};

const toText = (value, max) => {
  const t = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  return t.length > max ? `${t.slice(0, max - 1).replace(/\s+\S*$/, '')}…` : t;
};

// The UI writes "When {cue}, I will {action}", so strip the model's own lead-ins and end punctuation.
const stripLead = (text, re) => text.replace(re, '').replace(/[\s.,;:!]+$/, '').trim();
const lowerFirst = (s) => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);

/** Validates the model's JSON into the stored shape (minus metadata). */
export const normalizeCoach = (raw) => {
  const data = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw;
  const coach = {
    focus: toText(data?.focus, 60),
    why: toText(data?.why, 480),
    tips: (Array.isArray(data?.tips) ? data.tips : []).map((t) => toText(t, 160)).filter(Boolean).slice(0, 3),
    cue: lowerFirst(stripLead(toText(data?.cue, 120), /^(when|if)\s+/i)),
    action: lowerFirst(stripLead(toText(data?.action, 140), /^i\s+will\s+/i)),
  };
  if (!coach.why || !coach.cue || !coach.action) throw new Error('The coaching came back incomplete. Try again.');
  return coach;
};

/**
 * Resolves the record to store as `entry.improveCoach`. `generate` is
 * geminiGenerateJson in the app (injected so this stays testable).
 */
export const generateImproveCoach = async ({ state, dateKey, generate, now = Date.now() }) => {
  const context = buildCoachContext(state, dateKey, new Date(now));
  if (!context.wantsToImprove.length) throw new Error('Write what you want to improve first.');
  const response = await generate({
    systemPrompt: buildCoachSystemPrompt(state.user?.name || 'the user'),
    contents: [{ role: 'user', parts: [{ text: `Here is what I want to improve and some context about me, as JSON:\n${JSON.stringify(context)}` }] }],
    schema: IMPROVE_COACH_SCHEMA,
  });
  return { ...normalizeCoach(response.text), forText: improveText(state.logs?.[dateKey]), generatedAt: now };
};
