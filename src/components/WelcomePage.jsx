import {
  Clock, PhoneOff, Bell, CheckSquare, Target, Flag, Compass, ArrowRight, Play, CalendarPlus,
  Repeat, Moon, NotebookText, Handshake, Flame, X, Check, Hourglass, Sparkles, RotateCw, Star, CalendarCheck, FlaskConical, Smartphone,
} from 'lucide-react';
import './WelcomePage.css';
import { toDateKey, fmtRemaining, getPendingCheckIns } from '../utils/calendarUtils';
import BlockCheckIn from './calendar/BlockCheckIn';
import { getGoalProgress, getFocusGoals, getGoalActivity, getGoalStatus, daysLeft } from '../utils/goalUtils';
import { getHabitStreak } from '../utils/habitUtils';
import { computeDailyScore, computeStreak, scoreColor } from '../utils/scoreUtils';
import {
  getDayMode, getNextUp, getYesterdayCommitment, getNextMove, getCloseDaySteps,
} from '../utils/homeUtils';
import { todayQueue } from '../utils/taskUtils';
import { getExperimentTicks } from '../utils/weeklyReset';
import { useNow } from '../hooks/useNow';

const getGreeting = (hour) => {
  if (hour < 5) return 'Good night';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 21) return 'Good evening';
  return 'Good night';
};

const KIND_ICON = { event: Clock, block: PhoneOff, reminder: Bell };

const fmtClock = (ms) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const fmtSpan = (item) => (item.startMs === item.endMs ? fmtClock(item.startMs) : `${fmtClock(item.startMs)} – ${fmtClock(item.endMs)}`);

// ── Top bar ──────────────────────────────────────────────────────────────────
function TopBar({ name, now }) {
  const date = now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return (
    <header className="wp-topbar">
      <h1 className="wp-topbar-greeting">{getGreeting(now.getHours())}, {name || 'there'}</h1>
      <span className="wp-topbar-when" aria-label={`${date}, ${time}`}>
        <span className="wp-topbar-date">{date} · </span>
        <span className="wp-topbar-clock">{time}</span>
      </span>
    </header>
  );
}

// ── AI one-liner ─────────────────────────────────────────────────────────────
function BriefLine({ brief, loading, onRefresh }) {
  if (!brief && !loading) return null;
  return (
    <div className={`wp-brief ${loading ? 'wp-brief--loading' : ''}`} aria-live="polite">
      <Sparkles size={15} className="wp-brief-icon" aria-hidden="true" />
      <p className="wp-brief-text">{loading ? 'Reading your day…' : brief.text}</p>
      {!loading && onRefresh && (
        <button type="button" className="wp-brief-refresh" onClick={onRefresh} title="Write a fresh line" aria-label="Write a fresh line">
          <RotateCw size={13} />
        </button>
      )}
    </div>
  );
}

// ── Now panel ────────────────────────────────────────────────────────────────
function NoPhoneBadge({ until, nowMs }) {
  return (
    <span className="wp-now-badge">
      <PhoneOff size={11} strokeWidth={2.5} /> No Phone{until ? ` · ${fmtRemaining(until, nowMs)} left` : ''}
    </span>
  );
}

