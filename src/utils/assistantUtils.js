import { xpCapForLevel } from './xpUtils';
import { computeDailyScore, computeRankStatus, getLocalDateKey, shiftDateKey, STREAK_THRESHOLD } from './scoreUtils';
import { toDateKey, expandEventsForDates, isInstanceCompleted, getBlockOutcome } from './calendarUtils';
import { getHabitStreak } from './habitUtils';
import { getActiveGoals, describeGoal } from './goalUtils';
import { carriedDays, isTop, todayQueue } from './taskUtils';
import { TOOL_DECLARATIONS, getTool, applyOpToState } from './assistantTools';

export const MODEL = 'gemini-2.5-flash';
// Tool rounds per user message before the model is forced to answer in text.
export const MAX_TOOL_ROUNDS = 6;
// Prior chat messages resent each turn.
const HISTORY_LIMIT = 20;

const fmtTime = (h, m) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

const summarizeNorthStar = (northStar) => {
  if (!northStar?.vision?.trim()) return 'NOT SET YET. Helping them define it is a top priority (see HOW YOU WORK).';
  const identity = northStar.identity?.length ? `\nIdentity: ${northStar.identity.map((s) => `"${s}"`).join(' · ')}` : '';
  return `"${northStar.vision}"${identity}`;
};

const summarizeMemory = (memory) => {
  if (!memory?.length) return 'Empty — you have not learned anything durable about them yet.';
  return memory.map((m) => `[${m.id}] (${m.kind}) ${m.text}`).join('\n');
};

const summarizeToday = (state) => {
  const { score, breakdown } = computeDailyScore(state);
  const rank = computeRankStatus(state);
  const parts = Object.values(breakdown).map((b) => b.label).join(' · ');
  const next = rank.nextTier ? ` Next tier: ${rank.nextTier.name} (needs ${rank.nextTier.min}+ daily).` : '';
  return `Daily Score so far: ${score}/10 (${parts}). Streak counts at ${STREAK_THRESHOLD}+.\nRank: ${rank.tier.name}, ${rank.streakDays}-day streak.${next}`;
};

const summarizeTasks = (todos) => {
  const today = getLocalDateKey(0);
  const open = (todos || []).filter((t) => !t.completed);
  if (!open.length) return 'No open tasks.';
  // Today's queue first (Top 3, then stale, then the rest), so the model sees priorities.
  const queue = todayQueue(open, today);
  const ordered = [...queue, ...open.filter((t) => !queue.includes(t))];
  const describe = (t) => {
    const tags = [
      isTop(t, today) && 'TOP 3 today',
      carriedDays(t, today) > 0 && `carried over ${carriedDays(t, today)}d`,
      t.scheduledDate > today && `scheduled ${t.scheduledDate}`,
      t.dueDate && `due ${t.dueDate}`,
    ].filter(Boolean);
    return `- [${t.id}] ${t.text} (${t.timeFrame}${tags.length ? `; ${tags.join('; ')}` : ''})`;
  };
  return ordered.slice(0, 25).map(describe).join('\n')
    + (open.length > 25 ? `\n…and ${open.length - 25} more (get_tasks)` : '');
};

const summarizeHabits = (habits) => {
  if (!habits?.length) return 'No habits tracked.';
  const today = getLocalDateKey(0);
  return habits.map((h) => {
    const history = h.history || {};
    return `- ${h.name || h.text}: ${history[today] ? 'done today' : 'not yet today'}, streak ${getHabitStreak({ ...h, history })}`;
  }).join('\n');
};

