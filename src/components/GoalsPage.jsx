import React, { useMemo, useState } from 'react';
import './GoalsPage.css';
import {
  X, Pin, Pencil, Flame, Plus, ArrowUp, CalendarDays, ChevronDown, Check, Play, Trash2,
  ListChecks, Timer, CalendarCheck, Flag, CircleCheck, CalendarPlus,
} from 'lucide-react';
import NorthStarCard from './NorthStarCard';
import {
  getGoalProgress, getGoalActivity, getGoalStatus, getFocusGoals, getNextStep, deadlineLabel,
  lastMovedLabel, deadlinePresets, toggleMilestone, toggleGoalCompleted, goalCompletionXp,
  setGoalCheckin, pushDeadline, makeGoal, patchGoal, addMilestone, goalDateKey, MILESTONE_XP, FOCUS_GOAL_LIMIT,
} from '../utils/goalUtils';
import { makeTask } from '../utils/taskUtils';
import { getHabitStreak } from '../utils/habitUtils';

const STATUS_LABEL = { 'on-track': 'Moving', quiet: 'Quiet', overdue: 'Overdue', done: 'Done' };

const EVENT_META = {
  task: { Icon: ListChecks, verb: 'Task done' },
  habit: { Icon: Flame, verb: 'Habit' },
  focus: { Icon: Timer, verb: 'Focus' },
  block: { Icon: CalendarCheck, verb: 'Time block' },
  milestone: { Icon: Flag, verb: 'Milestone' },
  checkin: { Icon: CircleCheck, verb: 'Checked in' },
};

const shortDay = (dateKey, todayKey) => {
  if (dateKey === todayKey) return 'Today';
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

// ─── Deadline chips (quick add + edit) ───────────────────────────────────────

function DeadlineChips({ value, onChange, now }) {
  const presets = deadlinePresets(now);
  const isPreset = presets.some((p) => p.key === value);
  const openPicker = (e) => { try { e.currentTarget.showPicker(); } catch { /* opens natively (iOS) */ } };
  return (
    <div className="gp-chips" role="group" aria-label="Deadline">
      {presets.map((p) => (
        <button
          key={p.id}
          type="button"
          className={`gp-chip${value === p.key ? ' gp-chip--on' : ''}`}
          aria-pressed={value === p.key}
          onClick={() => onChange(p.key)}
        >
          {p.label}
        </button>
      ))}
      <label className={`gp-chip gp-chip--pick${value && !isPreset ? ' gp-chip--on' : ''}`}>
        <CalendarDays size={12} /> {value && !isPreset ? shortDay(value, '') : 'Pick date'}
        <input
          type="date"
          className="gp-chip-date"
          min={goalDateKey(now)}
          value={value && !isPreset ? value : ''}
          aria-label="Pick a deadline"
          onClick={openPicker}
          onChange={(e) => e.target.value && onChange(e.target.value)}
        />
      </label>
    </div>
  );
}

// ─── Quick add ───────────────────────────────────────────────────────────────

function GoalQuickAdd({ onAdd, now, autoFocus }) {
  const [title, setTitle] = useState('');
  const [deadline, setDeadline] = useState(() => deadlinePresets(now)[0].key);

  const submit = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    onAdd(title.trim(), deadline);
    setTitle('');
  };

  return (
    <form className="gp-add" onSubmit={submit}>
      <div className="gp-add-row">
        <Plus size={18} className="gp-add-plus" aria-hidden="true" />
        <input
          className="gp-add-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What do you want to achieve?"
          aria-label="New goal"
          enterKeyHint="done"
          maxLength={140}
          autoFocus={autoFocus}
        />
        <button type="submit" className="gp-add-submit" disabled={!title.trim()} aria-label="Add goal">
          <ArrowUp size={16} strokeWidth={2.6} />
        </button>
      </div>
      <DeadlineChips value={deadline} onChange={setDeadline} now={now} />
    </form>
  );
}

// ─── Edit modal ──────────────────────────────────────────────────────────────