function CloseTheDay({ steps, current, nowMs, onNavigate, onStartFocusBlock }) {
  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;
  return (
    <section className="wp-now wp-now--evening" aria-label="Close the day">
      <div className="wp-now-label">Close the day · {doneCount}/{steps.length}</div>
      {current && (
        <button type="button" className="wp-now-mini" onClick={() => onStartFocusBlock(current.ev)}>
          <Play size={12} /> <span className="wp-now-mini-text">Now: {current.label}</span>
          <span className="wp-now-mini-meta">ends in {fmtRemaining(current.endMs, nowMs)}</span>
        </button>
      )}
      {allDone ? (
        <>
          <h2 className="wp-now-title">Day closed. Well done.</h2>
          <p className="wp-now-meta">Lights out on time: 9h+ of sleep counts toward tomorrow&rsquo;s score.</p>
        </>
      ) : (
        <ol className="wp-close-list">
          {steps.map((s) => (
            <li key={s.key}>
              <button type="button" className={`wp-close-step ${s.done ? 'is-done' : ''}`} onClick={() => onNavigate('daily-log')}>
                <span className="wp-close-check">{s.done && <Check size={12} strokeWidth={3} />}</span>
                <span className="wp-close-label">{s.label}</span>
                {!s.done && <ArrowRight size={14} className="wp-close-arrow" />}
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function NowPanel({ mode, now, nextUp, closeSteps, onNavigate, onPlanDay, onStartFocus, onStartFocusBlock }) {
  const nowMs = now.getTime();
  const { current, next, nextIsToday, activeBlock, noPhoneActive, plannedToday } = nextUp;

  if (mode === 'evening') {
    return <CloseTheDay steps={closeSteps} current={current} nowMs={nowMs} onNavigate={onNavigate} onStartFocusBlock={onStartFocusBlock} />;
  }

  const badge = noPhoneActive && <NoPhoneBadge until={activeBlock?.endMs} nowMs={nowMs} />;
  const tomorrowLine = next && !nextIsToday && (
    <p className="wp-now-then">Tomorrow: {next.label} at {fmtClock(next.startMs)}</p>
  );

  if (current) {
    return (
      <section className="wp-now wp-now--live" aria-label="Happening now">
        <div className="wp-now-label">Happening now · ends in {fmtRemaining(current.endMs, nowMs)} {badge}</div>
        <h2 className="wp-now-title">{current.label}</h2>
        <p className="wp-now-meta">{fmtSpan(current)}</p>
        <div className="wp-now-actions">
          <button type="button" className="wp-btn wp-btn--primary" onClick={() => onStartFocusBlock(current.ev)}>
            <Play size={15} /> Start focus
          </button>
          <button type="button" className="wp-btn wp-btn--ghost" onClick={() => onNavigate('calendar')}>Calendar</button>
        </div>
        {next && nextIsToday && <p className="wp-now-then">Then: {next.label} at {fmtClock(next.startMs)}</p>}
      </section>
    );
  }

  if (next && nextIsToday) {
    const Icon = KIND_ICON[next.kind];
    const soon = next.kind === 'event' && next.startMs - nowMs <= 15 * 60000;
    return (
      <section className="wp-now" aria-label="Next up">
        <div className="wp-now-label">Next up · in {fmtRemaining(next.startMs, nowMs)} {badge}</div>
        <h2 className="wp-now-title"><Icon size={20} strokeWidth={2.4} className="wp-now-title-icon" /> {next.label}</h2>
        <p className="wp-now-meta">{fmtSpan(next)}</p>
        <div className="wp-now-actions">
          {soon ? (
            <button type="button" className="wp-btn wp-btn--primary" onClick={() => onStartFocusBlock(next.ev)}>
              <Play size={15} /> Start focus
            </button>
          ) : (
            <button type="button" className="wp-btn wp-btn--primary" onClick={onStartFocus}>
              <Play size={15} /> Focus until then
            </button>
          )}
          <button type="button" className="wp-btn wp-btn--ghost" onClick={() => onNavigate('calendar')}>Calendar</button>
        </div>
      </section>
    );
  }

  return (
    <section className="wp-now wp-now--open" aria-label="Plan your day">
      <div className="wp-now-label">{plannedToday ? 'Open time' : mode === 'morning' ? 'Start here' : 'Unplanned'} {badge}</div>
      <h2 className="wp-now-title">{plannedToday ? 'Nothing else scheduled today' : 'Today isn’t planned yet'}</h2>
      <p className="wp-now-meta">
        {plannedToday ? 'Plan the rest of the day, or start a focus session.' : 'Turn your tasks and goals into time blocks in one tap.'}
      </p>
      <div className="wp-now-actions">
        <button type="button" className="wp-btn wp-btn--primary" onClick={onPlanDay}>
          <CalendarPlus size={15} /> {plannedToday ? 'Plan the rest' : 'Plan my day'}
        </button>
        <button type="button" className="wp-btn wp-btn--ghost" onClick={onStartFocus}><Play size={14} /> Focus</button>
      </div>
      {tomorrowLine}
    </section>
  );
}

// ── Daily Score + next best move ─────────────────────────────────────────────
const SCORE_CHIP_ICON = { habits: Repeat, tasks: CheckSquare, plan: CalendarCheck, sleep: Moon, screentime: Smartphone, log: NotebookText, commitment: Handshake };

function ScoreCard({ scoreInputs, now, onNavigate }) {
  const { score, breakdown } = computeDailyScore(scoreInputs);
  const streak = computeStreak(scoreInputs);
  const { toThreshold, move } = getNextMove(scoreInputs, now);
  const color = scoreColor(score);
  const R = 46;
  const C = 2 * Math.PI * R;

  const goal = toThreshold > 0
    ? `${toThreshold.toFixed(1)} to go ${streak > 0 ? 'to keep your streak' : 'to start a streak'}`
    : streak > 0 ? `Streak safe today · ${streak} days` : 'Streak safe today';

  const moveBody = move && (
    <>
      <span className="wp-move-label">Next:</span>
      <span className="wp-move-text">{move.text}</span>
      <span className="wp-move-gain">+{move.gain.toFixed(1)}</span>
    </>
  );

  return (
    <section className="wp-score" aria-label="Today's score">
      <button type="button" className="wp-score-ring" onClick={() => onNavigate('statistics')} title="Open your character sheet" aria-label={`Today's score ${score.toFixed(1)} of 10. Open your character sheet`}>
          <svg viewBox="0 0 120 120" aria-hidden="true">
            <circle cx="60" cy="60" r={R} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="9" />
            <circle
              cx="60" cy="60" r={R} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={C * (1 - score / 10)}
              style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%', transition: 'stroke-dashoffset 0.6s ease' }}
            />
          </svg>
        <span className="wp-score-number" style={{ color }}>{score.toFixed(1)}</span>
      </button>
      <div className="wp-score-body">
        <span className="wp-score-title">Today&rsquo;s Score</span>
        <span className={`wp-score-goal ${toThreshold > 0 ? '' : 'is-safe'}`}>
          {toThreshold > 0 ? <Flame size={12} /> : <Check size={12} />} {goal}
        </span>
      </div>
      <div className="wp-score-chips">
        {Object.entries(breakdown).map(([key, { value, label }]) => {
          const ChipIcon = SCORE_CHIP_ICON[key];
          return (
            <span key={key} className="wp-score-chip" data-tier={value >= 7 ? 'good' : value >= 4 ? 'mid' : 'low'}>
              <ChipIcon size={11} />{label}
            </span>
          );
        })}
      </div>
      {move ? (
        move.page ? (
          <button type="button" className="wp-move" onClick={() => onNavigate(move.page)}>{moveBody}</button>
        ) : (
          <div className="wp-move">{moveBody}</div>
        )
      ) : (
        <div className="wp-move wp-move--done"><Check size={13} /> Perfect day. Nothing left to raise.</div>
      )}
    </section>
  );
}

// ── Block check-in ───────────────────────────────────────────────────────────
// The oldest block that ended without an answer (today's, or yesterday's while it
// still counts). Answering here is the same check-in as on the Calendar.
function CheckInCard({ calendarEvents, now, todayKey, onCheckInBlock, onNavigate }) {
  const pending = getPendingCheckIns(calendarEvents, now);
  const ev = pending[0];
  if (!ev || !onCheckInBlock) return null;
  return (
    <section className="wp-checkin" aria-label="Check in on a time block">
      <BlockCheckIn
        key={`${ev.id}-${ev._instanceDate}`}
        ev={ev}
        dayLabel={ev._instanceDate === todayKey ? 'Ended' : 'Yesterday'}
        onAnswer={(status, reason) => onCheckInBlock(ev, status, reason)}
      />
      {pending.length > 1 && (
        <button type="button" className="wp-checkin-more" onClick={() => onNavigate('calendar')}>
          +{pending.length - 1} more on the Calendar <ArrowRight size={12} />
        </button>
      )}
    </section>
  );
}

// ── Habits ───────────────────────────────────────────────────────────────────
function HabitStrip({ habits, todayKey, onToggleHabitDay, onNavigate }) {
  const list = habits || [];
  const done = list.filter((h) => h.history?.[todayKey]).length;
  return (
    <section className="wp-habits" aria-label="Today's habits">
      <button type="button" className="wp-habits-label" onClick={() => onNavigate('daily-log')}>
        <Repeat size={14} /> Habits {list.length > 0 && <span className="wp-habits-count">{done}/{list.length}</span>}
      </button>
      <div className="wp-habits-row">
        {list.length === 0 ? (
          <button type="button" className="wp-habit wp-habit--add" onClick={() => onNavigate('daily-log')}>Add your first habit <ArrowRight size={12} /></button>
        ) : list.map((h) => {
          const isDone = !!h.history?.[todayKey];
          const streak = getHabitStreak({ ...h, history: h.history || {} });
          return (
            <button
              key={h.id}
              type="button"
              className={`wp-habit ${isDone ? 'is-done' : ''}`}
              aria-pressed={isDone}
              onClick={() => onToggleHabitDay(h.id, todayKey)}
            >
              <span className="wp-habit-check">{isDone && <Check size={11} strokeWidth={3} />}</span>
              <span className="wp-habit-name">{h.name || h.text}</span>
              {streak > 0 && <span className="wp-habit-streak"><Flame size={11} />{streak}</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ── Tiles ────────────────────────────────────────────────────────────────────
function TasksTile({ todos, todayKey, onNavigate, onCompleteTask }) {
  // Same list and order as the Tasks page: Top 3, then carried over, then the rest.
  const todayTasks = todayQueue(todos || [], todayKey);

  return (
    <section className="wp-tile wp-tile--tasks" aria-label="Today's tasks">
      <button type="button" className="wp-tile-header" onClick={() => onNavigate('tasks')}>
        <CheckSquare size={15} strokeWidth={2.4} />
        <span><span className="wp-wide-only">Today&rsquo;s </span>Tasks</span>
        {todayTasks.length > 0 && <span className="wp-tile-count">{todayTasks.length}</span>}
      </button>
      {todayTasks.length === 0 ? (
        <div className="wp-tile-empty">All clear. Nothing left for today.</div>
      ) : (
        <>
          <ul className="wp-task-list">
            {todayTasks.slice(0, 5).map((t) => (
              <li key={t.id} className="wp-task-row">
                <button type="button" className="wp-task-checkbox" aria-label={`Complete ${t.text}`} onClick={() => onCompleteTask(t.id)} />
                <span className="wp-task-text">{t.text}</span>
                {t.topDate === todayKey && <Star size={12} className="wp-task-star" fill="currentColor" aria-label="Top 3" />}
              </li>
            ))}
          </ul>
          {/* Desktop lists 5 rows, phones 3 (see CSS), so each gets its own count. */}
          {todayTasks.length > 5 && (
            <button type="button" className="wp-tile-more wp-tile-more--wide" onClick={() => onNavigate('tasks')}>
              +{todayTasks.length - 5} more
            </button>
          )}
          {todayTasks.length > 3 && (
            <button type="button" className="wp-tile-more wp-tile-more--phone" onClick={() => onNavigate('tasks')}>
              +{todayTasks.length - 3} more
            </button>
          )}
        </>
      )}
    </section>
  );
}

function CommitmentTile({ commitment, onNavigate, onResolveCommitment }) {
  const { dateKey, text, status, isPending } = commitment;
  return (
    <section className="wp-tile wp-tile--commitment" aria-label="Yesterday's commitment">
      <button type="button" className="wp-tile-inner" onClick={() => onNavigate('statistics')}>
        <span className="wp-tile-header">
          <Flag size={15} strokeWidth={2.4} />
          <span><span className="wp-wide-only">Yesterday&rsquo;s </span>Commitment</span>
        </span>
        {text ? (
          <>
            <span className="wp-tile-text">{text}</span>
            {status === 'missed' && <span className="wp-tile-status wp-tile-status--missed"><X size={13} /> Missed</span>}
            {status === 'kept' && <span className="wp-tile-status wp-tile-status--kept"><Check size={13} /> Kept</span>}
            {isPending && <span className="wp-tile-status wp-tile-status--pending"><Hourglass size={13} /> Did you keep it?</span>}
          </>
        ) : (
          <span className="wp-tile-empty">No commitment logged</span>
        )}
      </button>
      {isPending && (
        <div className="wp-commitment-actions">
          <button type="button" className="wp-commitment-btn wp-commitment-btn--kept" onClick={() => onResolveCommitment(dateKey, text, false)}>
            I kept it
          </button>
          <button type="button" className="wp-commitment-btn wp-commitment-btn--missed" onClick={() => onResolveCommitment(dateKey, text, true)}>
            I didn&rsquo;t
          </button>
        </div>
      )}
    </section>
  );
}

function WhyTile({ northStar, weekPriority, experiment, goals, goalData, now, onNavigate }) {
  const vision = northStar?.vision?.trim();
  const focus = getFocusGoals(goals);

  return (
    <section className="wp-tile wp-tile--why" aria-label="Your why">
      <button type="button" className="wp-why-row" onClick={() => onNavigate('goals')}>
        <Compass size={15} className="wp-why-icon" />
        <span className="wp-why-key">Becoming</span>
        <span className={`wp-why-text ${vision ? '' : 'is-empty'}`}>{vision || 'Set your North Star'}</span>
      </button>
      <button type="button" className="wp-why-row" onClick={() => onNavigate('review')}>
        <Target size={15} className="wp-why-icon" />
        <span className="wp-why-key">This week</span>
        <span className={`wp-why-text ${weekPriority ? '' : 'is-empty'}`}>{weekPriority || 'Set this week’s priority'}</span>
      </button>
      {experiment && (
        <button type="button" className="wp-why-row wp-why-row--exp" onClick={() => onNavigate('review')}>
          <FlaskConical size={15} className="wp-why-icon" />
          <span className="wp-why-key">Experiment</span>
          <span className="wp-why-text">{experiment.text}</span>
          <span className="wp-why-count" title="Days you did it this week">{experiment.done}/{experiment.days}</span>
        </button>
      )}
      {focus.length === 0 ? (
        <button type="button" className="wp-why-row" onClick={() => onNavigate('goals')}>
          <Flag size={15} className="wp-why-icon" />
          <span className="wp-why-key">Goals</span>
          <span className="wp-why-text is-empty">Write down a goal</span>
        </button>
      ) : (
        <button type="button" className="wp-why-row wp-why-row--goals" onClick={() => onNavigate('goals')}>
          <Flag size={15} className="wp-why-icon" />
          <span className="wp-why-key">Goals</span>
          <span className="wp-why-goals">
            {focus.map((g) => {
              const activity = getGoalActivity(g, goalData, now);
              const status = getGoalStatus(g, activity, now);
              const progress = getGoalProgress(g);
              const left = daysLeft(g, now);
              const meta = status === 'overdue' ? 'Overdue'
                : status === 'quiet' ? `Quiet ${activity.daysQuiet}d`
                  : status === 'behind' ? 'Behind'
                  : activity.movedToday ? 'Today'
                    : left != null && left <= 14 ? `${left}d left` : null;
              return (
                <span key={g.id} className="wp-why-goal">
                  <span className={`wp-why-dot wp-why-dot--${status}`} aria-label={status} />
                  <span className="wp-why-goal-title">{g.title}</span>
                  {progress.kind !== 'binary' && (
                    <span className="wp-why-bar" aria-label={`${Math.round(progress.ratio * 100)}% done`}>
                      <span style={{ width: `${Math.round(progress.ratio * 100)}%` }} />
                    </span>
                  )}
                  {meta && <span className={`wp-why-goal-meta wp-why-goal-meta--${status}`}>{meta}</span>}
                </span>
              );
            })}
          </span>
        </button>
      )}
    </section>
  );
}

// "2/3": days you did this week's experiment, of the days so far.
const countTicks = (logs, week, todayKey) => {
  const ticks = getExperimentTicks(logs, week, todayKey);
  return { done: ticks.done, days: ticks.days.length };
};

// ── Page ─────────────────────────────────────────────────────────────────────
export default function WelcomePage({
  user,
  todos,
  calendarEvents,
  noPhoneBlocks,
  calendarDayEvents,
  currentWeekPriority,
  weekExperiment,
  logs,
  logReviews,
  commitmentArchive,
  goals,
  habits,
  pomodoroSessions,
  xpLog,
  healthLog,
  brief,
  briefLoading,
  onRefreshBrief,
  onNavigate,
  onResolveCommitment,
  onCompleteTask,
  onToggleHabitDay,
  onPlanDay,
  onStartFocus,
  onStartFocusBlock,
  onCheckInBlock,
}) {
  const now = useNow(30000);
  const todayKey = toDateKey(now);
  const mode = getDayMode(now);
  const scoreInputs = { habits, xpLog, logs, commitmentArchive, healthLog, calendarEvents };
  const nextUp = getNextUp({ calendarEvents, noPhoneBlocks, calendarDayEvents, now });
  const todaysBrief = brief?.date === todayKey ? brief : null;

  return (
    <div className="wp-bg" data-mode={mode}>
      <div className="wp-layout">
        <TopBar name={user?.name} now={now} />
        <BriefLine brief={todaysBrief} loading={briefLoading} onRefresh={onRefreshBrief} />
        <CheckInCard calendarEvents={calendarEvents} now={now} todayKey={todayKey} onCheckInBlock={onCheckInBlock} onNavigate={onNavigate} />

        <div className="wp-grid">
          <NowPanel
            mode={mode}
            now={now}
            nextUp={nextUp}
            closeSteps={getCloseDaySteps({ logs, logReviews }, now)}
            onNavigate={onNavigate}
            onPlanDay={onPlanDay}
            onStartFocus={onStartFocus}
            onStartFocusBlock={onStartFocusBlock}
          />
          <ScoreCard scoreInputs={scoreInputs} now={now} onNavigate={onNavigate} />
          <HabitStrip habits={habits} todayKey={todayKey} onToggleHabitDay={onToggleHabitDay} onNavigate={onNavigate} />
          <TasksTile todos={todos} todayKey={todayKey} onNavigate={onNavigate} onCompleteTask={onCompleteTask} />
          <CommitmentTile
            commitment={getYesterdayCommitment(logs, commitmentArchive, now)}
            onNavigate={onNavigate}
            onResolveCommitment={onResolveCommitment}
          />
          <WhyTile
            northStar={user?.northStar}
            weekPriority={currentWeekPriority}
            experiment={weekExperiment ? { text: weekExperiment.text, ...countTicks(logs, weekExperiment.week, todayKey) } : null}
            goals={goals}
            goalData={{ todos, habits, pomodoroSessions, calendarEvents }}
            now={now}
            onNavigate={onNavigate}
          />
        </div>
      </div>
    </div>
  );
}
