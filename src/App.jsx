import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import './App.css'
import { useAuth } from './context/AuthContext'
import { loadAllUserData, saveDataKey, flushPendingWrites, migrateLocalStorageToFirestore, subscribeToUserData } from './services/firestoreService'
import PlayerDashboard from './components/PlayerDashboard'
import WelcomePage from './components/WelcomePage'
import Navbar, { StatIcon, TaskIcon, LogIcon, TargetIcon, CalIcon } from './components/Navbar'
import { CalendarDays, X, ChevronDown, Target, PartyPopper } from 'lucide-react'
import TasksPage from './components/TasksPage'
import TimerPage from './components/TimerPage'
import LevelUpModal from './components/LevelUpModal'
import DailyLogPage from './components/DailyLogPage'
import { xpCapForLevel } from './utils/xpUtils'
import RANK_TIERS from './utils/rankMeta'
import { computeRankStatus } from './utils/scoreUtils'
import RankChangeModal from './components/RankChangeModal'
import { calcStreakXp, getHabitAttrs } from './utils/habitUtils'
import CalendarPage from './components/CalendarPage'
import AssistantDrawer from './components/AssistantDrawer'
import FloatingAIBar from './components/FloatingAIBar'
import { applyAssistantAction } from './utils/assistantActions'
import GoalsPage from './components/GoalsPage'
import DataModal from './components/DataModal'
import WeeklyReviewPage from './components/WeeklyReviewPage'
import ShopPage from './components/ShopPage'
import BrainDumpPage from './components/BrainDumpPage'
import FocusMode from './components/FocusMode'
import { computeAchievementData, checkAchievements, ACHIEVEMENTS } from './utils/achievementsMeta'
import { normalizeGoal } from './utils/goalUtils'

const getLocalDateKey = (offsetDays = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

const getMondayKey = (offsetWeeks = 0) => {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day) + offsetWeeks * 7);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

