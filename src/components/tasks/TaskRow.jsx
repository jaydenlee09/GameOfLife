import React from 'react';
import { Star, Check, Target, ListChecks, History, ArrowUpRight, CalendarClock } from 'lucide-react';
import { carriedLabel, dueLabel, TIMEFRAME_LABELS, isDayTask } from '../../utils/taskUtils';

// One task. Tapping the circle completes it, the star puts it in the Top 3, and
// anywhere else opens its details. `variant` adds the section's own actions:
//   carried  → Today / Tomorrow / Drop triage under the text
//   ahead    → a "Do today" pill (Upcoming and Later)
const TaskRow = ({
  task, today, variant, pending, selected, goalTitle, showTimeframe, dayHint,
  onComplete, onToggleTop, onSelect, onToday, onTomorrow, onDrop,
}) => {
  const done = task.completed || pending;
  const due = done ? null : dueLabel(task, today);
  const carried = variant === 'carried' ? carriedLabel(task, today) : null;
  const subtasks = task.subtasks || [];
  const subDone = subtasks.filter((s) => s.completed).length;
  const top = task.topDate === today;

  const stop = (fn) => (e) => { e.stopPropagation(); fn?.(task); };

  return (
    <div
      className={`tk-row${selected ? ' tk-row--selected' : ''}${done ? ' tk-row--done' : ''}${top && !done ? ' tk-row--top' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={`${task.text}. Open details`}
      onClick={() => onSelect(task)}
      onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onSelect(task); } }}
    >
      <button
        type="button"
        className="tk-check"
        aria-label={done ? `${task.text} done` : `Complete ${task.text}`}
        disabled={done}
        onClick={stop(onComplete)}
      >
        {done && <Check size={14} strokeWidth={3} />}
      </button>

      <div className="tk-row-body">
        <span className="tk-row-text">{task.text}</span>
        <div className="tk-meta">
          {carried && <span className="tk-chip tk-chip--warning"><History size={11} />{carried}</span>}
          {due && <span className={`tk-chip${due.tone ? ` tk-chip--${due.tone}` : ''}`}><CalendarClock size={11} />{due.text}</span>}
          {dayHint && <span className="tk-chip">{dayHint}</span>}
          {showTimeframe && !isDayTask(task) && <span className="tk-chip">{TIMEFRAME_LABELS[task.timeFrame]}</span>}
          {subtasks.length > 0 && <span className="tk-chip"><ListChecks size={11} />{subDone}/{subtasks.length}</span>}
          {goalTitle && <span className="tk-chip tk-chip--goal"><Target size={11} /><span className="tk-chip-clip">{goalTitle}</span></span>}
        </div>
      </div>

      <div className="tk-row-side">
        {variant === 'ahead' && !done && (
          <button type="button" className="tk-pill tk-pill--accent" onClick={stop(onToday)} aria-label={`Do ${task.text} today`}>
            <ArrowUpRight size={13} /> Today
          </button>
        )}
        {!done && (
          <button
            type="button"
            className={`tk-star${top ? ' tk-star--on' : ''}`}
            aria-pressed={top}
            aria-label={top ? `Remove ${task.text} from Top 3` : `Add ${task.text} to Top 3`}
            onClick={stop(onToggleTop)}
          >
            <Star size={18} strokeWidth={2.2} fill={top ? 'currentColor' : 'none'} />
          </button>
        )}
      </div>

      {variant === 'carried' && !done && (
        <div className="tk-triage">
          <button type="button" className="tk-pill" onClick={stop(onToday)} aria-label={`Keep ${task.text} for today`}>Today</button>
          <button type="button" className="tk-pill" onClick={stop(onTomorrow)} aria-label={`Move ${task.text} to tomorrow`}>Tomorrow</button>
          <button type="button" className="tk-pill tk-pill--quiet" onClick={stop(onDrop)} aria-label={`Drop ${task.text}`}>Drop</button>
        </div>
      )}
    </div>
  );
};

export default TaskRow;
