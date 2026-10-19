// ─── My Assistant: focus debrief comment ──────────────────────────────────────
// After a focus session's debrief, the coach replies in two or three sentences.
// One tool-free structured-JSON call (like the Daily Log review), so it can't
// change anything. The numbers it may cite come from computeFocusInsights.

import { computeFocusInsights, FOCUS_BLOCKERS, FOCUS_OUTCOMES } from './focusInsights';

const label = (list, id) => list.find((x) => x.id === id)?.label || id;

export const FOCUS_COMMENT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    comment: {
      type: 'STRING',
      description: '2-3 short sentences, under 60 words: react to how the session went, then ONE concrete adjustment for the next session (aimed at the blocker if there was one).',
    },
  },
  required: ['comment'],
};

export const buildFocusCommentPrompt = (name) => `You are ${name}'s focus coach inside their self-improvement app "APEX". They just finished a focus session and told you how it went.

PERSONA — DIRECT COACH: honest, specific, in their corner. Name it when they delivered. When they fell short, no shaming: give one practical fix for the next session, aimed at what got in the way.

RULES:
- Use only the data given. If you cite a pattern (best hours, finish rate, a repeated blocker), it must be in "history".
- Speak to them as "you". Plain text, no markdown, no lists.
- Don't offer to schedule or create anything; you can't.`;

export const buildFocusCommentContext = (state, session, now = new Date()) => {
  const insights = computeFocusInsights(state.pomodoroSessions, now);
  const task = session.taskId != null ? (state.todos || []).find((t) => String(t.id) === String(session.taskId)) : null;
  return {
    name: state.user?.name || 'you',
    session: {
      minutes: Math.round((session.durationSecs || 0) / 60),
      startedAt: new Date(session.startedAt).toTimeString().slice(0, 5),
      intent: session.intent || null,
      task: task?.text || null,
      fromPlannedBlock: session.blockId != null,
      outcome: label(FOCUS_OUTCOMES, session.debrief?.outcome),
      blockers: (session.debrief?.blockers || []).map((id) => label(FOCUS_BLOCKERS, id)),
      note: session.debrief?.note || null,
      thoughtsParked: session.parked || 0,
    },
    history: {
      sessionsLast30Days: insights.sessions,
      minutesLast30Days: insights.minutes,
      finishRatePercent: insights.successRate == null ? null : Math.round(insights.successRate * 100),
      bestWindows: insights.best.map((w) => `${w.from}-${w.to}`),
      topBlockers: insights.topBlockers.map((b) => `${b.label} (${b.count}x)`),
    },
    northStar: state.user?.northStar?.vision || null,
  };
};

/** Resolves the comment text. `generate` is geminiGenerateJson in the app. */
export const generateFocusComment = async ({ state, session, generate, now = new Date() }) => {
  const context = buildFocusCommentContext(state, session, now);
  const response = await generate({
    systemPrompt: buildFocusCommentPrompt(context.name),
    contents: [{ role: 'user', parts: [{ text: `Here's my focus session debrief, as JSON:\n${JSON.stringify(context)}` }] }],
    schema: FOCUS_COMMENT_SCHEMA,
    thinking: false, // a small, well-specified job: skip the reasoning step
  });
  const data = JSON.parse(response.text || '{}');
  const comment = typeof data.comment === 'string' ? data.comment.trim() : '';
  if (!comment) throw new Error('No comment came back.');
  return comment.slice(0, 500);
};
