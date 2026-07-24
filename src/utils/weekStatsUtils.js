import { Zap, CheckSquare, Flame, Timer, Target, Flag, Moon, Dumbbell } from 'lucide-react';

export const getLocalDateKey = (offsetDays = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

export const getMondayKey = (offsetWeeks = 0) => {
  const d = new Date();
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1 - day) + offsetWeeks * 7;
  d.setDate(d.getDate() + diff);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

export const formatWeekRange = (mondayKey) => {
  const mon = new Date(mondayKey + 'T00:00:00');
  const sun = new Date(mon);
  sun.setDate(sun.getDate() + 6);
  const opts = { month: 'short', day: 'numeric' };
  return `${mon.toLocaleDateString('en-US', opts)} – ${sun.toLocaleDateString('en-US', opts)}`;
};

export const getWeekDays = (mondayKey) => {
  const mon = new Date(mondayKey + 'T00:00:00');
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon);
    d.setDate(d.getDate() + i);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  });
};

export const computeWeekStats = (mondayKey, xpLog, pomodoroSessions, habits, todos, logs, goals = [], healthLog = {}) => {
  const days = getWeekDays(mondayKey);

  const xpEarned     = xpLog.filter(e => days.includes(e.date) && e.amount > 0).reduce((s, e) => s + e.amount, 0);
  const tasksCompleted = xpLog.filter(e => days.includes(e.date) && e.source === 'task').length;
  const habitsCompleted = xpLog.filter(e => days.includes(e.date) && e.source === 'habit' && e.amount > 0).length;
  const focusMinutes  = pomodoroSessions.filter(s => days.includes(s.date) && s.completed).reduce((s, p) => s + Math.floor(p.durationSecs / 60), 0);
  const goalsCompleted = goals.filter(g => g.completed && g.completedAt && days.some(d => (
    new Date(g.completedAt).toISOString().slice(0,10) === d
  ))).length;
  const milestonesCompleted = goals.reduce((sum, g) => sum + (g.milestones || []).filter(m => (
    m.completed && m.completedAt && days.some(d => new Date(m.completedAt).toISOString().slice(0,10) === d)
  )).length, 0);

  // Top emotion
  const emotionCount = {};
  for (const d of days) {
    for (const e of (logs[d]?.emotions || [])) emotionCount[e] = (emotionCount[e] || 0) + 1;
  }
  const topEmotion = Object.entries(emotionCount).sort((a,b) => b[1]-a[1])[0]?.[0] || null;

  // Health
  const healthDays = days.map(d => healthLog[d]).filter(Boolean);
  const sleptDays  = healthDays.filter(h => h.sleepHours > 0);
  const avgSleep   = sleptDays.length ? sleptDays.reduce((s, h) => s + h.sleepHours, 0) / sleptDays.length : 0;
  const workouts   = healthDays.reduce((s, h) => s + (h.workouts?.length || 0), 0);

  return { xpEarned, tasksCompleted, habitsCompleted, focusMinutes, topEmotion, goalsCompleted, milestonesCompleted, avgSleep, workouts };
};

export const STAT_ITEMS = [
  { key: 'xpEarned',       Icon: Zap, label: 'XP Earned',         fmt: v => `${v} XP` },
  { key: 'tasksCompleted', Icon: CheckSquare, label: 'Tasks Done',         fmt: v => `${v}` },
  { key: 'habitsCompleted',Icon: Flame, label: 'Habit Completions',  fmt: v => `${v}` },
  { key: 'focusMinutes',   Icon: Timer, label: 'Focus Time',         fmt: v => v >= 60 ? `${Math.floor(v/60)}h ${v%60}m` : `${v}m` },
  { key: 'goalsCompleted', Icon: Target, label: 'Goals Completed',    fmt: v => `${v}` },
  { key: 'milestonesCompleted', Icon: Flag, label: 'Milestones Hit', fmt: v => `${v}` },
  { key: 'avgSleep',       Icon: Moon, label: 'Avg Sleep',          fmt: v => v > 0 ? `${v.toFixed(1)}h` : '—' },
  { key: 'workouts',       Icon: Dumbbell, label: 'Workouts',           fmt: v => `${v}` },
];
