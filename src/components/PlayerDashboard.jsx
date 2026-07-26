import React, { useState, useEffect, useMemo } from 'react';
import './PlayerDashboard.css';
import STAT_META from './statMeta';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip as RechartTooltip
} from 'recharts';
import { computeDailyScore, computeStreak, REQUIRED_STREAK_DAYS } from '../utils/scoreUtils';
import { computeWeekStats, STAT_ITEMS, getMondayKey } from '../utils/weekStatsUtils';
import RANK_TIERS, { TIER_ICONS } from '../utils/rankMeta';
import TrendChart from './stats/TrendChart';
import ConnectedFeatureTiles from './stats/ConnectedFeatureTiles';
import {
  CheckSquare, Flame, Swords, Handshake, Timer, Moon, Pin, HeartCrack, Zap, Sparkles, Target, Flag,
  Smile, Repeat, NotebookText,
} from 'lucide-react';

const SCORE_CHIP_ICON = { habits: Repeat, tasks: CheckSquare, sleep: Moon, log: NotebookText, commitment: Handshake };

const relativeTime = (ts) => {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
};

const SOURCE_ICONS = {
  task:         CheckSquare,
  habit:        Flame,
  challenge:    Swords,
  commitment:   Handshake,
  pomodoro:     Timer,
  subtask:      Pin,
  poor_decision:HeartCrack,
  manual:       Zap,
  xp:           Sparkles,
  goal:         Target,
  milestone:    Flag,
};

