// ─── My Assistant: Home's daily one-liner ─────────────────────────────────────
// One sentence at the top of Home naming the single thing that matters most
// today. Made once per day and saved on the user (`user.homeBrief`), so every
// device shows the same line and it costs one model call a day. Tool-free
// structured-JSON call (like the Daily Log review), so it can't change anything.

import { computeDailyScore, shiftDateKey } from './scoreUtils';
import { getHabitStreak } from './habitUtils';
import { getActiveGoals, describeGoal } from './goalUtils';
import { getTool } from './assistantTools';
import { toDateKey } from './calendarUtils';
import { isTop, todayQueue } from './taskUtils';

export const BRIEF_MAX_CHARS = 180;

export const BRIEF_SCHEMA = {
  type: 'OBJECT',
  properties: {
    line: {
      type: 'STRING',
      description: 'ONE sentence, max 22 words: the single most important thing to do today and, briefly, why it matters. Starts with a verb or with "Today". No greeting.',
    },
  },
  required: ['line'],
};

export const buildBriefSystemPrompt = (name) => `You are ${name}'s coach inside their self-improvement app "APEX". Write the one line they see at the top of their home screen today.

PERSONA — DIRECT COACH: specific, honest, in their corner. Not hype, not generic motivation.

RULES:
- Pick the ONE thing that matters most today from the data: a planned block, a task, a goal milestone, a habit streak at risk, or the weekly priority. Prefer what moves their North Star.
- Name it concretely (use the real task/block/goal name, and the time if it's scheduled).
- Use only the data given. Never invent tasks, times or numbers.
- Speak to them as "you". Plain text, no markdown, no emojis, no quotation marks around the whole line.`;

const habitName = (h) => h.name || h.text || 'Unnamed habit';

/** Everything the one-liner looks at, as one plain object. */
export const buildBriefContext = (state, now, { weekPriority, logReviews } = {}) => {
  const todayKey = toDateKey(now);
  const yesterdayKey = shiftDateKey(todayKey, -1);
  const calendar = getTool('get_calendar').run({ from: todayKey, to: todayKey }, { state });

  // Top 3 first (marked), then what else is on today.
  const openTasks = todayQueue(state.todos || [], todayKey)
    .slice(0, 10)
    .map((t) => (isTop(t, todayKey) ? `[Top 3] ${t.text}` : t.text));

  const goals = getActiveGoals(state.goals).slice(0, 4).map((g) => describeGoal(g, state, now));

  const yesterdayCommitment = state.logs?.[yesterdayKey]?.commitment?.trim() || null;
  const yesterdayReview = logReviews?.[yesterdayKey];

  return {
    name: state.user?.name || 'you',
    now: `${todayKey} ${now.toTimeString().slice(0, 5)} (${now.toLocaleDateString('en-US', { weekday: 'long' })})`,
    northStar: state.user?.northStar?.vision?.trim() || null,
    thisWeeksPriority: weekPriority || null,
    calendarToday: calendar.blocks.map(({ time, title, done }) => ({ time, title, done })),
    openTasksToday: openTasks,
    habits: (state.habits || []).map((h) => ({
      name: habitName(h),
      currentStreak: getHabitStreak({ ...h, history: h.history || {} }),
      doneToday: !!h.history?.[todayKey],
    })),
    activeGoals: goals,
    yesterday: {
      dailyScore: computeDailyScore(state, yesterdayKey).score,
      commitmentForToday: yesterdayCommitment,
      reviewSaidFocusOn: yesterdayReview?.tomorrowFocus || null,
    },
  };
};

const tidy = (text) => {
  let line = typeof text === 'string' ? text.trim().replace(/\s+/g, ' ') : '';
  if (/^["“].*["”]$/.test(line)) line = line.slice(1, -1).trim();
  if (line.length > BRIEF_MAX_CHARS) line = `${line.slice(0, BRIEF_MAX_CHARS - 1).replace(/\s+\S*$/, '')}…`;
  return line;
};

/**
 * Resolves the record to store as `user.homeBrief`. `generate` is
 * geminiGenerateJson in the app (injected so this stays testable).
 */
export const generateHomeBrief = async ({ state, now = new Date(), weekPriority, logReviews, generate }) => {
  const context = buildBriefContext(state, now, { weekPriority, logReviews });
  const response = await generate({
    systemPrompt: buildBriefSystemPrompt(context.name),
    contents: [{ role: 'user', parts: [{ text: `Write today's line. Here is my day, as JSON:\n${JSON.stringify(context)}` }] }],
    schema: BRIEF_SCHEMA,
  });
  const data = JSON.parse(response.text || '{}');
  const text = tidy(data.line);
  if (!text) throw new Error('No line came back.');
  return { date: toDateKey(now), text, generatedAt: now.getTime() };
};
