import { useEffect, useState } from 'react';
import {
  Clock, PhoneOff, Bell, CheckSquare, Target, Flag, Compass, ArrowRight,
  Repeat, Smartphone, NotebookText, Handshake, Flame, X, Check, Hourglass, Pin,
} from 'lucide-react';
import './WelcomePage.css';
import welcomeBg from '../assets/ApexStudios.png';
import {
  toDateKey, parseDateKey, buildDayEventTargetMs, fmtRemaining,
  expandEventsForDates, isInstanceCompleted,
} from '../utils/calendarUtils';
import { getGoalProgress } from '../utils/goalUtils';
import { computeDailyScore, computeStreak } from '../utils/scoreUtils';

const getGreeting = (hour) => {
  if (hour < 5) return 'Good night';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 21) return 'Good evening';
  return 'Good night';
};

const KIND_META = {
  event: { icon: Clock, label: 'Time block' },
  block: { icon: PhoneOff, label: 'No Phone' },
  reminder: { icon: Bell, label: 'Reminder' },
};

const getNextUp = ({ calendarEvents, noPhoneBlocks, calendarDayEvents, now }) => {
  const nowMs = now.getTime();
  const todayKey = toDateKey(now);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateKeys = [todayKey, toDateKey(tomorrow)];

  const toRange = (ev, kind) => {
    const parts = parseDateKey(ev._instanceDate);
    if (!parts) return null;
    const { y, m, d } = parts;
    return {
      kind,
      id: `${kind}-${ev.id}-${ev._instanceDate}`,
      label: ev.title ?? ev.label ?? 'Untitled',
      startMs: new Date(y, m - 1, d, ev.startHour, ev.startMin, 0, 0).getTime(),
      endMs: new Date(y, m - 1, d, ev.endHour, ev.endMin, 0, 0).getTime(),
    };
  };

  const events = expandEventsForDates(calendarEvents || [], dateKeys)
    .filter((ev) => !isInstanceCompleted(ev))
    .map((ev) => toRange(ev, 'event'))
    .filter(Boolean);
  const blocks = expandEventsForDates(noPhoneBlocks || [], dateKeys)
    .filter((ev) => !isInstanceCompleted(ev))
    .map((ev) => toRange(ev, 'block'))
    .filter(Boolean);
  const reminders = dateKeys.flatMap((dk) =>
    (calendarDayEvents?.[dk] || []).map((ev) => {
      const t = buildDayEventTargetMs(dk, ev.time);
      return t ? { kind: 'reminder', id: `reminder-${ev.id}-${dk}`, label: ev.title || 'Untitled', startMs: t, endMs: t } : null;
    }).filter(Boolean)
  );

  const noPhoneNow = blocks.some((b) => b.startMs <= nowMs && nowMs < b.endMs);

  const activeEvent = events.find((e) => e.startMs <= nowMs && nowMs < e.endMs);
  if (activeEvent) return { ...activeEvent, isNow: true, noPhoneActive: noPhoneNow };

  // Prefer whatever's coming up next over a bare "No Phone" card — the badge
  // below already signals the No Phone period is still active.
  const upcoming = [...events, ...blocks, ...reminders]
    .filter((c) => c.startMs > nowMs)
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs)[0];
  if (upcoming) return { ...upcoming, isNow: false, noPhoneActive: noPhoneNow };

  const activeBlock = blocks.find((b) => b.startMs <= nowMs && nowMs < b.endMs);
  if (activeBlock) return { ...activeBlock, isNow: true, noPhoneActive: true };

  return null;
};

const SCORE_CHIP_ICON = { habits: Repeat, tasks: CheckSquare, screentime: Smartphone, log: NotebookText, commitment: Handshake };

