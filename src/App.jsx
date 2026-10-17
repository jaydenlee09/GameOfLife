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
import { computeRankStatus, computeDailyScore } from './utils/scoreUtils'
import RankChangeModal from './components/RankChangeModal'
import { calcStreakXp, getHabitAttrs } from './utils/habitUtils'
import CalendarPage from './components/CalendarPage'
import AssistantDrawer from './components/AssistantDrawer'
import { refreshPushToken, listenForegroundPushes, subscribePushState } from './services/pushService'
import FloatingAIBar from './components/FloatingAIBar'
import useAssistant from './hooks/useAssistant'
import { hasAssistantApiKey } from './utils/assistantUtils'
import { EMPTY_CHECKINS, getDueCheckin, markCheckinDone, checkinPrompt, computeNudges, dismissNudge } from './utils/assistantTriggers'
import GoalsPage from './components/GoalsPage'
import DataModal from './components/DataModal'
import WeeklyReviewPage from './components/WeeklyReviewPage'
import ShopPage from './components/ShopPage'
import BrainDumpPage from './components/BrainDumpPage'
import FocusMode from './components/FocusMode'
import DayPlanner from './components/DayPlanner'
import { getTool, applySliceOp } from './utils/assistantTools'
import { completeBlock, completeTask, findBlockInstance } from './utils/completionUtils'
import { computeAchievementData, checkAchievements, ACHIEVEMENTS } from './utils/achievementsMeta'
import { normalizeGoal } from './utils/goalUtils'

