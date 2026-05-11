import React, { useState, useEffect, useMemo } from 'react';
import './PlayerDashboard.css';
import characterFull from '../assets/character_full.png';
import STAT_META from './statMeta';
import { getRankForLevel } from '../utils/rankMeta';
import RANKS from '../utils/rankMeta';
import { ACHIEVEMENTS } from '../utils/achievementsMeta';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip as RechartTooltip
} from 'recharts';

const getLocalDateKey = (offsetDays = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

const formatArchiveDate = (dateKey) => {
  if (!dateKey) return '';
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const relativeTime = (ts) => {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
};

const SOURCE_ICONS = {
  task:         '✅',
  habit:        '🔥',
  challenge:    '⚔️',
  commitment:   '🤝',
  pomodoro:     '⏱️',
  subtask:      '📌',
  poor_decision:'💔',
  manual:       '⚡',
  xp:           '✨',
};

// ─── Daily Score Computation ──────────────────────────────────────────────────
const computeDailyScore = (habits, xpLog, pomodoroSessions, logs, commitmentArchive) => {
  const todayKey      = getLocalDateKey(0);
  const yesterdayKey  = getLocalDateKey(-1);

  // Habits: completed today / total
  const habitsTotal   = habits.length;
  const habitsDone    = habits.filter(h => h.history?.[todayKey]).length;
  const habitScore    = habitsTotal > 0 ? (habitsDone / habitsTotal) * 10 : 0;

  // Tasks: count task xp events logged today
  const tasksDone     = xpLog.filter(e => e.source === 'task' && e.date === todayKey).length;
  const taskScore     = Math.min(tasksDone / 3, 1) * 10; // 3 tasks = full score

  // Focus: minutes today / 60 min = full score
  const focusMins     = pomodoroSessions.filter(s => s.date === todayKey && s.completed)
                          .reduce((sum, s) => sum + Math.floor(s.durationSecs / 60), 0);
  const focusScore    = Math.min(focusMins / 60, 1) * 10;

  // Daily log filled
  const todayLog      = logs?.[todayKey];
  const logFilled     = todayLog && ((todayLog.emotions?.length > 0) || todayLog.proud?.some(p => p?.trim()));
  const logScore      = logFilled ? 10 : 0;

  // Commitment: was yesterday's commitment kept?
  const lastCommit    = commitmentArchive.find(a => a.date === yesterdayKey);
  const commitScore   = lastCommit?.denied === false || (lastCommit?.confirmedOn && lastCommit.denied !== true) ? 10 : 0;

  const raw = habitScore * 0.3 + taskScore * 0.3 + focusScore * 0.2 + logScore * 0.1 + commitScore * 0.1;
  return {
    score: Math.round(raw * 10) / 10,
    breakdown: {
      habits:     { value: Math.round(habitScore * 10) / 10, weight: 30, label: `${habitsDone}/${habitsTotal} habits` },
      tasks:      { value: Math.round(taskScore  * 10) / 10, weight: 30, label: `${tasksDone} task${tasksDone !== 1 ? 's' : ''} done` },
      focus:      { value: Math.round(focusScore * 10) / 10, weight: 20, label: `${focusMins}m focused` },
      log:        { value: logScore,   weight: 10, label: logFilled ? 'Log filled' : 'Log empty' },
      commitment: { value: commitScore, weight: 10, label: lastCommit ? (commitScore > 0 ? 'Commitment kept' : 'Commitment missed') : 'No commitment' },
    },
  };
};

// ─── Productivity Heatmap ─────────────────────────────────────────────────────
const ProductivityHeatmap = ({ xpLog }) => {
  const cells = useMemo(() => {
    const map = {};
    for (const e of xpLog) {
      if (e.amount > 0) map[e.date] = (map[e.date] || 0) + e.amount;
    }
    const today = new Date();
    const result = [];
    // Generate last 365 days
    for (let i = 364; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      result.push({ key, xp: map[key] || 0, date: d });
    }
    return result;
  }, [xpLog]);

  const getColor = (xp) => {
    if (xp === 0)   return '#1a1a1a';
    if (xp < 50)    return 'rgba(251,191,36,0.25)';
    if (xp < 150)   return 'rgba(251,191,36,0.5)';
    if (xp < 300)   return 'rgba(251,191,36,0.75)';
    return '#fbbf24';
  };

  const [tooltip, setTooltip] = useState(null);

  return (
    <div className="heatmap-container">
      <div className="heatmap-grid">
        {cells.map(({ key, xp, date }) => (
          <div
            key={key}
            className="heatmap-cell"
            style={{ background: getColor(xp) }}
            onMouseEnter={(e) => setTooltip({ key, xp, date, rect: e.currentTarget.getBoundingClientRect() })}
            onMouseLeave={() => setTooltip(null)}
          />
        ))}
      </div>
      {tooltip && (
        <div className="heatmap-tooltip">
          <strong>{tooltip.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</strong>
          <span>{tooltip.xp > 0 ? `${tooltip.xp} XP` : 'No activity'}</span>
        </div>
      )}
    </div>
  );
};

// ─── Attribute Radar ──────────────────────────────────────────────────────────
const AttributeRadar = ({ stats }) => {
  const data = Object.entries(stats).map(([key, val]) => ({
    stat: STAT_META[key]?.label?.slice(0, 6) || key,
    value: Math.floor(val / 100) + 1,
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <RadarChart data={data} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
        <PolarGrid stroke="#2a2a2a" />
        <PolarAngleAxis dataKey="stat" tick={{ fill: '#737373', fontSize: 11 }} />
        <RechartTooltip
          contentStyle={{ background: '#1c1c1c', border: '1px solid #333', borderRadius: 8, color: '#fff', fontSize: 12 }}
          formatter={(v) => [`LV ${v}`, 'Level']}
        />
        <Radar dataKey="value" stroke="#fbbf24" fill="#fbbf24" fillOpacity={0.18} strokeWidth={2} dot={{ fill: '#fbbf24', r: 3 }} />
      </RadarChart>
    </ResponsiveContainer>
  );
};

// ─── Daily Score Badge ────────────────────────────────────────────────────────
const DailyScoreBadge = ({ score, breakdown }) => {
  const [open, setOpen] = useState(false);
  const color = score >= 8 ? '#4ade80' : score >= 5 ? '#fbbf24' : '#f87171';
  const circumference = 2 * Math.PI * 28;
  const pct = score / 10;

  return (
    <div className="daily-score-wrapper">
      <div className="daily-score-card" onClick={() => setOpen(o => !o)}>
        <div className="daily-score-ring-wrap">
          <svg width="72" height="72" viewBox="0 0 72 72">
            <circle cx="36" cy="36" r="28" fill="none" stroke="#2a2a2a" strokeWidth="5" />
            <circle
              cx="36" cy="36" r="28" fill="none"
              stroke={color} strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - pct)}
              style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%', transition: 'stroke-dashoffset 0.5s ease' }}
            />
          </svg>
          <span className="daily-score-number" style={{ color }}>{score.toFixed(1)}</span>
        </div>
        <div className="daily-score-label-group">
          <span className="daily-score-title">TODAY'S SCORE</span>
          <span className="daily-score-sub">{open ? 'Hide details ▴' : 'Show breakdown ▾'}</span>
        </div>
      </div>
      {open && (
        <div className="daily-score-breakdown">
          {Object.entries(breakdown).map(([key, { value, weight, label }]) => (
            <div key={key} className="daily-score-row">
              <span className="daily-score-row-label">{label}</span>
              <span className="daily-score-row-weight">{weight}%</span>
              <div className="daily-score-row-bar-bg">
                <div className="daily-score-row-bar-fill" style={{ width: `${(value / 10) * 100}%`, background: value >= 7 ? '#4ade80' : value >= 4 ? '#fbbf24' : '#f87171' }} />
              </div>
              <span className="daily-score-row-val">{value.toFixed(1)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Activity Feed ────────────────────────────────────────────────────────────
const ActivityFeed = ({ xpLog }) => {
  const recent = xpLog.slice(0, 25);
  return (
    <div className="activity-feed-list">
      {recent.length === 0 && <p className="activity-feed-empty">No activity yet. Complete tasks to see your log.</p>}
      {recent.map(e => {
        const meta  = e.stat !== 'xp' ? STAT_META[e.stat] : null;
        const icon  = SOURCE_ICONS[e.source] || '⚡';
        const isPos = e.amount >= 0;
        return (
          <div key={e.id} className="activity-feed-item">
            <span className="activity-feed-icon">{icon}</span>
            <div className="activity-feed-body">
              {e.label && <span className="activity-feed-label">{e.label}</span>}
              <span className="activity-feed-stat" style={{ color: meta?.color || '#fbbf24' }}>
                {meta ? meta.label : 'XP'}
              </span>
            </div>
            <div className="activity-feed-right">
              <span className={`activity-feed-xp ${isPos ? 'pos' : 'neg'}`}>{isPos ? '+' : ''}{e.amount}</span>
              <span className="activity-feed-time">{relativeTime(e.ts)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ─── Achievements Panel ───────────────────────────────────────────────────────
const AchievementsPanel = ({ achievements }) => {
  const TIER_COLORS = { bronze: '#cd7f32', silver: '#c0c0c0', gold: '#fbbf24', platinum: '#67e8f9' };
  const unlockedIds = Object.keys(achievements || {});
  const unlocked    = ACHIEVEMENTS.filter(a => unlockedIds.includes(a.id));
  const locked      = ACHIEVEMENTS.filter(a => !unlockedIds.includes(a.id));

  return (
    <div className="achievements-panel">
      {unlocked.length === 0 && (
        <p className="achievements-empty">No achievements yet — keep going!</p>
      )}
      <div className="achievements-grid">
        {unlocked.map(a => (
          <div key={a.id} className="achievement-badge unlocked" title={`${a.label} — ${a.desc}`}>
            <span className="achievement-icon">{a.icon}</span>
            <span className="achievement-name" style={{ color: TIER_COLORS[a.tier] }}>{a.label}</span>
          </div>
        ))}
        {locked.slice(0, 6 - unlocked.length).map(a => (
          <div key={a.id} className="achievement-badge locked" title={a.desc}>
            <span className="achievement-icon locked-icon">🔒</span>
            <span className="achievement-name locked-name">{a.label}</span>
          </div>
        ))}
      </div>
      {locked.length > 0 && (
        <p className="achievements-progress">{unlocked.length} / {ACHIEVEMENTS.length} unlocked</p>
      )}
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
const PlayerDashboard = ({
  user, onUpdateName,
  challenges = [], onChallengeStart, onChallengeComplete,
  xpCap = 100, onUpdateStat, onAddXp,
  commitmentArchive = [], onResolveCommitment,
  xpLog = [], pomodoroSessions = [], habits = [], todos = [], logs = {},
  achievements = {}, onOpenFocusMode,
}) => {
  const [isEditing, setIsEditing]           = useState(false);
  const [nameInput, setNameInput]           = useState(user.name);
  const [poorDecisionText, setPoorDecisionText] = useState('');
  const [poorDecisionStat, setPoorDecisionStat] = useState('');
  const [poorDecisionOpen, setPoorDecisionOpen] = useState(false);
  const [archiveOpen, setArchiveOpen]       = useState(false);
  const [achieveOpen, setAchieveOpen]       = useState(false);
  const [confirming, setConfirming]         = useState(false);
  const [activeTab, setActiveTab]           = useState('feed'); // 'feed' | 'achievements'

  const handleArchiveResolve = (entry, denied) => {
    if (!entry || !onResolveCommitment) return;
    if (denied) { onResolveCommitment(entry.date, entry.text, true); return; }
    setConfirming(true);
    setTimeout(() => { onResolveCommitment(entry.date, entry.text, false); setConfirming(false); }, 1400);
  };

  const rank      = getRankForLevel(user.level);
  const nextRank  = RANKS.find(r => r.minLevel > user.level) || null;

  const handlePoorDecisionSubmit = () => {
    if (!poorDecisionText.trim() || !poorDecisionStat) return;
    onUpdateStat && onUpdateStat(poorDecisionStat, -100, { source: 'poor_decision', label: poorDecisionText });
    setPoorDecisionText('');
    setPoorDecisionStat('');
  };

  const handleEditClick  = () => { setIsEditing(true); setNameInput(user.name); };
  const handleSaveClick  = () => { onUpdateName(nameInput); setIsEditing(false); };
  const handleKeyDown    = (e) => { if (e.key === 'Enter') handleSaveClick(); };

  const attributes = user.stats ? Object.entries(user.stats) : [];

  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);

  const DURATION_MS = { daily: 86400000, fullDay: 86400000, weekly: 604800000, monthly: 2592000000 };
  const getDeadlineMs  = (startedAt, duration) => (startedAt || Date.now()) + (DURATION_MS[duration] || DURATION_MS.daily);
  const formatTimeLeft = (ms, duration) => {
    if (ms <= 0) return "Time's up!";
    const secs = Math.floor(ms / 1000);
    const d = Math.floor(secs / 86400), h = Math.floor((secs % 86400) / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
    if (duration === 'weekly') return d > 0 ? `${d}d ${h}h left` : `${h}h left`;
    if (h > 0) return `${h}h ${m}m left`;
    if (m > 0) return `${m}m ${s}s left`;
    return `${s}s left`;
  };

  const getRankStyle = (level) => {
    if (level <= 5)  return { gradient: 'linear-gradient(90deg, #a0522d, #cd7f32)', glow: '#cd7f32' };
    if (level <= 10) return { gradient: 'linear-gradient(90deg, #a8a8a8, #e8e8e8)', glow: '#c0c0c0' };
    if (level <= 20) return { gradient: 'linear-gradient(90deg, #f59e0b, #fbbf24)', glow: '#fbbf24' };
    if (level <= 30) return { gradient: 'linear-gradient(90deg, #22d3ee, #67e8f9)', glow: '#67e8f9' };
    if (level <= 45) return { gradient: 'linear-gradient(90deg, #a855f7, #c084fc)', glow: '#c084fc' };
    if (level <= 60) return { gradient: 'linear-gradient(90deg, #ea580c, #f97316)', glow: '#f97316' };
    if (level <= 80) return { gradient: 'linear-gradient(90deg, #dc2626, #ef4444)', glow: '#ef4444' };
    return { gradient: 'linear-gradient(90deg, #ef4444, #fbbf24, #ef4444)', glow: '#fbbf24' };
  };

  const dailyScore = useMemo(() =>
    computeDailyScore(habits, xpLog, pomodoroSessions, logs, commitmentArchive),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [habits.length, xpLog.length, pomodoroSessions.length, Object.keys(logs).length, commitmentArchive.length]
  );

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

      {/* ── LEFT COLUMN ────────────────────────────────────────────────────── */}
      <div className="dashboard-column left-column">

        {/* Profile Header */}
        <div className="profile-header">
          {isEditing ? (
            <input className="profile-name-input" value={nameInput} onChange={(e) => setNameInput(e.target.value)} onBlur={handleSaveClick} onKeyDown={handleKeyDown} autoFocus />
          ) : (
            <h1 className="profile-name" onClick={handleEditClick} title="Edit Name">{user.name}</h1>
          )}
          <div className="level-bar-container">
            <div className="level-bar-top">
              <span className="level-text-left">Level {user.level}</span>
              <span className="level-text-right">{user.xp}/{xpCap} XP</span>
            </div>
            <div className="level-progress-bar">
              <div className="level-progress-fill" style={{ width: `${Math.min((user.xp / xpCap) * 100, 100)}%`, background: getRankStyle(user.level).gradient, '--glow-color': getRankStyle(user.level).glow }} />
            </div>
          </div>
          {nextRank && (
            <p className="next-rank-hint">
              <span className="next-rank-icon">🏆</span>
              <span>Rank up to <span className="next-rank-name" style={{ color: nextRank.color }}>{nextRank.name}</span> at Level {nextRank.minLevel}</span>
            </p>
          )}
        </div>

        {/* Daily Score */}
        <DailyScoreBadge score={dailyScore.score} breakdown={dailyScore.breakdown} />

        {/* Active Challenges */}
        <div className="dashboard-card challenges-section">
          <h3 className="section-title">ACTIVE CHALLENGES</h3>
          <div className="challenges-list">
            {(() => {
              const active = challenges.filter(c => c.started && !c.completed);
              if (active.length === 0) return (
                <div className="empty-challenges">
                  <span>No active challenges</span>
                  <span className="empty-challenges-hint">Start one from the Challenges page</span>
                </div>
              );
              return active.map(challenge => {
                const meta = STAT_META[challenge.category] || { label: challenge.category, Icon: null, color: '#a3a3a3' };
                const { Icon } = meta;
                return (
                  <div key={challenge.id} className={`challenge-item${challenge.completed ? ' challenge-item--completed' : ''}`}>
                    <div className="challenge-info">
                      <div className="challenge-header-row">
                        {Icon && <span className="challenge-stat-icon"><Icon size={12} color={meta.color} strokeWidth={2.5} /></span>}
                        <span className="challenge-category" style={{ color: meta.color }}>{meta.label.toUpperCase()}</span>
                      </div>
                      <div className="challenge-title">{challenge.text}</div>
                      <div className="challenge-xp">+{challenge.xp} XP</div>
                    </div>
                    <div className="challenge-actions">
                      {challenge.completed ? (
                        <div className="challenge-done-badge">✓</div>
                      ) : (
                        <div className="challenge-active">
                          <button className="challenge-complete-btn" onClick={() => onChallengeComplete?.(challenge.id)}>COMPLETE</button>
                          <span className="challenge-time-left">{formatTimeLeft(getDeadlineMs(challenge.startedAt, challenge.duration) - now, challenge.duration)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>

        {/* Poor Decisions */}
        <div className={`dashboard-card poor-decisions-section${poorDecisionOpen ? ' poor-decisions-section--open' : ''}`}>
          <div className="poor-decisions-header" onClick={() => setPoorDecisionOpen(o => !o)}>
            <h3 className="section-title poor-decisions-title">POOR DECISIONS</h3>
            <span className={`poor-decisions-chevron${poorDecisionOpen ? ' poor-decisions-chevron--open' : ''}`}>▾</span>
          </div>
          {poorDecisionOpen && (
            <div className="poor-decision-form">
              <input className="poor-decision-input" type="text" placeholder="What bad decision did you make today?" value={poorDecisionText} onChange={(e) => setPoorDecisionText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handlePoorDecisionSubmit()} />
              <div className="poor-decision-row">
                <select className="poor-decision-select" value={poorDecisionStat} onChange={(e) => setPoorDecisionStat(e.target.value)}>
                  <option value="">Select attribute...</option>
                  {Object.entries(STAT_META).map(([key, meta]) => (
                    <option key={key} value={key}>{meta.label}</option>
                  ))}
                </select>
                <button className="poor-decision-btn" onClick={handlePoorDecisionSubmit} disabled={!poorDecisionText.trim() || !poorDecisionStat}>−100 XP</button>
              </div>
            </div>
          )}
        </div>

        {/* Commitment Archive */}
        <div className={`dashboard-card commitment-archive-section${archiveOpen ? ' commitment-archive-section--open' : ''}`}>
          <div className="commitment-archive-header" onClick={() => setArchiveOpen(o => !o)}>
            <h3 className="section-title commitment-archive-title">
              🎯 COMMITMENTS
              {commitmentArchive.length > 0 && <span className="commitment-archive-count">{commitmentArchive.length}</span>}
            </h3>
            <span className={`commitment-archive-chevron${archiveOpen ? ' commitment-archive-chevron--open' : ''}`}>▾</span>
          </div>
          {archiveOpen && (
            <div className="commitment-archive-list">
              {commitmentArchive.length === 0 ? (
                <p className="commitment-archive-empty">No commitments yet.</p>
              ) : commitmentArchive.map((entry, i) => (
                <div key={i} className={`commitment-archive-entry${entry.denied === true ? ' commitment-archive-entry--denied' : ''}`}>
                  <div className="commitment-archive-entry-meta">
                    <span className="commitment-archive-date">{formatArchiveDate(entry.date)}</span>
                    {!entry.confirmedOn && entry.denied == null && <span className="commitment-archive-badge">⏳ Pending check-in</span>}
                    {entry.denied === true && <span className="commitment-archive-badge commitment-archive-badge--denied">✗ Missed</span>}
                    {entry.confirmedOn && entry.denied !== true && <span className="commitment-archive-badge">✓ +10 XP</span>}
                  </div>
                  <p className="commitment-archive-text">{entry.text}</p>
                  {!entry.confirmedOn && entry.denied == null && (
                    <div className="commitment-pending-actions">
                      <button className="commitment-pending-btn commitment-pending-btn--confirm" onClick={() => handleArchiveResolve(entry, false)} disabled={confirming}>✓ I did it &nbsp;<span className="commitment-pending-xp">+10 XP</span></button>
                      <button className="commitment-pending-btn commitment-pending-btn--deny" onClick={() => handleArchiveResolve(entry, true)} disabled={confirming}>✗ I didn't</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── CENTER COLUMN ──────────────────────────────────────────────────── */}
      <div className="dashboard-column center-column">
        <div className="rank-badge-display">
          <img src={rank.badge} alt={rank.name} className="rank-badge-img" />
          <span className="rank-name-label" style={{ color: rank.color }}>{rank.name.toUpperCase()}</span>
        </div>
        <div className="character-container">
          <img src={characterFull} alt="Character" className="character-image" />
          {onOpenFocusMode && (
            <button className="focus-mode-btn" onClick={onOpenFocusMode} title="Alt+F">
              🎯 Focus Mode
            </button>
          )}
        </div>

        {/* Radar Chart */}
        {user.stats && (
          <div className="dashboard-card radar-card">
            <h3 className="section-title">ATTRIBUTE OVERVIEW</h3>
            <AttributeRadar stats={user.stats} />
          </div>
        )}
      </div>

      {/* ── RIGHT COLUMN ───────────────────────────────────────────────────── */}
      <div className="dashboard-column right-column">
        {/* Attributes */}
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
                    <div className="attribute-bar-fill" style={{ width: `${Math.max(5, value % 100)}%`, background: meta.color, boxShadow: `0 0 8px ${meta.color}66` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Activity Feed / Achievements Tab */}
        <div className="dashboard-card feed-card">
          <div className="feed-tabs">
            <button className={`feed-tab${activeTab === 'feed' ? ' active' : ''}`} onClick={() => setActiveTab('feed')}>ACTIVITY</button>
            <button className={`feed-tab${activeTab === 'achievements' ? ' active' : ''}`} onClick={() => setActiveTab('achievements')}>
              TROPHIES
              {Object.keys(achievements).length > 0 && (
                <span className="feed-tab-badge">{Object.keys(achievements).length}</span>
              )}
            </button>
          </div>
          {activeTab === 'feed' ? (
            <ActivityFeed xpLog={xpLog} />
          ) : (
            <AchievementsPanel achievements={achievements} />
          )}
        </div>
      </div>

      {/* ── HEATMAP ROW ────────────────────────────────────────────────────── */}
      <div className="dashboard-heatmap-row">
        <div className="dashboard-card heatmap-card">
          <h3 className="section-title">PRODUCTIVITY HEATMAP — {new Date().getFullYear()}</h3>
          <ProductivityHeatmap xpLog={xpLog} />
        </div>
      </div>
    </div>
  );
};

export default PlayerDashboard;
