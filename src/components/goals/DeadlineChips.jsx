import React from 'react';
import { CalendarDays } from 'lucide-react';
import { deadlinePresets, goalDateKey, shortDay } from '../../utils/goalUtils';

/** Deadline quick picks plus a native date picker (quick add, edit, AI draft). */
export default function DeadlineChips({ value, onChange, now }) {
  const presets = deadlinePresets(now);
  const isPreset = presets.some((p) => p.key === value);
  const openPicker = (e) => { try { e.currentTarget.showPicker(); } catch { /* opens natively (iOS) */ } };
  return (
    <div className="gp-chips" role="group" aria-label="Deadline">
      {presets.map((p) => (
        <button
          key={p.id}
          type="button"
          className={`gp-chip${value === p.key ? ' gp-chip--on' : ''}`}
          aria-pressed={value === p.key}
          onClick={() => onChange(p.key)}
        >
          {p.label}
        </button>
      ))}
      <label className={`gp-chip gp-chip--pick${value && !isPreset ? ' gp-chip--on' : ''}`}>
        <CalendarDays size={12} /> {value && !isPreset ? shortDay(value, '') : 'Pick date'}
        <input
          type="date"
          className="gp-chip-date"
          min={goalDateKey(now)}
          value={value && !isPreset ? value : ''}
          aria-label="Pick a deadline"
          onClick={openPicker}
          onChange={(e) => e.target.value && onChange(e.target.value)}
        />
      </label>
    </div>
  );
}
