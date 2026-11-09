import React, { useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { TAGS_PER_TASK, TAG_MAX_LEN, cleanTagName, tagKey } from '../../utils/taskTags';

// Every tag as a toggle, plus a box to make a new one. Used by quick add and the
// task details. No <form>: quick add already is one, and forms can't nest.
const TagPicker = ({ tags, selected, onToggle, onCreate, onManage, autoFocus = false }) => {
  const [draft, setDraft] = useState('');
  const selectedKeys = new Set((selected || []).map(tagKey));
  const full = selectedKeys.size >= TAGS_PER_TASK;
  const name = cleanTagName(draft);
  const existing = name ? tags.find((t) => tagKey(t.name) === name.toLowerCase()) : null;

  const submit = () => {
    if (!name) return;
    if (existing) {
      if (!selectedKeys.has(tagKey(existing.name)) && !full) onToggle(existing.name);
    } else if (!full) {
      onToggle(onCreate(name));
    }
    setDraft('');
  };

  return (
    <div className="tk-tagpick">
      {tags.length > 0 && (
        <div className="tk-tagpick-list" role="group" aria-label="Tags">
          {tags.map((t) => {
            const on = selectedKeys.has(tagKey(t.name));
            return (
              <button
                key={t.name}
                type="button"
                className={`tk-tag-opt${on ? ' tk-tag-opt--on' : ''}`}
                style={{ '--tag': t.color }}
                aria-pressed={on}
                disabled={!on && full}
                onClick={() => onToggle(t.name)}
              >
                {on ? <Check size={12} strokeWidth={3} /> : <span className="tk-tag-dot" aria-hidden="true" />}
                {t.name}
              </button>
            );
          })}
        </div>
      )}
      <div className="tk-tagpick-new">
        <Plus size={14} aria-hidden="true" />
        <input
          className="tk-tagpick-input"
          value={draft}
          maxLength={TAG_MAX_LEN + 1}
          placeholder={full ? `Up to ${TAGS_PER_TASK} tags per task` : tags.length ? 'New tag' : 'Name your first tag, e.g. School'}
          aria-label="New tag name"
          enterKeyHint="done"
          disabled={full}
          autoFocus={autoFocus}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); submit(); } }}
        />
        {name && (
          <button type="button" className="tk-pill tk-pill--accent" onClick={submit}>
            {existing ? 'Use' : 'Create'}
          </button>
        )}
        {onManage && tags.length > 0 && !name && (
          <button type="button" className="tk-link-btn" onClick={onManage}>Edit tags</button>
        )}
      </div>
    </div>
  );
};

export default TagPicker;
