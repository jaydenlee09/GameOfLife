// Pure, state-free helpers for the Goals feature: normalization, progress
// calculation, and completion/milestone transitions. Period-key date math
// (week/month/year bucketing) intentionally stays local to each consumer —
// GoalsPage/TasksPage/WeeklyReviewPage already keep matching copies of that
// logic, and this file doesn't centralize it.

export const GOAL_XP_BY_PERIOD = { weekly: 50, monthly: 150, yearly: 400 };
export const MILESTONE_XP = 15;

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