// Every page renderPage() knows, for validating notification deep links.
const PAGE_IDS = ['welcome', 'statistics', 'tasks', 'daily-log', 'timer', 'calendar', 'goals', 'review', 'shop', 'brain-dump'];

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

  // A tapped push notification opens /?page=<page> ('assistant' opens the drawer).
  const [launchPage] = useState(() => new URLSearchParams(window.location.search).get('page'));
  const [currentPage, setCurrentPage] = useState(() => (launchPage && PAGE_IDS.includes(launchPage) ? launchPage : 'welcome'));
  const [assistantOpen, setAssistantOpen] = useState(() => launchPage === 'assistant');
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

  // ─── My Assistant (agent) ──────────────────────────────────────────────────────
  // Long-term memory the agent reads every turn, the log of everything it changed
  // (for undo), and which proactive check-ins already ran.
  const [assistantMemory, setAssistantMemory] = useState(() => {
    const saved = localStorage.getItem('gameOfLife_assistantMemory');
    return saved ? JSON.parse(saved) : [];
  });

  const [assistantActivity, setAssistantActivity] = useState(() => {
    const saved = localStorage.getItem('gameOfLife_assistantActivity');
    return saved ? JSON.parse(saved) : [];
  });

  const [assistantCheckins, setAssistantCheckins] = useState(() => {
    const saved = localStorage.getItem('gameOfLife_assistantCheckins');
    return saved ? { ...EMPTY_CHECKINS, ...JSON.parse(saved) } : EMPTY_CHECKINS;
  });

  // The assistant's report on each submitted Daily Log, keyed by date.
  const [logReviews, setLogReviews] = useState(() => {
    const saved = localStorage.getItem('gameOfLife_logReviews');
    return saved ? JSON.parse(saved) : {};
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
  // Set when Focus Mode is opened from a calendar block's "Start focus".
  const [focusLaunch, setFocusLaunch] = useState(null);
  // Date being planned in the Plan My Day modal (null = closed).
  const [plannerDate, setPlannerDate] = useState(null);
  const [achievementToast, setAchievementToast] = useState(null);
  const [commitmentToast, setCommitmentToast] = useState(false);

  // ─── Daily Score ───────────────────────────────────────────────────────────────
  // Computed here (not inside Navbar) so the sidebar chip and any other consumer
  // read one value. Deps are the full state references, not `.length`: ticking a
  // habit writes `habits[i].history[dateKey]` and leaves the array length alone, so
  // a length-keyed memo would leave a stale score on screen until the next reload.
  const dailyScore = useMemo(
    () => computeDailyScore(habits, xpLog, logs, commitmentArchive, healthLog),
    [habits, xpLog, logs, commitmentArchive, healthLog]
  );

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
  useEffect(() => { persist('gameOfLife_assistantMemory', assistantMemory); }, [assistantMemory]);
  useEffect(() => { persist('gameOfLife_assistantActivity', assistantActivity); }, [assistantActivity]);
  useEffect(() => { persist('gameOfLife_assistantCheckins', assistantCheckins); }, [assistantCheckins]);
  useEffect(() => { persist('gameOfLife_logReviews', logReviews); }, [logReviews]);

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
        if (data.gameOfLife_assistantMemory && !touched.has('gameOfLife_assistantMemory')) setAssistantMemory(data.gameOfLife_assistantMemory);
        if (data.gameOfLife_assistantActivity && !touched.has('gameOfLife_assistantActivity')) setAssistantActivity(data.gameOfLife_assistantActivity);
        if (data.gameOfLife_assistantCheckins && !touched.has('gameOfLife_assistantCheckins')) setAssistantCheckins({ ...EMPTY_CHECKINS, ...data.gameOfLife_assistantCheckins });
        if (data.gameOfLife_logReviews && !touched.has('gameOfLife_logReviews')) setLogReviews(data.gameOfLife_logReviews);
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
          gameOfLife_assistantMemory: assistantMemory,
          gameOfLife_assistantActivity: assistantActivity,
          gameOfLife_assistantCheckins: assistantCheckins,
          gameOfLife_logReviews: logReviews,
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
    gameOfLife_assistantMemory: setAssistantMemory,
    gameOfLife_assistantActivity: setAssistantActivity,
    gameOfLife_assistantCheckins: (value) => setAssistantCheckins({ ...EMPTY_CHECKINS, ...value }),
    gameOfLife_logReviews: setLogReviews,
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

  // ─── Push notifications ────────────────────────────────────────────────────────
  // Drop ?page= once it has been applied, so a reload doesn't re-navigate.
  useEffect(() => {
    if (launchPage) window.history.replaceState(null, '', window.location.pathname);
  }, [launchPage]);

  // A notification tapped while APEX is already open: the service worker asks
  // this window to switch pages.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (event) => {
      if (event.data?.type !== 'apex-navigate') return;
      if (event.data.page === 'assistant') setAssistantOpen(true);
      else if (PAGE_IDS.includes(event.data.page)) setCurrentPage(event.data.page);
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    if (!firebaseUser || !cloudSyncReady) return;
    refreshPushToken(firebaseUser.uid).catch((err) => console.warn('Push token refresh failed', err));
    let unsubscribe = null;
    let cancelled = false;
    listenForegroundPushes().then((fn) => { if (cancelled) fn(); else unsubscribe = fn; }).catch(() => {});
    return () => { cancelled = true; unsubscribe?.(); };
  }, [firebaseUser, cloudSyncReady]);

  // The server writes the morning brief it pushed into its own doc (it never writes
  // chat, to avoid racing this client's whole-blob sync). Merge it into chat here,
  // as that day's morning check-in, so the in-app one doesn't run as well. Only
  // after the cloud load settles, or the merge would count as a local edit and
  // shadow the cloud chat history.
  const [pushStateReady, setPushStateReady] = useState(false);
  useEffect(() => {
    if (!firebaseUser || !cloudSyncReady) return;
    let unsubscribe = null;
    let cancelled = false;
    subscribePushState(firebaseUser.uid, (pushState) => {
      const brief = pushState.morningBrief;
      if (brief?.text && brief.date === getLocalDateKey(0)) {
        const id = `push_morning_${brief.date}`;
        setChatHistory(prev => (prev.some(m => m.id === id) ? prev : [
          ...prev,
          { id: `${id}_prompt`, role: 'user', parts: [{ text: '[Automatic morning brief, sent to my phone as a notification.]' }], hidden: true },
          { id, role: 'model', parts: [{ text: brief.text }], kind: 'morning', unread: true },
        ]));
        setAssistantCheckins(prev => (prev.morning === brief.date ? prev : { ...prev, morning: brief.date }));
      }
      setPushStateReady(true);
    }).then((fn) => { if (cancelled) fn(); else unsubscribe = fn; }).catch(() => setPushStateReady(true));
    return () => { cancelled = true; unsubscribe?.(); };
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
      attrs.forEach(attr => updateStat(attr, -xp, { source: 'habit', label: habit.name || habit.text }));
    } else {
      history[dateStr] = true;
      const xp = calcStreakXp(history, dateStr);
      attrs.forEach(attr => updateStat(attr, xp, { source: 'habit', label: habit.name || habit.text }));
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

  // ─── Assistant drawer open/close ──────────────────────────────────────────────
  // Check-in replies arrive unread (badge on the AI bar); opening or closing the
  // drawer means they've been seen.
  const markAssistantRead = useCallback(() => {
    setChatHistory(prev => (prev.some(m => m.unread) ? prev.map(m => (m.unread ? { ...m, unread: false } : m)) : prev));
  }, []);
  const openAssistant = () => { setAssistantOpen(true); markAssistantRead(); };
  const closeAssistant = () => { setAssistantOpen(false); markAssistantRead(); };
  const toggleAssistant = useCallback(() => { setAssistantOpen(o => !o); markAssistantRead(); }, [markAssistantRead]);

  // ─── Keyboard Shortcuts ────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
      if (e.altKey) {
        const pageMap = { '1': 'statistics', '2': 'tasks', '3': 'daily-log', '4': 'timer', '5': 'calendar', '6': 'goals', '7': 'review' };
        if (pageMap[e.key]) { e.preventDefault(); setCurrentPage(pageMap[e.key]); return; }
        if (e.key === 'm' || e.key === 'M') { e.preventDefault(); toggleAssistant(); return; }
        if (e.key === 'f' || e.key === 'F') { e.preventDefault(); setFocusModeOpen(true); return; }
        if (e.key === 's' || e.key === 'S') { e.preventDefault(); setCurrentPage('shop'); return; }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggleAssistant]);

  // ─── My Assistant ──────────────────────────────────────────────────────────────
  // Which React setter each agent op `collection` writes to (see assistantTools.js).
  const assistantSetters = useMemo(() => ({
    todos: setTodos,
    calendarEvents: setCalendarEvents,
    quickEvents: setQuickEvents,
    brainDumpNotes: setBrainDumpNotes,
    goals: setGoals,
    assistantMemory: setAssistantMemory,
    user: setUser,
  }), []);

  const assistant = useAssistant({
    state: {
      user, todos, habits, logs, healthLog, foodPoints, pomodoroSessions, goals, weeklyReviews, xpLog,
      commitmentArchive, calendarEvents, noPhoneBlocks, calendarDayEvents, achievements, shop, brainDumpNotes,
      assistantMemory, assistantActivity, chatHistory,
    },
    setters: assistantSetters,
    setChatHistory,
    setActivity: setAssistantActivity,
    setLogReviews,
  });

  // ─── Plan My Day + focus coach ────────────────────────────────────────────────
  const openPlanner = useCallback((dateKey) => setPlannerDate(dateKey || getLocalDateKey(0)), []);

  const startFocusFromBlock = useCallback((ev) => {
    const minutes = (ev.endHour * 60 + ev.endMin) - (ev.startHour * 60 + ev.startMin);
    setFocusLaunch({
      blockId: ev.id,
      blockDate: ev._instanceDate || ev.date,
      blockTitle: ev.title,
      taskId: ev.plan?.taskId ?? null,
      intent: ev.plan?.intent || '',
      durationSecs: Math.max(5, minutes) * 60,
    });
    setFocusModeOpen(true);
  }, []);

  const closeFocusMode = useCallback(() => { setFocusModeOpen(false); setFocusLaunch(null); }, []);

  // Parked thoughts become Brain Dump notes, laid out like the agent's own notes.
  const parkThought = useCallback((text) => {
    setBrainDumpNotes(prev => {
      const { op } = getTool('add_brain_dump_note').prepare({ text }, { state: { brainDumpNotes: prev } });
      return applySliceOp(prev, op);
    });
  }, []);

  // One-tap completes from the focus debrief: same XP rules as the Calendar/Tasks pages.
  const completeBlockById = (blockId, dateKey) => {
    const done = completeBlock(findBlockInstance(calendarEvents, blockId, dateKey));
    if (!done) return null;
    done.awards.forEach(a => updateStat(a.stat, a.amount, { source: a.source, label: a.label }));
    setCalendarEvents(done.update);
    return done.xp;
  };
  const completeTaskById = (taskId) => {
    const done = completeTask(todos.find(t => String(t.id) === String(taskId)));
    if (!done) return null;
    done.awards.forEach(a => updateStat(a.stat, a.amount, { source: a.source, label: a.label }));
    setTodos(done.update);
    return done.xp;
  };
  const saveFocusComment = useCallback((sessionId, coachNote) => {
    setPomodoroSessions(prev => prev.map(s => (s.id === sessionId ? { ...s, coachNote } : s)));
  }, []);

  const unreadCheckin = assistantOpen ? null : [...chatHistory].reverse().find(m => m.unread) || null;

  // Proactive behaviour re-evaluates on load, whenever the tab becomes visible, and
  // every 5 minutes while it stays open. It waits for the Firestore load (when signed
  // in) so it never acts on stale local data or re-fires a check-in another device ran.
  const syncSettled = !firebaseUser || (cloudSyncReady && pushStateReady);
  const [clockTick, setClockTick] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setClockTick(Date.now());
    const onVisible = () => { if (document.visibilityState === 'visible') tick(); };
    const id = setInterval(tick, 5 * 60 * 1000);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // A failed check-in (bad key, rate limit, offline) retries after an hour, not on every tick.
  const checkinFailedAt = useRef({});
  useEffect(() => {
    if (!syncSettled || !hasAssistantApiKey()) return;
    const now = new Date(clockTick);
    const due = getDueCheckin(now, assistantCheckins, { logs });
    if (!due) return;
    const failedAt = checkinFailedAt.current[due.type];
    if (failedAt && clockTick - failedAt < 60 * 60 * 1000) return;
    assistant.send(checkinPrompt(due.type, now), { hidden: true, kind: due.type, silent: true }).then((ok) => {
      if (ok) setAssistantCheckins(prev => markCheckinDone(prev, due, now));
      else if (ok === false) checkinFailedAt.current[due.type] = Date.now();
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncSettled, clockTick]);

  // Home's one-line brief: made once per day (after 4am) the first time Home is open,
  // saved on the user so every device shows the same line. Failures retry after an hour.
  const [briefLoading, setBriefLoading] = useState(false);
  const briefInFlight = useRef(false);
  const briefFailedAt = useRef(0);
  const runHomeBrief = useCallback(async (manual = false) => {
    if (briefInFlight.current) return;
    briefInFlight.current = true;
    setBriefLoading(true);
    const result = await assistant.briefHome({ weekPriority: currentWeekPriority, logReviews });
    if (result.ok) setUser(prev => ({ ...prev, homeBrief: result.brief }));
    else if (!manual) briefFailedAt.current = Date.now();
    briefInFlight.current = false;
    setBriefLoading(false);
  }, [assistant, currentWeekPriority, logReviews]);

  useEffect(() => {
    if (!syncSettled || currentPage !== 'welcome' || !hasAssistantApiKey()) return;
    const now = new Date(clockTick);
    if (now.getHours() < 4 || user.homeBrief?.date === getLocalDateKey(0)) return;
    if (Date.now() - briefFailedAt.current < 60 * 60 * 1000) return;
    runHomeBrief();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncSettled, clockTick, currentPage, user.homeBrief?.date]);

  const nudges = useMemo(
    () => (syncSettled
      ? computeNudges(new Date(clockTick), { habits, xpLog, logs, commitmentArchive, healthLog, goals }, assistantCheckins)
      : []),
    [syncSettled, clockTick, habits, xpLog, logs, commitmentArchive, healthLog, goals, assistantCheckins]
  );
  // A nudge that only sends you to Home is pointless while you're on Home.
  const activeNudge = nudges.find(n => !(currentPage === 'welcome' && n.cta.type === 'navigate' && n.cta.page === 'welcome')) || null;

  const handleNudgeDismiss = (id) => setAssistantCheckins(prev => dismissNudge(prev, id, new Date()));
  const handleNudgeAction = (nudge) => {
    handleNudgeDismiss(nudge.id);
    if (nudge.cta.type === 'navigate') {
      handleNavigate(nudge.cta.page);
    } else {
      setAssistantDraft(nudge.cta.prompt);
      openAssistant();
    }
  };

  // ─── Page Renderer ─────────────────────────────────────────────────────────────
  const renderPage = () => {
    switch (currentPage) {
      case 'welcome':
        return (
          <WelcomePage
            user={user}
            todos={todos}
            calendarEvents={calendarEvents}
            noPhoneBlocks={noPhoneBlocks}
            calendarDayEvents={calendarDayEvents}
            currentWeekPriority={currentWeekPriority}
            logs={logs}
            logReviews={logReviews}
            commitmentArchive={commitmentArchive}
            goals={goals}
            habits={habits}
            xpLog={xpLog}
            healthLog={healthLog}
            brief={user.homeBrief}
            briefLoading={briefLoading}
            onRefreshBrief={hasAssistantApiKey() ? () => runHomeBrief(true) : null}
            onNavigate={handleNavigate}
            onResolveCommitment={handleArchiveCommitmentResolve}
            onCompleteTask={completeTaskById}
            onToggleHabitDay={handleToggleHabitDay}
            onPlanDay={() => openPlanner()}
            onStartFocus={() => setFocusModeOpen(true)}
            onStartFocusBlock={startFocusFromBlock}
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
            logReviews={logReviews}
            onSubmitLog={assistant.reviewLog}
            reviewingDate={assistant.reviewingDate}
            onOpenAssistant={openAssistant}
          />
        );
      case 'timer':
        return (
          <TimerPage
            onUpdateStat={updateStat}
            pomodoroSessions={pomodoroSessions}
            onSessionComplete={handleSessionComplete}
            onPark={parkThought}
            onComment={assistant.commentOnFocus}
            onCommentSaved={saveFocusComment}
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
            onPlanDay={openPlanner}
            onStartFocus={startFocusFromBlock}
          />
        );
      case 'goals':
        return (
          <GoalsPage
            northStar={user.northStar}
            onSaveNorthStar={(northStar) => setUser(prev => ({ ...prev, northStar }))}
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
        dailyScore={dailyScore.score}
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
        onClose={closeAssistant}
        chatHistory={chatHistory}
        setChatHistory={setChatHistory}
        assistant={assistant}
        activity={assistantActivity}
        memory={assistantMemory}
        setMemory={setAssistantMemory}
        hasNorthStar={!!user.northStar?.vision}
        draftMessage={assistantDraft}
        onDraftConsumed={() => setAssistantDraft(null)}
        onPlanDay={() => { closeAssistant(); openPlanner(); }}
        uid={firebaseUser?.uid}
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
          key={focusLaunch ? `${focusLaunch.blockId}_${focusLaunch.blockDate}` : 'free'}
          todos={todos}
          onUpdateStat={updateStat}
          pomodoroSessions={pomodoroSessions}
          onSessionComplete={handleSessionComplete}
          onClose={closeFocusMode}
          launch={focusLaunch}
          linkedBlock={focusLaunch ? findBlockInstance(calendarEvents, focusLaunch.blockId, focusLaunch.blockDate) : null}
          onPark={parkThought}
          onComment={assistant.commentOnFocus}
          onCommentSaved={saveFocusComment}
          onCompleteBlock={completeBlockById}
          onCompleteTask={completeTaskById}
        />
      )}
      {plannerDate && (
        <DayPlanner
          initialDateKey={plannerDate}
          settings={user.planner}
          onSaveSettings={(planner) => setUser(prev => ({ ...prev, planner }))}
          calendarEvents={calendarEvents}
          assistant={assistant}
          onClose={() => setPlannerDate(null)}
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

      {/* Home shows its own Now panel and weekly priority, so these popups skip it. */}
      {nearestEvent && !eventPopupDismissed && currentPage !== 'welcome' && (
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

      {currentWeekPriority && !priorityPopupDismissed && currentPage !== 'welcome' && (
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
            openAssistant();
          }}
          onExpand={openAssistant}
          unreadCheckin={unreadCheckin}
          nudge={activeNudge}
          onNudgeAction={handleNudgeAction}
          onNudgeDismiss={handleNudgeDismiss}
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
