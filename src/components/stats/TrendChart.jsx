import { useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer, Cell, Rectangle,
} from 'recharts';
import { getLocalDateKey, computeDailyScore, STREAK_THRESHOLD } from '../../utils/scoreUtils';
import { getScreentimeStatus, SCREENTIME_COLORS, getSleepStatus, SLEEP_COLORS } from '../../utils/healthUtils';
import { SCORE_COMPONENTS } from '../../utils/statsInsights';

const TOOLTIP_STYLE = { background: '#1c1c1e', border: '1px solid #3a3a3c', borderRadius: 8, color: '#fff', fontSize: 12 };
const SEGMENT_GAP = '#141416'; // ~ card surface, draws the gap between stacked segments

// Score tooltip: the day's total, then what each component contributed.
const ScoreTooltip = ({ active, payload }) => {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="trend-tooltip" style={TOOLTIP_STYLE}>
      <div className="trend-tooltip-head">{row.dateKey} · <strong>{row.value.toFixed(1)}</strong></div>
      {[...SCORE_COMPONENTS].reverse().map((c) => (
        <div key={c.key} className="trend-tooltip-row">
          <span className="trend-swatch" style={{ background: c.color }} />
          <span>{c.label}</span>
          <span className="trend-tooltip-val">{row[c.key].toFixed(1)} / {(c.weight * 10).toFixed(0)}</span>
        </div>
      ))}
    </div>
  );
};

const MODES = {
  score: {
    label: 'Score',
    title: 'Daily Score: last 30 days',
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
// Score bars are stacked by Daily Score component, so a low day shows *why*.
const TrendChart = ({ habits, xpLog, logs, commitmentArchive, healthLog }) => {
  const [mode, setMode] = useState('score');
  const cfg = MODES[mode];

  const data = useMemo(() => {
    if (mode === 'score') {
      return Array.from({ length: 30 }, (_, i) => {
        const dateKey = getLocalDateKey(-(29 - i));
        const { score, breakdown } = computeDailyScore(habits, xpLog, logs, commitmentArchive, healthLog, dateKey);
        const [, m, d] = dateKey.split('-').map(Number);
        const row = { dateKey, value: score, label: `${m}/${d}` };
        for (const c of SCORE_COMPONENTS) row[c.key] = breakdown[c.key].value * c.weight;
        // Topmost non-empty segment gets the rounded cap.
        row.top = [...SCORE_COMPONENTS].reverse().find((c) => row[c.key] > 0)?.key || null;
        return row;
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
  }, [mode, habits.length, xpLog.length, Object.keys(logs).length, commitmentArchive.length, healthLog]);

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
      {mode === 'score' && (
        <div className="trend-legend">
          {SCORE_COMPONENTS.map((c) => (
            <span key={c.key} className="trend-legend-item">
              <span className="trend-swatch" style={{ background: c.color }} />{c.label}
            </span>
          ))}
          <span className="trend-legend-item trend-legend-ref">- - - clears {STREAK_THRESHOLD}</span>
        </div>
      )}
      {/* Absolute inner box so the plot can grow with the card (monitor layout). */}
      <div className="trend-chart-plot">
      <div className="trend-chart-plot-inner">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
          <XAxis
            dataKey="label"
            tick={{ fill: '#8e8e93', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            interval={cfg.interval}
          />
          <YAxis domain={mode === 'score' ? [0, 10] : [0, 'auto']} hide />
          {mode === 'score' ? (
            <Tooltip content={<ScoreTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
          ) : (
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelFormatter={(label, payload) => payload?.[0]?.payload?.dateKey || label}
              formatter={(v) => [`${v.toFixed(1)}${cfg.unit}`, cfg.label]}
              cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            />
          )}
          {mode === 'score' ? (
            SCORE_COMPONENTS.map((c) => (
              <Bar
                key={c.key}
                dataKey={c.key}
                stackId="score"
                fill={c.color}
                stroke={SEGMENT_GAP}
                strokeWidth={1}
                isAnimationActive={false}
                shape={(props) => (
                  <Rectangle {...props} radius={props.payload.top === c.key ? [3, 3, 0, 0] : 0} />
                )}
              />
            ))
          ) : (
            <Bar dataKey="value" radius={[3, 3, 0, 0]}>
              {data.map((entry) => (
                <Cell key={entry.dateKey} fill={entry.color} />
              ))}
            </Bar>
          )}
          <ReferenceLine y={cfg.referenceY} stroke="#8e8e93" strokeDasharray="3 3" ifOverflow="extendDomain" />
        </BarChart>
      </ResponsiveContainer>
      </div>
      </div>
    </div>
  );
};

export default TrendChart;