function DailyScoreHero({ habits, xpLog, logs, commitmentArchive, healthLog, onNavigate }) {
  const { score, breakdown } = computeDailyScore(
    habits || [], xpLog || [], logs || {}, commitmentArchive || [], healthLog || {}
  );
  const streak = computeStreak(
    habits || [], xpLog || [], logs || {}, commitmentArchive || [], healthLog || {}
  );
  const color = score >= 8 ? '#30d158' : score >= 5 ? '#ff9f0a' : '#ff453a';
  const R = 46;
  const C = 2 * Math.PI * R;
  const pct = score / 10;

  return (
    <button className="wp-score-hero" onClick={() => onNavigate('statistics')} title="Open your character sheet">
      <div className="wp-score-head">
        <div className="wp-score-ring-wrap">
          <svg width="120" height="120" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r={R} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="8" />
            <circle
              cx="60" cy="60" r={R} fill="none"
              stroke={color} strokeWidth="8" strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={C * (1 - pct)}
              style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%', transition: 'stroke-dashoffset 0.6s ease' }}
            />
          </svg>
          <div className="wp-score-ring-center">
            <span className="wp-score-number" style={{ color }}>{score.toFixed(1)}</span>
            <span className="wp-score-outof">/ 10</span>
          </div>
        </div>
        <div className="wp-score-body">
          <span className="wp-score-title">Today's Score</span>
          <span className="wp-score-streak">
            {streak > 0 ? <><Flame size={13} /> {streak}-day streak</> : 'No streak yet — clear 6+ to start'}
          </span>
        </div>
      </div>
      <div className="wp-score-chips">
        {Object.entries(breakdown).map(([key, { value, label }]) => {
          const ChipIcon = SCORE_CHIP_ICON[key];
          return (
            <span key={key} className="wp-score-chip" data-tier={value >= 7 ? 'good' : value >= 4 ? 'mid' : 'low'}>
              <span className="wp-score-chip-icon"><ChipIcon size={12} /></span>{label}
            </span>
          );
        })}
      </div>
    </button>
  );
}

function NextUpCard({ calendarEvents, noPhoneBlocks, calendarDayEvents, onNavigate }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  const nextUp = getNextUp({ calendarEvents, noPhoneBlocks, calendarDayEvents, now });
  const nowMs = now.getTime();

  if (!nextUp) {
    return (
      <div className="wp-hero wp-hero--empty">
        <div className="wp-hero-label">Next Up</div>
        <div className="wp-hero-empty-text">Nothing scheduled — enjoy the open time.</div>
        <button className="wp-hero-cta" onClick={() => onNavigate('calendar')}>
          Open Calendar <ArrowRight size={14} />
        </button>
      </div>
    );
  }

  const { icon: Icon } = KIND_META[nextUp.kind];
  const todayKey = toDateKey(now);
  const dayLabel = toDateKey(new Date(nextUp.startMs)) === todayKey ? 'Today' : 'Tomorrow';

  return (
    <button className={`wp-hero ${nextUp.isNow ? 'wp-hero--now' : ''}`} onClick={() => onNavigate('calendar')}>
      <div className="wp-hero-label">{nextUp.isNow ? 'Happening now' : 'Next Up'}</div>
      <div className="wp-hero-title">
        <Icon size={20} strokeWidth={2.5} />
        <span>{nextUp.label}</span>
        {nextUp.noPhoneActive && nextUp.kind !== 'block' && (
          <span className="wp-hero-badge"><PhoneOff size={11} strokeWidth={2.5} /> No Phone Zone</span>
        )}
      </div>
      <div className="wp-hero-meta">
        {nextUp.isNow
          ? `Ends in ${fmtRemaining(nextUp.endMs, nowMs)}`
          : `${dayLabel} · in ${fmtRemaining(nextUp.startMs, nowMs)}`}
      </div>
    </button>
  );
}

