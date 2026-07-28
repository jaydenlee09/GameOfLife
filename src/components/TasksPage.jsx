import React, { useState } from 'react';
import './TasksPage.css';
import { Sparkles, Zap, Circle } from 'lucide-react';
import STAT_META from './statMeta';

// ─── Date Helpers (used by AddTaskModal and TodoList) ─────────────────────────
const toLocalDateStr = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const addDays = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return toLocalDateStr(d);
};

// ─── Constants ────────────────────────────────────────────────────────────────
const XP_BY_TIMEFRAME = {
  today: 20,
  'this-week': 50,
  'this-month': 100,
  'this-year': 500,
};

const TIMEFRAME_LABELS = {
  today: 'Today',
  'this-week': 'This Week',
  'this-month': 'This Month',
  'this-year': 'This Year',
};

// ─── Add Task Modal ───────────────────────────────────────────────────────────
// Stat attributes — must match keys in user.stats
const STAT_ATTRIBUTES = Object.keys(STAT_META);
const STAT_LABELS = Object.fromEntries(Object.entries(STAT_META).map(([k, v]) => [k, v.label]));

const AddTaskModal = ({ onClose, onAdd, defaultScheduledDate }) => {
  const [text, setText] = useState('');
  const [timeFrame, setTimeFrame] = useState('today');
  const [categories, setCategories] = useState(['discipline']);
  const [dueDate, setDueDate] = useState('');
  const todayStr = toLocalDateStr();
  const [scheduledDate, setScheduledDate] = useState(defaultScheduledDate || todayStr);

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
      dueDate: dueDate || null,
      scheduledDate: (timeFrame === 'today' && scheduledDate && scheduledDate !== todayStr) ? scheduledDate : null,
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

          {timeFrame === 'today' && (
            <div className="modal-field-group">
              <label className="modal-label">Schedule For</label>
              <div className="schedule-quick-btns">
                {[
                  { label: 'Today', offset: 0 },
                  { label: 'Tomorrow', offset: 1 },
                  { label: '+2 Days', offset: 2 },
                  { label: '+3 Days', offset: 3 },
                ].map(({ label, offset }) => {
                  const val = addDays(offset);
                  return (
                    <button
                      key={offset}
                      type="button"
                      className={`schedule-quick-btn ${scheduledDate === val ? 'active' : ''}`}
                      onClick={() => setScheduledDate(val)}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <input
                type="date"
                value={scheduledDate}
                min={todayStr}
                onChange={(e) => setScheduledDate(e.target.value || todayStr)}
                className="modal-text-input"
              />
            </div>
          )}

          <div className="modal-field-group">
            <label className="modal-label">Due Date <span className="modal-label-hint">(optional)</span></label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="modal-text-input"
            />
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
          <p className="modal-body" style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '-0.4rem' }}>
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
      <span className="xp-badge-big"><Sparkles size={48} /></span>
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

  const canHaveSubtasks = task.timeFrame === 'this-week' || task.timeFrame === 'this-month' || task.timeFrame === 'this-year';
  const liveTask = todos.find(t => t.id === task.id) || task;
  const subtasks = liveTask.subtasks || [];
  const completedCount = subtasks.filter(s => s.completed).length;

  const handleNotesChange = (e) => {
    setTodos(todos.map(t => t.id === task.id ? { ...t, notes: e.target.value } : t));
  };

  const handleDueDateChange = (e) => {
    const next = e.target.value;
    setTodos(todos.map(t => t.id === task.id ? { ...t, dueDate: next || null } : t));
  };

  const clearDueDate = () => {
    setTodos(todos.map(t => t.id === task.id ? { ...t, dueDate: null } : t));
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
      parentCats.forEach(cat => onUpdateStat(cat, 10, { source: 'subtask', label: subtask.text }));
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

        <div className="detail-field-group">
          <label className="detail-field-label">Due Date</label>
          <div className="detail-due-controls">
            <input
              type="date"
              className="detail-date-input"
              value={liveTask.dueDate || ''}
              onChange={handleDueDateChange}
            />
            {liveTask.dueDate && (
              <button type="button" className="detail-clear-btn" onClick={clearDueDate}>
                Clear
              </button>
            )}
          </div>
        </div>
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
          Time Frame: {TIMEFRAME_LABELS[liveTask.timeFrame] || TIMEFRAME_LABELS.today}
        </span>
      </div>

      {subtaskXpModal && (
        <div className="modal-overlay" onClick={() => setSubtaskXpModal(null)}>
          <div className="modal-content xp-modal" onClick={(e) => e.stopPropagation()}>
            <span className="xp-badge-big"><Zap size={48} /></span>
            <h3 className="modal-title xp-title">+10 XP each</h3>
            <p className="modal-body">
              <strong style={{ color: 'var(--text-primary)' }}>"{subtaskXpModal.subtaskText}"</strong> complete!{' '}
              <span style={{ color: 'var(--accent)', fontWeight: 600, textTransform: 'capitalize' }}>
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
const TodoList = ({ onUpdateStat, todos, setTodos, selectedTask, setSelectedTask }) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showXpModal, setShowXpModal] = useState(false);
  const [pendingTaskId, setPendingTaskId] = useState(null);
  const [gainedXp, setGainedXp] = useState(20);
  const [gainedCategories, setGainedCategories] = useState([]);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editingText, setEditingText] = useState('');
  const [dayFilter, setDayFilter] = useState(null); // null = show all, or a dateStr like "2026-05-12"
  const [groupFilter, setGroupFilter] = useState('all'); // 'all' | 'today' | 'this-week' | 'this-month' | 'this-year'

  const DUE_SOON_MS = 3 * 24 * 60 * 60 * 1000;

  const parseDueDateKeyToEndOfDay = (dueDateKey) => {
    if (!dueDateKey || typeof dueDateKey !== 'string') return null;
    const parts = dueDateKey.split('-').map(Number);
    if (parts.length !== 3) return null;
    const [year, month, day] = parts;
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day, 23, 59, 59, 999);
  };

  const formatAbsDuration = (ms) => {
    const absMs = Math.abs(ms);
    const totalMinutes = Math.max(1, Math.ceil(absMs / 60000));
    const days = Math.floor(totalMinutes / (60 * 24));
    const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
    const minutes = totalMinutes % 60;

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const getDueBadgeInfo = (dueDateKey, isCompleted) => {
    const dueEnd = parseDueDateKeyToEndOfDay(dueDateKey);
    if (!dueEnd) return null;
    const remainingMs = dueEnd.getTime() - new Date().getTime();
    const isOverdue = !isCompleted && remainingMs < 0;
    const isSoon = !isCompleted && remainingMs >= 0 && remainingMs <= DUE_SOON_MS;
    const duration = formatAbsDuration(remainingMs);

    return {
      text: remainingMs < 0 ? `Overdue by ${duration}` : `${duration} left`,
      isOverdue,
      isSoon,
      title: remainingMs < 0 ? `Overdue (due ${dueDateKey})` : `Due ${dueDateKey}`,
    };
  };

  // Migration: if any old tasks are tagged "tomorrow", move them into "today"
  React.useEffect(() => {
    setTodos(prev => prev.map(t => (t.timeFrame === 'tomorrow' ? { ...t, timeFrame: 'today' } : t)));
  }, [setTodos]);

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
    if (task.goalId) {
      setTodos(prev => prev.map(t => t.id === pendingTaskId ? { ...t, completed: true } : t));
    } else {
      setTodos(prev => prev.filter(t => t.id !== pendingTaskId));
    }
    // Split XP evenly across all selected attributes
    if (cats.length > 0) {
      const xpEach = Math.floor(task.xp / cats.length);
      cats.forEach(cat => onUpdateStat(cat, xpEach, { source: 'task', label: task.text }));
    }
    if (!task.goalId && selectedTask?.id === pendingTaskId) setSelectedTask(null);
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

  // Local-time period keys (used to scope goal-linked tasks to "This Week/Month/Year")
  const pad2 = (n) => String(n).padStart(2, '0');
  const getLocalWeekKey = () => {
    const d = new Date();
    const day = d.getDay(); // 0 Sun .. 6 Sat
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  };
  const getLocalMonthKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
  };
  const getLocalYearKey = () => String(new Date().getFullYear());

  const currentWeekKey = getLocalWeekKey();
  const currentMonthKey = getLocalMonthKey();
  const currentYearKey = getLocalYearKey();
  const todayStr = toLocalDateStr();

  const grouped = {
    today: todos.filter(t => {
      const isToday = t.timeFrame === 'today' || !t.timeFrame;
      if (!isToday) return false;
      const sd = t.scheduledDate;
      return !sd || sd <= todayStr;
    }),
    'this-week': todos.filter(t => t.timeFrame === 'this-week' && (!t.goalPeriodKey || t.goalPeriodKey === currentWeekKey)),
    'this-month': todos.filter(t => t.timeFrame === 'this-month' && (!t.goalPeriodKey || t.goalPeriodKey === currentMonthKey)),
    'this-year': todos.filter(t => t.timeFrame === 'this-year' && (!t.goalPeriodKey || t.goalPeriodKey === currentYearKey)),
  };

  // Tasks scheduled for a future date — shown below "Today" until their date arrives
  const upcomingTasks = todos.filter(t => {
    const isToday = t.timeFrame === 'today' || !t.timeFrame;
    if (!isToday) return false;
    return t.scheduledDate && t.scheduledDate > todayStr;
  });

  const upcomingByDate = upcomingTasks.reduce((acc, t) => {
    if (!acc[t.scheduledDate]) acc[t.scheduledDate] = [];
    acc[t.scheduledDate].push(t);
    return acc;
  }, {});

  const upcomingSortedDates = Object.keys(upcomingByDate).sort();

  const getScheduledLabel = (dateStr) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(dateStr + 'T00:00:00');
    const diffDays = Math.round((target - today) / (1000 * 60 * 60 * 24));
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays <= 6) return `${target.toLocaleDateString(undefined, { weekday: 'long' })} · in ${diffDays} days`;
    return target.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  };

  // 7-day pill strip data
  const dayPills = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const dateStr = toLocalDateStr(d);
    const isToday = i === 0;
    const count = isToday ? grouped.today.length : (upcomingByDate[dateStr] || []).length;
    return {
      dateStr,
      abbrev: isToday ? 'Today' : d.toLocaleDateString(undefined, { weekday: 'short' }),
      dateNum: d.getDate(),
      isToday,
      count,
    };
  });

  // Tasks shown when a specific day is filtered
  const filteredDayTasks = dayFilter
    ? (dayFilter === todayStr ? grouped.today : (upcomingByDate[dayFilter] || []))
    : null;

  const renderTaskItem = (todo, opts = {}) => {
    const dueBadge = todo.dueDate ? getDueBadgeInfo(todo.dueDate, todo.completed) : null;
    const isUpcoming = opts.upcoming;
    return (
      <div
        key={todo.id}
        className={`task-item ${isUpcoming ? 'upcoming-task-item' : ''} ${selectedTask?.id === todo.id ? 'selected' : ''}`}
        onClick={() => setSelectedTask(todo)}
      >
        <div
          className={`task-checkbox ${isUpcoming ? 'upcoming-checkbox' : ''} ${todo.completed ? 'checked' : ''}`}
          onClick={(e) => !isUpcoming && checkOffTodo(todo.id, e)}
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
            className={`task-text ${isUpcoming ? 'upcoming-task-text' : ''} ${todo.completed ? 'completed-text' : ''}`}
            onDoubleClick={(e) => !isUpcoming && startEditTask(todo, e)}
          >
            {todo.text}
          </span>
        )}
        {dueBadge && (
          <span className={`task-due-badge ${dueBadge.isOverdue ? 'overdue' : dueBadge.isSoon ? 'soon' : ''}`} title={dueBadge.title}>
            {dueBadge.text}
          </span>
        )}
        <span className={`task-xp-badge ${isUpcoming ? 'upcoming-xp' : ''}`}>+{todo.xp || 20}XP</span>
        <span className="task-delete" onClick={(e) => deleteTodo(todo.id, e)}>×</span>
      </div>
    );
  };

  const renderGroup = (timeFrame, label) => {
    const items = grouped[timeFrame];
    return (
      <div className="task-group" key={timeFrame}>
        <div className="task-group-header">
          <span className="task-group-title">{label}</span>
          <span className="task-group-count">{items.length}</span>
        </div>
        {items.map((todo) => {
          const dueBadge = todo.dueDate ? getDueBadgeInfo(todo.dueDate, todo.completed) : null;
          return (
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
              {dueBadge && (
                <span
                  className={`task-due-badge ${dueBadge.isOverdue ? 'overdue' : dueBadge.isSoon ? 'soon' : ''}`}
                  title={dueBadge.title}
                >
                  {dueBadge.text}
                </span>
              )}
              <span className="task-xp-badge">+{todo.xp || XP_BY_TIMEFRAME[timeFrame] || 20}XP</span>
              <span className="task-delete" onClick={(e) => deleteTodo(todo.id, e)}>×</span>
            </div>
          );
        })}
      </div>
    );
  };

  const GROUP_FILTER_LABELS = {
    today: 'Day',
    'this-week': 'Week',
    'this-month': 'Month',
    'this-year': 'Year',
    all: 'All',
  };

  return (
    <>
      <div className="todo-header-row">
        <h1 className="section-page-title">To-Do</h1>
        <div className="tasks-view-tabs">
          {['today', 'this-week', 'this-month', 'this-year', 'all'].map((gf) => (
            <button
              key={gf}
              type="button"
              className={`tasks-view-tab ${groupFilter === gf ? 'tasks-view-tab--active' : ''}`}
              onClick={() => setGroupFilter(gf)}
            >
              {GROUP_FILTER_LABELS[gf]}
            </button>
          ))}
        </div>
      </div>

      {/* ── 7-Day Strip ─────────────────────────────────────────────────── */}
      <div className="day-strip">
        {dayPills.map(({ dateStr, abbrev, dateNum, isToday, count }) => (
          <button
            key={dateStr}
            type="button"
            className={`day-pill ${dayFilter === dateStr ? 'active' : ''} ${isToday ? 'is-today' : ''}`}
            onClick={() => setDayFilter(prev => prev === dateStr ? null : dateStr)}
          >
            <span className="day-pill-abbrev">{abbrev}</span>
            <span className="day-pill-num">{dateNum}</span>
            {count > 0 && <span className="day-pill-count">{count}</span>}
          </button>
        ))}
      </div>

      <div className="todo-card">
        {dayFilter ? (
          /* ── Filtered Day View ──────────────────────────────────────── */
          <div className="task-group">
            <div className="task-group-header">
              <span className="task-group-title">
                {dayFilter === todayStr ? 'Today' : getScheduledLabel(dayFilter)}
              </span>
              <span className="task-group-count">{filteredDayTasks.length}</span>
            </div>
            {filteredDayTasks.length === 0 ? (
              <div className="day-empty-state">No tasks scheduled for this day</div>
            ) : (
              filteredDayTasks.map(todo =>
                renderTaskItem(todo, { upcoming: dayFilter !== todayStr })
              )
            )}
          </div>
        ) : (
          /* ── Full View ──────────────────────────────────────────────── */
          <>
            {(groupFilter === 'all' || groupFilter === 'today') && renderGroup('today', 'Today')}

            {(groupFilter === 'all' || groupFilter === 'today') && upcomingSortedDates.length > 0 && (
              <div className="upcoming-section">
                <div className="upcoming-divider">
                  <div className="upcoming-divider-line" />
                  <span className="upcoming-divider-label">Upcoming</span>
                  <div className="upcoming-divider-line" />
                </div>
                {upcomingSortedDates.map(dateStr => (
                  <div className="task-group" key={dateStr}>
                    <div className="task-group-header">
                      <span className="task-group-title upcoming-date-title">
                        <span className="upcoming-dot"><Circle size={8} fill="currentColor" stroke="none" /></span>
                        {getScheduledLabel(dateStr)}
                      </span>
                      <span className="task-group-count">{upcomingByDate[dateStr].length}</span>
                    </div>
                    {upcomingByDate[dateStr].map(todo => renderTaskItem(todo, { upcoming: true }))}
                  </div>
                ))}
              </div>
            )}

            {(groupFilter === 'all' || groupFilter === 'this-week') && renderGroup('this-week', 'This Week')}
            {(groupFilter === 'all' || groupFilter === 'this-month') && renderGroup('this-month', 'This Month')}
            {(groupFilter === 'all' || groupFilter === 'this-year') && renderGroup('this-year', 'This Year')}
          </>
        )}

        <button className="add-task-btn" onClick={() => setShowAddModal(true)}>
          <span>+</span> Add a new task
        </button>
      </div>

      {showAddModal && (
        <AddTaskModal onClose={() => setShowAddModal(false)} onAdd={handleAddTodo} defaultScheduledDate={dayFilter} />
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
    </>
  );
};

// ─── Tasks Page ───────────────────────────────────────────────────────────────
const TasksPage = ({ onUpdateStat, todos, setTodos }) => {
  const [selectedTask, setSelectedTask] = useState(null);

  const liveSelectedTask = selectedTask
    ? todos.find(t => t.id === selectedTask.id) || null
    : null;

  return (
    <div className="tasks-page-container">
      <div className="tasks-layout">
        <TodoList
          onUpdateStat={onUpdateStat}
          todos={todos}
          setTodos={setTodos}
          selectedTask={liveSelectedTask}
          setSelectedTask={setSelectedTask}
        />
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
