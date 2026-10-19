// ─── Push notifications: what to send, and when ───────────────────────────────
// Pure and clock-injected, so the Cloud Function and tests share one source of
// truth. Runs on a server whose process timezone has been set to the user's
// (see functions/src/index.js), because the shared date utils read local time.
//
// Every push has a stable id, and pushState.sent records the day it went out, so
// a 5-minute tick that runs late, twice, or after a skipped tick still sends once.
// Each push re-checks its condition at send time (an evening reminder is skipped
// if the log was filled at 8:29pm).

import { computeNudges } from './assistantTriggers';
import { expandEventsForDates, isInstanceCompleted, getBlockStatus, blockRange } from './calendarUtils';
import { shiftDateKey } from './scoreUtils';
import { isTop, todayQueue } from './taskUtils';
import { getFocusGoals, getGoalEvents, QUIET_GOAL_DAYS } from './goalUtils';

export const PUSH_TYPES = ['morning', 'evening', 'streak', 'blocks', 'checkins', 'commitment', 'goals'];

export const DEFAULT_PUSH_SETTINGS = {
  enabled: false,
  timezone: null,
  appUrl: null,
  tokens: [],                  // [{ token, platform, addedAt }]
  types: { morning: true, evening: true, streak: true, blocks: true, checkins: true, commitment: true, goals: true },
  times: { morning: '07:30', commitment: '13:00', evening: '20:30', streak: '21:00', goals: '18:00' },
  blockLeadMinutes: 20,        // generous: GitHub Actions ticks often run late
  testRequestedAt: null,       // set by "Send a test"; the next tick sends one
};

// How long after its set time a daily push may still go out (covers late ticks).
const WINDOW_MINUTES = { morning: 180, commitment: 240, evening: 180, streak: 150, goals: 180 };
// A quiet goal is pushed on its 5th quiet day, then every 3rd day after, not nightly.
const GOAL_QUIET_EVERY = 3;
// A late tick that lands just after a block started still says so, rather than
// silently skipping it.
const BLOCK_GRACE_MINUTES = 5;
// "Did you do it?" goes out once a block has ended, while it's still fresh; a tick
// later than this skips it (the Calendar and Home still ask).
const CHECKIN_WINDOW_MINUTES = 60;

const pad = (n) => String(n).padStart(2, '0');
const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toMinutes = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const fmt = (h, m) => `${pad(h)}:${pad(m)}`;

export const withPushDefaults = (settings) => ({
  ...DEFAULT_PUSH_SETTINGS,
  ...settings,
  types: { ...DEFAULT_PUSH_SETTINGS.types, ...settings?.types },
  times: { ...DEFAULT_PUSH_SETTINGS.times, ...settings?.times },
});

// Same "log filled" rule as the Daily Score and the in-app evening check-in.
const logFilled = (entry) => !!entry && ((entry.emotions?.length > 0) || entry.proud?.some((p) => p?.trim()));

const inWindow = (type, settings, nowMin) => {
  const at = toMinutes(settings.times[type]);
  return at != null && nowMin >= at && nowMin < at + WINDOW_MINUTES[type];
};

/** Template used when Gemini can't write the morning brief. */
export const morningFallbackBody = (state, today) => {
  const queue = todayQueue(state.todos || [], today);
  const tops = queue.filter((t) => isTop(t, today));
  const first = expandEventsForDates(state.calendarEvents || [], [today])
    .sort((a, b) => (a.startHour * 60 + a.startMin) - (b.startHour * 60 + b.startMin))[0];
  const commitment = state.logs?.[shiftDateKey(today, -1)]?.commitment?.trim();
  const parts = [
    tops.length
      ? `Top 3: ${tops.map((t) => t.text).join(', ')}`
      : queue.length ? `${queue.length} task${queue.length === 1 ? '' : 's'} today, pick your Top 3` : 'No tasks today',
    first ? `first block ${fmt(first.startHour, first.startMin)} ${first.title}` : null,
    commitment ? `commitment: "${commitment}"` : null,
  ].filter(Boolean);
  return `${parts.join(' · ')}. Open APEX for your plan.`;
};

/**
 * Pushes due right now, in send order. Each: { id, type, title, body, page }.
 * The morning push has `ai: true`: the caller asks Gemini for the body and falls
 * back to `body` if that fails.
 */
