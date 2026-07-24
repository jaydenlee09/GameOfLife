import React, { useMemo, useState } from 'react';
import './GoalsPage.css';
import { X, Pin, Pencil, Flame } from 'lucide-react';
import STAT_META from './statMeta';
import {
  normalizeGoal,
  getGoalProgress,
  toggleMilestone,
  toggleGoalCompleted,
  GOAL_XP_BY_PERIOD,
  MILESTONE_XP,
} from '../utils/goalUtils';

const ArrowLeftIcon = ({ size = 18, strokeWidth = 2.5 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M15 18l-6-6 6-6" />
  </svg>
);

const ArrowRightIcon = ({ size = 18, strokeWidth = 2.5 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M9 6l6 6-6 6" />
  </svg>
);

const PERIODS = [
  { key: 'weekly', label: 'Week' },
  { key: 'monthly', label: 'Month' },
  { key: 'yearly', label: 'Year' },
  { key: 'all', label: 'All' },
];

const ALL_VIEW_PERIODS = [
  { key: 'weekly', label: 'Week' },
  { key: 'monthly', label: 'Month' },
  { key: 'yearly', label: 'Year' },
];

const PERIOD_NOUN = { weekly: 'week', monthly: 'month', yearly: 'year' };
const TIMEFRAME_BY_PERIOD = { weekly: 'this-week', monthly: 'this-month', yearly: 'this-year' };
// Mirrors TasksPage's XP_BY_TIMEFRAME for week/month/year, so a task created
// from a goal earns the same XP as one created directly in Tasks.
const GOAL_TASK_XP_BY_PERIOD = { weekly: 50, monthly: 100, yearly: 500 };

const pad2 = (n) => String(n).padStart(2, '0');

const toLocalDateKey = (date) => {
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  return `${y}-${m}-${d}`;
};

const startOfWeekMonday = (date) => {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

const startOfMonth = (date) => {
  const d = new Date(date.getFullYear(), date.getMonth(), 1);
  d.setHours(0, 0, 0, 0);
  return d;
};

const startOfYear = (date) => {
  const d = new Date(date.getFullYear(), 0, 1);
  d.setHours(0, 0, 0, 0);
  return d;
};

const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

const addMonths = (date, months) => {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
};

const addYears = (date, years) => {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + years);
  return d;
};

const getPeriodStart = (anchorDate, period) => {
  if (period === 'weekly') return startOfWeekMonday(anchorDate);
  if (period === 'monthly') return startOfMonth(anchorDate);
  return startOfYear(anchorDate);
};

const getPeriodKey = (anchorDate, period) => {
  const start = getPeriodStart(anchorDate, period);
  if (period === 'weekly') return toLocalDateKey(start);
  if (period === 'monthly') return `${start.getFullYear()}-${pad2(start.getMonth() + 1)}`;
  return String(start.getFullYear());
};

const formatPeriodLabel = (anchorDate, period) => {
  const start = getPeriodStart(anchorDate, period);
  if (period === 'weekly') {
    const end = addDays(start, 6);
    const fmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
    const fmtYear = new Intl.DateTimeFormat(undefined, { year: 'numeric' });
    return `${fmt.format(start)} – ${fmt.format(end)}, ${fmtYear.format(start)}`;
  }
  if (period === 'monthly') {
    const fmt = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });
    return fmt.format(start);
  }
  if (period === 'all') return 'All Goals';
  return String(start.getFullYear());
};

const parseLocalDateKey = (key) => {
  if (!key || typeof key !== 'string') return null;
  const parts = key.split('-').map(s => Number(s));
  if (parts.length !== 3) return null;
  const [y, m, d] = parts;
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
};

const parseMonthKey = (key) => {
  if (!key || typeof key !== 'string') return null;
  const parts = key.split('-').map(s => Number(s));
  if (parts.length !== 2) return null;
  const [y, m] = parts;
  if (!y || !m) return null;
  return new Date(y, m - 1, 1);
};

