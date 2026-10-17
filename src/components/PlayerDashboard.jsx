import React, { useState, useEffect, useMemo } from 'react';
import './PlayerDashboard.css';
import STAT_META from './statMeta';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip as RechartTooltip
} from 'recharts';
import { REQUIRED_STREAK_DAYS } from '../utils/scoreUtils';
import { getWeekVerdict, getScoreLeaks, getWeekDeltas } from '../utils/statsInsights';
import RANK_TIERS, { TIER_ICONS } from '../utils/rankMeta';
import TrendChart from './stats/TrendChart';
import ConnectedFeatureTiles from './stats/ConnectedFeatureTiles';
import {
  CheckSquare, Flame, Swords, Handshake, Timer, Pin, HeartCrack, Zap, Sparkles, Target, Flag,
  ArrowRight, ArrowUp, ArrowDown, Minus, ChevronDown, Check, X, ThumbsUp,
} from 'lucide-react';

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


// ─── Week Verdict ─────────────────────────────────────────────────────────────
// Counted days, never an average: "5 of 7 days cleared 6", one dot per weekday.
const DOT_ICON = { cleared: Check, missed: X };
const WeekVerdict = ({ verdict, rankStatus }) => {
  const rank = rankStatus.tier;
  const RankIcon = TIER_ICONS[rank.icon];
  const diff = verdict.cleared - verdict.lastWeekCleared;
  return (
    <section className="dashboard-card stats-verdict">
      <div className="stats-verdict-top">
        <div>
          <p className="stats-verdict-line">
            <strong>{verdict.cleared} of 7</strong> days cleared {verdict.threshold} this week
          </p>
          <p className="stats-verdict-sub">
            Last week: {verdict.lastWeekCleared} of 7
            {diff !== 0 && <span className={diff > 0 ? 'is-up' : 'is-down'}> ({diff > 0 ? '+' : ''}{diff} so far)</span>}
          </p>
        </div>
        <div className="stats-rank" style={{ '--tier-color': rank.color }}>
          {RankIcon && <RankIcon size={16} color={rank.color} />}
          <span className="stats-rank-name">{rank.name}</span>
          <span className="stats-rank-sub">
            {rankStatus.nextTier
              ? <>{rankStatus.nextTierStreak}/{REQUIRED_STREAK_DAYS} days toward <span style={{ color: rankStatus.nextTier.color }}>{rankStatus.nextTier.name}</span></>
              : <>Top rank, held {rankStatus.streakDays} days</>}
          </span>
        </div>
      </div>
      <div className="stats-week-dots">
        {verdict.days.map((d) => {
          const Icon = DOT_ICON[d.status];
          return (
            <div key={d.dateKey} className="stats-week-day" data-status={d.status} title={d.score != null ? `${d.dateKey}: ${d.score.toFixed(1)}` : d.dateKey}>
              <span className="stats-week-dot">
                {Icon ? <Icon size={14} strokeWidth={3} /> : d.status === 'today' ? d.score.toFixed(1) : ''}
              </span>
              <span className="stats-week-letter">{d.letter}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
};

// ─── Leak + Strength ──────────────────────────────────────────────────────────
const LeakCard = ({ leaks, onNavigate }) => {
  if (leaks.empty) {
    return (
      <section className="dashboard-card stats-leak">
        <span className="stats-eyebrow">Biggest leak</span>
        <p className="stats-leak-head">Not enough data yet</p>
        <p className="stats-leak-evidence">Log a few days (habits, tasks, sleep) and this shows where your score slips.</p>
      </section>
    );
  }
  const { biggest } = leaks;
  if (!biggest) {
    return (
      <section className="dashboard-card stats-leak is-clean">
        <span className="stats-eyebrow">Biggest leak</span>
        <p className="stats-leak-head">No points lost {leaks.windowLabel}</p>
        <p className="stats-leak-evidence">Every finished day was a perfect 10.</p>
      </section>
    );
  }
  const others = leaks.leaks.slice(1, 3);
  return (
    <section className="dashboard-card stats-leak">
      <span className="stats-eyebrow">Biggest leak</span>
      <p className="stats-leak-head">
        <span className="stats-swatch" style={{ background: biggest.color }} />
        {biggest.label} cost you <strong>{biggest.lost.toFixed(1)} points</strong> {leaks.windowLabel}
      </p>
      <p className="stats-leak-evidence">{biggest.evidence}</p>
      <div className="stats-leak-foot">
        <button type="button" className="stats-fix-btn" onClick={() => onNavigate?.(biggest.page)}>
          {biggest.fix} <ArrowRight size={14} />
        </button>
        {others.length > 0 && (
          <span className="stats-leak-others">
            Then: {others.map((o) => `${o.label} −${o.lost.toFixed(1)}`).join(' · ')}
          </span>
        )}
      </div>
    </section>
  );
};

const StrengthCard = ({ leaks }) => (
  <section className="dashboard-card stats-strength">
    <span className="stats-eyebrow">What's working</span>
    {leaks.empty ? (
      <p className="stats-leak-evidence">Nothing yet. This fills in after a few logged days.</p>
    ) : leaks.strength ? (
      <>
        <p className="stats-strength-head">
          <ThumbsUp size={16} /> {leaks.strength.label}
        </p>
        <p className="stats-leak-evidence">
          Full marks on {leaks.strength.full} of {leaks.days} days {leaks.windowLabel}. Keep it.
        </p>
      </>
    ) : (
      <p className="stats-leak-evidence">
        Nothing at full marks on half the days yet. Pick the leak and win that first.
      </p>
    )}
  </section>
);

// ─── This week vs last ────────────────────────────────────────────────────────
const WeekDeltas = ({ deltas }) => (
  <section className="dashboard-card stats-deltas">
    <h3 className="section-title">This week vs the same days last week</h3>
    <div className="stats-delta-list">
      {deltas.map((row) => {
        const { key, label, Icon, fmt, value, delta } = row;
        const dir = delta == null || delta === 0 ? 'flat' : delta > 0 ? 'up' : 'down';
        const DirIcon = dir === 'up' ? ArrowUp : dir === 'down' ? ArrowDown : Minus;
        const deltaText = delta == null ? '' : delta === 0 ? 'same' : key === 'focusMinutes'
          ? `${delta > 0 ? '+' : delta < 0 ? '−' : ''}${fmt(Math.abs(delta))}`
          : key === 'avgSleep'
            ? `${delta > 0 ? '+' : delta < 0 ? '−' : ''}${Math.abs(delta).toFixed(1)}h`
            : `${delta > 0 ? '+' : delta < 0 ? '−' : ''}${Math.abs(delta)}`;
        return (
          <div key={key} className="stats-delta-row">
            <span className="stats-delta-icon"><Icon size={14} /></span>
            <span className="stats-delta-label">{label}</span>
            <span className="stats-delta-value">{fmt(value)}</span>
            <span className={`stats-delta-change is-${dir}`}>
              <DirIcon size={12} strokeWidth={2.5} />{deltaText}
            </span>
          </div>
        );
      })}
    </div>
  </section>
);

// ─── Main Component ───────────────────────────────────────────────────────────
// One question: what's working, what's costing me, what's the one thing to fix.
// Home covers "what do I do now"; everything archival lives in the closed "More".
const PlayerDashboard = ({
  user, onUpdateName,
  xpCap = 100,
  commitmentArchive = [],
  xpLog = [], pomodoroSessions = [], habits = [], todos = [], logs = {},
  goals = [], healthLog = {}, noPhoneBlocks = [], calendarEvents = [],
  onNavigate,
  rankStatus = { tier: RANK_TIERS[0], streakDays: 0, nextTier: null, nextTierStreak: 0 },
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [nameInput, setNameInput] = useState(user.name);
  const [moreOpen, setMoreOpen]   = useState(false);

  const handleEditClick = () => { setIsEditing(true); setNameInput(user.name); };
  const handleSaveClick = () => { onUpdateName(nameInput); setIsEditing(false); };
  const handleKeyDown   = (e) => { if (e.key === 'Enter') handleSaveClick(); };

  const attributes = user.stats ? Object.entries(user.stats) : [];

  const data = { habits, xpLog, logs, commitmentArchive, healthLog, calendarEvents, pomodoroSessions, todos, goals };
  /* eslint-disable react-hooks/exhaustive-deps */
  const deps = [habits, xpLog.length, logs, commitmentArchive, healthLog, calendarEvents, pomodoroSessions.length, todos.length, goals];
  const verdict = useMemo(() => getWeekVerdict(data), deps);
  const leaks   = useMemo(() => getScoreLeaks(data), deps);
  const deltas  = useMemo(() => getWeekDeltas(data), deps);
  /* eslint-enable react-hooks/exhaustive-deps */

  return (
    <div className="player-dashboard">
      {/* Single column on phones/laptops; a screen-filling grid on monitors (see CSS). */}
      <div className="stats-main">
        <header className="stats-header">
          <h1 className="stats-title">Statistics</h1>
        </header>

        <WeekVerdict verdict={verdict} rankStatus={rankStatus} />

        <div className="stats-insight-row">
          <LeakCard leaks={leaks} onNavigate={onNavigate} />
          <StrengthCard leaks={leaks} />
        </div>

        <TrendChart habits={habits} xpLog={xpLog} logs={logs} commitmentArchive={commitmentArchive} healthLog={healthLog} calendarEvents={calendarEvents} />

        <WeekDeltas deltas={deltas} />
      </div>

      {/* ── MORE (collapsed) ──────────────────────────────────────────────── */}
      <button
        type="button"
        className={`stats-more-toggle${moreOpen ? ' is-open' : ''}`}
        onClick={() => setMoreOpen((o) => !o)}
        aria-expanded={moreOpen}
      >
        More <span className="stats-more-hint">character, features, attributes, activity, heatmap</span>
        <ChevronDown size={16} />
      </button>

      {moreOpen && (
        <div className="stats-more">
          <div className="dashboard-card stats-character">
            <div className="character-sheet-eyebrow">Character</div>
            {isEditing ? (
              <input className="profile-name-input" value={nameInput} onChange={(e) => setNameInput(e.target.value)} onBlur={handleSaveClick} onKeyDown={handleKeyDown} autoFocus />
            ) : (
              <h2 className="profile-name" onClick={handleEditClick} title="Edit Name">{user.name}</h2>
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

          <ConnectedFeatureTiles
            habits={habits} goals={goals} healthLog={healthLog} pomodoroSessions={pomodoroSessions}
            todos={todos} noPhoneBlocks={noPhoneBlocks} commitmentArchive={commitmentArchive}
            onNavigate={onNavigate}
          />

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

          <div className="dashboard-card heatmap-card">
            <h3 className="section-title">Productivity Heatmap: last 12 months</h3>
            <ProductivityHeatmap xpLog={xpLog} />
          </div>
        </div>
      )}
    </div>
  );
};

export default PlayerDashboard;
