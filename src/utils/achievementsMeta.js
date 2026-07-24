import {
  Star, Sparkles, Sparkle, Crown, CheckSquare, ClipboardList, Award, Zap,
  Target, Flame, LoaderPinwheel, Dumbbell, Handshake, PenLine, BookOpen, Crosshair, TrendingUp,
} from 'lucide-react';

export const ACHIEVEMENTS = [
  // Level milestones
  { id: 'level_5',  label: 'Rookie',     desc: 'Reach Level 5',   Icon: Star, tier: 'bronze' },
  { id: 'level_10', label: 'Veteran',    desc: 'Reach Level 10',  Icon: Sparkles, tier: 'silver' },
  { id: 'level_20', label: 'Elite',      desc: 'Reach Level 20',  Icon: Sparkle, tier: 'gold'   },
  { id: 'level_50', label: 'Legendary',  desc: 'Reach Level 50',  Icon: Crown, tier: 'platinum' },

  // Task milestones
  { id: 'tasks_10',  label: 'Getting Started', desc: 'Complete 10 tasks',  Icon: CheckSquare, tier: 'bronze' },
  { id: 'tasks_50',  label: 'Task Master',     desc: 'Complete 50 tasks',  Icon: ClipboardList, tier: 'silver' },
  { id: 'tasks_100', label: 'Century',         desc: 'Complete 100 tasks', Icon: Award, tier: 'gold'   },

  // XP milestones (lifetime positive XP)
  { id: 'xp_1000',  label: 'XP Initiate', desc: 'Earn 1,000 lifetime XP',  Icon: Zap, tier: 'bronze' },
  { id: 'xp_5000',  label: 'XP Adept',    desc: 'Earn 5,000 lifetime XP',  Icon: Zap, tier: 'silver' },
  { id: 'xp_10000', label: 'XP Master',   desc: 'Earn 10,000 lifetime XP', Icon: Zap, tier: 'gold'   },

  // Focus milestones
  { id: 'focus_5h',   label: 'Deep Work',   desc: 'Log 5 hours of focus',   Icon: Target, tier: 'bronze' },
  { id: 'focus_25h',  label: 'Flow State',  desc: 'Log 25 hours of focus',  Icon: Flame, tier: 'silver' },
  { id: 'focus_100h', label: 'Time Warper', desc: 'Log 100 hours of focus', Icon: LoaderPinwheel, tier: 'gold'   },

  // Habit streaks
  { id: 'habit_streak_7',  label: 'Creature of Habit', desc: 'Achieve a 7-day habit streak',  Icon: Flame, tier: 'bronze' },
  { id: 'habit_streak_30', label: 'Iron Will',          desc: 'Achieve a 30-day habit streak', Icon: Dumbbell, tier: 'gold'   },

  // Commitments
  { id: 'commitments_7', label: 'Word is Bond', desc: 'Keep 7 commitments in a row', Icon: Handshake, tier: 'silver' },

  // Journal
  { id: 'journal_7',  label: 'Reflective',  desc: 'Write 7 journal entries',  Icon: PenLine, tier: 'bronze' },
  { id: 'journal_30', label: 'Chronicler',  desc: 'Write 30 journal entries', Icon: BookOpen, tier: 'silver' },

  // Goals
  { id: 'goals_5',       label: 'Goal Getter',    desc: 'Complete 5 goals',           Icon: Target, tier: 'bronze' },
  { id: 'goals_20',      label: 'Goal Crusher',   desc: 'Complete 20 goals',          Icon: Crosshair, tier: 'gold'   },
  { id: 'milestones_25', label: 'Steady Climber', desc: 'Complete 25 goal milestones', Icon: TrendingUp, tier: 'bronze' },
];

export const getBestHabitStreak = (habits) => {
  let best = 0;
  for (const habit of habits) {
    const dates = Object.keys(habit.history || {}).filter(d => habit.history[d]).sort();
    let streak = 0, cur = 0;
    let prev = null;
    for (const d of dates) {
      if (!prev) { cur = 1; }
      else {
        const diff = (new Date(d) - new Date(prev)) / 86400000;
        cur = diff === 1 ? cur + 1 : 1;
      }
      streak = Math.max(streak, cur);
      prev = d;
    }
    best = Math.max(best, streak);
  }
  return best;
};

const getCommitmentStreak = (commitmentArchive) => {
  const sorted = [...commitmentArchive]
    .filter(a => a.confirmedOn != null || a.denied != null)
    .sort((a, b) => b.date.localeCompare(a.date));
  let streak = 0;
  for (const a of sorted) {
    if (a.denied !== true) streak++;
    else break;
  }
  return streak;
};

export const computeAchievementData = (user, habits, xpLog, pomodoroSessions, commitmentArchive, logs, goals = []) => ({
  levelReached: user.level,
  // Prefer the monotonic counters on `user`; fall back to the (truncated) xpLog for
  // any state written before those counters existed.
  taskCount: user.lifetimeTaskCount ?? xpLog.filter(e => e.source === 'task').length,
  lifetimeXp: user.lifetimeXp ?? xpLog.filter(e => e.amount > 0).reduce((s, e) => s + e.amount, 0),
  focusMinutes: pomodoroSessions.filter(s => s.completed).reduce((s, p) => s + Math.floor(p.durationSecs / 60), 0),
  bestHabitStreak: getBestHabitStreak(habits),
  commitmentStreak: getCommitmentStreak(commitmentArchive),
  journalCount: Object.values(logs).filter(e => (e.proud?.some(p => p?.trim())) || (e.emotions?.length > 0)).length,
  goalsCompleted: goals.filter(g => g.completed).length,
  milestonesCompleted: goals.reduce((s, g) => s + (g.milestones || []).filter(m => m.completed).length, 0),
});

export const checkAchievements = (data) => {
  const checks = {
    level_5:  data.levelReached >= 5,
    level_10: data.levelReached >= 10,
    level_20: data.levelReached >= 20,
    level_50: data.levelReached >= 50,
    tasks_10:  data.taskCount >= 10,
    tasks_50:  data.taskCount >= 50,
    tasks_100: data.taskCount >= 100,
    xp_1000:  data.lifetimeXp >= 1000,
    xp_5000:  data.lifetimeXp >= 5000,
    xp_10000: data.lifetimeXp >= 10000,
    focus_5h:   data.focusMinutes >= 300,
    focus_25h:  data.focusMinutes >= 1500,
    focus_100h: data.focusMinutes >= 6000,
    habit_streak_7:  data.bestHabitStreak >= 7,
    habit_streak_30: data.bestHabitStreak >= 30,
    commitments_7: data.commitmentStreak >= 7,
    journal_7:  data.journalCount >= 7,
    journal_30: data.journalCount >= 30,
    goals_5:  data.goalsCompleted >= 5,
    goals_20: data.goalsCompleted >= 20,
    milestones_25: data.milestonesCompleted >= 25,
  };
  return checks;
};
