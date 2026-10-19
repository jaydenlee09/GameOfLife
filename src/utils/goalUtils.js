// Pure, state-free helpers for the Goals feature: normalization, deadlines,
// progress, activity ("what moved this goal") and completion/milestone
// transitions. Every surface that shows a goal (Goals, Home, Close the Day,
// Weekly Review, Plan My Day, My Assistant, push) reads goals through these,
// so "which goals are in focus" and "when did it last move" can't disagree.
//
// Goals used to live in calendar buckets (`period` weekly/monthly/yearly +
// `periodKey`). They now have an optional `deadline` ('YYYY-MM-DD' | null).
// normalizeGoal gives a bucketed goal the last day of its bucket as its
// deadline; `period` stays on old goals only so their XP doesn't change.

export const GOAL_XP_BY_PERIOD = { weekly: 50, monthly: 150, yearly: 400 };
export const MILESTONE_XP = 15;
export const FOCUS_GOAL_LIMIT = 3;
/** A goal with nothing done for this many days reads as "quiet". */
export const QUIET_GOAL_DAYS = 5;

const DAY_MS = 86_400_000;
const pad2 = (n) => String(n).padStart(2, '0');

export const goalDateKey = (date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

const parseKey = (key) => {
  const [y, m, d] = String(key || '').split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
};

const shiftKey = (key, days) => {
  const d = parseKey(key);
  d.setDate(d.getDate() + days);
  return goalDateKey(d);
};

/** Whole days from dateKey `a` to dateKey `b` (DST-safe). */
const daysBetweenKeys = (a, b) => Math.round((parseKey(b) - parseKey(a)) / DAY_MS);

/** Last day ('YYYY-MM-DD') of an old bucketed goal's period, or null. */
export const periodEndKey = (period, periodKey) => {
  if (period === 'weekly') {
    const start = parseKey(periodKey);
    return start ? shiftKey(periodKey, 6) : null;
  }
  if (period === 'monthly') {
    const [y, m] = String(periodKey || '').split('-').map(Number);
    return y && m ? goalDateKey(new Date(y, m, 0)) : null;
  }
  if (period === 'yearly') {
    const y = Number(periodKey);
    return y ? `${y}-12-31` : null;
  }
  return null;
};

/** The periodKey a goal of this period would have right now (weeks start Monday). */
export const getCurrentGoalPeriodKey = (period, now) => {
  if (period === 'weekly') {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const day = d.getDay();
    d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
    return goalDateKey(d);
  }
  if (period === 'monthly') return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
  if (period === 'yearly') return String(now.getFullYear());
  return null;
};

export const normalizeGoal = (goal) => {
  const out = {
    milestones: [],
    obstacle: '',
    ifThenPlan: '',
    pinned: false,
    targetValue: null,
    currentValue: 0,
    unit: '',
    completedAt: null,
    checkins: {},
    ...goal,
  };
  if (!('deadline' in out)) out.deadline = periodEndKey(out.period, out.periodKey);
  return out;
};

// ─── Deadlines ────────────────────────────────────────────────────────────────

/** Quick-pick deadlines for the add form, as { id, label, key }. */
export const deadlinePresets = (now) => {
  const y = now.getFullYear();
  const m = now.getMonth();
  const endOfMonth = goalDateKey(new Date(y, m + 1, 0));
  // Late in the month, "end of month" is too close to be useful: offer next month's end.
  const monthKey = new Date(y, m + 1, 0).getDate() - now.getDate() < 7 ? goalDateKey(new Date(y, m + 2, 0)) : endOfMonth;
  return [
    { id: 'month', label: monthKey === endOfMonth ? 'End of month' : 'End of next month', key: monthKey },
    { id: '3m', label: '3 months', key: goalDateKey(new Date(y, m + 3, now.getDate())) },
    { id: 'year', label: 'End of year', key: `${y}-12-31` },
    { id: 'none', label: 'No date', key: null },
  ];
};

/** "Today" for today's key, else "Oct 18". */
export const shortDay = (dateKey, todayKey) => {
  if (dateKey === todayKey) return 'Today';
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

/** Days until the deadline (0 = due today, negative = past), or null when there's none. */
export const daysLeft = (goal, now) => (goal?.deadline ? daysBetweenKeys(goalDateKey(now), goal.deadline) : null);

export const isGoalOverdue = (goal, now) => !goal?.completed && goal?.deadline != null && daysLeft(goal, now) < 0;

const fmtDeadline = (key, now) => {
  const d = parseKey(key);
  const opts = d.getFullYear() === now.getFullYear() ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' };
  return d.toLocaleDateString('en-US', opts);
};

/** "Due Nov 30 · 12 days left", "Overdue by 3 days", "No deadline". */
export const deadlineLabel = (goal, now) => {
  if (!goal?.deadline) return 'No deadline';
  const left = daysLeft(goal, now);
  if (goal.completed) return `Due ${fmtDeadline(goal.deadline, now)}`;
  if (left < 0) return `Overdue by ${-left} day${left === -1 ? '' : 's'}`;
  if (left === 0) return 'Due today';
  if (left === 1) return 'Due tomorrow';
  return `Due ${fmtDeadline(goal.deadline, now)} · ${left} days left`;
};

// ─── XP ───────────────────────────────────────────────────────────────────────

/**
 * Full XP a goal is worth: old bucketed goals keep their period's XP; new ones go by
 * horizon (creation → deadline). An open-ended goal pays the middle tier, so the top
 * tier needs a deadline far enough out to mean a long-haul goal.
 */
const goalXpTotal = (goal) => {
  if (goal.period && GOAL_XP_BY_PERIOD[goal.period]) return GOAL_XP_BY_PERIOD[goal.period];
  if (!goal.deadline) return GOAL_XP_BY_PERIOD.monthly;
  const created = goal.createdAt ? new Date(goal.createdAt) : new Date();
  const horizon = daysBetweenKeys(goalDateKey(created), goal.deadline);
  if (horizon <= 10) return GOAL_XP_BY_PERIOD.weekly;
  if (horizon <= 45) return GOAL_XP_BY_PERIOD.monthly;
  return GOAL_XP_BY_PERIOD.yearly;
};

/**
 * XP for completing a goal. Milestones already paid MILESTONE_XP each as they were
 * checked off, and a milestone goal only completes once all are done, so those are
 * discounted here — otherwise the work would be paid for twice.
 */
export const goalCompletionXp = (goal) => Math.max(0, goalXpTotal(goal) - (goal.milestones || []).length * MILESTONE_XP);

// ─── Progress ─────────────────────────────────────────────────────────────────

export const getGoalProgress = (goal) => {
  const milestones = goal.milestones || [];
  if (milestones.length > 0) {
    const done = milestones.filter((m) => m.completed).length;
    return { ratio: done / milestones.length, done, total: milestones.length, kind: 'milestones' };
  }
  if (goal.targetValue != null && goal.targetValue > 0) {
    const done = Math.min(goal.currentValue || 0, goal.targetValue);
    return { ratio: done / goal.targetValue, done, total: goal.targetValue, kind: 'numeric' };
  }
  return { ratio: goal.completed ? 1 : 0, done: goal.completed ? 1 : 0, total: 1, kind: 'binary' };
};

// ─── Activity: what moved a goal, and when ───────────────────────────────────

const sameId = (a, b) => a != null && b != null && String(a) === String(b);

/**
 * Everything that counted toward `goal`, newest first, as { date, at, kind, label, minutes? }.
 * Kinds: task (linked task done), habit (linked habit checked), focus (session on the
 * goal or on one of its tasks), block (goal/task block done or partly), milestone,
 * checkin (a manual "moved it today" tap, or the number being raised).
 */
export const getGoalEvents = (goal, { todos = [], habits = [], pomodoroSessions = [], calendarEvents = [] } = {}) => {
  const events = [];
  const taskIds = new Set(todos.filter((t) => sameId(t.goalId, goal.id)).map((t) => String(t.id)));
  const keyOfMs = (ms) => goalDateKey(new Date(ms));

  todos.forEach((t) => {
    if (taskIds.has(String(t.id)) && t.completed && t.completedAt) {
      events.push({ date: keyOfMs(t.completedAt), at: t.completedAt, kind: 'task', label: t.text });
    }
  });
  habits.forEach((h) => {
    if (!sameId(h.goalId, goal.id)) return;
    Object.entries(h.history || {}).forEach(([date, on]) => {
      if (on) events.push({ date, at: parseKey(date)?.getTime() + 12 * 3_600_000, kind: 'habit', label: h.name || h.text });
    });
  });
  pomodoroSessions.forEach((s) => {
    if (!s.completed) return;
    if (!sameId(s.goalId, goal.id) && !(s.taskId != null && taskIds.has(String(s.taskId)))) return;
    events.push({
      date: s.date, at: s.completedAt || parseKey(s.date)?.getTime(), kind: 'focus',
      label: s.intent || 'Focus session', minutes: Math.floor((s.durationSecs || 0) / 60),
    });
  });
  calendarEvents.forEach((ev) => {
    const linked = sameId(ev.plan?.goalId, goal.id) || (ev.plan?.taskId != null && taskIds.has(String(ev.plan.taskId)));
    if (!linked) return;
    const outcomes = !ev.recurrence || ev.recurrence === 'none'
      ? (ev.outcome ? { [ev.date]: ev.outcome } : (ev.completed ? { [ev.date]: { status: 'done' } } : {}))
      : ev.outcomes || {};
    Object.entries(outcomes).forEach(([date, o]) => {
      if (o?.status === 'done' || o?.status === 'partly') {
        events.push({ date, at: o.at || parseKey(date)?.getTime(), kind: 'block', label: ev.title });
      }
    });
  });
  (goal.milestones || []).forEach((m) => {
    if (m.completed && m.completedAt) events.push({ date: keyOfMs(m.completedAt), at: m.completedAt, kind: 'milestone', label: m.text });
  });
  Object.entries(goal.checkins || {}).forEach(([date, c]) => {
    if (c) events.push({ date, at: (typeof c === 'number' ? c : parseKey(date)?.getTime()), kind: 'checkin', label: 'Moved it forward' });
  });

  return events.filter((e) => e.date).sort((a, b) => (b.at || 0) - (a.at || 0));
};

/**
 * The summary every goal surface shows: last 7 days as a strip, this week's
 * count + focus minutes, when it last moved and how long it's been quiet.
 * Quiet counts from creation when nothing has moved it yet.
 */
export const getGoalActivity = (goal, data, now) => {
  const events = getGoalEvents(goal, data);
  const today = goalDateKey(now);
  const weekStart = shiftKey(today, -6);
  const strip = Array.from({ length: 7 }, (_, i) => {
    const date = shiftKey(today, i - 6);
    const dayEvents = events.filter((e) => e.date === date);
    return { date, count: dayEvents.length, minutes: dayEvents.reduce((s, e) => s + (e.minutes || 0), 0) };
  });
  const week = events.filter((e) => e.date >= weekStart && e.date <= today);
  const lastDate = events.reduce((max, e) => (e.date <= today && e.date > max ? e.date : max), '');
  const sinceKey = lastDate || (goal.createdAt ? goalDateKey(new Date(goal.createdAt)) : today);
  return {
    events,
    strip,
    weekCount: week.length,
    weekMinutes: week.reduce((s, e) => s + (e.minutes || 0), 0),
    lastMovedDate: lastDate || null,
    daysQuiet: Math.max(0, daysBetweenKeys(sinceKey, today)),
    movedToday: events.some((e) => e.date === today),
    autoMovedToday: events.some((e) => e.date === today && e.kind !== 'checkin'),
  };
};

// ─── Pace: is progress keeping up with the calendar? ────────────────────────

/** How far progress may trail (or lead) the time elapsed before it counts. */
export const PACE_SLACK = 0.15;

/**
 * For a goal with a deadline and a measurable % (milestones or a number):
 * compares progress with the share of time gone since it was created.
 * Returns null when pace doesn't apply, else { status, expected, progress } where
 * status is 'early' (under 15% of the time gone), 'behind', 'on-pace' or 'ahead'.
 */
export const getGoalPace = (goal, now) => {
  if (goal.completed || !goal.deadline || !goal.createdAt) return null;
  const progress = getGoalProgress(goal);
  if (progress.kind === 'binary') return null;
  const start = new Date(goal.createdAt);
  start.setHours(0, 0, 0, 0);
  const end = parseKey(goal.deadline);
  end.setDate(end.getDate() + 1);
  const total = end - start;
  if (total <= 0) return null;
  const expected = Math.min(1, Math.max(0, (now - start) / total));
  const ratio = progress.ratio;
  if (expected < PACE_SLACK) return { status: 'early', expected, progress: ratio };
  const diff = ratio - expected;
  return { status: diff < -PACE_SLACK ? 'behind' : diff > PACE_SLACK ? 'ahead' : 'on-pace', expected, progress: ratio };
};

/** 'done' | 'overdue' | 'quiet' | 'behind' (moving, but slower than the deadline needs) | 'on-track'. */
export const getGoalStatus = (goal, activity, now) => {
  if (goal.completed) return 'done';
  if (isGoalOverdue(goal, now)) return 'overdue';
  if (activity.daysQuiet >= QUIET_GOAL_DAYS) return 'quiet';
  if (getGoalPace(goal, now)?.status === 'behind') return 'behind';
  return 'on-track';
};

/** "Behind pace (40% done, 65% of the time gone)", or null when pace doesn't apply. */
export const paceLabel = (pace) => {
  if (!pace || pace.status === 'early') return null;
  const word = { behind: 'Behind pace', 'on-pace': 'On pace', ahead: 'Ahead of pace' }[pace.status];
  return `${word} (${Math.round(pace.progress * 100)}% done, ${Math.round(pace.expected * 100)}% of the time gone)`;
};

/** "Moved today", "Last moved yesterday", "Quiet for 6 days", "Nothing yet". */
export const lastMovedLabel = (activity) => {
  if (activity.movedToday) return 'Moved today';
  if (!activity.lastMovedDate) return activity.daysQuiet > 0 ? `Nothing yet · ${activity.daysQuiet}d old` : 'Nothing yet';
  if (activity.daysQuiet === 1) return 'Last moved yesterday';
  if (activity.daysQuiet >= QUIET_GOAL_DAYS) return `Quiet for ${activity.daysQuiet} days`;
  return `Last moved ${activity.daysQuiet} days ago`;
};

/** The first open milestone, else the first open linked task, as { kind, text, id }, or null. */
export const getNextStep = (goal, todos = []) => {
  const m = (goal.milestones || []).find((x) => !x.completed && x.text?.trim());
  if (m) return { kind: 'milestone', text: m.text.trim(), id: m.id };
  const t = todos.find((x) => sameId(x.goalId, goal.id) && !x.completed);
  return t ? { kind: 'task', text: t.text, id: t.id } : null;
};

// ─── Which goals are in focus ────────────────────────────────────────────────

const byUrgency = (a, b) => {
  if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
  if (a.deadline && b.deadline && a.deadline !== b.deadline) return a.deadline < b.deadline ? -1 : 1;
  if (!!a.deadline !== !!b.deadline) return a.deadline ? -1 : 1;
  return (b.createdAt || 0) - (a.createdAt || 0);
};

/** Open goals, pinned first, then soonest deadline, then newest. */
export const getActiveGoals = (goals) => (goals || []).filter((g) => !g.completed).sort(byUrgency);

/** Up to `limit` goals to keep in front of you: the pinned ones, topped up by soonest deadline. */
export const getFocusGoals = (goals, limit = FOCUS_GOAL_LIMIT) => getActiveGoals(goals).slice(0, limit);

/** The single goal to focus on (Close the Day prompts, lesson ideas). */
export const getFocusGoal = (goals) => getActiveGoals(goals)[0] || null;

/** One line for AI prompts: title, deadline, progress, momentum. */
export const describeGoal = (goal, data, now) => {
  const p = getGoalProgress(goal);
  const a = getGoalActivity(goal, data, now);
  const parts = [
    `${goal.pinned ? '(focus) ' : ''}${goal.title}`,
    deadlineLabel(goal, now),
    p.kind !== 'binary' ? `${p.done}/${p.total}${goal.unit ? ` ${goal.unit}` : ''}` : null,
    `${a.weekCount} thing${a.weekCount === 1 ? '' : 's'} done for it this week${a.weekMinutes ? ` (${a.weekMinutes} focus min)` : ''}`,
    paceLabel(getGoalPace(goal, now)),
    lastMovedLabel(a).toLowerCase(),
  ];
  return parts.filter(Boolean).join(' · ');
};

// ─── Transitions ─────────────────────────────────────────────────────────────

// Returns the updated goal plus whether this flip just completed the
// milestone (so the caller can decide whether to award XP).
export const toggleMilestone = (goal, milestoneId) => {
  const milestones = goal.milestones || [];
  const target = milestones.find((m) => m.id === milestoneId);
  const nowCompleted = !target?.completed;
  const updated = milestones.map((m) => (
    m.id === milestoneId
      ? { ...m, completed: nowCompleted, completedAt: nowCompleted ? Date.now() : null }
      : m
  ));
  return {
    goal: { ...goal, milestones: updated, updatedAt: Date.now() },
    justCompleted: nowCompleted,
    milestoneText: target?.text,
  };
};

// completedAt is stamped once and never cleared, so unchecking and
// rechecking a goal can't re-award XP.
export const toggleGoalCompleted = (goal) => {
  const willComplete = !goal.completed;
  const shouldAwardXp = willComplete && !goal.completedAt;
  return {
    goal: {
      ...goal,
      completed: willComplete,
      completedAt: willComplete ? (goal.completedAt || Date.now()) : goal.completedAt,
      updatedAt: Date.now(),
    },
    shouldAwardXp,
  };
};

/** The goal with `fields` changed, stamped as just updated. */
export const patchGoal = (goal, fields, now = Date.now()) => ({ ...goal, ...fields, updatedAt: now });

export const addMilestone = (goal, text, now = Date.now()) => patchGoal(goal, {
  milestones: [...(goal.milestones || []), { id: `m_${now}`, text, completed: false }],
}, now);

/** Records (or clears) a manual "I moved this today" for dateKey. */
export const setGoalCheckin = (goal, dateKey, on, now = Date.now()) => {
  const checkins = { ...(goal.checkins || {}) };
  if (on) checkins[dateKey] = now;
  else delete checkins[dateKey];
  return { ...goal, checkins, updatedAt: now };
};

/** Moves the deadline `days` later (from today if it's already past). */
export const pushDeadline = (goal, days, now) => {
  const today = goalDateKey(now);
  const base = goal.deadline && goal.deadline >= today ? goal.deadline : today;
  return { ...goal, deadline: shiftKey(base, days), updatedAt: now.getTime() };
};

/** A new goal from the quick add. */
export const makeGoal = ({ title, deadline = null, pinned = false, now = Date.now() }) => normalizeGoal({
  id: `goal_${now}`,
  title: String(title || '').trim(),
  deadline,
  pinned,
  notes: '',
  completed: false,
  createdAt: now,
  updatedAt: now,
});