/** Today's + tomorrow's calendar: time blocks, no-phone blocks, and reminders */
const summarizeCalendar = (calendarEvents, noPhoneBlocks, calendarDayEvents) => {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const todayKey = toDateKey(now);
  const tomorrowKey = toDateKey(tomorrow);
  const dateKeys = [todayKey, tomorrowKey];

  const events = expandEventsForDates(calendarEvents || [], dateKeys);
  const blocks = expandEventsForDates(noPhoneBlocks || [], dateKeys);
  const byStart = (a, b) => (a.startHour * 60 + a.startMin) - (b.startHour * 60 + b.startMin);

  const dayBlock = (dateKey, label) => {
    const lines = [];
    events
      .filter(ev => ev._instanceDate === dateKey)
      .sort(byStart)
      .forEach(ev => {
        const outcome = getBlockOutcome(ev);
        const done = outcome ? ` (${outcome.status}${outcome.reason ? `: ${outcome.reason}` : ''})` : '';
        lines.push(`  ${fmtTime(ev.startHour, ev.startMin)}-${fmtTime(ev.endHour, ev.endMin)} ${ev.title}${done}`);
      });
    blocks
      .filter(b => b._instanceDate === dateKey)
      .sort(byStart)
      .forEach(b => {
        const done = isInstanceCompleted(b) ? ' (honored)' : '';
        lines.push(`  No Phone: ${fmtTime(b.startHour, b.startMin)}-${fmtTime(b.endHour, b.endMin)}${done}`);
      });
    (calendarDayEvents?.[dateKey] || [])
      .slice()
      .sort((a, b) => (a.time || '').localeCompare(b.time || ''))
      .forEach(r => lines.push(`  Reminder: ${r.title}${r.time ? ` @ ${r.time}` : ''}`));
    return lines.length ? `${label} (${dateKey}):\n${lines.join('\n')}` : `${label} (${dateKey}): nothing scheduled.`;
  };

  return `${dayBlock(todayKey, 'Today')}\n${dayBlock(tomorrowKey, 'Tomorrow')}`;
};

// Focus goals (pinned, then soonest deadline) first, each with how it's moving.
const summarizeGoals = (state) => {
  const active = getActiveGoals(state.goals);
  if (!active.length) return 'No active goals.';
  const now = new Date();
  return active
    .slice(0, 10)
    .map((g) => `- [${g.id}] ${describeGoal(g, state, now)}`)
    .join('\n');
};

const summarizeRecentJournal = (logs, commitmentArchive) => {
  const today = getLocalDateKey(0);
  const yesterday = shiftDateKey(today, -1);
  const lines = [];
  [[yesterday, 'Yesterday'], [today, 'Today']].forEach(([key, label]) => {
    const e = logs?.[key];
    if (!e) { lines.push(`${label}: no Daily Log entry.`); return; }
    const parts = [];
    if (e.emotions?.length) parts.push(`felt ${e.emotions.join(', ')}`);
    if (e.proud?.some((p) => p?.trim())) parts.push(`proud of: ${e.proud.filter((p) => p?.trim()).join('; ')}`);
    if (e.improve?.some((p) => p?.trim())) parts.push(`wants to improve: ${e.improve.filter((p) => p?.trim()).join('; ')}`);
    lines.push(`${label}: ${parts.join(' | ') || 'entry started, mostly empty.'}`);
  });
  const record = (commitmentArchive || []).find((c) => c.date === yesterday);
  const commitmentText = logs?.[yesterday]?.commitment?.trim() || record?.text;
  if (commitmentText) {
    const status = record?.denied === true ? 'MISSED' : record?.confirmedOn ? 'kept' : 'not marked yet';
    lines.push(`Commitment for today (made yesterday): "${commitmentText}" — ${status}.`);
  } else {
    lines.push('No commitment was made for today.');
  }
  return lines.join('\n');
};

const summarizeWeekPriority = (weeklyReviews) => {
  const keys = Object.keys(weeklyReviews || {}).sort();
  const latest = keys.length ? weeklyReviews[keys[keys.length - 1]] : null;
  return latest?.priority?.trim() ? `"${latest.priority.trim()}" (from the ${keys[keys.length - 1]} review)` : 'None set.';
};

/**
 * Builds the system prompt: a compact snapshot of what matters right now, plus how
 * to behave. Everything deeper (history, health, journal ranges, brain dump …) is
 * one read tool away, which keeps every round of the agent loop cheap.
 */
