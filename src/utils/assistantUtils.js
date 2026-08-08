import { xpCapForLevel } from './xpUtils';
import { computeRankStatus } from './scoreUtils';
import { toDateKey, expandEventsForDates, isInstanceCompleted } from './calendarUtils';
import { ACHIEVEMENTS } from './achievementsMeta';

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

const assistantDateKey = (offset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Summarize the most recent health entry + food budget */
const summarizeHealth = (healthLog, foodPoints) => {
  if (!healthLog || Object.keys(healthLog).length === 0) return 'No health data logged.';
  const entry = healthLog[assistantDateKey(0)] || healthLog[assistantDateKey(-1)] || {};
  const parts = [];
  if (entry.sleepHours) parts.push(`Sleep: ${entry.sleepHours.toFixed(1)}h`);
  if (entry.energyLevel) parts.push(`Energy: ${entry.energyLevel}/5`);
  if (entry.workouts?.length) parts.push(`Workouts: ${entry.workouts.map(w => w.type).join(', ')}`);
  if (entry.screentimeHours != null) parts.push(`Screen time: ${entry.screentimeHours.toFixed(1)}h`);
  if (entry.waterGlasses) parts.push(`Water: ${entry.waterGlasses} bottles`);
  if (foodPoints?.balance != null) parts.push(`Food budget: ${foodPoints.balance}`);
  return parts.length ? parts.join(' | ') : 'Health logged but sparse.';
};

/** Summarize focus/pomodoro time */
const summarizeFocus = (pomodoroSessions) => {
  if (!pomodoroSessions?.length) return 'No focus sessions yet.';
  const todayKey = assistantDateKey(0);
  const week = new Set(Array.from({ length: 7 }, (_, i) => assistantDateKey(-i)));
  const mins = (filter) => pomodoroSessions.filter(filter).reduce((s, p) => s + Math.floor(p.durationSecs / 60), 0);
  const todayMins = mins(s => s.date === todayKey && s.completed);
  const weekMins = mins(s => week.has(s.date) && s.completed);
  return `Focused ${todayMins}m today, ${weekMins}m over the last 7 days.`;
};

/** Summarize active goals with progress */
const summarizeGoals = (goals) => {
  if (!goals?.length) return 'No goals set.';
  const active = goals.filter(g => !g.completed);
  if (!active.length) return 'All goals completed — time to set new ones.';
  return active.slice(0, 8).map(g => {
    const ms = g.milestones || [];
    let prog = '';
    if (ms.length) prog = ` (${ms.filter(m => m.completed).length}/${ms.length} milestones)`;
    else if (g.targetValue) prog = ` (${g.currentValue || 0}/${g.targetValue}${g.unit ? ' ' + g.unit : ''})`;
    return `${g.pinned ? '[Pinned] ' : ''}${g.title} [${g.period}]${prog}`;
  }).join('\n');
};

/** Summarize the latest weekly review */
const summarizeWeekly = (weeklyReviews) => {
  if (!weeklyReviews || Object.keys(weeklyReviews).length === 0) return 'No weekly reviews yet.';
  const latest = weeklyReviews[Object.keys(weeklyReviews).sort().reverse()[0]];
  const parts = [];
  if (latest.priority?.trim()) parts.push(`This week's #1 priority: ${latest.priority}`);
  if (latest.improvements?.trim()) parts.push(`Wants to improve: ${latest.improvements}`);
  if (latest.heldBack?.trim()) parts.push(`Held back by: ${latest.heldBack}`);
  return parts.length ? parts.join(' | ') : 'Weekly review logged.';
};

const fmtTime = (h, m) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

/** Summarize today's + tomorrow's calendar: time blocks, no-phone blocks, and reminders */
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
        const attrs = ev.attributes?.length ? ` [${ev.attributes.join(', ')}]` : '';
        const done = isInstanceCompleted(ev) ? ' (done)' : '';
        lines.push(`  ${fmtTime(ev.startHour, ev.startMin)}-${fmtTime(ev.endHour, ev.endMin)} ${ev.title}${attrs}${done}`);
      });
    blocks
      .filter(b => b._instanceDate === dateKey)
      .sort(byStart)
      .forEach(b => {
        const done = isInstanceCompleted(b) ? ' (done)' : '';
        lines.push(`  No Phone: ${fmtTime(b.startHour, b.startMin)}-${fmtTime(b.endHour, b.endMin)}${done}`);
      });
    (calendarDayEvents?.[dateKey] || [])
      .slice()
      .sort((a, b) => (a.time || '').localeCompare(b.time || ''))
      .forEach(r => lines.push(`  Reminder: ${r.title}${r.time ? ` @ ${r.time}` : ''}`));
    return lines.length ? `${label}:\n${lines.join('\n')}` : `${label}: nothing scheduled.`;
  };

  return `${dayBlock(todayKey, 'Today')}\n${dayBlock(tomorrowKey, 'Tomorrow')}`;
};

