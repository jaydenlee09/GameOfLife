import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronLeft, ChevronRight, ChevronDown, X, Check, MoreHorizontal, Plus,
  Video, Hourglass, Clapperboard, Trophy, CheckSquare, NotebookText, MessageCircle, Repeat,
  HeartPulse, Moon, Zap, GlassWater, Dumbbell, Utensils, ArrowRight, TrendingUp, Lightbulb, PenLine, Target,
  Apple, AlertTriangle, Droplet, Smartphone,
} from 'lucide-react';
import './DailyLogPage.css';
import EMOTIONS from '../utils/logMeta';
import { saveVideo, getVideo, deleteVideo } from '../utils/videoDB';
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
import { getScreentimeStatus, SCREENTIME_COLORS } from '../utils/healthUtils';

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
  videoName: null,
  commitment: '',
});

// ─── Video Upload Section ─────────────────────────────────────────────────────

const VideoSection = ({ date, videoName, onVideoChange }) => {
  const fileInputRef = useRef(null);
  // objectUrl is a fresh blob URL created from the IndexedDB blob — lives only
  // in this component's lifetime and is revoked on cleanup.
  const [objectUrl, setObjectUrl] = useState(null);
  const objectUrlRef = useRef(null);

  // Load blob from IndexedDB whenever the date or videoName changes
  useEffect(() => {
    let cancelled = false;

    // Revoke any previous object URL
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
      setObjectUrl(null);
    }

    if (!videoName) return;

    getVideo(date)
      .then((blob) => {
        if (cancelled || !blob) return;
        const url = URL.createObjectURL(blob);
        objectUrlRef.current = url;
        setObjectUrl(url);
      })
      .catch(() => {
        // silently ignore — user will see upload UI
      });

    return () => {
      cancelled = true;
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [date, videoName]);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Persist raw blob to IndexedDB so it survives page reloads
    saveVideo(date, file).catch(console.error);

    // Create a temporary object URL for immediate playback in this session
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    setObjectUrl(url);

    onVideoChange({ name: file.name });
  };

  const handleRemove = () => {
    deleteVideo(date).catch(console.error);
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setObjectUrl(null);
    onVideoChange(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="log-section">
      <h3 className="log-section-title"><Video size={18} /> Day in Review</h3>
      <p className="log-section-subtitle">Upload a short video from your camera roll</p>

      {objectUrl ? (
        <div className="video-preview-wrapper">
          <video
            className="video-preview"
            src={objectUrl}
            controls
            playsInline
          />
          <div className="video-meta">
            <span className="video-name">{videoName}</span>
            <button className="video-remove-btn" onClick={handleRemove}><X size={14} /> Remove</button>
          </div>
        </div>
      ) : videoName ? (
        // Blob is still loading from IndexedDB (or failed)
        <div className="video-preview-wrapper">
          <div className="video-loading"><Hourglass size={14} /> Loading video…</div>
          <div className="video-meta">
            <span className="video-name">{videoName}</span>
            <button className="video-remove-btn" onClick={handleRemove}><X size={14} /> Remove</button>
          </div>
        </div>
      ) : (
        <label className="video-upload-area" htmlFor="video-upload-input">
          <div className="video-upload-icon"><Clapperboard size={28} /></div>
          <div className="video-upload-text">Tap to upload a video</div>
          <div className="video-upload-hint">Under 1 minute · MP4, MOV, etc.</div>
          <input
            ref={fileInputRef}
            id="video-upload-input"
            type="file"
            accept="video/*"
            className="video-file-input"
            onChange={handleFileChange}
          />
        </label>
      )}
    </div>
  );
};

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

const HabitFormModal = ({ habit, onSave, onClose }) => {
  const isEdit = !!habit;
  const [name, setName] = useState(habit?.name || '');
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

// ─── Health Check-In ────────────────────────────────────────────────────────────

const WORKOUT_TYPES = ['Run', 'Lift', 'HIIT', 'Yoga', 'Walk', 'Swim', 'Cycle', 'Basketball', 'Other'];

const calcSleepHours = (bed, wake) => {
  if (!bed || !wake) return null;
  const [bh, bm] = bed.split(':').map(Number);
  const [wh, wm] = wake.split(':').map(Number);
  let mins = (wh * 60 + wm) - (bh * 60 + bm);
  if (mins < 0) mins += 24 * 60;
  return Math.round((mins / 60) * 10) / 10;
};

const ENERGY_LABELS = ['', 'Drained', 'Low', 'Okay', 'Good', 'Great'];
const ENERGY_COLORS = ['', '#f87171', '#fb923c', '#fbbf24', '#4ade80', '#22d3ee'];

const SCREENTIME_LABELS   = { ideal: { Icon: Check, text: 'Ideal' }, toomuch: { Icon: null, text: 'Too Much' }, excessive: { Icon: AlertTriangle, text: 'Excessive' } };

const FOOD_VERDICT_COLORS = { healthy: '#30d158', unhealthy: '#ff453a', neutral: '#8e8e93' };
const CHEAT_MEAL_THRESHOLD = 50;

// Cheat meals are only "unlocked" once enough points are saved up; below the
// threshold, eating unhealthy isn't a purchase, it's a flat penalty.
const FOOD_OPTION_MAP = {
  healthy:     { label: 'Healthy',           points: 8,   verdict: 'healthy' },
  neutral:     { label: 'Neutral',           points: 0,   verdict: 'neutral' },
  small_cheat: { label: 'Small Cheat Meal',  points: -30, verdict: 'unhealthy' },
  large_cheat: { label: 'Large Cheat Meal',  points: -40, verdict: 'unhealthy' },
  unhealthy:   { label: 'Unhealthy',         points: -60, verdict: 'unhealthy' },
};
const CHEAT_MEAL_KEYS  = ['healthy', 'neutral', 'small_cheat', 'large_cheat'];
const PENALTY_ONLY_KEYS = ['healthy', 'neutral', 'unhealthy'];

const HealthCheckIn = ({ healthLog = {}, setHealthLog, foodLog = {}, setFoodLog, foodPoints = { balance: 0 }, setFoodPoints, onUpdateStat, todayKey }) => {
  const today = healthLog[todayKey] || {};
  const [expanded, setExpanded] = useState(false);

  const [bedtime,      setBedtime]      = useState(today.sleepBedtime  || '');
  const [waketime,     setWaketime]     = useState(today.sleepWakeTime || '');
  const [energy,       setEnergy]       = useState(today.energyLevel   || 0);
  const [water,        setWater]        = useState(today.waterGlasses  || 0);
  const [workouts,     setWorkouts]     = useState(today.workouts      || []);
  const [newWType,     setNewWType]     = useState('Run');
  const [newWDur,      setNewWDur]      = useState('');
  const [newWNote,     setNewWNote]     = useState('');
  const [screentimeH,  setScreentimeH]  = useState(today.screentimeHours != null ? Math.floor(today.screentimeHours) : 0);
  const [screentimeM,  setScreentimeM]  = useState(today.screentimeHours != null ? Math.round((today.screentimeHours % 1) * 60) : 0);
  const [saved,        setSaved]        = useState(false);

  const [newFoodText,      setNewFoodText]      = useState('');
  const [newFoodOptionKey, setNewFoodOptionKey] = useState('healthy');
  const foodEntries = foodLog[todayKey]?.entries || [];
  const foodBalance = foodPoints.balance ?? 0;
  const canAffordCheatMeal = foodBalance > CHEAT_MEAL_THRESHOLD;
  const foodOptionKeys = canAffordCheatMeal ? CHEAT_MEAL_KEYS : PENALTY_ONLY_KEYS;

  let activeFoodKey = 'healthy';
  if (newFoodOptionKey === 'neutral') activeFoodKey = 'neutral';
  else if (canAffordCheatMeal && (newFoodOptionKey === 'small_cheat' || newFoodOptionKey === 'large_cheat')) activeFoodKey = newFoodOptionKey;
  else if (!canAffordCheatMeal && newFoodOptionKey === 'unhealthy') activeFoodKey = 'unhealthy';
  const selectedFoodOption = FOOD_OPTION_MAP[activeFoodKey];

  const addFood = () => {
    const text = newFoodText.trim();
    if (!text) return;

    const { points, verdict, label } = selectedFoodOption;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const entry = { id, text, verdict, label, points, ts: Date.now() };

    setFoodLog(prev => {
      const dayEntries = prev[todayKey]?.entries || [];
      return { ...prev, [todayKey]: { entries: [...dayEntries, entry] } };
    });
    setFoodPoints(prev => ({ balance: (prev.balance || 0) + points }));
    setNewFoodText('');
  };

  const removeFood = (id) => {
    const entry = (foodLog[todayKey]?.entries || []).find(e => e.id === id);
    if (!entry) return;
    setFoodLog(prev => {
      const dayEntries = prev[todayKey]?.entries || [];
      return { ...prev, [todayKey]: { entries: dayEntries.filter(e => e.id !== id) } };
    });
    setFoodPoints(prev => ({ balance: (prev.balance || 0) - entry.points }));
  };

  const screentimeTotal  = screentimeH + screentimeM / 60;
  const screentimeStatus = getScreentimeStatus(screentimeTotal);
  const screentimeColor  = SCREENTIME_COLORS[screentimeStatus];

  const sleepHours = calcSleepHours(bedtime, waketime);

  const addWorkout = () => {
    if (!newWDur) return;
    setWorkouts(prev => [...prev, { type: newWType, durationMins: parseInt(newWDur, 10), notes: newWNote }]);
    setNewWDur('');
    setNewWNote('');
  };

  const removeWorkout = (i) => setWorkouts(prev => prev.filter((_, idx) => idx !== i));

  const handleSave = () => {
    const entry = {
      sleepBedtime:    bedtime,
      sleepWakeTime:   waketime,
      sleepHours:      sleepHours,
      workouts,
      energyLevel:     energy,
      waterGlasses:    water,
      screentimeHours: screentimeTotal,
      xpAwarded:       today.xpAwarded || false,
    };

    // Award XP if not already awarded today
    if (!today.xpAwarded) {
      entry.xpAwarded = true;
      if (sleepHours >= 8 && sleepHours <= 10)
        onUpdateStat?.('health', 20, { source: 'manual', label: 'Good sleep logged' });
      if (workouts.length > 0) {
        onUpdateStat?.('strength', 15, { source: 'manual', label: 'Workout logged' });
        onUpdateStat?.('health',   15, { source: 'manual', label: 'Workout logged' });
      }
      if (energy >= 4)
        onUpdateStat?.('mentalHealth', 10, { source: 'manual', label: 'High energy day' });
      // Eating well feeds the same XP/stat progression as everything else — this is
      // what connects food to the system instead of only moving a separate "points" ledger.
      const foodNetToday = (foodLog[todayKey]?.entries || []).reduce((s, e) => s + (e.points || 0), 0);
      if (foodNetToday > 0) {
        onUpdateStat?.('health',     10, { source: 'manual', label: 'Ate well' });
        onUpdateStat?.('discipline',  5, { source: 'manual', label: 'Stayed on food budget' });
      }
    }

    setHealthLog(prev => ({ ...prev, [todayKey]: entry }));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const items = [];
  if (today.sleepHours) items.push({ Icon: Moon, text: `${today.sleepHours.toFixed(1)}h sleep` });
  if (today.energyLevel) items.push({ Icon: Zap, text: `Energy ${today.energyLevel}/5` });
  if (today.waterGlasses) items.push({ Icon: GlassWater, text: `${today.waterGlasses} bottles` });
  if (today.workouts?.length) items.push({ Icon: Dumbbell, text: `${today.workouts.length} workout${today.workouts.length !== 1 ? 's' : ''}` });
  if (foodPoints?.balance != null) items.push({ Icon: Utensils, text: `${foodPoints.balance} food budget` });

  return (
    <div className="log-section">
      <div className="checkin-health-header" onClick={() => setExpanded(o => !o)}>
        <h3 className="log-section-title"><HeartPulse size={18} /> Health</h3>
        <span className={`checkin-health-chevron${expanded ? ' checkin-health-chevron--open' : ''}`}><ChevronDown size={16} /></span>
      </div>

      {!expanded && (
        <div className="checkin-health">
          {items.length > 0 ? (
            <div className="checkin-health-items">
              {items.map((item, i) => { const Icon = item.Icon; return <span key={i} className="checkin-health-chip"><Icon size={13} /> {item.text}</span>; })}
            </div>
          ) : (
            <p className="checkin-health-empty">Nothing logged yet today.</p>
          )}
        </div>
      )}

      {expanded && (
        <div className="checkin-health-body">
          <div className="health-checkin-card">
            <h4 className="health-card-title"><Apple size={20} /> Food Tracker</h4>
            <div className="health-food-balance">
              <span className="health-food-balance-icon"><Utensils size={20} /></span>
              <span className="health-food-balance-val">{foodPoints.balance ?? 0}</span>
              <span className="health-food-balance-label">cheat-meal budget · eating well also earns XP</span>
            </div>
            <div className="health-food-add">
              <input
                type="text" className="health-input health-input--flex"
                placeholder="What did you eat?" value={newFoodText}
                onChange={e => setNewFoodText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addFood()}
              />
              <button className="health-add-btn" onClick={addFood} disabled={!newFoodText.trim()}>Log it</button>
            </div>
            <div className="health-food-verdict-row">
              {foodOptionKeys.map(key => {
                const o = FOOD_OPTION_MAP[key];
                return (
                  <button
                    key={key}
                    type="button"
                    className={`health-food-verdict-btn ${activeFoodKey === key ? 'active' : ''}`}
                    style={activeFoodKey === key ? { borderColor: FOOD_VERDICT_COLORS[o.verdict], color: FOOD_VERDICT_COLORS[o.verdict], background: `${FOOD_VERDICT_COLORS[o.verdict]}18` } : {}}
                    onClick={() => setNewFoodOptionKey(key)}
                  >
                    {o.label} ({o.points > 0 ? `+${o.points}` : o.points})
                  </button>
                );
              })}
            </div>
            {foodBalance <= CHEAT_MEAL_THRESHOLD && (
              <p className="health-food-hint">Save over {CHEAT_MEAL_THRESHOLD} points to unlock small/large cheat meals instead of the flat unhealthy penalty.</p>
            )}
            {foodEntries.length === 0 ? (
              <p className="health-empty">No food logged yet today</p>
            ) : (
              <div className="health-workout-list">
                {foodEntries.slice().reverse().map((f) => {
                  const overBudget = f.verdict === 'unhealthy' && (foodPoints.balance ?? 0) < 0;
                  return (
                    <div key={f.id} className="health-food-item">
                      <span className="health-workout-type">{f.text}</span>
                      <span
                        className="health-food-badge"
                        style={{ borderColor: FOOD_VERDICT_COLORS[f.verdict], color: FOOD_VERDICT_COLORS[f.verdict], background: `${FOOD_VERDICT_COLORS[f.verdict]}18` }}
                      >
                        {f.label || (f.verdict === 'healthy' ? 'Healthy' : f.verdict === 'unhealthy' ? 'Unhealthy' : 'Neutral')}
                      </span>
                      <span className={`health-food-points ${f.points > 0 ? 'pos' : f.points < 0 ? 'neg' : ''}`}>
                        {f.points > 0 ? `+${f.points}` : f.points}
                      </span>
                      {overBudget && <span className="health-food-warning"><AlertTriangle size={12} /> over budget</span>}
                      <button className="health-remove-btn" onClick={() => removeFood(f.id)}><X size={14} /></button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="health-checkin-card">
            <h4 className="health-card-title"><Moon size={20} /> Sleep</h4>
            <div className="health-sleep-row">
              <div className="health-field">
                <label className="health-label">Bedtime</label>
                <input type="time" className="health-input" value={bedtime} onChange={e => setBedtime(e.target.value)} />
              </div>
              <div className="health-sleep-arrow"><ArrowRight size={16} /></div>
              <div className="health-field">
                <label className="health-label">Wake time</label>
                <input type="time" className="health-input" value={waketime} onChange={e => setWaketime(e.target.value)} />
              </div>
              {sleepHours !== null && (
                <div className={`health-sleep-result ${sleepHours >= 8 && sleepHours <= 10 ? 'good' : sleepHours >= 6 ? 'ok' : 'bad'}`}>
                  <span className="health-sleep-hours">{sleepHours}h</span>
                  <span className="health-sleep-label">{sleepHours >= 8 && sleepHours <= 10 ? <><Check size={12} /> Optimal</> : sleepHours >= 6 ? 'Fair' : sleepHours > 10 ? 'Too much' : 'Too little'}</span>
                </div>
              )}
            </div>
          </div>

          <div className="health-checkin-card">
            <h4 className="health-card-title"><Dumbbell size={20} /> Workouts</h4>
            <div className="health-workout-add">
              <select className="health-select" value={newWType} onChange={e => setNewWType(e.target.value)}>
                {WORKOUT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <input type="number" className="health-input health-input--sm" placeholder="min" min="1" max="300" value={newWDur} onChange={e => setNewWDur(e.target.value)} />
              <input type="text" className="health-input health-input--flex" placeholder="Notes (optional)" value={newWNote} onChange={e => setNewWNote(e.target.value)} onKeyDown={e => e.key === 'Enter' && addWorkout()} />
              <button className="health-add-btn" onClick={addWorkout} disabled={!newWDur}>+ Add</button>
            </div>
            {workouts.length === 0 ? (
              <p className="health-empty">No workouts logged yet</p>
            ) : (
              <div className="health-workout-list">
                {workouts.map((w, i) => (
                  <div key={i} className="health-workout-item">
                    <span className="health-workout-type">{w.type}</span>
                    <span className="health-workout-dur">{w.durationMins} min</span>
                    {w.notes && <span className="health-workout-note">{w.notes}</span>}
                    <button className="health-remove-btn" onClick={() => removeWorkout(i)}><X size={14} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="health-checkin-card">
            <h4 className="health-card-title"><Zap size={20} /> Energy Level</h4>
            <div className="health-energy-row">
              {[1,2,3,4,5].map(val => (
                <button
                  key={val}
                  className={`health-energy-btn ${energy === val ? 'active' : ''}`}
                  style={energy === val ? { borderColor: ENERGY_COLORS[val], color: ENERGY_COLORS[val], background: `${ENERGY_COLORS[val]}18` } : {}}
                  onClick={() => setEnergy(val)}
                >
                  <span className="health-energy-num">{val}</span>
                  <span className="health-energy-label">{ENERGY_LABELS[val]}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="health-checkin-card">
            <h4 className="health-card-title"><Droplet size={20} /> Water Intake</h4>
            <div className="health-water-row">
              <button className="health-st-stepper" onClick={() => setWater(w => Math.max(0, w - 1))}>−</button>
              <span className="health-water-bottles">
                {Array.from({ length: water }, (_, i) => <GlassWater key={i} size={18} />)}
              </span>
              <span className="health-water-count">{water} bottle{water === 1 ? '' : 's'}</span>
              <button className="health-st-stepper" onClick={() => setWater(w => w + 1)}>+</button>
            </div>
          </div>

          <div className="health-checkin-card">
            <h4 className="health-card-title"><Smartphone size={20} /> Screen Time</h4>
            <div className="health-screentime-row">
              <div className="health-screentime-inputs">
                <div className="health-screentime-field">
                  <button className="health-st-stepper" onClick={() => setScreentimeH(h => Math.max(0, h - 1))}>−</button>
                  <input
                    type="number" className="health-input health-st-input"
                    min="0" max="24" value={screentimeH}
                    onChange={e => setScreentimeH(Math.min(24, Math.max(0, parseInt(e.target.value) || 0)))}
                  />
                  <button className="health-st-stepper" onClick={() => setScreentimeH(h => Math.min(24, h + 1))}>+</button>
                  <span className="health-st-unit">h</span>
                </div>
                <div className="health-screentime-field">
                  <button className="health-st-stepper" onClick={() => setScreentimeM(m => m === 0 ? 45 : m - 15)}>−</button>
                  <input
                    type="number" className="health-input health-st-input"
                    min="0" max="59" value={screentimeM}
                    onChange={e => setScreentimeM(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))}
                  />
                  <button className="health-st-stepper" onClick={() => setScreentimeM(m => m >= 45 ? 0 : m + 15)}>+</button>
                  <span className="health-st-unit">m</span>
                </div>
              </div>
              {screentimeTotal > 0 && (
                <div className="health-screentime-badge" style={{ borderColor: screentimeColor, background: `${screentimeColor}18`, color: screentimeColor }}>
                  <span className="health-st-total">{screentimeH > 0 ? `${screentimeH}h ` : ''}{screentimeM > 0 ? `${screentimeM}m` : screentimeH > 0 ? '' : '0m'}</span>
                  <span className="health-st-status">{SCREENTIME_LABELS[screentimeStatus].Icon && React.createElement(SCREENTIME_LABELS[screentimeStatus].Icon, { size: 12 })} {SCREENTIME_LABELS[screentimeStatus].text}</span>
                </div>
              )}
            </div>
            <div className="health-screentime-guide">
              <span style={{ color: SCREENTIME_COLORS.ideal }}>&lt;1h ideal</span>
              <span style={{ color: SCREENTIME_COLORS.toomuch }}>1–3h too much</span>
              <span style={{ color: SCREENTIME_COLORS.excessive }}>&gt;3h excessive</span>
            </div>
          </div>

          <button className={`health-save-btn ${saved ? 'saved' : ''}`} onClick={handleSave}>
            {saved ? <><Check size={14} /> Saved! XP Awarded</> : 'Save Today\'s Log'}
          </button>
          {today.xpAwarded && !saved && <p className="health-already-saved">XP already awarded for today.</p>}
        </div>
      )}
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const COMMIT_HOLD_DURATION = 3000;

const DailyLogPage = ({ logs, setLogs, onCommitmentLocked, habits = [], setHabits, onToggleHabitDay, healthLog = {}, setHealthLog, foodLog = {}, setFoodLog, foodPoints = { balance: 0 }, setFoodPoints, onUpdateStat }) => {
  const todayKey = getTodayKey();
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [detailHabit, setDetailHabit] = useState(null);
  const [isAddingHabit, setIsAddingHabit] = useState(false);
  const [editingHabit, setEditingHabit] = useState(null);
  const [openHabitMenuId, setOpenHabitMenuId] = useState(null);
  const [habitMenuAnchor, setHabitMenuAnchor] = useState(null);

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

  const openHabitMenu = useCallback((habitId, e) => {
    if (openHabitMenuId === habitId) {
      setOpenHabitMenuId(null);
      return;
    }
    setHabitMenuAnchor(e.currentTarget.getBoundingClientRect());
    setOpenHabitMenuId(habitId);
  }, [openHabitMenuId]);

  // Close the open habit's "more actions" menu on any outside click, or on scroll
  // (the menu is portaled with fixed positioning, so it won't track the button on scroll)
  useEffect(() => {
    if (!openHabitMenuId) return;
    const closeMenu = () => setOpenHabitMenuId(null);
    const handleClickOutside = (e) => {
      if (!e.target.closest('.habit-checkin-menu') && !e.target.closest('.habit-checkin-menu-btn')) {
        closeMenu();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('scroll', closeMenu, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('scroll', closeMenu, true);
    };
  }, [openHabitMenuId]);

  // ── Hold-to-Commit state ──
  const [commitHolding, setCommitHolding] = useState(false);
  const [commitProgress, setCommitProgress] = useState(0);
  const [committed, setCommitted] = useState(false);
  const commitIntervalRef = useRef(null);
  const commitStartRef = useRef(null);

  const startCommitHold = useCallback((entry) => {
    if (!entry.commitment?.trim() || committed) return;
    if (commitIntervalRef.current) return;
    setCommitHolding(true);
    commitStartRef.current = Date.now();
    commitIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - commitStartRef.current;
      const pct = Math.min((elapsed / COMMIT_HOLD_DURATION) * 100, 100);
      setCommitProgress(pct);
      if (pct >= 100) {
        clearInterval(commitIntervalRef.current);
        commitIntervalRef.current = null;
        setCommitHolding(false);
        setCommitted(true);
        onCommitmentLocked && onCommitmentLocked({
          date: selectedDate,
          text: entry.commitment.trim(),
        });
      }
    }, 16);
  }, [committed, onCommitmentLocked, selectedDate]);

  const stopCommitHold = useCallback(() => {
    if (commitIntervalRef.current) {
      clearInterval(commitIntervalRef.current);
      commitIntervalRef.current = null;
    }
    setCommitHolding(false);
    setCommitProgress(0);
  }, []);

  // Reset committed state when date or commitment text changes
  useEffect(() => {
    setCommitted(false);
    setCommitProgress(0);
    setCommitHolding(false);
    if (commitIntervalRef.current) {
      clearInterval(commitIntervalRef.current);
      commitIntervalRef.current = null;
    }
  }, [selectedDate]);

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
    arr[index] = value;
    updateField(field, arr);
  };

  // ── Video ──
  const handleVideoChange = (videoData) => {
    updateField('videoName', videoData ? videoData.name : null);
  };

  const isToday = selectedDate === todayKey;

  return (
    <div className="daily-log-container">

      {/* ── Left Sidebar: Entry List ── */}
      <aside className={`log-sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="log-sidebar-header">
          {!sidebarCollapsed && <h2 className="log-sidebar-title"><NotebookText size={18} /> Journal</h2>}
          <button
            className="log-sidebar-toggle"
            onClick={() => setSidebarCollapsed(c => !c)}
            title={sidebarCollapsed ? 'Expand journal' : 'Collapse journal'}
            aria-label={sidebarCollapsed ? 'Expand journal' : 'Collapse journal'}
          >
            {sidebarCollapsed ? <ChevronRight size={14} strokeWidth={3} /> : <ChevronLeft size={14} strokeWidth={3} />}
          </button>
        </div>

        {!sidebarCollapsed && (
          <>
            <div className="log-entries-list">
              {sortedDates.length === 0 && (
                <div className="log-empty-hint">No entries yet.</div>
              )}
              {sortedDates.map(dateKey => {
                const isActive = dateKey === selectedDate;
                const isEntryToday = dateKey === todayKey;
                const entry = logs[dateKey] || EMPTY_ENTRY();
                const hasContent =
                  entry.emotions?.length > 0 ||
                  entry.proud?.some(v => v.trim()) ||
                  entry.improve?.some(v => v.trim()) ||
                  entry.learned?.trim() ||
                  entry.notes?.trim() ||
                  entry.videoName;

                return (
                  <button
                    key={dateKey}
                    className={`log-entry-pill ${isActive ? 'active' : ''} ${isEntryToday ? 'today' : ''}`}
                    onClick={() => setSelectedDate(dateKey)}
                  >
                    <div className="log-entry-pill-left">
                      <span className="log-entry-dot" style={{ opacity: hasContent ? 1 : 0.25 }} />
                      <div>
                        <span className="log-entry-date">{formatShortDate(dateKey)}</span>
                        {isEntryToday && <span className="log-entry-today-badge">Today</span>}
                      </div>
                    </div>
                    {entry.emotions?.length > 0 && (
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
      </aside>

      {/* ── Right Panel: Log Form ── */}
      <main className="log-main">
        {/* Date Header */}
        <div className="log-date-header">
          <h1 className="log-date-title">{formatDisplayDate(selectedDate)}</h1>
          {isToday && <span className="log-today-badge">Today</span>}
          {!isToday && (
            <span className="log-readonly-badge">Past Entry</span>
          )}
        </div>

        <div className="log-form">

          {/* ── Emotions ── */}
          <div className="log-section">
            <h3 className="log-section-title"><MessageCircle size={18} /> How did you feel today?</h3>
            <p className="log-section-subtitle">Select all that apply</p>
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

          {/* ── Keystone Habits (today only) ── */}
          {isToday && (
            <div className="log-section">
              <h3 className="log-section-title"><Repeat size={18} /> Today's habits</h3>
              {habits.length > 0 && (
                <p className="log-section-subtitle">
                  Tap to check off — {habits.filter(h => h.history?.[todayKey]).length}/{habits.length} done
                </p>
              )}
              <div className="habit-checkin-list">
                {habits.map(h => {
                  const done = !!h.history?.[todayKey];
                  const streak = getHabitStreak(h);
                  const menuOpen = openHabitMenuId === h.id;
                  return (
                    <div key={h.id} className={`habit-checkin-row ${done ? 'done' : ''}`}>
                      <button
                        className="habit-checkin-toggle"
                        onClick={() => onToggleHabitDay && onToggleHabitDay(h.id, todayKey)}
                      >
                        <span className="habit-checkin-check">
                          {done && <Check size={13} strokeWidth={3} />}
                        </span>
                        <span className="habit-checkin-name">{h.name}</span>
                      </button>
                      <div className="habit-checkin-meta">
                        {streak > 0 && (
                          <span className="habit-checkin-streak" title={`${streak}-day streak`}>
                            <img src={flameIcon} alt="" className="habit-checkin-streak-icon" />
                            {streak}
                          </span>
                        )}
                        <button
                          className="habit-checkin-menu-btn"
                          onClick={(e) => openHabitMenu(h.id, e)}
                          aria-label={`More actions for ${h.name}`}
                          aria-expanded={menuOpen}
                        >
                          <MoreHorizontal size={14} />
                        </button>
                        {menuOpen && habitMenuAnchor && createPortal(
                          <div
                            className="habit-checkin-menu"
                            role="menu"
                            style={{
                              top: habitMenuAnchor.bottom + 4,
                              left: Math.min(habitMenuAnchor.right - 140, window.innerWidth - 148),
                            }}
                          >
                            <button role="menuitem" onClick={() => { setDetailHabit(h); setOpenHabitMenuId(null); }}>
                              View details
                            </button>
                            <button role="menuitem" onClick={() => { setEditingHabit(h); setOpenHabitMenuId(null); }}>
                              Edit
                            </button>
                            <button
                              role="menuitem"
                              className="habit-checkin-menu-danger"
                              onClick={() => { setOpenHabitMenuId(null); deleteHabit(h.id); }}
                            >
                              Delete
                            </button>
                          </div>,
                          document.body
                        )}
                      </div>
                    </div>
                  );
                })}
                <button className="habit-checkin-add-row" onClick={() => setIsAddingHabit(true)}>
                  <Plus size={14} strokeWidth={2.5} /> Add a habit
                </button>
              </div>
              {habits.length === 0 && (
                <p className="checkin-health-empty">No habits yet — add one to start tracking.</p>
              )}
            </div>
          )}

          {detailHabit && (
            <HabitDetailModal
              habit={habits.find(h => h.id === detailHabit.id) || detailHabit}
              onToggleDay={onToggleHabitDay}
              onClose={() => setDetailHabit(null)}
            />
          )}

          {isAddingHabit && (
            <HabitFormModal
              habit={null}
              onSave={saveHabit}
              onClose={() => setIsAddingHabit(false)}
            />
          )}

          {editingHabit && (
            <HabitFormModal
              habit={editingHabit}
              onSave={saveHabit}
              onClose={() => setEditingHabit(null)}
            />
          )}

          {/* ── Health check-in (today only) ── */}
          {isToday && (
            <HealthCheckIn
              healthLog={healthLog}
              setHealthLog={setHealthLog}
              foodLog={foodLog}
              setFoodLog={setFoodLog}
              foodPoints={foodPoints}
              setFoodPoints={setFoodPoints}
              onUpdateStat={onUpdateStat}
              todayKey={todayKey}
            />
          )}

          {/* ── Proud Of ── */}
          <div className="log-section">
            <h3 className="log-section-title"><Trophy size={18} /> Three things I'm proud of</h3>
            <div className="reflection-inputs">
              {[0, 1, 2].map(i => (
                <div key={i} className="reflection-input-row">
                  <span className="reflection-number">{i + 1}</span>
                  <input
                    type="text"
                    className="reflection-input"
                    placeholder={`Something you're proud of...`}
                    value={(currentEntry.proud || ['', '', ''])[i]}
                    onChange={e => updateArrayField('proud', i, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* ── Improve ── */}
          <div className="log-section">
            <h3 className="log-section-title"><TrendingUp size={18} /> Three things I can improve</h3>
            <div className="reflection-inputs">
              {[0, 1, 2].map(i => (
                <div key={i} className="reflection-input-row">
                  <span className="reflection-number">{i + 1}</span>
                  <input
                    type="text"
                    className="reflection-input"
                    placeholder={`Something to work on...`}
                    value={(currentEntry.improve || ['', '', ''])[i]}
                    onChange={e => updateArrayField('improve', i, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* ── Learned ── */}
          <div className="log-section">
            <h3 className="log-section-title"><Lightbulb size={18} /> One thing I learned</h3>
            <textarea
              className="learned-textarea"
              placeholder="What did you learn today?"
              value={currentEntry.learned || ''}
              onChange={e => updateField('learned', e.target.value)}
              rows={4}
            />
          </div>

          {/* ── Additional Notes ── */}
          <div className="log-section">
            <h3 className="log-section-title"><PenLine size={18} /> Additional Notes</h3>
            <textarea
              className="notes-textarea"
              placeholder="Anything else you want to remember about today?"
              value={currentEntry.notes || ''}
              onChange={e => updateField('notes', e.target.value)}
              rows={5}
            />
          </div>

          {/* ── Video Upload ── */}
          <VideoSection
            date={selectedDate}
            videoName={currentEntry.videoName || null}
            onVideoChange={handleVideoChange}
          />

          {/* ── Commitment for Tomorrow ── */}
          <div className="log-section commitment-section">
            <h3 className="log-section-title"><Target size={18} /> Commitment for Tomorrow</h3>
            <p className="log-section-subtitle">One thing you commit to doing tomorrow</p>
            <input
              type="text"
              className={`reflection-input commitment-input${committed ? ' commitment-input--locked' : ''}`}
              placeholder="I will..."
              value={currentEntry.commitment || ''}
              onChange={e => isToday && !committed && updateField('commitment', e.target.value)}
              readOnly={!isToday || committed}
            />
            {isToday && (
              <div className="commit-hold-btn-wrap">
                {committed ? (
                  <div className="commit-confirmed-banner">
                    <span><CheckSquare size={14} /> Commitment locked in!</span>
                  </div>
                ) : (
                  <button
                    className={`commit-hold-btn${commitHolding ? ' commit-hold-btn--holding' : ''}${!currentEntry.commitment?.trim() ? ' commit-hold-btn--disabled' : ''}`}
                    onPointerDown={() => startCommitHold(currentEntry)}
                    onPointerUp={stopCommitHold}
                    onPointerLeave={stopCommitHold}
                    disabled={!currentEntry.commitment?.trim()}
                  >
                    <span className="commit-hold-label">
                      {commitProgress > 0 ? 'Hold…' : 'Hold to Commit'}
                    </span>
                    <div
                      className="commit-hold-progress"
                      style={{ width: `${commitProgress}%` }}
                    />
                  </button>
                )}
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  );
};

export default DailyLogPage;
