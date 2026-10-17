import { useMemo, useState } from 'react';
import {
  X, Settings2, Loader2, Sparkles, ChevronLeft, ChevronRight, Trash2, Plus, Coffee, Target, Repeat, ListTodo, Undo2, Check, AlertTriangle,
} from 'lucide-react';
import { computeFreeGaps, fromMinutes, normalizePlannerSettings, shiftPlanBlock, toMinutes } from '../utils/dayPlanner';
import { toDateKey } from '../utils/calendarUtils';
import { shiftDateKey } from '../utils/scoreUtils';
import './DayPlanner.css';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const KIND_META = {
  task: { Icon: ListTodo, label: 'Task' },
  goal: { Icon: Target, label: 'Goal' },
  habit: { Icon: Repeat, label: 'Habit' },
  break: { Icon: Coffee, label: 'Break' },
};
const fmtSpan = (mins) => (mins >= 60 ? `${Math.floor(mins / 60)}h${mins % 60 ? ` ${mins % 60}m` : ''}` : `${mins}m`);
const newBusy = () => ({ id: `busy_${Date.now()}`, label: '', days: [1, 2, 3, 4, 5], start: '09:00', end: '15:00' });

/** Wake/bed + fixed busy times, saved once as user.planner. */
function PlannerSettings({ initial, onSave, onCancel }) {
  const [draft, setDraft] = useState(() => normalizePlannerSettings(initial));
  const update = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const updateBusy = (id, patch) => update({ busy: draft.busy.map((b) => (b.id === id ? { ...b, ...patch } : b)) });
  const toggleDay = (b, day) => updateBusy(b.id, { days: b.days.includes(day) ? b.days.filter((d) => d !== day) : [...b.days, day].sort() });

  return (
    <div className="dp-section">
      <p className="dp-hint">Set your usual day once. Plans only fill free time inside it, around your calendar and the fixed times below.</p>
      <div className="dp-row">
        <label className="dp-field"><span>Day starts</span><input type="time" step="900" value={draft.wake} onChange={(e) => update({ wake: e.target.value })} /></label>
        <label className="dp-field"><span>Bedtime</span><input type="time" step="900" value={draft.bed} onChange={(e) => update({ bed: e.target.value })} /></label>
      </div>

      <p className="dp-subhead">Fixed busy times <span>(school, work, practice…)</span></p>
      {draft.busy.length === 0 && <p className="dp-empty">None yet.</p>}
      {draft.busy.map((b) => (
        <div key={b.id} className="dp-busy">
          <div className="dp-busy-top">
            <input className="dp-busy-label" placeholder="Label (e.g. School)" value={b.label} onChange={(e) => updateBusy(b.id, { label: e.target.value })} />
            <button className="dp-icon-btn" onClick={() => update({ busy: draft.busy.filter((x) => x.id !== b.id) })} title="Remove"><Trash2 size={14} /></button>
          </div>
          <div className="dp-busy-days">
            {WEEKDAYS.map((name, day) => (
              <button key={name} className={`dp-day ${b.days.includes(day) ? 'dp-day--on' : ''}`} onClick={() => toggleDay(b, day)}>{name[0]}</button>
            ))}
          </div>
          <div className="dp-row">
            <label className="dp-field"><span>From</span><input type="time" step="900" value={b.start} onChange={(e) => updateBusy(b.id, { start: e.target.value })} /></label>
            <label className="dp-field"><span>To</span><input type="time" step="900" value={b.end} onChange={(e) => updateBusy(b.id, { end: e.target.value })} /></label>
          </div>
        </div>
      ))}
      <button className="dp-ghost-btn" onClick={() => update({ busy: [...draft.busy, newBusy()] })}><Plus size={14} /> Add busy time</button>

      <div className="dp-actions">
        {onCancel && <button className="dp-ghost-btn" onClick={onCancel}>Cancel</button>}
        <button className="dp-primary-btn" onClick={() => onSave({ ...normalizePlannerSettings(draft), configured: true })}>Save</button>
      </div>
    </div>
  );
}

/**
 * Plan My Day: pick the day and end time → AI proposes blocks → review (remove or
 * shift) → add them all to the Calendar as one undoable action.
 */
