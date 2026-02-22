import React, { useState, useEffect } from 'react';
import './PlayerDashboard.css';
import characterFull from '../assets/character_full.png';
import STAT_META from './statMeta';
import WARDROBE_ITEMS from '../utils/wardrobeMeta';

const PlayerDashboard = ({ user, onUpdateName, challenges = [], onChallengeStart, onChallengeComplete, xpCap = 100, equippedOutfit = {}, onUpdateOutfit, onUpdateStat }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [nameInput, setNameInput] = useState(user.name);
  const [wardrobeOpen, setWardrobeOpen] = useState(false);
  const [poorDecisionText, setPoorDecisionText] = useState('');
  const [poorDecisionStat, setPoorDecisionStat] = useState('');
  const [poorDecisionOpen, setPoorDecisionOpen] = useState(false);

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

  // Returns a CSS gradient based on level tier
  const getLevelGradient = (level) => {
    if (level <= 10) return 'linear-gradient(90deg, #6ee7b7, #3b82f6)';  // green → blue      (Novice)
    if (level <= 20) return 'linear-gradient(90deg, #93c5fd, #818cf8)';  // sky → indigo      (Apprentice)
    if (level <= 30) return 'linear-gradient(90deg, #c084fc, #e879f9)';  // violet → fuchsia  (Adept)
    if (level <= 40) return 'linear-gradient(90deg, #fbbf24, #f97316)';  // amber → orange    (Expert)
    if (level <= 50) return 'linear-gradient(90deg, #f97316, #ef4444)';  // orange → red      (Master)
    return 'linear-gradient(90deg, #ef4444, #fbbf24, #ef4444)';          // red-gold          (Legend)
  };

  return (
    <div className="player-dashboard">
      
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
                        <span className="level-text-left">LEVEL {user.level}</span>
                        <div className="level-progress-bar">
                            <div 
                                className="level-progress-fill" 
                                style={{ width: `${Math.min((user.xp / xpCap) * 100, 100)}%`, background: getLevelGradient(user.level) }}
                            ></div>
                        </div>
                        <span className="level-text-right">{user.xp}/{xpCap}</span>
            </div>
        </div>

        {/* Challenges Section */}
        <div className="dashboard-card challenges-section">
          <h3 className="section-title">CHALLENGES</h3>
          
          <div className="challenges-list">
            {challenges.length > 0 ? (
              challenges.map(challenge => {
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
                      ) : challenge.started ? (
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
                      ) : (
                        <button
                          className="challenge-start-btn"
                          onClick={() => onChallengeStart && onChallengeStart(challenge.id)}
                        >
                          START
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="empty-challenges">No active challenges</div>
            )}
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
      </div>

      {/* CENTER COLUMN - Character */}
      <div className="dashboard-column center-column">
        <div className="character-container">
          <img src={characterFull} alt="Character" className="character-image" />
          {/* Clothing layers */}
          {['bottom', 'top', 'accessory', 'head'].map(slot => {
            const itemId = equippedOutfit[slot];
            if (!itemId) return null;
            const item = WARDROBE_ITEMS.find(i => i.id === itemId);
            if (!item) return null;
            return (
              <img
                key={slot}
                src={item.image}
                alt={item.name}
                className="character-clothing-layer"
              />
            );
          })}
        </div>

        <button className="customize-btn" onClick={() => setWardrobeOpen(true)}>
          ✦ CUSTOMIZE
        </button>

        {/* Wardrobe Modal */}
        {wardrobeOpen && (
          <div className="wardrobe-overlay" onClick={() => setWardrobeOpen(false)}>
            <div className="wardrobe-modal" onClick={e => e.stopPropagation()}>
              <div className="wardrobe-header">
                <h2 className="wardrobe-title">WARDROBE</h2>
                <button className="wardrobe-close" onClick={() => setWardrobeOpen(false)}>✕</button>
              </div>

              {['head', 'top', 'bottom', 'accessory'].map(slot => {
                const slotItems = WARDROBE_ITEMS.filter(i => i.slot === slot);
                if (slotItems.length === 0) return null;
                return (
                  <div key={slot} className="wardrobe-slot-group">
                    <h3 className="wardrobe-slot-title">{slot.toUpperCase()}</h3>
                    <div className="wardrobe-items-grid">
                      {slotItems.map(item => {
                        const unlocked = user.level >= item.unlockLevel;
                        const equipped = equippedOutfit[slot] === item.id;
                        return (
                          <div
                            key={item.id}
                            className={`wardrobe-item ${equipped ? 'wardrobe-item--equipped' : ''} ${!unlocked ? 'wardrobe-item--locked' : ''}`}
                            onClick={() => unlocked && onUpdateOutfit(slot, item.id)}
                            title={unlocked ? item.name : `Unlocks at Level ${item.unlockLevel}`}
                          >
                            <div className="wardrobe-item-img-wrap">
                              <img src={item.image} alt={item.name} className="wardrobe-item-img" />
                              {!unlocked && (
                                <div className="wardrobe-item-lock">
                                  <span className="wardrobe-lock-icon">🔒</span>
                                  <span className="wardrobe-lock-level">LVL {item.unlockLevel}</span>
                                </div>
                              )}
                              {equipped && <div className="wardrobe-item-equipped-badge">✓</div>}
                            </div>
                            <span className="wardrobe-item-name">{item.name}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
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
