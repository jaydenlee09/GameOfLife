import React, { useState } from 'react';
import {
  ChevronDown, X, Check, Moon, Zap, GlassWater, Dumbbell, ArrowRight,
  Apple, AlertTriangle, Smartphone, Sparkles,
} from 'lucide-react';
import { getScreentimeStatus, SCREENTIME_COLORS } from '../../utils/healthUtils';
import { calcSleepHours } from '../../utils/closeDay';

// Today's health check-in for the Close the Day routine. Every field saves to
// healthLog[todayKey] as you change it (no Save button); the health XP for it is
// paid when you close the day (see getPendingHealthAwards).

const WORKOUT_TYPES = ['Run', 'Lift', 'HIIT', 'Yoga', 'Walk', 'Swim', 'Cycle', 'Basketball', 'Muay Thai', 'Other'];

const ENERGY_LABELS = ['', 'Drained', 'Low', 'Okay', 'Good', 'Great'];
const ENERGY_COLORS = ['', '#f87171', '#fb923c', '#fbbf24', '#4ade80', '#22d3ee'];

const SCREENTIME_LABELS = { ideal: { Icon: Check, text: 'Ideal' }, toomuch: { Icon: null, text: 'Too Much' }, excessive: { Icon: AlertTriangle, text: 'Excessive' } };

const FOOD_VERDICT_COLORS = { healthy: '#30d158', unhealthy: '#ff453a', neutral: '#8e8e93' };
const CHEAT_MEAL_THRESHOLD = 50;

// Cheat meals are only "unlocked" once enough points are saved up; below the
// threshold, eating unhealthy isn't a purchase, it's a flat penalty.
const FOOD_OPTION_MAP = {
  healthy:     { label: 'Healthy',           points: 4,   verdict: 'healthy' },
  neutral:     { label: 'Neutral',           points: 0,   verdict: 'neutral' },
  small_cheat: { label: 'Small Cheat Meal',  points: -30, verdict: 'unhealthy' },
  large_cheat: { label: 'Large Cheat Meal',  points: -40, verdict: 'unhealthy' },
  unhealthy:   { label: 'Unhealthy',         points: -60, verdict: 'unhealthy' },
};
const CHEAT_MEAL_KEYS  = ['healthy', 'neutral', 'small_cheat', 'large_cheat'];
const PENALTY_ONLY_KEYS = ['healthy', 'neutral', 'unhealthy'];

const sleepVerdict = (hours) => {
  if (hours >= 8 && hours <= 10) return { tone: 'good', label: <><Check size={12} /> Optimal</> };
  if (hours > 10) return { tone: 'ok', label: 'Too much' };
  if (hours >= 6) return { tone: 'ok', label: 'Fair' };
  return { tone: 'bad', label: 'Too little' };
};

