import { useEffect, useRef, useState } from 'react';
import { Sparkles, X, AlertTriangle, Loader2, Send, Check, Undo2, Trash2, Pencil } from 'lucide-react';
import { MEMORY_KINDS, MEMORY_LIMIT } from '../utils/assistantTools';
import NotificationSettings from './NotificationSettings';
import './AssistantDrawer.css';

const CHECKIN_LABELS = {
  morning: 'Morning briefing',
  evening: 'Evening debrief',
  weekly: 'Weekly plan',
  'log-review': 'Daily Log review',
};

const TABS = [
  { id: 'chat', label: 'Chat' },
  { id: 'memory', label: 'Memory' },
  { id: 'activity', label: 'Activity' },
  { id: 'alerts', label: 'Alerts' },
];

const makeMemoryId = () => `mem_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;

const timeAgo = (ts) => {
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
};

const renderText = (text) => {
  const lines = text.split('\n');
  return lines.map((line, index) => {
    const parts = line.split(/\*\*(.*?)\*\*/g);
    return (
      <span key={index}>
        {parts.map((part, partIndex) => (
          partIndex % 2 === 1 ? <strong key={partIndex}>{part}</strong> : part
        ))}
        {index < lines.length - 1 && <br />}
      </span>
    );
  });
};

export default function AssistantDrawer({
  isOpen,
  onClose,
  chatHistory,
  setChatHistory,
  assistant,
  activity,
  memory,
  setMemory,
  hasNorthStar,
  draftMessage,
  onDraftConsumed,
  uid,
}) {
  const { send, approve, reject, undo, isLoading, error } = assistant;
  const [tab, setTab] = useState('chat');
  const [input, setInput] = useState('');
  const [notice, setNotice] = useState(null);

  const bottomRef = useRef(null);
  const textareaRef = useRef(null);
  const visibleMessages = chatHistory.filter((msg) => !msg.hidden);

  useEffect(() => {
    if (!isOpen || tab !== 'chat') return;
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, isLoading, isOpen, tab]);

  useEffect(() => {
    if (!draftMessage?.trim()) return;
    setTab('chat');
    send(draftMessage);
    onDraftConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftMessage]);

  useEffect(() => {
    if (!notice) return undefined;
    const id = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(id);
  }, [notice]);

  const suggestions = [
    'Plan my day',
    'How am I doing overall?',
    "What's dragging my score down this week?",
    hasNorthStar ? 'Give me a recap of my week' : 'Help me define my North Star',
  ];

  const sendMessage = (textOverride) => {
    const trimmed = (textOverride ?? input).trim();
    if (!trimmed || isLoading) return;
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    send(trimmed);
  };

  const handleUndo = (activityId) => {
    const result = undo(activityId);
    setNotice({ ok: result.ok, text: result.message });
  };

  const clearChat = () => {
    if (window.confirm('Clear all chat history with your assistant? (Memory and the activity log are kept.)')) {
      setChatHistory([]);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleInput = (e) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
  };

  const activityById = Object.fromEntries((activity || []).map((entry) => [entry.id, entry]));

  const renderUndo = (activityId) => {
    const entry = activityById[activityId];
    if (!entry) return null;
    if (entry.undone) return <span className="assistant-undone-tag">Undone</span>;
    return (
      <button className="assistant-undo-btn" onClick={() => handleUndo(activityId)}>
        <Undo2 size={12} /> Undo
      </button>
    );
  };

  return (
    <>
      {isOpen && <div className="assistant-drawer-backdrop" onClick={onClose} />}

      <aside className={`assistant-drawer ${isOpen ? 'assistant-drawer--open' : ''}`}>
        <div className="assistant-drawer-header">
          <div className="assistant-drawer-heading">
            <span className="assistant-drawer-icon"><Sparkles size={20} /></span>
            <div>
              <h2>My Assistant</h2>
              <p>Your coach — it can plan, schedule and remember</p>
            </div>
          </div>
          <div className="assistant-drawer-header-actions">
            {tab === 'chat' && visibleMessages.length > 0 && (
              <button className="assistant-drawer-clear" onClick={clearChat}>Clear</button>
            )}
            <button className="assistant-drawer-close" onClick={onClose}><X size={16} /></button>
          </div>
        </div>

        <div className="assistant-tabs" role="tablist">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              className={`assistant-tab ${tab === id ? 'assistant-tab--active' : ''}`}
              onClick={() => setTab(id)}
            >
              {label}
              {id === 'memory' && memory.length > 0 && <span className="assistant-tab-count">{memory.length}</span>}
            </button>
          ))}
        </div>

        {tab === 'chat' && (
          <>
            <div className="assistant-drawer-messages">
              {visibleMessages.length === 0 && !isLoading && (
                <div className="assistant-empty-state">
                  <div className="assistant-empty-icon"><Sparkles size={26} /></div>
                  <p className="assistant-empty-title">What are we working on?</p>
                  <p className="assistant-empty-hint">Ask a question, or tell it to plan, schedule or capture something for you.</p>
                  <div className="assistant-suggestions">
                    {suggestions.map((prompt) => (
                      <button key={prompt} className="assistant-suggestion-chip" onClick={() => sendMessage(prompt)}>
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {visibleMessages.map((msg, index) => {
                const isUser = msg.role === 'user';
                const text = msg.parts?.[0]?.text || '';
                const messageId = msg.id || `legacy_${index}`;
                return (
                  <div key={messageId} className={`assistant-chat-message ${isUser ? 'assistant-chat-message--user' : 'assistant-chat-message--model'}`}>
                    {!isUser && CHECKIN_LABELS[msg.kind] && (
                      <span className="assistant-checkin-tag"><Sparkles size={11} /> {CHECKIN_LABELS[msg.kind]}</span>
                    )}
                    <div className="assistant-chat-bubble">{renderText(text)}</div>

                    {!isUser && Array.isArray(msg.actionErrors) && msg.actionErrors.length > 0 && (
                      <div className="assistant-action-errors">
                        {msg.actionErrors.map((errorText, errorIndex) => (
                          <p key={`${messageId}_error_${errorIndex}`}><AlertTriangle size={14} /> {errorText}</p>
                        ))}
                      </div>
                    )}

                    {!isUser && msg.actionsTaken?.length > 0 && (
                      <div className="assistant-taken-list">
                        {msg.actionsTaken.map((action) => (
                          <div key={action.activityId} className={`assistant-taken-row ${activityById[action.activityId]?.undone ? 'assistant-taken-row--undone' : ''}`}>
                            <Check size={13} className="assistant-taken-icon" />
                            <span className="assistant-taken-label">{action.label}</span>
                            {renderUndo(action.activityId)}
                          </div>
                        ))}
                      </div>
                    )}

                    {!isUser && msg.proposedActions?.length > 0 && (
                      <div className="assistant-action-list">
                        <p className="assistant-action-list-title">Needs your OK:</p>
                        {msg.proposedActions.map((action) => (
                          <div key={action.id} className="assistant-action-card">
                            <div className="assistant-action-card-head">
                              <span className="assistant-action-preview">{action.label}</span>
                              <span className={`assistant-action-status assistant-action-status--${action.status}`}>
                                {action.status}
                              </span>
                            </div>
                            {action.resultMessage && <p className="assistant-action-result">{action.resultMessage}</p>}
                            {action.status === 'applied' && action.activityId && (
                              <div className="assistant-action-controls">{renderUndo(action.activityId)}</div>
                            )}
                            {action.status === 'pending' && (
                              <div className="assistant-action-controls">
                                <button className="assistant-action-btn assistant-action-btn--approve" onClick={() => approve(messageId, action.id)}>
                                  Approve
                                </button>
                                <button className="assistant-action-btn assistant-action-btn--reject" onClick={() => reject(messageId, action.id)}>
                                  Reject
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {isLoading && (
                <div className="assistant-chat-message assistant-chat-message--model">
                  <div className="assistant-chat-bubble assistant-chat-bubble--loading">
                    <span className="assistant-dot" />
                    <span className="assistant-dot" />
                    <span className="assistant-dot" />
                  </div>
                </div>
              )}

              {error && (
                <div className="assistant-error-banner"><AlertTriangle size={14} /> {error}</div>
              )}
              {notice && (
                <div className={`assistant-notice ${notice.ok ? '' : 'assistant-notice--warn'}`}>{notice.text}</div>
              )}

              <div ref={bottomRef} />
            </div>

            <div className="assistant-drawer-input-row">
              <div className="assistant-drawer-input-shell">
                <textarea
                  ref={textareaRef}
                  className="assistant-drawer-input"
                  placeholder="Ask, or tell it what to do..."
                  value={input}
                  onChange={handleInput}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  disabled={isLoading}
                />
                <button
                  className="assistant-drawer-send"
                  onClick={() => sendMessage()}
                  disabled={!input.trim() || isLoading}
                >
                  {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                </button>
              </div>
            </div>
          </>
        )}

        {tab === 'memory' && <MemoryPanel memory={memory} setMemory={setMemory} />}

        {tab === 'alerts' && <NotificationSettings uid={uid} />}

        {tab === 'activity' && (
          <div className="assistant-drawer-messages">
            <p className="assistant-panel-intro">Everything the assistant changed in the app. Undo anything that wasn't what you wanted.</p>
            {notice && (
              <div className={`assistant-notice ${notice.ok ? '' : 'assistant-notice--warn'}`}>{notice.text}</div>
            )}
            {!activity?.length && <p className="assistant-panel-empty">No actions yet.</p>}
            {(activity || []).map((entry) => (
              <div key={entry.id} className={`assistant-activity-row ${entry.undone ? 'assistant-taken-row--undone' : ''}`}>
                <div className="assistant-activity-main">
                  <span className="assistant-taken-label">{entry.label}</span>
                  <span className="assistant-activity-meta">{timeAgo(entry.at)}</span>
                </div>
                {renderUndo(entry.id)}
              </div>
            ))}
          </div>
        )}
      </aside>
    </>
  );
}

function MemoryPanel({ memory, setMemory }) {
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [newText, setNewText] = useState('');
  const [newKind, setNewKind] = useState('fact');
  const full = memory.length >= MEMORY_LIMIT;

  const startEdit = (entry) => {
    setEditingId(entry.id);
    setEditText(entry.text);
  };

  const saveEdit = () => {
    const text = editText.trim();
    if (text) setMemory((prev) => prev.map((m) => (m.id === editingId ? { ...m, text } : m)));
    setEditingId(null);
  };

  const remove = (id) => setMemory((prev) => prev.filter((m) => m.id !== id));

  const add = (e) => {
    e.preventDefault();
    const text = newText.trim();
    if (!text || full) return;
    setMemory((prev) => [...prev, { id: makeMemoryId(), text, kind: newKind, createdAt: Date.now() }]);
    setNewText('');
  };

  return (
    <div className="assistant-drawer-messages">
      <p className="assistant-panel-intro">
        What your assistant has learned about you. It reads this every time, so fix anything that's wrong. ({memory.length}/{MEMORY_LIMIT})
      </p>
      {!memory.length && <p className="assistant-panel-empty">Nothing yet. It saves patterns and preferences as it gets to know you, or add your own below.</p>}
      {memory.map((entry) => (
        <div key={entry.id} className="assistant-memory-row">
          <span className={`assistant-memory-kind assistant-memory-kind--${entry.kind}`}>{entry.kind}</span>
          {editingId === entry.id ? (
            <div className="assistant-memory-edit">
              <textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={2} autoFocus />
              <div className="assistant-action-controls">
                <button className="assistant-action-btn assistant-action-btn--approve" onClick={saveEdit}>Save</button>
                <button className="assistant-action-btn assistant-action-btn--reject" onClick={() => setEditingId(null)}>Cancel</button>
              </div>
            </div>
          ) : (
            <>
              <span className="assistant-memory-text">{entry.text}</span>
              <div className="assistant-memory-actions">
                <button className="assistant-icon-btn" onClick={() => startEdit(entry)} aria-label="Edit memory"><Pencil size={13} /></button>
                <button className="assistant-icon-btn" onClick={() => remove(entry.id)} aria-label="Delete memory"><Trash2 size={13} /></button>
              </div>
            </>
          )}
        </div>
      ))}
      <form className="assistant-memory-add" onSubmit={add}>
        <select value={newKind} onChange={(e) => setNewKind(e.target.value)} aria-label="Memory type">
          {MEMORY_KINDS.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
        </select>
        <input
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          placeholder={full ? 'Memory is full — delete something first' : 'Tell it something about you…'}
          disabled={full}
        />
        <button type="submit" className="assistant-action-btn assistant-action-btn--approve" disabled={!newText.trim() || full}>Add</button>
      </form>
    </div>
  );
}
