import React, { useState, useEffect, useRef } from 'react';
import { buildSystemPrompt, sendToMentor } from '../utils/mentorUtils';
import './MentorPage.css';

const MentorPage = ({
  user,
  todos,
  habits,
  logs,
  challenges,
  chatHistory,
  setChatHistory,
}) => {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  // Auto-scroll to bottom whenever messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, isLoading]);

  const systemPrompt = buildSystemPrompt(user, todos, habits, logs, challenges);

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const userMsg = { role: 'user', parts: [{ text: trimmed }] };
    const updatedHistory = [...chatHistory, userMsg];
    setChatHistory(updatedHistory);
    setInput('');
    setError(null);
    setIsLoading(true);

    // Reset textarea height
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    try {
      // Pass history WITHOUT the new user message (sendToMentor appends it)
      const responseText = await sendToMentor(chatHistory, trimmed, systemPrompt);
      const modelMsg = { role: 'model', parts: [{ text: responseText }] };
      setChatHistory(prev => [...prev, modelMsg]);
    } catch (err) {
      setError(err.message);
      // Remove the user message we added optimistically if the request failed
      setChatHistory(chatHistory);
    } finally {
      setIsLoading(false);
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
    // Auto-grow textarea
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
  };

  const clearChat = () => {
    if (window.confirm('Clear all chat history with your mentor?')) {
      setChatHistory([]);
    }
  };

  const renderText = (text) => {
    // Basic markdown-lite: bold (**text**), line breaks
    return text
      .split('\n')
      .map((line, i) => {
        const parts = line.split(/\*\*(.*?)\*\*/g);
        return (
          <span key={i}>
            {parts.map((part, j) =>
              j % 2 === 1 ? <strong key={j}>{part}</strong> : part
            )}
            {i < text.split('\n').length - 1 && <br />}
          </span>
        );
      });
  };

  return (
    <div className="mentor-page">
      {/* Header */}
      <div className="mentor-header">
        <div className="mentor-header-left">
          <div className="mentor-avatar">🧠</div>
          <div>
            <h2 className="mentor-title">Mentor</h2>
            <span className="mentor-subtitle">Your personal life coach · Gemini 2.5 Flash</span>
          </div>
        </div>
        {chatHistory.length > 0 && (
          <button className="mentor-clear-btn" onClick={clearChat}>
            Clear Chat
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="mentor-messages">
        {chatHistory.length === 0 && !isLoading && (
          <div className="mentor-empty">
            <div className="mentor-empty-icon">💬</div>
            <p>Ask your mentor anything, or say <strong>"how am I doing?"</strong> for a status report based on your current stats, tasks, and journal.</p>
          </div>
        )}

        {chatHistory.map((msg, idx) => {
          const isUser = msg.role === 'user';
          const text = msg.parts?.[0]?.text || '';
          return (
            <div key={idx} className={`mentor-message ${isUser ? 'mentor-message--user' : 'mentor-message--model'}`}>
              {!isUser && <div className="mentor-message-avatar">🧠</div>}
              <div className="mentor-message-bubble">
                {renderText(text)}
              </div>
              {isUser && <div className="mentor-message-avatar mentor-message-avatar--user">👤</div>}
            </div>
          );
        })}

        {isLoading && (
          <div className="mentor-message mentor-message--model">
            <div className="mentor-message-avatar">🧠</div>
            <div className="mentor-message-bubble mentor-loading">
              <span className="mentor-dot" />
              <span className="mentor-dot" />
              <span className="mentor-dot" />
            </div>
          </div>
        )}

        {error && (
          <div className="mentor-error">
            ⚠️ {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="mentor-input-area">
        <textarea
          ref={textareaRef}
          className="mentor-input"
          placeholder="Talk to your mentor… (Enter to send, Shift+Enter for new line)"
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={isLoading}
        />
        <button
          className="mentor-send-btn"
          onClick={sendMessage}
          disabled={!input.trim() || isLoading}
        >
          {isLoading ? '…' : '↑'}
        </button>
      </div>
    </div>
  );
};

export default MentorPage;
