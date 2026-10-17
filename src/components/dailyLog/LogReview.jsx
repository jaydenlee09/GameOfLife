import React, { useState } from 'react';
import {
  Trophy, MessageCircle, ArrowRight, TrendingUp, Target, AlertTriangle, Sparkles, Send, RefreshCw, Compass, LoaderCircle,
} from 'lucide-react';
import { entryHasContent, entryFingerprint } from '../../utils/logReview';
import { scoreColor } from '../../utils/scoreUtils';

// ─── Assistant review (submit + report card) ──────────────────────────────────

const ReviewList = (props) => {
  const { title, items, tone } = props;
  const Icon = props.Icon;
  if (!items?.length) return null;
  return (
    <div className={`log-review-block log-review-block--${tone}`}>
      <h4 className="log-review-block-title"><Icon size={14} /> {title}</h4>
      <ul className="log-review-list">
        {items.map((item, i) => <li key={i}>{item}</li>)}
      </ul>
    </div>
  );
};

const ReviewNote = (props) => {
  const { title, text, tone } = props;
  const Icon = props.Icon;
  if (!text) return null;
  return (
    <div className={`log-review-block log-review-block--${tone}`}>
      <h4 className="log-review-block-title"><Icon size={14} /> {title}</h4>
      <p className="log-review-text">{text}</p>
    </div>
  );
};

const formatReviewedAt = (ms) => new Date(ms).toLocaleString('en-US', {
  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
});

// Keyed by date by the parent, so the inline error resets when switching entries.
export const LogReviewSection = ({ dateKey, entry, isToday, review, reviewingDate, onSubmit, onOpenAssistant, initialError = null }) => {
  const [error, setError] = useState(initialError);
  const isReviewing = reviewingDate === dateKey;
  const busyElsewhere = !!reviewingDate && !isReviewing;
  const canSubmit = entryHasContent(entry) && !reviewingDate;
  const isStale = !!review && review.entryFingerprint !== entryFingerprint(entry);

  const submit = async () => {
    if (!canSubmit || !onSubmit) return;
    setError(null);
    const result = await onSubmit(dateKey);
    if (!result?.ok) setError(result?.error || 'The review failed. Try again.');
  };

  const status = (
    <>
      {error && <p className="log-review-error" role="alert"><AlertTriangle size={14} /> {error}</p>}
      {busyElsewhere && <p className="log-review-hint">Another day's review is still running…</p>}
    </>
  );

  if (!review) {
    return (
      <div className="log-section log-review-section">
        <h3 className="log-section-title"><Sparkles size={18} /> {isToday ? "Submit today's log" : 'Submit this log'}</h3>
        <p className="log-section-subtitle">
          Your assistant reads this entry alongside your Daily Score, habits, health and the last 7 days, then writes you a report.
        </p>
        <button className="log-review-submit" onClick={submit} disabled={!canSubmit} aria-busy={isReviewing}>
          {isReviewing
            ? <><LoaderCircle size={16} className="log-review-spin" /> Reviewing your day…</>
            : <><Send size={16} /> Submit &amp; get review</>}
        </button>
        {!entryHasContent(entry) && <p className="log-review-hint">Write something first, even one line.</p>}
        {status}
      </div>
    );
  }

  return (
    <div className="log-section log-review-section log-review-card" aria-busy={isReviewing}>
      <div className="log-review-header">
        <h3 className="log-section-title"><Sparkles size={18} /> Your assistant's review</h3>
        <span className="log-review-score" style={{ '--score-color': scoreColor(review.score) }} title="Daily Score when reviewed">
          {review.score}<small>/10</small>
        </span>
      </div>
      <p className="log-review-meta">Reviewed {formatReviewedAt(review.generatedAt)}</p>

      <p className="log-review-headline">{review.headline}</p>

      <div className="log-review-grid">
        <ReviewList Icon={Trophy} title="Wins" items={review.wins} tone="success" />
        <ReviewList Icon={TrendingUp} title="Patterns" items={review.patterns} tone="accent" />
        <ReviewList Icon={AlertTriangle} title="Watch out" items={review.watchOuts} tone="warning" />
        <ReviewNote Icon={Target} title="Your commitment" text={review.commitmentFeedback} tone="accent" />
        <ReviewNote Icon={Compass} title="North Star" text={review.northStarNote} tone="accent" />
      </div>

      <div className="log-review-focus">
        <span className="log-review-focus-label"><ArrowRight size={14} /> Tomorrow's focus</span>
        <p className="log-review-text">{review.tomorrowFocus}</p>
      </div>

      {isStale && <p className="log-review-hint">You've edited this entry since the review. Review again to include the changes.</p>}

      <div className="log-review-actions">
        <button className="log-review-btn" onClick={onOpenAssistant}>
          <MessageCircle size={15} /> Ask a follow-up
        </button>
        <button className="log-review-btn log-review-btn--primary" onClick={submit} disabled={!canSubmit}>
          {isReviewing
            ? <><LoaderCircle size={15} className="log-review-spin" /> Reviewing…</>
            : <><RefreshCw size={15} /> Review again</>}
        </button>
      </div>
      {status}
    </div>
  );
};

export default LogReviewSection;
