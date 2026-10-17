import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ChevronLeft, ChevronRight, X, Trophy, CheckSquare, MessageCircle,
  TrendingUp, Lightbulb, PenLine, Target, Moon,
} from 'lucide-react';
import './DailyLogPage.css';
import EMOTIONS from '../utils/logMeta';
import flameIcon from '../assets/flame_icon.png';
import STAT_META from './statMeta';
import {
  habitDateStr,
  getHabitAttrs,
  getHabitStreak,
  getHabitBestStreak,
  getHabitTotalCompletions,
  getHabitCompletionsInLastNDays,
} from '../utils/habitUtils';
import { entryHasContent } from '../utils/logReview';
import { scoreColor } from '../utils/scoreUtils';
import { getLessons } from '../utils/closeDay';
import CloseDayFlow from './dailyLog/CloseDayFlow';
import LogReviewSection from './dailyLog/LogReview';

// ─── Emotion Trend Chart ───────────────────────────────────────────────────────
const EmotionTrend = ({ logs }) => {
  const counts = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const map = {};
    for (const [dateKey, entry] of Object.entries(logs)) {
      if (new Date(dateKey + 'T00:00:00') < cutoff) continue;
      for (const eid of (entry.emotions || [])) {
        map[eid] = (map[eid] || 0) + 1;
      }
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [logs]);

  if (counts.length === 0) return null;
  const max = counts[0][1];

  return (
    <div className="emotion-trend">
      <span className="emotion-trend-title">30-Day Mood</span>
      {counts.map(([eid, count]) => {
        const em = EMOTIONS.find(e => e.id === eid);
        if (!em) return null;
        return (
          <div key={eid} className="emotion-trend-row">
            <span className="emotion-trend-emoji"><em.Icon size={14} /></span>
            <div className="emotion-trend-bar-bg">
              <div className="emotion-trend-bar-fill" style={{ width: `${(count / max) * 100}%`, background: em.color || 'var(--accent)' }} />
            </div>
            <span className="emotion-trend-count">{count}</span>
          </div>
        );
      })}
    </div>
  );
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getTodayKey = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const getTomorrowKey = () => {
  const now = new Date();
  now.setDate(now.getDate() + 1);
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const formatDisplayDate = (dateKey) => {
  // dateKey: 'YYYY-MM-DD'
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

const formatShortDate = (dateKey) => {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const EMPTY_ENTRY = () => ({
  emotions: [],
  proud: ['', '', ''],
  improve: ['', '', ''],
  learned: '',
  notes: '',
  commitment: '',
});

// ─── Habit Detail Modal ────────────────────────────────────────────────────────

// Calendar cells for a month, Monday-first, with leading blanks so weekdays line up.
const getMonthGridCells = (year, month) => {
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingBlanks = (first.getDay() + 6) % 7;
  const cells = new Array(leadingBlanks).fill(null);
  for (let i = 1; i <= daysInMonth; i++) cells.push(new Date(year, month, i));
  return cells;
};

const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const HabitDetailModal = ({ habit, onToggleDay, onClose }) => {
  const [monthOffset, setMonthOffset] = useState(0);

  const now = new Date();
  const todayKey = habitDateStr(now);
  const viewDate = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const cells = useMemo(
    () => getMonthGridCells(viewDate.getFullYear(), viewDate.getMonth()),
    [viewDate.getFullYear(), viewDate.getMonth()]
  );
  const monthLabel = viewDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const attrs = getHabitAttrs(habit);
  const doneToday = !!habit.history?.[todayKey];
  const stats = [
    { icon: <img src={flameIcon} alt="" className="hdm-stat-flame" />, value: getHabitStreak(habit), label: 'Streak' },
    { icon: <Trophy size={16} />, value: getHabitBestStreak(habit), label: 'Best' },
    { icon: <CheckSquare size={16} />, value: getHabitTotalCompletions(habit), label: 'Total' },
    { icon: null, value: doneToday ? 'Done' : 'Not yet', label: 'Today' },
    { icon: null, value: `${getHabitCompletionsInLastNDays(habit, 7)}/7`, label: 'Past week' },
    { icon: null, value: getHabitCompletionsInLastNDays(habit, 365), label: 'Past year' },
  ];

  return (
    <div className="hdm-overlay" onClick={onClose}>
      <div className="hdm-modal" onClick={e => e.stopPropagation()}>
        <div className="hdm-header">
          <div className="hdm-header-text">
            <h3 className="hdm-title">{habit.name}</h3>
            <div className="hdm-attrs">
              {attrs.map(a => (
                <span
                  key={a}
                  className="hdm-attr-badge"
                  style={{
                    color: STAT_META[a]?.color ?? '#555',
                    borderColor: `${STAT_META[a]?.color ?? '#555'}55`,
                    background: `${STAT_META[a]?.color ?? '#555'}18`,
                  }}
                >{STAT_META[a]?.label ?? a}</span>
              ))}
            </div>
          </div>
          <button className="hdm-close-btn" onClick={onClose} aria-label="Close habit details">
            <X size={18} />
          </button>
        </div>

        <div className="hdm-stats-grid">
          {stats.map((s, i) => (
            <div key={i} className="hdm-stat">
              {s.icon && <span className="hdm-stat-icon">{s.icon}</span>}
              <span className="hdm-stat-value">{s.value}</span>
              <span className="hdm-stat-label">{s.label}</span>
            </div>
          ))}
        </div>

        <div className="hdm-graph">
          <div className="hdm-graph-nav">
            <button type="button" className="hdm-nav-btn" onClick={() => setMonthOffset(o => o - 1)} aria-label="Previous month">‹</button>
            <span className="hdm-graph-label">{monthLabel}</span>
            <button
              type="button"
              className="hdm-nav-btn"
              onClick={() => setMonthOffset(o => Math.min(0, o + 1))}
              aria-label="Next month"
              disabled={monthOffset >= 0}
            >›</button>
          </div>
          <div className="hdm-weekday-row">
            {WEEKDAY_LETTERS.map((l, i) => <span key={i} className="hdm-weekday-cell">{l}</span>)}
          </div>
          <div className="hdm-graph-grid">
            {cells.map((date, i) => {
              if (!date) return <span key={`blank-${i}`} className="hdm-day-cell hdm-day-cell--blank" />;
              const dateStr = habitDateStr(date);
              const isCompleted = !!habit.history?.[dateStr];
              const isToday = dateStr === todayKey;
              return (
                <button
                  type="button"
                  key={dateStr}
                  className={`hdm-day-cell ${isCompleted ? 'filled' : ''} ${isToday ? 'today' : ''}`}
                  title={date.toLocaleDateString()}
                  onClick={() => onToggleDay && onToggleDay(habit.id, dateStr)}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Habit Add/Edit Modal ──────────────────────────────────────────────────────

const HabitFormModal = ({ habit, initialName = '', onSave, onClose }) => {
  const isEdit = !!habit;
  const [name, setName] = useState(habit?.name || initialName);
  const [selectedAttrs, setSelectedAttrs] = useState(habit ? getHabitAttrs(habit) : ['discipline']);
  const allAttrs = Object.keys(STAT_META);

  const toggleAttr = (attr) => {
    setSelectedAttrs(prev =>
      prev.includes(attr)
        ? prev.length > 1 ? prev.filter(a => a !== attr) : prev
        : [...prev, attr]
    );
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      ...(habit || { id: Date.now(), history: {} }),
      name: name.trim(),
      attributes: selectedAttrs,
    });
    onClose();
  };

  return (
    <div className="hdm-overlay" onClick={onClose}>
      <div className="hdm-modal" onClick={e => e.stopPropagation()}>
        <div className="hdm-header">
          <h3 className="hdm-title">{isEdit ? 'Edit Habit' : 'New Habit'}</h3>
          <button className="hdm-close-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="hfm-form">
          <input
            type="text"
            className="hfm-input"
            placeholder="Habit name…"
            value={name}
            onChange={e => setName(e.target.value)}
            autoFocus
          />
          <div className="hfm-attr-row">
            {allAttrs.map(attr => (
              <button
                key={attr}
                type="button"
                className={`hfm-attr-pill${selectedAttrs.includes(attr) ? ' selected' : ''}`}
                onClick={() => toggleAttr(attr)}
                style={selectedAttrs.includes(attr) ? {
                  borderColor: STAT_META[attr].color,
                  color: STAT_META[attr].color,
                  background: `${STAT_META[attr].color}18`,
                } : {}}
              >
                {STAT_META[attr].label}
              </button>
            ))}
          </div>
          <div className="hfm-form-actions">
            <button type="button" className="hfm-cancel-btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="hfm-save-btn" disabled={!name.trim()}>Save</button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── Lessons ──────────────────────────────────────────────────────────────────

const LessonsList = ({ logs, onOpen }) => {
  const [query, setQuery] = useState('');
  const lessons = useMemo(() => getLessons(logs), [logs]);
  const q = query.trim().toLowerCase();
  const shown = q ? lessons.filter(l => l.text.toLowerCase().includes(q)) : lessons;
  return (
    <div className="log-lessons">
      {lessons.length > 3 && (
        <input
          type="search"
          className="log-lessons-search"
          placeholder={`Search ${lessons.length} lessons…`}
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      )}
      {shown.length === 0 && (
        <p className="log-empty-hint">{lessons.length ? 'No lesson matches.' : 'Every “one thing I learned” you write collects here.'}</p>
      )}
      {shown.map(l => (
        <button key={l.date} type="button" className="log-lesson" onClick={() => onOpen(l.date)}>
          <span className="log-lesson-date">{formatShortDate(l.date)}</span>
          <span className="log-lesson-text">{l.text}</span>
        </button>
      ))}
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const LOOP_LABELS = { yes: 'Yes', partly: 'A little', no: 'Not that day' };

const DailyLogPage = ({
  logs, setLogs, onCommitmentLocked, commitmentArchive = [], onResolveCommitment, xpLog = [], goals = [], northStar, logPatterns,
  habits = [], setHabits, onToggleHabitDay, healthLog = {}, setHealthLog, foodLog = {}, setFoodLog, foodPoints = { balance: 0 },
  setFoodPoints, onUpdateStat, logReviews = {}, onSubmitLog, reviewingDate = null, onOpenAssistant,
}) => {
  const todayKey = getTodayKey();
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarTab, setSidebarTab] = useState('entries');
  const [detailHabit, setDetailHabit] = useState(null);
  const [newHabitName, setNewHabitName] = useState(null);
  const [editingHabit, setEditingHabit] = useState(null);

  const saveHabit = useCallback((habitData) => {
    setHabits(prev => {
      const exists = prev.some(h => h.id === habitData.id);
      return exists ? prev.map(h => h.id === habitData.id ? habitData : h) : [...prev, habitData];
    });
  }, [setHabits]);

  const deleteHabit = useCallback((id) => {
    if (window.confirm('Delete this habit?')) {
      setHabits(prev => prev.filter(h => h.id !== id));
    }
  }, [setHabits]);

  const habitHandlers = useMemo(() => ({
    onViewHabit: setDetailHabit,
    onEditHabit: setEditingHabit,
    onDeleteHabit: deleteHabit,
    onAddHabit: (name = '') => setNewHabitName(name),
  }), [deleteHabit]);

  // Ensure today's entry always exists
  useEffect(() => {
    setLogs(prev => {
      if (!prev[todayKey]) {
        return { ...prev, [todayKey]: EMPTY_ENTRY() };
      }
      return prev;
    });
  }, [todayKey, setLogs]);

  // Current entry (read from logs, fallback to empty)
  const currentEntry = logs[selectedDate] || EMPTY_ENTRY();

  // Auto-save: update a specific field in the current entry
  const updateField = useCallback((field, value) => {
    setLogs(prev => ({
      ...prev,
      [selectedDate]: {
        ...(prev[selectedDate] || EMPTY_ENTRY()),
        [field]: value,
      },
    }));
  }, [selectedDate, setLogs]);

  // Sorted dates: newest first, today always on top
  const sortedDates = Object.keys(logs).sort((a, b) => b.localeCompare(a));

  // ── Emotion toggle ──
  const toggleEmotion = (emotionId) => {
    const current = currentEntry.emotions || [];
    const updated = current.includes(emotionId)
      ? current.filter(e => e !== emotionId)
      : [...current, emotionId];
    updateField('emotions', updated);
  };

  // ── Proud/Improve array fields ──
  const updateArrayField = (field, index, value) => {
    const arr = [...(currentEntry[field] || ['', '', ''])];
    while (arr.length < 3) arr.push('');
    arr[index] = value;
    updateField(field, arr);
  };

  const isToday = selectedDate === todayKey;

  const openEntry = (dateKey) => {
    setSelectedDate(dateKey);
    setSidebarTab('entries');
  };

  return (
    <div className="daily-log-container">

      {/* ── Left Sidebar: Entry List / Lessons ── */}
      <aside className={`log-sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        {!sidebarCollapsed && (
          <>
            <div className="log-sidebar-header">
              <div className="log-sidebar-tabs" role="tablist" aria-label="Journal">
                <button type="button" role="tab" aria-selected={sidebarTab === 'entries'} className={`log-sidebar-tab${sidebarTab === 'entries' ? ' active' : ''}`} onClick={() => setSidebarTab('entries')}>
                  Entries
                </button>
                <button type="button" role="tab" aria-selected={sidebarTab === 'lessons'} className={`log-sidebar-tab${sidebarTab === 'lessons' ? ' active' : ''}`} onClick={() => setSidebarTab('lessons')}>
                  Lessons
                </button>
              </div>
            </div>

            {sidebarTab === 'lessons' ? (
              <LessonsList logs={logs} onOpen={openEntry} />
            ) : (
              <>
                <div className="log-entries-list">
                  {sortedDates.length === 0 && (
                    <div className="log-empty-hint">No entries yet.</div>
                  )}
                  {sortedDates.map(dateKey => {
                    const isActive = dateKey === selectedDate;
                    const isEntryToday = dateKey === todayKey;
                    const entry = logs[dateKey] || EMPTY_ENTRY();
                    const hasContent = entryHasContent(entry);

                    return (
                      <button
                        key={dateKey}
                        className={`log-entry-pill ${isActive ? 'active' : ''} ${isEntryToday ? 'today' : ''}`}
                        onClick={() => setSelectedDate(dateKey)}
                      >
                        <div className="log-entry-pill-left">
                          <span className={`log-entry-dot${entry.closedAt ? ' closed' : ''}`} style={{ opacity: hasContent ? 1 : 0.25 }} />
                          <div>
                            <span className="log-entry-date">{formatShortDate(dateKey)}</span>
                            {isEntryToday && <span className="log-entry-today-badge">Tonight</span>}
                          </div>
                        </div>
                        {entry.dayRating > 0 && (
                          <span className="log-entry-rating" style={{ color: scoreColor(entry.dayRating) }}>{entry.dayRating}</span>
                        )}
                        {!entry.dayRating && entry.emotions?.length > 0 && (
                          <span className="log-entry-emotions-preview">
                            {entry.emotions.slice(0, 3).map(eid => {
                              const em = EMOTIONS.find(e => e.id === eid);
                              return em ? <em.Icon key={eid} size={12} /> : null;
                            })}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <EmotionTrend logs={logs} />
              </>
            )}
          </>
        )}
      </aside>

      <button
        className={`log-sidebar-toggle ${sidebarCollapsed ? 'collapsed' : ''}`}
        onClick={() => setSidebarCollapsed(c => !c)}
        title={sidebarCollapsed ? 'Expand journal' : 'Collapse journal'}
        aria-label={sidebarCollapsed ? 'Expand journal' : 'Collapse journal'}
      >
        {sidebarCollapsed ? <ChevronRight size={14} strokeWidth={3} /> : <ChevronLeft size={14} strokeWidth={3} />}
      </button>

      {/* ── Right Panel ── */}
      <main className="log-main">
        {isToday ? (
          <CloseDayFlow
            key={todayKey}
            todayKey={todayKey}
            entry={currentEntry}
            updateField={updateField}
            updateArrayField={updateArrayField}
            logs={logs}
            logReviews={logReviews}
            commitmentArchive={commitmentArchive}
            onResolveCommitment={onResolveCommitment}
            onCommitmentLocked={onCommitmentLocked}
            habits={habits}
            onToggleHabitDay={onToggleHabitDay}
            habitHandlers={habitHandlers}
            healthLog={healthLog}
            setHealthLog={setHealthLog}
            foodLog={foodLog}
            setFoodLog={setFoodLog}
            foodPoints={foodPoints}
            setFoodPoints={setFoodPoints}
            onUpdateStat={onUpdateStat}
            goals={goals}
            northStar={northStar}
            logPatterns={logPatterns}
            xpLog={xpLog}
            reviewingDate={reviewingDate}
            onSubmitLog={onSubmitLog}
            onOpenAssistant={onOpenAssistant}
          />
        ) : (
          <>
            {/* Date Header */}
            <div className="log-date-header">
              <h1 className="log-date-title">{formatDisplayDate(selectedDate)}</h1>
              <span className="log-readonly-badge">Past Entry</span>
              <button type="button" className="log-back-tonight" onClick={() => setSelectedDate(todayKey)}>
                <Moon size={14} /> Back to tonight
              </button>
            </div>

            <div className="log-form">

              {/* ── Day rating + loop check (Close the Day fields) ── */}
              {(currentEntry.dayRating > 0 || currentEntry.loopCheck?.result) && (
                <div className="log-section log-past-meta">
                  {currentEntry.dayRating > 0 && (
                    <span className="log-past-chip">
                      Rated <strong style={{ color: scoreColor(currentEntry.dayRating) }}>{currentEntry.dayRating}/10</strong>
                    </span>
                  )}
                  {currentEntry.loopCheck?.result && (
                    <span className="log-past-chip">
                      Worked on “{currentEntry.loopCheck.text}”: <strong>{LOOP_LABELS[currentEntry.loopCheck.result]}</strong>
                    </span>
                  )}
                </div>
              )}

              {/* ── Emotions ── */}
              <div className="log-section">
                <h3 className="log-section-title"><MessageCircle size={18} /> How did you feel?</h3>
                <div className="emotions-grid">
                  {EMOTIONS.map(emotion => {
                    const selected = (currentEntry.emotions || []).includes(emotion.id);
                    return (
                      <button
                        key={emotion.id}
                        className={`emotion-chip ${selected ? 'selected' : ''}`}
                        style={selected ? { '--chip-color': emotion.color, borderColor: emotion.color, backgroundColor: emotion.color + '22' } : {}}
                        onClick={() => toggleEmotion(emotion.id)}
                      >
                        <span className="emotion-emoji"><emotion.Icon size={20} /></span>
                        <span className="emotion-label">{emotion.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ── Proud Of ── */}
              <div className="log-section">
                <h3 className="log-section-title"><Trophy size={18} /> Wins</h3>
                <div className="reflection-inputs">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="reflection-input-row">
                      <span className="reflection-number">{i + 1}</span>
                      <input
                        type="text"
                        className="reflection-input"
                        placeholder={`Something you're proud of...`}
                        value={(currentEntry.proud || ['', '', ''])[i] || ''}
                        onChange={e => updateArrayField('proud', i, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Improve ── */}
              <div className="log-section">
                <h3 className="log-section-title"><TrendingUp size={18} /> To improve</h3>
                <div className="reflection-inputs">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="reflection-input-row">
                      <span className="reflection-number">{i + 1}</span>
                      <input
                        type="text"
                        className="reflection-input"
                        placeholder={`Something to work on...`}
                        value={(currentEntry.improve || ['', '', ''])[i] || ''}
                        onChange={e => updateArrayField('improve', i, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Nightly question ── */}
              {currentEntry.prompt?.text && (
                <div className="log-section">
                  <h3 className="log-section-title"><Moon size={18} /> {currentEntry.prompt.text}</h3>
                  <textarea
                    className="learned-textarea"
                    value={currentEntry.prompt.answer || ''}
                    onChange={e => updateField('prompt', { ...currentEntry.prompt, answer: e.target.value })}
                    rows={3}
                  />
                </div>
              )}

              {/* ── Learned ── */}
              <div className="log-section">
                <h3 className="log-section-title"><Lightbulb size={18} /> One thing I learned</h3>
                <textarea
                  className="learned-textarea"
                  placeholder="What did you learn that day?"
                  value={currentEntry.learned || ''}
                  onChange={e => updateField('learned', e.target.value)}
                  rows={3}
                />
              </div>

              {/* ── Additional Notes ── */}
              <div className="log-section">
                <h3 className="log-section-title"><PenLine size={18} /> Notes</h3>
                <textarea
                  className="notes-textarea"
                  placeholder="Anything else you want to remember about that day?"
                  value={currentEntry.notes || ''}
                  onChange={e => updateField('notes', e.target.value)}
                  rows={4}
                />
              </div>

              {/* ── Commitment (locked once the day has passed) ── */}
              <div className="log-section commitment-section">
                <h3 className="log-section-title"><Target size={18} /> Commitment for the next day</h3>
                <input
                  type="text"
                  className="reflection-input commitment-input"
                  placeholder="No commitment that night"
                  value={currentEntry.commitment || ''}
                  readOnly
                />
              </div>

              {/* ── Submit + assistant review ── */}
              <LogReviewSection
                key={selectedDate}
                dateKey={selectedDate}
                entry={currentEntry}
                isToday={false}
                review={logReviews[selectedDate] || null}
                reviewingDate={reviewingDate}
                onSubmit={onSubmitLog}
                onOpenAssistant={onOpenAssistant}
              />

            </div>
          </>
        )}

        {detailHabit && (
          <HabitDetailModal
            habit={habits.find(h => h.id === detailHabit.id) || detailHabit}
            onToggleDay={onToggleHabitDay}
            onClose={() => setDetailHabit(null)}
          />
        )}

        {newHabitName !== null && (
          <HabitFormModal
            habit={null}
            initialName={newHabitName}
            onSave={saveHabit}
            onClose={() => setNewHabitName(null)}
          />
        )}

        {editingHabit && (
          <HabitFormModal
            habit={editingHabit}
            onSave={saveHabit}
            onClose={() => setEditingHabit(null)}
          />
        )}
      </main>
    </div>
  );
};

export default DailyLogPage;
