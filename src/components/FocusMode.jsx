import React, { useState, useEffect, useRef, useCallback } from 'react';
import './FocusMode.css';
import STAT_META from './statMeta';

const getLocalDateKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

const playFinishSound = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.18);
      gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.18);
      gain.gain.linearRampToValueAtTime(0.35, ctx.currentTime + i * 0.18 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.18 + 0.5);
      osc.start(ctx.currentTime + i * 0.18);
      osc.stop(ctx.currentTime + i * 0.18 + 0.55);
    });
  } catch {}
};

const PRESETS = [5 * 60, 10 * 60, 25 * 60, 45 * 60];
const STAT_ATTRS = Object.keys(STAT_META);

const FocusMode = ({ todos = [], onUpdateStat, pomodoroSessions = [], onSessionComplete, onClose }) => {
  const todayTasks = todos.filter(t => (t.timeFrame === 'today' || t.timeFrame === 'tomorrow') && !t.completed);

  const [pinnedId, setPinnedId]   = useState(todayTasks[0]?.id || null);
  const [totalSecs, setTotalSecs] = useState(25 * 60);
  const [timeLeft, setTimeLeft]   = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [xpStat, setXpStat]       = useState('focus');
  const [xpAmount, setXpAmount]   = useState(20);
  const [showDone, setShowDone]   = useState(false);
  const [startedAt, setStartedAt] = useState(null);
  const [showTaskPicker, setShowTaskPicker] = useState(false);

  const intervalRef = useRef(null);
  const pinnedTask  = todayTasks.find(t => t.id === pinnedId) || todayTasks[0];

  const tick = useCallback(() => {
    setTimeLeft(prev => {
      if (prev <= 1) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
        setIsRunning(false);
        setHasStarted(false);
        playFinishSound();
        setTimeout(() => setShowDone(true), 600);
        return 0;
      }
      return prev - 1;
    });
  }, []);

  useEffect(() => {
    if (isRunning) intervalRef.current = setInterval(tick, 1000);
    else clearInterval(intervalRef.current);
    return () => clearInterval(intervalRef.current);
  }, [isRunning, tick]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleStart = () => {
    if (timeLeft === 0) return;
    setIsRunning(true);
    setHasStarted(true);
    if (!startedAt) setStartedAt(Date.now());
  };

  const handlePause = () => setIsRunning(false);
  const handleReset = () => { setIsRunning(false); setHasStarted(false); setTimeLeft(totalSecs); setStartedAt(null); };
  const setPreset = (s) => { setIsRunning(false); setHasStarted(false); setTotalSecs(s); setTimeLeft(s); setStartedAt(null); };

  const handleClaimXp = () => {
    onUpdateStat(xpStat, xpAmount, { source: 'pomodoro', label: `Focus: ${Math.floor(totalSecs / 60)}m` });
    onSessionComplete?.({
      id: `${Date.now()}-fm`,
      date: getLocalDateKey(),
      startedAt: startedAt || Date.now() - totalSecs * 1000,
      completedAt: Date.now(),
      durationSecs: totalSecs,
      xpAmount,
      stat: xpStat,
      completed: true,
    });
    setShowDone(false);
    setStartedAt(null);
    setTimeLeft(totalSecs);
  };

  const todayFocusMins = pomodoroSessions.filter(s => s.date === getLocalDateKey() && s.completed)
    .reduce((sum, s) => sum + Math.floor(s.durationSecs / 60), 0);

  const displayMins = String(Math.floor(timeLeft / 60)).padStart(2, '0');
  const displaySecs = String(timeLeft % 60).padStart(2, '0');
  const progress = totalSecs > 0 ? (totalSecs - timeLeft) / totalSecs : 0;
  const R = 100, C = 2 * Math.PI * R;

  return (
    <div className="focus-overlay">
      <button className="focus-close" onClick={onClose} title="Exit (Esc)">✕</button>

      {/* Current task */}
      <div className="focus-task-section">
        <span className="focus-task-label">WORKING ON</span>
        {pinnedTask ? (
          <button className="focus-task-name" onClick={() => setShowTaskPicker(o => !o)}>
            {pinnedTask.text} ▾
          </button>
        ) : (
          <span className="focus-task-name muted">No tasks for today</span>
        )}
        {showTaskPicker && todayTasks.length > 0 && (
          <div className="focus-task-picker">
            {todayTasks.map(t => (
              <button key={t.id} className={`focus-task-option ${t.id === pinnedId ? 'active' : ''}`} onClick={() => { setPinnedId(t.id); setShowTaskPicker(false); }}>
                {t.text}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Timer ring */}
      <div className="focus-ring-wrap">
        <svg viewBox="0 0 240 240" className="focus-ring-svg">
          <circle cx="120" cy="120" r={R} fill="none" stroke="#1a1a1a" strokeWidth="7" />
          <circle
            cx="120" cy="120" r={R} fill="none"
            stroke={isRunning || hasStarted ? '#fbbf24' : '#333'}
            strokeWidth="7" strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={C * (1 - progress)}
            style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%', transition: 'stroke-dashoffset 0.8s linear, stroke 0.3s' }}
          />
        </svg>
        <div className="focus-ring-inner">
          <span className="focus-time">{displayMins}<span className="focus-colon">:</span>{displaySecs}</span>
          {isRunning && <span className="focus-status">FOCUSING</span>}
          {!isRunning && hasStarted && timeLeft > 0 && <span className="focus-status paused">PAUSED</span>}
          {!isRunning && !hasStarted && <span className="focus-status idle">READY</span>}
          {timeLeft === 0 && <span className="focus-status done">DONE!</span>}
        </div>
      </div>

      {/* Controls */}
      <div className="focus-controls">
        {!isRunning ? (
          <button className="focus-btn play" onClick={handleStart} disabled={timeLeft === 0}>▶ {hasStarted ? 'Resume' : 'Start'}</button>
        ) : (
          <button className="focus-btn pause" onClick={handlePause}>⏸ Pause</button>
        )}
        <button className="focus-btn reset" onClick={handleReset}>↺</button>
      </div>

      {/* Presets */}
      <div className="focus-presets">
        {PRESETS.map(s => (
          <button key={s} className={`focus-preset ${totalSecs === s ? 'active' : ''}`} onClick={() => setPreset(s)}>
            {Math.floor(s / 60)}m
          </button>
        ))}
      </div>

      {/* Stat + XP */}
      <div className="focus-config">
        <div className="focus-config-row">
          {[10, 20, 30, 50].map(v => (
            <button key={v} className={`focus-xp-pill ${xpAmount === v ? 'active' : ''}`} onClick={() => setXpAmount(v)}>+{v}</button>
          ))}
        </div>
        <div className="focus-config-row focus-stat-row">
          {STAT_ATTRS.map(attr => {
            const meta = STAT_META[attr];
            const { Icon } = meta;
            const active = xpStat === attr;
            return (
              <button key={attr} className={`focus-stat-pill ${active ? 'active' : ''}`} style={active ? { borderColor: meta.color, color: meta.color, background: `${meta.color}18` } : {}} onClick={() => setXpStat(attr)}>
                <Icon size={10} strokeWidth={2.5} /> {meta.label.slice(0, 4)}
              </button>
            );
          })}
        </div>
      </div>

      {todayFocusMins > 0 && (
        <div className="focus-today-stats">
          ⏱️ {todayFocusMins >= 60 ? `${Math.floor(todayFocusMins/60)}h ${todayFocusMins%60}m` : `${todayFocusMins}m`} focused today
        </div>
      )}

      {/* Done overlay */}
      {showDone && (
        <div className="focus-done-overlay">
          <span className="focus-done-emoji">🎉</span>
          <h2 className="focus-done-title">Session Complete!</h2>
          <p className="focus-done-xp">+{xpAmount} XP → {STAT_META[xpStat]?.label}</p>
          <button className="focus-done-btn" onClick={handleClaimXp}>Claim XP</button>
        </div>
      )}
    </div>
  );
};

export default FocusMode;