function TodayTasksTile({ todos, onNavigate, setTodos, onUpdateStat }) {
  const todayStr = toDateKey(new Date());
  const todayTasks = (todos || []).filter((t) => {
    if (t.completed) return false;
    const isToday = t.timeFrame === 'today' || !t.timeFrame;
    return isToday && (!t.scheduledDate || t.scheduledDate <= todayStr);
  });

  const completeTask = (task, e) => {
    e.stopPropagation();
    if (task.completed) return;
    const cats = task.categories || (task.category ? [task.category] : []);
    if (task.goalId) {
      setTodos((prev) => prev.map((t) => (t.id === task.id ? { ...t, completed: true } : t)));
    } else {
      setTodos((prev) => prev.filter((t) => t.id !== task.id));
    }
    if (cats.length > 0) {
      const xpEach = Math.floor(task.xp / cats.length);
      cats.forEach((cat) => onUpdateStat(cat, xpEach, { source: 'task', label: task.text }));
    }
  };

  return (
    <div className="wp-tile wp-tile--tasks">
      <button className="wp-tile-header wp-tile-header-btn" onClick={() => onNavigate('tasks')}>
        <CheckSquare size={16} strokeWidth={2.5} />
        <span>Today's Tasks</span>
      </button>
      {todayTasks.length === 0 ? (
        <div className="wp-tile-empty">All clear</div>
      ) : (
        <>
          <div className="wp-tile-headline">{todayTasks.length} remaining</div>
          <ul className="wp-task-list">
            {todayTasks.slice(0, 5).map((t) => (
              <li key={t.id} className="wp-task-row">
                <button
                  className="wp-task-checkbox"
                  aria-label={`Complete ${t.text}`}
                  onClick={(e) => completeTask(t, e)}
                />
                <span className="wp-task-text">{t.text}</span>
              </li>
            ))}
          </ul>
          {todayTasks.length > 2 && <span className="wp-tile-more">+{todayTasks.length - 2} more</span>}
        </>
      )}
    </div>
  );
}

function CommitmentTile({ logs, commitmentArchive, onNavigate, onResolveCommitment }) {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = toDateKey(yesterday);
  const commitmentText = logs?.[yesterdayKey]?.commitment?.trim();
  const record = (commitmentArchive || []).find((a) => a.date === yesterdayKey);
  const isPending = Boolean(commitmentText) && record?.denied !== true && !record?.confirmedOn;

  return (
    <div className="wp-tile wp-tile--commitment">
      <button type="button" className="wp-tile-inner" onClick={() => onNavigate('statistics')}>
        <div className="wp-tile-header">
          <Flag size={16} strokeWidth={2.5} />
          <span>Yesterday's Commitment</span>
        </div>
        {commitmentText ? (
          <>
            <div className="wp-tile-text">{commitmentText}</div>
            {record?.denied === true ? (
              <div className="wp-tile-status wp-tile-status--missed"><X size={14} /> Missed</div>
            ) : record?.confirmedOn ? (
              <div className="wp-tile-status wp-tile-status--kept"><Check size={14} /> Kept</div>
            ) : (
              <div className="wp-tile-status wp-tile-status--pending"><Hourglass size={14} /> Pending check-in</div>
            )}
          </>
        ) : (
          <div className="wp-tile-empty">No commitment logged</div>
        )}
      </button>
      {isPending && (
        <div className="wp-commitment-actions">
          <button
            type="button"
            className="wp-commitment-btn wp-commitment-btn--kept"
            onClick={() => onResolveCommitment(yesterdayKey, commitmentText, false)}
          >
            I kept it
          </button>
          <button
            type="button"
            className="wp-commitment-btn wp-commitment-btn--missed"
            onClick={() => onResolveCommitment(yesterdayKey, commitmentText, true)}
          >
            I didn't do it
          </button>
        </div>
      )}
    </div>
  );
}

const GOAL_PERIOD_LABEL = { weekly: 'This Week', monthly: 'This Month', yearly: 'This Year' };

const getCurrentGoalPeriodKey = (period, now) => {
  if (period === 'weekly') {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return toDateKey(d);
  }
  if (period === 'monthly') return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  if (period === 'yearly') return String(now.getFullYear());
  return null;
};

