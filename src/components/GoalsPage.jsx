import React, { useMemo, useState } from 'react';
import './GoalsPage.css';
import STAT_META from './statMeta';

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

const timeFrameForGoalPeriod = (period) => {
  if (period === 'weekly') return 'this-week';
  if (period === 'monthly') return 'this-month';
  return 'this-year';
};

const XP_BY_TIMEFRAME = {
  today: 20,
  'this-week': 50,
  'this-month': 100,
  'this-year': 500,
};

const GoalModal = ({ mode, periodLabel, initial, onClose, onSubmit, showPeriodPicker = true, defaultPeriod = 'weekly' }) => {
  const [title, setTitle] = useState(initial?.title || '');
  const [notes, setNotes] = useState(initial?.notes || '');
  const [attributes, setAttributes] = useState(initial?.attributes || []);
  const [goalPeriod, setGoalPeriod] = useState(initial?.period || defaultPeriod);
  const statKeys = Object.keys(STAT_META);

  const toggleAttribute = (attr) => {
    setAttributes(prev => (
      prev.includes(attr) ? prev.filter(a => a !== attr) : [...prev, attr]
    ));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSubmit({
      title: title.trim(),
      notes,
      attributes,
      period: goalPeriod,
    });
  };

  return (
    <div className="gp-modal-overlay" onClick={onClose}>
      <div className="gp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="gp-modal-header">
          <h2 className="gp-modal-title">{mode === 'edit' ? 'EDIT GOAL' : 'NEW GOAL'}</h2>
          <button className="gp-modal-close" onClick={onClose}>✕</button>
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
            {mode === 'edit' ? 'SAVE' : 'ADD GOAL'}
          </button>
        </form>
      </div>
    </div>
  );
};

