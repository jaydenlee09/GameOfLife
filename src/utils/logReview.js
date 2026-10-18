// ─── My Assistant: Daily Log review ───────────────────────────────────────────
// When a Daily Log is submitted, the assistant writes a short report on the day.
// It's report-only: one structured-JSON Gemini call with no tools, so it can't
// change anything. The context is gathered here (reusing the agent's read tools,
// so the review and the chat see the same data) and sent as a single message.

import { computeDailyScore, shiftDateKey } from './scoreUtils';
import { getHabitStreak } from './habitUtils';
import { getActiveGoals, describeGoal } from './goalUtils';
import { getTool } from './assistantTools';
import EMOTIONS from './logMeta';
import { taskLabelsCompletedOn } from './taskUtils';

// Reviews kept in the synced `gameOfLife_logReviews` key (one Firestore doc).
export const LOG_REVIEW_LIMIT = 120;
const TREND_DAYS = 7;

const clean = (list) => (Array.isArray(list) ? list.map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean) : []);
const emotionLabel = (id) => EMOTIONS.find((e) => e.id === id)?.label || id;
const habitName = (h) => h.name || h.text || 'Unnamed habit';

/** True when the entry has anything worth reviewing. */
export const entryHasContent = (entry) => !!entry && (
  entry.emotions?.length > 0
  || clean(entry.proud).length > 0
  || clean(entry.improve).length > 0
  || !!entry.learned?.trim()
  || !!entry.notes?.trim()
  || !!entry.commitment?.trim()
  || entry.dayRating > 0
  || !!entry.prompt?.answer?.trim()
);

/**
 * Stable fingerprint of what the user wrote, to tell when an entry was edited after
 * its review. The Close the Day fields are appended only when present, so entries
 * (and reviews) from before them keep the exact fingerprint they were saved with.
 */
export const entryFingerprint = (entry) => {
  const parts = [
    [...(entry?.emotions || [])].sort(),
    clean(entry?.proud),
    clean(entry?.improve),
    entry?.learned?.trim() || '',
    entry?.notes?.trim() || '',
    entry?.commitment?.trim() || '',
  ];
  const extra = {
    ...(entry?.dayRating ? { dayRating: entry.dayRating } : {}),
    ...(entry?.prompt?.answer?.trim() ? { prompt: entry.prompt.answer.trim() } : {}),
    ...(entry?.loopCheck?.result ? { loop: entry.loopCheck.result } : {}),
  };
  return JSON.stringify(Object.keys(extra).length ? [...parts, extra] : parts);
};

/** Everything the review looks at, as one plain object. */
export const buildReviewContext = (state, dateKey) => {
  const entry = state.logs?.[dateKey] || {};
  const from = shiftDateKey(dateKey, -TREND_DAYS);
  const prevDay = shiftDateKey(dateKey, -1);
  const run = (name, args) => getTool(name).run(args, { state });

  const day = computeDailyScore(state, dateKey);
  const scoreTrend = Array.from({ length: TREND_DAYS }, (_, i) => {
    const key = shiftDateKey(dateKey, i - TREND_DAYS);
    return { date: key, score: computeDailyScore(state, key).score };
  });

  const health = run('get_health', { from, to: dateKey }).days;
  const calendar = run('get_calendar', { from: dateKey, to: dateKey });
  const priorJournal = run('get_journal', { from, to: prevDay }).entries;

  const prevRecord = (state.commitmentArchive || []).find((c) => c.date === prevDay);
  const prevCommitmentText = state.logs?.[prevDay]?.commitment?.trim() || prevRecord?.text || null;
  const recentCommitments = (state.commitmentArchive || [])
    .filter((c) => c.date >= from && c.date < dateKey)
    .map((c) => (c.denied === true ? 'missed' : c.confirmedOn ? 'kept' : 'unresolved'));

  const dayEnd = new Date(`${dateKey}T23:59:00`);
  const goals = getActiveGoals(state.goals).slice(0, 6).map((g) => describeGoal(g, state, dayEnd));

  return {
    name: state.user?.name || 'you',
    date: dateKey,
    entry: {
      emotions: (entry.emotions || []).map(emotionLabel),
      proudOf: clean(entry.proud),
      wantsToImprove: clean(entry.improve),
      learned: entry.learned?.trim() || null,
      notes: entry.notes?.trim() || null,
      commitmentForTomorrow: entry.commitment?.trim() || null,
      dayRatingOutOf10: entry.dayRating || null,
      nightlyQuestion: entry.prompt?.answer?.trim() ? { question: entry.prompt.text, answer: entry.prompt.answer.trim() } : null,
      workedOnLastImprove: entry.loopCheck?.result ? { item: entry.loopCheck.text, answer: entry.loopCheck.result } : null,
    },
    dailyScore: {
      score: day.score,
      breakdown: Object.fromEntries(Object.entries(day.breakdown).map(([k, v]) => [k, `${v.label} (${v.value}/10, weight ${v.weight}%)`])),
    },
    scoreLast7Days: scoreTrend,
    habits: (state.habits || []).map((h) => ({
      name: habitName(h),
      doneThatDay: !!h.history?.[dateKey],
      currentStreak: getHabitStreak({ ...h, history: h.history || {} }),
    })),
    tasksCompletedThatDay: taskLabelsCompletedOn(state.xpLog, dateKey),
    healthLast7DaysAndThatDay: health,
    calendarThatDay: { blocks: calendar.blocks.map(({ time, title, done }) => ({ time, title, done })), noPhone: calendar.noPhone },
    commitmentDueThatDay: prevCommitmentText
      ? { text: prevCommitmentText, status: prevRecord?.denied === true ? 'missed' : prevRecord?.confirmedOn ? 'kept' : 'not marked yet' }
      : null,
    commitmentsLast7Days: { kept: recentCommitments.filter((s) => s === 'kept').length, missed: recentCommitments.filter((s) => s === 'missed').length },
    priorJournalEntries: priorJournal,
    northStar: state.user?.northStar?.vision?.trim()
      ? { vision: state.user.northStar.vision, identity: state.user.northStar.identity || [] }
      : null,
    activeGoals: goals,
    whatYouKnowAboutThem: (state.assistantMemory || []).map((m) => `(${m.kind}) ${m.text}`),
  };
};