const formatGoalPeriodLabel = (goal) => {
  if (!goal) return '';
  if (goal.period === 'weekly') {
    const start = parseLocalDateKey(goal.periodKey) || startOfWeekMonday(new Date());
    const end = addDays(start, 6);
    const fmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
    const fmtYear = new Intl.DateTimeFormat(undefined, { year: 'numeric' });
    return `${fmt.format(start)} – ${fmt.format(end)}, ${fmtYear.format(start)}`;
  }
  if (goal.period === 'monthly') {
    const start = parseMonthKey(goal.periodKey) || startOfMonth(new Date());
    const fmt = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });
    return fmt.format(start);
  }
  if (goal.period === 'yearly') return String(goal.periodKey || new Date().getFullYear());
  return '';
};

// Mirrors TasksPage.jsx's getStreak convention exactly (alive if today or
// yesterday was checked, undercounts by 1 so "2 days in a row" reads as a
// streak of 1) so the number shown here matches what the user already sees
// on the habit row in Tasks.
const getHabitStreak = (habit) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = toLocalDateKey(today);
  const yesterdayStr = toLocalDateKey(addDays(today, -1));

  const hasToday = !!habit.history[todayStr];
  const hasYesterday = !!habit.history[yesterdayStr];
  if (!hasToday && !hasYesterday) return 0;

  let consecutive = 0;
  const startOffset = hasToday ? 0 : 1;
  for (let i = startOffset; i < 365; i++) {
    const dateStr = toLocalDateKey(addDays(today, -i));
    if (habit.history[dateStr]) consecutive++;
    else break;
  }
  return Math.max(0, consecutive - 1);
};