function App() {
  const { firebaseUser, signOut } = useAuth();
  const cloudSyncEnabled = useRef(false);
  const [cloudSyncReady, setCloudSyncReady] = useState(false);
  // Keys edited locally during the current Firestore load (between login and
  // that one fetch resolving), so the load can't clobber an edit the user
  // just made. Cleared as soon as that load finishes deciding — see the
  // Firestore Load effect below.
  const touchedSinceLoadStart = useRef(new Set());

  const [currentPage, setCurrentPage] = useState('welcome');
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantDraft, setAssistantDraft] = useState(null);
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

  const [noPhoneBlocks, setNoPhoneBlocks] = useState(() => {
    const saved = localStorage.getItem('gameOfLife_noPhoneBlocks');
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


  const [goals, setGoals] = useState(() => {
    const saved = localStorage.getItem('gameOfLife_goals_v1');
    return saved ? JSON.parse(saved).map(normalizeGoal) : [];
  });

  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('gameOfLife_user');
    const base = saved ? JSON.parse(saved) : {
      name: 'Player 1',
      level: 1,
      xp: 0,
      stats: { strength: 0, intelligence: 0, charisma: 0, discipline: 0, mentalHealth: 0, health: 0, focus: 0, creativity: 0, productivity: 0 }
    };
    // Backfill monotonic lifetime counters from the (possibly truncated) xpLog once.
    // After this they only ever grow, so they no longer decay as the 500-entry log rotates.
    if (base.lifetimeXp === undefined || base.lifetimeTaskCount === undefined) {
      const xpLogSaved = localStorage.getItem('gameOfLife_xpLog');
      const log = xpLogSaved ? JSON.parse(xpLogSaved) : [];
      if (base.lifetimeXp === undefined) {
        base.lifetimeXp = log.filter(e => e.amount > 0).reduce((s, e) => s + e.amount, 0);
      }
      if (base.lifetimeTaskCount === undefined) {
        base.lifetimeTaskCount = log.filter(e => e.source === 'task').length;
      }
    }
    return base;
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

  const [foodLog, setFoodLog] = useState(() => {
    const saved = localStorage.getItem('gameOfLife_foodLog');
    return saved ? JSON.parse(saved) : {};
  });

  const [foodPoints, setFoodPoints] = useState(() => {
    const saved = localStorage.getItem('gameOfLife_foodPoints');
    return saved ? JSON.parse(saved) : { balance: 0 };
  });

  const [weeklyReviews, setWeeklyReviews] = useState(() => {
    const saved = localStorage.getItem('gameOfLife_weeklyReviews');
    return saved ? JSON.parse(saved) : {};
  });

  const [shop, setShop] = useState(() => {
    const saved = localStorage.getItem('gameOfLife_shop');
    return saved ? JSON.parse(saved) : { items: [] };
  });

  const [brainDumpNotes, setBrainDumpNotes] = useState(() => {
    const saved = localStorage.getItem('gameOfLife_brainDump');
    return saved ? JSON.parse(saved) : [];
  });

  const [brainDumpConnections, setBrainDumpConnections] = useState(() => {
    const saved = localStorage.getItem('gameOfLife_brainDumpConnections');
    return saved ? JSON.parse(saved) : [];
  });

  const [priorityPopupDismissed, setPriorityPopupDismissed] = useState(false);
  const [priorityPopupMinimized, setPriorityPopupMinimized] = useState(false);

  const currentWeekPriority = useMemo(() => {
    const lastWeekKey = getMondayKey(-1);
    return weeklyReviews[lastWeekKey]?.priority?.trim() || null;
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
  const [eventPopupMinimized, setEventPopupMinimized] = useState(false);
  const prevNearestRef = useRef(null);
  useEffect(() => {
    const id = nearestEvent?._ts ?? null;
    if (id !== prevNearestRef.current) {
      setEventPopupDismissed(false);
      setEventPopupMinimized(false);
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
  const [rankChangeModal, setRankChangeModal] = useState(null);
  const [dataModalOpen, setDataModalOpen] = useState(false);
  const [focusModeOpen, setFocusModeOpen] = useState(false);
  const [achievementToast, setAchievementToast] = useState(null);
  const [commitmentToast, setCommitmentToast] = useState(false);

  // ─── Rank ──────────────────────────────────────────────────────────────────────
  // Rank is a "maintain" system: it holds a tier only while the Daily Score keeps
  // clearing that tier's threshold for enough consecutive days, so it can rise AND
  // fall. Computed once here and passed down (rather than letting PlayerDashboard/
  // Navbar recompute it independently) so the transition-detection effect below and
  // every display of it can never silently drift apart.
  const rankStatus = useMemo(
    () => computeRankStatus(habits, xpLog, logs, commitmentArchive, healthLog),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [habits.length, xpLog.length, Object.keys(logs).length, commitmentArchive.length, healthLog]
  );

  useEffect(() => {
    if (user.lastSeenRankTier == null) {
      // First run ever (pre-migration user, or a brand-new user's first day) —
      // establish the baseline silently, don't celebrate/warn about it.
      setUser(prev => ({ ...prev, lastSeenRankTier: rankStatus.tier.name }));
      return;
    }
    if (rankStatus.tier.name !== user.lastSeenRankTier) {
      const prevTier = RANK_TIERS.find(t => t.name === user.lastSeenRankTier);
      const direction = RANK_TIERS.indexOf(rankStatus.tier) > RANK_TIERS.indexOf(prevTier) ? 'up' : 'down';
      setRankChangeModal({ tier: rankStatus.tier, direction, streakDays: rankStatus.streakDays });
      setUser(prev => ({ ...prev, lastSeenRankTier: rankStatus.tier.name }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rankStatus.tier.name]);

  // ─── Persistence Effects ───────────────────────────────────────────────────────
  const persist = (key, value) => {
    localStorage.setItem(key, JSON.stringify(value));
    touchedSinceLoadStart.current.add(key);
    if (cloudSyncEnabled.current && firebaseUser) saveDataKey(firebaseUser.uid, key, value);
  };

  useEffect(() => { persist('gameOfLife_todos', todos); }, [todos]);
  useEffect(() => { persist('gameOfLife_habits', habits); }, [habits]);
  useEffect(() => { persist('gameOfLife_logs', logs); }, [logs]);
  useEffect(() => { persist('gameOfLife_chatHistory', chatHistory); }, [chatHistory]);
  useEffect(() => { persist('gameOfLife_calendarEvents', calendarEvents); }, [calendarEvents]);
  useEffect(() => { persist('gameOfLife_noPhoneBlocks', noPhoneBlocks); }, [noPhoneBlocks]);
  useEffect(() => { persist('gameOfLife_quickEvents', quickEvents); }, [quickEvents]);
  useEffect(() => { persist('gameOfLife_calendarDayEvents', calendarDayEvents); }, [calendarDayEvents]);
  useEffect(() => { persist('gameOfLife_commitmentArchive', commitmentArchive); }, [commitmentArchive]);
  useEffect(() => { persist('gameOfLife_goals_v1', goals); }, [goals]);
  useEffect(() => { persist('gameOfLife_user', user); }, [user]);
  useEffect(() => { persist('gameOfLife_xpLog', xpLog); }, [xpLog]);
  useEffect(() => { persist('gameOfLife_pomodoroSessions', pomodoroSessions); }, [pomodoroSessions]);
  useEffect(() => { persist('gameOfLife_achievements', achievements); }, [achievements]);
  useEffect(() => { persist('gameOfLife_healthLog', healthLog); }, [healthLog]);
  useEffect(() => { persist('gameOfLife_foodLog', foodLog); }, [foodLog]);
  useEffect(() => { persist('gameOfLife_foodPoints', foodPoints); }, [foodPoints]);
  useEffect(() => { persist('gameOfLife_weeklyReviews', weeklyReviews); }, [weeklyReviews]);
  useEffect(() => { persist('gameOfLife_shop', shop); }, [shop]);
  useEffect(() => { persist('gameOfLife_brainDump', brainDumpNotes); }, [brainDumpNotes]);
  useEffect(() => { persist('gameOfLife_brainDumpConnections', brainDumpConnections); }, [brainDumpConnections]);

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
    // Fresh window: only edits made during THIS load get protected below.
    touchedSinceLoadStart.current = new Set();

    loadAllUserData(firebaseUser.uid).then(data => {
      if (data) {
        const touched = touchedSinceLoadStart.current;
        if (data.gameOfLife_todos && !touched.has('gameOfLife_todos')) setTodos(data.gameOfLife_todos);
        if (data.gameOfLife_habits && !touched.has('gameOfLife_habits')) setHabits(data.gameOfLife_habits);
        if (data.gameOfLife_logs && !touched.has('gameOfLife_logs')) setLogs(data.gameOfLife_logs);
        if (data.gameOfLife_chatHistory && !touched.has('gameOfLife_chatHistory')) setChatHistory(data.gameOfLife_chatHistory);
        if (data.gameOfLife_calendarEvents && !touched.has('gameOfLife_calendarEvents')) setCalendarEvents(data.gameOfLife_calendarEvents);
        if (data.gameOfLife_noPhoneBlocks && !touched.has('gameOfLife_noPhoneBlocks')) setNoPhoneBlocks(data.gameOfLife_noPhoneBlocks);
        if (data.gameOfLife_quickEvents && !touched.has('gameOfLife_quickEvents')) setQuickEvents(data.gameOfLife_quickEvents);
        if (data.gameOfLife_calendarDayEvents && !touched.has('gameOfLife_calendarDayEvents')) setCalendarDayEvents(data.gameOfLife_calendarDayEvents);
        if (data.gameOfLife_commitmentArchive && !touched.has('gameOfLife_commitmentArchive')) setCommitmentArchive(data.gameOfLife_commitmentArchive);
        if (data.gameOfLife_goals_v1 && !touched.has('gameOfLife_goals_v1')) setGoals(data.gameOfLife_goals_v1.map(normalizeGoal));
        if (data.gameOfLife_user && !touched.has('gameOfLife_user')) setUser(data.gameOfLife_user);
        if (data.gameOfLife_xpLog && !touched.has('gameOfLife_xpLog')) setXpLog(data.gameOfLife_xpLog);
        if (data.gameOfLife_pomodoroSessions && !touched.has('gameOfLife_pomodoroSessions')) setPomodoroSessions(data.gameOfLife_pomodoroSessions);
        if (data.gameOfLife_achievements && !touched.has('gameOfLife_achievements')) setAchievements(data.gameOfLife_achievements);
        if (data.gameOfLife_healthLog && !touched.has('gameOfLife_healthLog')) setHealthLog(data.gameOfLife_healthLog);
        if (data.gameOfLife_foodLog && !touched.has('gameOfLife_foodLog')) setFoodLog(data.gameOfLife_foodLog);
        if (data.gameOfLife_foodPoints && !touched.has('gameOfLife_foodPoints')) setFoodPoints(data.gameOfLife_foodPoints);
        if (data.gameOfLife_weeklyReviews && !touched.has('gameOfLife_weeklyReviews')) setWeeklyReviews(data.gameOfLife_weeklyReviews);
        if (data.gameOfLife_shop && !touched.has('gameOfLife_shop')) setShop(data.gameOfLife_shop);
        if (data.gameOfLife_brainDump && !touched.has('gameOfLife_brainDump')) setBrainDumpNotes(data.gameOfLife_brainDump);
        if (data.gameOfLife_brainDumpConnections && !touched.has('gameOfLife_brainDumpConnections')) setBrainDumpConnections(data.gameOfLife_brainDumpConnections);
      } else {
        // First login — migrate whatever exists in localStorage to the cloud
        migrateLocalStorageToFirestore(firebaseUser.uid, {
          gameOfLife_todos: todos,
          gameOfLife_habits: habits,
          gameOfLife_logs: logs,
          gameOfLife_chatHistory: chatHistory,
          gameOfLife_calendarEvents: calendarEvents,
          gameOfLife_noPhoneBlocks: noPhoneBlocks,
          gameOfLife_quickEvents: quickEvents,
          gameOfLife_calendarDayEvents: calendarDayEvents,
          gameOfLife_commitmentArchive: commitmentArchive,
          gameOfLife_goals_v1: goals,
          gameOfLife_user: user,
          gameOfLife_xpLog: xpLog,
          gameOfLife_pomodoroSessions: pomodoroSessions,
          gameOfLife_achievements: achievements,
          gameOfLife_healthLog: healthLog,
          gameOfLife_foodLog: foodLog,
          gameOfLife_foodPoints: foodPoints,
          gameOfLife_weeklyReviews: weeklyReviews,
          gameOfLife_shop: shop,
          gameOfLife_brainDump: brainDumpNotes,
          gameOfLife_brainDumpConnections: brainDumpConnections,
        }).catch(console.error);
      }
      // This load has now made its one decision per key (apply cloud value or
      // keep the local edit); clear the set so it doesn't keep blocking live
      // updates for those keys for the rest of the session.
      touchedSinceLoadStart.current = new Set();
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

  // ─── Real-time Cross-Device Sync ───────────────────────────────────────────────
  const keySetters = useRef({
    gameOfLife_todos: setTodos,
    gameOfLife_habits: setHabits,
    gameOfLife_logs: setLogs,
    gameOfLife_chatHistory: setChatHistory,
    gameOfLife_calendarEvents: setCalendarEvents,
    gameOfLife_noPhoneBlocks: setNoPhoneBlocks,
    gameOfLife_quickEvents: setQuickEvents,
    gameOfLife_calendarDayEvents: setCalendarDayEvents,
    gameOfLife_commitmentArchive: setCommitmentArchive,
    gameOfLife_goals_v1: (value) => setGoals((value || []).map(normalizeGoal)),
    gameOfLife_user: setUser,
    gameOfLife_xpLog: setXpLog,
    gameOfLife_pomodoroSessions: setPomodoroSessions,
    gameOfLife_achievements: setAchievements,
    gameOfLife_healthLog: setHealthLog,
    gameOfLife_foodLog: setFoodLog,
    gameOfLife_foodPoints: setFoodPoints,
    gameOfLife_weeklyReviews: setWeeklyReviews,
    gameOfLife_shop: setShop,
    gameOfLife_brainDump: setBrainDumpNotes,
    gameOfLife_brainDumpConnections: setBrainDumpConnections,
  });

  useEffect(() => {
    if (!firebaseUser || !cloudSyncReady) return;
    // No touchedSinceLoadStart check here: that guard is scoped to the one
    // initial load (and is cleared once it resolves), since this listener
    // already ignores echoes of our own writes via firestoreService's
    // lastWrittenValue cache.
    const unsubscribe = subscribeToUserData(firebaseUser.uid, (key, value) => {
      keySetters.current[key]?.(value);
    });
    return unsubscribe;
  }, [firebaseUser, cloudSyncReady]);

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
    // Keep monotonic lifetime counters (the xpLog itself is capped at 500 and rotates,
    // so it can't be trusted for "lifetime" achievement thresholds).
    if (amount > 0) {
      setUser(prev => ({
        ...prev,
        lifetimeXp: (prev.lifetimeXp || 0) + amount,
        lifetimeTaskCount: (prev.lifetimeTaskCount || 0) + (source === 'task' ? 1 : 0),
      }));
    }
  }, []);

  // ─── User / XP Functions ───────────────────────────────────────────────────────
  const updateName = (newName) => setUser(prev => ({ ...prev, name: newName }));

  // updateStat is the single XP mutator: it credits a stat AND global XP together,
  // handles level up/down, and logs the event. (A second global-only `addXp` used to
  // exist for commitments — it was removed so every reward flows through one path.)
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
        setTimeout(() => setLevelUpModal({ newLevel: currentLevel }), 300);
      }
      return {
        ...prev,
        level: currentLevel,
        xp: currentXp,
        stats: { ...prev.stats, [statName]: (prev.stats[statName] || 0) + amount }
      };
    });
  }, [logXpEvent]);

  // Toggle a habit for a given day, awarding/removing the same streak XP as the Tasks
  // page (shared via habitUtils). Lets the daily check-in and the Tasks page stay in sync.
  const handleToggleHabitDay = useCallback((habitId, dateStr) => {
    const habit = habits.find(h => h.id === habitId);
    if (!habit) return;
    const attrs = getHabitAttrs(habit);
    const history = { ...(habit.history || {}) };
    if (history[dateStr]) {
      const xp = calcStreakXp(history, dateStr); // streak still includes this day
      delete history[dateStr];
      attrs.forEach(attr => updateStat(attr, -xp, { source: 'habit', label: habit.text }));
    } else {
      history[dateStr] = true;
      const xp = calcStreakXp(history, dateStr);
      attrs.forEach(attr => updateStat(attr, xp, { source: 'habit', label: habit.text }));
    }
    setHabits(prev => prev.map(h => h.id === habitId ? { ...h, history } : h));
  }, [habits, updateStat]);

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
        localStorage.setItem('gameOfLife_lastDate', todayStr());
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

  const handleArchiveCommitmentResolve = (date, text, denied) => {
    if (!date) return;
    // Keeping your word builds Discipline — route it through the one mutator so it
    // shows up in stats/feed consistently (previously addXp granted global-only XP).
    if (!denied) {
      updateStat('discipline', 10, { source: 'commitment', label: 'Commitment kept' });
      setCommitmentToast(true);
      setTimeout(() => setCommitmentToast(false), 3200);
    }
    resolveCommitmentRecord(date, text, denied);
  };


  // ─── Achievements Detection ────────────────────────────────────────────────────
  useEffect(() => {
    const data = computeAchievementData(user, habits, xpLog, pomodoroSessions, commitmentArchive, logs, goals);
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
  }, [user.level, xpLog.length, pomodoroSessions.length, commitmentArchive.length, goals]);

  // ─── Flush pending Firestore writes before page unload or backgrounding ───────
  // beforeunload alone misses mobile app-switches/backgrounding (notably iOS
  // Safari), so also flush on visibilitychange/pagehide.
  useEffect(() => {
    const flushIfHidden = () => {
      if (document.visibilityState === 'hidden') flushPendingWrites();
    };
    window.addEventListener('beforeunload', flushPendingWrites);
    window.addEventListener('pagehide', flushPendingWrites);
    document.addEventListener('visibilitychange', flushIfHidden);
    return () => {
      window.removeEventListener('beforeunload', flushPendingWrites);
      window.removeEventListener('pagehide', flushPendingWrites);
      document.removeEventListener('visibilitychange', flushIfHidden);
    };
  }, []);

  // ─── Keyboard Shortcuts ────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
      if (e.altKey) {
        const pageMap = { '1': 'statistics', '2': 'tasks', '3': 'daily-log', '4': 'timer', '5': 'calendar', '6': 'goals', '7': 'review' };
        if (pageMap[e.key]) { e.preventDefault(); setCurrentPage(pageMap[e.key]); return; }
        if (e.key === 'm' || e.key === 'M') { e.preventDefault(); setAssistantOpen(o => !o); return; }
        if (e.key === 'f' || e.key === 'F') { e.preventDefault(); setFocusModeOpen(true); return; }
        if (e.key === 's' || e.key === 'S') { e.preventDefault(); setCurrentPage('shop'); return; }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ─── Assistant Action Handler ─────────────────────────────────────────────────────
  const handleAssistantAction = (action) => {
    return applyAssistantAction(action, { setTodos, setCalendarEvents, setQuickEvents });
  };

  // ─── Page Renderer ─────────────────────────────────────────────────────────────
  const renderPage = () => {
    switch (currentPage) {
      case 'welcome':
        return (
          <WelcomePage
            user={user}
            todos={todos}
            setTodos={setTodos}
            onUpdateStat={updateStat}
            calendarEvents={calendarEvents}
            noPhoneBlocks={noPhoneBlocks}
            calendarDayEvents={calendarDayEvents}
            currentWeekPriority={currentWeekPriority}
            logs={logs}
            commitmentArchive={commitmentArchive}
            goals={goals}
            habits={habits}
            xpLog={xpLog}
            healthLog={healthLog}
            onNavigate={handleNavigate}
            onResolveCommitment={handleArchiveCommitmentResolve}
          />
        );
      case 'statistics':
        return (
          <PlayerDashboard
            user={user}
            onUpdateName={updateName}
            todos={todos}
            habits={habits}
            logs={logs}
            onUpdateStat={updateStat}
            setTodos={setTodos}
            setHabits={setHabits}
            xpCap={xpCapForLevel(user.level)}
            commitmentArchive={commitmentArchive}
            xpLog={xpLog}
            pomodoroSessions={pomodoroSessions}
            rankStatus={rankStatus}
            onOpenFocusMode={() => setFocusModeOpen(true)}
            goals={goals}
            healthLog={healthLog}
            noPhoneBlocks={noPhoneBlocks}
            onNavigate={handleNavigate}
          />
        );
      case 'tasks':
        return (
          <TasksPage
            onUpdateStat={updateStat}
            todos={todos}
            setTodos={setTodos}
          />
        );
      case 'daily-log':
        return (
          <DailyLogPage
            logs={logs}
            setLogs={setLogs}
            onCommitmentLocked={({ date, text }) => upsertCommitmentRecord(date, text)}
            habits={habits}
            setHabits={setHabits}
            onToggleHabitDay={handleToggleHabitDay}
            healthLog={healthLog}
            setHealthLog={setHealthLog}
            foodLog={foodLog}
            setFoodLog={setFoodLog}
            foodPoints={foodPoints}
            setFoodPoints={setFoodPoints}
            onUpdateStat={updateStat}
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
            noPhoneBlocks={noPhoneBlocks}
            setNoPhoneBlocks={setNoPhoneBlocks}
            calendarDayEvents={calendarDayEvents}
            setCalendarDayEvents={setCalendarDayEvents}
            quickEvents={quickEvents}
            setQuickEvents={setQuickEvents}
            onUpdateStat={updateStat}
            todos={todos}
            logs={logs}
          />
        );
      case 'goals':
        return (
          <GoalsPage
            goals={goals}
            setGoals={setGoals}
            setTodos={setTodos}
            onUpdateStat={updateStat}
            habits={habits}
            setHabits={setHabits}
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
            goals={goals}
            healthLog={healthLog}
            setGoals={setGoals}
            onUpdateStat={updateStat}
          />
        );
      case 'shop':
        return (
          <ShopPage
            shop={shop}
            setShop={setShop}
          />
        );
      case 'brain-dump':
        return (
          <BrainDumpPage
            brainDumpNotes={brainDumpNotes}
            setBrainDumpNotes={setBrainDumpNotes}
            brainDumpConnections={brainDumpConnections}
            setBrainDumpConnections={setBrainDumpConnections}
          />
        );
      default:
        return <PlayerDashboard user={user} onUpdateName={updateName} xpLog={xpLog} pomodoroSessions={pomodoroSessions} habits={habits} todos={todos} logs={logs} commitmentArchive={commitmentArchive} rankStatus={rankStatus} goals={goals} healthLog={healthLog} noPhoneBlocks={noPhoneBlocks} onNavigate={handleNavigate} />;
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
        rankStatus={rankStatus}
        onOpenDataModal={() => setDataModalOpen(true)}
        isMobileMenuOpen={mobileMenuOpen}
        onMobileMenuClose={() => setMobileMenuOpen(false)}
        firebaseUser={firebaseUser}
        onSignOut={signOut}
      />
      <div className="content-container">
        {renderPage()}
      </div>

      <AssistantDrawer
        isOpen={assistantOpen}
        onToggle={() => setAssistantOpen(o => !o)}
        onClose={() => setAssistantOpen(false)}
        user={user}
        todos={todos}
        habits={habits}
        logs={logs}
        healthLog={healthLog}
        foodPoints={foodPoints}
        pomodoroSessions={pomodoroSessions}
        goals={goals}
        weeklyReviews={weeklyReviews}
        xpLog={xpLog}
        commitmentArchive={commitmentArchive}
        calendarEvents={calendarEvents}
        noPhoneBlocks={noPhoneBlocks}
        calendarDayEvents={calendarDayEvents}
        achievements={achievements}
        shop={shop}
        brainDumpNotes={brainDumpNotes}
        chatHistory={chatHistory}
        setChatHistory={setChatHistory}
        onApplyAction={handleAssistantAction}
        draftMessage={assistantDraft}
        onDraftConsumed={() => setAssistantDraft(null)}
      />

      {levelUpModal && (
        <LevelUpModal newLevel={levelUpModal.newLevel} onClose={() => setLevelUpModal(null)} />
      )}
      {rankChangeModal && (
        <RankChangeModal tier={rankChangeModal.tier} direction={rankChangeModal.direction} streakDays={rankChangeModal.streakDays} onClose={() => setRankChangeModal(null)} />
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
          <span className="achievement-toast-icon"><achievementToast.Icon size={28} /></span>
          <div className="achievement-toast-body">
            <span className="achievement-toast-title">Achievement Unlocked!</span>
            <span className="achievement-toast-label">{achievementToast.label} — {achievementToast.desc}</span>
          </div>
        </div>
      )}
      {commitmentToast && (
        <div className="commitment-toast">
          <span className="commitment-toast-confetti" aria-hidden="true">
            <span></span><span></span><span></span><span></span><span></span><span></span>
          </span>
          <span className="commitment-toast-icon"><PartyPopper size={26} /></span>
          <div className="commitment-toast-body">
            <span className="commitment-toast-title">Kept it!</span>
            <span className="commitment-toast-label">+10 Discipline XP</span>
          </div>
        </div>
      )}

      {nearestEvent && !eventPopupDismissed && (
        eventPopupMinimized ? (
          <button className="event-popup-mini" onClick={() => setEventPopupMinimized(false)}>
            <CalendarDays size={14} /> <span>Next event</span>
          </button>
        ) : (
          <div className="event-popup">
            <div className="event-popup-actions">
              <button className="event-popup-action-btn" onClick={() => setEventPopupMinimized(true)} title="Minimize"><ChevronDown size={14} /></button>
              <button className="event-popup-action-btn" onClick={() => setEventPopupDismissed(true)} title="Dismiss"><X size={14} /></button>
            </div>
            <div className="event-popup-label">Next event</div>
            <div className="event-popup-title">{nearestEvent.title}</div>
            <div className="event-popup-meta">
              <span>{formatEventPopupDate(nearestEvent)}</span>
              <span className="event-popup-dot">·</span>
              <span>{formatEventPopupTime(nearestEvent)}</span>
            </div>
            <div className="event-popup-countdown">{eventCountdown}</div>
          </div>
        )
      )}

      {currentWeekPriority && !priorityPopupDismissed && (
        priorityPopupMinimized ? (
          <button className="priority-popup-mini" onClick={() => setPriorityPopupMinimized(false)}>
            <Target size={14} /> <span>Priority</span>
          </button>
        ) : (
          <div className="priority-popup">
            <div className="priority-popup-actions">
              <button className="priority-popup-action-btn" onClick={() => setPriorityPopupMinimized(true)} title="Minimize"><ChevronDown size={14} /></button>
              <button className="priority-popup-action-btn" onClick={() => setPriorityPopupDismissed(true)} title="Dismiss"><X size={14} /></button>
            </div>
            <div className="priority-popup-label"><Target size={14} /> This week's priority</div>
            <div className="priority-popup-text">{currentWeekPriority}</div>
          </div>
        )
      )}

      {!assistantOpen && (
        <FloatingAIBar
          onSubmit={(text) => {
            setAssistantDraft(text);
            setAssistantOpen(true);
          }}
          onExpand={() => setAssistantOpen(true)}
        />
      )}

      {/* Mobile bottom navigation bar */}
      <nav className="bottom-nav">
        {[
          { id: 'statistics', label: 'Stats',   icon: <StatIcon /> },
          { id: 'tasks',      label: 'Tasks',   icon: <TaskIcon /> },
          { id: 'calendar',   label: 'Calendar', icon: <CalIcon /> },
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
