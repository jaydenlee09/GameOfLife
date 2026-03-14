import { useState, useEffect, useRef } from 'react'
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

function App() {
  const [currentPage, setCurrentPage] = useState('statistics');
  const [mentorOpen, setMentorOpen] = useState(false);

  // Lifted State for Tasks & Habits
  const [todos, setTodos] = useState(() => {
    const savedTodos = localStorage.getItem('gameOfLife_todos');
    if (savedTodos) {
      const parsed = JSON.parse(savedTodos);
      // Only return parsed if it has items, otherwise use defaults for new users/empty state
      if (parsed.length > 0) return parsed;
    }
    // Default quests if no saved todos or empty list
    return [
      { id: 1, text: 'No phone for the next hour', xp: 20, timeFrame: 'today', category: 'mentalHealth', completed: false, notes: '', subtasks: [] },
      { id: 2, text: 'Sleep before 10pm', xp: 20, timeFrame: 'today', category: 'health', completed: false, notes: '', subtasks: [] },
      { id: 3, text: 'Clean your desk', xp: 20, timeFrame: 'today', category: 'discipline', completed: false, notes: '', subtasks: [] },
    ];
  });

  const [habits, setHabits] = useState(() => {
    const savedHabits = localStorage.getItem('gameOfLife_habits');
    return savedHabits ? JSON.parse(savedHabits) : [];
  });

  useEffect(() => {
    localStorage.setItem('gameOfLife_todos', JSON.stringify(todos));
  }, [todos]);

  // ─── Midnight rollover: promote "tomorrow" tasks to "today" ───────────────
  const todayStr = () => new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"

  const promoteTomorrowTasks = (currentTodos) =>
    currentTodos.map(t =>
      t.timeFrame === 'tomorrow'
        ? { ...t, timeFrame: 'today', xp: 20 }
        : t
    );

  // On mount: check if the date has changed since last visit
  useEffect(() => {
    const lastDate = localStorage.getItem('gameOfLife_lastDate');
    const today = todayStr();
    if (lastDate && lastDate !== today) {
      setTodos(prev => promoteTomorrowTasks(prev));
    }
    localStorage.setItem('gameOfLife_lastDate', today);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // While the app is open: schedule a timeout that fires exactly at midnight
  const midnightTimerRef = useRef(null);
  useEffect(() => {
    const scheduleMidnightRollover = () => {
      const now = new Date();
      const msUntilMidnight =
        new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime();

      midnightTimerRef.current = setTimeout(() => {
        setTodos(prev => promoteTomorrowTasks(prev));
        const newToday = todayStr();
        localStorage.setItem('gameOfLife_lastDate', newToday);

        // Show commitment modal for yesterday's commitment at midnight
        setLogs(currentLogs => {
          const yesterdayKey = (() => {
            const d = new Date();
            d.setDate(d.getDate() - 1);
            return d.toISOString().slice(0, 10);
          })();
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

        scheduleMidnightRollover(); // reschedule for the next midnight
      }, msUntilMidnight);
    };

    scheduleMidnightRollover();
    return () => clearTimeout(midnightTimerRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // ──────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    localStorage.setItem('gameOfLife_habits', JSON.stringify(habits));
  }, [habits]);

  const [logs, setLogs] = useState(() => {
    const savedLogs = localStorage.getItem('gameOfLife_logs');
    if (!savedLogs) return {};
    const parsed = JSON.parse(savedLogs);
    // Migrate: remove any stale blob:// URLs stored from before the IndexedDB fix.
    // The actual video binary lives in IndexedDB; only videoName is needed here.
    for (const key of Object.keys(parsed)) {
      const entry = parsed[key];
      if (entry.videoDataUrl) {
        delete entry.videoDataUrl;
      }
    }
    return parsed;
  });

  useEffect(() => {
    localStorage.setItem('gameOfLife_logs', JSON.stringify(logs));
  }, [logs]);

  const [chatHistory, setChatHistory] = useState(() => {
    const saved = localStorage.getItem('gameOfLife_chatHistory');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('gameOfLife_chatHistory', JSON.stringify(chatHistory));
  }, [chatHistory]);

  // ─── Calendar Events ──────────────────────────────────────────────────────────
  const [calendarEvents, setCalendarEvents] = useState(() => {
    const saved = localStorage.getItem('gameOfLife_calendarEvents');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('gameOfLife_calendarEvents', JSON.stringify(calendarEvents));
  }, [calendarEvents]);

  const DEFAULT_QUICK_EVENTS = [
    { id: 't1', title: 'Morning Routine', duration: 30, attributes: ['discipline','health'], xpAmount: 20, recurrence: 'daily', color: '#fbbf24' },
    { id: 't2', title: 'Deep Work', duration: 90, attributes: ['focus','productivity'], xpAmount: 50, recurrence: 'none', color: '#38bdf8' },
    { id: 't3', title: 'Workout', duration: 60, attributes: ['strength','health'], xpAmount: 40, recurrence: 'daily', color: '#f87171' },
  ];

  const [quickEvents, setQuickEvents] = useState(() => {
    const saved = localStorage.getItem('gameOfLife_quickEvents');
    return saved ? JSON.parse(saved) : DEFAULT_QUICK_EVENTS;
  });

  useEffect(() => {
    localStorage.setItem('gameOfLife_quickEvents', JSON.stringify(quickEvents));
  }, [quickEvents]);
  // ─────────────────────────────────────────────────────────────────────────────

  // ─── Commitment Archive ───────────────────────────────────────────────────
  const [commitmentArchive, setCommitmentArchive] = useState(() => {
    const saved = localStorage.getItem('gameOfLife_commitmentArchive');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('gameOfLife_commitmentArchive', JSON.stringify(commitmentArchive));
  }, [commitmentArchive]);

  // Helper: local-time YYYY-MM-DD for a given day offset
  const getLocalDateKey = (offsetDays = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const [commitmentModal, setCommitmentModal] = useState(null); // { date, commitment }

  const upsertCommitmentRecord = (date, text) => {
    const trimmedText = (text || '').trim();
    if (!date || !trimmedText) return;
    setCommitmentArchive(prev => {
      const existingIndex = prev.findIndex(entry => entry.date === date);
      if (existingIndex === -1) {
        return [{ date, text: trimmedText, confirmedOn: null, denied: null }, ...prev];
      }
      const next = [...prev];
      next[existingIndex] = {
        ...next[existingIndex],
        date,
        text: trimmedText,
      };
      return next;
    });
  };

  const resolveCommitmentRecord = (date, text, denied) => {
    const todayKey = getLocalDateKey(0);
    setCommitmentArchive(prev => {
      const existingIndex = prev.findIndex(entry => entry.date === date);
      if (existingIndex === -1) {
        return [{ date, text, confirmedOn: todayKey, denied }, ...prev];
      }
      const next = [...prev];
      next[existingIndex] = {
        ...next[existingIndex],
        date,
        text: next[existingIndex].text || text,
        confirmedOn: todayKey,
        denied,
      };
      return next;
    });
  };

  // On mount: show commitment modal if yesterday had a commitment not yet confirmed today
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
    if (!denied) addXp(10);
    resolveCommitmentRecord(date, text, denied);
    if (commitmentModal?.date === date) {
      setCommitmentModal(null);
    }
  };
  // ─────────────────────────────────────────────────────────────────────────
  const buildDefaultChallenges = () =>
    CHALLENGES_POOL.map(c => ({ ...c, completed: false, started: false, startedAt: null }));

  const [challenges, setChallenges] = useState(() => {
    const saved = localStorage.getItem('gameOfLife_challenges_v2');
    if (saved) {
      const parsed = JSON.parse(saved);
      // Merge saved state with pool so new pool additions appear automatically
      const savedMap = Object.fromEntries(parsed.map(c => [c.id, c]));
      const merged = CHALLENGES_POOL.map(c => savedMap[c.id] ? { ...c, ...savedMap[c.id] } : { ...c, completed: false, started: false, startedAt: null });
      // Append any user-created challenges that are not in the pool
      const userCreated = parsed.filter(c => !CHALLENGES_POOL.find(p => p.id === c.id));
      return [...merged, ...userCreated];
    }
    return buildDefaultChallenges();
  });

  useEffect(() => {
    localStorage.setItem('gameOfLife_challenges_v2', JSON.stringify(challenges));
  }, [challenges]);

  const handleChallengeStart = (challengeId) => {
    setChallenges(prev => prev.map(c =>
      c.id === challengeId ? { ...c, started: true, startedAt: Date.now() } : c
    ));
  };

  const handleChallengeComplete = (challengeId) => {
    const challenge = challenges.find(c => c.id === challengeId);
    if (challenge && !challenge.completed) {
      updateStat(challenge.category, challenge.xp);
      setChallenges(prev => prev.map(c =>
        c.id === challengeId ? { ...c, completed: true } : c
      ));
    }
  };

  const handleChallengeAdd = (newChallenge) => {
    setChallenges(prev => [...prev, { ...newChallenge, completed: false, started: false, startedAt: null }]);
  };

  const handleChallengeDelete = (challengeId) => {
    setChallenges(prev => prev.filter(c => c.id !== challengeId));
  };

  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('gameOfLife_user');
    return savedUser ? JSON.parse(savedUser) : {
      name: 'Player 1',
      level: 1,
      xp: 0,
      stats: {
        strength: 0,
        intelligence: 0,
        charisma: 0,
        discipline: 0,
        mentalHealth: 0,
        health: 0,
        focus: 0,
        creativity: 0,
        productivity: 0
      }
    };
  });

  useEffect(() => {
    localStorage.setItem('gameOfLife_user', JSON.stringify(user));
  }, [user]);

  const [levelUpModal, setLevelUpModal] = useState(null); // { newLevel }

  const updateName = (newName) => {
    setUser(prev => ({ ...prev, name: newName }));
  };

  const addXp = (amount) => {
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
  };

  const updateStat = (statName, amount) => {
    setUser(prev => {
      let currentXp = prev.xp + amount;
      let currentLevel = prev.level;
      let didLevelUp = false;

      // Level up: consume XP using the cap for each level
      while (currentXp >= xpCapForLevel(currentLevel)) {
        currentXp -= xpCapForLevel(currentLevel);
        currentLevel++;
        didLevelUp = true;
      }

      // Level down: if XP goes negative (habit uncheck etc.)
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
        stats: {
          ...prev.stats,
          [statName]: (prev.stats[statName] || 0) + amount
        }
      };
    });
  };

  const renderPage = () => {
    switch(currentPage) {
      case 'statistics':
        return (
          <PlayerDashboard
            user={user}
            onUpdateName={updateName}
            todos={todos}
            habits={habits}
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
            onAddXp={addXp} 
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
            onCommitmentLocked={({ date, text }) => {
              upsertCommitmentRecord(date, text);
            }}
          />
        );
      case 'timer':
        return <TimerPage onUpdateStat={updateStat} />;
      case 'calendar':
        return (
          <CalendarPage
            calendarEvents={calendarEvents}
            setCalendarEvents={setCalendarEvents}
            quickEvents={quickEvents}
            setQuickEvents={setQuickEvents}
            onUpdateStat={updateStat}
          />
        );
      default:
        return <PlayerDashboard user={user} onUpdateName={updateName} />;
    }
  };

  const handleMentorAction = (action) => {
    return applyMentorAction(action, {
      setTodos,
      setCalendarEvents,
      setQuickEvents,
      setChallenges,
    });
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
      />
      <div className="content-container">
        {renderPage()}
      </div>
      <MentorAssistant
        isOpen={mentorOpen}
        onToggle={() => setMentorOpen(open => !open)}
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
    </div>
  )
}

export default App


