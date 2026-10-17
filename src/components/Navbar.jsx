import React, { useState, useLayoutEffect } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { TIER_ICONS } from '../utils/rankMeta';
import { scoreColor } from '../utils/scoreUtils';
import './Navbar.css';

const SIDEBAR_COLLAPSED_KEY = 'sidebarCollapsed';

const NAV_LINKS = [
  { id: 'welcome',    label: 'Home',        icon: <HomeIcon /> },
  { id: 'statistics', label: 'Statistics',  icon: <StatIcon /> },
  { id: 'tasks',      label: 'Tasks',       icon: <TaskIcon /> },
  { id: 'daily-log',  label: 'Daily Log',   icon: <LogIcon /> },
  { id: 'timer',      label: 'Timer',       icon: <TimerIcon /> },
  { id: 'calendar',   label: 'Calendar',    icon: <CalIcon /> },
  { id: 'goals',      label: 'Goals',       icon: <TargetIcon /> },
  { id: 'review',     label: 'Review',      icon: <ReviewIcon /> },
  { id: 'shop',       label: 'Shop',        icon: <ShopIcon /> },
  { id: 'brain-dump', label: 'Brain Dump',  icon: <BrainDumpIcon /> },
];

// Phone tab bar: the daily-use pages. Everything else lives in the More sheet.
const TAB_LINKS = [
  { id: 'welcome',   label: 'Home',     icon: <HomeIcon /> },
  { id: 'tasks',     label: 'Tasks',    icon: <TaskIcon /> },
  { id: 'calendar',  label: 'Calendar', icon: <CalIcon /> },
  { id: 'daily-log', label: 'Log',      icon: <LogIcon /> },
];
const MORE_LINKS = NAV_LINKS.filter(link => !TAB_LINKS.some(tab => tab.id === link.id));

function MoreIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="3" cy="8" r="1.5" fill="currentColor"/>
      <circle cx="8" cy="8" r="1.5" fill="currentColor"/>
      <circle cx="13" cy="8" r="1.5" fill="currentColor"/>
    </svg>
  );
}

export function HomeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 7L8 1.5L14 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M3.5 6V14H12.5V6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <rect x="6.5" y="9.5" width="3" height="4.5" fill="currentColor" opacity="0.6"/>
    </svg>
  );
}

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

export function BrainDumpIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M4.5 11.5C2.84 11.5 1.5 10.16 1.5 8.5C1.5 6.98 2.62 5.72 4.08 5.53C4.4 3.53 6.13 2 8.2 2C10.4 2 12.2 3.7 12.4 5.86C13.66 6.1 14.5 7.2 14.5 8.5C14.5 10.16 13.16 11.5 11.5 11.5H4.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <circle cx="6" cy="13.5" r="0.75" fill="currentColor"/>
      <circle cx="9" cy="14" r="0.75" fill="currentColor"/>
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

// Today's Daily Score, footer-sized. The number sits INSIDE the ring so a collapsed
// sidebar still shows the real value rather than just a colored arc.
function ScoreChip({ score, onNavigate }) {
  const value = Number.isFinite(score) ? Math.max(0, Math.min(score, 10)) : 0;
  const color = scoreColor(value);
  const R = 13;
  const C = 2 * Math.PI * R;

  return (
    <button
      className="sidebar-score-chip"
      onClick={() => onNavigate('statistics')}
      title={`Today's Daily Score — ${value.toFixed(1)} / 10`}
    >
      <span className="sidebar-score-ring">
        <svg width="32" height="32" viewBox="0 0 32 32">
          <circle cx="16" cy="16" r={R} fill="none" stroke="var(--bg-elevated-2)" strokeWidth="2.5" />
          <circle
            cx="16" cy="16" r={R} fill="none"
            stroke={color} strokeWidth="2.5" strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={C * (1 - value / 10)}
            transform="rotate(-90 16 16)"
            style={{ transition: 'stroke-dashoffset 0.5s var(--ease)' }}
          />
        </svg>
        <span className="sidebar-score-number" style={{ color }}>{value.toFixed(1)}</span>
      </span>
      <span className="sidebar-score-text">
        <span className="sidebar-score-label">Daily Score</span>
        <span className="sidebar-score-outof">out of 10 today</span>
      </span>
    </button>
  );
}

