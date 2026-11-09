import React, { useState } from 'react';
import { Plus, Star, CalendarDays, ArrowUp, Target, Tag } from 'lucide-react';
import { dayLabel } from '../../utils/taskUtils';
import { tagKey, toggleTagIn } from '../../utils/taskTags';
import TagPicker from './TagPicker';

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
// Tags are remembered between adds too; filtering the page by a tag pre-picks it,
// so a new task doesn't vanish from the filtered list.
const QuickAdd = ({
  today, defaultWhen, topFull, goals = [], onAdd, inputRef, tagList, tagColorOf, filterTag = null, onCreateTag, onManageTags,
}) => {
  const [pickedTags, setPickedTags] = useState(() => (filterTag ? [filterTag] : []));
  const [lastFilter, setLastFilter] = useState(filterTag);
  const [tagsOpen, setTagsOpen] = useState(false);
  if (filterTag !== lastFilter) {
    setLastFilter(filterTag);
    setPickedTags(filterTag ? [filterTag] : []);
  }
  // A tag deleted elsewhere drops out of the picked list.
  const liveTags = tagList ? pickedTags.filter((n) => tagList.some((t) => tagKey(t.name) === tagKey(n))) : [];
  if (liveTags.length !== pickedTags.length) setPickedTags(liveTags);
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
    onAdd({ text: trimmed, when: resolvedWhen, top: top && canStar, goalId: goal ? goal.id : null, tags: pickedTags });
    setTagsOpen(false);
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

        {tagList && (
          <button
            type="button"
            className={`tk-when tk-when--tag${pickedTags.length ? ' tk-when--on' : ''}`}
            style={pickedTags.length ? { '--tag': tagColorOf(pickedTags[0]) } : undefined}
            aria-expanded={tagsOpen}
            title={pickedTags.length ? `Tags: ${pickedTags.join(', ')}` : 'Add tags'}
            onClick={() => setTagsOpen((o) => !o)}
          >
            {pickedTags.length ? <span className="tk-tag-dot" aria-hidden="true" /> : <Tag size={12} />}
            <span className="tk-chip-clip">{pickedTags.length ? pickedTags[0] : 'Tag'}</span>
            {pickedTags.length > 1 && <span>+{pickedTags.length - 1}</span>}
          </button>
        )}

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

      {tagList && tagsOpen && (
        <div className="tk-add-tags">
          <TagPicker
            tags={tagList}
            selected={pickedTags}
            onToggle={(name) => setPickedTags((prev) => toggleTagIn(prev, name))}
            onCreate={onCreateTag}
            onManage={onManageTags}
            autoFocus={tagList.length === 0}
          />
        </div>
      )}
    </form>
  );
};

export default QuickAdd;
