import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Search, CalendarPlus, Play, Sparkles, Moon, CornerDownLeft } from 'lucide-react';
import { altKeyFor, ALT_KEY_LABEL } from '../utils/navUtils';
import './CommandPalette.css';

// Things you do, not places you go. `run` gets the App-level commands + navigate.
const ACTIONS = [
  { id: 'plan',      label: 'Plan my day',       icon: <CalendarPlus size={16} />, keywords: 'schedule time block calendar today',  run: (c) => c.planDay() },
  { id: 'focus',     label: 'Start focus',       icon: <Play size={16} />,         keywords: 'timer pomodoro deep work session',    shortcut: 'F', run: (c) => c.startFocus() },
  { id: 'assistant', label: 'Open My Assistant', icon: <Sparkles size={16} />,     keywords: 'ai chat help mentor',                 shortcut: 'M', run: (c) => c.openAssistant() },
  { id: 'close-day', label: 'Close the day',     icon: <Moon size={16} />,         keywords: 'daily log evening review reflect',    run: (c, navigate) => navigate('daily-log') },
];

/** Every word of the query appears somewhere in the label or keywords. */
const matches = (item, words) => {
  const haystack = `${item.label} ${item.keywords || ''}`.toLowerCase();
  return words.every((w) => haystack.includes(w));
};

/**
 * ⌘K: jump to a page, run an action, or — when nothing fits — ask My Assistant.
 * Mounted only while open, so the query starts empty every time.
 */
export default function CommandPalette({ links, onClose, onNavigate, commands }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const listRef = useRef(null);

  const pages = useMemo(() => links.map((link) => ({
    id: `page-${link.id}`,
    label: link.label,
    icon: link.icon,
    keywords: `page go ${link.id.replace('-', ' ')}`,
    shortcut: altKeyFor(link.id)?.toUpperCase(),
    run: (c, navigate) => navigate(link.id),
  })), [links]);

  const text = query.trim();
  const sections = useMemo(() => {
    if (!text) return [{ title: 'Actions', items: ACTIONS }, { title: 'Pages', items: pages }];
    const words = text.toLowerCase().split(/\s+/);
    const found = [...ACTIONS, ...pages].filter((item) => matches(item, words));
    // Labels that start with what you typed come first.
    found.sort((a, b) => Number(!a.label.toLowerCase().startsWith(words[0])) - Number(!b.label.toLowerCase().startsWith(words[0])));
    const ask = { id: 'ask', label: 'Ask My Assistant', detail: `“${text}”`, icon: <Sparkles size={16} />, run: (c) => c.ask(text) };
    return [
      ...(found.length ? [{ title: 'Results', items: found.slice(0, 7) }] : []),
      { title: 'Ask', items: [ask] },
    ];
  }, [text, pages]);

  const items = sections.flatMap((s) => s.items.map((item) => ({ ...item, section: s.title })));
  const active = Math.min(selected, items.length - 1);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  // Give focus back to wherever it was (e.g. a sidebar button) on close.
  useEffect(() => {
    const previous = document.activeElement;
    return () => previous?.focus?.({ preventScroll: true });
  }, []);

  const run = (item) => {
    onClose();
    item.run(commands, onNavigate);
  };

  const onKeyDown = (e) => {
    const n = items.length;
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected((s) => (Math.min(s, n - 1) + 1) % n); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelected((s) => (Math.min(s, n - 1) - 1 + n) % n); }
    else if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); if (items[active]) run(items[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  return (
    <div className="cmdk-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cmdk" role="dialog" aria-modal="true" aria-label="Search or ask">
        <div className="cmdk-input-row">
          <Search size={16} className="cmdk-input-icon" />
          <input
            className="cmdk-input"
            autoFocus
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelected(0); }}
            onKeyDown={onKeyDown}
            placeholder="Jump to a page, or ask anything…"
            aria-label="Search or ask"
            aria-controls="cmdk-list"
            aria-activedescendant={items[active] ? `cmdk-${items[active].id}` : undefined}
            role="combobox"
            aria-expanded="true"
            spellCheck={false}
            autoComplete="off"
          />
          <kbd className="cmdk-kbd">esc</kbd>
        </div>

        <div className="cmdk-list" id="cmdk-list" role="listbox" ref={listRef}>
          {items.map((item, i) => {
            const isActive = i === active;
            return (
              <Fragment key={item.id}>
                {(i === 0 || items[i - 1].section !== item.section) && (
                  <div className="cmdk-section-title">{item.section}</div>
                )}
                <button
                  id={`cmdk-${item.id}`}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  data-active={isActive}
                  className={`cmdk-item${item.id === 'ask' ? ' cmdk-item--ask' : ''}`}
                  onMouseMove={() => { if (!isActive) setSelected(i); }}
                  onClick={() => run(item)}
                  tabIndex={-1}
                >
                  <span className="cmdk-item-icon">{item.icon}</span>
                  <span className="cmdk-item-label">{item.label}</span>
                  {item.detail && <span className="cmdk-item-detail">{item.detail}</span>}
                  {item.shortcut && <kbd className="cmdk-kbd cmdk-item-kbd">{ALT_KEY_LABEL}{item.shortcut}</kbd>}
                  {isActive && <CornerDownLeft size={13} className="cmdk-item-enter" />}
                </button>
              </Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}
