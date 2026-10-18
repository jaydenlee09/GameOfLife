// Pure, state-free helpers for the Goals feature: normalization, progress
// calculation, and completion/milestone transitions. Period-key date math
// (week/month/year bucketing) mostly stays local to each consumer —
// GoalsPage/TasksPage/WeeklyReviewPage already keep matching copies of that
// logic. The one shared piece is "which goal is in focus right now" (Home's Why
// tile and the Daily Log's commitment suggestions must agree on it).

export const GOAL_XP_BY_PERIOD = { weekly: 50, monthly: 150, yearly: 400 };
export const MILESTONE_XP = 15;

/**
 * XP for completing a goal. Milestones already paid MILESTONE_XP each as they were
 * checked off, and a milestone goal only completes once all are done, so those are
 * discounted here — otherwise the work would be paid for twice.
 */
export const goalCompletionXp = (goal) => {
  const total = GOAL_XP_BY_PERIOD[goal.period] || GOAL_XP_BY_PERIOD.weekly;
  return Math.max(0, total - (goal.milestones || []).length * MILESTONE_XP);
};

const pad2 = (n) => String(n).padStart(2, '0');

/** The periodKey a goal of this period would have right now (weeks start Monday). */
export const getCurrentGoalPeriodKey = (period, now) => {
  if (period === 'weekly') {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const day = d.getDay();
    d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
  if (period === 'monthly') return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
  if (period === 'yearly') return String(now.getFullYear());
  return null;
};

/** The open goal for the current period to focus on: pinned first, else the first one. */
export const getFocusGoal = (goals, now) => {
  const active = (goals || []).filter((g) => !g.completed && g.periodKey === getCurrentGoalPeriodKey(g.period, now));
  return active.find((g) => g.pinned) || active[0] || null;
};

export const normalizeGoal = (goal) => ({
  milestones: [],
  obstacle: '',
  ifThenPlan: '',
  pinned: false,
  targetValue: null,
  currentValue: 0,
  unit: '',
  completedAt: null,
  carriedForwardId: null,
  ...goal,
});

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

// Clones an incomplete goal into a new period, resetting all progress.
export const cloneGoalForward = (goal, newPeriodKey) => ({
  ...goal,
  id: `goal_${Date.now()}`,
  periodKey: newPeriodKey,
  completed: false,
  completedAt: null,
  carriedForwardId: null,
  currentValue: 0,
  milestones: (goal.milestones || []).map((m) => ({ ...m, completed: false, completedAt: null })),
  createdAt: Date.now(),
  updatedAt: Date.now(),
});
