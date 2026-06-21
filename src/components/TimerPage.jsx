import React, { useState, useEffect, useRef, useCallback } from 'react';
import './TimerPage.css';
import STAT_META from './statMeta';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

// ─── Constants ────────────────────────────────────────────────────────────────
const PRESETS = [
  { label: '5 min',  seconds: 5  * 60 },
  { label: '10 min', seconds: 10 * 60 },
  { label: '25 min', seconds: 25 * 60 },
  { label: '45 min', seconds: 45 * 60 },
];

const XP_OPTIONS = [10, 20, 30, 50, 75, 100];
const STAT_ATTRIBUTES = Object.keys(STAT_META);
const STAT_LABELS = Object.fromEntries(Object.entries(STAT_META).map(([k, v]) => [k, v.label]));

const getLocalDateKey = (offsetDays = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

const formatMins = (mins) => {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
};

const relativeTime = (ts) => {
  const diffMs = Date.now() - ts;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1)  return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const h = Math.floor(diffMins / 60);
  return `${h}h ago`;
};

// ─── Audio Cue ────────────────────────────────────────────────────────────────
const playFinishSound = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.18);
      gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.18);
      gain.gain.linearRampToValueAtTime(0.35, ctx.currentTime + i * 0.18 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.18 + 0.5);
      osc.start(ctx.currentTime + i * 0.18);
      osc.stop(ctx.currentTime + i * 0.18 + 0.55);
    });
  } catch (e) { /* silently fail */ }
};

// ─── XP Modal ─────────────────────────────────────────────────────────────────
const XpModal = ({ xp, stat, onClose }) => (
  <div className="modal-overlay" onClick={onClose}>
    <div className="modal-content xp-modal" onClick={(e) => e.stopPropagation()}>
      <span className="xp-badge-big">✨</span>
      <h3 className="modal-title xp-title">+{xp} XP</h3>
      <p className="modal-body">
        Focus session complete!{' '}
        <span style={{ color: '#fbbf24', fontWeight: 700, textTransform: 'capitalize' }}>
          {STAT_LABELS[stat] || stat}
        </span>{' '}
        increased.
      </p>
      <button onClick={onClose} className="modal-btn primary">Awesome!</button>
    </div>
  </div>
);

