import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './TasksPage.css';
import { Star, Play, ChevronDown, History, CheckCircle2, Sun, CalendarDays, Layers } from 'lucide-react';
import TaskRow from './tasks/TaskRow';
import TaskDetail from './tasks/TaskDetail';
import QuickAdd from './tasks/QuickAdd';
import { completeTask } from '../utils/completionUtils';
import { getActiveGoals } from '../utils/goalUtils';
import {
  TOP_LIMIT, todayKey, bucketTasks, countTaskCompletions, isOnToday, bringToTodayFields, whenFields,
  makeTask, migrateLegacyTomorrow, upcomingKey, dayLabel, periodLabel, TIMEFRAME_LABELS, shiftDateKey,
} from '../utils/taskUtils';

// The Daily Score gives full task points at 3 finished tasks (scoreUtils).
const DAILY_TARGET = 3;
const UNDO_MS = 5000;
const WIDE_QUERY = '(min-width: 1100px)';

const VIEWS = [
  { id: 'today', label: 'Today', Icon: Sun },
  { id: 'upcoming', label: 'Upcoming', Icon: CalendarDays },
  { id: 'later', label: 'Later', Icon: Layers },
];
// Where a quick-add lands by default on each view.
const DEFAULT_WHEN = { today: 'today', upcoming: 'tomorrow', later: 'this-week' };
const LATER_ORDER = ['this-week', 'this-month', 'this-year'];
const viewOf = (task, today) => (isOnToday(task, today) ? 'today' : task.timeFrame === 'today' ? 'upcoming' : 'later');

const useMediaQuery = (query) => {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
};

const Section = ({ title, icon, count, hint, tone, children }) => (
  <section className={`tk-section${tone ? ` tk-section--${tone}` : ''}`}>
    <header className="tk-section-head">
      <h3 className="tk-section-title">{icon}{title}</h3>
      {count != null && <span className="tk-section-count">{count}</span>}
    </header>
    {hint && <p className="tk-section-hint">{hint}</p>}
    <div className="tk-list">{children}</div>
  </section>
);

// ─── Today's progress + the one thing to do next ──────────────────────────────
const TodayHero = ({ doneCount, next, onSelect, onStartFocus, openCount }) => {
  const left = Math.max(0, DAILY_TARGET - doneCount);
  const caption = doneCount >= DAILY_TARGET
    ? 'Full task points on your Daily Score. Everything else is a bonus.'
    : doneCount === 0
      ? `Finish ${DAILY_TARGET} tasks today for full task points on your Daily Score.`
      : `${left} more for full task points on your Daily Score.`;
  return (
    <div className="tk-hero">
      <div className="tk-hero-progress">
        <div className="tk-hero-count">
          <strong>{doneCount}</strong><span>{doneCount > DAILY_TARGET ? ' done today' : `/${DAILY_TARGET} done today`}</span>
        </div>
        <div className="tk-bar" aria-hidden="true">
          {Array.from({ length: DAILY_TARGET }, (_, i) => <span key={i} className={`tk-bar-seg${i < doneCount ? ' tk-bar-seg--on' : ''}`} />)}
        </div>
        <p className="tk-hero-caption">{caption}</p>
      </div>
      <div className="tk-next">
        {next ? (
          <>
            <span className="tk-next-label">Next up</span>
            <button type="button" className="tk-next-text" onClick={() => onSelect(next)}>{next.text}</button>
            <button type="button" className="tk-btn tk-btn--primary tk-next-go" onClick={() => onStartFocus(next)}>
              <Play size={14} fill="currentColor" /> Start focus
            </button>
          </>
        ) : (
          <>
            <span className="tk-next-label">Next up</span>
            <p className="tk-next-empty">
              {openCount === 0 && doneCount > 0 ? "Today's list is clear. Nice work." : 'Nothing on today yet. Add what would make today a win.'}
            </p>
          </>
        )}
      </div>
    </div>
  );
};

// ─── Desktop side column when no task is open ─────────────────────────────────
const MiniRow = ({ task, hint, today, onSelect }) => (
  <button type="button" className="tk-mini" onClick={() => onSelect(task)}>
    <span className={`tk-mini-dot${task.topDate === today ? ' tk-mini-dot--top' : ''}`} />
    <span className="tk-mini-text">{task.text}</span>
    {hint && <span className="tk-mini-hint">{hint}</span>}
  </button>
);

