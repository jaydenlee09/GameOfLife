import React, { useState } from 'react';
import { Sparkles, LoaderCircle, AlertTriangle, RefreshCw, ArrowRight, MessageCircle, Target, Check, Lock } from 'lucide-react';
import { isCoachStale, coachStepText, improveText } from '../../utils/improveCoach';

/**
 * "Help me improve" for one day's improve notes: a button until asked, then the
 * saved card (what's behind it, tips, one if-then step for tomorrow).
 * `onCoach(dateKey)` runs the AI and resolves { ok, coach | error };
 * `onSave(dateKey, coach)` stores it on that day's entry; `onCommit(text)` puts
 * the step into tomorrow's commitment. Without `onCoach` it's read-only: just
 * the saved card, if there is one (past entries).
 */
const ImproveCoach = ({ dateKey, entry, onCoach, onSave, onAskAssistant, onCommit, commitmentLocked = false }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const coach = entry?.improveCoach || null;
  const hasNotes = !!improveText(entry);
  if (!coach && (!onCoach || !hasNotes)) return null;

  const stale = isCoachStale(entry);
  const step = coachStepText(coach);
  const isTomorrows = !!step && entry?.commitment?.trim() === step;

  const run = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    const result = await onCoach(dateKey);
    setLoading(false);
    if (result?.ok) onSave(dateKey, result.coach);
    else setError(result?.error || 'Couldn’t put a plan together. Try again.');
  };

  const status = error && (
    <p className="li-error" role="alert"><AlertTriangle size={13} /> {error}</p>
  );

  if (!coach) {
    return (
      <div className="li">
        <button type="button" className="li-btn" onClick={run} disabled={loading} aria-busy={loading}>
          {loading
            ? <><LoaderCircle size={14} className="log-review-spin" /> Thinking it through…</>
            : <><Sparkles size={14} /> Help me improve this</>}
        </button>
        {status}
      </div>
    );
  }

  return (
    <div className="li li-card ic" aria-busy={loading}>
      <span className="li-kicker"><Sparkles size={13} /> Coaching{coach.focus ? ` · ${coach.focus}` : ''}</span>

      <p className="li-text">{coach.why}</p>

      {coach.tips?.length > 0 && (
        <ul className="ic-tips">
          {coach.tips.map((t) => <li key={t}><ArrowRight size={13} /> {t}</li>)}
        </ul>
      )}

      {step && (
        <div className="ic-step">
          <span className="li-label"><Target size={13} /> Your step for tomorrow</span>
          <p className="ic-step-text">{step}</p>
          {onCommit && (
            isTomorrows ? (
              <span className="cd-status cd-status--success">
                {commitmentLocked ? <><Lock size={14} /> Locked in for tomorrow</> : <><Check size={14} /> Set as tomorrow’s commitment</>}
              </span>
            ) : commitmentLocked ? (
              <span className="cd-status cd-status--muted"><Lock size={14} /> Tomorrow’s commitment is already locked</span>
            ) : (
              <button type="button" className="cd-btn cd-btn--primary cd-btn--small ic-commit" onClick={() => onCommit(step)}>
                <Target size={14} /> Commit to this tomorrow
              </button>
            )
          )}
        </div>
      )}

      {onAskAssistant && (
        <button
          type="button"
          className="li-chip"
          onClick={() => onAskAssistant(`Help me improve "${coach.focus || improveText(entry)}". Tonight you suggested this step for tomorrow: "${step}". What else would help, and how do I make sure I actually follow through?`)}
        >
          <MessageCircle size={13} /> Talk it through with My Assistant
        </button>
      )}

      {stale && onCoach && (
        <div className="li-stale">
          <span>You edited what to improve since.</span>
          <button type="button" className="li-link" onClick={run} disabled={loading || !hasNotes}>
            {loading ? <LoaderCircle size={13} className="log-review-spin" /> : <RefreshCw size={13} />} Refresh
          </button>
        </div>
      )}
      {status}
    </div>
  );
};

export default ImproveCoach;
