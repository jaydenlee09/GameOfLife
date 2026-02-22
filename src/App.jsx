import { useState, useEffect } from 'react'
import './App.css'
import PlayerDashboard from './components/PlayerDashboard'
import Navbar from './components/Navbar'
import TasksPage from './components/TasksPage'
import TimerPage from './components/TimerPage'
import LevelUpModal from './components/LevelUpModal'
import DailyLogPage from './components/DailyLogPage'
import { xpCapForLevel } from './utils/xpUtils'
import CHALLENGES_POOL from './utils/challengesMeta'

function App() {
  const [currentPage, setCurrentPage] = useState('statistics');

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

  useEffect(() => {
    localStorage.setItem('gameOfLife_habits', JSON.stringify(habits));
  }, [habits]);

  const [logs, setLogs] = useState(() => {
    const savedLogs = localStorage.getItem('gameOfLife_logs');
    return savedLogs ? JSON.parse(savedLogs) : {};
  });

  useEffect(() => {
    localStorage.setItem('gameOfLife_logs', JSON.stringify(logs));
  }, [logs]);

  // Helper: get the Monday date string for the current week
  const getWeekKey = () => {
    const now = new Date();
    const day = now.getDay(); // 0 Sun, 1 Mon...
    const diff = now.getDate() - ((day + 6) % 7); // shift to Monday
    const monday = new Date(now.setDate(diff));
    return monday.toDateString();
  };

  // Seeded shuffle using week key so the same 3 show all week
  const pickWeeklyChallenges = (weekKey) => {
    // Simple deterministic seed from weekKey string
    let seed = weekKey.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const seededRand = () => {
      seed = (seed * 1664525 + 1013904223) & 0xffffffff;
      return Math.abs(seed) / 0xffffffff;
    };
    const pool = [...CHALLENGES_POOL];
    // Fisher-Yates with seeded random
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(seededRand() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, 3).map(c => ({ ...c, completed: false, started: false }));
  };

  const [challenges, setChallenges] = useState(() => {
    const saved = localStorage.getItem('gameOfLife_challenges');
    const weekKey = getWeekKey();
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.weekKey === weekKey) {
        return parsed.selections;
      }
    }
    // New week — pick 3 fresh challenges
    return pickWeeklyChallenges(weekKey);
  });

  useEffect(() => {
    localStorage.setItem('gameOfLife_challenges', JSON.stringify({
      weekKey: getWeekKey(),
      selections: challenges,
    }));
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

  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('gameOfLife_user');
    return savedUser ? JSON.parse(savedUser) : {
      name: 'Player 1',
      level: 1,
      xp: 0,
      equippedOutfit: { head: null, top: null, bottom: null, accessory: null },
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

  const updateOutfit = (slot, itemId) => {
    setUser(prev => ({
      ...prev,
      equippedOutfit: {
        ...(prev.equippedOutfit || {}),
        [slot]: prev.equippedOutfit?.[slot] === itemId ? null : itemId,
      },
    }));
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
        setTimeout(() => setLevelUpModal({ newLevel: currentLevel }), 300);
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
        setTimeout(() => setLevelUpModal({ newLevel: currentLevel }), 300);
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
            equippedOutfit={user.equippedOutfit || {}}
            onUpdateOutfit={updateOutfit}
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
        return <DailyLogPage logs={logs} setLogs={setLogs} />;
      case 'timer':
        return <TimerPage onUpdateStat={updateStat} />;
      default:
        return <PlayerDashboard user={user} onUpdateName={updateName} />;
    }
  };

  return (
    <div className="app-container">
      <Navbar activePage={currentPage} onNavigate={setCurrentPage} userEmail={user.name} userLevel={user.level} userXp={user.xp} userXpCap={xpCapForLevel(user.level)} />
      <div className="content-container">
        {renderPage()}
      </div>
      {levelUpModal && (
        <LevelUpModal newLevel={levelUpModal.newLevel} onClose={() => setLevelUpModal(null)} />
      )}
    </div>
  )
}

export default App


