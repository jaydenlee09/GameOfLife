import { useEffect, useState } from 'react';
import { CalendarPlus, ChevronDown, ChevronUp, GripVertical, Star } from 'lucide-react';
import { getUnscheduledTasks } from '../../utils/taskUtils';
import './TaskTray.css';

/**
 * "Needs a time slot": today's open tasks that have no block yet, Top 3 first.
 * Drag one onto the grid (desktop) or tap Schedule to drop it into the next free
 * hour. `variant` is 'sidebar' (desktop column) or 'row' (phones, under the strip).
 */
export default function TaskTray({ todos, calendarEvents, todayKey, onDragStart, onDragEnd, onSchedule, variant = 'sidebar' }) {
  const [showAll, setShowAll] = useState(false);
  const [note, setNote] = useState(null);
  useEffect(() => {
    if (!note) return undefined;
    const id = setTimeout(() => setNote(null), 4000);
    return () => clearTimeout(id);
  }, [note]);
  const { top, rest } = getUnscheduledTasks(todos, calendarEvents, todayKey);
  const primary = top.length ? top : rest.slice(0, 3);
  const extra = top.length ? rest : rest.slice(3);
  const shown = showAll ? [...primary, ...extra] : primary;

  if (!primary.length) {
    return variant === 'sidebar'
      ? <p className="ctt-empty">Every task for today has a time slot.</p>
      : null;
  }

  const schedule = (task) => setNote(onSchedule(task));

  return (
    <div className={`ctt ctt--${variant}`}>
      {variant === 'row' && <span className="ctt-row-label">Needs a time slot</span>}
      <ul className="ctt-list">
        {shown.map((task) => {
          const isTop = top.includes(task);
          return (
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
              <button type="button" className="ctt-schedule" onClick={() => schedule(task)} aria-label={`Schedule ${task.text}`}>
                <CalendarPlus size={12} /> <span className="ctt-schedule-label">Schedule</span>
              </button>
            </li>
          );
        })}
      </ul>
      {extra.length > 0 && (
        <button type="button" className="ctt-more" onClick={() => setShowAll((v) => !v)}>
          {showAll ? <><ChevronUp size={12} /> Show less</> : <><ChevronDown size={12} /> +{extra.length} more today</>}
        </button>
      )}
      {note && <p className={`ctt-note${note.ok ? '' : ' ctt-note--warn'}`} role="status">{note.text}</p>}
    </div>
  );
}
