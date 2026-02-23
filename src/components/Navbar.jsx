import React from 'react';
import './Navbar.css';

const Navbar = ({ activePage, onNavigate, userEmail, userLevel, userXp, userXpCap }) => {
  return (
    <>
      <nav className="navbar-container">
        <div className="navbar-pill">
          <div className="navbar-links">
            <button 
              className={`nav-link ${activePage === 'statistics' ? 'active' : ''}`}
              onClick={() => onNavigate('statistics')}
            >
              Statistics
            </button>
            <button 
              className={`nav-link ${activePage === 'tasks' ? 'active' : ''}`}
              onClick={() => onNavigate('tasks')}
            >
              Tasks
            </button>
            <button
              className={`nav-link ${activePage === 'challenges' ? 'active' : ''}`}
              onClick={() => onNavigate('challenges')}
            >
              Challenges
            </button>
            <button
              className={`nav-link ${activePage === 'daily-log' ? 'active' : ''}`}
              onClick={() => onNavigate('daily-log')}
            >
              Daily Log
            </button>
            <button
              className={`nav-link ${activePage === 'timer' ? 'active' : ''}`}
              onClick={() => onNavigate('timer')}
            >
              Timer
            </button>
          </div>
          <div className="navbar-profile">
            <span className="profile-email">{userEmail || 'Player'}</span>
          </div>
        </div>
      </nav>

      {/* Floating XP pill */}
      <div className="xp-pill">
        <span className="xp-pill-level">LVL {userLevel ?? 1}</span>
        <span className="xp-pill-divider" />
        <span className="xp-pill-text">{userXp ?? 0} / {userXpCap ?? 100} XP</span>
      </div>
    </>
  );
};

export default Navbar;
