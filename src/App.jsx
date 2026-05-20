import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import './App.css'
import { useAuth } from './context/AuthContext'
import { loadAllUserData, saveDataKey, flushPendingWrites, migrateLocalStorageToFirestore } from './services/firestoreService'
import PlayerDashboard from './components/PlayerDashboard'
import Navbar, { StatIcon, TaskIcon, TimerIcon, LogIcon, TargetIcon } from './components/Navbar'
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

const getCurrentMondayKey = () => {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

function App() {
  const { firebaseUser, signOut } = useAuth();
  const cloudSyncEnabled = useRef(false);
  const [cloudSyncReady, setCloudSyncReady] = useState(false);

  const [currentPage, setCurrentPage] = useState('statistics');
  const [mentorOpen, setMentorOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleNavigate = (page) => {
    setCurrentPage(page);
    setMobileMenuOpen(false);
  };

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

  const [priorityPopupDismissed, setPriorityPopupDismissed] = useState(false);
  const [priorityPopupMinimized, setPriorityPopupMinimized] = useState(false);

  const currentWeekPriority = useMemo(() => {
    const mondayKey = getCurrentMondayKey();
    return weeklyReviews[mondayKey]?.priority?.trim() || null;
  }, [weeklyReviews]);

  // ─── Nearest Upcoming Event ────────────────────────────────────────────────────
  const nearestEvent = useMemo(() => {
    const now = new Date();
    const todayKey = getLocalDateKey(0);
    const candidates = [];

    for (const [dateKey, evts] of Object.entries(calendarDayEvents)) {
      if (dateKey < todayKey) continue;
      for (const ev of evts) {
        const t = ev.time
          ? new Date(`${dateKey}T${ev.time}:00`)
          : new Date(`${dateKey}T23:59:00`);
        if (t > now) {
          candidates.push({ ...ev, date: dateKey, _ts: t.getTime(), _kind: 'day' });
        }
      }
    }

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => a._ts - b._ts);
    return candidates[0];
  }, [calendarDayEvents]);

  const [eventPopupDismissed, setEventPopupDismissed] = useState(false);
  const prevNearestRef = useRef(null);
  useEffect(() => {
    const id = nearestEvent?._ts ?? null;
    if (id !== prevNearestRef.current) {
      setEventPopupDismissed(false);
      prevNearestRef.current = id;
    }
  }, [nearestEvent]);

  const [eventCountdown, setEventCountdown] = useState('');
  useEffect(() => {
    const calc = () => {
      if (!nearestEvent) return setEventCountdown('');
      const diff = nearestEvent._ts - Date.now();
      if (diff <= 0) return setEventCountdown('now');
      const totalMins = Math.floor(diff / 60000);
      const days = Math.floor(totalMins / 1440);
      const hrs = Math.floor((totalMins % 1440) / 60);
      const mins = totalMins % 60;
      if (days >= 1) setEventCountdown(`in ${days}d ${hrs}h`);
      else if (hrs >= 1) setEventCountdown(`in ${hrs}h ${mins}m`);
      else setEventCountdown(`in ${mins}m`);
    };
    calc();
    const id = setInterval(calc, 60000);
    return () => clearInterval(id);
  }, [nearestEvent]);

  const formatEventPopupDate = (ev) => {
    if (!ev?.date) return '';
    const todayKey = getLocalDateKey(0);
    const tomorrowKey = getLocalDateKey(1);
    if (ev.date === todayKey) return 'Today';
    if (ev.date === tomorrowKey) return 'Tomorrow';
    const d = new Date(`${ev.date}T12:00:00`);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const formatEventPopupTime = (ev) => {
    if (!ev) return '';
    if (ev._kind === 'day') {
      if (!ev.time) return 'All day';
      const [h, m] = ev.time.split(':').map(Number);
      const ampm = h >= 12 ? 'PM' : 'AM';
      return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${ampm}`;
    }
    const h = ev.startHour ?? 0;
    const m = ev.startMin ?? 0;
    const ampm = h >= 12 ? 'PM' : 'AM';
    return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${ampm}`;
  };

  // ─── UI State ──────────────────────────────────────────────────────────────────
  const [levelUpModal, setLevelUpModal] = useState(null);
  const [commitmentModal, setCommitmentModal] = useState(null);
  const [dataModalOpen, setDataModalOpen] = useState(false);
  const [focusModeOpen, setFocusModeOpen] = useState(false);
  const [achievementToast, setAchievementToast] = useState(null);

  // ─── Persistence Effects ───────────────────────────────────────────────────────
  const persist = (key, value) => {
    localStorage.setItem(key, JSON.stringify(value));
    if (cloudSyncEnabled.current && firebaseUser) saveDataKey(firebaseUser.uid, key, value);
  };

  useEffect(() => { persist('gameOfLife_todos', todos); }, [todos]);
  useEffect(() => { persist('gameOfLife_habits', habits); }, [habits]);
  useEffect(() => { persist('gameOfLife_logs', logs); }, [logs]);
  useEffect(() => { persist('gameOfLife_chatHistory', chatHistory); }, [chatHistory]);
  useEffect(() => { persist('gameOfLife_calendarEvents', calendarEvents); }, [calendarEvents]);
  useEffect(() => { persist('gameOfLife_quickEvents', quickEvents); }, [quickEvents]);
  useEffect(() => { persist('gameOfLife_calendarDayEvents', calendarDayEvents); }, [calendarDayEvents]);
  useEffect(() => { persist('gameOfLife_commitmentArchive', commitmentArchive); }, [commitmentArchive]);
  useEffect(() => { persist('gameOfLife_challenges_v2', challenges); }, [challenges]);
  useEffect(() => { persist('gameOfLife_goals_v1', goals); }, [goals]);
  useEffect(() => { persist('gameOfLife_user', user); }, [user]);
  useEffect(() => { persist('gameOfLife_xpLog', xpLog); }, [xpLog]);
  useEffect(() => { persist('gameOfLife_pomodoroSessions', pomodoroSessions); }, [pomodoroSessions]);
  useEffect(() => { persist('gameOfLife_achievements', achievements); }, [achievements]);
  useEffect(() => { persist('gameOfLife_healthLog', healthLog); }, [healthLog]);
  useEffect(() => { persist('gameOfLife_weeklyReviews', weeklyReviews); }, [weeklyReviews]);
  useEffect(() => { persist('gameOfLife_rewards', rewards); }, [rewards]);

  // Enable cloud sync only after persist effects for the Firestore load have run.
  // Using state + useEffect guarantees this effect runs AFTER all the persist
  // effects above in the same React commit, so stale local state can never race
  // past the guard and overwrite Firestore.
  useEffect(() => {
    if (cloudSyncReady) cloudSyncEnabled.current = true;
  }, [cloudSyncReady]);

  // ─── Firestore Load & Migration ────────────────────────────────────────────────
  useEffect(() => {
    if (!firebaseUser) return;
    cloudSyncEnabled.current = false;
    setCloudSyncReady(false);

    loadAllUserData(firebaseUser.uid).then(data => {
      if (data) {
        if (data.gameOfLife_todos) setTodos(data.gameOfLife_todos);
        if (data.gameOfLife_habits) setHabits(data.gameOfLife_habits);
        if (data.gameOfLife_logs) setLogs(data.gameOfLife_logs);
        if (data.gameOfLife_chatHistory) setChatHistory(data.gameOfLife_chatHistory);
        if (data.gameOfLife_calendarEvents) setCalendarEvents(data.gameOfLife_calendarEvents);
        if (data.gameOfLife_quickEvents) setQuickEvents(data.gameOfLife_quickEvents);
        if (data.gameOfLife_calendarDayEvents) setCalendarDayEvents(data.gameOfLife_calendarDayEvents);
        if (data.gameOfLife_commitmentArchive) setCommitmentArchive(data.gameOfLife_commitmentArchive);
        if (data.gameOfLife_challenges_v2) setChallenges(data.gameOfLife_challenges_v2);
        if (data.gameOfLife_goals_v1) setGoals(data.gameOfLife_goals_v1);
        if (data.gameOfLife_user) setUser(data.gameOfLife_user);
        if (data.gameOfLife_xpLog) setXpLog(data.gameOfLife_xpLog);
        if (data.gameOfLife_pomodoroSessions) setPomodoroSessions(data.gameOfLife_pomodoroSessions);
        if (data.gameOfLife_achievements) setAchievements(data.gameOfLife_achievements);
        if (data.gameOfLife_healthLog) setHealthLog(data.gameOfLife_healthLog);
        if (data.gameOfLife_weeklyReviews) setWeeklyReviews(data.gameOfLife_weeklyReviews);
        if (data.gameOfLife_rewards) setRewards(data.gameOfLife_rewards);
      } else {
        // First login — migrate whatever exists in localStorage to the cloud
        migrateLocalStorageToFirestore(firebaseUser.uid, {
          gameOfLife_todos: todos,
          gameOfLife_habits: habits,
          gameOfLife_logs: logs,
          gameOfLife_chatHistory: chatHistory,
          gameOfLife_calendarEvents: calendarEvents,
          gameOfLife_quickEvents: quickEvents,
          gameOfLife_calendarDayEvents: calendarDayEvents,
          gameOfLife_commitmentArchive: commitmentArchive,
          gameOfLife_challenges_v2: challenges,
          gameOfLife_goals_v1: goals,
          gameOfLife_user: user,
          gameOfLife_xpLog: xpLog,
          gameOfLife_pomodoroSessions: pomodoroSessions,
          gameOfLife_achievements: achievements,
          gameOfLife_healthLog: healthLog,
          gameOfLife_weeklyReviews: weeklyReviews,
          gameOfLife_rewards: rewards,
        }).catch(console.error);
      }
      // Signal that Firestore data is ready. The cloudSyncReady useEffect above
      // will set cloudSyncEnabled=true in the same commit cycle as the persist
      // effects for this load, ensuring no stale state can be written first.
      setCloudSyncReady(true);
    }).catch(err => {
      console.error('Failed to load from Firestore, using local data', err);
      setCloudSyncReady(true);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser]);

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

  // ─── Flush pending Firestore writes before page unload ────────────────────────
  useEffect(() => {
    window.addEventListener('beforeunload', flushPendingWrites);
    return () => window.removeEventListener('beforeunload', flushPendingWrites);
  }, []);

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
            todos={todos}
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
        onNavigate={handleNavigate}
        userEmail={user.name}
        userLevel={user.level}
        userXp={user.xp}
        userXpCap={xpCapForLevel(user.level)}
        onOpenDataModal={() => setDataModalOpen(true)}
        isMobileMenuOpen={mobileMenuOpen}
        onMobileMenuClose={() => setMobileMenuOpen(false)}
        firebaseUser={firebaseUser}
        onSignOut={signOut}
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

      {nearestEvent && !eventPopupDismissed && (
        <div className="event-popup">
          <button className="event-popup-close" onClick={() => setEventPopupDismissed(true)}>✕</button>
          <div className="event-popup-label">NEXT EVENT</div>
          <div className="event-popup-title">{nearestEvent.title}</div>
          <div className="event-popup-meta">
            <span>{formatEventPopupDate(nearestEvent)}</span>
            <span className="event-popup-dot">·</span>
            <span>{formatEventPopupTime(nearestEvent)}</span>
          </div>
          <div className="event-popup-countdown">{eventCountdown}</div>
        </div>
      )}

      {currentWeekPriority && !priorityPopupDismissed && (
        priorityPopupMinimized ? (
          <button className="priority-popup-mini" onClick={() => setPriorityPopupMinimized(false)}>
            🎯 <span>PRIORITY</span>
          </button>
        ) : (
          <div className="priority-popup">
            <div className="priority-popup-actions">
              <button className="priority-popup-action-btn" onClick={() => setPriorityPopupMinimized(true)} title="Minimize">▾</button>
              <button className="priority-popup-action-btn" onClick={() => setPriorityPopupDismissed(true)} title="Dismiss">✕</button>
            </div>
            <div className="priority-popup-label">🎯 THIS WEEK'S PRIORITY</div>
            <div className="priority-popup-text">{currentWeekPriority}</div>
          </div>
        )
      )}

      {/* Mobile bottom navigation bar */}
      <nav className="bottom-nav">
        {[
          { id: 'statistics', label: 'Stats',   icon: <StatIcon /> },
          { id: 'tasks',      label: 'Tasks',   icon: <TaskIcon /> },
          { id: 'timer',      label: 'Timer',   icon: <TimerIcon /> },
          { id: 'daily-log',  label: 'Log',     icon: <LogIcon /> },
          { id: 'goals',      label: 'Goals',   icon: <TargetIcon /> },
        ].map(({ id, label, icon }) => (
          <button
            key={id}
            className={`bottom-nav-item${currentPage === id ? ' active' : ''}`}
            onClick={() => handleNavigate(id)}
          >
            <span className="bottom-nav-icon">{icon}</span>
            <span className="bottom-nav-label">{label}</span>
          </button>
        ))}
        <button
          className={`bottom-nav-item${mobileMenuOpen ? ' active' : ''}`}
          onClick={() => setMobileMenuOpen(o => !o)}
        >
          <span className="bottom-nav-icon">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="3" cy="8" r="1.5" fill="currentColor"/>
              <circle cx="8" cy="8" r="1.5" fill="currentColor"/>
              <circle cx="13" cy="8" r="1.5" fill="currentColor"/>
            </svg>
          </span>
          <span className="bottom-nav-label">More</span>
        </button>
      </nav>
    </div>
  );
}

export default App