const FoodTracker = ({ todayKey, foodLog, setFoodLog, foodPoints, setFoodPoints }) => {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [optionKey, setOptionKey] = useState('healthy');
  const entries = foodLog[todayKey]?.entries || [];
  const balance = foodPoints.balance ?? 0;
  const canAffordCheatMeal = balance > CHEAT_MEAL_THRESHOLD;
  const optionKeys = canAffordCheatMeal ? CHEAT_MEAL_KEYS : PENALTY_ONLY_KEYS;

  let activeKey = 'healthy';
  if (optionKey === 'neutral') activeKey = 'neutral';
  else if (canAffordCheatMeal && (optionKey === 'small_cheat' || optionKey === 'large_cheat')) activeKey = optionKey;
  else if (!canAffordCheatMeal && optionKey === 'unhealthy') activeKey = 'unhealthy';

  const addFood = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const { points, verdict, label } = FOOD_OPTION_MAP[activeKey];
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const entry = { id, text: trimmed, verdict, label, points, ts: Date.now() };
    setFoodLog(prev => ({ ...prev, [todayKey]: { entries: [...(prev[todayKey]?.entries || []), entry] } }));
    setFoodPoints(prev => ({ balance: (prev.balance || 0) + points }));
    setText('');
  };

  const removeFood = (id) => {
    const entry = entries.find(e => e.id === id);
    if (!entry) return;
    setFoodLog(prev => ({ ...prev, [todayKey]: { entries: (prev[todayKey]?.entries || []).filter(e => e.id !== id) } }));
    setFoodPoints(prev => ({ balance: (prev.balance || 0) - entry.points }));
  };

  return (
    <div className="hq-card hq-card--wide">
      <button type="button" className="hq-food-toggle" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span className="hq-card-title"><Apple size={16} /> Food</span>
        <span className="hq-food-summary">
          {entries.length ? `${entries.length} logged today` : 'Anything not logged yet?'} · {balance} budget
        </span>
        <ChevronDown size={16} className={`hq-chevron${open ? ' hq-chevron--open' : ''}`} />
      </button>

      {open && (
        <div className="hq-food-body">
          <div className="health-food-add">
            <input
              type="text" className="health-input health-input--flex"
              placeholder="What did you eat?" value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addFood()}
            />
            <button className="health-add-btn" onClick={addFood} disabled={!text.trim()}>Log it</button>
          </div>
          <div className="health-food-verdict-row">
            {optionKeys.map(key => {
              const o = FOOD_OPTION_MAP[key];
              const color = FOOD_VERDICT_COLORS[o.verdict];
              return (
                <button
                  key={key}
                  type="button"
                  className={`health-food-verdict-btn ${activeKey === key ? 'active' : ''}`}
                  style={activeKey === key ? { borderColor: color, color, background: `${color}18` } : {}}
                  onClick={() => setOptionKey(key)}
                >
                  {o.label} ({o.points > 0 ? `+${o.points}` : o.points})
                </button>
              );
            })}
          </div>
          {balance <= CHEAT_MEAL_THRESHOLD && (
            <p className="health-food-hint">Save over {CHEAT_MEAL_THRESHOLD} points to unlock small/large cheat meals instead of the flat unhealthy penalty.</p>
          )}
          {entries.length > 0 && (
            <div className="health-workout-list">
              {entries.slice().reverse().map((f) => {
                const color = FOOD_VERDICT_COLORS[f.verdict];
                return (
                  <div key={f.id} className="health-food-item">
                    <span className="health-workout-type">{f.text}</span>
                    <span className="health-food-badge" style={{ borderColor: color, color, background: `${color}18` }}>
                      {f.label || (f.verdict === 'healthy' ? 'Healthy' : f.verdict === 'unhealthy' ? 'Unhealthy' : 'Neutral')}
                    </span>
                    <span className={`health-food-points ${f.points > 0 ? 'pos' : f.points < 0 ? 'neg' : ''}`}>
                      {f.points > 0 ? `+${f.points}` : f.points}
                    </span>
                    {f.verdict === 'unhealthy' && balance < 0 && <span className="health-food-warning"><AlertTriangle size={12} /> over budget</span>}
                    <button className="health-remove-btn" onClick={() => removeFood(f.id)} aria-label={`Remove ${f.text}`}><X size={14} /></button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const HealthQuick = ({ todayKey, healthLog, setHealthLog, foodLog, setFoodLog, foodPoints, setFoodPoints }) => {
  const today = healthLog[todayKey] || {};
  const [newWType, setNewWType] = useState('Run');
  const [newWDur, setNewWDur] = useState('');

  const patch = (fields) => setHealthLog(prev => ({ ...prev, [todayKey]: { ...(prev[todayKey] || {}), ...fields } }));

  const bedtime = today.sleepBedtime || '';
  const waketime = today.sleepWakeTime || '';
  const setSleep = (bed, wake) => patch({ sleepBedtime: bed, sleepWakeTime: wake, sleepHours: calcSleepHours(bed, wake) });
  const sleepHours = calcSleepHours(bedtime, waketime);
  const sleep = sleepHours !== null ? sleepVerdict(sleepHours) : null;

  const workouts = today.workouts || [];
  const addWorkout = () => {
    const mins = parseInt(newWDur, 10);
    if (!mins) return;
    patch({ workouts: [...workouts, { type: newWType, durationMins: mins, notes: '' }] });
    setNewWDur('');
  };

  const water = today.waterGlasses || 0;

  const stTotal = today.screentimeHours || 0;
  const stH = Math.floor(stTotal);
  const stM = Math.round((stTotal % 1) * 60);
  const setScreentime = (h, m) => patch({ screentimeHours: h + m / 60 });
  const stStatus = getScreentimeStatus(stTotal);
  const stColor = SCREENTIME_COLORS[stStatus];

  return (
    <div className="hq">
      <div className="hq-card hq-card--wide">
        <span className="hq-card-title"><Moon size={16} /> Last night’s sleep</span>
        <div className="hq-sleep-row">
          <label className="hq-field">
            <span className="hq-label">Bed</span>
            <input type="time" className="health-input" value={bedtime} onChange={e => setSleep(e.target.value, waketime)} />
          </label>
          <ArrowRight size={14} className="hq-sleep-arrow" />
          <label className="hq-field">
            <span className="hq-label">Woke</span>
            <input type="time" className="health-input" value={waketime} onChange={e => setSleep(bedtime, e.target.value)} />
          </label>
          {sleep && (
            <span className={`hq-sleep-result hq-sleep-result--${sleep.tone}`}>
              <strong>{sleepHours}h</strong> {sleep.label}
            </span>
          )}
        </div>
      </div>

      <div className="hq-card">
        <span className="hq-card-title"><Zap size={16} /> Energy</span>
        <div className="hq-energy-row" role="radiogroup" aria-label="Energy level">
          {[1, 2, 3, 4, 5].map(val => {
            const active = today.energyLevel === val;
            return (
              <button
                key={val}
                type="button"
                role="radio"
                aria-checked={active}
                className={`hq-energy-btn${active ? ' active' : ''}`}
                style={active ? { borderColor: ENERGY_COLORS[val], color: ENERGY_COLORS[val], background: `${ENERGY_COLORS[val]}18` } : {}}
                onClick={() => patch({ energyLevel: val })}
                title={ENERGY_LABELS[val]}
              >
                {val}
              </button>
            );
          })}
        </div>
        <span className="hq-hint">{today.energyLevel ? ENERGY_LABELS[today.energyLevel] : '1 drained · 5 great'}</span>
      </div>

      <div className="hq-card">
        <span className="hq-card-title"><GlassWater size={16} /> Water</span>
        <div className="hq-stepper">
          <button type="button" className="health-st-stepper" onClick={() => patch({ waterGlasses: Math.max(0, water - 1) })} aria-label="One less bottle">−</button>
          <span className="hq-stepper-value">{water}</span>
          <button type="button" className="health-st-stepper" onClick={() => patch({ waterGlasses: water + 1 })} aria-label="One more bottle">+</button>
        </div>
        <span className="hq-hint">bottle{water === 1 ? '' : 's'}</span>
      </div>

      <div className="hq-card">
        <span className="hq-card-title"><Smartphone size={16} /> Screen time</span>
        <div className="hq-st-row">
          <div className="hq-stepper">
            <button type="button" className="health-st-stepper" onClick={() => setScreentime(Math.max(0, stH - 1), stM)} aria-label="One hour less">−</button>
            <span className="hq-stepper-value">{stH}<small>h</small></span>
            <button type="button" className="health-st-stepper" onClick={() => setScreentime(Math.min(24, stH + 1), stM)} aria-label="One hour more">+</button>
          </div>
          <div className="hq-stepper">
            <button type="button" className="health-st-stepper" onClick={() => setScreentime(stH, stM === 0 ? 45 : stM - 15)} aria-label="15 minutes less">−</button>
            <span className="hq-stepper-value">{stM}<small>m</small></span>
            <button type="button" className="health-st-stepper" onClick={() => setScreentime(stH, stM >= 45 ? 0 : stM + 15)} aria-label="15 minutes more">+</button>
          </div>
        </div>
        <span className="hq-hint" style={stTotal > 0 ? { color: stColor } : undefined}>
          {stTotal > 0
            ? <>{SCREENTIME_LABELS[stStatus].Icon && React.createElement(SCREENTIME_LABELS[stStatus].Icon, { size: 11 })} {SCREENTIME_LABELS[stStatus].text}</>
            : 'under 1h is ideal'}
        </span>
      </div>

      <div className="hq-card">
        <span className="hq-card-title"><Dumbbell size={16} /> Workouts</span>
        <div className="hq-workout-add">
          <select className="health-select" value={newWType} onChange={e => setNewWType(e.target.value)} aria-label="Workout type">
            {WORKOUT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <input
            type="number" className="health-input hq-workout-min" placeholder="min" min="1" max="300"
            value={newWDur} onChange={e => setNewWDur(e.target.value)} onKeyDown={e => e.key === 'Enter' && addWorkout()}
            aria-label="Minutes"
          />
          <button type="button" className="health-add-btn" onClick={addWorkout} disabled={!parseInt(newWDur, 10)}>Add</button>
        </div>
        {workouts.length > 0 && (
          <div className="hq-workout-list">
            {workouts.map((w, i) => (
              <span key={i} className="hq-workout-chip">
                {w.type} · {w.durationMins}m
                <button type="button" onClick={() => patch({ workouts: workouts.filter((_, idx) => idx !== i) })} aria-label={`Remove ${w.type}`}><X size={12} /></button>
              </span>
            ))}
          </div>
        )}
      </div>

      <FoodTracker todayKey={todayKey} foodLog={foodLog} setFoodLog={setFoodLog} foodPoints={foodPoints} setFoodPoints={setFoodPoints} />

      <p className="hq-xp-note"><Sparkles size={12} /> Health XP is paid when you close the day.</p>
    </div>
  );
};

export default HealthQuick;
