import React from 'react';
import { Sparkles, LoaderCircle, AlertTriangle, RefreshCw, Check, Lock, BarChart3 } from 'lucide-react';

const MAX_PATTERN_LINES = 3; // the morning stays quick; the Weekly Reset shows them all

const formatFree = (mins) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m`;
};

/** The top of the Focus step: the AI's read on today, plus what the last 4 weeks add up to (counted in code). */
export const CoachRead = ({ coach, loading, error, onRetry, patternLines = [] }) => {
  if (!coach && !loading && !error && patternLines.length === 0) return null;
  return (
    <section className="li li-card mj-read cd-a-read" aria-busy={loading}>
      <span className="li-kicker"><Sparkles size={13} /> Coach’s read</span>
      {coach && <p className="li-text">{coach.read}</p>}
      {!coach && loading && <p className="li-text mj-read-wait"><LoaderCircle size={14} className="log-review-spin" /> Looking at your last few days…</p>}
      {!coach && !loading && error && (
        <p className="li-error" role="alert">
          <AlertTriangle size={13} /> <span>{error}</span>
          <button type="button" className="li-link" onClick={onRetry}><RefreshCw size={12} /> Try again</button>
        </p>
      )}
      {patternLines.length > 0 && (
        <ul className="mj-patterns">
          {patternLines.slice(0, MAX_PATTERN_LINES).map((line) => <li key={line}><BarChart3 size={13} /> {line}</li>)}
        </ul>
      )}
    </section>
  );
};

/**
 * Shown instead of the Lock in button when the win is vague or too big, or the
 * if-then you wrote is vague. It never blocks: both buttons lock in.
 */
export const WinCheckCard = ({ check, onUseRewrite, onKeep }) => {
  const winFlag = check.verdict !== 'clear';
  const planFlag = check.plan?.verdict === 'vague';
  return (
    <section className="li li-card mj-wincheck" role="status">
      <span className="li-kicker"><Sparkles size={13} /> Before you lock in</span>
      {winFlag && (
        <>
          <p className="li-text">{check.feedback}</p>
          {check.verdict === 'too_big' && check.freeMinutes != null && (
            <span className="li-label">About {formatFree(check.freeMinutes)} free left today</span>
          )}
          <div className="ic-step">
            <span className="li-label">Today is a win if I</span>
            <p className="ic-step-text">{check.rewrite}</p>
          </div>
        </>
      )}
      {planFlag && (
        <>
          <p className="li-text">{check.plan.feedback}</p>
          <div className="ic-step">
            <span className="li-label">Sharper plan</span>
            <p className="ic-step-text">If {check.plan.when}, I will {check.plan.then}.</p>
          </div>
        </>
      )}
      <div className="mj-wincheck-actions">
        <button type="button" className="cd-btn cd-btn--primary" onClick={onUseRewrite}>
          <Check size={15} /> {winFlag && planFlag ? 'Use both and lock in' : 'Use this and lock in'}
        </button>
        <button type="button" className="cd-btn" onClick={onKeep}><Lock size={14} /> Keep mine and lock in</button>
      </div>
    </section>
  );
};