/** Summarize unlocked achievements */
const summarizeAchievements = (achievements) => {
  const unlocked = Object.keys(achievements || {}).filter(id => achievements[id]);
  if (!unlocked.length) return 'None unlocked yet.';
  const labels = unlocked.map(id => ACHIEVEMENTS.find(a => a.id === id)?.label || id);
  return `${unlocked.length}/${ACHIEVEMENTS.length} unlocked: ${labels.join(', ')}`;
};

/** Summarize the wishlist/reward shop */
const summarizeShop = (shop) => {
  const items = shop?.items || [];
  if (!items.length) return 'Wishlist is empty.';
  const unpurchased = items.filter(i => !i.purchased);
  const top = unpurchased
    .slice()
    .sort((a, b) => (b.priority === 'high') - (a.priority === 'high'))
    .slice(0, 5)
    .map(i => `${i.name} ($${Number(i.price).toFixed(2)}${i.priority ? `, ${i.priority} priority` : ''})`);
  return top.length ? `Wishlist (${unpurchased.length} unpurchased): ${top.join('; ')}` : 'All wishlist items purchased.';
};

/** Summarize brain dump notes */
const summarizeBrainDump = (brainDumpNotes) => {
  if (!brainDumpNotes?.length) return 'No brain dump notes.';
  const texts = brainDumpNotes.map(n => n.text?.trim()).filter(Boolean).slice(0, 15);
  return texts.length ? texts.join(' | ') : 'No brain dump notes.';
};

/**
 * Builds the system prompt for the Gemini-backed assistant.
 * Injects the player's full game state so the assistant has real context.
 */