export const buildSystemPrompt = (state) => {
  const { user } = state;
  const now = new Date();
  const nowLine = `${now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}, ${fmtTime(now.getHours(), now.getMinutes())} local time (today is ${getLocalDateKey(0)})`;

  return `You are ${user.name}'s personal coach and assistant inside their self-improvement app "APEX". You are an agent: you can look things up and take real actions in the app with your tools. Your one job is to help ${user.name} become the person described in their North Star — every suggestion, plan and nudge should move them toward it.

YOUR PERSONA — DIRECT COACH:
- Honest and specific. If they are slipping, say so plainly and point at the data that shows it. No sugarcoating, no lecturing, no shaming.
- Genuinely in their corner: name real wins and momentum when they happen.
- Never generic. Every piece of advice cites their actual numbers, tasks, goals, journal or memory.
- Concise by default (a few short lines). Go deeper only when asked or when planning.
- Light RPG flavor is fine (levels, XP) but don't overdo it. Call calendar items "time blocks".
- End every reply with ONE clear next action.
- Formatting: plain text with line breaks; **bold** is supported; "- " bullets are fine. No headings, tables or code blocks.

NOW: ${nowLine}

NORTH STAR (who ${user.name} is becoming):
${summarizeNorthStar(user.northStar)}

LONG-TERM MEMORY (what you've learned about them; ids in brackets):
${summarizeMemory(state.assistantMemory)}

TODAY:
${summarizeToday(state)}

CHARACTER: Level ${user.level} (${user.xp}/${xpCapForLevel(user.level)} XP)

OPEN TASKS (ids in brackets):
${summarizeTasks(state.todos)}

HABITS:
${summarizeHabits(state.habits)}

CALENDAR:
${summarizeCalendar(state.calendarEvents, state.noPhoneBlocks, state.calendarDayEvents)}

ACTIVE GOALS (ids in brackets):
${summarizeGoals(state)}

DAILY LOG & COMMITMENT:
${summarizeRecentJournal(state.logs, state.commitmentArchive)}

THIS WEEK'S #1 PRIORITY: ${summarizeWeekPriority(state.weeklyReviews)}

HOW YOU WORK:
- Look before you speak: if the snapshot above doesn't cover something (past days, health, journal history, score trend, focus time, brain dump, wishlist), call a read tool instead of guessing or saying you lack data. An empty CALENDAR day means nothing is scheduled.
- Act when it helps: when they ask you to plan, schedule, capture or organize something, do it with tools rather than describing what they could do. Check get_calendar before scheduling so blocks don't collide.
- Safe actions (create task / time block / template, brain dump note, new goal, goal milestone, remember/forget) apply immediately and the user can undo them. Edits and deletes (update/delete task, move/delete time block, update goal, set North Star) only become proposals the user approves in the chat — say they're waiting for approval, never claim they're done.
- Never say you did something unless a tool call for it succeeded. If a tool returns an error, fix the arguments or tell them plainly.
- XP is earned, never handed out: you cannot complete tasks, tick habits, complete time blocks or resolve commitments. Remind them to do it themselves.
- Memory: when you learn something durable (a recurring pattern, how they like to work, life context, a notable win), call remember. Keep memory accurate — forget entries that are outdated or wrong. Don't store one-off details.
- North Star: if it's not set, help them articulate it in their own words through a short conversation, then propose it with set_north_star. Measure plans and advice against it.
- A broken streak, a missed commitment or stress in the journal are things to address directly, with one concrete fix.`;
};

// ─── Chat history → Gemini contents ───────────────────────────────────────────
// Stored messages keep their own extra fields (ids, actions, flags); Gemini only
// gets role + text. Actions a past reply took are appended as a note so the model
// can follow up on them ("undo that", "move it to 6pm").
const describeMessage = (msg) => {
  let text = msg.parts?.map((p) => p.text).filter(Boolean).join('\n') || '';
  if (msg.role === 'model') {
    const notes = [];
    if (msg.actionsTaken?.length) notes.push(`Actions I took: ${msg.actionsTaken.map((a) => a.label).join('; ')}`);
    const proposals = (msg.proposedActions || []).filter((a) => a.label);
    if (proposals.length) notes.push(`Proposals: ${proposals.map((a) => `${a.label} [${a.status}]`).join('; ')}`);
    if (notes.length) text += `\n\n(${notes.join(' | ')})`;
  }
  return text;
};

export const toGeminiContents = (history, userMessage) => {
  const messages = [
    ...(history || []).slice(-HISTORY_LIMIT).map((msg) => ({ role: msg.role === 'model' ? 'model' : 'user', text: describeMessage(msg) })),
    { role: 'user', text: userMessage },
  ].filter((m) => m.text.trim());

  // Gemini expects user/model turns to alternate and to open with a user turn.
  const contents = [];
  messages.forEach(({ role, text }) => {
    const last = contents[contents.length - 1];
    if (last?.role === role) last.parts[0].text += `\n\n${text}`;
    else contents.push({ role, parts: [{ text }] });
  });
  if (contents[0]?.role === 'model') contents.unshift({ role: 'user', parts: [{ text: '(conversation start)' }] });
  return contents;
};

