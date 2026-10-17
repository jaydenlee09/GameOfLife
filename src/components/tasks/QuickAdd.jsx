import React, { useState } from 'react';
import { Plus, Star, CalendarDays, ArrowUp } from 'lucide-react';
import STAT_META from '../statMeta';
import { dayLabel } from '../../utils/taskUtils';

const WHEN_CHIPS = [
  { value: 'today', label: 'Today' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'pick', label: 'Pick day' },
  { value: 'this-week', label: 'This week' },
  { value: 'this-month', label: 'This month' },
  { value: 'this-year', label: 'This year' },
];

const LAST_STAT_KEY = 'gameOfLife_tasksLastStat';
const readLastStat = () => {
  try {
    const v = localStorage.getItem(LAST_STAT_KEY);
    return v && STAT_META[v] ? v : 'discipline';
  } catch { return 'discipline'; }
};

// Type, press Enter, done. Everything else is optional and remembered between
// adds (so a run of "today" tasks is just typing), except the star.
const QuickAdd = ({ today, defaultWhen, topFull, onAdd, inputRef }) => {
  const [text, setText] = useState('');
  const [when, setWhen] = useState(defaultWhen);
  const [pickedDay, setPickedDay] = useState('');
  const [top, setTop] = useState(false);
  const [stat, setStat] = useState(readLastStat);
  const [lastDefault, setLastDefault] = useState(defaultWhen);

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
    onAdd({ text: trimmed, when: resolvedWhen, categories: [stat], top: top && canStar });
    setText('');
    setTop(false);
  };

  const chooseStat = (value) => {
    setStat(value);
    try { localStorage.setItem(LAST_STAT_KEY, value); } catch { /* private mode */ }
  };

  // The chip only switches to "pick" once a day is actually chosen. Desktop
  // browsers only open the calendar from its icon, so ask for it on any click.
  const openPicker = (e) => {
    try { e.currentTarget.showPicker(); } catch { /* opens natively (iOS) */ }
  };

  const StatIcon = STAT_META[stat]?.Icon;

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

        <label className="tk-when tk-when--stat" style={{ color: STAT_META[stat]?.color }}>
          {StatIcon && <StatIcon size={12} strokeWidth={2.4} />}
          <select value={stat} onChange={(e) => chooseStat(e.target.value)} aria-label="Stat this task trains">
            {Object.entries(STAT_META).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}
          </select>
        </label>
      </div>
    </form>
  );
};

export default QuickAdd;
