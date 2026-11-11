import { useEffect, useState } from 'react';
import { CalendarCheck, CalendarPlus, ChevronDown, ChevronUp, GripVertical, Star } from 'lucide-react';
import { dayLabel, getWeekTasks } from '../../utils/taskUtils';
import { blockRange } from '../../utils/calendarUtils';
import './TaskTray.css';

const WEEK_PREVIEW = 4; // later-this-week tasks shown before "+N more"

/**
 * The Calendar's task list. `variant` 'sidebar' (desktop column, "My tasks"): every
 * open task this week, today first (Top 3 starred), then the next six days by day.
 * Tasks already in a block show when; the rest can be dragged onto empty grid space
 * (a new block) or onto an existing block (added to its task list), or scheduled
 * into the first free hour of their day. 'row' (phones, under the strip): only
 * today's tasks that still need a time slot.
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
  const all = getWeekTasks(todos, calendarEvents, todayKey);
  const keep = variant === 'row' ? (list) => list.filter((e) => !e.block) : (list) => list;
  const top = keep(all.top);
  const rest = keep(all.rest);
  const primary = top.length ? top : rest.slice(0, 3);
  const extra = top.length ? rest : rest.slice(3);
  const shown = showAll ? [...primary, ...extra] : primary;
  const week = variant === 'sidebar' ? all.upcoming : [];
  const weekCount = week.reduce((n, day) => n + day.tasks.length, 0);
  // The week ahead stays short until asked for: whole days, until WEEK_PREVIEW tasks are showing.
  const preview = week.reduce((acc, day) => (
    acc.count >= WEEK_PREVIEW ? acc : { days: [...acc.days, day], count: acc.count + day.tasks.length }
  ), { days: [], count: 0 });
  const weekHidden = weekCount - preview.count;
  const weekShown = showWeek ? week : preview.days;

  if (!primary.length && !weekCount) {
    return variant === 'sidebar'
      ? <p className="ctt-empty">No open tasks this week.</p>
      : null;
  }
  if (!primary.length && variant === 'row') return null;

  const schedule = (task, dateKey) => setNote(onSchedule(task, dateKey));

  const renderItem = ({ task, block }, dateKey, isTop = false) => {
    if (block) {
      const when = `${block._instanceDate !== dateKey ? `${dayLabel(block._instanceDate, todayKey)} ` : ''}${blockRange(block)}`;
      return (
        <li key={task.id} className={`ctt-item ctt-item--placed${isTop ? ' ctt-item--top' : ''}`} title={`In "${block.title}", ${when}`}>
          <CalendarCheck size={12} className="ctt-placed-icon" aria-hidden="true" />
          {isTop && <Star size={11} className="ctt-star" aria-label="Top 3" />}
          <span className="ctt-main">
            <span className="ctt-text">{task.text}</span>
            <span className="ctt-sub">{when} · {block.title}</span>
          </span>
        </li>
      );
    }
    return (
      <li
        key={task.id}
        className={`ctt-item${isTop ? ' ctt-item--top' : ''}`}
        draggable
        onDragStart={(e) => { e.dataTransfer.effectAllowed = 'copy'; onDragStart(task); }}
        onDragEnd={onDragEnd}
        title="Drag onto a block or an empty slot, or tap Schedule"
      >
        <GripVertical size={12} className="ctt-grip" aria-hidden="true" />
        {isTop && <Star size={11} className="ctt-star" aria-label="Top 3" />}
        <span className="ctt-text">{task.text}</span>
        <button type="button" className="ctt-schedule" onClick={() => schedule(task, dateKey)} aria-label={`Schedule ${task.text}`}>
          <CalendarPlus size={12} /> <span className="ctt-schedule-label">Schedule</span>
        </button>
      </li>
    );
  };

  return (
    <div className={`ctt ctt--${variant}`}>
      {variant === 'row' && <span className="ctt-row-label">Needs a time slot</span>}
      {week.length > 0 && <span className="ctt-day">Today</span>}
      {primary.length ? (
        <ul className="ctt-list">
          {shown.map((entry) => renderItem(entry, todayKey, top.includes(entry)))}
        </ul>
      ) : (
        <p className="ctt-empty">No open tasks today.</p>
      )}
      {extra.length > 0 && (
        <button type="button" className="ctt-more" onClick={() => setShowAll((v) => !v)}>
          {showAll ? <><ChevronUp size={12} /> Show less</> : <><ChevronDown size={12} /> +{extra.length} more today</>}
        </button>
      )}
      {weekShown.map((day) => (
        <div key={day.dateKey} className="ctt-group">
          <span className="ctt-day">{dayLabel(day.dateKey, todayKey)}</span>
          <ul className="ctt-list">{day.tasks.map((entry) => renderItem(entry, day.dateKey))}</ul>
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