function GoalEditModal({ goal, now, onClose, onSave }) {
  const [title, setTitle] = useState(goal.title || '');
  const [deadline, setDeadline] = useState(goal.deadline || null);
  const [trackNumeric, setTrackNumeric] = useState(goal.targetValue != null);
  const [targetValue, setTargetValue] = useState(goal.targetValue ?? '');
  const [unit, setUnit] = useState(goal.unit || '');
  const [showWoop, setShowWoop] = useState(!!(goal.obstacle?.trim() || goal.ifThenPlan?.trim()));
  const [obstacle, setObstacle] = useState(goal.obstacle || '');
  const [ifThenPlan, setIfThenPlan] = useState(goal.ifThenPlan || '');
  const [notes, setNotes] = useState(goal.notes || '');

  const submit = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({
      title: title.trim(),
      deadline,
      targetValue: trackNumeric && targetValue !== '' && Number(targetValue) > 0 ? Number(targetValue) : null,
      unit: trackNumeric ? unit.trim() : '',
      obstacle: obstacle.trim(),
      ifThenPlan: ifThenPlan.trim(),
      notes,
    });
  };

  return (
    <div className="gp-modal-overlay" onClick={onClose}>
      <div className="gp-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Edit goal">
        <div className="gp-modal-header">
          <h2 className="gp-modal-title">Edit goal</h2>
          <button type="button" className="gp-modal-close" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <form onSubmit={submit} className="gp-modal-form">
          <label className="gp-field-group">
            <span className="gp-label">Goal</span>
            <input className="gp-text-input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          </label>

          <div className="gp-field-group">
            <span className="gp-label">Deadline</span>
            <DeadlineChips value={deadline} onChange={setDeadline} now={now} />
          </div>

          <div className="gp-field-group">
            <label className="gp-field-checkbox-label">
              <input type="checkbox" checked={trackNumeric} onChange={(e) => setTrackNumeric(e.target.checked)} />
              Track a number <span className="gp-label-hint">(e.g. run 50 miles)</span>
            </label>
            {trackNumeric && (
              <div className="gp-numeric-inputs">
                <input type="number" min="1" className="gp-text-input gp-numeric-target-input" value={targetValue}
                  onChange={(e) => setTargetValue(e.target.value)} placeholder="Target" />
                <input type="text" className="gp-text-input" value={unit}
                  onChange={(e) => setUnit(e.target.value)} placeholder="Unit (miles, books…)" />
              </div>
            )}
          </div>

          <div className="gp-field-group">
            <button type="button" className="gp-woop-toggle" onClick={() => setShowWoop((v) => !v)}>
              {showWoop ? '− Hide' : '+ Add'} obstacle plan <span className="gp-label-hint">(if-then plans boost follow-through)</span>
            </button>
            {showWoop && (
              <>
                <label className="gp-field-group">
                  <span className="gp-label">Biggest obstacle</span>
                  <textarea className="gp-textarea" rows={2} value={obstacle} onChange={(e) => setObstacle(e.target.value)}
                    placeholder="What's most likely to get in the way?" />
                </label>
                <label className="gp-field-group">
                  <span className="gp-label">If that happens, I will…</span>
                  <textarea className="gp-textarea" rows={2} value={ifThenPlan} onChange={(e) => setIfThenPlan(e.target.value)}
                    placeholder="If [obstacle happens], then I will…" />
                </label>
              </>
            )}
          </div>

          <label className="gp-field-group">
            <span className="gp-label">Notes <span className="gp-label-hint">(optional)</span></span>
            <textarea className="gp-textarea" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>

          <button type="submit" className="gp-submit-btn" disabled={!title.trim()}>Save</button>
        </form>
      </div>
    </div>
  );
}

// ─── Card pieces ─────────────────────────────────────────────────────────────

function ActivityStrip({ strip, todayKey }) {
  return (
    <div className="gp-strip" aria-label="Last 7 days">
      {strip.map((d) => (
        <span
          key={d.date}
          className={`gp-strip-day${d.count ? ' gp-strip-day--on' : ''}${d.count > 2 ? ' gp-strip-day--strong' : ''}${d.date === todayKey ? ' gp-strip-day--today' : ''}`}
          title={`${shortDay(d.date, todayKey)}: ${d.count ? `${d.count} thing${d.count === 1 ? '' : 's'}${d.minutes ? `, ${d.minutes} min focus` : ''}` : 'nothing'}`}
        />
      ))}
    </div>
  );
}

