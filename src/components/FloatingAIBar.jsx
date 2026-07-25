import { useState } from 'react';
import './FloatingAIBar.css';

// The global entry point for talking to the assistant from any screen — submitting
// here opens the Assistant drawer and sends this as the first message. Double-clicking
// the bar opens the drawer directly, with no message sent.
export default function FloatingAIBar({ onSubmit, onExpand }) {
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
      <div className="ai-bar" onDoubleClick={onExpand}>
        <input
          className="ai-bar-input"
          type="text"
          placeholder="Ask anything..."
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
