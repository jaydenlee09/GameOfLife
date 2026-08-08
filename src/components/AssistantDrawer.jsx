import { useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, X, AlertTriangle, Loader2, Send } from 'lucide-react';
import { buildSystemPrompt, sendToAssistant } from '../utils/assistantUtils';
import { prepareAssistantActions } from '../utils/assistantActions';
import './AssistantDrawer.css';

const makeMessageId = () => `msg_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;

const SUGGESTED_PROMPTS = [
  'How am I doing overall?',
  'What should I focus on today?',
  "What's my weakest stat right now?",
  'Give me a recap of my week',
];

const prettyActionType = (type) => {
  if (type === 'create_task') return 'Create Task';
  if (type === 'create_calendar_event') return 'Add Time Block';
  if (type === 'create_quick_event_template') return 'Create Time Block Template';
  return type;
};

const WEEKDAY_ABBR = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const recurrenceLabel = (payload) => {
  if (payload.recurrence === 'weekly' && payload.recurrenceDays?.length) {
    return payload.recurrenceDays.map((d) => WEEKDAY_ABBR[d]).join(' ');
  }
  return payload.recurrence;
};

const actionPreview = (action) => {
  if (action.type === 'create_task') {
    return `${action.payload.text} · ${action.payload.timeFrame} · ${action.payload.xp} XP`;
  }
  if (action.type === 'create_calendar_event') {
    const start = `${String(action.payload.startHour).padStart(2, '0')}:${String(action.payload.startMin).padStart(2, '0')}`;
    const end = `${String(action.payload.endHour).padStart(2, '0')}:${String(action.payload.endMin).padStart(2, '0')}`;
    const recurrence = action.payload.recurrence !== 'none' ? ` · ${recurrenceLabel(action.payload)}` : '';
    return `${action.payload.title} · ${action.payload.date} · ${start}-${end}${recurrence}`;
  }
  if (action.type === 'create_quick_event_template') {
    return `${action.payload.title} · ${action.payload.duration} mins · ${recurrenceLabel(action.payload)}`;
  }
  return 'Pending action';
};

export default function AssistantDrawer({
  isOpen,
  onClose,
  user,
  todos,
  habits,
  logs,
  healthLog,
  foodPoints,
  pomodoroSessions,
  goals,
  weeklyReviews,
  xpLog,
  commitmentArchive,
  calendarEvents,
  noPhoneBlocks,
  calendarDayEvents,
  achievements,
  shop,
  brainDumpNotes,
  chatHistory,
  setChatHistory,
  onApplyAction,
  draftMessage,
  onDraftConsumed,
}) {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [processingActionId, setProcessingActionId] = useState(null);

  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, isLoading, isOpen]);

  useEffect(() => {
    if (!draftMessage?.trim()) return;
    sendMessage(draftMessage);
    onDraftConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftMessage]);

  const systemPrompt = useMemo(
    () => buildSystemPrompt(user, todos, habits, logs, {
      healthLog, foodPoints, pomodoroSessions, goals, weeklyReviews, xpLog, commitmentArchive,
      calendarEvents, noPhoneBlocks, calendarDayEvents, achievements, shop, brainDumpNotes,
    }),
    [
      user, todos, habits, logs, healthLog, foodPoints, pomodoroSessions, goals, weeklyReviews, xpLog, commitmentArchive,
      calendarEvents, noPhoneBlocks, calendarDayEvents, achievements, shop, brainDumpNotes,
    ],
  );

  const renderText = (text) => {
    return text.split('\n').map((line, index) => {
      const parts = line.split(/\*\*(.*?)\*\*/g);
      return (
        <span key={index}>
          {parts.map((part, partIndex) => (
            partIndex % 2 === 1 ? <strong key={partIndex}>{part}</strong> : part
          ))}
          {index < text.split('\n').length - 1 && <br />}
        </span>
      );
    });
  };

  const updateMessageAction = (messageId, actionId, updater) => {
    setChatHistory((prev) => prev.map((msg) => {
      if (msg.id !== messageId) return msg;
      const proposedActions = Array.isArray(msg.proposedActions) ? msg.proposedActions : [];
      return {
        ...msg,
        proposedActions: proposedActions.map((action) => (
          action.id === actionId ? updater(action) : action
        )),
      };
    }));
  };

  const handleApproveAction = (messageId, action) => {
    if (processingActionId || action.status !== 'pending') return;
    setProcessingActionId(action.id);
    const result = onApplyAction(action);

    updateMessageAction(messageId, action.id, (currentAction) => ({
      ...currentAction,
      status: result.ok ? 'applied' : 'failed',
      resultMessage: result.message,
    }));

    setProcessingActionId(null);
  };

  const handleRejectAction = (messageId, actionId) => {
    updateMessageAction(messageId, actionId, (currentAction) => ({
      ...currentAction,
      status: 'rejected',
      resultMessage: 'Action rejected by user.',
    }));
  };

  const sendMessage = async (textOverride) => {
    const trimmed = (textOverride ?? input).trim();
    if (!trimmed || isLoading) return;

    const userMsg = { id: makeMessageId(), role: 'user', parts: [{ text: trimmed }] };
    setChatHistory((prev) => [...prev, userMsg]);
    setInput('');
    setError(null);
    setIsLoading(true);

    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    try {
      const response = await sendToAssistant(chatHistory, trimmed, systemPrompt);
      const validStatKeys = Object.keys(user?.stats || {});
      const { actions, errors } = prepareAssistantActions(response.actions, validStatKeys);
      const modelMsg = {
        id: makeMessageId(),
        role: 'model',
        parts: [{ text: response.text }],
        proposedActions: actions,
        actionErrors: errors,
      };
      setChatHistory((prev) => [...prev, modelMsg]);
    } catch (err) {
      setError(err.message);
      setChatHistory((prev) => prev.filter((msg) => msg.id !== userMsg.id));
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = () => {
    if (window.confirm('Clear all chat history with your assistant?')) {
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

  return (
    <>
      {isOpen && <div className="assistant-drawer-backdrop" onClick={onClose} />}

      <aside className={`assistant-drawer ${isOpen ? 'assistant-drawer--open' : ''}`}>
        <div className="assistant-drawer-header">
          <div className="assistant-drawer-heading">
            <span className="assistant-drawer-icon"><Sparkles size={20} /></span>
            <div>
              <h2>My Assistant</h2>
              <p>Ask anything, or let it take actions for you</p>
            </div>
          </div>
          <div className="assistant-drawer-header-actions">
            {chatHistory.length > 0 && (
              <button className="assistant-drawer-clear" onClick={clearChat}>Clear</button>
            )}
            <button className="assistant-drawer-close" onClick={onClose}><X size={16} /></button>
          </div>
        </div>

        <div className="assistant-drawer-messages">
          {chatHistory.length === 0 && !isLoading && (
            <div className="assistant-empty-state">
              <div className="assistant-empty-icon"><Sparkles size={26} /></div>
              <p className="assistant-empty-title">Ask your assistant anything</p>
              <p className="assistant-empty-hint">Try one of these, or type your own question below.</p>
              <div className="assistant-suggestions">
                {SUGGESTED_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    className="assistant-suggestion-chip"
                    onClick={() => sendMessage(prompt)}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {chatHistory.map((msg, index) => {
            const isUser = msg.role === 'user';
            const text = msg.parts?.[0]?.text || '';
            const messageId = msg.id || `legacy_${index}`;
            return (
              <div key={messageId} className={`assistant-chat-message ${isUser ? 'assistant-chat-message--user' : 'assistant-chat-message--model'}`}>
                <div className="assistant-chat-bubble">{renderText(text)}</div>

                {!isUser && Array.isArray(msg.actionErrors) && msg.actionErrors.length > 0 && (
                  <div className="assistant-action-errors">
                    {msg.actionErrors.map((errorText, errorIndex) => (
                      <p key={`${messageId}_error_${errorIndex}`}><AlertTriangle size={14} /> {errorText}</p>
                    ))}
                  </div>
                )}

                {!isUser && Array.isArray(msg.proposedActions) && msg.proposedActions.length > 0 && (
                  <div className="assistant-action-list">
                    <p className="assistant-action-list-title">Proposed actions (confirm required):</p>
                    {msg.proposedActions.map((action) => (
                      <div key={action.id} className="assistant-action-card">
                        <div className="assistant-action-card-head">
                          <span>{prettyActionType(action.type)}</span>
                          <span className={`assistant-action-status assistant-action-status--${action.status}`}>
                            {action.status}
                          </span>
                        </div>
                        <p className="assistant-action-preview">{actionPreview(action)}</p>

                        {action.resultMessage && (
                          <p className="assistant-action-result">{action.resultMessage}</p>
                        )}

                        {action.status === 'pending' && (
                          <div className="assistant-action-controls">
                            <button
                              className="assistant-action-btn assistant-action-btn--approve"
                              onClick={() => handleApproveAction(messageId, action)}
                              disabled={processingActionId === action.id}
                            >
                              Approve
                            </button>
                            <button
                              className="assistant-action-btn assistant-action-btn--reject"
                              onClick={() => handleRejectAction(messageId, action.id)}
                              disabled={processingActionId === action.id}
                            >
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

          <div ref={bottomRef} />
        </div>

        <div className="assistant-drawer-input-row">
          <div className="assistant-drawer-input-shell">
            <textarea
              ref={textareaRef}
              className="assistant-drawer-input"
              placeholder="Ask your assistant..."
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              rows={1}
              disabled={isLoading}
            />
            <button
              className="assistant-drawer-send"
              onClick={sendMessage}
              disabled={!input.trim() || isLoading}
            >
              {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