function ProgressBar({ goal }) {
  const p = getGoalProgress(goal);
  if (p.kind === 'binary') return null;
  const pct = Math.round(p.ratio * 100);
  const label = p.kind === 'numeric'
    ? `${p.done} / ${p.total}${goal.unit ? ` ${goal.unit}` : ''}`
    : `${p.done}/${p.total} milestones`;
  return (
    <div className="gp-progress">
      <div className="gp-progress-track"><div className="gp-progress-fill" style={{ width: `${pct}%` }} /></div>
      <span className="gp-progress-label">{label}</span>
    </div>
  );
}

function InlineAdd({ placeholder, onAdd, label }) {
  const [text, setText] = useState('');
  return (
    <form className="gp-inline-add" onSubmit={(e) => { e.preventDefault(); if (text.trim()) { onAdd(text.trim()); setText(''); } }}>
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} aria-label={label} maxLength={160} />
      <button type="submit" disabled={!text.trim()} aria-label={label}><Plus size={14} /></button>
    </form>
  );
}

function GoalCard({ goal, data, now, todayKey, expanded, onToggle, actions }) {
  const activity = getGoalActivity(goal, data, now);
  const status = getGoalStatus(goal, activity, now);
  const next = getNextStep(goal, data.todos);
  const openTasks = data.todos.filter((t) => String(t.goalId) === String(goal.id) && !t.completed);
  const linkedHabits = data.habits.filter((h) => String(h.goalId) === String(goal.id));
  const unlinkedHabits = data.habits.filter((h) => h.goalId == null);
  const done = !!goal.completed;

  return (
    <article className={`gp-card gp-card--${status}${expanded ? ' gp-card--open' : ''}`}>
      <div className="gp-card-head">
        <button type="button" className="gp-card-title-btn" onClick={onToggle} aria-expanded={expanded}>
          <span className={`gp-dot gp-dot--${status}`} aria-label={STATUS_LABEL[status]} />
          <span className="gp-card-title">{goal.title}</span>
          <ChevronDown size={16} className="gp-card-chevron" aria-hidden="true" />
        </button>
        {!done && (
          <button
            type="button"
            className={`gp-icon-btn${goal.pinned ? ' gp-icon-btn--on' : ''}`}
            onClick={() => actions.togglePin(goal)}
            title={goal.pinned ? 'Unpin from focus' : 'Pin to focus'}
            aria-pressed={!!goal.pinned}
          >
            <Pin size={14} />
          </button>
        )}
      </div>

      <p className="gp-card-meta">
        <span className={status === 'overdue' ? 'gp-meta-alert' : ''}>{deadlineLabel(goal, now)}</span>
        {!done && <><span aria-hidden="true">·</span><span className={status === 'quiet' ? 'gp-meta-warn' : ''}>{lastMovedLabel(activity)}</span></>}
      </p>

      <ProgressBar goal={goal} />

      {!done && (
        <div className="gp-week">
          <ActivityStrip strip={activity.strip} todayKey={todayKey} />
          <span className="gp-week-text">
            {activity.weekCount ? `${activity.weekCount} this week` : 'Nothing this week'}
            {activity.weekMinutes ? ` · ${activity.weekMinutes}m focus` : ''}
          </span>
        </div>
      )}

      {!done && (
        <div className="gp-next">
          {next ? (
            <>
              <button
                type="button"
                className="gp-check"
                onClick={() => (next.kind === 'milestone' ? actions.toggleMilestone(goal, next.id) : actions.completeTask(next.id))}
                aria-label={`Mark "${next.text}" done`}
              />
              <span className="gp-next-text"><span className="gp-next-key">Next</span> {next.text}</span>
            </>
          ) : (
            <span className="gp-next-text gp-next-text--empty">No next step yet. Add a milestone or a task.</span>
          )}
          <button type="button" className="gp-focus-btn" onClick={() => actions.startFocus(goal, next)} title="Start a focus session for this goal">
            <Play size={13} /> Focus
          </button>
        </div>
      )}

      {expanded && (
        <div className="gp-detail">
          {goal.targetValue != null && !done && (
            <div className="gp-stepper">
              <button type="button" onClick={() => actions.adjustValue(goal, -1)} aria-label="Minus one">−</button>
              <span>{goal.currentValue || 0} / {goal.targetValue}{goal.unit ? ` ${goal.unit}` : ''}</span>
              <button type="button" onClick={() => actions.adjustValue(goal, 1)} aria-label="Plus one">+</button>
            </div>
          )}

          <section className="gp-sub">
            <h4 className="gp-sub-title">Milestones</h4>
            {(goal.milestones || []).map((m) => (
              <div key={m.id} className={`gp-item${m.completed ? ' gp-item--done' : ''}`}>
                <button type="button" className={`gp-check${m.completed ? ' gp-check--on' : ''}`} onClick={() => actions.toggleMilestone(goal, m.id)}
                  aria-label={m.completed ? `Untick ${m.text}` : `Tick ${m.text}`}>
                  {m.completed && <Check size={11} strokeWidth={3} />}
                </button>
                <span className="gp-item-text">{m.text}</span>
                {!m.completed && (
                  <button type="button" className="gp-item-x" onClick={() => actions.deleteMilestone(goal, m.id)} aria-label={`Remove ${m.text}`}><X size={12} /></button>
                )}
              </div>
            ))}
            {!done && <InlineAdd placeholder="Add a milestone…" label="Add milestone" onAdd={(text) => actions.addMilestone(goal, text)} />}
          </section>

          <section className="gp-sub">
            <h4 className="gp-sub-title">Tasks</h4>
            {openTasks.map((t) => (
              <div key={t.id} className="gp-item">
                <button type="button" className="gp-check" onClick={() => actions.completeTask(t.id)} aria-label={`Complete ${t.text}`} />
                <span className="gp-item-text">{t.text}</span>
              </div>
            ))}
            {!done && <InlineAdd placeholder="Add a task for this week…" label="Add task" onAdd={(text) => actions.addTask(goal, text)} />}
          </section>

          {(linkedHabits.length > 0 || (unlinkedHabits.length > 0 && !done)) && (
            <section className="gp-sub">
              <h4 className="gp-sub-title">Habits</h4>
              <div className="gp-habits">
                {linkedHabits.map((h) => (
                  <span key={h.id} className="gp-habit-chip">
                    <Flame size={12} /> {h.name || h.text} <strong>{getHabitStreak(h)}</strong>
                    <button type="button" onClick={() => actions.unlinkHabit(h.id)} aria-label={`Unlink ${h.name}`}><X size={11} /></button>
                  </span>
                ))}
                {unlinkedHabits.length > 0 && !done && (
                  <select className="gp-habit-select" value="" aria-label="Link a habit"
                    onChange={(e) => { if (e.target.value) actions.linkHabit(goal.id, e.target.value); }}>
                    <option value="">+ Link a habit…</option>
                    {unlinkedHabits.map((h) => <option key={h.id} value={String(h.id)}>{h.name || h.text}</option>)}
                  </select>
                )}
              </div>
            </section>
          )}

          {(goal.obstacle?.trim() || goal.ifThenPlan?.trim()) && (
            <div className="gp-woop">
              {goal.obstacle?.trim() && <p><span>Obstacle</span>{goal.obstacle}</p>}
              {goal.ifThenPlan?.trim() && <p><span>If → then</span>{goal.ifThenPlan}</p>}
            </div>
          )}
          {goal.notes?.trim() && <p className="gp-notes">{goal.notes}</p>}

          {activity.events.length > 0 && (
            <section className="gp-sub">
              <h4 className="gp-sub-title">Recent progress</h4>
              <ul className="gp-log">
                {activity.events.slice(0, 6).map((ev, i) => {
                  const { Icon, verb } = EVENT_META[ev.kind];
                  return (
                    <li key={`${ev.kind}_${ev.at}_${i}`}>
                      <Icon size={13} aria-hidden="true" />
                      <span className="gp-log-text">{verb}{ev.kind !== 'checkin' && ev.label ? `: ${ev.label}` : ''}{ev.minutes ? ` · ${ev.minutes}m` : ''}</span>
                      <span className="gp-log-day">{shortDay(ev.date, todayKey)}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <div className="gp-actions">
            {!done && !activity.autoMovedToday && (
              <button type="button" className={`gp-btn${goal.checkins?.[todayKey] ? ' gp-btn--on' : ''}`}
                onClick={() => actions.setCheckin(goal, !goal.checkins?.[todayKey])}>
                <CircleCheck size={14} /> {goal.checkins?.[todayKey] ? 'Moved it today' : 'I moved it today'}
              </button>
            )}
            {status === 'overdue' && (
              <button type="button" className="gp-btn" onClick={() => actions.pushDeadline(goal)}><CalendarPlus size={14} /> +1 week</button>
            )}
            <button type="button" className={`gp-btn${done ? '' : ' gp-btn--primary'}`} onClick={() => actions.toggleComplete(goal)}>
              <Check size={14} /> {done ? 'Reopen' : 'Mark achieved'}
            </button>
            <span className="gp-actions-spacer" />
            <button type="button" className="gp-icon-btn" onClick={() => actions.edit(goal)} title="Edit" aria-label="Edit goal"><Pencil size={14} /></button>
            <button type="button" className="gp-icon-btn gp-icon-btn--danger" onClick={() => actions.remove(goal)} title="Delete" aria-label="Delete goal"><Trash2 size={14} /></button>
          </div>
        </div>
      )}
    </article>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

const GoalsPage = ({
  northStar, onSaveNorthStar, goals = [], setGoals, todos = [], setTodos, onAwardXp, habits = [], setHabits,
  pomodoroSessions = [], calendarEvents = [], onCompleteTask, onStartFocus,
}) => {
  const [expandedId, setExpandedId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [showDone, setShowDone] = useState(false);
  const now = new Date();
  const todayKey = goalDateKey(now);
  const data = useMemo(() => ({ todos, habits, pomodoroSessions, calendarEvents }), [todos, habits, pomodoroSessions, calendarEvents]);

  const focus = getFocusGoals(goals);
  const focusIds = new Set(focus.map((g) => g.id));
  const others = goals.filter((g) => !g.completed && !focusIds.has(g.id));
  const doneGoals = goals.filter((g) => g.completed).sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
  const pinnedCount = goals.filter((g) => g.pinned && !g.completed).length;

  const week = goals.filter((g) => !g.completed).reduce((acc, g) => {
    const a = getGoalActivity(g, data, now);
    acc.count += a.weekCount;
    acc.minutes += a.weekMinutes;
    if (getGoalStatus(g, a, now) === 'quiet') acc.quiet += 1;
    return acc;
  }, { count: 0, minutes: 0, quiet: 0 });

  const replace = (goalId, next) => setGoals((prev) => prev.map((g) => (g.id === goalId ? next : g)));
  const awardGoalXp = (goal) => {
    const xp = goalCompletionXp(goal);
    if (xp > 0) onAwardXp?.(xp, { source: 'goal', label: goal.title });
  };

  const actions = {
    togglePin: (goal) => replace(goal.id, patchGoal(goal, { pinned: !goal.pinned })),
    toggleComplete: (goal) => {
      const { goal: updated, shouldAwardXp } = toggleGoalCompleted(goal);
      replace(goal.id, updated);
      if (shouldAwardXp) awardGoalXp(goal);
      if (updated.completed) setExpandedId(null);
    },
    toggleMilestone: (goal, milestoneId) => {
      const { goal: updated, justCompleted, milestoneText } = toggleMilestone(goal, milestoneId);
      const allDone = updated.milestones.length > 0 && updated.milestones.every((m) => m.completed);
      let final = updated;
      let awardGoal = false;
      if (allDone && !updated.completed) {
        const result = toggleGoalCompleted(updated);
        final = result.goal;
        awardGoal = result.shouldAwardXp;
      }
      replace(goal.id, final);
      if (justCompleted) onAwardXp?.(MILESTONE_XP, { source: 'milestone', label: milestoneText });
      if (awardGoal) awardGoalXp(goal);
    },
    addMilestone: (goal, text) => replace(goal.id, addMilestone(goal, text)),
    deleteMilestone: (goal, id) => replace(goal.id, patchGoal(goal, { milestones: goal.milestones.filter((m) => m.id !== id) })),
    adjustValue: (goal, delta) => {
      const value = Math.max(0, Math.min(goal.targetValue, (goal.currentValue || 0) + delta));
      // Raising the number is progress made today.
      let next = delta > 0 ? setGoalCheckin({ ...goal, currentValue: value }, todayKey, true) : patchGoal(goal, { currentValue: value });
      let award = false;
      if (value >= goal.targetValue && !goal.completed) {
        const result = toggleGoalCompleted(next);
        next = result.goal;
        award = result.shouldAwardXp;
      }
      replace(goal.id, next);
      if (award) awardGoalXp(goal);
    },
    setCheckin: (goal, on) => replace(goal.id, setGoalCheckin(goal, todayKey, on)),
    pushDeadline: (goal) => replace(goal.id, pushDeadline(goal, 7, now)),
    addTask: (goal, text) => setTodos((prev) => [...prev, { ...makeTask({ text, when: 'this-week' }), goalId: goal.id }]),
    completeTask: (taskId) => onCompleteTask?.(taskId),
    linkHabit: (goalId, habitId) => setHabits((prev) => prev.map((h) => (String(h.id) === String(habitId) ? { ...h, goalId } : h))),
    unlinkHabit: (habitId) => setHabits((prev) => prev.map((h) => (h.id === habitId ? { ...h, goalId: null } : h))),
    startFocus: (goal, next) => onStartFocus?.(goal, next),
    edit: (goal) => setEditingId(goal.id),
    // Deleting a goal unlinks its tasks and habits; their history is theirs to keep.
    remove: (goal) => {
      if (!window.confirm(`Delete "${goal.title}"? Its tasks and habits stay, just unlinked.`)) return;
      setGoals((prev) => prev.filter((g) => g.id !== goal.id));
      setTodos((prev) => prev.map((t) => (String(t.goalId) === String(goal.id) ? { ...t, goalId: null, goalPeriodKey: null } : t)));
      setHabits((prev) => prev.map((h) => (String(h.goalId) === String(goal.id) ? { ...h, goalId: null } : h)));
      setExpandedId(null);
    },
  };

  const addGoal = (title, deadline) => {
    const goal = makeGoal({ title, deadline });
    setGoals((prev) => [goal, ...prev]);
  };

  const editing = goals.find((g) => g.id === editingId) || null;

  const renderCard = (goal) => (
    <GoalCard
      key={goal.id}
      goal={goal}
      data={data}
      now={now}
      todayKey={todayKey}
      expanded={expandedId === goal.id}
      onToggle={() => setExpandedId((id) => (id === goal.id ? null : goal.id))}
      actions={actions}
    />
  );

  const active = focus.length + others.length;

  return (
    <div className="gp-page">
      <header className="gp-page-header">
        <h1 className="gp-page-title">Goals</h1>
        <p className="gp-page-subtitle">
          {active === 0
            ? 'Write down what you want. Tasks, habits and focus sessions you link to it count as progress.'
            : `This week: ${week.count} thing${week.count === 1 ? '' : 's'} moved your goals${week.minutes ? ` · ${week.minutes}m focus` : ''}${week.quiet ? ` · ${week.quiet} gone quiet` : ''}`}
        </p>
      </header>

      <GoalQuickAdd onAdd={addGoal} now={now} autoFocus={active === 0} />

      {focus.length > 0 && (
        <section className="gp-section">
          <div className="gp-section-header">
            <h2 className="gp-section-title">Focus</h2>
            <span className="gp-section-hint">
              {pinnedCount > FOCUS_GOAL_LIMIT
                ? `${pinnedCount} pinned, only ${FOCUS_GOAL_LIMIT} fit here`
                : pinnedCount ? 'Pinned first, then soonest deadline' : 'Soonest deadlines · pin to choose'}
            </span>
          </div>
          <div className="gp-grid">{focus.map(renderCard)}</div>
        </section>
      )}

      {others.length > 0 && (
        <section className="gp-section">
          <div className="gp-section-header">
            <h2 className="gp-section-title">Also active</h2>
            <span className="gp-section-count">{others.length}</span>
          </div>
          <div className="gp-grid">{others.map(renderCard)}</div>
        </section>
      )}

      <NorthStarCard northStar={northStar} onSave={onSaveNorthStar} />

      {doneGoals.length > 0 && (
        <section className="gp-section">
          <button type="button" className="gp-done-toggle" onClick={() => setShowDone((v) => !v)} aria-expanded={showDone}>
            <ChevronDown size={15} className={showDone ? 'gp-rot' : ''} /> Achieved <span className="gp-section-count">{doneGoals.length}</span>
          </button>
          {showDone && <div className="gp-grid">{doneGoals.map(renderCard)}</div>}
        </section>
      )}

      {editing && (
        <GoalEditModal
          goal={editing}
          now={now}
          onClose={() => setEditingId(null)}
          onSave={(fields) => { replace(editing.id, patchGoal(editing, fields)); setEditingId(null); }}
        />
      )}
    </div>
  );
};

export default GoalsPage;
