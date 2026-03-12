import React, { useState } from 'react';
import './TasksPage.css';
import flameIcon from '../assets/flame_icon.png';
import STAT_META from './statMeta';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

// ─── Constants ────────────────────────────────────────────────────────────────
const XP_BY_TIMEFRAME = {
  today: 20,
  tomorrow: 30,
  'this-week': 50,
  'this-month': 100,
};

const TIMEFRAME_LABELS = {
  today: 'Today',
  tomorrow: 'Tomorrow',
  'this-week': 'This Week',
  'this-month': 'This Month',
};

// ─── Add Task Modal ───────────────────────────────────────────────────────────
// Stat attributes — must match keys in user.stats
const STAT_ATTRIBUTES = Object.keys(STAT_META);
const STAT_LABELS = Object.fromEntries(Object.entries(STAT_META).map(([k, v]) => [k, v.label]));

const AddTaskModal = ({ onClose, onAdd }) => {
  const [text, setText] = useState('');
  const [timeFrame, setTimeFrame] = useState('today');
  const [categories, setCategories] = useState(['discipline']);

  const toggleCategory = (attr) => {
    setCategories(prev =>
      prev.includes(attr)
        ? prev.length > 1 ? prev.filter(a => a !== attr) : prev // keep at least one
        : [...prev, attr]
    );
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    onAdd({
      id: Date.now(),
      text: text.trim(),
      timeFrame,
      xp: XP_BY_TIMEFRAME[timeFrame],
      categories,
      completed: false,
      notes: '',
      subtasks: [],
    });
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content add-task-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">New Task</h3>
        <form onSubmit={handleSubmit} className="add-task-form-modal">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Task name..."
            className="modal-text-input"
            autoFocus
          />

          <div className="modal-field-group">
            <label className="modal-label">Time Frame</label>
            <div className="timeframe-pills">
              {Object.entries(TIMEFRAME_LABELS).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  className={`timeframe-pill ${timeFrame === val ? 'active' : ''}`}
                  onClick={() => setTimeFrame(val)}
                >
                  {label}
                  <span className="pill-xp">+{XP_BY_TIMEFRAME[val]}XP</span>
                </button>
              ))}
            </div>
          </div>

          <div className="modal-field-group">
            <label className="modal-label">Attributes <span className="modal-label-hint">(select one or more)</span></label>
            <div className="category-pills">
              {STAT_ATTRIBUTES.map((attr) => {
                const meta = STAT_META[attr];
                const { Icon } = meta;
                const isActive = categories.includes(attr);
                return (
                  <button
                    key={attr}
                    type="button"
                    className={`category-pill ${isActive ? 'active' : ''}`}
                    style={isActive ? { background: `${meta.color}22`, borderColor: meta.color, color: meta.color } : {}}
                    onClick={() => toggleCategory(attr)}
                  >
                    <Icon size={12} strokeWidth={2.5} style={{ flexShrink: 0 }} />
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" onClick={onClose} className="modal-btn secondary">Cancel</button>
            <button type="submit" className="modal-btn primary">Add Task</button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── Confirm Complete Modal ───────────────────────────────────────────────────
const ConfirmModal = ({ task, onConfirm, onCancel }) => {
  const cats = task.categories || (task.category ? [task.category] : []);
  const xpEach = cats.length > 0 ? Math.floor(task.xp / cats.length) : task.xp;
  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h3 className="modal-title">Complete Task?</h3>
        <p className="modal-body">
          Mark <strong>"{task.text}"</strong> as done and earn{' '}
          <span className="xp-highlight">+{task.xp} XP</span>?
        </p>
        {cats.length > 0 && (
          <p className="modal-body" style={{ fontSize: '0.78rem', color: '#9ca3af', marginTop: '-0.4rem' }}>
            {cats.length === 1
              ? `+${task.xp} XP → ${STAT_LABELS[cats[0]] || cats[0]}`
              : `+${xpEach} XP each → ${cats.map(c => STAT_LABELS[c] || c).join(', ')}`}
          </p>
        )}
        <div className="modal-actions">
          <button onClick={onCancel} className="modal-btn secondary">Cancel</button>
          <button onClick={onConfirm} className="modal-btn primary">Complete!</button>
        </div>
      </div>
    </div>
  );
};

// ─── XP Gained Modal ─────────────────────────────────────────────────────────
const XpModal = ({ xp, categories, onClose }) => (
  <div className="modal-overlay" onClick={onClose}>
    <div className="modal-content xp-modal" onClick={(e) => e.stopPropagation()}>
      <span className="xp-badge-big">✨</span>
      <h3 className="modal-title xp-title">+{xp} XP</h3>
      {categories && categories.length > 0 && (
        <div className="xp-modal-attrs">
          {categories.map(cat => {
            const meta = STAT_META[cat];
            if (!meta) return null;
            const { Icon } = meta;
            const each = Math.floor(xp / categories.length);
            return (
              <span key={cat} className="xp-modal-attr-pill" style={{ color: meta.color, borderColor: `${meta.color}55`, background: `${meta.color}18` }}>
                <Icon size={11} strokeWidth={2.5} />
                {meta.label} +{each}
              </span>
            );
          })}
        </div>
      )}
      <p className="modal-body">Great job! Keep up the momentum.</p>
      <button onClick={onClose} className="modal-btn primary">Awesome!</button>
    </div>
  </div>
);

// ─── Detail Panel ─────────────────────────────────────────────────────────────
const DetailPanel = ({ task, todos, setTodos, onUpdateStat }) => {
  const [newSubtask, setNewSubtask] = useState('');
  const [subtaskXpModal, setSubtaskXpModal] = useState(null); // { subtaskText, categories }

  if (!task) {
    return (
      <div className="detail-empty">
        <p>Select a task to<br />view details</p>
      </div>
    );
  }

  const canHaveSubtasks = task.timeFrame === 'this-week' || task.timeFrame === 'this-month';
  const liveTask = todos.find(t => t.id === task.id) || task;
  const subtasks = liveTask.subtasks || [];
  const completedCount = subtasks.filter(s => s.completed).length;

  const handleNotesChange = (e) => {
    setTodos(todos.map(t => t.id === task.id ? { ...t, notes: e.target.value } : t));
  };

  const handleAddSubtask = (e) => {
    e.preventDefault();
    if (!newSubtask.trim()) return;
    const subtask = { id: Date.now(), text: newSubtask.trim(), completed: false };
    setTodos(todos.map(t =>
      t.id === task.id ? { ...t, subtasks: [...(t.subtasks || []), subtask] } : t
    ));
    setNewSubtask('');
  };

  const toggleSubtask = (subtaskId) => {
    const parentTask = todos.find(t => t.id === task.id);
    const subtask = (parentTask?.subtasks || []).find(s => s.id === subtaskId);
    const wasCompleted = subtask?.completed ?? false;

    setTodos(todos.map(t => {
      if (t.id !== task.id) return t;
      return {
        ...t,
        subtasks: (t.subtasks || []).map(s =>
          s.id === subtaskId ? { ...s, completed: !s.completed } : s
        ),
      };
    }));

    const parentCats = parentTask?.categories || (parentTask?.category ? [parentTask.category] : []);
    if (!wasCompleted && parentCats.length > 0) {
      parentCats.forEach(cat => onUpdateStat(cat, 10));
      setSubtaskXpModal({ subtaskText: subtask.text, categories: parentCats });
    }
  };

  const deleteSubtask = (subtaskId) => {
    setTodos(todos.map(t => {
      if (t.id !== task.id) return t;
      return { ...t, subtasks: (t.subtasks || []).filter(s => s.id !== subtaskId) };
    }));
  };

  return (
    <div className="detail-panel">
      <div className="detail-top">
        <div className="detail-category-pills">
          {(liveTask.categories || (liveTask.category ? [liveTask.category] : [])).map(cat => {
            const meta = STAT_META[cat];
            const Icon = meta?.Icon;
            return (
              <span
                key={cat}
                className="detail-category-pill"
                style={meta ? { background: `${meta.color}22`, borderColor: meta.color, color: meta.color } : {}}
              >
                {Icon && <Icon size={12} strokeWidth={2.5} style={{ flexShrink: 0 }} />}
                {meta?.label || cat}
              </span>
            );
          })}
        </div>
        <h2 className="detail-title">{liveTask.text}</h2>
        <textarea
          className="detail-notes"
          placeholder="Type additional information..."
          value={liveTask.notes || ''}
          onChange={handleNotesChange}
        />
      </div>

      {canHaveSubtasks && (
        <div className="detail-subtasks">
          <div className="subtask-header">
            <span className="subtask-label">Sub-tasks</span>
            {subtasks.length > 0 && (
              <span className="subtask-progress">{completedCount}/{subtasks.length}</span>
            )}
          </div>

          {subtasks.map(sub => (
            <div key={sub.id} className="subtask-item">
              <div
                className={`subtask-checkbox ${sub.completed ? 'checked' : ''}`}
                onClick={() => toggleSubtask(sub.id)}
              />
              <span className={`subtask-text ${sub.completed ? 'done' : ''}`}>{sub.text}</span>
              <span className="subtask-delete" onClick={() => deleteSubtask(sub.id)}>×</span>
            </div>
          ))}

          <form onSubmit={handleAddSubtask} className="add-subtask-form">
            <span className="plus-icon-small">+</span>
            <input
              type="text"
              value={newSubtask}
              onChange={(e) => setNewSubtask(e.target.value)}
              placeholder="Add a sub-task..."
              className="subtask-input"
            />
          </form>
        </div>
      )}

      <div className="detail-footer">
        <span className="detail-xp-badge">+{liveTask.xp}XP</span>
        <span className="detail-timeframe-badge">
          TIME-FRAME: {TIMEFRAME_LABELS[liveTask.timeFrame]}
        </span>
      </div>

      {subtaskXpModal && (
        <div className="modal-overlay" onClick={() => setSubtaskXpModal(null)}>
          <div className="modal-content xp-modal" onClick={(e) => e.stopPropagation()}>
            <span className="xp-badge-big">⚡</span>
            <h3 className="modal-title xp-title">+10 XP each</h3>
            <p className="modal-body">
              <strong style={{ color: '#fff' }}>"{subtaskXpModal.subtaskText}"</strong> complete!{' '}
              <span style={{ color: '#fbbf24', fontWeight: 700, textTransform: 'capitalize' }}>
                {(subtaskXpModal.categories || []).map(c => STAT_LABELS[c] || c).join(', ')}
              </span>{' '}
              increased.
            </p>
            <button className="modal-btn primary" onClick={() => setSubtaskXpModal(null)}>
              Keep Going!
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Todo List ────────────────────────────────────────────────────────────────
const TodoList = ({ onAddXp, onUpdateStat, todos, setTodos, selectedTask, setSelectedTask }) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showXpModal, setShowXpModal] = useState(false);
  const [pendingTaskId, setPendingTaskId] = useState(null);
  const [gainedXp, setGainedXp] = useState(20);
  const [gainedCategories, setGainedCategories] = useState([]);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editingText, setEditingText] = useState('');

  // Rollover: move 'tomorrow' tasks to 'today' at midnight
  React.useEffect(() => {
    const rolloverTomorrow = () => {
      setTodos(prev =>
        prev.map(t =>
          t.timeFrame === 'tomorrow' ? { ...t, timeFrame: 'today' } : t
        )
      );
    };
    const now = new Date();
    const msUntilMidnight =
      new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0) - now;
    const timeout = setTimeout(() => {
      rolloverTomorrow();
    }, msUntilMidnight);
    return () => clearTimeout(timeout);
  }, []);

  const handleAddTodo = (newTodo) => {
    setTodos([...todos, newTodo]);
  };

  const checkOffTodo = (id, e) => {
    e.stopPropagation();
    const todo = todos.find(t => t.id === id);
    if (!todo || todo.completed) return;
    setPendingTaskId(id);
    setShowConfirmModal(true);
  };

  const handleConfirmTask = () => {
    const task = todos.find(t => t.id === pendingTaskId);
    if (!task) return;
    setGainedXp(task.xp);
    const cats = task.categories || (task.category ? [task.category] : []);
    setGainedCategories(cats);
    setTodos(todos.filter(t => t.id !== pendingTaskId));
    // Split XP evenly across all selected attributes
    if (cats.length > 0) {
      const xpEach = Math.floor(task.xp / cats.length);
      cats.forEach(cat => onUpdateStat(cat, xpEach));
    }
    if (selectedTask?.id === pendingTaskId) setSelectedTask(null);
    setShowConfirmModal(false);
    setPendingTaskId(null);
    setTimeout(() => setShowXpModal(true), 300);
  };

  const deleteTodo = (id, e) => {
    e.stopPropagation();
    setTodos(todos.filter(t => t.id !== id));
    if (selectedTask?.id === id) setSelectedTask(null);
  };

  const startEditTask = (todo, e) => {
    e.stopPropagation();
    setEditingTaskId(todo.id);
    setEditingText(todo.text);
  };

  const saveTaskEdit = (id) => {
    const trimmed = editingText.trim();
    if (trimmed) {
      setTodos(todos.map(t => t.id === id ? { ...t, text: trimmed } : t));
    }
    setEditingTaskId(null);
    setEditingText('');
  };

  const grouped = {
    today: todos.filter(t => t.timeFrame === 'today' || !t.timeFrame),
    tomorrow: todos.filter(t => t.timeFrame === 'tomorrow'),
    'this-week': todos.filter(t => t.timeFrame === 'this-week'),
    'this-month': todos.filter(t => t.timeFrame === 'this-month'),
  };

  const renderGroup = (timeFrame, label) => {
    const items = grouped[timeFrame];
    return (
      <div className="task-group" key={timeFrame}>
        <div className="task-group-header">
          <span className={`task-group-title${timeFrame === 'tomorrow' ? ' tomorrow' : ''}`}>{label}</span>
          <span className="task-group-count">{items.length}</span>
        </div>
        {items.map(todo => (
          <div
            key={todo.id}
            className={`task-item ${selectedTask?.id === todo.id ? 'selected' : ''}`}
            onClick={() => setSelectedTask(todo)}
          >
            <div
              className={`task-checkbox ${todo.completed ? 'checked' : ''}`}
              onClick={(e) => checkOffTodo(todo.id, e)}
            />
            {editingTaskId === todo.id ? (
              <input
                className="task-text task-text-edit"
                value={editingText}
                autoFocus
                onChange={(e) => setEditingText(e.target.value)}
                onBlur={() => saveTaskEdit(todo.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveTaskEdit(todo.id);
                  if (e.key === 'Escape') { setEditingTaskId(null); setEditingText(''); }
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span
                className={`task-text ${todo.completed ? 'completed-text' : ''}`}
                onDoubleClick={(e) => startEditTask(todo, e)}
              >
                {todo.text}
              </span>
            )}
            <span className="task-xp-badge">+{todo.xp || XP_BY_TIMEFRAME[timeFrame] || 20}XP</span>
            <span className="task-delete" onClick={(e) => deleteTodo(todo.id, e)}>×</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="todo-section">
      <h1 className="section-page-title">TO-DO</h1>
      <div className="todo-card">
        {renderGroup('today', 'Today')}
        {renderGroup('tomorrow', 'Tomorrow')}
        {renderGroup('this-week', 'This Week')}
        {renderGroup('this-month', 'This Month')}
        <button className="add-task-btn" onClick={() => setShowAddModal(true)}>
          <span>+</span> Add a new task
        </button>
      </div>

      {showAddModal && (
        <AddTaskModal onClose={() => setShowAddModal(false)} onAdd={handleAddTodo} />
      )}
      {showConfirmModal && pendingTaskId && (
        <ConfirmModal
          task={todos.find(t => t.id === pendingTaskId)}
          onConfirm={handleConfirmTask}
          onCancel={() => { setShowConfirmModal(false); setPendingTaskId(null); }}
        />
      )}
      {showXpModal && (
        <XpModal xp={gainedXp} categories={gainedCategories} onClose={() => setShowXpModal(false)} />
      )}
    </div>
  );
};

// ─── Habit Tracker ────────────────────────────────────────────────────────────
const HabitTracker = ({ onUpdateStat, habits, setHabits }) => {
  const [inputValue, setInputValue] = useState('');
  const [selectedAttribute, setSelectedAttribute] = useState('discipline');
  const [isAdding, setIsAdding] = useState(false);
  const [showStatModal, setShowStatModal] = useState(false);
  const [gainedAttribute, setGainedAttribute] = useState('');
  const [gainedHabitXp, setGainedHabitXp] = useState(10);

  const attributes = [
    'strength', 'intelligence', 'charisma', 'discipline',
    'mentalHealth', 'health', 'focus', 'creativity', 'productivity',
  ];

  const getDaysOfWeek = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const day = today.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(today);
    monday.setDate(today.getDate() + diff);
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      days.push(d);
    }
    return days;
  };

  const days = getDaysOfWeek();
  const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const handleAddHabit = (e) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    setHabits([...habits, {
      id: Date.now(),
      name: inputValue.trim(),
      attribute: selectedAttribute,
      history: {},
    }]);
    setInputValue('');
    setSelectedAttribute('discipline');
    setIsAdding(false);
  };

  const calcStreakXp = (history, todayStr) => {
    const today = parseLocalDate(todayStr);
    let streak = 0;
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const ds = localDateStr(d);
      if (history[ds]) streak++;
      else break;
    }
    // streak = consecutive days including today; XP = 10 × (streak / 2), min 10
    return Math.max(10, Math.round(10 * (streak / 2)));
  };

  const toggleHabitDate = (habitId, date) => {
    const dateStr = localDateStr(date);
    setHabits(habits.map(habit => {
      if (habit.id !== habitId) return habit;
      const newHistory = { ...habit.history };
      if (newHistory[dateStr]) {
        const xp = calcStreakXp(newHistory, dateStr);
        delete newHistory[dateStr];
        onUpdateStat(habit.attribute, -xp);
      } else {
        newHistory[dateStr] = true;
        const xp = calcStreakXp(newHistory, dateStr);
        onUpdateStat(habit.attribute, xp);
        setGainedAttribute(habit.attribute);
        setGainedHabitXp(xp);
        setShowStatModal(true);
      }
      return { ...habit, history: newHistory };
    }));
  };

  const deleteHabit = (id) => {
    if (window.confirm('Delete this habit?')) {
      setHabits(habits.filter(h => h.id !== id));
    }
  };

  const getStreak = (habit) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = localDateStr(today);
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const yesterdayStr = localDateStr(yesterday);

    // Streak is alive if today OR yesterday is checked (so it stays alive all day)
    const hasToday = !!habit.history[todayStr];
    const hasYesterday = !!habit.history[yesterdayStr];
    if (!hasToday && !hasYesterday) return 0;

    // Count consecutive days backwards from the most recent checked day
    let consecutive = 0;
    const startOffset = hasToday ? 0 : 1;
    for (let i = startOffset; i < 365; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateStr = localDateStr(d);
      if (habit.history[dateStr]) consecutive++;
      else break;
    }
    // Streak starts at 1 only after 2 consecutive days (2 days in a row = streak 1)
    return Math.max(0, consecutive - 1);
  };

  const getBestStreak = (habit) => {
    const dates = Object.keys(habit.history).sort();
    if (dates.length === 0) return 0;
    let best = 1;
    let current = 1;
    for (let i = 1; i < dates.length; i++) {
      const prev = new Date(dates[i - 1]);
      const curr = new Date(dates[i]);
      const diff = (curr - prev) / (1000 * 60 * 60 * 24);
      if (diff === 1) {
        current++;
        if (current > best) best = current;
      } else {
        current = 1;
      }
    }
    return best;
  };

  const getTotalCompletions = (habit) => Object.keys(habit.history).length;

  return (
    <div className="habit-section">
      <h1 className="section-page-title">HABITS</h1>
      <div className="habit-card">
        {/* Header row */}
        <div className="habit-grid-row habit-header-row">
          <div className="habit-label-col" />
          <div className="habit-days-col">
            {DAY_LABELS.map(d => (
              <div key={d} className="day-header">{d}</div>
            ))}
          </div>
          <div className="habit-meta-col" />
        </div>

        {/* Habit rows */}
        {habits.map(habit => {
          const streak = getStreak(habit);
          const best = getBestStreak(habit);
          const total = getTotalCompletions(habit);
          return (
            <div key={habit.id} className="habit-grid-row">
              <div className="habit-label-col">
                <span
                  className="habit-name-display"
                  onDoubleClick={() => deleteHabit(habit.id)}
                  title="Double-click to delete"
                >
                  {habit.name}
                </span>
                <span className="habit-attribute-badge">{habit.attribute}</span>
              </div>
              <div className="habit-days-col">
                {days.map((date, i) => {
                  const dateStr = localDateStr(date);
                  const isCompleted = !!habit.history[dateStr];
                  return (
                    <div
                      key={i}
                      className={`habit-circle ${isCompleted ? 'filled' : ''}`}
                      onClick={() => toggleHabitDate(habit.id, date)}
                    />
                  );
                })}
              </div>
              <div className="habit-meta-col">
                <div className="habit-streak-badge" title="Current streak">
                  <img src={flameIcon} alt="streak" className="habit-flame-icon" />
                  <span className="habit-streak-count">{streak}</span>
                </div>
                <div className="habit-best-badge" title="Best streak">
                  <span className="habit-best-icon">🏆</span>
                  <span className="habit-best-count">{best}</span>
                </div>
                <span className="habit-total">{total}x</span>
              </div>
            </div>
          );
        })}

        {habits.length === 0 && (
          <div className="empty-habits-msg">Start tracking with a new habit!</div>
        )}

        {/* Add habit */}
        {!isAdding ? (
          <button className="add-task-btn" onClick={() => setIsAdding(true)}>
            <span>+</span> Add a new habit
          </button>
        ) : (
          <form onSubmit={handleAddHabit} className="add-habit-form">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Habit name..."
              autoFocus
              className="habit-input-dark"
            />
            <select
              value={selectedAttribute}
              onChange={(e) => setSelectedAttribute(e.target.value)}
              className="habit-attribute-select"
            >
              {attributes.map(attr => (
                <option key={attr} value={attr}>{attr}</option>
              ))}
            </select>
            <button type="submit" className="save-habit-btn">Save</button>
            <button type="button" onClick={() => setIsAdding(false)} className="cancel-habit-btn">Cancel</button>
          </form>
        )}
      </div>

      {/* Attribute Gain Modal */}
      {showStatModal && (
        <div className="modal-overlay" onClick={() => setShowStatModal(false)}>
          <div className="modal-content habit-stat-modal" onClick={(e) => e.stopPropagation()}>
            <span className="xp-badge-big">⚡</span>
            <h3 className="modal-title" style={{ color: '#fbbf24', textTransform: 'capitalize' }}>
              +{gainedHabitXp} {gainedAttribute}
            </h3>
            <p className="modal-body">Attribute increased! You are getting better every day.</p>
            <button onClick={() => setShowStatModal(false)} className="modal-btn primary">Keep Grinding</button>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Habit Graph Helpers ──────────────────────────────────────────────────────

/**
 * Returns "YYYY-MM-DD" in LOCAL time for a given Date.
 * Using toISOString() gives UTC midnight which can be the wrong calendar day
 * for users in non-UTC timezones.
 */
const localDateStr = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/**
 * Parse a "YYYY-MM-DD" string as LOCAL midnight.
 * new Date("YYYY-MM-DD") treats it as UTC midnight, which is the wrong day
 * in timezones behind UTC.
 */
const parseLocalDate = (dateStr) => {
  const [y, mo, d] = dateStr.split('-').map(Number);
  return new Date(y, mo - 1, d);
};

/** Returns the Monday of the ISO week for a given Date */
const getMondayOf = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

/** "YYYY-MM-DD" (Monday) week key for a date — local time */
const weekKey = (date) => {
  const mon = getMondayOf(date);
  return localDateStr(mon);
};

/** "YYYY-MM" key for a date — local time */
const monthKey = (date) => {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${mo}`;
};

/**
 * For each habit's history, count completions grouped by a key function.
 * Returns { [key]: count }
 */
const aggregateHistory = (habits, keyFn) => {
  const counts = {};
  habits.forEach((habit) => {
    Object.keys(habit.history).forEach((dateStr) => {
      const k = keyFn(parseLocalDate(dateStr));
      counts[k] = (counts[k] || 0) + 1;
    });
  });
  return counts;
};

/** Build data for DAILY view — current week vs best week (day-by-day) */
const buildDailyData = (habits) => {
  const today = new Date();
  const monday = getMondayOf(today);
  const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  // Count completions per ISO date across all habits
  const dayTotals = {};
  habits.forEach((habit) => {
    Object.keys(habit.history).forEach((dateStr) => {
      dayTotals[dateStr] = (dayTotals[dateStr] || 0) + 1;
    });
  });

  // Current week — 7 days starting from this Monday (local dates)
  const currentWeekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return localDateStr(d);
  });

  // Find best week: group all dates by week, sum totals, pick highest
  const weekTotals = {};
  Object.entries(dayTotals).forEach(([dateStr, count]) => {
    const wk = weekKey(parseLocalDate(dateStr));
    weekTotals[wk] = (weekTotals[wk] || 0) + count;
  });

  // Exclude current week from best-week search
  const currentWeekKey = weekKey(today);
  const bestWeekKey = Object.entries(weekTotals)
    .filter(([k]) => k !== currentWeekKey)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  const bestWeekDays = bestWeekKey
    ? Array.from({ length: 7 }, (_, i) => {
        const base = parseLocalDate(bestWeekKey);
        base.setDate(base.getDate() + i);
        return localDateStr(base);
      })
    : null;

  return DAY_LABELS.map((label, i) => ({
    name: label,
    current: dayTotals[currentWeekDays[i]] || 0,
    best: bestWeekDays ? (dayTotals[bestWeekDays[i]] || 0) : null,
  }));
};

/** Build data for WEEKLY view — last 8 weeks totals, best week as reference line */
const buildWeeklyData = (habits) => {
  const dayTotals = {};
  habits.forEach((habit) => {
    Object.keys(habit.history).forEach((dateStr) => {
      dayTotals[dateStr] = (dayTotals[dateStr] || 0) + 1;
    });
  });

  const weekTotals = {};
  Object.entries(dayTotals).forEach(([dateStr, count]) => {
    const wk = weekKey(parseLocalDate(dateStr));
    weekTotals[wk] = (weekTotals[wk] || 0) + count;
  });

  // Build last 8 weeks
  const today = new Date();
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (7 * (7 - i)));
    const mon = getMondayOf(d);
    return localDateStr(mon);
  });

  const allValues = Object.values(weekTotals);
  const bestTotal = allValues.length ? Math.max(...allValues) : 0;

  return weeks.map((wk, i) => ({
    name: `W${i + 1}`,
    current: weekTotals[wk] || 0,
    best: bestTotal,
  }));
};

/** Build data for MONTHLY view — last 6 months totals, best month as reference line */
const buildMonthlyData = (habits) => {
  const monthTotals = aggregateHistory(habits, (d) => monthKey(d));

  const today = new Date();
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth() - (5 - i), 1);
    return monthKey(d);
  });

  const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  const allValues = Object.values(monthTotals);
  const bestTotal = allValues.length ? Math.max(...allValues) : 0;

  return months.map((mk) => {
    const [, m] = mk.split('-');
    return {
      name: SHORT_MONTHS[parseInt(m, 10) - 1],
      current: monthTotals[mk] || 0,
      best: bestTotal,
    };
  });
};

// ─── Habit Graph Component ────────────────────────────────────────────────────
const HabitGraph = ({ habits }) => {
  const [view, setView] = useState('daily');

  const hasHistory = habits.some((h) => Object.keys(h.history).length > 0);

  const data =
    view === 'daily'
      ? buildDailyData(habits)
      : view === 'weekly'
      ? buildWeeklyData(habits)
      : buildMonthlyData(habits);

  const bestLabel =
    view === 'daily' ? 'Best Week' : view === 'weekly' ? 'Best Week Total' : 'Best Month Total';

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="graph-tooltip">
        <p className="graph-tooltip-label">{label}</p>
        {payload.map((p) => (
          <p key={p.dataKey} style={{ color: p.color, margin: '2px 0', fontSize: '0.8rem', fontWeight: 700 }}>
            {p.name}: {p.value}
          </p>
        ))}
      </div>
    );
  };

  return (
    <div className="habit-graph-section">
      <div className="habit-graph-header">
        <h1 className="section-page-title" style={{ marginBottom: 0 }}>PROGRESS</h1>
        <div className="graph-view-toggles">
          {['daily', 'weekly', 'monthly'].map((v) => (
            <button
              key={v}
              className={`graph-view-btn ${view === v ? 'active' : ''}`}
              onClick={() => setView(v)}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="habit-graph-card">
        {!hasHistory ? (
          <div className="graph-empty-state">
            <span className="graph-empty-icon">📈</span>
            <p>No habit data yet — start completing habits to see your progress!</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
              <XAxis
                dataKey="name"
                tick={{ fill: '#a3a3a3', fontSize: 11, fontWeight: 700 }}
                axisLine={{ stroke: '#333' }}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: '#a3a3a3', fontSize: 11, fontWeight: 700 }}
                axisLine={{ stroke: '#333' }}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                wrapperStyle={{ paddingTop: '12px', fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}
              />
              <Line
                type="monotone"
                dataKey="current"
                name={view === 'daily' ? 'This Week' : view === 'weekly' ? 'This Week' : 'This Month'}
                stroke="#fbbf24"
                strokeWidth={2.5}
                dot={{ fill: '#fbbf24', r: 4 }}
                activeDot={{ r: 6 }}
              />
              <Line
                type="monotone"
                dataKey="best"
                name={bestLabel}
                stroke="#525252"
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={{ fill: '#525252', r: 3 }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

// ─── Tasks Page ───────────────────────────────────────────────────────────────
const TasksPage = ({ onAddXp, onUpdateStat, todos, setTodos, habits, setHabits }) => {
  const [selectedTask, setSelectedTask] = useState(null);

  const liveSelectedTask = selectedTask
    ? todos.find(t => t.id === selectedTask.id) || null
    : null;

  return (
    <div className="tasks-page-container">
      <div className="tasks-layout">
        <div className="tasks-main-column">
          <TodoList
            onAddXp={onAddXp}
            onUpdateStat={onUpdateStat}
            todos={todos}
            setTodos={setTodos}
            selectedTask={liveSelectedTask}
            setSelectedTask={setSelectedTask}
          />
          <HabitTracker
            onUpdateStat={onUpdateStat}
            habits={habits}
            setHabits={setHabits}
          />
          <HabitGraph habits={habits} />
        </div>
        <div className="tasks-detail-column">
          <DetailPanel
            task={liveSelectedTask}
            todos={todos}
            setTodos={setTodos}
            onUpdateStat={onUpdateStat}
          />
        </div>
      </div>
    </div>
  );
};

export default TasksPage;
