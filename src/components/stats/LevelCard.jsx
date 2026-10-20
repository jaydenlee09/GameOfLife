import React from 'react';
import { scoreColor } from '../../utils/scoreUtils';
import { XP_PER_POINT, XP_PER_LEVEL, SOLID_DAY_SCORE } from '../../utils/xpUtils';
import './LevelCard.css';

const DAYS_SHOWN = 14;
const R = 30;
const C = 2 * Math.PI * R;

const dayLabel = (dateKey, opts) => {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', opts);
};

// Level = Daily Scores banked as XP. Ring: progress into this level, today's live
// share glowing on the end. Bars: the last two weeks, one per day, so every point
// of the bar can be traced to the day that paid it.
const LevelCard = ({ xpStatus, xpSeries }) => {
  const { level, into, cap, todayXp, todayInLevel, daysToNext, total } = xpStatus;
  const banked = into - todayInLevel;
  const arc = (from, len) => ({
    strokeDasharray: `${(len / cap) * C} ${C}`,
    strokeDashoffset: -(from / cap) * C,
  });

  const byKey = Object.fromEntries(xpSeries.map(d => [d.dateKey, d]));
  const todayKey = xpSeries[xpSeries.length - 1].dateKey;
  const days = Array.from({ length: DAYS_SHOWN }, (_, i) => {
    const [y, m, d] = todayKey.split('-').map(Number);
    const dt = new Date(y, m - 1, d - (DAYS_SHOWN - 1 - i));
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    return byKey[key] || { dateKey: key, xp: 0, today: false, untracked: true };
  });
  const twoWeekXp = days.reduce((s, d) => s + d.xp, 0);

  return (
    <section className="dashboard-card level-card" aria-label={`Level ${level}, ${into} of ${cap} XP`}>
      <div className="level-card-main">
        <div className="level-card-ring">
          <svg width="76" height="76" viewBox="0 0 76 76" aria-hidden="true">
            <circle cx="38" cy="38" r={R} fill="none" stroke="var(--bg-elevated-2)" strokeWidth="5" />
            <g transform="rotate(-90 38 38)">
              {banked > 0 && (
                <circle cx="38" cy="38" r={R} fill="none" stroke="var(--accent-pressed)" strokeWidth="5" strokeLinecap="round" style={arc(0, banked)} className="level-card-arc" />
              )}
              {todayInLevel > 0 && (
                <circle cx="38" cy="38" r={R} fill="none" stroke="url(#levelTodayGrad)" strokeWidth="5" strokeLinecap="round" style={arc(banked, todayInLevel)} className="level-card-arc level-card-arc--today" />
              )}
            </g>
            <defs>
              <linearGradient id="levelTodayGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#38bdf8" />
                <stop offset="100%" stopColor="#a5e4fc" />
              </linearGradient>
            </defs>
          </svg>
          <span className="level-card-ring-label">
            <span className="level-card-ring-lvl">LVL</span>
            <span className="level-card-ring-num">{level}</span>
          </span>
        </div>

        <div className="level-card-text">
          <p className="level-card-eyebrow">Level</p>
          <p className="level-card-xp"><strong>{into}</strong> / {cap} XP</p>
          <p className="level-card-today">
            <span className="level-card-today-chip">+{todayXp} today</span>
            <span>~{daysToNext} solid day{daysToNext === 1 ? '' : 's'} to Level {level + 1}</span>
          </p>
        </div>
      </div>

      <div className="level-card-days">
        <div className="level-card-bars">
          {days.map((d) => {
            const score = d.xp / XP_PER_POINT;
            const label = dayLabel(d.dateKey, { weekday: 'short', month: 'short', day: 'numeric' });
            return (
              <div key={d.dateKey} className={`level-card-day${d.today ? ' is-today' : ''}`}>
                <span
                  className="level-card-bar"
                  title={d.untracked ? `${label} · not tracked` : `${label}${d.today ? ' (so far)' : ''} · score ${score.toFixed(1)} → ${d.xp} XP`}
                  style={{ '--h': `${Math.max(4, Math.min(d.xp, 100))}%`, '--c': d.xp ? scoreColor(score) : 'var(--bg-elevated-3)' }}
                />
                <span className="level-card-day-label">{dayLabel(d.dateKey, { weekday: 'narrow' })}</span>
              </div>
            );
          })}
        </div>
        <p className="level-card-rule">
          Last 14 days: <strong>{twoWeekXp} XP</strong> · each day pays its Daily Score × {XP_PER_POINT} · {XP_PER_LEVEL} XP a level (≈ a week of {SOLID_DAY_SCORE}s) · {total.toLocaleString()} XP all-time
        </p>
      </div>
    </section>
  );
};

export default LevelCard;