export default function DayPlanner({ initialDateKey, settings, onSaveSettings, calendarEvents, assistant, onClose }) {
  const todayKey = toDateKey(new Date());
  const [dateKey, setDateKey] = useState(initialDateKey && initialDateKey >= todayKey ? initialDateKey : todayKey);
  const [step, setStep] = useState(settings?.configured ? 'setup' : 'settings');
  const [endTime, setEndTime] = useState('');
  const [plan, setPlan] = useState(null);
  const [blocks, setBlocks] = useState([]);
  const [error, setError] = useState(null);
  const [applied, setApplied] = useState(null);

  const free = useMemo(
    () => computeFreeGaps({ dateKey, settings, endTime, calendarEvents }),
    [dateKey, settings, endTime, calendarEvents],
  );
  const freeMinutes = free.gaps.reduce((sum, g) => sum + g.end - g.start, 0);
  const effectiveEnd = endTime || normalizePlannerSettings(settings).bed;

  const build = async () => {
    setError(null);
    setStep('loading');
    const result = await assistant.planDay({ dateKey, settings, endTime });
    if (!result.ok) { setError(result.error); setStep('setup'); return; }
    setPlan(result.plan);
    setBlocks(result.plan.blocks);
    setStep('preview');
  };

  const shift = (id, delta) => {
    const next = shiftPlanBlock(blocks, id, delta, plan.gaps);
    if (next) setBlocks(next);
  };
  const canShift = (id, delta) => !!shiftPlanBlock(blocks, id, delta, plan.gaps);

  const add = () => {
    const result = assistant.applyPlan(plan, blocks);
    if (!result.ok) { setError(result.error); return; }
    setApplied({ count: result.count, activityId: result.activityId });
    setStep('done');
  };

  const undoPlan = () => {
    const result = assistant.undo(applied.activityId);
    setApplied((a) => ({ ...a, undoMessage: result.message, undone: result.ok }));
  };

  const scheduledCount = blocks.filter((b) => b.kind !== 'break').length;
  const labelFor = (key) => (key === todayKey ? 'Today' : key === shiftDateKey(todayKey, 1) ? 'Tomorrow'
    : new Date(`${key}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }));
  const dayLabel = labelFor(dateKey);
  // Today, tomorrow, and the day the Calendar was showing if it's further out.
  const dayChoices = [...new Set([todayKey, shiftDateKey(todayKey, 1), initialDateKey].filter((k) => k && k >= todayKey))]
    .map((key) => ({ key, label: labelFor(key) }));

  return (
    <div className="dp-overlay" onClick={onClose}>
      <div className="dp-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Plan my day">
        <div className="dp-header">
          <h3><Sparkles size={16} /> {step === 'settings' ? 'Your usual day' : `Plan ${/^(Today|Tomorrow)$/.test(dayLabel) ? dayLabel.toLowerCase() : dayLabel}`}</h3>
          <div className="dp-header-actions">
            {step !== 'settings' && step !== 'loading' && (
              <button className="dp-icon-btn" onClick={() => setStep('settings')} title="Planner settings"><Settings2 size={16} /></button>
            )}
            <button className="dp-icon-btn" onClick={onClose} title="Close"><X size={16} /></button>
          </div>
        </div>

        <div className="dp-body">
          {step === 'settings' && (
            <PlannerSettings
              initial={settings}
              onSave={(next) => { onSaveSettings(next); setStep('setup'); }}
              onCancel={settings?.configured ? () => setStep(plan ? 'preview' : 'setup') : null}
            />
          )}

          {step === 'setup' && (
            <div className="dp-section">
              <div className="dp-segment">
                {dayChoices.map(({ key, label }) => (
                  <button key={key} className={`dp-segment-btn ${dateKey === key ? 'dp-segment-btn--on' : ''}`} onClick={() => setDateKey(key)}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="dp-row">
                <label className="dp-field">
                  <span>Plan until</span>
                  <input type="time" step="900" value={effectiveEnd} onChange={(e) => setEndTime(e.target.value)} />
                </label>
              </div>
              <div className="dp-free">
                <strong>{fmtSpan(freeMinutes)} free</strong> between {fromMinutes(free.start)} and {fromMinutes(free.end)}
                {free.busy.length > 0 && <span> · {free.busy.length} thing{free.busy.length === 1 ? '' : 's'} already booked</span>}
              </div>
              {free.gaps.length > 0 && (
                <div className="dp-gaps">
                  {free.gaps.map((g) => <span key={g.start} className="dp-gap">{fromMinutes(g.start)}–{fromMinutes(g.end)}</span>)}
                </div>
              )}
              {error && <p className="dp-error"><AlertTriangle size={14} /> {error}</p>}
              <div className="dp-actions">
                <button className="dp-primary-btn" onClick={build} disabled={!free.gaps.length || toMinutes(effectiveEnd) === null}>
                  <Sparkles size={14} /> Build my plan
                </button>
              </div>
            </div>
          )}

          {step === 'loading' && (
            <div className="dp-loading"><Loader2 size={22} className="dp-spin" /> Looking at your tasks, goals and focus history…</div>
          )}

          {step === 'preview' && plan && (
            <div className="dp-section">
              {plan.summary && <p className="dp-summary">{plan.summary}</p>}
              {plan.insightsLine && <p className="dp-insight">{plan.insightsLine}</p>}

              <ul className="dp-blocks">
                {blocks.map((b) => {
                  const { Icon, label } = KIND_META[b.kind] || KIND_META.task;
                  return (
                    <li key={b.id} className={`dp-block dp-block--${b.kind}`}>
                      <div className="dp-block-time">
                        <span>{fromMinutes(b.start)}</span>
                        <span className="dp-block-dur">{fmtSpan(b.end - b.start)}</span>
                      </div>
                      <div className="dp-block-main">
                        <div className="dp-block-title"><Icon size={13} aria-label={label} /> {b.title}</div>
                        {b.intent && <div className="dp-block-intent">{b.intent}</div>}
                        {b.reason && <div className="dp-block-reason">{b.reason}</div>}
                      </div>
                      <div className="dp-block-controls">
                        <button className="dp-icon-btn" disabled={!canShift(b.id, -15)} onClick={() => shift(b.id, -15)} title="15 min earlier"><ChevronLeft size={14} /></button>
                        <button className="dp-icon-btn" disabled={!canShift(b.id, 15)} onClick={() => shift(b.id, 15)} title="15 min later"><ChevronRight size={14} /></button>
                        <button className="dp-icon-btn" onClick={() => setBlocks((list) => list.filter((x) => x.id !== b.id))} title="Remove"><X size={14} /></button>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {plan.unscheduled.length > 0 && (
                <div className="dp-unscheduled">
                  <p className="dp-subhead">Didn't fit</p>
                  {plan.unscheduled.map((u) => <p key={u.title}>{u.title}: <span>{u.reason}</span></p>)}
                </div>
              )}
              <p className="dp-hint">Breaks stay off your calendar. Blocks get a "Start focus" button there.</p>
              {error && <p className="dp-error"><AlertTriangle size={14} /> {error}</p>}

              <div className="dp-actions">
                <button className="dp-ghost-btn" onClick={() => setStep('setup')}>Rebuild</button>
                <button className="dp-primary-btn" onClick={add} disabled={!scheduledCount}>
                  Add {scheduledCount} block{scheduledCount === 1 ? '' : 's'} to calendar
                </button>
              </div>
            </div>
          )}

          {step === 'done' && applied && (
            <div className="dp-section dp-done">
              <p className="dp-done-title"><Check size={18} /> {applied.undone ? 'Plan removed.' : `Added ${applied.count} block${applied.count === 1 ? '' : 's'} to your calendar.`}</p>
              {applied.undoMessage && !applied.undone && <p className="dp-hint">{applied.undoMessage}</p>}
              {!applied.undone && <p className="dp-hint">Open a block on the Calendar and tap Start focus when it's time.</p>}
              <div className="dp-actions">
                {!applied.undone && <button className="dp-ghost-btn" onClick={undoPlan}><Undo2 size={14} /> Undo</button>}
                <button className="dp-primary-btn" onClick={onClose}>Done</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
