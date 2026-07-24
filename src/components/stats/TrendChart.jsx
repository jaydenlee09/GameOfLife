import { useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer, Cell,
} from 'recharts';
import { getLocalDateKey, computeDailyScoreHistory, STREAK_THRESHOLD } from '../../utils/scoreUtils';
import { getScreentimeStatus, SCREENTIME_COLORS, getSleepStatus, SLEEP_COLORS } from '../../utils/healthUtils';

const scoreColor = (score) => score >= 8 ? '#30d158' : score >= STREAK_THRESHOLD ? '#ff9f0a' : '#ff453a';

const MODES = {
  score: {
    label: 'Score',
    title: 'Score Trend — Last 30 Days',
    days: 30,
    interval: 4,
    unit: '',
    referenceY: STREAK_THRESHOLD,
  },
  screentime: {
    label: 'Screentime',
    title: 'Screentime — Last 14 Days',
    days: 14,
    interval: 2,
    unit: 'h',
    referenceY: 3,
  },
  sleep: {
    label: 'Sleep',
    title: 'Sleep — Last 14 Days',
    days: 14,
    interval: 2,
    unit: 'h',
    referenceY: 8,
  },
};

// One card, three day-by-day metrics (score / screentime / sleep) toggled via
// a small pill switcher — never averaged, so a single bad day stays visible.
const TrendChart = ({ habits, xpLog, pomodoroSessions, logs, commitmentArchive, healthLog }) => {
  const [mode, setMode] = useState('score');
  const cfg = MODES[mode];

  const data = useMemo(() => {
    if (mode === 'score') {
      return computeDailyScoreHistory(habits, xpLog, pomodoroSessions, logs, commitmentArchive, 30)
        .map(({ dateKey, score }) => {
          const [, m, d] = dateKey.split('-').map(Number);
          return { dateKey, value: score, label: `${m}/${d}`, color: scoreColor(score) };
        });
    }
    const getHours = mode === 'screentime'
      ? (d) => healthLog[d]?.screentimeHours ?? 0
      : (d) => healthLog[d]?.sleepHours ?? 0;
    const getColor = mode === 'screentime'
      ? (h) => SCREENTIME_COLORS[getScreentimeStatus(h)]
      : (h) => SLEEP_COLORS[getSleepStatus(h)];
    return Array.from({ length: 14 }, (_, i) => {
      const dateKey = getLocalDateKey(-(13 - i));
      const hours = getHours(dateKey);
      const [, m, d] = dateKey.split('-').map(Number);
      return { dateKey, value: hours, label: `${m}/${d}`, color: getColor(hours) };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, habits.length, xpLog.length, pomodoroSessions.length, Object.keys(logs).length, commitmentArchive.length, healthLog]);

  return (
    <div className="dashboard-card trend-chart-card">
      <div className="trend-chart-header">
        <h3 className="section-title">{cfg.title}</h3>
        <div className="trend-chart-toggle">
          {Object.entries(MODES).map(([key, m]) => (
            <button
              key={key}
              className={`trend-toggle-btn${mode === key ? ' active' : ''}`}
              onClick={() => setMode(key)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <XAxis
            dataKey="label"
            tick={{ fill: '#8e8e93', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            interval={cfg.interval}
          />
          <YAxis domain={mode === 'score' ? [0, 10] : [0, 'auto']} hide />
          <Tooltip
            contentStyle={{ background: '#1c1c1e', border: '1px solid #3a3a3c', borderRadius: 8, color: '#fff', fontSize: 12 }}
            labelFormatter={(label, payload) => payload?.[0]?.payload?.dateKey || label}
            formatter={(v) => [`${v.toFixed(1)}${cfg.unit}`, cfg.label]}
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
          />
          <ReferenceLine y={cfg.referenceY} stroke="#8e8e93" strokeDasharray="3 3" />
          <Bar dataKey="value" radius={[3, 3, 0, 0]}>
            {data.map((entry) => (
              <Cell key={entry.dateKey} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default TrendChart;
