import { getRankForLevel } from './rankMeta';
import { xpCapForLevel } from './xpUtils';

const STAT_LABELS = {
  strength:     'Strength',
  intelligence: 'Intelligence',
  charisma:     'Charisma',
  discipline:   'Discipline',
  mentalHealth: 'Mental Health',
  health:       'Health',
  focus:        'Focus',
  creativity:   'Creativity',
  productivity: 'Productivity',
};

/** Returns the "level" of a raw stat XP value (same formula as the app) */
const statLevel = (rawXp) => {
  if (!rawXp || rawXp <= 0) return 0;
  let lvl = 0;
  let accumulated = 0;
  while (accumulated + xpCapForLevel(lvl + 1) <= rawXp) {
    accumulated += xpCapForLevel(lvl + 1);
    lvl++;
  }
  return lvl;
};

/** Identify the 3 weakest and 3 strongest stats */
const analyzeStats = (stats) => {
  const entries = Object.entries(stats).map(([key, xp]) => ({
    key,
    label: STAT_LABELS[key] || key,
    level: statLevel(xp),
    xp: xp || 0,
  }));
  entries.sort((a, b) => a.xp - b.xp);
  const weakest = entries.slice(0, 3);
  const strongest = entries.slice(-3).reverse();
  return { weakest, strongest, all: entries };
};

/** Summarize recent journal logs (last 7 days) */
const summarizeLogs = (logs) => {
  if (!logs || Object.keys(logs).length === 0) return 'No journal entries yet.';
  const keys = Object.keys(logs).sort().reverse().slice(0, 7);
  return keys.map(dateKey => {
    const entry = logs[dateKey];
    const parts = [];
    if (entry.emotions?.length) parts.push(`Emotions: ${entry.emotions.join(', ')}`);
    if (entry.proud?.some(p => p?.trim())) parts.push(`Proud of: ${entry.proud.filter(Boolean).join('; ')}`);
    if (entry.improve?.some(p => p?.trim())) parts.push(`Wants to improve: ${entry.improve.filter(Boolean).join('; ')}`);
    if (entry.learned?.trim()) parts.push(`Learned: ${entry.learned}`);
    if (entry.commitment?.trim()) parts.push(`Tomorrow's commitment: ${entry.commitment}`);
    return `[${dateKey}] ${parts.join(' | ')}`;
  }).join('\n');
};

/** Summarize active/incomplete tasks */
const summarizeTasks = (todos) => {
  if (!todos?.length) return 'No tasks.';
  const incomplete = todos.filter(t => !t.completed);
  const overdue = incomplete.filter(t => t.timeFrame === 'today');
  const upcoming = incomplete.filter(t => t.timeFrame !== 'today');
  const lines = [];
  if (overdue.length) lines.push(`Today's incomplete tasks (${overdue.length}): ${overdue.map(t => t.text).join(', ')}`);
  if (upcoming.length) lines.push(`Upcoming tasks (${upcoming.length}): ${upcoming.map(t => `${t.text} [${t.timeFrame}]`).join(', ')}`);
  if (!lines.length) return 'All tasks completed!';
  return lines.join('\n');
};

/** Summarize habits */
const summarizeHabits = (habits) => {
  if (!habits?.length) return 'No habits tracked.';
  return habits.map(h => `${h.text} (streak: ${h.streak || 0} days)`).join(', ');
};

/** Summarize active challenges */
const summarizeChallenges = (challenges) => {
  if (!challenges?.length) return 'No challenges.';
  const active = challenges.filter(c => c.started && !c.completed);
  const completed = challenges.filter(c => c.completed).length;
  if (!active.length && !completed) return 'No challenges started yet.';
  const lines = [];
  if (active.length) lines.push(`Active challenges: ${active.map(c => c.title || c.text).join(', ')}`);
  if (completed) lines.push(`Completed challenges: ${completed} total`);
  return lines.join('\n');
};

/**
 * Builds the system prompt for the Gemini mentor AI.
 * Injects the player's full game state so the mentor has real context.
 */