// ─── Productivity Heatmap ─────────────────────────────────────────────────────
const ProductivityHeatmap = ({ xpLog }) => {
  const [visibleWeeks, setVisibleWeeks] = useState(53);

  useEffect(() => {
    const update = () => {
      if (window.innerWidth <= 480) setVisibleWeeks(12);
      else if (window.innerWidth <= 768) setVisibleWeeks(16);
      else setVisibleWeeks(53);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

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
    return result.slice(-(visibleWeeks * 7));
  }, [xpLog, visibleWeeks]);

  const getColor = (xp) => {
    if (xp === 0)   return '#2c2c2e';
    if (xp < 50)    return 'rgba(56,189,248,0.3)';
    if (xp < 150)   return 'rgba(56,189,248,0.55)';
    if (xp < 300)   return 'rgba(56,189,248,0.8)';
    return '#38bdf8';
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
        <PolarGrid stroke="#3a3a3c" />
        <PolarAngleAxis dataKey="stat" tick={{ fill: '#8e8e93', fontSize: 11 }} />
        <RechartTooltip
          contentStyle={{ background: '#1c1c1e', border: '1px solid #3a3a3c', borderRadius: 8, color: '#fff', fontSize: 12 }}
          formatter={(v) => [`LV ${v}`, 'Level']}
        />
        <Radar dataKey="value" stroke="#38bdf8" fill="#38bdf8" fillOpacity={0.18} strokeWidth={2} dot={{ fill: '#38bdf8', r: 3 }} />
      </RadarChart>
    </ResponsiveContainer>
  );
};

// ─── Daily Score Badge ────────────────────────────────────────────────────────
const DailyScoreBadge = ({ score, breakdown, streak }) => {
  const color = score >= 8 ? '#30d158' : score >= 5 ? '#ff9f0a' : '#ff453a';
  const R = 46;
  const circumference = 2 * Math.PI * R;
  const pct = score / 10;

  return (
    <div className="daily-score-wrapper">
      <div className="daily-score-card">
        <div className="daily-score-head">
          <div className="daily-score-ring-wrap">
            <svg width="120" height="120" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r={R} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="8" />
              <circle
                cx="60" cy="60" r={R} fill="none"
                stroke={color} strokeWidth="8" strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - pct)}
                style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%', transition: 'stroke-dashoffset 0.6s ease' }}
              />
            </svg>
            <div className="daily-score-ring-center">
              <span className="daily-score-number" style={{ color }}>{score.toFixed(1)}</span>
              <span className="daily-score-outof">/ 10</span>
            </div>
          </div>
          <div className="daily-score-body">
            <span className="daily-score-title">Today's Score</span>
            <span className="daily-score-streak">
              {streak > 0 ? <><Flame size={13} /> {streak}-day streak</> : 'No streak yet — clear 6+ to start'}
            </span>
          </div>
        </div>
        <div className="daily-score-chips">
          {Object.entries(breakdown).map(([key, { value, label }]) => {
            const ChipIcon = SCORE_CHIP_ICON[key];
            return (
              <span key={key} className="daily-score-chip" data-tier={value >= 7 ? 'good' : value >= 4 ? 'mid' : 'low'}>
                <span className="daily-score-chip-icon"><ChipIcon size={12} /></span>{label}
              </span>
            );
          })}
        </div>
      </div>
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
        const Icon  = SOURCE_ICONS[e.source] || Zap;
        const isPos = e.amount >= 0;
        return (
          <div key={e.id} className="activity-feed-item">
            <span className="activity-feed-icon"><Icon size={16} /></span>
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

// ─── This Week ────────────────────────────────────────────────────────────────
const ThisWeek = ({ xpLog, pomodoroSessions, habits, todos, logs, goals, healthLog }) => {
  const stats = useMemo(
    () => computeWeekStats(getMondayKey(0), xpLog, pomodoroSessions, habits, todos, logs, goals, healthLog),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [xpLog.length, pomodoroSessions.length, habits.length, todos.length, Object.keys(logs).length, goals, healthLog]
  );

  return (
    <div className="dashboard-card this-week-card">
      <h3 className="section-title">This Week</h3>
      <div className="week-stats-grid">
        {STAT_ITEMS.map((item) => {
          const Icon = item.Icon;
          return (
            <div key={item.key} className="week-stat-card">
              <div className="week-stat-top">
                <span className="week-stat-icon"><Icon size={14} /></span>
                <span className="week-stat-value">{item.fmt(stats[item.key])}</span>
              </div>
              <span className="week-stat-label">{item.label}</span>
            </div>
          );
        })}
        {stats.topEmotion && (
          <div className="week-stat-card">
            <div className="week-stat-top">
              <span className="week-stat-icon"><Smile size={14} /></span>
              <span className="week-stat-value">{stats.topEmotion}</span>
            </div>
            <span className="week-stat-label">Top Mood</span>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
const PlayerDashboard = ({
  user, onUpdateName,
  xpCap = 100,
  commitmentArchive = [],
  xpLog = [], pomodoroSessions = [], habits = [], todos = [], logs = {},
  goals = [], healthLog = {}, noPhoneBlocks = [],
  onOpenFocusMode, onNavigate,
  rankStatus = { tier: RANK_TIERS[0], streakDays: 0, nextTier: null, nextTierStreak: 0 },
}) => {
  const [isEditing, setIsEditing]           = useState(false);
  const [nameInput, setNameInput]           = useState(user.name);

  const rank = rankStatus.tier;
  const RankIcon = TIER_ICONS[rank.icon];

  const handleEditClick  = () => { setIsEditing(true); setNameInput(user.name); };
  const handleSaveClick  = () => { onUpdateName(nameInput); setIsEditing(false); };
  const handleKeyDown    = (e) => { if (e.key === 'Enter') handleSaveClick(); };

  const attributes = user.stats ? Object.entries(user.stats) : [];

  const dailyScore = useMemo(() =>
    computeDailyScore(habits, xpLog, logs, commitmentArchive, healthLog),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [habits.length, xpLog.length, Object.keys(logs).length, commitmentArchive.length, healthLog]
  );

  const dailyScoreStreak = useMemo(() =>
    computeStreak(habits, xpLog, logs, commitmentArchive, healthLog),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [habits.length, xpLog.length, Object.keys(logs).length, commitmentArchive.length, healthLog]
  );

  return (
    <div className="player-dashboard">
      {/* ── HERO BAND ─────────────────────────────────────────────────────── */}
      <div className="dashboard-hero">
        <div className="hero-identity">
          <div className="character-sheet-eyebrow">Character Sheet</div>
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
              <div className="level-progress-fill" style={{ width: `${Math.min((user.xp / xpCap) * 100, 100)}%` }} />
            </div>
          </div>
        </div>

        <div className="hero-rank">
          <div className="rank-badge-icon-ring" style={{ '--tier-color': rank.color }}>
            {RankIcon && <RankIcon size={28} color={rank.color} />}
          </div>
          <span className="rank-name-label" style={{ color: rank.color }}>{rank.name}</span>
          <span className="rank-streak-label">{rankStatus.streakDays}-day streak</span>
          {rankStatus.nextTier && (
            <p className="next-rank-hint">
              {rankStatus.nextTierStreak}/{REQUIRED_STREAK_DAYS} days toward{' '}
              <span style={{ color: rankStatus.nextTier.color }}>{rankStatus.nextTier.name}</span>
            </p>
          )}
          {onOpenFocusMode && (
            <button className="focus-mode-btn" onClick={onOpenFocusMode} title="Alt+F">
              <Target size={16} /> Focus Mode
            </button>
          )}
        </div>

        <DailyScoreBadge score={dailyScore.score} breakdown={dailyScore.breakdown} streak={dailyScoreStreak} />
      </div>

      {/* ── TREND CHART + THIS WEEK ──────────────────────────────────────── */}
      <div className="dashboard-trend-row">
        <TrendChart habits={habits} xpLog={xpLog} logs={logs} commitmentArchive={commitmentArchive} healthLog={healthLog} />
        <ThisWeek xpLog={xpLog} pomodoroSessions={pomodoroSessions} habits={habits} todos={todos} logs={logs} goals={goals} healthLog={healthLog} />
      </div>

      {/* ── CONNECTED FEATURES ────────────────────────────────────────────── */}
      <div className="dashboard-section-label">Connected Features</div>
      <ConnectedFeatureTiles
        habits={habits} goals={goals} healthLog={healthLog} pomodoroSessions={pomodoroSessions}
        todos={todos} noPhoneBlocks={noPhoneBlocks} commitmentArchive={commitmentArchive}
        onNavigate={onNavigate}
      />

      {/* ── ATTRIBUTES + ACTIVITY ─────────────────────────────────────────── */}
      <div className="dashboard-secondary-row">
        {user.stats && (
          <div className="dashboard-card attributes-card">
            <h3 className="section-title">Attributes</h3>
            <AttributeRadar stats={user.stats} />
            <div className="attributes-list">
              {attributes.map(([key, value]) => {
                const meta = STAT_META[key] || { label: key, Icon: null, color: '#a3a3a3' };
                const { Icon } = meta;
                return (
                  <div key={key} className="attribute-item">
                    <div className="attribute-header">
                      <span className="attribute-name">
                        {Icon && <Icon size={14} color={meta.color} className="attribute-icon" strokeWidth={2.5} />}
                        {meta.label}
                      </span>
                      <span className="attribute-level" style={{ color: meta.color }}>LVL {Math.floor(value / 100) + 1}</span>
                    </div>
                    <div className="attribute-bar-container">
                      <div className="attribute-bar-fill" style={{ width: `${Math.max(5, value % 100)}%`, background: meta.color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="dashboard-card feed-card">
          <h3 className="section-title">Activity</h3>
          <ActivityFeed xpLog={xpLog} />
        </div>
      </div>

      {/* ── HEATMAP ────────────────────────────────────────────────────────── */}
      <div className="dashboard-card heatmap-card">
        <h3 className="section-title">Productivity Heatmap — {new Date().getFullYear()}</h3>
        <ProductivityHeatmap xpLog={xpLog} />
      </div>
    </div>
  );
};

export default PlayerDashboard;
