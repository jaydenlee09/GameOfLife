import { useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import './FloatingAIBar.css';

const CHECKIN_LABELS = {
  morning: 'Your morning briefing is ready',
  evening: 'Your evening debrief is ready',
  weekly: 'Your weekly plan is ready',
};

// The global entry point for talking to the assistant from any screen — submitting
// here opens the Assistant drawer and sends this as the first message. The sparkle
// button opens the drawer directly with no message sent (double-click does too on
// desktop, but a phone double-tap just focuses the input). Above the bar it surfaces
// what the assistant started on its own: an unread check-in, or one rule-based nudge.
export default function FloatingAIBar({ onSubmit, onExpand, unreadCheckin, nudge, onNudgeAction, onNudgeDismiss }) {
  const [value, setValue] = useState('');

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setValue('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="ai-bar-wrap">
      {unreadCheckin ? (
        <button className="ai-bar-checkin" onClick={onExpand}>
          <span className="ai-bar-checkin-dot" />
          <Sparkles size={13} />
          {CHECKIN_LABELS[unreadCheckin.kind] || 'New message from your assistant'}
        </button>
      ) : nudge && (
        <div className="ai-bar-nudge" role="status">
          <span className="ai-bar-nudge-text">{nudge.text}</span>
          <button className="ai-bar-nudge-cta" onClick={() => onNudgeAction(nudge)}>{nudge.cta.label}</button>
          <button className="ai-bar-nudge-close" onClick={() => onNudgeDismiss(nudge.id)} aria-label="Dismiss for today">
            <X size={13} />
          </button>
        </div>
      )}
      <div className="ai-bar" onDoubleClick={onExpand}>
        <button className="ai-bar-open" onClick={onExpand} aria-label="Open My Assistant" title="Open My Assistant">
          <Sparkles size={16} />
        </button>
        <input
          className="ai-bar-input"
          type="text"
          placeholder="Ask anything, or tell it what to do..."
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onDoubleClick={onExpand}
        />
        <button className="ai-bar-send" onClick={submit} disabled={!value.trim()} aria-label="Send">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <path d="M8 13V3M8 3L3.5 7.5M8 3L12.5 7.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
