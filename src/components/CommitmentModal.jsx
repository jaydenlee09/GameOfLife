import React, { useState, useRef, useCallback } from 'react';
import './CommitmentModal.css';

const HOLD_DURATION = 3000; // ms

const CommitmentModal = ({ commitment, date, onConfirm }) => {
  const [progress, setProgress] = useState(0); // 0–100
  const [holding, setHolding] = useState(false);
  const intervalRef = useRef(null);
  const startTimeRef = useRef(null);

  const startHold = useCallback(() => {
    if (intervalRef.current) return;
    setHolding(true);
    startTimeRef.current = Date.now();

    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const pct = Math.min((elapsed / HOLD_DURATION) * 100, 100);
      setProgress(pct);
      if (pct >= 100) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
        onConfirm();
      }
    }, 16);
  }, [onConfirm]);

  const stopHold = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setHolding(false);
    setProgress(0);
  }, []);

  // Format date string "YYYY-MM-DD" to readable label
  const formatDate = (dateKey) => {
    if (!dateKey) return '';
    const [y, m, d] = dateKey.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric',
    });
  };

  return (
    <div className="cm-overlay">
      <div className="cm-modal">
        <div className="cm-header">
          <span className="cm-icon">🎯</span>
          <h2 className="cm-title">Today's Commitment</h2>
          <p className="cm-date">{formatDate(date)}</p>
        </div>

        <div className="cm-commitment-box">
          <p className="cm-commitment-text">"{commitment}"</p>
        </div>

        <p className="cm-instruction">
          Did you follow through? Hold the button below to confirm your commitment and earn <span className="cm-xp">+10 XP</span>.
        </p>

        <div className="cm-hold-btn-wrap">
          <button
            className={`cm-hold-btn${holding ? ' cm-hold-btn--holding' : ''}`}
            onPointerDown={startHold}
            onPointerUp={stopHold}
            onPointerLeave={stopHold}
          >
            <span className="cm-hold-label">
              {progress > 0 ? 'Hold…' : 'Hold to Confirm'}
            </span>
            <div
              className="cm-hold-progress"
              style={{ width: `${progress}%` }}
            />
          </button>
        </div>
      </div>
    </div>
  );
};

export default CommitmentModal;
