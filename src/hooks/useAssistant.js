import { useCallback, useEffect, useRef, useState } from 'react';
import { runAssistantTurn, geminiGenerateJson } from '../utils/assistantUtils';
import { generateLogReview, upsertReview, reviewToChatText } from '../utils/logReview';
import { getTool, applySliceOp, undoBlocker } from '../utils/assistantTools';
import { generateDayPlan, planToEvents, fromMinutes } from '../utils/dayPlanner';
import { generateHomeBrief } from '../utils/homeBrief';
import { generateFocusComment } from '../utils/focusCoach';
import { generateLogPatterns } from '../utils/logPatterns';
import { generateLessonInsight } from '../utils/lessonInsight';

const makeId = (prefix) => `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
const ACTIVITY_LIMIT = 100;
const pad = (n) => String(n).padStart(2, '0');
const dateLabel = (dateKey) => {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

const friendlyError = (err) => {
  const message = err?.message || String(err);
  if (/API key not valid|API_KEY_INVALID/i.test(message)) {
    return 'Your Gemini API key is invalid. Get a fresh one at aistudio.google.com and put it in .env as VITE_GEMINI_API_KEY.';
  }
  if (/429|RESOURCE_EXHAUSTED|quota/i.test(message)) {
    return "Gemini's free-tier rate limit was hit. Wait a minute and try again.";
  }
  return message;
};

// Proposal cards saved before the agent rewrite carry `type` + a normalized
// `payload` instead of `tool` + raw `args`; map them onto today's tools.
const proposalToolAndArgs = (action) => {
  if (action.tool) return { tool: getTool(action.tool), args: action.args || {} };
  const payload = action.payload || {};
  if (action.type === 'create_calendar_event') {
    return {
      tool: getTool('create_calendar_event'),
      args: { ...payload, startTime: `${pad(payload.startHour)}:${pad(payload.startMin)}`, endTime: `${pad(payload.endHour)}:${pad(payload.endMin)}` },
    };
  }
  return { tool: getTool(action.type), args: payload };
};

/**
 * Owns the assistant's side effects: running agent turns, committing the ops they
 * produce, the activity/undo log, and approving or rejecting proposals.
 *
 * `state` is every slice the agent can read (plus chatHistory/assistantActivity);
 * `setters` maps each op `collection` to its React setter. Both are read through a
 * ref so long-running turns and click handlers always see the latest values.
 */
export default function useAssistant({ state, setters, setChatHistory, setActivity, setLogReviews }) {
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; });

  const [isLoading, setIsLoading] = useState(false);
  const loadingRef = useRef(false);
  const [error, setError] = useState(null);

  const commitOp = useCallback((op) => {
    const setter = setters[op.collection];
    if (!setter) throw new Error(`No setter for ${op.collection}`);
    setter((prev) => applySliceOp(prev, op));
  }, [setters]);

  const recordActivity = useCallback((entries) => {
    if (!entries.length) return;
    setActivity((prev) => [...entries.slice().reverse(), ...(prev || [])].slice(0, ACTIVITY_LIMIT));
  }, [setActivity]);

  /**
   * Sends a message and runs the agent loop. `hidden` keeps the prompt out of the
   * visible chat (used by check-ins); `kind` tags the reply (e.g. 'morning') and
   * marks it unread; `silent` suppresses the error banner. Resolves true on
   * success, false on failure, null if skipped because a turn is already running.
   */
  const send = useCallback(async (text, { hidden = false, kind = null, silent = false } = {}) => {
    const trimmed = text?.trim();
    if (!trimmed || loadingRef.current) return null;
    loadingRef.current = true;
    setIsLoading(true);
    setError(null);

    const snapshot = stateRef.current;
    const userMsg = { id: makeId('msg'), role: 'user', parts: [{ text: trimmed }], ...(hidden ? { hidden: true } : {}) };
    setChatHistory((prev) => [...prev, userMsg]);

    try {
      const result = await runAssistantTurn({
        history: snapshot.chatHistory,
        userMessage: trimmed,
        state: snapshot,
      });

      const at = Date.now();
      const entries = result.applied.map((a) => ({
        id: makeId('act'), at, tool: a.tool, label: a.label, inverse: a.inverse, undone: false,
      }));
      result.applied.forEach((a) => commitOp(a.op));
      recordActivity(entries);

      const modelMsg = {
        id: makeId('msg'),
        role: 'model',
        parts: [{ text: result.text }],
        ...(entries.length ? { actionsTaken: entries.map((e) => ({ activityId: e.id, label: e.label })) } : {}),
        ...(result.proposed.length ? {
          proposedActions: result.proposed.map((p) => ({ id: makeId('prop'), tool: p.tool, args: p.args, label: p.label, status: 'pending' })),
        } : {}),
        ...(kind ? { kind, unread: true } : {}),
      };
      setChatHistory((prev) => [...prev, modelMsg]);
      return true;
    } catch (err) {
      if (!silent) setError(friendlyError(err));
      setChatHistory((prev) => prev.filter((msg) => msg.id !== userMsg.id));
      return false;
    } finally {
      loadingRef.current = false;
      setIsLoading(false);
    }
  }, [commitOp, recordActivity, setChatHistory]);

  const updateProposal = useCallback((messageId, actionId, patch) => {
    setChatHistory((prev) => prev.map((msg) => (msg.id !== messageId ? msg : {
      ...msg,
      proposedActions: (msg.proposedActions || []).map((a) => (a.id === actionId ? { ...a, ...patch } : a)),
    })));
  }, [setChatHistory]);

  // Re-validates against *current* state: the task/block may have changed since
  // the proposal was made, and the undo must capture what's there now.
  const approve = useCallback((messageId, actionId) => {
    const current = stateRef.current;
    const msg = current.chatHistory.find((m) => m.id === messageId);
    const action = msg?.proposedActions?.find((a) => a.id === actionId);
    if (!action || action.status !== 'pending') return;
    try {
      const { tool, args } = proposalToolAndArgs(action);
      if (!tool || tool.tier === 'read') throw new Error('This proposal is no longer supported. Ask the assistant again.');
      const prepared = tool.prepare(args, { state: current });
      commitOp(prepared.op);
      const entry = { id: makeId('act'), at: Date.now(), tool: tool.name, label: prepared.label, inverse: prepared.inverse, undone: false };
      recordActivity([entry]);
      updateProposal(messageId, actionId, { status: 'applied', activityId: entry.id, label: prepared.label, resultMessage: null });
    } catch (err) {
      updateProposal(messageId, actionId, { status: 'failed', resultMessage: err.message });
    }
  }, [commitOp, recordActivity, updateProposal]);

  const reject = useCallback((messageId, actionId) => {
    updateProposal(messageId, actionId, { status: 'rejected' });
  }, [updateProposal]);

  /** Reverts one logged action. Resolves { ok, message }. */
  const undo = useCallback((activityId) => {
    const current = stateRef.current;
    const entry = (current.assistantActivity || []).find((e) => e.id === activityId);
    if (!entry || entry.undone) return { ok: false, message: 'Already undone.' };
    const blocker = undoBlocker(entry.inverse, current);
    if (blocker) return { ok: false, message: blocker };
    commitOp(entry.inverse);
    setActivity((prev) => prev.map((e) => (e.id === activityId ? { ...e, undone: true, undoneAt: Date.now() } : e)));
    return { ok: true, message: `Undid: ${entry.label}` };
  }, [commitOp, setActivity]);

  // Daily Log review: report-only, so it runs beside chat turns rather than
  // queueing behind them. Only one review runs at a time.
  const [reviewingDate, setReviewingDate] = useState(null);
  const reviewingRef = useRef(false);

  /**
   * Reviews one day's log, saves the report, and copies it into the chat (after a
   * hidden user line) so follow-up questions have it as context. Resolves
   * { ok: true } or { ok: false, error }.
   */
  const reviewLog = useCallback(async (dateKey) => {
    if (reviewingRef.current) return { ok: false, error: 'A review is already running.' };
    reviewingRef.current = true;
    setReviewingDate(dateKey);
    try {
      const review = await generateLogReview({ state: stateRef.current, dateKey, generate: geminiGenerateJson });
      setLogReviews((prev) => upsertReview(prev, review));
      const label = dateLabel(dateKey);
      setChatHistory((prev) => [
        ...prev,
        { id: makeId('msg'), role: 'user', parts: [{ text: `[I submitted my Daily Log for ${label} (${dateKey}) and you reviewed it.]` }], hidden: true },
        { id: makeId('msg'), role: 'model', parts: [{ text: reviewToChatText(review, label) }], kind: 'log-review' },
      ]);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: friendlyError(err) };
    } finally {
      reviewingRef.current = false;
      setReviewingDate(null);
    }
  }, [setChatHistory, setLogReviews]);

  // ─── Plan My Day ────────────────────────────────────────────────────────────
  /** Builds a plan proposal; writes nothing. Resolves { ok, plan } or { ok: false, error }. */
  const planDay = useCallback(async ({ dateKey, settings, endTime }) => {
    try {
      const plan = await generateDayPlan({ state: stateRef.current, dateKey, settings, endTime, generate: geminiGenerateJson });
      return { ok: true, plan };
    } catch (err) {
      return { ok: false, error: friendlyError(err) };
    }
  }, []);

  /**
   * Adds the reviewed plan's blocks to the Calendar as one action with one undo,
   * and notes it in the chat so follow-ups ("move my 3pm block") have context.
   */
  const applyPlan = useCallback((plan, blocks) => {
    const items = planToEvents(blocks, { dateKey: plan.dateKey, planId: plan.id });
    if (!items.length) return { ok: false, error: 'Nothing to add.' };
    const label = `Planned ${dateLabel(plan.dateKey)}: ${items.length} block${items.length === 1 ? '' : 's'}`;
    commitOp({ collection: 'calendarEvents', kind: 'insertMany', items });
    const entry = {
      id: makeId('act'), at: Date.now(), tool: 'plan_day', label,
      inverse: { collection: 'calendarEvents', kind: 'removeMany', ids: items.map((e) => e.id) }, undone: false,
    };
    recordActivity([entry]);
    const lines = blocks.map((b) => `- ${fromMinutes(b.start)}-${fromMinutes(b.end)} ${b.title}${b.intent ? `: ${b.intent}` : ''}`).join('\n');
    setChatHistory((prev) => [
      ...prev,
      { id: makeId('msg'), role: 'user', parts: [{ text: `[I used Plan My Day for ${plan.dateKey} and added the plan to my calendar.]` }], hidden: true },
      { id: makeId('msg'), role: 'model', parts: [{ text: `**Plan for ${dateLabel(plan.dateKey)}**\n${plan.summary ? `${plan.summary}\n` : ''}${lines}` }], kind: 'plan', actionsTaken: [{ activityId: entry.id, label }] },
    ]);
    return { ok: true, count: items.length, activityId: entry.id };
  }, [commitOp, recordActivity, setChatHistory]);

  // ─── Focus debrief comment ──────────────────────────────────────────────────
  /** Resolves { ok, comment } or { ok: false, error }. Writes nothing. */
  const commentOnFocus = useCallback(async (session) => {
    try {
      const comment = await generateFocusComment({ state: stateRef.current, session, generate: geminiGenerateJson });
      return { ok: true, comment };
    } catch (err) {
      return { ok: false, error: friendlyError(err) };
    }
  }, []);

  // ─── Home one-liner ─────────────────────────────────────────────────────────
  /** Resolves { ok, brief } or { ok: false, error }. Writes nothing; the caller saves it. */
  const briefHome = useCallback(async ({ weekPriority, logReviews } = {}) => {
    try {
      const brief = await generateHomeBrief({ state: stateRef.current, weekPriority, logReviews, generate: geminiGenerateJson });
      return { ok: true, brief };
    } catch (err) {
      return { ok: false, error: friendlyError(err) };
    }
  }, []);

  // ─── Daily Log pattern flags ────────────────────────────────────────────────
  /** Resolves { ok, patterns } or { ok: false, error }. Writes nothing; the caller saves it. */
  const findLogPatterns = useCallback(async (todayKey) => {
    try {
      const patterns = await generateLogPatterns({ state: stateRef.current, todayKey, generate: geminiGenerateJson });
      return { ok: true, patterns };
    } catch (err) {
      return { ok: false, error: friendlyError(err) };
    }
  }, []);

  // ─── Daily Log "Learn more" ─────────────────────────────────────────────────
  /** Resolves { ok, insight } or { ok: false, error }. Writes nothing; the caller saves it on the entry. */
  const expandLesson = useCallback(async (dateKey) => {
    try {
      const insight = await generateLessonInsight({ state: stateRef.current, dateKey, generate: geminiGenerateJson });
      return { ok: true, insight };
    } catch (err) {
      return { ok: false, error: friendlyError(err) };
    }
  }, []);

  return {
    send, approve, reject, undo, reviewLog, reviewingDate, planDay, applyPlan, commentOnFocus, briefHome, findLogPatterns, expandLesson,
    isLoading, error, clearError: () => setError(null),
  };
}
