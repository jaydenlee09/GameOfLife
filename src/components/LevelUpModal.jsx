import React, { useEffect } from 'react';
import './LevelUpModal.css';

const LevelUpModal = ({ newLevel, newRank, onClose }) => {
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

  return (
    <div className="levelup-overlay" onClick={onClose}>
      <div className="levelup-modal" onClick={(e) => e.stopPropagation()}>

        {/* Particle rings */}
        <div className="levelup-particles">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="levelup-particle" style={{ '--i': i }} />
          ))}
        </div>

        {/* Glow ring */}
        <div className="levelup-ring" />

        {/* Content */}
        <div className="levelup-content">
          <p className="levelup-pre">✦ LEVEL UP ✦</p>
          <h1 className="levelup-number">{newLevel}</h1>
          {newRank ? (
            <div className="levelup-rank-up">
              <img src={newRank.badge} alt={newRank.name} className="levelup-rank-badge" />
              <p className="levelup-rank-name" style={{ color: newRank.color }}>
                {newRank.name.toUpperCase()}
              </p>
              <p className="levelup-sub">New rank unlocked!</p>
            </div>
          ) : (
            <p className="levelup-sub">You're getting stronger.</p>
          )}
          <button className="levelup-btn" onClick={onClose}>Let's Go!</button>
        </div>

      </div>
    </div>
  );
};

export default LevelUpModal;