const Glance = ({ view, buckets, today, onSelect, onView }) => {
  if (view === 'today') {
    const weekEnd = shiftDateKey(today, 7);
    const soon = buckets.upcoming.filter((t) => (upcomingKey(t) || '') <= weekEnd);
    const laterCount = LATER_ORDER.reduce((n, k) => n + buckets.later[k].length, 0);
    return (
      <div className="tk-glance">
        <h3 className="tk-glance-title">Coming up</h3>
        {soon.length === 0 ? (
          <p className="tk-glance-empty">Nothing scheduled for the next 7 days.</p>
        ) : soon.slice(0, 8).map((t) => <MiniRow key={t.id} task={t} hint={dayLabel(upcomingKey(t), today)} today={today} onSelect={onSelect} />)}
        {soon.length > 8 && <button type="button" className="tk-glance-link" onClick={() => onView('upcoming')}>+{soon.length - 8} more</button>}
        <button type="button" className="tk-glance-link" onClick={() => onView('later')}>
          {laterCount ? `${laterCount} longer-term task${laterCount === 1 ? '' : 's'} in Later` : 'Nothing in Later'}
        </button>
        <p className="tk-glance-tip">Tip: press <kbd>N</kbd> to add a task. Tap a task to see its details.</p>
      </div>
    );
  }
  const queue = [...buckets.top, ...buckets.carried, ...buckets.today];
  return (
    <div className="tk-glance">
      <h3 className="tk-glance-title">Still on today</h3>
      {queue.length === 0 ? <p className="tk-glance-empty">Today's list is clear.</p>
        : queue.slice(0, 8).map((t) => <MiniRow key={t.id} task={t} today={today} onSelect={onSelect} />)}
      <button type="button" className="tk-glance-link" onClick={() => onView('today')}>Open Today</button>
    </div>
  );
};

