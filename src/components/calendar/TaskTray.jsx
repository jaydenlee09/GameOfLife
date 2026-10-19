import { useEffect, useState } from 'react';
import { CalendarPlus, ChevronDown, ChevronUp, GripVertical, Star } from 'lucide-react';
import { dayLabel, getUnscheduledTasks } from '../../utils/taskUtils';
import './TaskTray.css';

const WEEK_PREVIEW = 4; // later-this-week tasks shown before "+N more"

/**
 * "Needs a time slot": this week's open tasks that have no block yet, Top 3 first.
 * Drag one onto the grid (desktop) or tap Schedule to drop it into the first free
 * hour of its own day. `variant` is 'sidebar' (desktop column: today, then the next
 * six days by day) or 'row' (phones, under the strip: today only).
 */
export default function TaskTray({ todos, calendarEvents, todayKey, onDragStart, onDragEnd, onSchedule, variant = 'sidebar' }) {
  const [showAll, setShowAll] = useState(false);
  const [showWeek, setShowWeek] = useState(false);
  const [note, setNote] = useState(null);
  useEffect(() => {
    if (!note) return undefined;
    const id = setTimeout(() => setNote(null), 4000);
    return () => clearTimeout(id);
  }, [note]);
  const { top, rest, upcoming } = getUnscheduledTasks(todos, calendarEvents, todayKey);
  const primary = top.length ? top : rest.slice(0, 3);
  const extra = top.length ? rest : rest.slice(3);
  const shown = showAll ? [...primary, ...extra] : primary;
  const week = variant === 'sidebar' ? upcoming : [];
  const weekCount = week.reduce((n, day) => n + day.tasks.length, 0);
  // The week ahead stays short until asked for: whole days, until WEEK_PREVIEW tasks are showing.
  const preview = week.reduce((acc, day) => (
    acc.count >= WEEK_PREVIEW ? acc : { days: [...acc.days, day], count: acc.count + day.tasks.length }
  ), { days: [], count: 0 });
  const weekHidden = weekCount - preview.count;
  const weekShown = showWeek ? week : preview.days;

  if (!primary.length && !weekCount) {
    return variant === 'sidebar'
      ? <p className="ctt-empty">Every task this week has a time slot.</p>
      : null;
  }
  if (!primary.length && variant === 'row') return null;

  const schedule = (task, dateKey) => setNote(onSchedule(task, dateKey));

  const renderItem = (task, dateKey, isTop = false) => (
    <li
      key={task.id}
      className={`ctt-item${isTop ? ' ctt-item--top' : ''}`}
      draggable
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'copy'; onDragStart(task); }}
      onDragEnd={onDragEnd}
      title="Drag onto the calendar, or tap Schedule"
    >
      <GripVertical size={12} className="ctt-grip" aria-hidden="true" />
      {isTop && <Star size={11} className="ctt-star" aria-label="Top 3" />}
      <span className="ctt-text">{task.text}</span>
      <button type="button" className="ctt-schedule" onClick={() => schedule(task, dateKey)} aria-label={`Schedule ${task.text}`}>
        <CalendarPlus size={12} /> <span className="ctt-schedule-label">Schedule</span>
      </button>
    </li>
  );

  return (
    <div className={`ctt ctt--${variant}`}>
      {variant === 'row' && <span className="ctt-row-label">Needs a time slot</span>}
      {week.length > 0 && <span className="ctt-day">Today</span>}
      {primary.length ? (
        <ul className="ctt-list">
          {shown.map((task) => renderItem(task, todayKey, top.includes(task)))}
        </ul>
      ) : (
        <p className="ctt-empty">Every task for today has a time slot.</p>
      )}
      {extra.length > 0 && (
        <button type="button" className="ctt-more" onClick={() => setShowAll((v) => !v)}>
          {showAll ? <><ChevronUp size={12} /> Show less</> : <><ChevronDown size={12} /> +{extra.length} more today</>}
        </button>
      )}
      {weekShown.map((day) => (
        <div key={day.dateKey} className="ctt-group">
          <span className="ctt-day">{dayLabel(day.dateKey, todayKey)}</span>
          <ul className="ctt-list">{day.tasks.map((task) => renderItem(task, day.dateKey))}</ul>
        </div>
      ))}
      {weekHidden > 0 && (
        <button type="button" className="ctt-more" onClick={() => setShowWeek((v) => !v)}>
          {showWeek ? <><ChevronUp size={12} /> Show less</> : <><ChevronDown size={12} /> +{weekHidden} more this week</>}
        </button>
      )}
      {note && <p className={`ctt-note${note.ok ? '' : ' ctt-note--warn'}`} role="status">{note.text}</p>}
    </div>
  );
}
