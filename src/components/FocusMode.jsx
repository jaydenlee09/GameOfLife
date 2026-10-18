import React, { useState, useEffect, useRef } from 'react';
import './FocusMode.css';
import { X, ChevronDown, Play, Pause, RotateCcw, Timer, CalendarClock } from 'lucide-react';
import { xpForFocusMinutes } from '../utils/xpUtils';
import { useCountdownTimer } from '../hooks/useCountdownTimer';
import { makeFocusSession } from '../utils/focusInsights';
import { IntentField, ParkThought, FocusDebrief } from './FocusCoach';

const getLocalDateKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

const PRESETS = [5 * 60, 10 * 60, 25 * 60, 45 * 60, 60 * 60, 90 * 60];

/**
 * Fullscreen focus session. `launch` (from a calendar block's "Start focus")
 * prefills the task, intent and length and links the session to that block:
 * a linked session pays no focus XP, because completing the block pays for it.
 * `linkedBlock` is that block's current instance (null once deleted).
 */
const FocusMode = ({
  todos = [], onAwardXp, pomodoroSessions = [], onSessionComplete, onClose,
  launch = null, linkedBlock = null, onPark, onComment, onCommentSaved, onCompleteBlock, onCompleteTask,
}) => {
  const launchedTask = launch?.taskId != null ? todos.find(t => String(t.id) === String(launch.taskId) && !t.completed) : null;
  const todayTasks = todos.filter(t => (t.timeFrame === 'today' || t.timeFrame === 'tomorrow') && !t.completed);
  const taskOptions = launchedTask && !todayTasks.includes(launchedTask) ? [launchedTask, ...todayTasks] : todayTasks;
  const isLinked = launch?.blockId != null;

  const [pinnedId, setPinnedId]   = useState(launchedTask?.id ?? (isLinked ? null : todayTasks[0]?.id ?? null));
  const [showDone, setShowDone]   = useState(false);
  const [startedAt, setStartedAt] = useState(null);
  const [showTaskPicker, setShowTaskPicker] = useState(false);
  const [intent, setIntent]       = useState(launch?.intent || '');
  const [parked, setParked]       = useState(0);
  // Set once the finished session is stored, so closing mid-debrief can't lose it.
  const savedRef = useRef(false);

  const { totalSecs, timeLeft, isRunning, hasStarted, start, pause, reset, setDuration } =
    useCountdownTimer(launch?.durationSecs || 25 * 60, () => setTimeout(() => { savedRef.current = false; setShowDone(true); }, 600));

  // Reward is EARNED from session length, not chosen — 1 XP per focused minute.
  const xpAmount = xpForFocusMinutes(totalSecs / 60);
  const pinnedTask = taskOptions.find(t => t.id === pinnedId) || null;

  const saveSession = (debrief) => {
    if (savedRef.current) return null;
    savedRef.current = true;
    const session = makeFocusSession({
      startedAt, durationSecs: totalSecs, xpAmount, intent,
      taskId: pinnedTask?.id, blockId: launch?.blockId, blockDate: launch?.blockDate, parked, debrief,
    });
    if (!isLinked) onAwardXp(xpAmount, { source: 'pomodoro', label: `Focus: ${Math.floor(totalSecs / 60)}m` });
    onSessionComplete?.(session);
    return session;
  };

  // Closing during the debrief still records the session (as skipped).
  const handleClose = () => {
    if (showDone) saveSession(null);
    onClose();
  };

  const handleCloseRef = useRef(handleClose);
  useEffect(() => { handleCloseRef.current = handleClose; });
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') handleCloseRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleStart = () => {
    if (timeLeft === 0) return;
    start();
    if (!startedAt) setStartedAt(Date.now());
  };

  const handlePause = () => pause();
  const handleReset = () => { reset(); setStartedAt(null); };
  const setPreset = (s) => { setDuration(s); setStartedAt(null); };

  const handleDebriefDone = () => {
    setShowDone(false);
    setStartedAt(null);
    setParked(0);
    reset();
    // A block-linked session is one sitting; afterwards Focus Mode closes.
    if (isLinked) onClose();
  };

  const park = (text) => { onPark?.(text); setParked(n => n + 1); };

  const todayFocusMins = pomodoroSessions.filter(s => s.date === getLocalDateKey() && s.completed)
    .reduce((sum, s) => sum + Math.floor(s.durationSecs / 60), 0);

  const displayMins = String(Math.floor(timeLeft / 60)).padStart(2, '0');
  const displaySecs = String(timeLeft % 60).padStart(2, '0');
  const progress = totalSecs > 0 ? (totalSecs - timeLeft) / totalSecs : 0;
  const R = 100, C = 2 * Math.PI * R;
  const xpLine = isLinked
    ? 'XP for these minutes comes from completing the block.'
    : `+${xpAmount} XP`;

  return (
    <div className="focus-overlay">
      <button className="focus-close" onClick={handleClose} title="Exit (Esc)"><X size={16} /></button>

      {isLinked && (
        <div className="focus-block-tag"><CalendarClock size={13} /> {linkedBlock?.title || launch.blockTitle}</div>
      )}

      {/* Current task */}
      <div className="focus-task-section">
        <span className="focus-task-label">Working On</span>
        {pinnedTask ? (
          <button className="focus-task-name" onClick={() => setShowTaskPicker(o => !o)}>
            {pinnedTask.text} <ChevronDown size={14} />
          </button>
        ) : taskOptions.length > 0 ? (
          <button className="focus-task-name muted" onClick={() => setShowTaskPicker(o => !o)}>
            Pick a task (optional) <ChevronDown size={14} />
          </button>
        ) : (
          <span className="focus-task-name muted">No tasks for today</span>
        )}
        {showTaskPicker && taskOptions.length > 0 && (
          <div className="focus-task-picker">
            {taskOptions.map(t => (
              <button key={t.id} className={`focus-task-option ${t.id === pinnedId ? 'active' : ''}`} onClick={() => { setPinnedId(t.id); setShowTaskPicker(false); }}>
                {t.text}
              </button>
            ))}
          </div>
        )}
      </div>

      <IntentField value={intent} onChange={setIntent} locked={hasStarted || isRunning} />

      {/* Timer ring */}
      <div className="focus-ring-wrap">
        <svg viewBox="0 0 240 240" className="focus-ring-svg">
          <circle cx="120" cy="120" r={R} fill="none" stroke="#2c2c2e" strokeWidth="7" />
          <circle
            cx="120" cy="120" r={R} fill="none"
            stroke={isRunning || hasStarted ? '#38bdf8' : '#6e6e73'}
            strokeWidth="7" strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={C * (1 - progress)}
            style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%', transition: 'stroke-dashoffset 0.8s linear, stroke 0.3s' }}
          />
        </svg>
        <div className="focus-ring-inner">
          <span className="focus-time">{displayMins}<span className="focus-colon">:</span>{displaySecs}</span>
          {isRunning && <span className="focus-status">Focusing</span>}
          {!isRunning && hasStarted && timeLeft > 0 && <span className="focus-status paused">Paused</span>}
          {!isRunning && !hasStarted && <span className="focus-status idle">Ready</span>}
          {timeLeft === 0 && <span className="focus-status done">Done!</span>}
        </div>
      </div>

      {/* Controls */}
      <div className="focus-controls">
        {!isRunning ? (
          <button className="focus-btn play" onClick={handleStart} disabled={timeLeft === 0}><Play size={16} /> {hasStarted ? 'Resume' : 'Start'}</button>
        ) : (
          <button className="focus-btn pause" onClick={handlePause}><Pause size={16} /> Pause</button>
        )}
        <button className="focus-btn reset" onClick={handleReset}><RotateCcw size={16} /></button>
      </div>

      {hasStarted ? (
        <ParkThought onPark={park} count={parked} />
      ) : (
        <div className="focus-presets">
          {PRESETS.map(s => (
            <button key={s} className={`focus-preset ${totalSecs === s ? 'active' : ''}`} onClick={() => setPreset(s)}>
              {Math.floor(s / 60)}m
            </button>
          ))}
        </div>
      )}

      {/* Stat + XP */}
      {isLinked ? (
        <div className="focus-config">
          <div className="focus-config-row focus-xp-earned-row">
            <span className="focus-xp-earned-note">XP comes from completing the block</span>
          </div>
        </div>
      ) : (
        <div className="focus-config">
          <div className="focus-config-row focus-xp-earned-row">
            <span className="focus-xp-earned">+{xpAmount} XP</span>
            <span className="focus-xp-earned-note">earned · 1 XP / focused min</span>
          </div>
        </div>
      )}

      {todayFocusMins > 0 && (
        <div className="focus-today-stats">
          <Timer size={14} /> {todayFocusMins >= 60 ? `${Math.floor(todayFocusMins/60)}h ${todayFocusMins%60}m` : `${todayFocusMins}m`} focused today
        </div>
      )}

      {/* Debrief */}
      {showDone && (
        <div className="focus-done-overlay">
          <FocusDebrief
            intent={intent.trim()}
            xpLine={xpLine}
            linkedBlock={linkedBlock}
            linkedTask={pinnedTask}
            onSave={saveSession}
            onComment={onComment}
            onCommentSaved={onCommentSaved}
            onCompleteBlock={() => onCompleteBlock?.(launch.blockId, launch.blockDate)}
            onCompleteTask={() => (pinnedTask ? onCompleteTask?.(pinnedTask.id) : null)}
            onClose={handleDebriefDone}
          />
        </div>
      )}
    </div>
  );
};

export default FocusMode;
