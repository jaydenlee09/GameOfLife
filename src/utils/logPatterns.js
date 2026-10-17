// ─── Daily Log: pattern flags ─────────────────────────────────────────────────
// Spots weaknesses that keep coming back, so the Daily Log can offer to turn one
// into a habit or tomorrow's commitment. Two sources:
//   - AI: My Assistant groups the last 14 days of "improve" notes by theme, once
//     per night, saved as `user.logPatterns` (the user key already syncs, so every
//     device shows the same flags and it costs one model call a night).
//   - Code: the habit missed most over the same window, from habit history.
// The model only proposes groupings; the counts are recomputed here from the
// dates it cites, so a flag can never claim more repeats than you actually wrote.

import { shiftDateKey } from './scoreUtils';

export const PATTERN_WINDOW_DAYS = 14;
export const MIN_REPEATS = 3;
const MAX_FLAGS = 2;

const clean = (list) => (Array.isArray(list) ? list.map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean) : []);
const habitName = (h) => h.name || h.text || 'Unnamed habit';

/** The window's finished days (today excluded, so the result is stable for the night), oldest first. */
const windowKeys = (todayKey) => Array.from({ length: PATTERN_WINDOW_DAYS }, (_, i) => shiftDateKey(todayKey, i - PATTERN_WINDOW_DAYS));

/** "Improve" notes from the window, one row per day that has any. */
export const getImproveHistory = (logs, todayKey) => windowKeys(todayKey)
  .map((date) => ({ date, items: clean(logs?.[date]?.improve) }))
  .filter((d) => d.items.length > 0);

/** A theme can only repeat MIN_REPEATS times if at least that many days have notes. */
export const hasEnoughForPatterns = (logs, todayKey) => getImproveHistory(logs, todayKey).length >= MIN_REPEATS;

// Habit ids are Date.now() at creation for anything made in-app; older seeds use
// small ids, which count as "existed for the whole window".
const habitCreatedKey = (habit) => {
  const id = Number(habit.id);
  if (!Number.isFinite(id) || id < 1e12) return null;
  const d = new Date(id);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * The habit missed most over the window's finished days, counting only days the
 * habit existed. Flagged when it was missed at least half the time over 7+ days.
 */
export const getHabitLeak = (habits, todayKey) => {
  let worst = null;
  for (const habit of habits || []) {
    const created = habitCreatedKey(habit);
    const days = windowKeys(todayKey).filter((key) => !created || key >= created);
    if (days.length < 7) continue;
    const done = days.filter((key) => habit.history?.[key]).length;
    const missed = days.length - done;
    if (missed / days.length < 0.5) continue;
    if (!worst || missed / days.length > worst.missed / worst.days) {
      worst = { name: habitName(habit), done, missed, days: days.length };
    }
  }
  return worst;
};

// ─── Gemini request ───────────────────────────────────────────────────────────
const STR = (description) => ({ type: 'STRING', description });

export const PATTERN_SCHEMA = {
  type: 'OBJECT',
  properties: {
    flags: {
      type: 'ARRAY',
      description: `0-${MAX_FLAGS} recurring weaknesses, most frequent first. Only themes that appear on ${MIN_REPEATS}+ different dates.`,
      items: {
        type: 'OBJECT',
        properties: {
          theme: STR('The recurring weakness in 2-6 words, e.g. "Late-night phone use".'),
          dates: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Every YYYY-MM-DD date whose notes mention this theme, copied exactly from the input.' },
          insight: STR('One sentence on what keeps happening, in their words where possible. Max 25 words.'),
          habit: STR('A daily habit name (2-5 words) that would fix it, or an empty string if one of their existing habits already covers it.'),
          tryTomorrow: STR('One concrete thing to do tomorrow about it, phrased as a commitment. Max 15 words.'),
        },
        required: ['theme', 'dates', 'insight', 'habit', 'tryTomorrow'],
        propertyOrdering: ['theme', 'dates', 'insight', 'habit', 'tryTomorrow'],
      },
    },
  },
  required: ['flags'],
};

export const buildPatternSystemPrompt = (name) => `You are ${name}'s coach inside their self-improvement app "APEX". Below are the "things I can improve" notes ${name} wrote in their nightly journal over the last ${PATTERN_WINDOW_DAYS} days. Find the weaknesses that keep coming back.

RULES:
- Group notes that describe the same underlying problem, even when worded differently ("doomscrolled", "too much TikTok", "phone in bed" are one theme).
- Only report a theme if it appears on at least ${MIN_REPEATS} different dates. If nothing repeats that often, return an empty list. Never pad.
- Cite dates exactly as given. Never invent notes or dates.
- Speak to them as "you". Plain text, no markdown, no emojis.`;

const toText = (value, max) => {
  const t = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  return t.length > max ? `${t.slice(0, max - 1).replace(/\s+\S*$/, '')}…` : t;
};

/** Validates the model's flags: real dates only, recounted, MIN_REPEATS+, existing habits not re-suggested. */
export const normalizePatterns = (raw, { history, habits }) => {
  const data = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw;
  const validDates = new Set(history.map((d) => d.date));
  const existing = new Set((habits || []).map((h) => habitName(h).trim().toLowerCase()));
  return (Array.isArray(data?.flags) ? data.flags : [])
    .map((f) => {
      const dates = [...new Set(Array.isArray(f?.dates) ? f.dates.filter((d) => validDates.has(d)) : [])].sort();
      const habit = toText(f?.habit, 40);
      return {
        theme: toText(f?.theme, 60),
        dates,
        count: dates.length,
        insight: toText(f?.insight, 200),
        habit: existing.has(habit.toLowerCase()) ? '' : habit,
        tryTomorrow: toText(f?.tryTomorrow, 120),
      };
    })
    .filter((f) => f.theme && f.count >= MIN_REPEATS)
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_FLAGS);
};

/**
 * Resolves the record to store as `user.logPatterns`. `generate` is
 * geminiGenerateJson in the app (injected so this stays testable). An empty
 * `flags` list is still saved, so a quiet fortnight doesn't re-ask every visit.
 */
export const generateLogPatterns = async ({ state, todayKey, generate, now = Date.now() }) => {
  const history = getImproveHistory(state.logs, todayKey);
  const response = await generate({
    systemPrompt: buildPatternSystemPrompt(state.user?.name || 'the user'),
    contents: [{
      role: 'user',
      parts: [{
        text: `My "improve" notes, as JSON:\n${JSON.stringify(history)}\n\nMy existing habits: ${JSON.stringify((state.habits || []).map(habitName))}`,
      }],
    }],
    schema: PATTERN_SCHEMA,
  });
  return { date: todayKey, generatedAt: now, flags: normalizePatterns(response.text, { history, habits: state.habits }) };
};
