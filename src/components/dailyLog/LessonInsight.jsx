import React, { useState } from 'react';
import { Sparkles, LoaderCircle, AlertTriangle, RefreshCw, ArrowRight, MessageCircle, Search, ChevronUp } from 'lucide-react';
import { isInsightStale, searchUrl } from '../../utils/lessonInsight';

/**
 * "Learn more" for one day's lesson: a button until asked, then the saved
 * explainer / try-it / go-deeper card. `onExpand(dateKey)` runs the AI and
 * resolves { ok, insight | error }; `onSave(dateKey, insight)` stores it on that
 * day's entry. `compact` is the narrow Lessons-tab variant (collapsible).
 */
const LessonInsight = ({ dateKey, entry, onExpand, onSave, onAskAssistant, compact = false }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(!compact);

  const lesson = entry?.learned?.trim();
  const insight = entry?.lessonInsight || null;
  if (!lesson || !onExpand) return null;

  const stale = isInsightStale(entry);

  const run = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    const result = await onExpand(dateKey);
    setLoading(false);
    if (result?.ok) {
      onSave(dateKey, result.insight);
      setOpen(true);
    } else {
      setError(result?.error || 'Couldn’t look into it. Try again.');
    }
  };

  const status = error && (
    <p className="li-error" role="alert"><AlertTriangle size={13} /> {error}</p>
  );

  if (!insight || (compact && !open)) {
    return (
      <div className={`li${compact ? ' li--compact' : ''}`}>
        <button
          type="button"
          className="li-btn"
          onClick={insight ? () => setOpen(true) : run}
          disabled={loading}
          aria-busy={loading}
        >
          {loading
            ? <><LoaderCircle size={14} className="log-review-spin" /> Looking into it…</>
            : <><Sparkles size={14} /> {insight ? 'Show what you found' : 'Learn more about this'}</>}
        </button>
        {status}
      </div>
    );
  }

  return (
    <div className={`li li-card${compact ? ' li--compact' : ''}`} aria-busy={loading}>
      <div className="li-head">
        <span className="li-kicker"><Sparkles size={13} /> A little more</span>
        {compact && (
          <button type="button" className="li-icon-btn" onClick={() => setOpen(false)} aria-label="Hide">
            <ChevronUp size={14} />
          </button>
        )}
      </div>

      <p className="li-text">{insight.explainer}</p>

      <div className="li-try">
        <span className="li-label"><ArrowRight size={13} /> Try it tomorrow</span>
        <p className="li-text">{insight.tryIt}</p>
      </div>

      {(insight.deeperQuestion || insight.searchFor) && (
        <div className="li-deeper">
          <span className="li-label">Go deeper</span>
          <div className="li-deeper-actions">
            {insight.deeperQuestion && onAskAssistant && (
              <button
                type="button"
                className="li-chip"
                onClick={() => onAskAssistant(`About something I learned ("${lesson}"): ${insight.deeperQuestion}`)}
              >
                <MessageCircle size={13} /> {insight.deeperQuestion}
              </button>
            )}
            {insight.searchFor && (
              <a className="li-chip" href={searchUrl(insight.searchFor)} target="_blank" rel="noopener noreferrer">
                <Search size={13} /> Read about “{insight.searchFor}”
              </a>
            )}
          </div>
        </div>
      )}

      {stale && (
        <div className="li-stale">
          <span>You edited this lesson since.</span>
          <button type="button" className="li-link" onClick={run} disabled={loading}>
            {loading ? <LoaderCircle size={13} className="log-review-spin" /> : <RefreshCw size={13} />} Refresh
          </button>
        </div>
      )}
      {status}
    </div>
  );
};

export default LessonInsight;
