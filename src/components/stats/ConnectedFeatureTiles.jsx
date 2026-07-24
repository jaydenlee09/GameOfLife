import { useMemo } from 'react';
import { BarChart, Bar, ResponsiveContainer, Cell } from 'recharts';
import {
  Flame, Target, Heart, Timer, CheckSquare, PhoneOff, Handshake, ArrowRight,
} from 'lucide-react';
import { getLocalDateKey, shiftDateKey } from '../../utils/scoreUtils';
import { getHabitCompletionsInLastNDays } from '../../utils/habitUtils';
import { getBestHabitStreak } from '../../utils/achievementsMeta';
import { getGoalProgress } from '../../utils/goalUtils';
import { expandEventsForDates, isInstanceCompleted } from '../../utils/calendarUtils';
import { getScreentimeStatus } from '../../utils/healthUtils';

const STATUS_COLORS = { good: '#30d158', warn: '#ff9f0a', bad: '#ff453a', neutral: '#8e8e93' };

const Tile = (props) => {
  const { Icon, title, status, headline, sublabel, onClick, children } = props;
  return (
    <button type="button" className="feature-tile" onClick={onClick} style={{ '--tile-status-color': STATUS_COLORS[status] }}>
      <div className="feature-tile-head">
        <span className="feature-tile-icon"><Icon size={16} /></span>
        <span className="feature-tile-title">{title}</span>
        <span className="feature-tile-status-dot" />
      </div>
      <div className="feature-tile-headline">{headline}</div>
      {sublabel && <div className="feature-tile-sublabel">{sublabel}</div>}
      {children}
      <span className="feature-tile-link">Open <ArrowRight size={12} /></span>
    </button>
  );
};