export const decidePushes = (now, rawSettings, state, pushState = {}) => {
  const settings = withPushDefaults(rawSettings);
  if (!settings.enabled) return [];
  const today = dateKey(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const sent = pushState.sent || {};
  const fresh = (id) => !sent[id];
  const on = (type) => settings.types[type] !== false;
  const pushes = [];

  // "Send a test" from the settings panel: honoured for an hour, sent once.
  const testAt = Number(settings.testRequestedAt) || 0;
  if (testAt && now.getTime() - testAt < 3_600_000 && fresh(`test_${testAt}`)) {
    pushes.push({ id: `test_${testAt}`, type: 'test', title: 'APEX notifications are on', body: "This is a test. You'll get your reminders here.", page: 'welcome' });
  }

  if (on('morning') && inWindow('morning', settings, nowMin) && fresh(`morning_${today}`)) {
    pushes.push({ id: `morning_${today}`, type: 'morning', ai: true, title: 'Your morning brief', body: morningFallbackBody(state, today), page: 'assistant' });
  }

  // Streak / habit / commitment pushes reuse the in-app nudge rules verbatim, so a
  // push and the nudge you see when you open the app can never disagree. A nudge
  // you already dismissed in the app today isn't pushed.
  const nudges = (on('streak') || on('commitment') || on('goals'))
    ? computeNudges(now, state, state.assistantCheckins || {})
    : [];

  if (on('commitment') && inWindow('commitment', settings, nowMin)) {
    const nudge = nudges.find((n) => n.id.startsWith('commitment_'));
    if (nudge && fresh(nudge.id)) {
      pushes.push({ id: nudge.id, type: 'commitment', title: 'Did you keep your commitment?', body: nudge.text, page: 'welcome' });
    }
  }

  if (on('evening') && inWindow('evening', settings, nowMin) && fresh(`evening_${today}`)) {
    const entry = state.logs?.[today];
    if (!logFilled(entry)) {
      pushes.push({ id: `evening_${today}`, type: 'evening', title: 'Daily Log time', body: "Today's log is still empty. Two minutes now keeps your score and your streak honest.", page: 'daily-log' });
    } else if (!state.logReviews?.[today]) {
      pushes.push({ id: `evening_${today}`, type: 'evening', title: 'Submit your Daily Log', body: 'Your log is filled in. Submit it to get your review and set tomorrow up.', page: 'daily-log' });
    }
  }

  if (on('streak') && inWindow('streak', settings, nowMin) && fresh(`streak_${today}`)) {
    const risk = nudges.filter((n) => n.id === 'streak_risk' || n.id.startsWith('habit_'));
    if (risk.length) {
      pushes.push({
        id: `streak_${today}`,
        type: 'streak',
        title: 'Streak at risk tonight',
        body: risk.slice(0, 2).map((n) => n.text).join(' ') + (risk.length > 2 ? ` (+${risk.length - 2} more)` : ''),
        page: risk.some((n) => n.id === 'streak_risk') ? 'welcome' : 'daily-log',
      });
    }
  }

  // Goals: Sunday gets the week's goal check; other days, a goal that's gone quiet
  // (the same nudge the app shows), on day 5 and every 3rd day after.
  if (on('goals') && inWindow('goals', settings, nowMin)) {
    const focus = getFocusGoals(state.goals);
    if (now.getDay() === 0 && focus.length && fresh(`goalsweek_${today}`)) {
      const weekStart = shiftDateKey(today, -6);
      const lines = focus.map((g) => {
        const n = getGoalEvents(g, state).filter((e) => e.date >= weekStart && e.date <= today).length;
        return `${g.title}: ${n ? `${n} thing${n === 1 ? '' : 's'}` : 'nothing'}`;
      });
      pushes.push({ id: `goalsweek_${today}`, type: 'goals', title: 'Your goals this week', body: `${lines.join(' · ')}. Tap to recalibrate next week in Weekly Review.`, page: 'review' });
    } else if (now.getDay() !== 0) {
      const quiet = nudges.filter((n) => n.id.startsWith('goal_') && (n.daysQuiet - QUIET_GOAL_DAYS) % GOAL_QUIET_EVERY === 0);
      if (quiet.length && fresh(`goalquiet_${today}`)) {
        pushes.push({
          id: `goalquiet_${today}`,
          type: 'goals',
          title: quiet.length === 1 ? 'A goal has gone quiet' : `${quiet.length} goals have gone quiet`,
          body: `${quiet[0].text}${quiet.length > 1 ? ` (+${quiet.length - 1} more)` : ''} One small step tonight counts.`,
          page: 'goals',
        });
      }
    }
  }

  if (on('blocks')) {
    const lead = Math.max(1, Number(settings.blockLeadMinutes) || DEFAULT_PUSH_SETTINGS.blockLeadMinutes);
    const upcoming = (events, kind) => expandEventsForDates(events || [], [today]).forEach((ev) => {
      const start = ev.startHour * 60 + ev.startMin;
      const until = start - nowMin;
      if (until <= -BLOCK_GRACE_MINUTES || until > lead || isInstanceCompleted(ev)) return;
      const id = `${kind}_${ev.id}_${today}_${fmt(ev.startHour, ev.startMin)}`;
      if (!fresh(id)) return;
      const range = `${fmt(ev.startHour, ev.startMin)}–${fmt(ev.endHour, ev.endMin)}`;
      const when = until > 0 ? `in ${until} min` : 'starting now';
      pushes.push(kind === 'block'
        ? { id, type: 'blocks', title: `${ev.title} ${when}`, body: `Time block ${range}. ${until > 0 ? "Wrap up what you're doing." : 'Switch over now.'}`, page: 'calendar' }
        : { id, type: 'blocks', title: `No Phone block ${when}`, body: `${range}. Put the phone away${until > 0 ? ' before it starts' : ' now'}.`, page: 'calendar' });
    });
    upcoming(state.calendarEvents, 'block');
    upcoming(state.noPhoneBlocks, 'nophone');
  }

  // Same "missed" rule as the Calendar: ended, not answered yet.
  if (on('checkins')) {
    expandEventsForDates(state.calendarEvents || [], [today]).forEach((ev) => {
      const sinceEnd = nowMin - (ev.endHour * 60 + ev.endMin);
      if (sinceEnd < 0 || sinceEnd >= CHECKIN_WINDOW_MINUTES) return;
      if (getBlockStatus(ev, now.getTime()) !== 'missed') return;
      const id = `checkin_${ev.id}_${today}_${fmt(ev.endHour, ev.endMin)}`;
      if (!fresh(id)) return;
      pushes.push({ id, type: 'checkins', title: `Did you do ${ev.title}?`, body: `${blockRange(ev)} just ended. Tap to check in: done, partly or skipped.`, page: 'calendar' });
    });
  }

  return pushes;
};

/** Records sends; keeps only today's and yesterday's ids so the doc stays small. */
export const markPushesSent = (pushState, ids, now) => {
  const today = dateKey(now);
  const yesterday = shiftDateKey(today, -1);
  const kept = Object.fromEntries(Object.entries(pushState?.sent || {}).filter(([, day]) => day === today || day === yesterday));
  ids.forEach((id) => { kept[id] = today; });
  return { ...pushState, sent: kept };
};

// The morning brief: the in-app morning check-in prompt, adapted so its first line
// works as the notification text. Read-only tools — the server never writes data.
export const MORNING_PUSH_PROMPT = `[Automatic morning brief, sent as a phone notification — I didn't type this.] Give me my start-of-day briefing. Look at yesterday (score, journal, commitment) and today (calendar, tasks, habits, goals). Then give me a concrete plan for today: the 1-3 things that matter most and when to do them. You can only look things up right now, not create or change anything, so don't offer to schedule. FORMAT: the very first line is a single sentence under 110 characters naming today's #1 priority (it becomes the notification text), then a blank line, then the full briefing. Under 150 words.`;

/** Splits the model's brief into the notification line and the full chat text. */
export const splitMorningBrief = (text) => {
  const trimmed = (text || '').trim();
  const [first] = trimmed.split('\n');
  const line = first.replace(/\*\*/g, '').trim();
  return { pushBody: line.length > 160 ? `${line.slice(0, 157)}…` : line, chatText: trimmed };
};
