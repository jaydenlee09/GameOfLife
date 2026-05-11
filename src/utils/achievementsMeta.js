export const ACHIEVEMENTS = [
  // Level milestones
  { id: 'level_5',  label: 'Rookie',     desc: 'Reach Level 5',   icon: '⭐', tier: 'bronze' },
  { id: 'level_10', label: 'Veteran',    desc: 'Reach Level 10',  icon: '🌟', tier: 'silver' },
  { id: 'level_20', label: 'Elite',      desc: 'Reach Level 20',  icon: '💫', tier: 'gold'   },
  { id: 'level_50', label: 'Legendary',  desc: 'Reach Level 50',  icon: '👑', tier: 'platinum' },

  // Task milestones
  { id: 'tasks_10',  label: 'Getting Started', desc: 'Complete 10 tasks',  icon: '✅', tier: 'bronze' },
  { id: 'tasks_50',  label: 'Task Master',     desc: 'Complete 50 tasks',  icon: '📋', tier: 'silver' },
  { id: 'tasks_100', label: 'Century',         desc: 'Complete 100 tasks', icon: '💯', tier: 'gold'   },

  // XP milestones (lifetime positive XP)
  { id: 'xp_1000',  label: 'XP Initiate', desc: 'Earn 1,000 lifetime XP',  icon: '⚡', tier: 'bronze' },
  { id: 'xp_5000',  label: 'XP Adept',    desc: 'Earn 5,000 lifetime XP',  icon: '⚡', tier: 'silver' },
  { id: 'xp_10000', label: 'XP Master',   desc: 'Earn 10,000 lifetime XP', icon: '⚡', tier: 'gold'   },

  // Focus milestones
  { id: 'focus_5h',   label: 'Deep Work',   desc: 'Log 5 hours of focus',   icon: '🎯', tier: 'bronze' },
  { id: 'focus_25h',  label: 'Flow State',  desc: 'Log 25 hours of focus',  icon: '🔥', tier: 'silver' },
  { id: 'focus_100h', label: 'Time Warper', desc: 'Log 100 hours of focus', icon: '🌀', tier: 'gold'   },

  // Habit streaks
  { id: 'habit_streak_7',  label: 'Creature of Habit', desc: 'Achieve a 7-day habit streak',  icon: '🔥', tier: 'bronze' },
  { id: 'habit_streak_30', label: 'Iron Will',          desc: 'Achieve a 30-day habit streak', icon: '💪', tier: 'gold'   },

  // Commitments
  { id: 'commitments_7', label: 'Word is Bond', desc: 'Keep 7 commitments in a row', icon: '🤝', tier: 'silver' },

  // Challenges
  { id: 'challenges_5',  label: 'Challenge Accepted', desc: 'Complete 5 challenges',  icon: '⚔️', tier: 'bronze' },
  { id: 'challenges_20', label: 'Champion',            desc: 'Complete 20 challenges', icon: '🏆', tier: 'gold'   },

  // Journal
  { id: 'journal_7',  label: 'Reflective',  desc: 'Write 7 journal entries',  icon: '📝', tier: 'bronze' },
  { id: 'journal_30', label: 'Chronicler',  desc: 'Write 30 journal entries', icon: '📚', tier: 'silver' },
];

const getBestHabitStreak = (habits) => {
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

export const computeAchievementData = (user, habits, xpLog, pomodoroSessions, commitmentArchive, challenges, logs) => ({
  levelReached: user.level,
  taskCount: xpLog.filter(e => e.source === 'task').length,
  lifetimeXp: xpLog.filter(e => e.amount > 0).reduce((s, e) => s + e.amount, 0),
  focusMinutes: pomodoroSessions.filter(s => s.completed).reduce((s, p) => s + Math.floor(p.durationSecs / 60), 0),
  bestHabitStreak: getBestHabitStreak(habits),
  commitmentStreak: getCommitmentStreak(commitmentArchive),
  challengeCount: challenges.filter(c => c.completed).length,
  journalCount: Object.values(logs).filter(e => (e.proud?.some(p => p?.trim())) || (e.emotions?.length > 0)).length,
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
    challenges_5:  data.challengeCount >= 5,
    challenges_20: data.challengeCount >= 20,
    journal_7:  data.journalCount >= 7,
    journal_30: data.journalCount >= 30,
  };
  return checks;
};
