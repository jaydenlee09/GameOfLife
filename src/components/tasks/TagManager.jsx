import React, { useEffect, useState } from 'react';
import { Plus, Trash2, X, Tag } from 'lucide-react';
import { COLOR_SWATCHES } from '../../utils/blockCategories';
import { TAG_MAX_LEN, cleanTagName, tagKey } from '../../utils/taskTags';

const TagRow = ({ tag, open, onOpen, onRename, onRecolor, onDelete }) => {
  const [name, setName] = useState(tag.name);
  const [lastName, setLastName] = useState(tag.name);
  if (tag.name !== lastName) { setLastName(tag.name); setName(tag.name); }

  const save = () => {
    const clean = cleanTagName(name);
    if (!clean) { setName(tag.name); return; }
    if (clean !== tag.name) onRename(tag.name, clean);
  };
  const isOther = !COLOR_SWATCHES.some((c) => c.toLowerCase() === tag.color.toLowerCase());

  return (
    <li className="tk-tagman-row">
      <div className="tk-tagman-main">
        <button
          type="button"
          className="tk-tagman-color"
          style={{ background: tag.color }}
          aria-expanded={open}
          aria-label={`Change ${tag.name} color`}
          onClick={onOpen}
        />
        <input
          className="tk-input tk-tagman-name"
          value={name}
          maxLength={TAG_MAX_LEN + 1}
          aria-label={`Rename ${tag.name}`}
          onChange={(e) => setName(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
        />
        <span className="tk-tagman-count">{tag.count ? `${tag.count} open` : 'unused'}</span>
        <button type="button" className="tk-icon-btn tk-icon-btn--danger" aria-label={`Delete ${tag.name}`} onClick={() => onDelete(tag.name)}>
          <Trash2 size={16} />
        </button>
      </div>
      {open && (
        <div className="tk-swatches" role="group" aria-label={`${tag.name} color`}>
          {COLOR_SWATCHES.map((c) => {
            const on = c.toLowerCase() === tag.color.toLowerCase();
            return (
              <button
                key={c}
                type="button"
                className={`tk-swatch${on ? ' tk-swatch--on' : ''}`}
                style={{ background: c }}
                aria-label={`${tag.name} ${c}`}
                aria-pressed={on}
                onClick={() => onRecolor(tag.name, c)}
              />
            );
          })}
          <label className={`tk-swatch tk-swatch--any${isOther ? ' tk-swatch--on' : ''}`} style={isOther ? { background: tag.color } : undefined} title="Any color">
            {!isOther && <Plus size={12} strokeWidth={3} />}
            <input type="color" value={tag.color} aria-label={`${tag.name}: any color`} onChange={(e) => onRecolor(tag.name, e.target.value)} />
          </label>
        </div>
      )}
    </li>
  );
};

// Rename, recolor, delete and add tags. Changes apply as you go.
const TagManager = ({ tags, onCreate, onRename, onRecolor, onDelete, onClose }) => {
  const [openKey, setOpenKey] = useState(null);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const add = (e) => {
    e.preventDefault();
    const name = cleanTagName(draft);
    if (!name) return;
    const made = onCreate(name);
    setOpenKey(tagKey(made));
    setDraft('');
  };

  return (
    <div className="tk-modal-wrap" role="dialog" aria-modal="true" aria-label="Edit tags">
      <div className="tk-sheet-backdrop" onClick={onClose} />
      <div className="tk-modal">
        <div className="tk-detail-bar">
          <span className="tk-detail-bar-label"><Tag size={13} /> Tags</span>
          <button type="button" className="tk-icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <p className="tk-field-note">Tap a color dot to change it. Renaming or deleting a tag updates every task that has it.</p>

        {tags.length > 0 ? (
          <ul className="tk-tagman-list">
            {tags.map((t) => (
              <TagRow
                key={tagKey(t.name)}
                tag={t}
                open={openKey === tagKey(t.name)}
                onOpen={() => setOpenKey((k) => (k === tagKey(t.name) ? null : tagKey(t.name)))}
                onRename={(from, to) => { onRename(from, to); if (openKey === tagKey(from)) setOpenKey(tagKey(to)); }}
                onRecolor={onRecolor}
                onDelete={onDelete}
              />
            ))}
          </ul>
        ) : (
          <p className="tk-glance-empty">No tags yet.</p>
        )}

        <form className="tk-sub-add" onSubmit={add}>
          <Plus size={15} aria-hidden="true" />
          <input
            className="tk-sub-input"
            value={draft}
            maxLength={TAG_MAX_LEN + 1}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="New tag"
            aria-label="New tag name"
            enterKeyHint="done"
          />
        </form>
      </div>
    </div>
  );
};

export default TagManager;
