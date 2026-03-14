import { useEffect, useMemo, useRef, useState } from 'react';
import { buildSystemPrompt, sendToMentor } from '../utils/mentorUtils';
import { prepareMentorActions } from '../utils/mentorActions';
import './MentorAssistant.css';

const makeMessageId = () => `msg_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;

const prettyActionType = (type) => {
  if (type === 'create_task') return 'Create Task';
  if (type === 'create_calendar_event') return 'Add Calendar Block';
  if (type === 'create_quick_event_template') return 'Create Quick Template';
  if (type === 'create_challenge') return 'Create Challenge';
  return type;
};

const actionPreview = (action) => {
  if (action.type === 'create_task') {
    return `${action.payload.text} · ${action.payload.timeFrame} · ${action.payload.xp} XP`;
  }
  if (action.type === 'create_calendar_event') {
    const start = `${String(action.payload.startHour).padStart(2, '0')}:${String(action.payload.startMin).padStart(2, '0')}`;
    const end = `${String(action.payload.endHour).padStart(2, '0')}:${String(action.payload.endMin).padStart(2, '0')}`;
    return `${action.payload.title} · ${action.payload.date} · ${start}-${end}`;
  }
  if (action.type === 'create_quick_event_template') {
    return `${action.payload.title} · ${action.payload.duration} mins · ${action.payload.recurrence}`;
  }
  if (action.type === 'create_challenge') {
    return `${action.payload.text} · ${action.payload.duration} · ${action.payload.xp} XP`;
  }
  return 'Pending action';
};

export default function MentorAssistant({
  isOpen,
  onToggle,
  onClose,
  user,
  todos,
  habits,
  logs,
  challenges,
  chatHistory,
  setChatHistory,
  onApplyAction,
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

  const systemPrompt = useMemo(
    () => buildSystemPrompt(user, todos, habits, logs, challenges),
    [user, todos, habits, logs, challenges],
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

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const userMsg = { id: makeMessageId(), role: 'user', parts: [{ text: trimmed }] };
    setChatHistory((prev) => [...prev, userMsg]);
    setInput('');
    setError(null);
    setIsLoading(true);

    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    try {
      const response = await sendToMentor(chatHistory, trimmed, systemPrompt);
      const validStatKeys = Object.keys(user?.stats || {});
      const { actions, errors } = prepareMentorActions(response.actions, validStatKeys);
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
    if (window.confirm('Clear all chat history with your mentor?')) {
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
      <button className="mentor-fab" onClick={onToggle} aria-label="Open mentor chat">
        🧠 Mentor
      </button>

      {isOpen && <div className="mentor-drawer-backdrop" onClick={onClose} />}

      <aside className={`mentor-drawer ${isOpen ? 'mentor-drawer--open' : ''}`}>
        <div className="mentor-drawer-header">
          <div className="mentor-drawer-heading">
            <span className="mentor-drawer-icon">🧠</span>
            <div>
              <h2>Mentor</h2>
              <p>Ask for guidance or request actions</p>
            </div>
          </div>
          <div className="mentor-drawer-header-actions">
            {chatHistory.length > 0 && (
              <button className="mentor-drawer-clear" onClick={clearChat}>Clear</button>
            )}
            <button className="mentor-drawer-close" onClick={onClose}>✕</button>
          </div>
        </div>

        <div className="mentor-drawer-messages">
          {chatHistory.length === 0 && !isLoading && (
            <div className="mentor-empty-state">
              <div className="mentor-empty-icon">💬</div>
              <p>
                Ask your mentor anything, or say <strong>"how am I doing?"</strong>.
              </p>
            </div>
          )}

          {chatHistory.map((msg, index) => {
            const isUser = msg.role === 'user';
            const text = msg.parts?.[0]?.text || '';
            const messageId = msg.id || `legacy_${index}`;
            return (
              <div key={messageId} className={`mentor-chat-message ${isUser ? 'mentor-chat-message--user' : 'mentor-chat-message--model'}`}>
                <div className="mentor-chat-bubble">{renderText(text)}</div>

                {!isUser && Array.isArray(msg.actionErrors) && msg.actionErrors.length > 0 && (
                  <div className="mentor-action-errors">
                    {msg.actionErrors.map((errorText, errorIndex) => (
                      <p key={`${messageId}_error_${errorIndex}`}>⚠️ {errorText}</p>
                    ))}
                  </div>
                )}

                {!isUser && Array.isArray(msg.proposedActions) && msg.proposedActions.length > 0 && (
                  <div className="mentor-action-list">
                    <p className="mentor-action-list-title">Proposed actions (confirm required):</p>
                    {msg.proposedActions.map((action) => (
                      <div key={action.id} className="mentor-action-card">
                        <div className="mentor-action-card-head">
                          <span>{prettyActionType(action.type)}</span>
                          <span className={`mentor-action-status mentor-action-status--${action.status}`}>
                            {action.status}
                          </span>
                        </div>
                        <p className="mentor-action-preview">{actionPreview(action)}</p>

                        {action.resultMessage && (
                          <p className="mentor-action-result">{action.resultMessage}</p>
                        )}

                        {action.status === 'pending' && (
                          <div className="mentor-action-controls">
                            <button
                              className="mentor-action-btn mentor-action-btn--approve"
                              onClick={() => handleApproveAction(messageId, action)}
                              disabled={processingActionId === action.id}
                            >
                              Approve
                            </button>
                            <button
                              className="mentor-action-btn mentor-action-btn--reject"
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
            <div className="mentor-chat-message mentor-chat-message--model">
              <div className="mentor-chat-bubble mentor-chat-bubble--loading">
                <span className="mentor-dot" />
                <span className="mentor-dot" />
                <span className="mentor-dot" />
              </div>
            </div>
          )}

          {error && (
            <div className="mentor-error-banner">⚠️ {error}</div>
          )}

          <div ref={bottomRef} />
        </div>

        <div className="mentor-drawer-input-row">
          <textarea
            ref={textareaRef}
            className="mentor-drawer-input"
            placeholder="Talk to your mentor..."
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={isLoading}
          />
          <button
            className="mentor-drawer-send"
            onClick={sendMessage}
            disabled={!input.trim() || isLoading}
          >
            {isLoading ? '…' : '↑'}
          </button>
        </div>
      </aside>
    </>
  );
}
