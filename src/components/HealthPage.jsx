import React, { useState } from 'react';
import './HealthPage.css';

const getLocalDateKey = (offsetDays = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

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

const SCREENTIME_COLORS = { ideal: '#4ade80', toomuch: '#fb923c', excessive: '#f87171' };
const getScreentimeStatus = (h) => h <= 1 ? 'ideal' : h <= 3 ? 'toomuch' : 'excessive';
const SCREENTIME_LABELS   = { ideal: '✓ Ideal', toomuch: 'Too Much', excessive: '⚠ Excessive' };

const HealthPage = ({ healthLog = {}, setHealthLog, onUpdateStat }) => {
  const todayKey = getLocalDateKey(0);
  const today    = healthLog[todayKey] || {};

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
    }

    setHealthLog(prev => ({ ...prev, [todayKey]: entry }));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  // Last 7 days sleep chart data
  const last7Sleep = Array.from({ length: 7 }, (_, i) => {
    const key   = getLocalDateKey(-(6 - i));
    const entry = healthLog[key];
    const d     = new Date(); d.setDate(d.getDate() - (6 - i));
    return { label: d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 1), hours: entry?.sleepHours || 0, key };
  });

  const maxSleep = Math.max(10, ...last7Sleep.map(s => s.hours));

  const last7Screentime = Array.from({ length: 7 }, (_, i) => {
    const key   = getLocalDateKey(-(6 - i));
    const entry = healthLog[key];
    const d     = new Date(); d.setDate(d.getDate() - (6 - i));
    return { label: d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 1), hours: entry?.screentimeHours || 0, key };
  });
  const maxScreentime = Math.max(8, ...last7Screentime.map(s => s.hours));

  return (
    <div className="health-page">
      <h1 className="section-page-title">HEALTH</h1>

      <div className="health-layout">
        {/* ── Today's Log ──────────────────────────────────────────────────── */}
        <div className="health-main">
          <div className="health-card">
            <h2 className="health-card-title">🌙 SLEEP</h2>
            <div className="health-sleep-row">
              <div className="health-field">
                <label className="health-label">Bedtime</label>
                <input type="time" className="health-input" value={bedtime} onChange={e => setBedtime(e.target.value)} />
              </div>
              <div className="health-sleep-arrow">→</div>
              <div className="health-field">
                <label className="health-label">Wake time</label>
                <input type="time" className="health-input" value={waketime} onChange={e => setWaketime(e.target.value)} />
              </div>
              {sleepHours !== null && (
                <div className={`health-sleep-result ${sleepHours >= 8 && sleepHours <= 10 ? 'good' : sleepHours >= 6 ? 'ok' : 'bad'}`}>
                  <span className="health-sleep-hours">{sleepHours}h</span>
                  <span className="health-sleep-label">{sleepHours >= 8 && sleepHours <= 10 ? '✓ Optimal' : sleepHours >= 6 ? 'Fair' : sleepHours > 10 ? 'Too much' : 'Too little'}</span>
                </div>
              )}
            </div>
          </div>

          <div className="health-card">
            <h2 className="health-card-title">💪 WORKOUTS</h2>
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
                    <button className="health-remove-btn" onClick={() => removeWorkout(i)}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="health-card">
            <h2 className="health-card-title">⚡ ENERGY LEVEL</h2>
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

          <div className="health-card">
            <h2 className="health-card-title">💧 WATER INTAKE</h2>
            <div className="health-water-row">
              <button className="health-st-stepper" onClick={() => setWater(w => Math.max(0, w - 1))}>−</button>
              <span className="health-water-bottles">
                {Array.from({ length: water }, (_, i) => <span key={i}>🍶</span>)}
              </span>
              <span className="health-water-count">{water} bottle{water === 1 ? '' : 's'}</span>
              <button className="health-st-stepper" onClick={() => setWater(w => w + 1)}>+</button>
            </div>
          </div>

          <div className="health-card">
            <h2 className="health-card-title">📱 SCREEN TIME</h2>
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
                  <span className="health-st-status">{SCREENTIME_LABELS[screentimeStatus]}</span>
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
            {saved ? '✓ Saved! XP Awarded' : 'Save Today\'s Log'}
          </button>
          {today.xpAwarded && !saved && <p className="health-already-saved">XP already awarded for today.</p>}
        </div>

        {/* ── Sleep Chart ──────────────────────────────────────────────────── */}
        <div className="health-sidebar">
          <div className="health-card">
            <h2 className="health-card-title">📊 7-DAY SLEEP</h2>
            <div className="health-sleep-chart">
              {last7Sleep.map(({ label, hours, key }) => (
                <div key={key} className="health-sleep-bar-col">
                  <div className="health-sleep-bar-wrap">
                    <div
                      className={`health-sleep-bar-fill ${hours >= 8 && hours <= 10 ? 'good' : hours >= 6 ? 'ok' : hours > 0 ? 'bad' : 'empty'}`}
                      style={{ height: `${hours > 0 ? (hours / maxSleep) * 100 : 4}%` }}
                    />
                  </div>
                  <span className="health-sleep-bar-val">{hours > 0 ? `${hours}h` : '—'}</span>
                  <span className="health-sleep-bar-day">{label}</span>
                </div>
              ))}
            </div>
            <div className="health-sleep-legend">
              <span className="health-legend-dot good" />8–10h optimal
              <span className="health-legend-dot ok" style={{ marginLeft: '0.75rem' }} />6–7h fair
              <span className="health-legend-dot bad" style={{ marginLeft: '0.75rem' }} />&lt;6h
            </div>
          </div>

          <div className="health-card">
            <h2 className="health-card-title">📱 7-DAY SCREEN TIME</h2>
            <div className="health-sleep-chart">
              {last7Screentime.map(({ label, hours, key }) => {
                const status = hours > 0 ? getScreentimeStatus(hours) : 'empty';
                return (
                  <div key={key} className="health-sleep-bar-col">
                    <div className="health-sleep-bar-wrap">
                      <div
                        className="health-sleep-bar-fill"
                        style={{
                          height: `${hours > 0 ? (hours / maxScreentime) * 100 : 4}%`,
                          background: hours > 0 ? SCREENTIME_COLORS[status] : '#2a2a2a',
                        }}
                      />
                    </div>
                    <span className="health-sleep-bar-val">{hours > 0 ? `${Math.floor(hours)}h${Math.round((hours % 1) * 60) > 0 ? `${Math.round((hours % 1) * 60)}m` : ''}` : '—'}</span>
                    <span className="health-sleep-bar-day">{label}</span>
                  </div>
                );
              })}
            </div>
            <div className="health-sleep-legend">
              <span className="health-legend-dot" style={{ background: SCREENTIME_COLORS.ideal }} />&lt;1h ideal
              <span className="health-legend-dot" style={{ background: SCREENTIME_COLORS.toomuch, marginLeft: '0.75rem' }} />1–3h
              <span className="health-legend-dot" style={{ background: SCREENTIME_COLORS.excessive, marginLeft: '0.75rem' }} />&gt;3h
            </div>
          </div>

          <div className="health-card">
            <h2 className="health-card-title">🏆 XP AWARDS</h2>
            <div className="health-xp-list">
              <div className="health-xp-item"><span>😴 Sleep 8–10h</span><span className="health-xp-val">+20 Health</span></div>
              <div className="health-xp-item"><span>💪 Log a workout</span><span className="health-xp-val">+15 Str / +15 Hlt</span></div>
              <div className="health-xp-item"><span>⚡ Energy ≥ 4</span><span className="health-xp-val">+10 Mental</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HealthPage;
