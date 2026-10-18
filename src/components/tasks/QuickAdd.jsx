import React, { useState } from 'react';
import { Plus, Star, CalendarDays, ArrowUp, Target } from 'lucide-react';
import { dayLabel } from '../../utils/taskUtils';

const WHEN_CHIPS = [
  { value: 'today', label: 'Today' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'pick', label: 'Pick day' },
  { value: 'this-week', label: 'This week' },
  { value: 'this-month', label: 'This month' },
  { value: 'this-year', label: 'This year' },
];

// Type, press Enter, done. Everything else is optional and remembered between
// adds (so a run of "today" tasks is just typing), except the star. The goal
// chip links the task to a goal, so finishing it counts as progress there.
const QuickAdd = ({ today, defaultWhen, topFull, goals = [], onAdd, inputRef }) => {
  const [text, setText] = useState('');
  const [when, setWhen] = useState(defaultWhen);
  const [pickedDay, setPickedDay] = useState('');
  const [top, setTop] = useState(false);
  const [lastDefault, setLastDefault] = useState(defaultWhen);
  const [goalId, setGoalId] = useState('');
  const goal = goals.find((g) => String(g.id) === goalId) || null;

  // Switching tabs re-aims the default (Upcoming → Tomorrow, Later → This week).
  if (defaultWhen !== lastDefault) {
    setLastDefault(defaultWhen);
    setWhen(defaultWhen);
  }

  const resolvedWhen = when === 'pick' ? pickedDay : when;
  const isFutureDay = when === 'tomorrow' || (when === 'pick' && pickedDay > today);
  const canStar = !isFutureDay && !topFull;

  const submit = (e) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onAdd({ text: trimmed, when: resolvedWhen, top: top && canStar, goalId: goal ? goal.id : null });
    setText('');
    setTop(false);
  };

  // The chip only switches to "pick" once a day is actually chosen. Desktop
  // browsers only open the calendar from its icon, so ask for it on any click.
  const openPicker = (e) => {
    try { e.currentTarget.showPicker(); } catch { /* opens natively (iOS) */ }
  };

  return (
    <form className="tk-add" onSubmit={submit}>
      <div className="tk-add-row">
        <Plus size={18} className="tk-add-plus" aria-hidden="true" />
        <input
          ref={inputRef}
          className="tk-add-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a task, press Enter"
          aria-label="New task"
          enterKeyHint="done"
          maxLength={200}
        />
        <button type="submit" className="tk-add-submit" disabled={!text.trim()} aria-label="Add task">
          <ArrowUp size={16} strokeWidth={2.6} />
        </button>
      </div>

      <div className="tk-add-opts" role="group" aria-label="When">
        {WHEN_CHIPS.map(({ value, label }) => (value === 'pick' ? (
          <label key={value} className={`tk-when tk-when--pick${when === 'pick' ? ' tk-when--on' : ''}`}>
            <CalendarDays size={12} /> {when === 'pick' && pickedDay ? dayLabel(pickedDay, today) : label}
            <input
              type="date"
              className="tk-when-date"
              min={today}
              value={pickedDay}
              aria-label="Pick a day"
              onClick={openPicker}
              onChange={(e) => { setPickedDay(e.target.value); setWhen(e.target.value ? 'pick' : 'today'); }}
            />
          </label>
        ) : (
          <button
            key={value}
            type="button"
            className={`tk-when${when === value ? ' tk-when--on' : ''}`}
            aria-pressed={when === value}
            onClick={() => setWhen(value)}
          >
            {label}
          </button>
        )))}

        <span className="tk-add-sep" aria-hidden="true" />

        <button
          type="button"
          className={`tk-when tk-when--star${top && canStar ? ' tk-when--on' : ''}`}
          aria-pressed={top && canStar}
          disabled={!canStar}
          title={topFull ? 'Top 3 is full' : isFutureDay ? 'Top 3 is for today' : 'Add to Top 3'}
          onClick={() => setTop((v) => !v)}
        >
          <Star size={12} fill={top && canStar ? 'currentColor' : 'none'} /> Top 3
        </button>

        {goals.length > 0 && (
          <label className={`tk-when tk-when--goal${goal ? ' tk-when--on' : ''}`} title={goal ? `For ${goal.title}` : 'Link to a goal'}>
            <Target size={12} /> <span className="tk-chip-clip">{goal ? goal.title : 'Goal'}</span>
            <select
              className="tk-when-date"
              value={goal ? goalId : ''}
              aria-label="Goal this task moves forward"
              onChange={(e) => setGoalId(e.target.value)}
            >
              <option value="">No goal</option>
              {goals.map((g) => <option key={g.id} value={String(g.id)}>{g.title}</option>)}
            </select>
          </label>
        )}
      </div>
    </form>
  );
};

export default QuickAdd;