// ─── Gemini request ───────────────────────────────────────────────────────────
const STR = (description) => ({ type: 'STRING', description });
const LIST = (description) => ({ type: 'ARRAY', items: { type: 'STRING' }, description });

export const REVIEW_SCHEMA = {
  type: 'OBJECT',
  properties: {
    headline: STR('One-sentence verdict on the day, specific to it. Max 20 words.'),
    wins: LIST('1-3 real wins from the day, each citing what they wrote or did.'),
    patterns: LIST('1-3 patterns or trends from comparing this day with the last 7 days (score, sleep, energy, habits, emotions, repeated "improve" items). Cite numbers.'),
    watchOuts: LIST('0-2 things slipping or at risk, said plainly. Empty if nothing is.'),
    commitmentFeedback: STR('One or two sentences on their commitment for tomorrow: is it specific, realistic, and tied to what they want to improve? Suggest a sharper wording if it is vague. Empty string if they made none.'),
    northStarNote: STR("One sentence on how today moved them toward (or away from) their North Star. Empty string if it isn't set."),
    tomorrowFocus: STR('The ONE concrete thing to do tomorrow, with when if possible. Max 25 words.'),
  },
  required: ['headline', 'wins', 'patterns', 'watchOuts', 'commitmentFeedback', 'northStarNote', 'tomorrowFocus'],
  propertyOrdering: ['headline', 'wins', 'patterns', 'watchOuts', 'commitmentFeedback', 'northStarNote', 'tomorrowFocus'],
};

export const buildReviewSystemPrompt = (name) => `You are ${name}'s personal coach inside their self-improvement app "APEX". ${name} just submitted their Daily Log. Write a short review report of that day.

PERSONA — DIRECT COACH: honest and specific, genuinely in their corner. Name real wins; say plainly where they slipped. No sugarcoating, no lecturing, no shaming, no generic advice.

RULES:
- Every point must come from the data you're given: what they wrote, their Daily Score and its breakdown, habits, tasks, health, calendar, commitments, the previous 7 days, North Star, goals and what you know about them. Never invent facts. If something wasn't logged, don't pretend it was.
- Speak to them as "you". Plain text only, no markdown. Each list item is one sentence, under 25 words.
- Compare against the last 7 days where it adds insight (e.g. "third day this week under 7h sleep").
- If what they wrote and the data disagree (e.g. proud of a workout, but none logged), point it out gently.
- This is a report. You cannot take actions, so don't offer to schedule or create anything.`;

const toList = (value, max) => clean(value).slice(0, max);
const toText = (value) => (typeof value === 'string' ? value.trim() : '');

/** Validates the model's JSON into the stored review shape (minus metadata). */
export const normalizeReview = (raw) => {
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const review = {
    headline: toText(data?.headline),
    wins: toList(data?.wins, 3),
    patterns: toList(data?.patterns, 3),
    watchOuts: toList(data?.watchOuts, 2),
    commitmentFeedback: toText(data?.commitmentFeedback),
    northStarNote: toText(data?.northStarNote),
    tomorrowFocus: toText(data?.tomorrowFocus),
  };
  if (!review.headline || !review.tomorrowFocus) throw new Error('The review came back incomplete. Try again.');
  return review;
};

/**
 * Generates the review for one day. `generate` is injected (geminiGenerateJson
 * in the app) so this stays testable. Resolves the full review record to store.
 */
export const generateLogReview = async ({ state, dateKey, generate, now = Date.now() }) => {
  const context = buildReviewContext(state, dateKey);
  const response = await generate({
    systemPrompt: buildReviewSystemPrompt(context.name),
    contents: [{ role: 'user', parts: [{ text: `Review my Daily Log for ${dateKey}. Here is everything you need, as JSON:\n${JSON.stringify(context)}` }] }],
    schema: REVIEW_SCHEMA,
  });
  return {
    ...normalizeReview(response.text),
    date: dateKey,
    score: context.dailyScore.score,
    generatedAt: now,
    entryFingerprint: entryFingerprint(state.logs?.[dateKey]),
  };
};

/** Adds a review, keeping only the most recent LOG_REVIEW_LIMIT days. */
export const upsertReview = (reviews, review) => {
  const next = { ...(reviews || {}), [review.date]: review };
  const keys = Object.keys(next).sort();
  keys.slice(0, Math.max(0, keys.length - LOG_REVIEW_LIMIT)).forEach((key) => delete next[key]);
  return next;
};

/** The chat copy, in the drawer's formatting (plain text, **bold**, "- " bullets). */
export const reviewToChatText = (review, dateLabel) => {
  const section = (title, items) => (items.length ? `**${title}**\n${items.map((i) => `- ${i}`).join('\n')}` : null);
  return [
    `**Daily Log review: ${dateLabel}** (Daily Score ${review.score}/10)`,
    review.headline,
    section('Wins', review.wins),
    section('Patterns', review.patterns),
    section('Watch out', review.watchOuts),
    review.commitmentFeedback ? `**Your commitment**\n${review.commitmentFeedback}` : null,
    review.northStarNote ? `**North Star**\n${review.northStarNote}` : null,
    `**Tomorrow's focus**\n${review.tomorrowFocus}`,
  ].filter(Boolean).join('\n\n');
};
