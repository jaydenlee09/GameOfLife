// ─── Daily Log: "Learn more" about a lesson ───────────────────────────────────
// When you write "one thing I learned", My Assistant can expand it on request:
// a short explainer, one way to try it tomorrow, and a way to go deeper. One
// tool-free structured-JSON call (like the Daily Log review), so it can't change
// anything. The result is saved on the entry as `lessonInsight`, tied to the exact
// lesson text it was written for (`forText`), so editing the lesson marks it stale.

import { getFocusGoal } from './goalUtils';

const STR = (description) => ({ type: 'STRING', description });

export const LESSON_INSIGHT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    explainer: STR('2-3 sentences on what is behind this lesson: the mechanism, reason or evidence, in plain words. If the lesson is wrong or oversimplified, say so kindly and give the accurate version. Max 60 words.'),
    tryIt: STR('One concrete way to use this lesson tomorrow, tied to their goals or North Star when it genuinely fits. Starts with a verb. Max 25 words.'),
    deeperQuestion: STR('One follow-up question they could ask to go deeper, written in first person as they would ask it. Max 18 words.'),
    searchFor: STR('A short, general search phrase (3-6 words) to read more about the topic. Topic only, nothing personal about them.'),
  },
  required: ['explainer', 'tryIt', 'deeperQuestion', 'searchFor'],
  propertyOrdering: ['explainer', 'tryIt', 'deeperQuestion', 'searchFor'],
};

export const buildLessonSystemPrompt = (name) => `You are ${name}'s coach inside their self-improvement app "APEX". In their nightly journal they wrote one thing they learned today. Help them learn a little more about it, briefly.

RULES:
- Be accurate. Explain only what is well established; don't invent studies, statistics, quotes or sources. If it's genuinely uncertain or depends on the person, say that.
- If the lesson is a personal realisation (about their habits, people, themselves), explain the general principle behind it rather than lecturing.
- Keep it short and specific to what they wrote. Speak to them as "you". Plain text, no markdown, no emojis.`;

/** What the model sees: the lesson plus just enough about the person to make "try it" relevant. */
export const buildLessonContext = (state, dateKey, now = new Date()) => {
  const goal = getFocusGoal(state.goals, now);
  return {
    lesson: state.logs?.[dateKey]?.learned?.trim() || '',
    northStar: state.user?.northStar?.vision?.trim() || null,
    focusGoal: goal?.title || null,
  };
};

const toText = (value, max) => {
  const t = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  return t.length > max ? `${t.slice(0, max - 1).replace(/\s+\S*$/, '')}…` : t;
};

/** Validates the model's JSON into the stored shape (minus metadata). */
export const normalizeLessonInsight = (raw) => {
  const data = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw;
  const insight = {
    explainer: toText(data?.explainer, 480),
    tryIt: toText(data?.tryIt, 200),
    deeperQuestion: toText(data?.deeperQuestion, 160),
    searchFor: toText(data?.searchFor, 80),
  };
  if (!insight.explainer || !insight.tryIt) throw new Error('The explanation came back incomplete. Try again.');
  return insight;
};

/** True when a saved insight was written for an older version of the lesson. */
export const isInsightStale = (entry) => !!entry?.lessonInsight
  && entry.lessonInsight.forText !== (entry.learned?.trim() || '');

/** Link to read more, from the model's general topic phrase. */
export const searchUrl = (phrase) => `https://www.google.com/search?q=${encodeURIComponent(phrase)}`;

/**
 * Resolves the record to store as `entry.lessonInsight`. `generate` is
 * geminiGenerateJson in the app (injected so this stays testable).
 */
export const generateLessonInsight = async ({ state, dateKey, generate, now = Date.now() }) => {
  const context = buildLessonContext(state, dateKey, new Date(now));
  if (!context.lesson) throw new Error('Write the lesson first.');
  const response = await generate({
    systemPrompt: buildLessonSystemPrompt(state.user?.name || 'the user'),
    contents: [{ role: 'user', parts: [{ text: `Here is my lesson and a little about me, as JSON:\n${JSON.stringify(context)}` }] }],
    schema: LESSON_INSIGHT_SCHEMA,
  });
  return { ...normalizeLessonInsight(response.text), forText: context.lesson, generatedAt: now };
};
