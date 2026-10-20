import React, { useEffect } from 'react';
import { Sparkle } from 'lucide-react';
import { scoreColor } from '../utils/scoreUtils';
import './LevelUpModal.css';

const MAX_BARS = 21;

const dayLabel = (dateKey, opts) => {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', opts);
};

// A level is 500 XP of real days (Daily Score × 10 each), so the card shows the
// days that built it: one bar per day, height = that day's score.
const LevelUpModal = ({ level, days = [], xpStatus, onClose }) => {
  // Play a triumphant ascending chime
  useEffect(() => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const notes = [261.63, 329.63, 392.0, 523.25, 659.25, 783.99];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.13);
        gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.13);
        gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + i * 0.13 + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.13 + 0.55);
        osc.start(ctx.currentTime + i * 0.13);
        osc.stop(ctx.currentTime + i * 0.13 + 0.6);
      });
    } catch (e) {}
  }, []);

  const shown = days.slice(-MAX_BARS);
  const best = days.reduce((b, d) => (!b || d.xp > b.xp ? d : b), null);
  const daysToNext = xpStatus?.daysToNext;

  return (
    <div className="levelup-overlay" onClick={onClose}>
      <div className="levelup-modal" role="dialog" aria-label={`Level ${level} reached`} onClick={(e) => e.stopPropagation()}>

        <div className="levelup-badge">
          {/* Particle rings */}
          <div className="levelup-particles">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="levelup-particle" style={{ '--i': i }} />
            ))}
          </div>
          {/* Glow ring */}
          <div className="levelup-ring" />
          <div className="levelup-content">
            <p className="levelup-pre"><Sparkle size={12} /> Level up <Sparkle size={12} /></p>
            <h1 className="levelup-number">{level}</h1>
          </div>
        </div>

        <div className="levelup-panel">
          <p className="levelup-sub">
            500 XP from <strong>{days.length} day{days.length === 1 ? '' : 's'}</strong> of real work
          </p>

          {shown.length > 0 && (
            <div className="levelup-days" aria-hidden="true">
              {shown.map((d, i) => (
                <span
                  key={d.dateKey}
                  className={`levelup-day${d === best ? ' is-best' : ''}`}
                  title={`${dayLabel(d.dateKey, { weekday: 'short', month: 'short', day: 'numeric' })} · ${(d.xp / 10).toFixed(1)} · ${d.xp} XP`}
                  style={{ '--h': `${Math.max(6, Math.min(d.xp, 100))}%`, '--c': scoreColor(d.xp / 10), '--d': `${0.35 + i * 0.03}s` }}
                />
              ))}
            </div>
          )}

          <dl className="levelup-facts">
            {best && (
              <div>
                <dt>Best day</dt>
                <dd>{dayLabel(best.dateKey, { weekday: 'short', month: 'short', day: 'numeric' })} · <span style={{ color: scoreColor(best.xp / 10) }}>{(best.xp / 10).toFixed(1)}</span></dd>
              </div>
            )}
            {daysToNext != null && (
              <div>
                <dt>Level {level + 1}</dt>
                <dd>~{daysToNext} solid day{daysToNext === 1 ? '' : 's'} away</dd>
              </div>
            )}
          </dl>

          <button className="levelup-btn" onClick={onClose} autoFocus>Keep going</button>
        </div>

      </div>
    </div>
  );
};

export default LevelUpModal;