const GoalTaskModal = ({ goal, periodLabel, onClose, onAddTask }) => {
  const [text, setText] = useState('');
  const [categories, setCategories] = useState(goal?.attributes?.length ? goal.attributes : ['discipline']);
  const [timeFrame, setTimeFrame] = useState(() => {
    if (goal?.period === 'weekly') return 'this-week';
    if (goal?.period === 'monthly') return 'this-month';
    return 'this-month';
  });

  const statKeys = Object.keys(STAT_META);
  const xp = XP_BY_TIMEFRAME[timeFrame] || 20;

  const toggleCategory = (attr) => {
    setCategories(prev => (
      prev.includes(attr)
        ? (prev.length > 1 ? prev.filter(a => a !== attr) : prev)
        : [...prev, attr]
    ));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    onAddTask({
      text: text.trim(),
      categories,
      timeFrame,
      xp,
    });
  };

  return (
    <div className="gp-modal-overlay" onClick={onClose}>
      <div className="gp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="gp-modal-header">
          <h2 className="gp-modal-title">ADD TASK</h2>
          <button className="gp-modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="gp-modal-subtitle">{goal?.title} • {periodLabel}</div>

        <form onSubmit={handleSubmit} className="gp-modal-form">
          <div className="gp-field-group">
            <label className="gp-label">Task</label>
            <input
              className="gp-text-input"
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Add a task that moves this goal forward..."
              autoFocus
            />
          </div>

          <div className="gp-field-group">
            <label className="gp-label">Time Frame</label>
            <div className="gp-timeframe-pills">
              <button
                type="button"
                className={`gp-timeframe-pill ${timeFrame === 'today' ? 'gp-timeframe-pill--active' : ''}`}
                onClick={() => setTimeFrame('today')}
              >
                Today
                <span className="gp-timeframe-xp">+{XP_BY_TIMEFRAME.today}XP</span>
              </button>
              <button
                type="button"
                className={`gp-timeframe-pill ${timeFrame === 'this-week' ? 'gp-timeframe-pill--active' : ''}`}
                onClick={() => setTimeFrame('this-week')}
              >
                This Week
                <span className="gp-timeframe-xp">+{XP_BY_TIMEFRAME['this-week']}XP</span>
              </button>
              <button
                type="button"
                className={`gp-timeframe-pill ${timeFrame === 'this-month' ? 'gp-timeframe-pill--active' : ''}`}
                onClick={() => setTimeFrame('this-month')}
              >
                This Month
                <span className="gp-timeframe-xp">+{XP_BY_TIMEFRAME['this-month']}XP</span>
              </button>
            </div>
          </div>

          <div className="gp-field-group">
            <label className="gp-label">Attributes</label>
            <div className="gp-attr-grid">
              {statKeys.map((attr) => {
                const meta = STAT_META[attr];
                const { Icon } = meta;
                const active = categories.includes(attr);
                return (
                  <button
                    key={attr}
                    type="button"
                    className={`gp-attr-pill ${active ? 'gp-attr-pill--active' : ''}`}
                    style={active ? { background: `${meta.color}22`, borderColor: meta.color, color: meta.color } : {}}
                    onClick={() => toggleCategory(attr)}
                  >
                    {Icon && <Icon size={12} strokeWidth={2.5} />}
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </div>

          <button type="submit" className="gp-submit-btn" disabled={!text.trim()}>
            ADD TASK
          </button>
        </form>
      </div>
    </div>
  );
};

const GoalsPage = ({ goals = [], setGoals, todos = [], setTodos }) => {
  const [period, setPeriod] = useState('weekly');
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [modal, setModal] = useState(null); // { type: 'add-goal'|'edit-goal'|'add-task', goalId? }

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
  };

  const renderAttrBadges = (attributes = []) => {
    if (!attributes || attributes.length === 0) return null;
    return (
      <div className="gp-badges">
        {attributes.map((attr) => {
          const meta = STAT_META[attr] || { label: attr, Icon: null, color: '#a3a3a3' };
          const { Icon } = meta;
          return (
            <span
              key={attr}
              className="gp-badge"
              style={{ color: meta.color, background: `${meta.color}18`, borderColor: `${meta.color}44` }}
            >
              {Icon && <Icon size={11} strokeWidth={2.5} />}
              {meta.label.toUpperCase()}
            </span>
          );
        })}
      </div>
    );
  };

  const tasksForGoal = (goalId) => {
    const items = todos.filter(t => t.goalId === goalId);
    return items.sort((a, b) => {
      const ac = a.completed ? 1 : 0;
      const bc = b.completed ? 1 : 0;
      if (ac !== bc) return ac - bc;
      return (b.id || 0) - (a.id || 0);
    });
  };

  return (
    <div className="gp-page">
      <div className="gp-page-header">
        <div>
          <h1 className="gp-page-title">GOALS</h1>
          <p className="gp-page-subtitle">Create goals, then add tasks that push them forward.</p>
        </div>
        <button className="gp-add-btn" onClick={() => setModal({ type: 'add-goal' })}>
          + ADD GOAL
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

      <div className="gp-section-header">
        <h2 className="gp-section-title">{period.toUpperCase()} GOALS</h2>
        <span className="gp-section-count">{goalsForPeriod.length}</span>
      </div>

      {goalsForPeriod.length === 0 ? (
        <div className="gp-empty">
          <p className="gp-empty-title">No goals yet for this period.</p>
          <p className="gp-empty-subtitle">Click <strong>+ Add Goal</strong> to create one, then add tasks under it.</p>
        </div>
      ) : (
        <div className="gp-grid">
          {goalsForPeriod.map((goal) => {
            const linkedTasks = tasksForGoal(goal.id);
            const total = linkedTasks.length;
            const completed = linkedTasks.filter(t => t.completed).length;
            const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
            const isComplete = total > 0 && completed === total;

            return (
              <div key={goal.id} className={`gp-card ${isComplete ? 'gp-card--complete' : ''}`}>
                <div className="gp-card-top">
                  {renderAttrBadges(goal.attributes)}
                  <div className="gp-card-actions">
                    <button className="gp-icon-btn" onClick={() => setModal({ type: 'add-task', goalId: goal.id })} title="Add task">＋</button>
                    <button className="gp-icon-btn" onClick={() => setModal({ type: 'edit-goal', goalId: goal.id })} title="Edit">✎</button>
                    <button className="gp-icon-btn gp-icon-btn--danger" onClick={() => deleteGoal(goal.id)} title="Delete">✕</button>
                  </div>
                </div>

                <div className="gp-card-title-row">
                  <h3 className="gp-card-title">{goal.title}</h3>
                  {isComplete && <span className="gp-complete-badge">COMPLETE</span>}
                </div>

                <div className="gp-progress-line">
                  <span className="gp-progress-nums">Tasks: {completed} / {total}</span>
                  <span className="gp-progress-pct">{pct}%</span>
                </div>

                <div className="gp-progress-bar">
                  <div className="gp-progress-fill" style={{ width: `${pct}%` }} />
                </div>

                {total > 0 && (
                  <div className="gp-task-list">
                    {linkedTasks.map((t) => (
                      <div key={t.id} className={`gp-task ${t.completed ? 'gp-task--done' : ''}`}>
                        <span className={`gp-task-dot ${t.completed ? 'gp-task-dot--done' : ''}`} />
                        <span className="gp-task-text">{t.text}</span>
                      </div>
                    ))}
                  </div>
                )}

                {goal.notes?.trim() && (
                  <div className="gp-notes">{goal.notes}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {modal?.type === 'add-goal' && (
        <GoalModal
          mode="add"
          periodLabel={period === 'all' ? 'All Goals' : periodLabel}
          initial={{ title: '', notes: '', attributes: [] }}
          onClose={closeModal}
          showPeriodPicker={true}
          defaultPeriod={period === 'all' ? 'weekly' : period}
          onSubmit={(draft) => {
            const goalPeriod = draft.period;
            const keyAnchor = period === 'all' ? new Date() : anchorDate;
            const goalPeriodKey = getPeriodKey(keyAnchor, goalPeriod);
            const newGoal = {
              id: `goal_${Date.now()}`,
              period: goalPeriod,
              periodKey: goalPeriodKey,
              ...draft,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            };
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

      {modal?.type === 'add-task' && activeGoal && (
        <GoalTaskModal
          goal={activeGoal}
          periodLabel={formatGoalPeriodLabel(activeGoal)}
          onClose={closeModal}
          onAddTask={(draft) => {
            const timeFrame = draft.timeFrame;
            const xp = XP_BY_TIMEFRAME[timeFrame] || 20;
            const goalPeriodKey =
              timeFrame === 'this-week'
                ? getPeriodKey(new Date(), 'weekly')
                : timeFrame === 'this-month'
                  ? getPeriodKey(new Date(), 'monthly')
                  : undefined;
            const todo = {
              id: Date.now(),
              text: draft.text,
              xp,
              timeFrame,
              categories: draft.categories,
              completed: false,
              notes: '',
              subtasks: [],
              goalId: activeGoal.id,
              goalPeriodKey,
            };
            setTodos(prev => [...prev, todo]);
            closeModal();
          }}
        />
      )}
    </div>
  );
};

export default GoalsPage;
