import React from 'react';
import './Navbar.css';

const NAV_LINKS = [
  { id: 'statistics', label: 'Statistics',  icon: <StatIcon /> },
  { id: 'tasks',      label: 'Tasks',       icon: <TaskIcon /> },
  { id: 'challenges', label: 'Challenges',  icon: <BoltIcon /> },
  { id: 'daily-log',  label: 'Daily Log',   icon: <LogIcon /> },
  { id: 'timer',      label: 'Timer',       icon: <TimerIcon /> },
  { id: 'calendar',   label: 'Calendar',    icon: <CalIcon /> },
  { id: 'goals',      label: 'Goals',       icon: <TargetIcon /> },
  { id: 'health',     label: 'Health',      icon: <HeartIcon /> },
  { id: 'review',     label: 'Review',      icon: <ReviewIcon /> },
  { id: 'shop',       label: 'Shop',        icon: <ShopIcon /> },
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

export function StatIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="9" width="3" height="6" rx="1" fill="currentColor" opacity="0.6"/>
      <rect x="6" y="5" width="3" height="10" rx="1" fill="currentColor" opacity="0.8"/>
      <rect x="11" y="1" width="3" height="14" rx="1" fill="currentColor"/>
    </svg>
  );
}

export function TaskIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="1" width="14" height="14" rx="3" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M4.5 8L7 10.5L11.5 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export function BoltIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M9 1L3 9H8L7 15L13 7H8L9 1Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export function LogIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="1" width="12" height="14" rx="2" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M5 5H11M5 8H11M5 11H8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

export function TimerIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="9" r="6" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M8 9V5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M6 1H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M13.5 4L12.5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

export function CalIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="3" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M1 7H15" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M5 1V4M11 1V4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="5.5" cy="10.5" r="1" fill="currentColor"/>
      <circle cx="8.5" cy="10.5" r="1" fill="currentColor"/>
      <circle cx="11.5" cy="10.5" r="1" fill="currentColor"/>
    </svg>
  );
}

export function TargetIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="8" cy="8" r="4" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="8" cy="8" r="1.5" fill="currentColor"/>
    </svg>
  );
}

export function HeartIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 13.5C8 13.5 1.5 9.5 1.5 5.5C1.5 3.5 3 2 4.75 2C6.1 2 7.25 2.8 8 4C8.75 2.8 9.9 2 11.25 2C13 2 14.5 3.5 14.5 5.5C14.5 9.5 8 13.5 8 13.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  );
}

export function ReviewIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M5 7H9M7 5V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

export function ShopIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M3 5H13L12.3 13.2C12.25 13.65 11.87 14 11.42 14H4.58C4.13 14 3.75 13.65 3.7 13.2L3 5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M5.5 5V3.5C5.5 2.12 6.62 1 8 1C9.38 1 10.5 2.12 10.5 3.5V5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function SignOutIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path d="M6 2H3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M10 10l3-2.5L10 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M13 7.5H6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path d="M6.3 1.5L5.7 3.1C5.2 3.3 4.7 3.6 4.3 4L2.6 3.6L1.5 5.5L2.8 6.6C2.7 7 2.7 7.3 2.8 7.7L1.5 8.8L2.6 10.7L4.3 10.3C4.7 10.6 5.2 10.9 5.7 11.1L6.3 12.8H8.7L9.3 11.1C9.8 10.9 10.3 10.6 10.7 10.3L12.4 10.7L13.5 8.8L12.2 7.7C12.3 7.3 12.3 7 12.2 6.6L13.5 5.5L12.4 3.6L10.7 4C10.3 3.6 9.8 3.3 9.3 3.1L8.7 1.5H6.3Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
      <circle cx="7.5" cy="7.2" r="2" stroke="currentColor" strokeWidth="1.2"/>
    </svg>
  );
}

const Navbar = ({ activePage, onNavigate, userEmail, userLevel, userXp, userXpCap, onOpenDataModal, isMobileMenuOpen, onMobileMenuClose, firebaseUser, onSignOut }) => {
  const pct = userXpCap ? Math.min((userXp / userXpCap) * 100, 100) : 0;
  const rankGrad = getRankGradient(userLevel ?? 1);

  const SidebarFooter = () => (
    <div className="sidebar-footer">
      <div className="sidebar-xp-section">
        <div className="sidebar-xp-header">
          <span className="sidebar-xp-level">LVL {userLevel ?? 1}</span>
          <span className="sidebar-xp-count">{userXp ?? 0} / {userXpCap ?? 100}</span>
        </div>
        <div className="sidebar-xp-track">
          <div
            className="sidebar-xp-fill"
            style={{ width: `${pct}%`, background: rankGrad }}
          />
        </div>
      </div>

      <div className="sidebar-user">
        {firebaseUser?.photoURL ? (
          <img
            src={firebaseUser.photoURL}
            alt="avatar"
            className="sidebar-avatar"
            style={{ borderRadius: '50%', objectFit: 'cover' }}
          />
        ) : (
          <div className="sidebar-avatar">
            {(userEmail || 'P').charAt(0).toUpperCase()}
          </div>
        )}
        <span className="sidebar-username" title={firebaseUser?.email || userEmail}>
          {userEmail || firebaseUser?.displayName || 'Player'}
        </span>
        <div style={{ display: 'flex', gap: '4px' }}>
          {onOpenDataModal && (
            <button className="sidebar-gear" onClick={onOpenDataModal} title="Data & Shortcuts">
              <GearIcon />
            </button>
          )}
          {onSignOut && (
            <button
              className="sidebar-gear"
              onClick={onSignOut}
              title="Sign out"
              style={{ opacity: 0.7 }}
            >
              <SignOutIcon />
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-brand-dot" />
          <span className="sidebar-brand-text">GameOfLife</span>
        </div>

        <nav className="sidebar-nav">
          {NAV_LINKS.map(({ id, label, icon }) => (
            <button
              key={id}
              className={`sidebar-link ${activePage === id ? 'active' : ''}`}
              onClick={() => onNavigate(id)}
            >
              <span className="sidebar-link-icon">{icon}</span>
              <span className="sidebar-link-label">{label}</span>
              {activePage === id && <span className="sidebar-link-active-bar" />}
            </button>
          ))}
        </nav>

        <SidebarFooter />
      </aside>

      {/* Mobile drawer — only rendered when open to avoid event interception */}
      {isMobileMenuOpen && (
        <>
          <div className="mobile-drawer-backdrop" onClick={onMobileMenuClose} />

          <div className="mobile-drawer">
            <button className="mobile-drawer-close" onClick={onMobileMenuClose}>✕</button>

            <div className="mobile-drawer-brand">
              <div className="sidebar-brand-dot" />
              <span className="sidebar-brand-text">GameOfLife</span>
            </div>

            <nav className="mobile-drawer-nav">
              {NAV_LINKS.map(({ id, label, icon }) => (
                <button
                  key={id}
                  className={`sidebar-link ${activePage === id ? 'active' : ''}`}
                  onClick={() => onNavigate(id)}
                >
                  <span className="sidebar-link-icon">{icon}</span>
                  <span className="sidebar-link-label">{label}</span>
                </button>
              ))}
            </nav>

            <SidebarFooter />
          </div>
        </>
      )}
    </>
  );
};

export default Navbar;
