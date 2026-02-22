import React, { useState } from 'react';
import './Sidebar.css';

const Sidebar = ({ user, onUpdateName }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [nameInput, setNameInput] = useState(user.name);

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

  return (
    <div className="sidebar">
      <div className="user-profile">
        {isEditing ? (
            <div className="name-edit-container">
                <input 
                    type="text" 
                    value={nameInput} 
                    onChange={(e) => setNameInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="name-input"
                    autoFocus
                />
                <button onClick={handleSaveClick} className="save-btn">✓</button>
            </div>
        ) : (
            <h2 onClick={handleEditClick} className="user-name" title="Click to edit">
                {user.name} ✎
            </h2>
        )}
        <div className="level-info">
          <p>Level: {user.level}</p>
          <div className="xp-bar-container">
            <div className="xp-bar" style={{ width: `${user.xp}%` }}></div>
          </div>
          <p>XP: {user.xp} / 100</p>
        </div>
      </div>
      
      <div className="stats-container">
        <h3>Stats</h3>
        <ul className="stats-list">
          {Object.entries(user.stats).map(([statName, statValue]) => (
            <li key={statName} className="stat-item">
              <span className="stat-name">{statName}:</span>
              <span className="stat-value">{statValue}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default Sidebar;
