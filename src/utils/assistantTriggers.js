// ─── My Assistant: proactive check-ins + nudges ───────────────────────────────
// Everything here is pure and takes `now` explicitly, so it's clock-testable.
//
// Check-ins are AI turns the app starts on its own when you open it (morning
// briefing, evening debrief) — at most one of each per day,
// tracked in the synced `gameOfLife_assistantCheckins` key so two devices don't
// both fire. Nudges are rule-based (no AI call, so free) and surface above the AI
// bar until acted on or dismissed for the day. Weekly planning is the Weekly
// Reset page now (weeklyReset.js), so the weekly check-in only nudges you there.

import { computeDailyScore, computeStreak, shiftDateKey, STREAK_THRESHOLD } from './scoreUtils';
import { getHabitStreak } from './habitUtils';
import { getFocusGoals, getGoalActivity, QUIET_GOAL_DAYS } from './goalUtils';
import { getResetDue } from './weeklyReset';

export const EMPTY_CHECKINS = { morning: null, evening: null, weekly: null, nudges: {} };

const MORNING_WINDOW = [4, 15];   // [from, to) hours
const EVENING_FROM = 20;

const dateKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const logFilled = (entry) => !!entry && ((entry.emotions?.length > 0) || entry.proud?.some((p) => p?.trim()));

/** The single most important check-in due right now, or null. Morning > evening. */
export const getDueCheckin = (now, checkins, { logs } = {}) => {
  const c = { ...EMPTY_CHECKINS, ...checkins };
  const today = dateKey(now);
  const hour = now.getHours();

  if (hour >= MORNING_WINDOW[0] && hour < MORNING_WINDOW[1] && c.morning !== today) {
    return { type: 'morning', key: today };
  }
  if (hour >= EVENING_FROM && c.evening !== today && !logFilled(logs?.[today])) {
    return { type: 'evening', key: today };
  }
  return null;
};

/** Records a completed check-in. */
export const markCheckinDone = (checkins, due) => ({ ...EMPTY_CHECKINS, ...checkins, [due.type]: due.key });

const AUTO = (what) => `[Automatic ${what}: I just opened the app — I didn't type this.]`;

export const checkinPrompt = (type) => {
  if (type === 'morning') {
    return `${AUTO('morning check-in')} Give me my start-of-day briefing. Look at yesterday (score, journal, commitment) and today (calendar, tasks, habits, goals). Then name the 1-3 things that matter most today. Don't create time blocks yourself: the app's Plan My Day button (shown under your message) builds the schedule, so if today isn't planned yet, end by telling me to tap it. If my North Star isn't set, end by asking me who I want to become. FORMAT: the very first line is one sentence under 22 words naming the single most important thing to do today and briefly why (it also shows at the top of my home screen; start with a verb or "Today", no greeting), then a blank line, then the briefing. Under 150 words.`;
  }
  if (type === 'evening') {
    return `${AUTO('evening check-in')} Give me a short evening debrief: how today went against the plan and my Daily Score, one thing I did well, one thing to fix tomorrow. Remind me to fill in today's Daily Log and set a commitment for tomorrow. Don't create anything unless it's clearly needed. Under 120 words.`;
  }
  return null;
};

/**
 * Rule-based nudges, most urgent first. Each: { id, text, cta: { type: 'ask', label, prompt } | { type: 'navigate', label, page } }.
 * A nudge dismissed today (checkins.nudges[id] === today) is skipped.
 */
export const computeNudges = (now, state, checkins) => {
  const today = dateKey(now);
  const hour = now.getHours();
  const dismissed = checkins?.nudges || {};
  const habits = state.habits || [];
  const nudges = [];

  if (hour >= 17) {
    const { score } = computeDailyScore(state, today);
    if (score < STREAK_THRESHOLD) {
      const streak = computeStreak(state);
      if (streak > 0) {
        nudges.push({
          id: 'streak_risk',
          text: `Your ${streak}-day streak needs a ${STREAK_THRESHOLD}+ today. You're at ${score}.`,
          cta: { type: 'ask', label: 'Get a plan', prompt: `My ${streak}-day streak is at risk: today's score is ${score}. What's the fastest way to clear ${STREAK_THRESHOLD} before bed?` },
        });
      }
    }
  }

  // Same "pending" rule as Home's CommitmentTile, so "Mark it" always lands on live buttons.
  const yesterday = shiftDateKey(today, -1);
  const commitmentText = state.logs?.[yesterday]?.commitment?.trim();
  const record = (state.commitmentArchive || []).find((c) => c.date === yesterday);
  if (commitmentText && record?.denied !== true && !record?.confirmedOn) {
    nudges.push({
      id: `commitment_${yesterday}`,
      text: `Did you keep yesterday's commitment: "${commitmentText}"?`,
      cta: { type: 'navigate', label: 'Mark it', page: 'welcome' },
    });
  }

  // Sunday evening (and Monday, if it slipped): the Weekly Reset.
  const resetWeek = getResetDue(state.weeklyReviews, now);
  if (resetWeek) {
    nudges.push({
      id: `weekly_${resetWeek}`,
      text: now.getDay() === 0
        ? 'Your Weekly Reset is ready: 10 minutes to review this week and set up the next.'
        : 'You skipped Sunday’s Weekly Reset. 10 minutes now sets up this week.',
      cta: { type: 'navigate', label: 'Start', page: 'review' },
    });
  }

  if (hour >= 18) {
    habits.forEach((h) => {
      const history = h.history || {};
      const streak = getHabitStreak({ ...h, history });
      if (!history[today] && streak >= 3) {
        nudges.push({
          id: `habit_${h.id}`,
          text: `"${h.name || h.text}": your ${streak}-day streak ends tonight if you skip it.`,
          cta: { type: 'navigate', label: 'Check in', page: 'daily-log' },
        });
      }
    });
  }

  // A focus goal nothing has moved in QUIET_GOAL_DAYS: same "quiet" rule as the Goals page.
  getFocusGoals(state.goals).forEach((g) => {
    const { daysQuiet } = getGoalActivity(g, state, now);
    if (daysQuiet >= QUIET_GOAL_DAYS) {
      nudges.push({
        id: `goal_${g.id}`,
        goalId: g.id,
        daysQuiet,
        text: `Nothing has moved "${g.title}" in ${daysQuiet} days.`,
        cta: { type: 'ask', label: 'Get unstuck', prompt: `Nothing has moved my goal "${g.title}" in ${daysQuiet} days. Help me get unstuck: what's the smallest next step, and can you schedule it?` },
      });
    }
  });

  return nudges.filter((n) => dismissed[n.id] !== today);
};

/** Hides a nudge for the rest of today; drops dismissals from earlier days. */
export const dismissNudge = (checkins, id, now) => {
  const today = dateKey(now);
  const kept = Object.fromEntries(Object.entries(checkins?.nudges || {}).filter(([, day]) => day === today));
  return { ...EMPTY_CHECKINS, ...checkins, nudges: { ...kept, [id]: today } };
};
