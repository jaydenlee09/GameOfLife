import React, { useState, useEffect } from 'react';
import './ChallengesPage.css';
import STAT_META from './statMeta';

// Duration labels & XP defaults
const DURATION_LABELS = {
  daily:   'Daily Challenges',
  weekly:  'Weekly Challenges',
  monthly: 'Monthly Challenges',
};

const DURATION_ORDER = ['monthly', 'weekly', 'daily'];

const XP_DEFAULTS = { daily: 30, weekly: 100, monthly: 500 };

// ── Duration remaining helpers ────────────────────────────────────────────────
const DURATION_MS = {
  daily:   24 * 60 * 60 * 1000,
  weekly:   7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

const formatTimeLeft = (ms, duration) => {
  if (ms <= 0) return "Time's up!";
  const totalSecs = Math.floor(ms / 1000);
  const days  = Math.floor(totalSecs / 86400);
  const hrs   = Math.floor((totalSecs % 86400) / 3600);
  const mins  = Math.floor((totalSecs % 3600) / 60);
  const secs  = totalSecs % 60;
  if (duration === 'monthly' || duration === 'weekly') {
    if (days > 0) return `${days}d ${hrs}h left`;
    return `${hrs}h left`;
  }
  if (hrs  > 0) return `${hrs}h ${mins}m left`;
  if (mins > 0) return `${mins}m ${secs}s left`;
  return `${secs}s left`;
};

// ── Add Challenge Modal ───────────────────────────────────────────────────────
const STAT_ATTRIBUTES = Object.keys(STAT_META);

const AddChallengeModal = ({ onClose, onAdd }) => {
  const [text, setText]         = useState('');
  const [duration, setDuration] = useState('daily');
  const [category, setCategory] = useState('discipline');
  const [xp, setXp]             = useState(30);

  // Auto-update default XP when duration changes unless user has manually edited
  const [xpTouched, setXpTouched] = useState(false);
  useEffect(() => {
    if (!xpTouched) setXp(XP_DEFAULTS[duration]);
  }, [duration, xpTouched]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    onAdd({
      id: `custom_${Date.now()}`,
      text: text.trim(),
      xp: Number(xp),
      category,
      duration,
      isCustom: true,
    });
    onClose();
  };

  return (
    <div className="cp-modal-overlay" onClick={onClose}>
      <div className="cp-modal" onClick={e => e.stopPropagation()}>
        <div className="cp-modal-header">
          <h2 className="cp-modal-title">NEW CHALLENGE</h2>
          <button className="cp-modal-close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="cp-modal-form">
          <div className="cp-field-group">
            <label className="cp-label">Challenge</label>
            <input
              className="cp-text-input"
              type="text"
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Describe your challenge..."
              autoFocus
            />
          </div>

          <div className="cp-field-group">
            <label className="cp-label">Duration</label>
            <div className="cp-pill-row">
              {Object.keys(DURATION_MS).map(d => (
                <button
                  key={d}
                  type="button"
                  className={`cp-pill ${duration === d ? 'cp-pill--active' : ''}`}
                  onClick={() => setDuration(d)}
                >
                  {d.charAt(0).toUpperCase() + d.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="cp-field-group">
            <label className="cp-label">Attribute</label>
            <div className="cp-category-grid">
              {STAT_ATTRIBUTES.map(attr => {
                const meta = STAT_META[attr];
                const { Icon } = meta;
                const active = category === attr;
                return (
                  <button
                    key={attr}
                    type="button"
                    className={`cp-cat-pill ${active ? 'cp-cat-pill--active' : ''}`}
                    style={active ? { background: `${meta.color}22`, borderColor: meta.color, color: meta.color } : {}}
                    onClick={() => setCategory(attr)}
                  >
                    {Icon && <Icon size={12} strokeWidth={2.5} />}
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="cp-field-group">
            <label className="cp-label">XP Reward</label>
            <input
              className="cp-text-input cp-xp-input"
              type="number"
              min="1"
              max="9999"
              value={xp}
              onChange={e => { setXpTouched(true); setXp(e.target.value); }}
            />
          </div>

          <button
            type="submit"
            className="cp-submit-btn"
            disabled={!text.trim()}
          >
            ADD CHALLENGE
          </button>
        </form>
      </div>
    </div>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────
const ChallengesPage = ({ challenges = [], onChallengeStart, onChallengeComplete, onChallengeAdd, onChallengeDelete }) => {
  const [now, setNow] = useState(Date.now());
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const getTimeLeft = (challenge) => {
    if (!challenge.started || !challenge.startedAt) return null;
    const deadline = challenge.startedAt + (DURATION_MS[challenge.duration] || DURATION_MS.daily);
    return deadline - now;
  };

  // Separate completed from active, then group active by duration
  const completedChallenges = challenges.filter(c => c.completed);
  const grouped = DURATION_ORDER.reduce((acc, dur) => {
    acc[dur] = challenges.filter(c => c.duration === dur && !c.completed);
    return acc;
  }, {});

  return (
    <div className="cp-page">
      {/* Page Header */}
      <div className="cp-page-header">
        <div>
          <h1 className="cp-page-title">CHALLENGES</h1>
          <p className="cp-page-subtitle">Start a challenge to track it in your active challenges dashboard.</p>
        </div>
        <button className="cp-add-btn" onClick={() => setShowAddModal(true)}>
          + ADD CHALLENGE
        </button>
      </div>

      {/* Challenge Sections */}
      <div className="cp-sections">
        {DURATION_ORDER.map(dur => {
          const group = grouped[dur];
          if (!group || group.length === 0) return null;

          return (
            <section key={dur} className="cp-section">
              <div className="cp-section-header">
                <h2 className="cp-section-title">{DURATION_LABELS[dur]}</h2>
                <span className="cp-section-count">{group.length}</span>
              </div>

              <div className="cp-cards-grid">
                {group.map(challenge => {
                  const meta = STAT_META[challenge.category] || { label: challenge.category, Icon: null, color: '#a3a3a3' };
                  const { Icon } = meta;
                  const timeLeftMs = getTimeLeft(challenge);
                  const isExpired = timeLeftMs !== null && timeLeftMs <= 0;

                  return (
                    <div
                      key={challenge.id}
                      className={`cp-card${challenge.completed ? ' cp-card--completed' : ''}${challenge.started && !challenge.completed ? ' cp-card--active' : ''}`}
                    >
                      {/* Top row: category badge + XP + delete */}
                      <div className="cp-card-top">
                        <span className="cp-card-category" style={{ color: meta.color, background: `${meta.color}18` }}>
                          {Icon && <Icon size={11} strokeWidth={2.5} />}
                          {meta.label.toUpperCase()}
                        </span>
                        <div className="cp-card-top-right">
                          <span className="cp-card-xp">+{challenge.xp} XP</span>
                          <button
                            className="cp-delete-btn"
                            onClick={() => onChallengeDelete && onChallengeDelete(challenge.id)}
                            title="Delete challenge"
                          >
                            ✕
                          </button>
                        </div>
                      </div>

                      {/* Challenge text */}
                      <p className="cp-card-text">{challenge.text}</p>

                      {/* Footer: action / status */}
                      <div className="cp-card-footer">
                        {challenge.completed ? (
                          <div className="cp-card-done">
                            <span className="cp-done-badge">✓</span>
                            <span className="cp-done-label">COMPLETED</span>
                          </div>
                        ) : challenge.started ? (
                          <div className="cp-card-active-row">
                            <div className="cp-active-indicator">
                              <span className="cp-active-dot" />
                              <span className="cp-time-left">
                                {timeLeftMs !== null ? formatTimeLeft(timeLeftMs, challenge.duration) : ''}
                              </span>
                            </div>
                            <button
                              className="cp-complete-btn"
                              onClick={() => onChallengeComplete && onChallengeComplete(challenge.id)}
                            >
                              COMPLETE
                            </button>
                          </div>
                        ) : (
                          <button
                            className="cp-start-btn"
                            onClick={() => onChallengeStart && onChallengeStart(challenge.id)}
                          >
                            START
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {/* Completed Challenges Section */}
      {completedChallenges.length > 0 && (
        <section className="cp-section">
          <button
            className="cp-completed-header"
            onClick={() => setShowCompleted(v => !v)}
          >
            <div className="cp-section-header" style={{ marginBottom: 0 }}>
              <h2 className="cp-section-title">Completed</h2>
              <span className="cp-section-count">{completedChallenges.length}</span>
            </div>
            <span className={`cp-chevron${showCompleted ? ' cp-chevron--open' : ''}`}>▾</span>
          </button>

          {showCompleted && (
            <div className="cp-cards-grid" style={{ marginTop: '1rem' }}>
              {completedChallenges.map(challenge => {
                const meta = STAT_META[challenge.category] || { label: challenge.category, Icon: null, color: '#a3a3a3' };
                const { Icon } = meta;
                return (
                  <div key={challenge.id} className="cp-card cp-card--completed">
                    <div className="cp-card-top">
                      <span className="cp-card-category" style={{ color: meta.color, background: `${meta.color}18` }}>
                        {Icon && <Icon size={11} strokeWidth={2.5} />}
                        {meta.label.toUpperCase()}
                      </span>
                      <div className="cp-card-top-right">
                        <span className="cp-card-xp">+{challenge.xp} XP</span>
                        <button
                          className="cp-delete-btn"
                          onClick={() => onChallengeDelete && onChallengeDelete(challenge.id)}
                          title="Delete challenge"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                    <p className="cp-card-text">{challenge.text}</p>
                    <div className="cp-card-footer">
                      <div className="cp-card-done">
                        <span className="cp-done-badge">✓</span>
                        <span className="cp-done-label">COMPLETED</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Add Challenge Modal */}
      {showAddModal && (
        <AddChallengeModal
          onClose={() => setShowAddModal(false)}
          onAdd={onChallengeAdd}
        />
      )}
    </div>
  );
};

export default ChallengesPage;