// ─── Gemini call ──────────────────────────────────────────────────────────────
export const hasAssistantApiKey = () => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  return !!apiKey && apiKey !== 'your_gemini_api_key_here';
};

let clientPromise = null;
const getClient = () => {
  if (!clientPromise) {
    clientPromise = import('@google/genai').then(({ GoogleGenAI }) => new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY }));
  }
  return clientPromise;
};

/** One model call. `allowTools: false` forces a plain-text answer. */
export const geminiGenerate = async ({ contents, systemPrompt, allowTools }) => {
  if (!hasAssistantApiKey()) {
    throw new Error('Missing Gemini API key. Add VITE_GEMINI_API_KEY to your .env file.');
  }
  const ai = await getClient();
  return ai.models.generateContent({
    model: MODEL,
    contents,
    config: {
      systemInstruction: systemPrompt,
      temperature: 0.7,
      maxOutputTokens: 8192,
      tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
      toolConfig: { functionCallingConfig: { mode: allowTools ? 'AUTO' : 'NONE' } },
    },
  });
};

/** One tool-free model call constrained to a JSON `schema` (used by the Daily Log review). */
export const geminiGenerateJson = async ({ contents, systemPrompt, schema }) => {
  if (!hasAssistantApiKey()) {
    throw new Error('Missing Gemini API key. Add VITE_GEMINI_API_KEY to your .env file.');
  }
  const ai = await getClient();
  return ai.models.generateContent({
    model: MODEL,
    contents,
    config: {
      systemInstruction: systemPrompt,
      temperature: 0.6,
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
      responseSchema: schema,
    },
  });
};

// ─── The agent loop ───────────────────────────────────────────────────────────
/**
 * Runs one assistant turn: the model may call tools for several rounds (reading
 * data, applying safe actions to a working copy of state, proposing edits) before
 * it answers in text.
 *
 * Nothing touches React state here. Safe actions come back in `applied` (each with
 * its `op` + `inverse`) for the caller to commit all at once, so a turn that fails
 * halfway applies nothing. Edits/deletes come back in `proposed` for approval.
 *
 * Returns { text, applied: [{tool, label, op, inverse}], proposed: [{tool, args, label}] }
 */
export const runAssistantTurn = async ({
  history, userMessage, state, generate = geminiGenerate, maxRounds = MAX_TOOL_ROUNDS,
}) => {
  const systemPrompt = buildSystemPrompt(state);
  const contents = toGeminiContents(history, userMessage);
  let working = state;
  const applied = [];
  const proposed = [];

  const handleCall = (call) => {
    const tool = getTool(call.name);
    if (!tool) return { error: `Unknown tool "${call.name}".` };
    const args = call.args || {};
    try {
      if (tool.tier === 'read') return tool.run(args, { state: working });
      const prepared = tool.prepare(args, { state: working });
      if (tool.tier === 'auto') {
        working = applyOpToState(working, prepared.op);
        applied.push({ tool: tool.name, label: prepared.label, op: prepared.op, inverse: prepared.inverse });
        return { ok: true, done: prepared.label, ...prepared.result };
      }
      proposed.push({ tool: tool.name, args, label: prepared.label });
      return { status: 'awaiting_user_approval', proposal: prepared.label, note: 'Not applied yet. Tell the user it is waiting for their approval below your message.' };
    } catch (err) {
      return { error: err.message || String(err) };
    }
  };

  for (let round = 0; ; round++) {
    const allowTools = round < maxRounds;
    const response = await generate({ contents, systemPrompt, allowTools });
    const calls = allowTools ? (response.functionCalls || []) : [];

    if (!calls.length) {
      const text = (response.text || '').trim();
      const fallback = applied.length || proposed.length
        ? [...applied.map((a) => `Done: ${a.label}`), ...proposed.map((p) => `Waiting for your approval: ${p.label}`)].join('\n')
        : 'No response received.';
      return { text: text || fallback, applied, proposed };
    }

    // Echo the model's turn back verbatim: it carries the thought signatures
    // Gemini 2.5 needs to continue reasoning across tool rounds.
    contents.push(response.candidates?.[0]?.content || { role: 'model', parts: calls.map((functionCall) => ({ functionCall })) });
    contents.push({
      role: 'user',
      parts: calls.map((call) => ({
        functionResponse: { ...(call.id ? { id: call.id } : {}), name: call.name, response: handleCall(call) },
      })),
    });
  }
};