const GoalModal = ({ mode, periodLabel, initial, onClose, onSubmit, showPeriodPicker = true, defaultPeriod = 'weekly', getPinnedCount }) => {
  const [title, setTitle] = useState(initial?.title || '');
  const [notes, setNotes] = useState(initial?.notes || '');
  const [attributes, setAttributes] = useState(initial?.attributes || []);
  const [goalPeriod, setGoalPeriod] = useState(initial?.period || defaultPeriod);
  const [milestones, setMilestones] = useState(initial?.milestones || []);
  const [newMilestoneText, setNewMilestoneText] = useState('');
  const [showWoop, setShowWoop] = useState(!!(initial?.obstacle?.trim() || initial?.ifThenPlan?.trim()));
  const [obstacle, setObstacle] = useState(initial?.obstacle || '');
  const [ifThenPlan, setIfThenPlan] = useState(initial?.ifThenPlan || '');
  const [pinned, setPinned] = useState(initial?.pinned || false);
  const [trackNumeric, setTrackNumeric] = useState(initial?.targetValue != null);
  const [targetValue, setTargetValue] = useState(initial?.targetValue ?? '');
  const [unit, setUnit] = useState(initial?.unit || '');
  const statKeys = Object.keys(STAT_META);

  const toggleAttribute = (attr) => {
    setAttributes(prev => (
      prev.includes(attr) ? prev.filter(a => a !== attr) : [...prev, attr]
    ));
  };

  const addMilestone = (e) => {
    e.preventDefault();
    if (!newMilestoneText.trim()) return;
    setMilestones(prev => [...prev, { id: `m_${Date.now()}`, text: newMilestoneText.trim(), completed: false }]);
    setNewMilestoneText('');
  };

  const deleteMilestone = (id) => setMilestones(prev => prev.filter(m => m.id !== id));

  const pinnedCount = getPinnedCount ? getPinnedCount(goalPeriod) : 0;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSubmit({
      title: title.trim(),
      notes,
      attributes,
      period: goalPeriod,
      milestones,
      obstacle: obstacle.trim(),
      ifThenPlan: ifThenPlan.trim(),
      pinned,
      targetValue: trackNumeric && targetValue !== '' ? Number(targetValue) : null,
      unit: trackNumeric ? unit.trim() : '',
    });
  };

  return (
    <div className="gp-modal-overlay" onClick={onClose}>
      <div className="gp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="gp-modal-header">
          <h2 className="gp-modal-title">{mode === 'edit' ? 'Edit Goal' : 'New Goal'}</h2>
          <button className="gp-modal-close" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="gp-modal-subtitle">{periodLabel}</div>

        <form onSubmit={handleSubmit} className="gp-modal-form">
          <div className="gp-field-group">
            <label className="gp-label">Goal</label>
            <input
              className="gp-text-input"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Describe your goal..."
              autoFocus
            />
          </div>

          {showPeriodPicker && (
            <div className="gp-field-group">
              <label className="gp-label">Period</label>
              <div className="gp-period-pills">
                <button
                  type="button"
                  className={`gp-pill ${goalPeriod === 'weekly' ? 'gp-pill--active' : ''}`}
                  onClick={() => setGoalPeriod('weekly')}
                >
                  Week
                </button>
                <button
                  type="button"
                  className={`gp-pill ${goalPeriod === 'monthly' ? 'gp-pill--active' : ''}`}
                  onClick={() => setGoalPeriod('monthly')}
                >
                  Month
                </button>
                <button
                  type="button"
                  className={`gp-pill ${goalPeriod === 'yearly' ? 'gp-pill--active' : ''}`}
                  onClick={() => setGoalPeriod('yearly')}
                >
                  Year
                </button>
              </div>
            </div>
          )}

          <div className="gp-field-group">
            <label className="gp-label">Attributes <span className="gp-label-hint">(optional)</span></label>
            <div className="gp-attr-grid">
              {statKeys.map((attr) => {
                const meta = STAT_META[attr];
                const { Icon } = meta;
                const active = attributes.includes(attr);
                return (
                  <button
                    key={attr}
                    type="button"
                    className={`gp-attr-pill ${active ? 'gp-attr-pill--active' : ''}`}
                    style={active ? { background: `${meta.color}22`, borderColor: meta.color, color: meta.color } : {}}
                    onClick={() => toggleAttribute(attr)}
                  >
                    {Icon && <Icon size={12} strokeWidth={2.5} />}
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="gp-field-group">
            <label className="gp-label">Milestones <span className="gp-label-hint">(optional — breaks the goal into measurable steps)</span></label>
            {milestones.length > 0 && (
              <div className="gp-milestone-edit-list">
                {milestones.map((m) => (
                  <div key={m.id} className="gp-milestone-edit-item">
                    <span className="gp-milestone-edit-text">{m.text}</span>
                    <button type="button" className="gp-milestone-edit-delete" onClick={() => deleteMilestone(m.id)}><X size={14} /></button>
                  </div>
                ))}
              </div>
            )}
            <div className="gp-milestone-add-row">
              <input
                type="text"
                className="gp-text-input"
                value={newMilestoneText}
                onChange={(e) => setNewMilestoneText(e.target.value)}
                placeholder="Add a milestone..."
                onKeyDown={(e) => { if (e.key === 'Enter') addMilestone(e); }}
              />
              <button type="button" className="gp-milestone-add-btn" onClick={addMilestone}>+</button>
            </div>
          </div>

          <div className="gp-field-group">
            <label className="gp-field-checkbox-label">
              <input type="checkbox" checked={trackNumeric} onChange={(e) => setTrackNumeric(e.target.checked)} />
              Track a number instead <span className="gp-label-hint">(e.g. "Run 50 miles")</span>
            </label>
            {trackNumeric && (
              <div className="gp-numeric-inputs">
                <input
                  type="number"
                  min="1"
                  className="gp-text-input gp-numeric-target-input"
                  value={targetValue}
                  onChange={(e) => setTargetValue(e.target.value)}
                  placeholder="Target"
                />
                <input
                  type="text"
                  className="gp-text-input gp-numeric-unit-input"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="Unit (miles, books...)"
                />
              </div>
            )}
          </div>

          <div className="gp-field-group">
            <button type="button" className="gp-woop-toggle" onClick={() => setShowWoop((v) => !v)}>
              {showWoop ? '− Hide' : '+ Add'} obstacle plan <span className="gp-label-hint">(optional — if-then plans measurably boost follow-through)</span>
            </button>
            {showWoop && (
              <>
                <div className="gp-field-group">
                  <label className="gp-label">Biggest obstacle</label>
                  <textarea
                    className="gp-textarea"
                    rows={2}
                    value={obstacle}
                    onChange={(e) => setObstacle(e.target.value)}
                    placeholder="What's most likely to get in the way?"
                  />
                </div>
                <div className="gp-field-group">
                  <label className="gp-label">If that happens, I will…</label>
                  <textarea
                    className="gp-textarea"
                    rows={2}
                    value={ifThenPlan}
                    onChange={(e) => setIfThenPlan(e.target.value)}
                    placeholder="If [obstacle happens], then I will..."
                  />
                </div>
              </>
            )}
          </div>

          <div className="gp-field-group">
            <label className="gp-field-checkbox-label">
              <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
              <Pin size={14} /> Pin as a top focus goal this {PERIOD_NOUN[goalPeriod]}
            </label>
            {pinned && pinnedCount >= 3 && (
              <p className="gp-pin-warning">
                You already have {pinnedCount} pinned goals this {PERIOD_NOUN[goalPeriod]}. More than ~3 tends to make weekly review harder to keep up with — still your call.
              </p>
            )}
          </div>

          <div className="gp-field-group">
            <label className="gp-label">Notes <span className="gp-label-hint">(optional)</span></label>
            <textarea
              className="gp-textarea"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything you want to remember..."
              rows={3}
            />
          </div>

          <button type="submit" className="gp-submit-btn" disabled={!title.trim()}>
            {mode === 'edit' ? 'Save' : 'Add Goal'}
          </button>
        </form>
      </div>
    </div>
  );
};

const GoalsPage = ({ goals = [], setGoals, setTodos, onUpdateStat, habits = [], setHabits }) => {
  const [period, setPeriod] = useState('all');
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [modal, setModal] = useState(null); // { type: 'add-goal'|'edit-goal', goalId? }
  const [addTaskGoalId, setAddTaskGoalId] = useState(null);
  const [addTaskText, setAddTaskText] = useState('');

  const periodKey = useMemo(() => (period === 'all' ? null : getPeriodKey(anchorDate, period)), [anchorDate, period]);
  const periodLabel = useMemo(() => formatPeriodLabel(anchorDate, period), [anchorDate, period]);

  const currentPeriodStart = getPeriodStart(new Date(), period);
  const canGoNext = useMemo(() => {
    if (period === 'all') return false;
    const nextAnchor = period === 'weekly'
      ? addDays(anchorDate, 7)
      : period === 'monthly'
        ? addMonths(anchorDate, 1)
        : addYears(anchorDate, 1);
    const nextStart = getPeriodStart(nextAnchor, period);
    return nextStart.getTime() <= currentPeriodStart.getTime();
  }, [anchorDate, period, currentPeriodStart]);

  const goalsForPeriod = useMemo(() => {
    const sorted = [...goals].sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
    if (period === 'all') return sorted;
    return sorted.filter(g => g.period === period && g.periodKey === periodKey);
  }, [goals, period, periodKey]);

  const allColumns = useMemo(() => {
    if (period !== 'all') return [];
    const now = new Date();
    return ALL_VIEW_PERIODS.map(({ key, label }) => {
      const colPeriodKey = getPeriodKey(now, key);
      const items = goals
        .filter(g => g.period === key && g.periodKey === colPeriodKey)
        .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
      return { period: key, label, periodLabel: formatPeriodLabel(now, key), items };
    });
  }, [goals, period]);

  const activeGoal = useMemo(() => {
    if (!modal?.goalId) return null;
    return goals.find(g => g.id === modal.goalId) || null;
  }, [goals, modal]);

  const closeModal = () => setModal(null);

  const handlePrev = () => {
    if (period === 'all') return;
    setAnchorDate(prev => (
      period === 'weekly' ? addDays(prev, -7)
        : period === 'monthly' ? addMonths(prev, -1)
          : addYears(prev, -1)
    ));
  };

  const handleNext = () => {
    if (!canGoNext) return;
    setAnchorDate(prev => (
      period === 'weekly' ? addDays(prev, 7)
        : period === 'monthly' ? addMonths(prev, 1)
          : addYears(prev, 1)
    ));
  };

  const upsertGoal = (goalId, patch) => {
    setGoals(prev => prev.map(g => g.id === goalId ? { ...g, ...patch, updatedAt: Date.now() } : g));
  };

  const deleteGoal = (goalId) => {
    setGoals(prev => prev.filter(g => g.id !== goalId));
    setTodos(prev => prev.filter(t => t.goalId !== goalId));
    setHabits(prev => prev.map(h => h.goalId === goalId ? { ...h, goalId: null } : h));
  };

  const linkHabit = (goalId, habitId) => {
    setHabits(prev => prev.map(h => h.id === habitId ? { ...h, goalId } : h));
  };

  const unlinkHabit = (habitId) => {
    setHabits(prev => prev.map(h => h.id === habitId ? { ...h, goalId: null } : h));
  };

  const awardGoalXp = (goal) => {
    if (!onUpdateStat) return;
    const attrs = goal.attributes?.length ? goal.attributes : ['discipline'];
    const xpTotal = GOAL_XP_BY_PERIOD[goal.period] || GOAL_XP_BY_PERIOD.weekly;
    // Milestone-driven goals already pay MILESTONE_XP per milestone (to each attribute) as
    // they're checked off. A goal only auto-completes once every milestone is done, so
    // discount those from the completion bonus — otherwise the work is paid for twice.
    const milestoneCount = (goal.milestones || []).length;
    const alreadyPaid = milestoneCount * MILESTONE_XP * attrs.length;
    const remaining = Math.max(0, xpTotal - alreadyPaid);
    if (remaining <= 0) return;
    const xpEach = Math.max(1, Math.floor(remaining / attrs.length));
    attrs.forEach(attr => onUpdateStat(attr, xpEach, { source: 'goal', label: goal.title }));
  };

  const awardMilestoneXp = (goal, milestoneText) => {
    if (!onUpdateStat) return;
    const attrs = goal.attributes?.length ? goal.attributes : ['discipline'];
    attrs.forEach(attr => onUpdateStat(attr, MILESTONE_XP, { source: 'milestone', label: milestoneText }));
  };

  const handleToggleGoalComplete = (goal) => {
    const { goal: updated, shouldAwardXp } = toggleGoalCompleted(goal);
    setGoals(prev => prev.map(g => g.id === goal.id ? updated : g));
    if (shouldAwardXp) awardGoalXp(goal);
  };

  const handleToggleMilestone = (goal, milestoneId) => {
    const { goal: updatedGoal, justCompleted, milestoneText } = toggleMilestone(goal, milestoneId);
    const allDone = updatedGoal.milestones.length > 0 && updatedGoal.milestones.every(m => m.completed);
    let finalGoal = updatedGoal;
    let shouldAwardGoalXp = false;
    if (allDone && !updatedGoal.completed) {
      const result = toggleGoalCompleted(updatedGoal);
      finalGoal = result.goal;
      shouldAwardGoalXp = result.shouldAwardXp;
    }
    setGoals(prev => prev.map(g => g.id === goal.id ? finalGoal : g));
    if (justCompleted) awardMilestoneXp(goal, milestoneText);
    if (shouldAwardGoalXp) awardGoalXp(goal);
  };

  const adjustGoalValue = (goal, delta) => {
    const nextValue = Math.max(0, Math.min(goal.targetValue, (goal.currentValue || 0) + delta));
    let nextGoal = { ...goal, currentValue: nextValue };
    let shouldAward = false;
    if (nextValue >= goal.targetValue && !goal.completed) {
      const result = toggleGoalCompleted(nextGoal);
      nextGoal = result.goal;
      shouldAward = result.shouldAwardXp;
    } else {
      nextGoal.updatedAt = Date.now();
    }
    setGoals(prev => prev.map(g => g.id === goal.id ? nextGoal : g));
    if (shouldAward) awardGoalXp(goal);
  };

  const handleAddLinkedTask = (goal, text) => {
    if (!text.trim()) return;
    const newTask = {
      id: Date.now(),
      text: text.trim(),
      timeFrame: TIMEFRAME_BY_PERIOD[goal.period] || 'this-week',
      xp: GOAL_TASK_XP_BY_PERIOD[goal.period] || GOAL_TASK_XP_BY_PERIOD.weekly,
      categories: goal.attributes?.length ? goal.attributes : ['discipline'],
      completed: false,
      notes: '',
      subtasks: [],
      dueDate: null,
      scheduledDate: null,
      goalId: goal.id,
      goalPeriodKey: goal.periodKey,
    };
    setTodos(prev => [...prev, newTask]);
    setAddTaskGoalId(null);
    setAddTaskText('');
  };

  const keyAnchorForAdd = period === 'all' ? new Date() : anchorDate;
  const getPinnedCountForAdd = (candidatePeriod) => {
    const candidateKey = getPeriodKey(keyAnchorForAdd, candidatePeriod);
    return goals.filter(g => g.pinned && g.period === candidatePeriod && g.periodKey === candidateKey).length;
  };

  const getPinnedCountForEdit = activeGoal ? (candidatePeriod) => {
    const candidateKey = candidatePeriod === activeGoal.period ? activeGoal.periodKey : getPeriodKey(new Date(), candidatePeriod);
    return goals.filter(g => g.pinned && g.period === candidatePeriod && g.periodKey === candidateKey && g.id !== activeGoal.id).length;
  } : undefined;

  const renderAttrBadges = (attributes = []) => {
    if (!attributes || attributes.length === 0) return null;
    return (
      <div className="gp-badges">
        {attributes.map((attr) => {
          const meta = STAT_META[attr] || { label: attr, Icon: null, color: '#8e8e93' };
          const { Icon } = meta;
          return (
            <span
              key={attr}
              className="gp-badge"
              style={{ color: meta.color, background: `${meta.color}18`, borderColor: `${meta.color}44` }}
            >
              {Icon && <Icon size={11} strokeWidth={2.5} />}
              {meta.label}
            </span>
          );
        })}
      </div>
    );
  };

  const renderProgressBar = (goal) => {
    const progress = getGoalProgress(goal);
    if (progress.kind === 'binary') return null;
    const pct = Math.round(progress.ratio * 100);
    const label = progress.kind === 'numeric'
      ? `${progress.done}${goal.unit ? ` ${goal.unit}` : ''} / ${progress.total}${goal.unit ? ` ${goal.unit}` : ''}`
      : `${progress.done}/${progress.total}`;
    return (
      <div className="gp-progress">
        <div className="gp-progress-track">
          <div className="gp-progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="gp-progress-label">{label}</span>
      </div>
    );
  };

  const renderGoalCard = (goal) => {
    const isComplete = !!goal.completed;
    const linkedHabits = habits.filter(h => h.goalId === goal.id);
    const unlinkedHabits = habits.filter(h => !h.goalId);

    return (
      <div key={goal.id} className={`gp-card ${isComplete ? 'gp-card--complete' : ''}`}>
        <div className="gp-card-top">
          {renderAttrBadges(goal.attributes)}
          <div className="gp-card-actions">
            <button className="gp-icon-btn" onClick={() => setModal({ type: 'edit-goal', goalId: goal.id })} title="Edit"><Pencil size={14} /></button>
            <button className="gp-icon-btn gp-icon-btn--danger" onClick={() => deleteGoal(goal.id)} title="Delete"><X size={14} /></button>
          </div>
        </div>

        <div className="gp-card-title-row">
          <div className="gp-card-title-left">
            <input
              className="gp-goal-checkbox"
              type="checkbox"
              checked={isComplete}
              onChange={() => handleToggleGoalComplete(goal)}
              aria-label={isComplete ? 'Mark goal incomplete' : 'Mark goal complete'}
            />
            <h3 className="gp-card-title">{goal.title}</h3>
          </div>
          {goal.pinned && <span className="gp-pin-badge" title="Pinned focus goal"><Pin size={14} /></span>}
          {isComplete && <span className="gp-complete-badge">Complete</span>}
        </div>

        {renderProgressBar(goal)}

        {goal.milestones?.length > 0 && (
          <div className="gp-milestones">
            {goal.milestones.map((m) => (
              <label key={m.id} className={`gp-milestone-item ${m.completed ? 'gp-milestone-item--done' : ''}`}>
                <input
                  type="checkbox"
                  className="gp-milestone-checkbox"
                  checked={m.completed}
                  onChange={() => handleToggleMilestone(goal, m.id)}
                />
                <span className="gp-milestone-text">{m.text}</span>
              </label>
            ))}
          </div>
        )}

        {goal.targetValue != null && !isComplete && (
          <div className="gp-numeric-stepper">
            <button type="button" className="gp-stepper-btn" onClick={() => adjustGoalValue(goal, -1)}>−</button>
            <span className="gp-stepper-value">
              {goal.currentValue || 0} / {goal.targetValue}{goal.unit ? ` ${goal.unit}` : ''}
            </span>
            <button type="button" className="gp-stepper-btn" onClick={() => adjustGoalValue(goal, 1)}>+</button>
          </div>
        )}

        {(linkedHabits.length > 0 || unlinkedHabits.length > 0) && (
          <div className="gp-habits">
            {linkedHabits.map((h) => (
              <div key={h.id} className="gp-habit-chip">
                <span className="gp-habit-flame"><Flame size={14} /></span>
                <span className="gp-habit-name">{h.name}</span>
                <span className="gp-habit-streak">{getHabitStreak(h)}</span>
                <button
                  type="button"
                  className="gp-habit-unlink"
                  onClick={() => unlinkHabit(h.id)}
                  title="Unlink habit"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            {unlinkedHabits.length > 0 && (
              <select
                className="gp-habit-select"
                value=""
                onChange={(e) => { if (e.target.value) linkHabit(goal.id, Number(e.target.value)); }}
              >
                <option value="">+ Link a habit…</option>
                {unlinkedHabits.map((h) => (
                  <option key={h.id} value={h.id}>{h.name}</option>
                ))}
              </select>
            )}
          </div>
        )}

        {goal.notes?.trim() && (
          <div className="gp-notes">{goal.notes}</div>
        )}

        {(goal.obstacle?.trim() || goal.ifThenPlan?.trim()) && (
          <div className="gp-woop">
            {goal.obstacle?.trim() && (
              <div className="gp-woop-row"><span className="gp-woop-label">Obstacle</span>{goal.obstacle}</div>
            )}
            {goal.ifThenPlan?.trim() && (
              <div className="gp-woop-row"><span className="gp-woop-label">If → then</span>{goal.ifThenPlan}</div>
            )}
          </div>
        )}

        <div className="gp-linked-task">
          {addTaskGoalId === goal.id ? (
            <form
              className="gp-linked-task-form"
              onSubmit={(e) => { e.preventDefault(); handleAddLinkedTask(goal, addTaskText); }}
            >
              <input
                autoFocus
                className="gp-linked-task-input"
                type="text"
                value={addTaskText}
                onChange={(e) => setAddTaskText(e.target.value)}
                placeholder="Task for this goal..."
              />
              <button type="submit" className="gp-linked-task-submit">Add</button>
              <button
                type="button"
                className="gp-linked-task-cancel"
                onClick={() => { setAddTaskGoalId(null); setAddTaskText(''); }}
              >
                <X size={14} />
              </button>
            </form>
          ) : (
            <button
              type="button"
              className="gp-linked-task-btn"
              onClick={() => { setAddTaskGoalId(goal.id); setAddTaskText(''); }}
            >
              + Add linked task
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="gp-page">
      <div className="gp-page-header">
        <div>
          <h1 className="gp-page-title">Goals</h1>
          <p className="gp-page-subtitle">Set goals for the week, month, and year.</p>
        </div>
        <button className="gp-add-btn" onClick={() => setModal({ type: 'add-goal' })}>
          + Add Goal
        </button>
      </div>

      <div className="gp-controls">
        <div className="gp-period-pills">
          {PERIODS.map(p => (
            <button
              key={p.key}
              type="button"
              className={`gp-pill ${period === p.key ? 'gp-pill--active' : ''}`}
              onClick={() => {
                setPeriod(p.key);
                setAnchorDate(new Date());
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        {period !== 'all' && (
          <div className="gp-nav">
            <button className="gp-nav-btn" onClick={handlePrev} aria-label="Previous period">
              <ArrowLeftIcon size={18} strokeWidth={2.5} />
            </button>
            <div className="gp-nav-label">{periodLabel}</div>
            <button className={`gp-nav-btn ${canGoNext ? '' : 'gp-nav-btn--disabled'}`} onClick={handleNext} disabled={!canGoNext} aria-label="Next period">
              <ArrowRightIcon size={18} strokeWidth={2.5} />
            </button>
          </div>
        )}
      </div>

      {period === 'all' ? (
        <div className="gp-all-columns">
          {allColumns.map((col) => (
            <div className="gp-all-column" key={col.period}>
              <div className="gp-section-header">
                <h2 className="gp-section-title">{col.label} Goals</h2>
                <span className="gp-section-count">{col.items.length}</span>
              </div>

              {col.items.length === 0 ? (
                <div className="gp-empty gp-empty--compact">
                  <p className="gp-empty-title">No goals yet.</p>
                  <p className="gp-empty-subtitle">{col.periodLabel}</p>
                </div>
              ) : (
                <div className="gp-column-list">
                  {col.items.map(renderGoalCard)}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="gp-section-header">
            <h2 className="gp-section-title">{period.charAt(0).toUpperCase() + period.slice(1)} Goals</h2>
            <span className="gp-section-count">{goalsForPeriod.length}</span>
          </div>

          {goalsForPeriod.length === 0 ? (
            <div className="gp-empty">
              <p className="gp-empty-title">No goals yet for this period.</p>
              <p className="gp-empty-subtitle">Click <strong>+ Add Goal</strong> to create one.</p>
            </div>
          ) : (
            <div className="gp-grid">
              {goalsForPeriod.map(renderGoalCard)}
            </div>
          )}
        </>
      )}

      {modal?.type === 'add-goal' && (
        <GoalModal
          mode="add"
          periodLabel={period === 'all' ? 'All Goals' : periodLabel}
          initial={{ title: '', notes: '', attributes: [] }}
          onClose={closeModal}
          showPeriodPicker={true}
          defaultPeriod={period === 'all' ? 'weekly' : period}
          getPinnedCount={getPinnedCountForAdd}
          onSubmit={(draft) => {
            const goalPeriod = draft.period;
            const keyAnchor = period === 'all' ? new Date() : anchorDate;
            const goalPeriodKey = getPeriodKey(keyAnchor, goalPeriod);
            const newGoal = normalizeGoal({
              id: `goal_${Date.now()}`,
              period: goalPeriod,
              periodKey: goalPeriodKey,
              ...draft,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            });
            setGoals(prev => [newGoal, ...prev]);
            closeModal();
          }}
        />
      )}

      {modal?.type === 'edit-goal' && activeGoal && (
        <GoalModal
          mode="edit"
          periodLabel={formatGoalPeriodLabel(activeGoal)}
          initial={activeGoal}
          onClose={closeModal}
          showPeriodPicker={true}
          defaultPeriod={activeGoal.period}
          getPinnedCount={getPinnedCountForEdit}
          onSubmit={(draft) => {
            const next = { ...draft };
            if (draft.period && draft.period !== activeGoal.period) {
              next.periodKey = getPeriodKey(new Date(), draft.period);
            }
            upsertGoal(activeGoal.id, next);
            closeModal();
          }}
        />
      )}
    </div>
  );
};

export default GoalsPage;