// ─── Tasks Page ───────────────────────────────────────────────────────────────
const TasksPage = ({ todos, setTodos, onLogActivity, xpLog = [], goals = [], onStartFocus }) => {
  const today = todayKey();
  const wide = useMediaQuery(WIDE_QUERY);
  const [view, setView] = useState('today');
  const [selectedId, setSelectedId] = useState(null);
  const [doneOpen, setDoneOpen] = useState(false);
  const [pendingId, setPendingId] = useState(null);
  const [toast, setToast] = useState(null);
  const pendingRef = useRef(null); // { id, done, timer } — a completion waiting out its Undo window
  const toastTimer = useRef(null);
  const addInputRef = useRef(null);

  // Old 'tomorrow' tasks get a real date (they used to jump into today on open).
  useEffect(() => {
    setTodos((prev) => migrateLegacyTomorrow(prev, todayKey()));
  }, [setTodos]);

  const buckets = useMemo(() => bucketTasks(todos, today), [todos, today]);
  const activeGoals = useMemo(() => getActiveGoals(goals), [goals]);
  const goalTitles = useMemo(() => Object.fromEntries((goals || []).map((g) => [String(g.id), g.title])), [goals]);
  const selectedTask = selectedId != null ? todos.find((t) => t.id === selectedId) || null : null;
  const topFull = buckets.top.length >= TOP_LIMIT;

  // ── Feedback ──
  const showToast = useCallback((next, ms = 2600) => {
    clearTimeout(toastTimer.current);
    setToast({ ...next, key: Date.now() });
    toastTimer.current = setTimeout(() => setToast(null), ms);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // ── Completing (one tap, paid after the Undo window) ──
  const commitPending = useCallback(() => {
    const p = pendingRef.current;
    if (!p) return;
    clearTimeout(p.timer);
    pendingRef.current = null;
    if (p.done.award) onLogActivity(p.done.award.amount, p.done.award);
    setTodos(p.done.update);
    setPendingId(null);
  }, [onLogActivity, setTodos]);

  // Leaving the page or backgrounding the app pays out immediately, never drops it.
  useEffect(() => () => commitPending(), [commitPending]);
  useEffect(() => {
    const onHide = () => { if (document.hidden) commitPending(); };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [commitPending]);

  const cancelPending = () => {
    const p = pendingRef.current;
    if (!p) return;
    clearTimeout(p.timer);
    pendingRef.current = null;
    setPendingId(null);
  };

  const complete = (task) => {
    if (pendingRef.current?.id === task.id) return;
    commitPending();
    const done = completeTask(task);
    if (!done) return;
    pendingRef.current = { id: task.id, done, timer: setTimeout(commitPending, UNDO_MS) };
    setPendingId(task.id);
    if (!wide && selectedId === task.id) setSelectedId(null);
    showToast({ text: 'Done', sub: task.text, undo: cancelPending }, UNDO_MS);
  };

  // ── Edits ──
  const patch = (id, fields) => setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, ...fields } : t)));

  const add = ({ text, when, top, goalId }) => {
    const task = { ...makeTask({ text, when, top: top && !topFull }, today), ...(goalId != null ? { goalId } : {}) };
    setTodos((prev) => [...prev, task]);
    if (viewOf(task, today) !== view) {
      const where = task.timeFrame === 'today' ? (task.scheduledDate ? dayLabel(task.scheduledDate, today) : 'Today') : TIMEFRAME_LABELS[task.timeFrame];
      showToast({ text: `Added to ${where}`, sub: text });
    }
  };

  const remove = (task) => {
    if (pendingRef.current?.id === task.id) cancelPending();
    const index = todos.findIndex((t) => t.id === task.id);
    setTodos((prev) => prev.filter((t) => t.id !== task.id));
    if (selectedId === task.id) setSelectedId(null);
    showToast({
      text: 'Task deleted',
      sub: task.text,
      undo: () => setTodos((prev) => (prev.some((t) => t.id === task.id) ? prev : [...prev.slice(0, index), task, ...prev.slice(index)])),
    }, UNDO_MS);
  };

  const move = (task, when) => {
    // goalPeriodKey pinned old goal tasks to a week/month/year; a move frees them.
    const fields = { ...whenFields(when, today), goalPeriodKey: null };
    patch(task.id, fields);
    if (view === 'today' && when !== 'today') {
      const where = fields.timeFrame === 'today' ? dayLabel(fields.scheduledDate, today) : TIMEFRAME_LABELS[fields.timeFrame];
      showToast({ text: `Moved to ${where}`, sub: task.text });
    }
  };

  const bringToToday = (task) => {
    patch(task.id, bringToTodayFields(task, today));
    if (view !== 'today') showToast({ text: 'On today’s list', sub: task.text });
  };

  const toggleTop = (task) => {
    if (task.topDate === today) { patch(task.id, { topDate: null, topAt: null }); return; }
    if (topFull) { showToast({ text: 'Top 3 is full', sub: 'Unstar one to make room.' }); return; }
    patch(task.id, { ...(isOnToday(task, today) ? {} : bringToTodayFields(task, today)), topDate: today, topAt: Date.now() });
  };

  // ── Keyboard: N focuses the add bar, Esc closes details ──
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target.tagName;
      if (e.key === 'Escape' && selectedId != null && tag !== 'INPUT' && tag !== 'TEXTAREA') { setSelectedId(null); return; }
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.altKey || e.metaKey || e.ctrlKey) return;
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); addInputRef.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId]);

  // The phone sheet owns the scroll while it's open.
  const sheetOpen = !wide && !!selectedTask;
  useEffect(() => {
    if (!sheetOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [sheetOpen]);

  // ── Derived ──
  const doneCount = countTaskCompletions(xpLog, today) + (pendingId != null ? 1 : 0);
  const queue = [...buckets.top, ...buckets.carried, ...buckets.today];
  const next = queue.find((t) => t.id !== pendingId) || null;
  const laterTotal = LATER_ORDER.reduce((n, k) => n + buckets.later[k].length, 0);
  const counts = { today: queue.length, upcoming: buckets.upcoming.length, later: laterTotal };

  const select = (task) => setSelectedId((id) => (id === task.id && wide ? null : task.id));

  const row = (task, extra = {}) => (
    <TaskRow
      key={task.id}
      task={task}
      today={today}
      pending={pendingId === task.id}
      selected={selectedId === task.id}
      goalTitle={task.goalId != null ? goalTitles[String(task.goalId)] : null}
      onComplete={complete}
      onToggleTop={toggleTop}
      onSelect={select}
      onToday={bringToToday}
      onTomorrow={(t) => move(t, 'tomorrow')}
      onDrop={remove}
      {...extra}
    />
  );

  const renderToday = () => {
    const hasOpen = queue.length > 0;
    return (
      <>
        <TodayHero doneCount={doneCount} next={next} openCount={queue.length} onSelect={select} onStartFocus={onStartFocus} />

        {(hasOpen || buckets.top.length > 0) && (
          <Section
            title="Top 3"
            icon={<Star size={14} fill="currentColor" />}
            count={`${buckets.top.length}/${TOP_LIMIT}`}
            tone="top"
          >
            {buckets.top.map((t) => row(t, { showTimeframe: true }))}
            {buckets.top.length < TOP_LIMIT && (
              <p className="tk-slot">
                {buckets.top.length === 0
                  ? 'Tap the star on the 1–3 tasks that must happen today.'
                  : `Room for ${TOP_LIMIT - buckets.top.length} more. Star it below.`}
              </p>
            )}
          </Section>
        )}

        {buckets.carried.length > 0 && (
          <Section
            title="Carried over"
            icon={<History size={14} />}
            count={buckets.carried.length}
            hint="Still here from earlier days. Keep it, push it, or drop it."
            tone="carried"
          >
            {buckets.carried.map((t) => row(t, { variant: 'carried' }))}
          </Section>
        )}

        {buckets.today.length > 0 && (
          <Section title={buckets.top.length || buckets.carried.length ? 'Also today' : 'Today'} count={buckets.today.length}>
            {buckets.today.map((t) => row(t, { showTimeframe: true }))}
          </Section>
        )}

        {buckets.doneToday.length > 0 && (
          <section className="tk-section tk-section--done">
            <button type="button" className="tk-done-toggle" aria-expanded={doneOpen} onClick={() => setDoneOpen((o) => !o)}>
              <CheckCircle2 size={14} /> Done today <span className="tk-section-count">{buckets.doneToday.length}</span>
              <ChevronDown size={15} className={`tk-done-chev${doneOpen ? ' tk-done-chev--open' : ''}`} />
            </button>
            {doneOpen && <div className="tk-list">{buckets.doneToday.map((t) => row(t))}</div>}
          </section>
        )}
      </>
    );
  };

  const renderUpcoming = () => {
    if (!buckets.upcoming.length) {
      return <p className="tk-empty">Nothing scheduled ahead. Pick <strong>Tomorrow</strong> or <strong>Pick day</strong> when you add a task.</p>;
    }
    const byDay = [];
    for (const t of buckets.upcoming) {
      const key = upcomingKey(t) || today;
      const last = byDay[byDay.length - 1];
      if (last && last.key === key) last.tasks.push(t);
      else byDay.push({ key, tasks: [t] });
    }
    return byDay.map(({ key, tasks }) => (
      <Section key={key} title={dayLabel(key, today)} count={tasks.length}>
        {tasks.map((t) => row(t, { variant: 'ahead' }))}
      </Section>
    ));
  };

  const renderLater = () => {
    if (!laterTotal) {
      return <p className="tk-empty">No longer-term tasks. Add one with <strong>This week</strong>, <strong>This month</strong> or <strong>This year</strong>. When it's time, tap <strong>Today</strong> to pull it onto today's list.</p>;
    }
    return LATER_ORDER.filter((k) => buckets.later[k].length).map((k) => (
      <Section key={k} title={TIMEFRAME_LABELS[k]} count={buckets.later[k].length} hint={periodLabel(k, today)}>
        {buckets.later[k].map((t) => row(t, { variant: 'ahead' }))}
      </Section>
    ));
  };

  const detail = selectedTask && (
    <TaskDetail
      key={selectedTask.id}
      task={selectedTask}
      today={today}
      goals={goals}
      topFull={topFull}
      pending={pendingId === selectedTask.id}
      onPatch={(fields) => patch(selectedTask.id, fields)}
      onMove={(when) => move(selectedTask, when)}
      onComplete={complete}
      onDelete={remove}
      onToggleTop={toggleTop}
      onStartFocus={onStartFocus}
      onClose={() => setSelectedId(null)}
      onLogActivity={onLogActivity}
      onToast={showToast}
    />
  );

  const dateLine = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="tk-page">
      <div className="tk-layout">
        <main className="tk-main">
          <header className="tk-head">
            <div>
              <h1 className="tk-title">Tasks</h1>
              <p className="tk-date">{dateLine}</p>
            </div>
          </header>

          <nav className="tk-tabs" aria-label="Task views">
            {VIEWS.map((v) => {
              const { Icon } = v;
              return (
                <button
                  key={v.id}
                  type="button"
                  className={`tk-tab${view === v.id ? ' tk-tab--on' : ''}`}
                  aria-pressed={view === v.id}
                  onClick={() => setView(v.id)}
                >
                  <Icon size={14} /> {v.label}
                  {counts[v.id] > 0 && <span className="tk-tab-count">{counts[v.id]}</span>}
                </button>
              );
            })}
          </nav>

          <QuickAdd today={today} defaultWhen={DEFAULT_WHEN[view]} topFull={topFull} goals={activeGoals} onAdd={add} inputRef={addInputRef} />

          <div className="tk-view">
            {view === 'today' && renderToday()}
            {view === 'upcoming' && renderUpcoming()}
            {view === 'later' && renderLater()}
          </div>
        </main>

        {wide && (
          <aside className="tk-aside">
            {detail || <Glance view={view} buckets={buckets} today={today} onSelect={select} onView={setView} />}
          </aside>
        )}
      </div>

      {sheetOpen && (
        <div className="tk-sheet-wrap" role="dialog" aria-modal="true" aria-label="Task details">
          <div className="tk-sheet-backdrop" onClick={() => setSelectedId(null)} />
          <div className="tk-sheet">
            <div className="tk-sheet-grip" aria-hidden="true" />
            {detail}
          </div>
        </div>
      )}

      {toast && (
        <div className="tk-toast-wrap" aria-live="polite">
          <div key={toast.key} className="tk-toast">
            <div className="tk-toast-body">
              <span className="tk-toast-text">{toast.text}</span>
              {toast.sub && <span className="tk-toast-sub">{toast.sub}</span>}
            </div>
            {toast.undo && (
              <button
                type="button"
                className="tk-toast-undo"
                onClick={() => { toast.undo(); clearTimeout(toastTimer.current); setToast(null); }}
              >
                Undo
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TasksPage;
