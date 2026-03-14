import React, { useState, useEffect } from 'react';
import './PlayerDashboard.css';
import characterFull from '../assets/character_full.png';
import STAT_META from './statMeta';
import { getRankForLevel } from '../utils/rankMeta';
import RANKS from '../utils/rankMeta';

const formatArchiveDate = (dateKey) => {
  if (!dateKey) return '';
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
};

const PlayerDashboard = ({ user, onUpdateName, challenges = [], onChallengeStart, onChallengeComplete, xpCap = 100, onUpdateStat, commitmentArchive = [], onResolveCommitment }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [nameInput, setNameInput] = useState(user.name);
  const [poorDecisionText, setPoorDecisionText] = useState('');
  const [poorDecisionStat, setPoorDecisionStat] = useState('');
  const [poorDecisionOpen, setPoorDecisionOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const handleArchiveResolve = (entry, denied) => {
    if (!entry || !onResolveCommitment) return;
    if (denied) {
      onResolveCommitment(entry.date, entry.text, true);
      return;
    }
    setConfirming(true);
    setTimeout(() => {
      onResolveCommitment(entry.date, entry.text, false);
      setConfirming(false);
    }, 1400);
  };

  const rank = getRankForLevel(user.level);
  const nextRank = RANKS.find(r => r.minLevel > user.level) || null;
  const nextRankLevel = nextRank ? nextRank.minLevel : null;

  const handlePoorDecisionSubmit = () => {
    if (!poorDecisionText.trim() || !poorDecisionStat) return;
    onUpdateStat && onUpdateStat(poorDecisionStat, -100);
    setPoorDecisionText('');
    setPoorDecisionStat('');
  };

  const handleEditClick = () => {
    setIsEditing(true);
    setNameInput(user.name);
  };

  const handleSaveClick = () => {
    onUpdateName(nameInput);
    setIsEditing(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSaveClick();
    }
  };

  // Attributes list from user.stats
  const attributes = user.stats ? Object.entries(user.stats) : [];

  // Live clock — ticks every second so countdowns stay current
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Deadline = startedAt + duration window
  const DURATION_MS = {
    daily:   24 * 60 * 60 * 1000,
    fullDay: 24 * 60 * 60 * 1000,
    weekly:   7 * 24 * 60 * 60 * 1000,
    monthly: 30 * 24 * 60 * 60 * 1000,
  };

  const getDeadlineMs = (startedAt, duration) => {
    return (startedAt || Date.now()) + (DURATION_MS[duration] || DURATION_MS.daily);
  };

  const formatTimeLeft = (ms, duration) => {
    if (ms <= 0) return 'Time\'s up!';
    const totalSecs = Math.floor(ms / 1000);
    const days = Math.floor(totalSecs / 86400);
    const hrs  = Math.floor((totalSecs % 86400) / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    if (duration === 'weekly') {
      if (days > 0) return `${days}d ${hrs}h left`;
      return `${hrs}h left`;
    }
    // daily / fullDay — show hours/mins/secs
    if (hrs  > 0) return `${hrs}h ${mins}m left`;
    if (mins > 0) return `${mins}m ${secs}s left`;
    return `${secs}s left`;
  };

  // Returns gradient + glow color based on rank
  const getRankStyle = (level) => {
    if (level <= 5)  return { gradient: 'linear-gradient(90deg, #a0522d, #cd7f32)', glow: '#cd7f32' }; // Bronze
    if (level <= 10) return { gradient: 'linear-gradient(90deg, #a8a8a8, #e8e8e8)', glow: '#c0c0c0' }; // Silver
    if (level <= 20) return { gradient: 'linear-gradient(90deg, #f59e0b, #fbbf24)', glow: '#fbbf24' }; // Gold
    if (level <= 30) return { gradient: 'linear-gradient(90deg, #22d3ee, #67e8f9)', glow: '#67e8f9' }; // Platinum
    if (level <= 45) return { gradient: 'linear-gradient(90deg, #a855f7, #c084fc)', glow: '#c084fc' }; // Master
    if (level <= 60) return { gradient: 'linear-gradient(90deg, #ea580c, #f97316)', glow: '#f97316' }; // Champion
    if (level <= 80) return { gradient: 'linear-gradient(90deg, #dc2626, #ef4444)', glow: '#ef4444' }; // Grand Champion
    return { gradient: 'linear-gradient(90deg, #ef4444, #fbbf24, #ef4444)', glow: '#fbbf24' };         // Supreme
  };

  return (
    <div className="player-dashboard">
      {confirming && (
        <div className="commitment-confirm-popup">
          <div className="commitment-confirm-popup-inner">
            <span className="commitment-confirm-checkmark">✓</span>
            <span className="commitment-confirm-xp">+10 XP</span>
            <span className="commitment-confirm-label">Commitment kept!</span>
          </div>
        </div>
      )}
      
      {/* LEFT COLUMN */}
      <div className="dashboard-column left-column">
        
        {/* Profile Header */}
        <div className="profile-header">
           {isEditing ? (
              <input
                className="profile-name-input"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onBlur={handleSaveClick}
                onKeyDown={handleKeyDown}
                autoFocus
              />
            ) : (
              <h1 className="profile-name" onClick={handleEditClick} title="Edit Name">
                {user.name}
              </h1>
            )}
            
            <div className="level-bar-container">
              <div className="level-bar-top">
                <span className="level-text-left">Level {user.level}</span>
                <span className="level-text-right">{user.xp}/{xpCap} XP</span>
              </div>
              <div className="level-progress-bar">
                <div
                  className="level-progress-fill"
                  style={{
                    width: `${Math.min((user.xp / xpCap) * 100, 100)}%`,
                    background: getRankStyle(user.level).gradient,
                    '--glow-color': getRankStyle(user.level).glow,
                  }}
                ></div>
              </div>
            </div>
            {nextRank && (
              <p className="next-rank-hint">
                <span className="next-rank-icon">🏆</span>
                <span>
                  Rank up to{' '}
                  <span className="next-rank-name" style={{ color: nextRank.color }}>{nextRank.name}</span>
                  {' '}at Level {nextRankLevel}
                </span>
              </p>
            )}
        </div>

        {/* Active Challenges Section */}
        <div className="dashboard-card challenges-section">
          <h3 className="section-title">ACTIVE CHALLENGES</h3>
          
          <div className="challenges-list">
            {(() => {
              const active = challenges.filter(c => c.started && !c.completed);
              if (active.length === 0) {
                return (
                  <div className="empty-challenges">
                    <span>No active challenges</span>
                    <span className="empty-challenges-hint">Start one from the Challenges page</span>
                  </div>
                );
              }
              return active.map(challenge => {
                const meta = STAT_META[challenge.category] || { label: challenge.category, Icon: null, color: '#a3a3a3' };
                const { Icon } = meta;
                return (
                  <div
                    key={challenge.id}
                    className={`challenge-item${challenge.completed ? ' challenge-item--completed' : ''}`}
                  >
                    <div className="challenge-info">
                      <div className="challenge-header-row">
                        {Icon && (
                          <span className="challenge-stat-icon">
                            <Icon size={12} color={meta.color} strokeWidth={2.5} />
                          </span>
                        )}
                        <span className="challenge-category" style={{ color: meta.color }}>
                          {meta.label.toUpperCase()}
                        </span>
                      </div>
                      <div className="challenge-title">{challenge.text}</div>
                      <div className="challenge-xp">+{challenge.xp} XP</div>
                    </div>
                    <div className="challenge-actions">
                      {challenge.completed ? (
                        <div className="challenge-done-badge">✓</div>
                      ) : (
                        <div className="challenge-active">
                          <button
                            className="challenge-complete-btn"
                            onClick={() => onChallengeComplete && onChallengeComplete(challenge.id)}
                          >
                            COMPLETE
                          </button>
                          <span className="challenge-time-left">
                            {formatTimeLeft(getDeadlineMs(challenge.startedAt, challenge.duration) - now, challenge.duration)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>

        {/* Poor Decisions Section */}
        <div className={`dashboard-card poor-decisions-section${poorDecisionOpen ? ' poor-decisions-section--open' : ''}`}>
          <div className="poor-decisions-header" onClick={() => setPoorDecisionOpen(o => !o)}>
            <h3 className="section-title poor-decisions-title">POOR DECISIONS</h3>
            <span className={`poor-decisions-chevron${poorDecisionOpen ? ' poor-decisions-chevron--open' : ''}`}>▾</span>
          </div>
          {poorDecisionOpen && (
            <div className="poor-decision-form">
              <input
                className="poor-decision-input"
                type="text"
                placeholder="What bad decision did you make today?"
                value={poorDecisionText}
                onChange={(e) => setPoorDecisionText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handlePoorDecisionSubmit()}
              />
              <div className="poor-decision-row">
                <select
                  className="poor-decision-select"
                  value={poorDecisionStat}
                  onChange={(e) => setPoorDecisionStat(e.target.value)}
                >
                  <option value="">Select attribute...</option>
                  {Object.entries(STAT_META).map(([key, meta]) => (
                    <option key={key} value={key}>{meta.label}</option>
                  ))}
                </select>
                <button
                  className="poor-decision-btn"
                  onClick={handlePoorDecisionSubmit}
                  disabled={!poorDecisionText.trim() || !poorDecisionStat}
                >
                  −100 XP
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Commitment Archive Section */}
        <div className={`dashboard-card commitment-archive-section${archiveOpen ? ' commitment-archive-section--open' : ''}`}>
          <div className="commitment-archive-header" onClick={() => setArchiveOpen(o => !o)}>
            <h3 className="section-title commitment-archive-title">
              🎯 COMMITMENTS
              {commitmentArchive.length > 0 && (
                <span className="commitment-archive-count">{commitmentArchive.length}</span>
              )}
            </h3>
            <span className={`commitment-archive-chevron${archiveOpen ? ' commitment-archive-chevron--open' : ''}`}>▾</span>
          </div>

          {archiveOpen && (
            <div className="commitment-archive-list">
              {commitmentArchive.length === 0 ? (
                <p className="commitment-archive-empty">No commitments yet.</p>
              ) : (
                commitmentArchive.map((entry, i) => (
                  <div key={i} className={`commitment-archive-entry${entry.denied === true ? ' commitment-archive-entry--denied' : ''}`}>
                    <div className="commitment-archive-entry-meta">
                      <span className="commitment-archive-date">{formatArchiveDate(entry.date)}</span>
                      {!entry.confirmedOn && entry.denied == null && (
                        <span className="commitment-archive-badge">⏳ Pending check-in</span>
                      )}
                      {(entry.confirmedOn || entry.denied != null) && entry.denied === true && (
                        <span className="commitment-archive-badge commitment-archive-badge--denied">✗ Missed</span>
                      )}
                      {(entry.confirmedOn || entry.denied != null) && entry.denied !== true && (
                        <span className="commitment-archive-badge">✓ +10 XP</span>
                      )}
                    </div>
                    <p className="commitment-archive-text">{entry.text}</p>
                    {!entry.confirmedOn && entry.denied == null && (
                      <div className="commitment-pending-actions">
                        <button
                          className="commitment-pending-btn commitment-pending-btn--confirm"
                          onClick={() => handleArchiveResolve(entry, false)}
                          disabled={confirming}
                        >
                          ✓ I did it &nbsp;<span className="commitment-pending-xp">+10 XP</span>
                        </button>
                        <button
                          className="commitment-pending-btn commitment-pending-btn--deny"
                          onClick={() => handleArchiveResolve(entry, true)}
                          disabled={confirming}
                        >
                          ✗ I didn't
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
      <div className="dashboard-column center-column">
        <div className="rank-badge-display">
          <img src={rank.badge} alt={rank.name} className="rank-badge-img" />
          <span className="rank-name-label" style={{ color: rank.color }}>{rank.name.toUpperCase()}</span>
        </div>
        <div className="character-container">
          <img src={characterFull} alt="Character" className="character-image" />
        </div>
      </div>

      {/* RIGHT COLUMN - Attributes */}
      <div className="dashboard-column right-column">
        <div className="dashboard-card attributes-section">
          <h3 className="section-title">ATTRIBUTES</h3>
          <div className="attributes-list">
              {attributes.map(([key, value]) => {
                  const meta = STAT_META[key] || { label: key, Icon: null, color: '#a3a3a3' };
                  const { Icon } = meta;
                  return (
                  <div key={key} className="attribute-item">
                      <div className="attribute-header">
                          <span className="attribute-name">
                              {Icon && <Icon size={14} color={meta.color} className="attribute-icon" strokeWidth={2.5} />}
                              {meta.label.toUpperCase()}
                          </span>
                          <span className="attribute-level" style={{ color: meta.color }}>LVL {Math.floor(value / 100) + 1}</span>
                      </div>
                      <div className="attribute-bar-container">
                          <div
                              className="attribute-bar-fill"
                              style={{ width: `${Math.max(5, value % 100)}%`, background: meta.color, boxShadow: `0 0 8px ${meta.color}66` }}
                          ></div>
                      </div>
                  </div>
                  );
              })}
          </div>
        </div>
      </div>

    </div>
  );
};

export default PlayerDashboard;
