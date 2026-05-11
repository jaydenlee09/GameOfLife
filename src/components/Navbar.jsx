import React from 'react';
import './Navbar.css';

const NAV_LINKS = [
  { id: 'statistics', label: 'Statistics' },
  { id: 'tasks',      label: 'Tasks'      },
  { id: 'challenges', label: 'Challenges' },
  { id: 'daily-log',  label: 'Daily Log'  },
  { id: 'timer',      label: 'Timer'      },
  { id: 'calendar',   label: 'Calendar'   },
  { id: 'goals',      label: 'Goals'      },
  { id: 'health',     label: 'Health'     },
  { id: 'review',     label: 'Review'     },
  { id: 'rewards',    label: 'Rewards'    },
];

const getRankGradient = (level) => {
  if (level <= 5)  return 'linear-gradient(90deg, #a0522d, #cd7f32)';
  if (level <= 10) return 'linear-gradient(90deg, #a8a8a8, #e8e8e8)';
  if (level <= 20) return 'linear-gradient(90deg, #f59e0b, #fbbf24)';
  if (level <= 30) return 'linear-gradient(90deg, #22d3ee, #67e8f9)';
  if (level <= 45) return 'linear-gradient(90deg, #a855f7, #c084fc)';
  if (level <= 60) return 'linear-gradient(90deg, #ea580c, #f97316)';
  if (level <= 80) return 'linear-gradient(90deg, #dc2626, #ef4444)';
  return 'linear-gradient(90deg, #ef4444, #fbbf24, #ef4444)';
};

const Navbar = ({ activePage, onNavigate, userEmail, userLevel, userXp, userXpCap, onOpenDataModal }) => {
  const pct = userXpCap ? Math.min((userXp / userXpCap) * 100, 100) : 0;

  return (
    <>
      <nav className="navbar-container">
        <div className="navbar-pill">
          <div className="navbar-links">
            {NAV_LINKS.map(({ id, label }) => (
              <button
                key={id}
                className={`nav-link ${activePage === id ? 'active' : ''}`}
                onClick={() => onNavigate(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="navbar-profile">
            <span className="profile-email">{userEmail || 'Player'}</span>
            {onOpenDataModal && (
              <button className="navbar-gear" onClick={onOpenDataModal} title="Data & Shortcuts">⚙</button>
            )}
          </div>
        </div>
      </nav>

      {/* Floating XP pill with progress bar */}
      <div className="xp-pill">
        <span className="xp-pill-level">LVL {userLevel ?? 1}</span>
        <span className="xp-pill-divider" />
        <div className="xp-pill-bar-wrap">
          <div className="xp-pill-bar-fill" style={{ width: `${pct}%`, background: getRankGradient(userLevel ?? 1) }} />
        </div>
        <span className="xp-pill-text">{userXp ?? 0} / {userXpCap ?? 100}</span>
      </div>
    </>
  );
};

export default Navbar;