function GoalsTile({ goals, onNavigate }) {
  const now = new Date();
  const activeGoals = (goals || [])
    .filter((g) => {
      if (g.completed) return false;
      const currentKey = getCurrentGoalPeriodKey(g.period, now);
      return currentKey !== null && g.periodKey === currentKey;
    })
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));

  return (
    <button className="wp-tile wp-tile--goals" onClick={() => onNavigate('goals')}>
      <div className="wp-tile-header">
        <Compass size={16} strokeWidth={2.5} />
        <span>Goals</span>
      </div>
      {activeGoals.length === 0 ? (
        <div className="wp-tile-empty">No active goals</div>
      ) : (
        <>
          <ul className="wp-task-list">
            {activeGoals.slice(0, 6).map((g) => {
              const progress = getGoalProgress(g);
              return (
                <li key={g.id} className="wp-goal-row">
                  {g.pinned && <span className="wp-goal-pin"><Pin size={12} /></span>}
                  <span className="wp-goal-period">{GOAL_PERIOD_LABEL[g.period]}</span>
                  <span className="wp-goal-title">{g.title}</span>
                  {progress.kind !== 'binary' && (
                    <span className="wp-goal-progress-bar">
                      <span className="wp-goal-progress-fill" style={{ width: `${Math.round(progress.ratio * 100)}%` }} />
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          {activeGoals.length > 2 && <span className="wp-tile-more">+{activeGoals.length - 2} more</span>}
        </>
      )}
    </button>
  );
}

function PriorityTile({ currentWeekPriority, onNavigate }) {
  return (
    <button className="wp-tile" onClick={() => onNavigate('review')}>
      <div className="wp-tile-header">
        <Target size={16} strokeWidth={2.5} />
        <span>This Week's Priority</span>
      </div>
      {currentWeekPriority ? (
        <div className="wp-tile-text">{currentWeekPriority}</div>
      ) : (
        <div className="wp-tile-empty">No priority set</div>
      )}
    </button>
  );
}

function LiveClock({ dateLabel }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const h24 = now.getHours();
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 || 12;
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');

  return (
    <div className="wp-clock">
      <span className="wp-clock-time" role="timer" aria-live="off" aria-label={`Current time ${h12}:${mm} ${ampm}`}>
        <span>{h12}</span><span className="wp-clock-colon">:</span>
        <span>{mm}</span><span className="wp-clock-colon">:</span>
        <span>{ss}</span>
        <span className="wp-clock-ampm">{ampm}</span>
      </span>
      <div className="wp-clock-date">{dateLabel}</div>
    </div>
  );
}

function CompactClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  const h24 = now.getHours();
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 || 12;
  const mm = String(now.getMinutes()).padStart(2, '0');

  return (
    <span className="wp-topbar-clock" role="timer" aria-live="off" aria-label={`Current time ${h12}:${mm} ${ampm}`}>
      {h12}:{mm} {ampm}
    </span>
  );
}

export default function WelcomePage({
  user,
  todos,
  setTodos,
  onUpdateStat,
  calendarEvents,
  noPhoneBlocks,
  calendarDayEvents,
  currentWeekPriority,
  logs,
  commitmentArchive,
  goals,
  habits,
  xpLog,
  healthLog,
  onNavigate,
  onResolveCommitment,
}) {
  const [now] = useState(() => new Date());
  const dateLabel = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="wp-bg" style={{ backgroundImage: `url(${welcomeBg})` }}>
      <div className="wp-layout">
        <div className="wp-topbar">
          <h1 className="wp-topbar-greeting">{getGreeting(now.getHours())}, {user?.name || 'there'}</h1>
          <CompactClock />
        </div>

        <div className="wp-top-grid">
          <DailyScoreHero
            habits={habits}
            xpLog={xpLog}
            logs={logs}
            commitmentArchive={commitmentArchive}
            healthLog={healthLog}
            onNavigate={onNavigate}
          />
          <NextUpCard
            calendarEvents={calendarEvents}
            noPhoneBlocks={noPhoneBlocks}
            calendarDayEvents={calendarDayEvents}
            onNavigate={onNavigate}
          />
        </div>

        <div className="wp-clock-zone">
          <LiveClock dateLabel={dateLabel} />
        </div>

        <div className="wp-bottom-grid">
          <TodayTasksTile todos={todos} onNavigate={onNavigate} setTodos={setTodos} onUpdateStat={onUpdateStat} />
          <GoalsTile goals={goals} onNavigate={onNavigate} />
          <div className="wp-bottom-side">
            <CommitmentTile logs={logs} commitmentArchive={commitmentArchive} onNavigate={onNavigate} onResolveCommitment={onResolveCommitment} />
            <PriorityTile currentWeekPriority={currentWeekPriority} onNavigate={onNavigate} />
          </div>
        </div>
      </div>
    </div>
  );
}