export const buildSystemPrompt = (user, todos, habits, logs, extra = {}) => {
  const {
    healthLog, foodPoints, pomodoroSessions, goals, weeklyReviews, xpLog, commitmentArchive,
    calendarEvents, noPhoneBlocks, calendarDayEvents, achievements, shop, brainDumpNotes,
  } = extra;
  const rankStatus = computeRankStatus(habits, xpLog, logs, commitmentArchive, healthLog);
  const { weakest, strongest, all } = analyzeStats(user.stats);
  const xpCap = xpCapForLevel(user.level);
  const xpPercent = Math.round((user.xp / xpCap) * 100);

  const statsBlock = all.map(s => `  ${s.label}: Lv ${s.level} (${s.xp} XP)`).join('\n');
  const weakBlock = weakest.map(s => `  - ${s.label} (Lv ${s.level})`).join('\n');
  const strongBlock = strongest.map(s => `  - ${s.label} (Lv ${s.level})`).join('\n');

  return `You are ${user.name}'s personal life assistant inside their self-improvement app called "APEX". Your role is to be a direct, no-nonsense, deeply invested assistant — like a personal trainer meets life coach. You use the RPG game framing naturally (stats, levels, XP) because that's how ${user.name} tracks their real life.

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
Level: ${user.level} | Rank: ${rankStatus.tier.name} (${rankStatus.streakDays}-day streak)
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

CALENDAR (time blocks, No Phone blocks, reminders):
${summarizeCalendar(calendarEvents, noPhoneBlocks, calendarDayEvents)}

GOALS:
${summarizeGoals(goals)}

FOCUS TIME:
${summarizeFocus(pomodoroSessions)}

HEALTH:
${summarizeHealth(healthLog, foodPoints)}

LATEST WEEKLY REVIEW:
${summarizeWeekly(weeklyReviews)}

RECENT JOURNAL (last 7 days):
${summarizeLogs(logs)}

ACHIEVEMENTS:
${summarizeAchievements(achievements)}

WISHLIST / REWARD SHOP:
${summarizeShop(shop)}

BRAIN DUMP NOTES:
${summarizeBrainDump(brainDumpNotes)}

INSTRUCTIONS:
- When ${user.name} asks how their day/schedule looks, read straight from the CALENDAR section above — it already covers today and tomorrow. An empty day means the CALENDAR section says "nothing scheduled," not that you lack the data.
- When ${user.name} first opens this chat (or asks "how am I doing"), proactively give a brief, pointed status report: call out the weakest stat(s), any neglected tasks, and one concrete thing they should focus on today.
- When asked about a specific area, go deeper with actionable steps.
- Reference journal emotions if they reveal stress, anxiety, or burnout — address those directly.
- If their commitment streak is broken (no recent journal entries), call it out.
- Always end responses with a clear next action.

AI ACTION FORMAT:
- You can propose structured app actions, but they require user confirmation before execution.
- Valid stat keys (for "categories"/"attributes" below): ${all.map(s => s.key).join(', ')}
- Respond ONLY valid JSON using this exact shape, choosing one payload schema per action type:
  {
    "message": "string",
    "actions": [
      {
        "type": "create_task",
        "payload": {
          "text": "string, REQUIRED, non-empty — the task description",
          "timeFrame": "today | tomorrow | this-week | this-month",
          "categories": ["zero or more of the valid stat keys above"],
          "xp": number (optional, defaults based on timeFrame),
          "notes": "string, optional"
        }
      },
      {
        "type": "create_calendar_event",
        "payload": {
          "title": "string, REQUIRED, non-empty",
          "date": "YYYY-MM-DD, REQUIRED",
          "startTime": "HH:MM 24h, REQUIRED",
          "endTime": "HH:MM 24h, REQUIRED",
          "attributes": ["zero or more of the valid stat keys above"],
          "recurrence": "none | daily | weekly",
          "recurrenceDays": "array of ints 0-6 (Sun=0…Sat=6), OPTIONAL — only used when recurrence is 'weekly'; e.g. every Monday = [1], every Sat & Sun = [0,6]. Omit to repeat on the given date's own weekday.",
          "xpAmount": number (optional),
          "notes": "string, optional"
        }
      },
      {
        "type": "create_quick_event_template",
        "payload": {
          "title": "string, REQUIRED, non-empty",
          "duration": number (minutes, 15-720),
          "attributes": ["zero or more of the valid stat keys above"],
          "recurrence": "none | daily | weekly",
          "recurrenceDays": "array of ints 0-6 (Sun=0…Sat=6), OPTIONAL — only used when recurrence is 'weekly'; e.g. every Monday = [1], every Sat & Sun = [0,6]",
          "xpAmount": number (optional),
          "color": "hex string like #818cf8, optional"
        }
      }
    ]
  }
- Every action's payload MUST include every REQUIRED field above with a real, non-empty value. Never invent different field names (e.g. no "title" on create_task — it must be "text"; no "text" on the other two — they use "title").
- If no actions are needed, return an empty array: "actions": []
- Do not include markdown, code fences, or extra text outside JSON.`;
};

const parseAssistantResponse = (rawText) => {
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
export const sendToAssistant = async (history, userMessage, systemPrompt) => {
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

  return parseAssistantResponse(response.text || '');
};
