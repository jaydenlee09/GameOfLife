import React, { useState } from 'react';
import { Star, Trash2, X, Play, Check, CalendarDays, Target, Plus } from 'lucide-react';
import {
  dayLabel, whenOf, XP_BY_TIMEFRAME, TIMEFRAME_LABELS, isDayTask, createdAtOf, dateKeyOf,
} from '../../utils/taskUtils';

const SUBTASK_XP = 10;

const addedLabel = (key, today) => {
  const label = dayLabel(key, today);
  return label === 'Today' || label === 'Yesterday' ? label.toLowerCase() : label;
};

const WHEN_CHIPS = [
  { value: 'today', label: 'Today' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'this-week', label: 'This week' },
  { value: 'this-month', label: 'This month' },
  { value: 'this-year', label: 'This year' },
];

// Everything about one task, editable in place (changes save as you go). The
// parent mounts it with key={task.id}, so drafts reset when the task changes.
const TaskDetail = ({
  task, today, goals, topFull, pending, onPatch, onMove, onComplete, onDelete, onToggleTop, onStartFocus, onClose,
  onAwardXp, onToast,
}) => {
  const [title, setTitle] = useState(task.text);
  const [newSubtask, setNewSubtask] = useState('');

  const goal = task.goalId != null ? (goals || []).find((g) => String(g.id) === String(task.goalId)) : null;
  const subtasks = task.subtasks || [];
  const top = task.topDate === today;
  const done = task.completed || pending;
  const when = whenOf(task, today);
  const pickedDay = isDayTask(task) && when !== 'today' && when !== 'tomorrow' ? when : '';
  const created = createdAtOf(task);

  const saveTitle = () => {
    const trimmed = title.trim();
    if (!trimmed) { setTitle(task.text); return; }
    if (trimmed !== task.text) onPatch({ text: trimmed });
  };

  const addSubtask = (e) => {
    e.preventDefault();
    const text = newSubtask.trim();
    if (!text) return;
    onPatch({ subtasks: [...subtasks, { id: Date.now(), text, completed: false }] });
    setNewSubtask('');
  };

  // A sub-task pays once, the first time it's ticked (unticking and re-ticking doesn't farm XP).
  const toggleSubtask = (sub) => {
    const completing = !sub.completed;
    const award = completing && !sub.awarded;
    onPatch({ subtasks: subtasks.map((s) => (s.id === sub.id ? { ...s, completed: completing, ...(award ? { awarded: true } : {}) } : s)) });
    if (award) {
      onAwardXp(SUBTASK_XP, { source: 'subtask', label: sub.text });
      onToast({ text: `+${SUBTASK_XP} XP`, sub: `"${sub.text}" done` });
    }
  };

  const openPicker = (e) => {
    try { e.currentTarget.showPicker(); } catch { /* opens natively (iOS) */ }
  };

  return (
    <div className="tk-detail">
      <div className="tk-detail-bar">
        {onClose && (
          <button type="button" className="tk-icon-btn" onClick={onClose} aria-label="Close details">
            <X size={18} />
          </button>
        )}
        <span className="tk-detail-bar-label">{done ? 'Done' : top ? 'Top 3 today' : 'Task'}</span>
        {!done && (
          <button
            type="button"
            className={`tk-icon-btn${top ? ' tk-icon-btn--star' : ''}`}
            aria-pressed={top}
            disabled={!top && topFull}
            title={!top && topFull ? 'Top 3 is full' : top ? 'Remove from Top 3' : 'Add to Top 3'}
            aria-label={top ? 'Remove from Top 3' : 'Add to Top 3'}
            onClick={() => onToggleTop(task)}
          >
            <Star size={18} fill={top ? 'currentColor' : 'none'} />
          </button>
        )}
        <button type="button" className="tk-icon-btn tk-icon-btn--danger" onClick={() => onDelete(task)} aria-label="Delete task">
          <Trash2 size={17} />
        </button>
      </div>

      <textarea
        className="tk-detail-title"
        value={title}
        rows={2}
        maxLength={200}
        aria-label="Task name"
        onChange={(e) => setTitle(e.target.value.replace(/\n/g, ''))}
        onBlur={saveTitle}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
      />

      {!done && (
        <div className="tk-detail-actions">
          <button type="button" className="tk-btn tk-btn--primary" onClick={() => onStartFocus(task)}>
            <Play size={15} fill="currentColor" /> Start focus
          </button>
          <button type="button" className="tk-btn" onClick={() => onComplete(task)}>
            <Check size={16} strokeWidth={2.6} /> Mark done
          </button>
        </div>
      )}

      <section className="tk-field">
        <h4 className="tk-field-label">When</h4>
        {goal ? (
          <p className="tk-field-note"><Target size={13} /> From your goal <strong>{goal.title}</strong> · {TIMEFRAME_LABELS[task.timeFrame] || 'Today'}</p>
        ) : (
          <div className="tk-chips">
            {WHEN_CHIPS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                className={`tk-when${when === value ? ' tk-when--on' : ''}`}
                aria-pressed={when === value}
                disabled={done}
                onClick={() => onMove(value)}
              >
                {label}
                <span className="tk-when-xp">+{XP_BY_TIMEFRAME[value === 'tomorrow' ? 'today' : value]}</span>
              </button>
            ))}
            <label className={`tk-when tk-when--pick${pickedDay ? ' tk-when--on' : ''}${done ? ' tk-when--disabled' : ''}`}>
              <CalendarDays size={12} /> {pickedDay ? dayLabel(pickedDay, today) : 'Pick day'}
              <input
                type="date"
                className="tk-when-date"
                min={today}
                value={pickedDay}
                disabled={done}
                aria-label="Pick a day"
                onClick={openPicker}
                onChange={(e) => e.target.value && onMove(e.target.value)}
              />
            </label>
          </div>
        )}
      </section>

      <section className="tk-field">
        <h4 className="tk-field-label">Deadline</h4>
        <div className="tk-due">
          <input
            type="date"
            className="tk-input"
            value={task.dueDate || ''}
            aria-label="Deadline"
            onChange={(e) => onPatch({ dueDate: e.target.value || null })}
          />
          {task.dueDate && <button type="button" className="tk-pill tk-pill--quiet" onClick={() => onPatch({ dueDate: null })}>Clear</button>}
        </div>
      </section>

      <section className="tk-field">
        <h4 className="tk-field-label">
          Sub-tasks
          {subtasks.length > 0 && <span className="tk-field-count">{subtasks.filter((s) => s.completed).length}/{subtasks.length}</span>}
        </h4>
        {subtasks.length > 0 && (
          <ul className="tk-subs">
            {subtasks.map((sub) => (
              <li key={sub.id} className={`tk-sub${sub.completed ? ' tk-sub--done' : ''}`}>
                <button type="button" className="tk-check tk-check--sm" aria-label={sub.completed ? `Untick ${sub.text}` : `Tick ${sub.text}`} onClick={() => toggleSubtask(sub)}>
                  {sub.completed && <Check size={11} strokeWidth={3} />}
                </button>
                <span className="tk-sub-text">{sub.text}</span>
                <button
                  type="button"
                  className="tk-icon-btn tk-icon-btn--sm"
                  aria-label={`Remove ${sub.text}`}
                  onClick={() => onPatch({ subtasks: subtasks.filter((s) => s.id !== sub.id) })}
                >
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <form className="tk-sub-add" onSubmit={addSubtask}>
          <Plus size={15} aria-hidden="true" />
          <input
            className="tk-sub-input"
            value={newSubtask}
            onChange={(e) => setNewSubtask(e.target.value)}
            placeholder="Break it into a step"
            aria-label="New sub-task"
            enterKeyHint="done"
          />
        </form>
      </section>

      <section className="tk-field">
        <h4 className="tk-field-label">Notes</h4>
        <textarea
          className="tk-input tk-notes"
          value={task.notes || ''}
          rows={3}
          placeholder="Links, details, what done looks like"
          aria-label="Notes"
          onChange={(e) => onPatch({ notes: e.target.value })}
        />
      </section>

      <p className="tk-detail-foot">
        +{task.xp || 0} XP
        {created ? ` · Added ${addedLabel(dateKeyOf(created), today)}` : ''}
      </p>
    </div>
  );
};

export default TaskDetail;