// One tile per feature area, each pulling live data from that feature so slipping
// spots are flagged (status dot) rather than just reported as a neutral number.
const ConnectedFeatureTiles = ({
  habits = [], goals = [], healthLog = {}, pomodoroSessions = [], todos = [],
  noPhoneBlocks = [], commitmentArchive = [], onNavigate,
}) => {
  const last7Keys = useMemo(
    () => Array.from({ length: 7 }, (_, i) => getLocalDateKey(-(6 - i))),
    []
  );

  // Habits — 7-day consistency across every habit.
  const habitsTotal = habits.length;
  const consistencyPct = habitsTotal > 0
    ? Math.round((habits.reduce((s, h) => s + getHabitCompletionsInLastNDays(h, 7), 0) / (habitsTotal * 7)) * 100)
    : null;
  const bestStreak = getBestHabitStreak(habits);
  const habitsStatus = consistencyPct == null ? 'neutral' : consistencyPct >= 70 ? 'good' : consistencyPct >= 40 ? 'warn' : 'bad';

  // Goals — flag pinned focus goals with zero progress.
  const totalGoals = goals.length;
  const completedGoals = goals.filter(g => g.completed).length;
  const pinnedActive = goals.filter(g => g.pinned && !g.completed);
  const stalledPinned = pinnedActive.filter(g => getGoalProgress(g).ratio === 0).length;
  const goalsStatus = totalGoals === 0 ? 'neutral'
    : stalledPinned > 0 ? 'bad'
    : (pinnedActive.length === 0 && goals.some(g => !g.completed)) ? 'warn' : 'good';

  // Health — sleep/water/workouts over the last 7 days, screentime as of today.
  const healthDays = last7Keys.map(k => healthLog[k]).filter(Boolean);
  const sleptDays = healthDays.filter(h => h.sleepHours > 0);
  const avgSleep = sleptDays.length ? sleptDays.reduce((s, h) => s + h.sleepHours, 0) / sleptDays.length : null;
  const waterDays = healthDays.filter(h => h.waterGlasses > 0);
  const avgWater = waterDays.length ? waterDays.reduce((s, h) => s + h.waterGlasses, 0) / waterDays.length : null;
  const workoutsCount = healthDays.reduce((s, h) => s + (h.workouts?.length || 0), 0);
  const todayScreentime = healthLog[getLocalDateKey(0)]?.screentimeHours;
  const screentimeStatus = todayScreentime != null ? getScreentimeStatus(todayScreentime) : null;
  const healthStatus = (avgSleep != null && avgSleep < 5.5) || screentimeStatus === 'excessive' ? 'bad'
    : (avgSleep != null && avgSleep < 7) || screentimeStatus === 'toomuch' ? 'warn'
    : (avgSleep == null && workoutsCount === 0) ? 'neutral' : 'good';

  // Focus — trailing 7-day minutes, mirrors TimerPage's own 7-day chart.
  const last7Focus = last7Keys.map(key => ({
    key,
    mins: pomodoroSessions.filter(s => s.date === key && s.completed).reduce((s, p) => s + Math.floor(p.durationSecs / 60), 0),
  }));
  const totalFocusMins = last7Focus.reduce((s, d) => s + d.mins, 0);
  const focusStatus = totalFocusMins === 0 ? 'neutral' : totalFocusMins >= 420 ? 'good' : totalFocusMins >= 150 ? 'warn' : 'bad';

  // Tasks — overall backlog completion rate.
  const totalTodos = todos.length;
  const completedTodos = todos.filter(t => t.completed).length;
  const taskRate = totalTodos > 0 ? Math.round((completedTodos / totalTodos) * 100) : null;
  const taskStatus = taskRate == null ? 'neutral' : taskRate >= 70 ? 'good' : taskRate >= 40 ? 'warn' : 'bad';

  // No-Phone — blocks honored vs. scheduled over the last 7 days.
  const noPhoneInstances = expandEventsForDates(noPhoneBlocks, last7Keys);
  const noPhoneHonored = noPhoneInstances.filter(isInstanceCompleted).length;
  const noPhoneRate = noPhoneInstances.length > 0 ? Math.round((noPhoneHonored / noPhoneInstances.length) * 100) : null;
  const noPhoneStatus = noPhoneRate == null ? 'neutral' : noPhoneRate >= 80 ? 'good' : noPhoneRate >= 50 ? 'warn' : 'bad';

  // Commitments — kept vs. denied over the last 14 days.
  const cutoffKey = shiftDateKey(getLocalDateKey(0), -13);
  const recentCommits = commitmentArchive.filter(a => a.date >= cutoffKey);
  const commitsKept = recentCommits.filter(a => a.denied !== true && (a.confirmedOn || a.denied === false)).length;
  const commitRate = recentCommits.length > 0 ? Math.round((commitsKept / recentCommits.length) * 100) : null;
  const commitStatus = commitRate == null ? 'neutral' : commitRate >= 80 ? 'good' : commitRate >= 50 ? 'warn' : 'bad';

  return (
    <div className="feature-tiles-grid">
      <Tile Icon={Flame} title="Habits" status={habitsStatus}
        headline={consistencyPct == null ? 'No habits yet' : `${consistencyPct}% this week`}
        sublabel={habitsTotal > 0 ? `Best streak: ${bestStreak} day${bestStreak === 1 ? '' : 's'}` : 'Add a habit to start tracking'}
        onClick={() => onNavigate?.('daily-log')} />

      <Tile Icon={Target} title="Goals" status={goalsStatus}
        headline={totalGoals === 0 ? 'No goals yet' : `${completedGoals}/${totalGoals} complete`}
        sublabel={stalledPinned > 0 ? `${stalledPinned} pinned goal${stalledPinned === 1 ? '' : 's'} stalled` : `${pinnedActive.length} pinned in progress`}
        onClick={() => onNavigate?.('goals')} />

      <Tile Icon={Heart} title="Health" status={healthStatus}
        headline={avgSleep != null ? `${avgSleep.toFixed(1)}h avg sleep` : 'No sleep logged'}
        sublabel={`${avgWater != null ? `${avgWater.toFixed(1)} bottles/day · ` : ''}${workoutsCount} workout${workoutsCount === 1 ? '' : 's'} this week`}
        onClick={() => onNavigate?.('daily-log')} />

      <Tile Icon={Timer} title="Focus" status={focusStatus}
        headline={totalFocusMins >= 60 ? `${Math.floor(totalFocusMins / 60)}h ${totalFocusMins % 60}m this week` : `${totalFocusMins}m this week`}
        sublabel="Last 7 days"
        onClick={() => onNavigate?.('timer')}>
        <div className="feature-tile-chart">
          <ResponsiveContainer width="100%" height={36}>
            <BarChart data={last7Focus} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <Bar dataKey="mins" radius={[2, 2, 0, 0]}>
                {last7Focus.map((entry, i) => (
                  <Cell key={entry.key} fill={i === 6 ? '#38bdf8' : '#3a3a3c'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Tile>

      <Tile Icon={CheckSquare} title="Tasks" status={taskStatus}
        headline={taskRate == null ? 'No tasks yet' : `${taskRate}% complete`}
        sublabel={totalTodos > 0 ? `${completedTodos}/${totalTodos} in your backlog` : 'Add a task to start tracking'}
        onClick={() => onNavigate?.('tasks')} />

      <Tile Icon={PhoneOff} title="No-Phone" status={noPhoneStatus}
        headline={noPhoneRate == null ? 'No blocks scheduled' : `${noPhoneRate}% honored`}
        sublabel={noPhoneInstances.length > 0 ? `${noPhoneHonored}/${noPhoneInstances.length} blocks this week` : 'Schedule one on the calendar'}
        onClick={() => onNavigate?.('calendar')} />

      <Tile Icon={Handshake} title="Commitments" status={commitStatus}
        headline={commitRate == null ? 'No commitments yet' : `${commitRate}% kept`}
        sublabel={recentCommits.length > 0 ? `${commitsKept}/${recentCommits.length} over 14 days` : 'Lock one in from Daily Log'}
        onClick={() => onNavigate?.('daily-log')} />
    </div>
  );
};

export default ConnectedFeatureTiles;
