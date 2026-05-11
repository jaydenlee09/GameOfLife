import { useState, useEffect, useRef, useCallback } from 'react'
import './App.css'
import PlayerDashboard from './components/PlayerDashboard'
import Navbar from './components/Navbar'
import TasksPage from './components/TasksPage'
import TimerPage from './components/TimerPage'
import LevelUpModal from './components/LevelUpModal'
import CommitmentModal from './components/CommitmentModal'
import DailyLogPage from './components/DailyLogPage'
import ChallengesPage from './components/ChallengesPage'
import { xpCapForLevel } from './utils/xpUtils'
import { getRankUpAtLevel } from './utils/rankMeta'
import CHALLENGES_POOL from './utils/challengesMeta'
import CalendarPage from './components/CalendarPage'
import MentorAssistant from './components/MentorAssistant'
import { applyMentorAction } from './utils/mentorActions'
import GoalsPage from './components/GoalsPage'
import DataModal from './components/DataModal'
import HealthPage from './components/HealthPage'
import WeeklyReviewPage from './components/WeeklyReviewPage'
import RewardsPage from './components/RewardsPage'
import FocusMode from './components/FocusMode'
import { computeAchievementData, checkAchievements, ACHIEVEMENTS } from './utils/achievementsMeta'

const getLocalDateKey = (offsetDays = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

function App() {
  const [currentPage, setCurrentPage] = useState('statistics');
  const [mentorOpen, setMentorOpen] = useState(false);

  // ─── Core Data ────────────────────────────────────────────────────────────────
  const [todos, setTodos] = useState(() => {
    const saved = localStorage.getItem('gameOfLife_todos');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.length > 0) return parsed;
    }
    return [
      { id: 1, text: 'No phone for the next hour', xp: 20, timeFrame: 'today', category: 'mentalHealth', completed: false, notes: '', subtasks: [] },
      { id: 2, text: 'Sleep before 10pm', xp: 20, timeFrame: 'today', category: 'health', completed: false, notes: '', subtasks: [] },
      { id: 3, text: 'Clean your desk', xp: 20, timeFrame: 'today', category: 'discipline', completed: false, notes: '', subtasks: [] },
    ];
  });

  const [habits, setHabits] = useState(() => {
    const saved = localStorage.getItem('gameOfLife_habits');
    return saved ? JSON.parse(saved) : [];
  });

  const [logs, setLogs] = useState(() => {
    const saved = localStorage.getItem('gameOfLife_logs');
    if (!saved) return {};
    const parsed = JSON.parse(saved);
    for (const key of Object.keys(parsed)) {
      if (parsed[key].videoDataUrl) delete parsed[key].videoDataUrl;
    }
    return parsed;
  });

  const [chatHistory, setChatHistory] = useState(() => {
    const saved = localStorage.getItem('gameOfLife_chatHistory');
    return saved ? JSON.parse(saved) : [];
  });

  const [calendarEvents, setCalendarEvents] = useState(() => {
    const saved = localStorage.getItem('gameOfLife_calendarEvents');
    return saved ? JSON.parse(saved) : [];
  });

  const DEFAULT_QUICK_EVENTS = [
    { id: 't1', title: 'Morning Routine', duration: 30, attributes: ['discipline','health'], xpAmount: 20, recurrence: 'daily', color: '#fbbf24' },
    { id: 't2', title: 'Deep Work', duration: 90, attributes: ['focus','productivity'], xpAmount: 50, recurrence: 'none', color: '#38bdf8' },
    { id: 't3', title: 'Workout', duration: 60, attributes: ['strength','health'], xpAmount: 40, recurrence: 'daily', color: '#f87171' },
  ];

  const [quickEvents, setQuickEvents] = useState(() => {
    const saved = localStorage.getItem('gameOfLife_quickEvents');
    return saved ? JSON.parse(saved) : DEFAULT_QUICK_EVENTS;
  });

  const [calendarDayEvents, setCalendarDayEvents] = useState(() => {
    const saved = localStorage.getItem('gameOfLife_calendarDayEvents');
    return saved ? JSON.parse(saved) : {};
  });

  const [commitmentArchive, setCommitmentArchive] = useState(() => {
    const saved = localStorage.getItem('gameOfLife_commitmentArchive');
    return saved ? JSON.parse(saved) : [];
  });

  const buildDefaultChallenges = () =>
    CHALLENGES_POOL.map(c => ({ ...c, completed: false, started: false, startedAt: null }));

  const [challenges, setChallenges] = useState(() => {
    const saved = localStorage.getItem('gameOfLife_challenges_v2');
    if (saved) {
      const parsed = JSON.parse(saved);
      const savedMap = Object.fromEntries(parsed.map(c => [c.id, c]));
      const merged = CHALLENGES_POOL.map(c => savedMap[c.id] ? { ...c, ...savedMap[c.id] } : { ...c, completed: false, started: false, startedAt: null });
      const userCreated = parsed.filter(c => !CHALLENGES_POOL.find(p => p.id === c.id));
      return [...merged, ...userCreated];
    }
    return buildDefaultChallenges();
  });

  const [goals, setGoals] = useState(() => {
    const saved = localStorage.getItem('gameOfLife_goals_v1');
    return saved ? JSON.parse(saved) : [];
  });

  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('gameOfLife_user');
    return saved ? JSON.parse(saved) : {
      name: 'Player 1',
      level: 1,
      xp: 0,
      stats: { strength: 0, intelligence: 0, charisma: 0, discipline: 0, mentalHealth: 0, health: 0, focus: 0, creativity: 0, productivity: 0 }
    };
  });

  // ─── New Data Slices ───────────────────────────────────────────────────────────
  const [xpLog, setXpLog] = useState(() => {
    const saved = localStorage.getItem('gameOfLife_xpLog');
    return saved ? JSON.parse(saved) : [];
  });

  const [pomodoroSessions, setPomodoroSessions] = useState(() => {
    const saved = localStorage.getItem('gameOfLife_pomodoroSessions');
    return saved ? JSON.parse(saved) : [];
  });

  const [achievements, setAchievements] = useState(() => {
    const saved = localStorage.getItem('gameOfLife_achievements');
    return saved ? JSON.parse(saved) : {};
  });

  const [healthLog, setHealthLog] = useState(() => {
    const saved = localStorage.getItem('gameOfLife_healthLog');
    return saved ? JSON.parse(saved) : {};
  });

  const [weeklyReviews, setWeeklyReviews] = useState(() => {
    const saved = localStorage.getItem('gameOfLife_weeklyReviews');
    return saved ? JSON.parse(saved) : {};
  });

  const [rewards, setRewards] = useState(() => {
    const saved = localStorage.getItem('gameOfLife_rewards');
    return saved ? JSON.parse(saved) : { items: [], redemptions: [] };
  });

  // ─── UI State ──────────────────────────────────────────────────────────────────
  const [levelUpModal, setLevelUpModal] = useState(null);
  const [commitmentModal, setCommitmentModal] = useState(null);
  const [dataModalOpen, setDataModalOpen] = useState(false);
  const [focusModeOpen, setFocusModeOpen] = useState(false);
  const [achievementToast, setAchievementToast] = useState(null);

  // ─── Persistence Effects ───────────────────────────────────────────────────────
  useEffect(() => { localStorage.setItem('gameOfLife_todos', JSON.stringify(todos)); }, [todos]);
  useEffect(() => { localStorage.setItem('gameOfLife_habits', JSON.stringify(habits)); }, [habits]);
  useEffect(() => { localStorage.setItem('gameOfLife_logs', JSON.stringify(logs)); }, [logs]);
  useEffect(() => { localStorage.setItem('gameOfLife_chatHistory', JSON.stringify(chatHistory)); }, [chatHistory]);
  useEffect(() => { localStorage.setItem('gameOfLife_calendarEvents', JSON.stringify(calendarEvents)); }, [calendarEvents]);
  useEffect(() => { localStorage.setItem('gameOfLife_quickEvents', JSON.stringify(quickEvents)); }, [quickEvents]);
  useEffect(() => { localStorage.setItem('gameOfLife_calendarDayEvents', JSON.stringify(calendarDayEvents)); }, [calendarDayEvents]);
  useEffect(() => { localStorage.setItem('gameOfLife_commitmentArchive', JSON.stringify(commitmentArchive)); }, [commitmentArchive]);
  useEffect(() => { localStorage.setItem('gameOfLife_challenges_v2', JSON.stringify(challenges)); }, [challenges]);
  useEffect(() => { localStorage.setItem('gameOfLife_goals_v1', JSON.stringify(goals)); }, [goals]);
  useEffect(() => { localStorage.setItem('gameOfLife_user', JSON.stringify(user)); }, [user]);
  useEffect(() => { localStorage.setItem('gameOfLife_xpLog', JSON.stringify(xpLog)); }, [xpLog]);
  useEffect(() => { localStorage.setItem('gameOfLife_pomodoroSessions', JSON.stringify(pomodoroSessions)); }, [pomodoroSessions]);
  useEffect(() => { localStorage.setItem('gameOfLife_achievements', JSON.stringify(achievements)); }, [achievements]);
  useEffect(() => { localStorage.setItem('gameOfLife_healthLog', JSON.stringify(healthLog)); }, [healthLog]);
  useEffect(() => { localStorage.setItem('gameOfLife_weeklyReviews', JSON.stringify(weeklyReviews)); }, [weeklyReviews]);
  useEffect(() => { localStorage.setItem('gameOfLife_rewards', JSON.stringify(rewards)); }, [rewards]);

  // ─── XP Logging ───────────────────────────────────────────────────────────────
  const logXpEvent = useCallback((stat, amount, source = 'manual', label = '') => {
    const today = getLocalDateKey(0);
    const event = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ts: Date.now(),
      date: today,
      stat,
      amount,
      source,
      label,
    };
    setXpLog(prev => {
      const next = [event, ...prev];
      return next.length > 500 ? next.slice(0, 500) : next;
    });
  }, []);

  // ─── User / XP Functions ───────────────────────────────────────────────────────
  const updateName = (newName) => setUser(prev => ({ ...prev, name: newName }));

  const addXp = useCallback((amount, meta = {}) => {
    logXpEvent('xp', amount, meta.source || 'manual', meta.label || '');
    setUser(prev => {
      let currentXp = prev.xp + amount;
      let currentLevel = prev.level;
      let didLevelUp = false;
      while (currentXp >= xpCapForLevel(currentLevel)) {
        currentXp -= xpCapForLevel(currentLevel);
        currentLevel++;
        didLevelUp = true;
      }
      if (didLevelUp) {
        const rankUp = getRankUpAtLevel(currentLevel);
        setTimeout(() => setLevelUpModal({ newLevel: currentLevel, newRank: rankUp }), 300);
      }
      return { ...prev, level: currentLevel, xp: currentXp };
    });
  }, [logXpEvent]);

  const updateStat = useCallback((statName, amount, meta = {}) => {
    logXpEvent(statName, amount, meta.source || 'manual', meta.label || '');
    setUser(prev => {
      let currentXp = prev.xp + amount;
      let currentLevel = prev.level;
      let didLevelUp = false;
      while (currentXp >= xpCapForLevel(currentLevel)) {
        currentXp -= xpCapForLevel(currentLevel);
        currentLevel++;
        didLevelUp = true;
      }
      while (currentXp < 0 && currentLevel > 1) {
        currentLevel--;
        currentXp += xpCapForLevel(currentLevel);
      }
      if (currentLevel === 1 && currentXp < 0) currentXp = 0;
      if (didLevelUp) {
        const rankUp = getRankUpAtLevel(currentLevel);
        setTimeout(() => setLevelUpModal({ newLevel: currentLevel, newRank: rankUp }), 300);
      }
      return {
        ...prev,
        level: currentLevel,
        xp: currentXp,
        stats: { ...prev.stats, [statName]: (prev.stats[statName] || 0) + amount }
      };
    });
  }, [logXpEvent]);

  // ─── Pomodoro Session Callback ─────────────────────────────────────────────────
  const handleSessionComplete = useCallback((session) => {
    setPomodoroSessions(prev => [session, ...prev].slice(0, 300));
  }, []);

  // ─── Midnight Rollover ─────────────────────────────────────────────────────────
  const todayStr = () => new Date().toISOString().slice(0, 10);

  const promoteTomorrowTasks = (currentTodos) =>
    currentTodos.map(t => t.timeFrame === 'tomorrow' ? { ...t, timeFrame: 'today', xp: 20 } : t);

  useEffect(() => {
    const lastDate = localStorage.getItem('gameOfLife_lastDate');
    const today = todayStr();
    if (lastDate && lastDate !== today) setTodos(prev => promoteTomorrowTasks(prev));
    localStorage.setItem('gameOfLife_lastDate', today);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const midnightTimerRef = useRef(null);
  useEffect(() => {
    const scheduleMidnightRollover = () => {
      const now = new Date();
      const msUntilMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime();
      midnightTimerRef.current = setTimeout(() => {
        setTodos(prev => promoteTomorrowTasks(prev));
        const newToday = todayStr();
        localStorage.setItem('gameOfLife_lastDate', newToday);
        setLogs(currentLogs => {
          const yesterdayKey = getLocalDateKey(-1);
          const yesterdayEntry = currentLogs[yesterdayKey];
          setCommitmentArchive(currentArchive => {
            const alreadyConfirmed = currentArchive.some(a => a.date === yesterdayKey && a.confirmedOn === newToday);
            if (yesterdayEntry?.commitment?.trim() && !alreadyConfirmed) {
              setCommitmentModal({ date: yesterdayKey, commitment: yesterdayEntry.commitment.trim() });
            }
            return currentArchive;
          });
          return currentLogs;
        });
        scheduleMidnightRollover();
      }, msUntilMidnight);
    };
    scheduleMidnightRollover();
    return () => clearTimeout(midnightTimerRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Commitment Handling ───────────────────────────────────────────────────────
  const upsertCommitmentRecord = (date, text) => {
    const trimmedText = (text || '').trim();
    if (!date || !trimmedText) return;
    setCommitmentArchive(prev => {
      const idx = prev.findIndex(e => e.date === date);
      if (idx === -1) return [{ date, text: trimmedText, confirmedOn: null, denied: null }, ...prev];
      const next = [...prev];
      next[idx] = { ...next[idx], date, text: trimmedText };
      return next;
    });
  };

  const resolveCommitmentRecord = (date, text, denied) => {
    const todayKey = getLocalDateKey(0);
    setCommitmentArchive(prev => {
      const idx = prev.findIndex(e => e.date === date);
      if (idx === -1) return [{ date, text, confirmedOn: todayKey, denied }, ...prev];
      const next = [...prev];
      next[idx] = { ...next[idx], date, text: next[idx].text || text, confirmedOn: todayKey, denied };
      return next;
    });
  };

  useEffect(() => {
    const yesterdayKey = getLocalDateKey(-1);
    const todayKey = getLocalDateKey(0);
    const yesterdayEntry = logs[yesterdayKey];
    const alreadyConfirmed = commitmentArchive.some(a => a.date === yesterdayKey && a.confirmedOn === todayKey);
    if (yesterdayEntry?.commitment?.trim() && !alreadyConfirmed) {
      setCommitmentModal({ date: yesterdayKey, commitment: yesterdayEntry.commitment.trim() });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleArchiveCommitmentResolve = (date, text, denied) => {
    if (!date) return;
    if (!denied) addXp(10, { source: 'commitment', label: 'Commitment kept' });
    resolveCommitmentRecord(date, text, denied);
    if (commitmentModal?.date === date) setCommitmentModal(null);
  };

  // ─── Challenge Handlers ────────────────────────────────────────────────────────
  const handleChallengeStart = (challengeId) => {
    setChallenges(prev => prev.map(c => c.id === challengeId ? { ...c, started: true, startedAt: Date.now() } : c));
  };

  const handleChallengeComplete = (challengeId) => {
    const challenge = challenges.find(c => c.id === challengeId);
    if (challenge && !challenge.completed) {
      updateStat(challenge.category, challenge.xp, { source: 'challenge', label: challenge.text });
      setChallenges(prev => prev.map(c => c.id === challengeId ? { ...c, completed: true } : c));
    }
  };

  const handleChallengeAdd = (newChallenge) => {
    setChallenges(prev => [...prev, { ...newChallenge, completed: false, started: false, startedAt: null }]);
  };

  const handleChallengeDelete = (challengeId) => {
    setChallenges(prev => prev.filter(c => c.id !== challengeId));
  };

  // ─── Achievements Detection ────────────────────────────────────────────────────
  useEffect(() => {
    const data = computeAchievementData(user, habits, xpLog, pomodoroSessions, commitmentArchive, challenges, logs);
    const current = checkAchievements(data);
    const newlyUnlocked = [];
    for (const id of Object.keys(current)) {
      if (current[id] && !achievements[id]) {
        newlyUnlocked.push(id);
      }
    }
    if (newlyUnlocked.length > 0) {
      const now = Date.now();
      setAchievements(prev => {
        const next = { ...prev };
        for (const id of newlyUnlocked) next[id] = { unlockedAt: now };
        return next;
      });
      const meta = ACHIEVEMENTS.find(a => a.id === newlyUnlocked[0]);
      if (meta) {
        setAchievementToast(meta);
        setTimeout(() => setAchievementToast(null), 4000);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.level, xpLog.length, pomodoroSessions.length, commitmentArchive.length, challenges]);

  // ─── Keyboard Shortcuts ────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
      if (e.altKey) {
        const pageMap = { '1': 'statistics', '2': 'tasks', '3': 'challenges', '4': 'daily-log', '5': 'timer', '6': 'calendar', '7': 'goals', '8': 'health', '9': 'review' };
        if (pageMap[e.key]) { e.preventDefault(); setCurrentPage(pageMap[e.key]); return; }
        if (e.key === 'm' || e.key === 'M') { e.preventDefault(); setMentorOpen(o => !o); return; }
        if (e.key === 'f' || e.key === 'F') { e.preventDefault(); setFocusModeOpen(true); return; }
        if (e.key === 'r' || e.key === 'R') { e.preventDefault(); setCurrentPage('rewards'); return; }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ─── Mentor Action Handler ─────────────────────────────────────────────────────
  const handleMentorAction = (action) => {
    return applyMentorAction(action, { setTodos, setCalendarEvents, setQuickEvents, setChallenges });
  };

  // ─── Page Renderer ─────────────────────────────────────────────────────────────
  const renderPage = () => {
    switch (currentPage) {
      case 'statistics':
        return (
          <PlayerDashboard
            user={user}
            onUpdateName={updateName}
            todos={todos}
            habits={habits}
            logs={logs}
            onUpdateStat={updateStat}
            onAddXp={addXp}
            setTodos={setTodos}
            setHabits={setHabits}
            challenges={challenges}
            onChallengeStart={handleChallengeStart}
            onChallengeComplete={handleChallengeComplete}
            xpCap={xpCapForLevel(user.level)}
            commitmentArchive={commitmentArchive}
            onResolveCommitment={handleArchiveCommitmentResolve}
            xpLog={xpLog}
            pomodoroSessions={pomodoroSessions}
            achievements={achievements}
            onOpenFocusMode={() => setFocusModeOpen(true)}
          />
        );
      case 'challenges':
        return (
          <ChallengesPage
            challenges={challenges}
            onChallengeStart={handleChallengeStart}
            onChallengeComplete={handleChallengeComplete}
            onChallengeAdd={handleChallengeAdd}
            onChallengeDelete={handleChallengeDelete}
          />
        );
      case 'tasks':
        return (
          <TasksPage
            onUpdateStat={updateStat}
            todos={todos}
            setTodos={setTodos}
            habits={habits}
            setHabits={setHabits}
          />
        );
      case 'daily-log':
        return (
          <DailyLogPage
            logs={logs}
            setLogs={setLogs}
            onCommitmentLocked={({ date, text }) => upsertCommitmentRecord(date, text)}
          />
        );
      case 'timer':
        return (
          <TimerPage
            onUpdateStat={updateStat}
            pomodoroSessions={pomodoroSessions}
            onSessionComplete={handleSessionComplete}
          />
        );
      case 'calendar':
        return (
          <CalendarPage
            calendarEvents={calendarEvents}
            setCalendarEvents={setCalendarEvents}
            calendarDayEvents={calendarDayEvents}
            setCalendarDayEvents={setCalendarDayEvents}
            quickEvents={quickEvents}
            setQuickEvents={setQuickEvents}
            onUpdateStat={updateStat}
          />
        );
      case 'goals':
        return (
          <GoalsPage
            goals={goals}
            setGoals={setGoals}
            todos={todos}
            setTodos={setTodos}
            onUpdateStat={updateStat}
          />
        );
      case 'health':
        return (
          <HealthPage
            healthLog={healthLog}
            setHealthLog={setHealthLog}
            onUpdateStat={updateStat}
          />
        );
      case 'review':
        return (
          <WeeklyReviewPage
            weeklyReviews={weeklyReviews}
            setWeeklyReviews={setWeeklyReviews}
            xpLog={xpLog}
            pomodoroSessions={pomodoroSessions}
            habits={habits}
            todos={todos}
            logs={logs}
            challenges={challenges}
          />
        );
      case 'rewards':
        return (
          <RewardsPage
            rewards={rewards}
            setRewards={setRewards}
            userXp={user.xp + (user.level - 1) * 50}
            onAddXp={addXp}
          />
        );
      default:
        return <PlayerDashboard user={user} onUpdateName={updateName} xpLog={xpLog} pomodoroSessions={pomodoroSessions} habits={habits} todos={todos} logs={logs} commitmentArchive={commitmentArchive} achievements={achievements} />;
    }
  };

  return (
    <div className="app-container">
      <Navbar
        activePage={currentPage}
        onNavigate={setCurrentPage}
        userEmail={user.name}
        userLevel={user.level}
        userXp={user.xp}
        userXpCap={xpCapForLevel(user.level)}
        onOpenDataModal={() => setDataModalOpen(true)}
      />
      <div className="content-container">
        {renderPage()}
      </div>

      <MentorAssistant
        isOpen={mentorOpen}
        onToggle={() => setMentorOpen(o => !o)}
        onClose={() => setMentorOpen(false)}
        user={user}
        todos={todos}
        habits={habits}
        logs={logs}
        challenges={challenges}
        chatHistory={chatHistory}
        setChatHistory={setChatHistory}
        onApplyAction={handleMentorAction}
      />

      {levelUpModal && (
        <LevelUpModal newLevel={levelUpModal.newLevel} newRank={levelUpModal.newRank} onClose={() => setLevelUpModal(null)} />
      )}
      {commitmentModal && (
        <CommitmentModal
          commitment={commitmentModal.commitment}
          date={commitmentModal.date}
          onConfirm={() => setCommitmentModal(null)}
        />
      )}
      {dataModalOpen && (
        <DataModal onClose={() => setDataModalOpen(false)} />
      )}
      {focusModeOpen && (
        <FocusMode
          todos={todos}
          onUpdateStat={updateStat}
          pomodoroSessions={pomodoroSessions}
          onSessionComplete={handleSessionComplete}
          onClose={() => setFocusModeOpen(false)}
        />
      )}
      {achievementToast && (
        <div className="achievement-toast">
          <span className="achievement-toast-icon">{achievementToast.icon}</span>
          <div className="achievement-toast-body">
            <span className="achievement-toast-title">Achievement Unlocked!</span>
            <span className="achievement-toast-label">{achievementToast.label} — {achievementToast.desc}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default App