const Navbar = ({ activePage, onNavigate, userEmail, userLevel, userXp, userXpCap, rankStatus, dailyScore, onOpenDataModal, isMobileMenuOpen, onMobileMenuToggle, onMobileMenuClose, firebaseUser, onSignOut }) => {
  const pct = userXpCap ? Math.min((userXp / userXpCap) * 100, 100) : 0;
  const RankIcon = rankStatus ? TIER_ICONS[rankStatus.tier.icon] : null;
  const moreActive = isMobileMenuOpen || MORE_LINKS.some(link => link.id === activePage);

  // Tapping the tab you're already on goes back to the top, like native tab bars.
  const handleTab = (id) => {
    if (id === activePage && !isMobileMenuOpen) window.scrollTo({ top: 0, behavior: 'smooth' });
    else onNavigate(id);
  };

  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true');

  useLayoutEffect(() => {
    document.documentElement.style.setProperty(
      '--sidebar-w',
      collapsed ? 'var(--sidebar-w-collapsed)' : '220px'
    );
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
  }, [collapsed]);

  const SidebarFooter = () => (
    <div className="sidebar-footer">
      <ScoreChip score={dailyScore} onNavigate={onNavigate} />
      {rankStatus && (
        <button
          className="sidebar-rank-chip"
          onClick={() => onNavigate('statistics')}
          title={`${rankStatus.tier.name} — ${rankStatus.streakDays}-day streak`}
        >
          <span className="sidebar-rank-icon-ring" style={{ '--tier-color': rankStatus.tier.color }}>
            {RankIcon && <RankIcon size={14} color={rankStatus.tier.color} />}
          </span>
          <span className="sidebar-rank-name" style={{ color: rankStatus.tier.color }}>{rankStatus.tier.name}</span>
        </button>
      )}
      <div className="sidebar-xp-section">
        <div className="sidebar-xp-header">
          <span className="sidebar-xp-level">LVL {userLevel ?? 1}</span>
          <span className="sidebar-xp-count">{userXp ?? 0} / {userXpCap ?? 100}</span>
        </div>
        <div className="sidebar-xp-track">
          <div
            className="sidebar-xp-fill"
            style={{ width: `${pct}%` }}
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
        <div className="sidebar-user-actions">
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
      <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
        <button
          className="sidebar-collapse-toggle"
          onClick={() => setCollapsed(c => !c)}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>

        <div className="sidebar-brand" />

        <nav className="sidebar-nav">
          {NAV_LINKS.map(({ id, label, icon }) => (
            <button
              key={id}
              className={`sidebar-link ${activePage === id ? 'active' : ''}`}
              onClick={() => onNavigate(id)}
              title={collapsed ? label : undefined}
            >
              <span className="sidebar-link-icon">{icon}</span>
              <span className="sidebar-link-label">{label}</span>
              {activePage === id && <span className="sidebar-link-active-bar" />}
            </button>
          ))}
        </nav>

        <SidebarFooter />
      </aside>

      {/* Mobile More sheet — only rendered when open to avoid event interception */}
      {isMobileMenuOpen && (
        <>
          <div className="mobile-drawer-backdrop" onClick={onMobileMenuClose} />

          <div className="mobile-drawer" role="dialog" aria-label="More pages">
            <div className="mobile-drawer-header">
              <span className="mobile-drawer-title">More</span>
              <button className="mobile-drawer-close" onClick={onMobileMenuClose} aria-label="Close"><X size={16} /></button>
            </div>

            <nav className="mobile-drawer-nav">
              {MORE_LINKS.map(({ id, label, icon }) => (
                <button
                  key={id}
                  className={`mobile-drawer-tile ${activePage === id ? 'active' : ''}`}
                  onClick={() => onNavigate(id)}
                >
                  <span className="mobile-drawer-tile-icon">{icon}</span>
                  <span className="mobile-drawer-tile-label">{label}</span>
                </button>
              ))}
            </nav>

            <SidebarFooter />
          </div>
        </>
      )}

      {/* Mobile tab bar */}
      <nav className="bottom-nav" aria-label="Main">
        {TAB_LINKS.map(({ id, label, icon }) => {
          const active = activePage === id && !isMobileMenuOpen;
          return (
            <button
              key={id}
              className={`bottom-nav-item${active ? ' active' : ''}`}
              aria-current={active ? 'page' : undefined}
              onClick={() => handleTab(id)}
            >
              <span className="bottom-nav-icon">{icon}</span>
              <span className="bottom-nav-label">{label}</span>
            </button>
          );
        })}
        <button
          className={`bottom-nav-item${moreActive ? ' active' : ''}`}
          aria-expanded={isMobileMenuOpen}
          onClick={onMobileMenuToggle}
        >
          <span className="bottom-nav-icon"><MoreIcon /></span>
          <span className="bottom-nav-label">More</span>
        </button>
      </nav>
    </>
  );
};

export default Navbar;
