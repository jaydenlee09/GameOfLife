import { useEffect } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { TIER_ICONS } from '../utils/rankMeta';
import './RankChangeModal.css';

const RankChangeModal = ({ tier, direction, streakDays, onClose }) => {
  const isUp = direction === 'up';
  const TierIcon = TIER_ICONS[tier.icon];

  // A short ascending chime on rank-up only — a drop gets no sound, matching the
  // sober (not punishing) tone for a reversible metric moving the wrong way.
  useEffect(() => {
    if (!isUp) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const notes = [392.0, 523.25, 659.25];
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
    } catch {
      // Web Audio unavailable/blocked — the chime is decorative, safe to skip.
    }
  }, [isUp]);

  return (
    <div className="rankchange-overlay" onClick={onClose}>
      <div
        className={`rankchange-modal rankchange-modal--${direction}`}
        style={{ '--tier-color': tier.color }}
        onClick={(e) => e.stopPropagation()}
      >
        {isUp && (
          <div className="rankchange-particles">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="rankchange-particle" style={{ '--i': i }} />
            ))}
          </div>
        )}

        <div className="rankchange-ring" />

        <div className="rankchange-content">
          <p className="rankchange-pre">
            {isUp ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {isUp ? 'Rank Up' : 'Rank Update'}
          </p>
          <div className="rankchange-badge-ring">
            {TierIcon && <TierIcon size={32} color={tier.color} />}
          </div>
          <h1 className="rankchange-name" style={{ color: tier.color }}>{tier.name}</h1>
          <p className="rankchange-sub">
            {isUp
              ? `${streakDays} ${streakDays === 1 ? 'day' : 'days'} straight at ${tier.name} — you earned it.`
              : 'The streak reset. A new one starts today.'}
          </p>
          <button className="rankchange-btn" onClick={onClose}>{isUp ? "Let's Go!" : 'Got it'}</button>
        </div>
      </div>
    </div>
  );
};

export default RankChangeModal;
