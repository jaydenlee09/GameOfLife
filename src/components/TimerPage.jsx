import React, { useState, useEffect, useRef, useCallback } from 'react';
import './TimerPage.css';
import STAT_META from './statMeta';

// ─── Constants ────────────────────────────────────────────────────────────────
const PRESETS = [
  { label: '5 min', seconds: 5 * 60 },
  { label: '10 min', seconds: 10 * 60 },
  { label: '25 min', seconds: 25 * 60 },
  { label: '45 min', seconds: 45 * 60 },
];

const XP_OPTIONS = [10, 20, 30, 50, 75, 100];

const STAT_ATTRIBUTES = Object.keys(STAT_META);
const STAT_LABELS = Object.fromEntries(Object.entries(STAT_META).map(([k, v]) => [k, v.label]));

// ─── Audio Cue ────────────────────────────────────────────────────────────────
const playFinishSound = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6

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
  } catch (e) {
    // Audio not supported — silently fail
  }
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
const TimerPage = ({ onUpdateStat }) => {
  const [totalSeconds, setTotalSeconds] = useState(25 * 60);
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);

  const [customMinutes, setCustomMinutes] = useState('');
  const [customSeconds, setCustomSeconds] = useState('');

  const [xpAmount, setXpAmount] = useState(20);
  const [xpStat, setXpStat] = useState('focus');

  const [showXpModal, setShowXpModal] = useState(false);
  const [activePreset, setActivePreset] = useState(25 * 60);

  const intervalRef = useRef(null);

  // ── Tick ──────────────────────────────────────────────────────────────────
  const tick = useCallback(() => {
    setTimeLeft((prev) => {
      if (prev <= 1) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
        setIsRunning(false);
        setHasStarted(false);
        playFinishSound();
        setTimeout(() => setShowXpModal(true), 600);
        return 0;
      }
      return prev - 1;
    });
  }, []);

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(tick, 1000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [isRunning, tick]);

  // ── Controls ──────────────────────────────────────────────────────────────
  const handleStart = () => {
    if (timeLeft === 0) return;
    setIsRunning(true);
    setHasStarted(true);
  };

  const handlePause = () => setIsRunning(false);

  const handleReset = () => {
    setIsRunning(false);
    setHasStarted(false);
    setTimeLeft(totalSeconds);
  };

  // ── Preset select ─────────────────────────────────────────────────────────
  const handlePreset = (seconds) => {
    setIsRunning(false);
    setHasStarted(false);
    setTotalSeconds(seconds);
    setTimeLeft(seconds);
    setActivePreset(seconds);
    setCustomMinutes('');
    setCustomSeconds('');
  };

  // ── Custom duration ────────────────────────────────────────────────────────
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
  };

  const handleCustomKeyDown = (e) => {
    if (e.key === 'Enter') handleCustomApply();
  };

  // ── XP grant ──────────────────────────────────────────────────────────────
  const handleXpClose = () => {
    setShowXpModal(false);
    onUpdateStat(xpStat, xpAmount);
    setTimeLeft(totalSeconds); // reset for next session
  };

  // ── Derived display ────────────────────────────────────────────────────────
  const displayMins = String(Math.floor(timeLeft / 60)).padStart(2, '0');
  const displaySecs = String(timeLeft % 60).padStart(2, '0');
  const progress = totalSeconds > 0 ? (totalSeconds - timeLeft) / totalSeconds : 0;

  // ── Circle progress ring ────────────────────────────────────────────────────
  const RADIUS = 140;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  const strokeDashoffset = CIRCUMFERENCE * (1 - progress);

  return (
    <div className="timer-page-container">
      <h1 className="section-page-title">TIMER</h1>

      <div className="timer-layout">
        {/* ── Main Timer Card ─────────────────────────────────────────────── */}
        <div className="timer-main-card">

          {/* Ring + Clock */}
          <div className="timer-ring-wrapper">
            <svg className="timer-ring-svg" viewBox="0 0 320 320">
              {/* Track */}
              <circle
                cx="160" cy="160" r={RADIUS}
                fill="none"
                stroke="#262626"
                strokeWidth="8"
              />
              {/* Progress */}
              <circle
                cx="160" cy="160" r={RADIUS}
                fill="none"
                stroke={isRunning ? '#fbbf24' : hasStarted ? '#fbbf24' : '#525252'}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={CIRCUMFERENCE}
                strokeDashoffset={strokeDashoffset}
                style={{ transition: 'stroke-dashoffset 0.8s linear, stroke 0.4s ease', transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
              />
            </svg>

            <div className="timer-clock">
              <span className="timer-display">
                {displayMins}<span className="timer-colon">:</span>{displaySecs}
              </span>
              {isRunning && <span className="timer-status-label">FOCUSING</span>}
              {!isRunning && hasStarted && timeLeft > 0 && (
                <span className="timer-status-label paused">PAUSED</span>
              )}
              {!isRunning && !hasStarted && timeLeft > 0 && (
                <span className="timer-status-label idle">READY</span>
              )}
              {timeLeft === 0 && (
                <span className="timer-status-label done">DONE!</span>
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="timer-controls">
            {!isRunning ? (
              <button
                className="timer-btn play"
                onClick={handleStart}
                disabled={timeLeft === 0}
              >
                ▶ {hasStarted ? 'Resume' : 'Start'}
              </button>
            ) : (
              <button className="timer-btn pause" onClick={handlePause}>
                ⏸ Pause
              </button>
            )}
            <button className="timer-btn reset" onClick={handleReset}>
              ↺ Reset
            </button>
          </div>
        </div>

        {/* ── Right Panel ─────────────────────────────────────────────────── */}
        <div className="timer-side-panel">

          {/* Presets */}
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

          {/* Custom duration */}
          <div className="timer-section">
            <span className="timer-section-label">CUSTOM</span>
            <div className="timer-custom-row">
              <div className="timer-custom-field">
                <input
                  type="number"
                  min="0"
                  max="99"
                  value={customMinutes}
                  onChange={(e) => setCustomMinutes(e.target.value)}
                  onKeyDown={handleCustomKeyDown}
                  placeholder="00"
                  className="timer-custom-input"
                />
                <span className="timer-custom-unit">min</span>
              </div>
              <span className="timer-custom-separator">:</span>
              <div className="timer-custom-field">
                <input
                  type="number"
                  min="0"
                  max="59"
                  value={customSeconds}
                  onChange={(e) => setCustomSeconds(e.target.value)}
                  onKeyDown={handleCustomKeyDown}
                  placeholder="00"
                  className="timer-custom-input"
                />
                <span className="timer-custom-unit">sec</span>
              </div>
              <button className="timer-custom-apply" onClick={handleCustomApply}>
                Set
              </button>
            </div>
          </div>

          {/* XP reward */}
          <div className="timer-section">
            <span className="timer-section-label">XP REWARD</span>
            <div className="timer-xp-pills">
              {XP_OPTIONS.map((val) => (
                <button
                  key={val}
                  className={`timer-xp-pill ${xpAmount === val ? 'active' : ''}`}
                  onClick={() => setXpAmount(val)}
                >
                  +{val}
                </button>
              ))}
            </div>
          </div>

          {/* Stat */}
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

      {showXpModal && (
        <XpModal xp={xpAmount} stat={xpStat} onClose={handleXpClose} />
      )}
    </div>
  );
};

export default TimerPage;