// ─── Timer Page ───────────────────────────────────────────────────────────────
const TimerPage = ({ onUpdateStat, pomodoroSessions = [], onSessionComplete }) => {
  const [totalSeconds, setTotalSeconds]   = useState(25 * 60);
  const [timeLeft, setTimeLeft]           = useState(25 * 60);
  const [isRunning, setIsRunning]         = useState(false);
  const [hasStarted, setHasStarted]       = useState(false);
  const [sessionStartedAt, setSessionStartedAt] = useState(null);

  const [customMinutes, setCustomMinutes] = useState('');
  const [customSeconds, setCustomSeconds] = useState('');

  const [xpAmount, setXpAmount] = useState(20);
  const [xpStat, setXpStat]   = useState('focus');

  const [showXpModal, setShowXpModal] = useState(false);
  const [activePreset, setActivePreset] = useState(25 * 60);

  const intervalRef = useRef(null);
  const endTimeRef  = useRef(null); // wall-clock timestamp (ms) when the timer reaches 0

  // ── Derived session stats ────────────────────────────────────────────────
  const todayKey = getLocalDateKey(0);
  const todaySessions = pomodoroSessions.filter(s => s.date === todayKey && s.completed);
  const todayMinutes  = todaySessions.reduce((sum, s) => sum + Math.floor(s.durationSecs / 60), 0);

  const last7 = Array.from({ length: 7 }, (_, i) => {
    const key  = getLocalDateKey(-(6 - i));
    const mins = pomodoroSessions
      .filter(s => s.date === key && s.completed)
      .reduce((sum, s) => sum + Math.floor(s.durationSecs / 60), 0);
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    const label = d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 1);
    return { label, mins, isToday: i === 6 };
  });

  // ── Tick ──────────────────────────────────────────────────────────────────
  // Recomputes remaining time from a fixed end timestamp rather than counting down
  // by 1 each call, so background tab throttling/suspension of setInterval can't
  // cause drift — the moment the tab wakes up, the correct remaining time is restored.
  const tick = useCallback(() => {
    if (!endTimeRef.current) return;
    const remaining = Math.max(0, Math.round((endTimeRef.current - Date.now()) / 1000));
    setTimeLeft(remaining);
    if (remaining <= 0) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
      endTimeRef.current = null;
      setIsRunning(false);
      setHasStarted(false);
      playFinishSound();
      setTimeout(() => setShowXpModal(true), 600);
    }
  }, []);

  useEffect(() => {
    if (isRunning) {
      if (!endTimeRef.current) endTimeRef.current = Date.now() + timeLeft * 1000;
      intervalRef.current = setInterval(tick, 1000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning, tick]);

  // Resync immediately when the tab regains visibility, instead of waiting for
  // the next (possibly throttled) interval tick.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [tick]);

  // ── Controls ──────────────────────────────────────────────────────────────
  const handleStart = () => {
    if (timeLeft === 0) return;
    setIsRunning(true);
    setHasStarted(true);
    if (!sessionStartedAt) setSessionStartedAt(Date.now());
  };

  const handlePause = () => {
    setIsRunning(false);
    endTimeRef.current = null;
  };

  const handleReset = () => {
    setIsRunning(false);
    setHasStarted(false);
    setTimeLeft(totalSeconds);
    setSessionStartedAt(null);
    endTimeRef.current = null;
  };

  const handlePreset = (seconds) => {
    setIsRunning(false);
    setHasStarted(false);
    setTotalSeconds(seconds);
    setTimeLeft(seconds);
    setActivePreset(seconds);
    setCustomMinutes('');
    setCustomSeconds('');
    setSessionStartedAt(null);
    endTimeRef.current = null;
  };

  const handleCustomApply = () => {
    const mins = parseInt(customMinutes || '0', 10);
    const secs = parseInt(customSeconds || '0', 10);
    const total = mins * 60 + secs;
    if (total <= 0 || total > 99 * 60) return;
    setIsRunning(false);
    setHasStarted(false);
    setTotalSeconds(total);
    setTimeLeft(total);
    setActivePreset(null);
    setSessionStartedAt(null);
    endTimeRef.current = null;
  };

  const handleCustomKeyDown = (e) => { if (e.key === 'Enter') handleCustomApply(); };

  // ── XP grant + session record ─────────────────────────────────────────────
  const handleXpClose = () => {
    setShowXpModal(false);
    onUpdateStat(xpStat, xpAmount, { source: 'pomodoro', label: `${Math.floor(totalSeconds / 60)}m focus session` });
    if (onSessionComplete) {
      onSessionComplete({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        date: todayKey,
        startedAt: sessionStartedAt || (Date.now() - totalSeconds * 1000),
        completedAt: Date.now(),
        durationSecs: totalSeconds,
        xpAmount,
        stat: xpStat,
        completed: true,
      });
    }
    setSessionStartedAt(null);
    setTimeLeft(totalSeconds);
  };

  // ── Derived display ────────────────────────────────────────────────────────
  const displayMins = String(Math.floor(timeLeft / 60)).padStart(2, '0');
  const displaySecs = String(timeLeft % 60).padStart(2, '0');
  const progress = totalSeconds > 0 ? (totalSeconds - timeLeft) / totalSeconds : 0;

  const RADIUS        = 140;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  const strokeDashoffset = CIRCUMFERENCE * (1 - progress);

  return (
    <div className="timer-page-container">
      <h1 className="section-page-title">TIMER</h1>

      <div className="timer-layout">
        {/* ── Main Timer Card ─────────────────────────────────────────────── */}
        <div className="timer-main-card">
          <div className="timer-ring-wrapper">
            <svg className="timer-ring-svg" viewBox="0 0 320 320">
              <circle cx="160" cy="160" r={RADIUS} fill="none" stroke="#262626" strokeWidth="8" />
              <circle
                cx="160" cy="160" r={RADIUS}
                fill="none"
                stroke={isRunning || hasStarted ? '#fbbf24' : '#525252'}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={CIRCUMFERENCE}
                strokeDashoffset={strokeDashoffset}
                style={{ transition: 'stroke-dashoffset 0.8s linear, stroke 0.4s ease', transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
              />
            </svg>
            <div className="timer-clock">
              <span className="timer-display">{displayMins}<span className="timer-colon">:</span>{displaySecs}</span>
              {isRunning && <span className="timer-status-label">FOCUSING</span>}
              {!isRunning && hasStarted && timeLeft > 0 && <span className="timer-status-label paused">PAUSED</span>}
              {!isRunning && !hasStarted && timeLeft > 0 && <span className="timer-status-label idle">READY</span>}
              {timeLeft === 0 && <span className="timer-status-label done">DONE!</span>}
            </div>
          </div>

          <div className="timer-controls">
            {!isRunning ? (
              <button className="timer-btn play" onClick={handleStart} disabled={timeLeft === 0}>
                ▶ {hasStarted ? 'Resume' : 'Start'}
              </button>
            ) : (
              <button className="timer-btn pause" onClick={handlePause}>⏸ Pause</button>
            )}
            <button className="timer-btn reset" onClick={handleReset}>↺ Reset</button>
          </div>

          {/* Today's focus summary */}
          <div className="timer-today-summary">
            <span className="timer-today-label">TODAY</span>
            <span className="timer-today-value">{formatMins(todayMinutes)}</span>
            <span className="timer-today-sub">{todaySessions.length} session{todaySessions.length !== 1 ? 's' : ''}</span>
          </div>
        </div>

        {/* ── Right Panel ─────────────────────────────────────────────────── */}
        <div className="timer-side-panel">
          <div className="timer-section">
            <span className="timer-section-label">DURATION</span>
            <div className="timer-presets">
              {PRESETS.map((p) => (
                <button
                  key={p.seconds}
                  className={`timer-preset-pill ${activePreset === p.seconds ? 'active' : ''}`}
                  onClick={() => handlePreset(p.seconds)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="timer-section">
            <span className="timer-section-label">CUSTOM</span>
            <div className="timer-custom-row">
              <div className="timer-custom-field">
                <input type="number" min="0" max="99" value={customMinutes} onChange={(e) => setCustomMinutes(e.target.value)} onKeyDown={handleCustomKeyDown} placeholder="00" className="timer-custom-input" />
                <span className="timer-custom-unit">min</span>
              </div>
              <span className="timer-custom-separator">:</span>
              <div className="timer-custom-field">
                <input type="number" min="0" max="59" value={customSeconds} onChange={(e) => setCustomSeconds(e.target.value)} onKeyDown={handleCustomKeyDown} placeholder="00" className="timer-custom-input" />
                <span className="timer-custom-unit">sec</span>
              </div>
              <button className="timer-custom-apply" onClick={handleCustomApply}>Set</button>
            </div>
          </div>

          <div className="timer-section">
            <span className="timer-section-label">XP REWARD</span>
            <div className="timer-xp-pills">
              {XP_OPTIONS.map((val) => (
                <button key={val} className={`timer-xp-pill ${xpAmount === val ? 'active' : ''}`} onClick={() => setXpAmount(val)}>+{val}</button>
              ))}
            </div>
          </div>

          <div className="timer-section">
            <span className="timer-section-label">ATTRIBUTE</span>
            <div className="timer-stat-pills">
              {STAT_ATTRIBUTES.map((attr) => {
                const meta = STAT_META[attr];
                const { Icon } = meta;
                const isActive = xpStat === attr;
                return (
                  <button
                    key={attr}
                    className={`timer-stat-pill ${isActive ? 'active' : ''}`}
                    style={isActive ? { background: `${meta.color}22`, borderColor: meta.color, color: meta.color } : {}}
                    onClick={() => setXpStat(attr)}
                  >
                    <Icon size={12} strokeWidth={2.5} style={{ flexShrink: 0 }} />
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Focus History ────────────────────────────────────────────────────── */}
      <div className="timer-history-section">
        <h3 className="timer-history-title">7-DAY FOCUS</h3>
        <div className="timer-history-chart">
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={last7} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ fill: '#737373', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: '#1c1c1c', border: '1px solid #333', borderRadius: 8, color: '#fff', fontSize: 12 }}
                formatter={(v) => [`${v}m`, 'Focus']}
                cursor={{ fill: 'rgba(255,255,255,0.04)' }}
              />
              <Bar dataKey="mins" radius={[4, 4, 0, 0]}>
                {last7.map((entry, i) => (
                  <Cell key={i} fill={entry.isToday ? '#fbbf24' : '#333'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {pomodoroSessions.filter(s => s.date === todayKey).length > 0 && (
          <div className="timer-sessions-list">
            <span className="timer-sessions-header">TODAY'S SESSIONS</span>
            {pomodoroSessions.filter(s => s.date === todayKey).slice(0, 5).map(s => {
              const meta = STAT_META[s.stat] || { label: s.stat, color: '#a3a3a3' };
              return (
                <div key={s.id} className="timer-session-item">
                  <span className="timer-session-dur">{formatMins(Math.floor(s.durationSecs / 60))}</span>
                  <span className="timer-session-stat" style={{ color: meta.color }}>{meta.label}</span>
                  <span className="timer-session-xp">+{s.xpAmount} XP</span>
                  <span className="timer-session-time">{relativeTime(s.completedAt)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showXpModal && <XpModal xp={xpAmount} stat={xpStat} onClose={handleXpClose} />}
    </div>
  );
};

export default TimerPage;