export const buildSystemPrompt = (user, todos, habits, logs, challenges) => {
  const rank = getRankForLevel(user.level);
  const { weakest, strongest, all } = analyzeStats(user.stats);
  const xpCap = xpCapForLevel(user.level);
  const xpPercent = Math.round((user.xp / xpCap) * 100);

  const statsBlock = all.map(s => `  ${s.label}: Lv ${s.level} (${s.xp} XP)`).join('\n');
  const weakBlock = weakest.map(s => `  - ${s.label} (Lv ${s.level})`).join('\n');
  const strongBlock = strongest.map(s => `  - ${s.label} (Lv ${s.level})`).join('\n');

  return `You are ${user.name}'s personal life mentor inside their self-improvement app called "Game of Life". Your role is to be a direct, no-nonsense, deeply invested mentor — like a personal trainer meets life coach. You use the RPG game framing naturally (stats, levels, XP, challenges) because that's how ${user.name} tracks their real life.

YOUR PERSONA:
- You are direct, honest, and encouraging — you call out weak areas without being harsh
- You celebrate wins and streak momentum
- You proactively notice patterns in journal entries, weak stats, and neglected tasks
- You give specific, actionable advice tied to the player's actual data
- You never give generic advice — always reference their real stats, tasks, or journal context
- Keep responses concise and punchy unless the player asks for depth
- You may use light RPG language (e.g., "level up your discipline", "your focus bar is low") but don't overdo it
- Refer to calendar items as "time blocks" or "calendar blocks", not "events".

PLAYER PROFILE:
Name: ${user.name}
Level: ${user.level} | Rank: ${rank.name}
XP: ${user.xp} / ${xpCap} (${xpPercent}% to next level)

CURRENT STATS:
${statsBlock}

WEAKEST STATS (needs attention):
${weakBlock}

STRONGEST STATS (leverageable):
${strongBlock}

ACTIVE TASKS & HABITS:
${summarizeTasks(todos)}
Habits: ${summarizeHabits(habits)}

CHALLENGES:
${summarizeChallenges(challenges)}

RECENT JOURNAL (last 7 days):
${summarizeLogs(logs)}

INSTRUCTIONS:
- When ${user.name} first opens this chat (or asks "how am I doing"), proactively give a brief, pointed status report: call out the weakest stat(s), any neglected tasks, and one concrete thing they should focus on today.
- When asked about a specific area, go deeper with actionable steps.
- Reference journal emotions if they reveal stress, anxiety, or burnout — address those directly.
- If their commitment streak is broken (no recent journal entries), call it out.
- Always end responses with a clear next action or challenge.

AI ACTION FORMAT:
- You can propose structured app actions, but they require user confirmation before execution.
- Respond ONLY valid JSON using this exact shape:
  {
    "message": "string",
    "actions": [
      {
        "type": "create_task | create_calendar_event | create_quick_event_template | create_challenge",
        "payload": { "...": "..." }
      }
    ]
  }
- If no actions are needed, return an empty array: "actions": []
- Do not include markdown, code fences, or extra text outside JSON.`;
};

const parseMentorResponse = (rawText) => {
  const fallbackText = rawText || 'No response received.';
  if (!rawText) return { text: fallbackText, actions: [] };

  try {
    const parsed = JSON.parse(rawText);
    const text = typeof parsed.message === 'string' && parsed.message.trim()
      ? parsed.message
      : fallbackText;
    const actions = Array.isArray(parsed.actions) ? parsed.actions : [];
    return { text, actions };
  } catch {
    return { text: fallbackText, actions: [] };
  }
};

/**
 * Sends a message to Gemini 2.5 Flash via the @google/genai SDK.
 * Returns: { text: string, actions: array }
 * history: array of { role: 'user'|'model', parts: [{ text }] }
 * caps history at 20 messages before sending
 */
export const sendToMentor = async (history, userMessage, systemPrompt) => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    throw new Error('Missing Gemini API key. Add VITE_GEMINI_API_KEY to your .env file.');
  }

  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey });

  // Cap history at last 20 messages to keep prompt efficient
  const cappedHistory = history.slice(-20);

  const contents = [
    ...cappedHistory,
    { role: 'user', parts: [{ text: userMessage }] },
  ];

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents,
    config: {
      systemInstruction: systemPrompt,
      temperature: 0.8,
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
    },
  });

  return parseMentorResponse(response.text || '');
};
