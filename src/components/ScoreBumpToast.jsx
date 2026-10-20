import React, { useEffect } from 'react';
import { TrendingUp } from 'lucide-react';
import { scoreColor } from '../utils/scoreUtils';
import { XP_PER_POINT } from '../utils/xpUtils';
import './ScoreBumpToast.css';

const SHOW_MS = 2600;

// "+0.8 Daily Score" right after something you did raised today's score, with the
// XP it adds (score × 10) and where that leaves the level bar. Re-mounted (by key)
// for each new rise, so quick rises restart the timer and re-pop.
const ScoreBumpToast = ({ bump, xpStatus, onDone }) => {
  useEffect(() => {
    const id = setTimeout(onDone, SHOW_MS);
    return () => clearTimeout(id);
  }, [onDone]);

  const color = scoreColor(bump.score);
  const xpGain = Math.round(bump.delta * XP_PER_POINT);
  const pct = Math.min((xpStatus.into / xpStatus.cap) * 100, 100);
  const gainPct = Math.min((Math.min(xpGain, xpStatus.into) / xpStatus.cap) * 100, pct);

  return (
    <div className="score-bump-wrap" role="status" aria-live="polite">
      <div className="score-bump" style={{ '--bump-color': color }}>
        <span className="score-bump-icon"><TrendingUp size={16} /></span>
        <div className="score-bump-main">
          <div className="score-bump-line">
            <strong className="score-bump-delta">+{bump.delta.toFixed(1)}</strong>
            <span className="score-bump-label">Daily Score</span>
            <span className="score-bump-score">{bump.score.toFixed(1)}</span>
          </div>
          <div className="score-bump-xp">
            <span className="score-bump-xp-gain">+{xpGain} XP</span>
            <span className="score-bump-track">
              <span className="score-bump-fill" style={{ width: `${pct - gainPct}%` }} />
              <span className="score-bump-gain" style={{ left: `${pct - gainPct}%`, width: `${gainPct}%` }} />
            </span>
            <span className="score-bump-level">LVL {xpStatus.level}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScoreBumpToast;
