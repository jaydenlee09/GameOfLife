import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react'
import './App.css'
import { useAuth } from './context/AuthContext'
import { loadAllUserData, saveDataKey, flushPendingWrites, migrateLocalStorageToFirestore, subscribeToUserData } from './services/firestoreService'
import PlayerDashboard from './components/PlayerDashboard'
import WelcomePage from './components/WelcomePage'
import Navbar from './components/Navbar'
import { CalendarDays, X, ChevronDown, Target, PartyPopper } from 'lucide-react'
import TasksPage from './components/TasksPage'
import TimerPage from './components/TimerPage'
import LevelUpModal from './components/LevelUpModal'
import ScoreBumpToast from './components/ScoreBumpToast'
import DailyLogPage from './components/DailyLogPage'
import { updateXpBank, getXpStatus, getXpSeries, daysThatBuiltLevel } from './utils/xpUtils'
import RANK_TIERS from './utils/rankMeta'
import { computeRankStatus, computeDailyScore } from './utils/scoreUtils'
import { hasEnoughForPatterns } from './utils/logPatterns'
import RankChangeModal from './components/RankChangeModal'
import { calcStreakXp } from './utils/habitUtils'
import CalendarPage from './components/CalendarPage'
import AssistantDrawer from './components/AssistantDrawer'
import { refreshPushToken, listenForegroundPushes, subscribePushState } from './services/pushService'
import { subscribeWidgetSettings, publishWidgetSnapshot, syncWidgetTimezone } from './services/widgetService'
import { buildWidgetSnapshot, snapshotSignature } from './utils/widgetSnapshot'
import FloatingAIBar from './components/FloatingAIBar'
import useAssistant from './hooks/useAssistant'
import useTodayKey from './hooks/useTodayKey'
import { hasAssistantApiKey } from './utils/assistantUtils'
import { EMPTY_CHECKINS, getDueCheckin, markCheckinDone, checkinPrompt, computeNudges, dismissNudge } from './utils/assistantTriggers'
import { getActivePlan } from './utils/weeklyReset'
import { homeBriefFromMorning } from './utils/homeBrief'
import GoalsPage from './components/GoalsPage'
import DataModal from './components/DataModal'
import WeeklyReviewPage from './components/WeeklyReviewPage'
import ShopPage from './components/ShopPage'
import BrainDumpPage from './components/BrainDumpPage'
import FocusMode from './components/FocusMode'
import DayPlanner from './components/DayPlanner'
import { getTool, applySliceOp } from './utils/assistantTools'
import { checkInBlock, completeTask, findBlockInstance } from './utils/completionUtils'
import { pruneDoneTasks } from './utils/taskUtils'
import { ALT_PAGE_KEYS, IS_MAC, shortcutKeyOf } from './utils/navUtils'
import { computeAchievementData, checkAchievements, ACHIEVEMENTS } from './utils/achievementsMeta'
import { normalizeGoal } from './utils/goalUtils'
import { needsAiCategory, aiCategoryFields, MAX_SORT_TITLES } from './utils/blockCategories'

// Every page renderPage() knows, for validating notification deep links.
const PAGE_IDS = ['welcome', 'statistics', 'tasks', 'daily-log', 'timer', 'calendar', 'goals', 'review', 'shop', 'brain-dump'];

const getLocalDateKey = (offsetDays = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
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
  const [paletteOpen, setPaletteOpen] = useState(false);

  const handleNavigate = (page) => {
    setCurrentPage(page);
    setMobileMenuOpen(false);
  };

  // On phones the window scrolls, so a new page would otherwise open part-way down.
  useLayoutEffect(() => { window.scrollTo(0, 0); }, [currentPage]);

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
    { id: 't1', title: 'Morning Routine', duration: 30, xpAmount: 20, recurrence: 'daily', color: '#fbbf24' },
    { id: 't2', title: 'Deep Work', duration: 90, xpAmount: 50, recurrence: 'none', color: '#38bdf8' },
    { id: 't3', title: 'Workout', duration: 60, xpAmount: 40, recurrence: 'daily', color: '#f87171' },
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
    };
    // Backfill the monotonic lifetime task counter from the (possibly truncated) xpLog
    // once. After this it only grows, so it no longer decays as the 500-entry log rotates.
    // (`level`, `xp` and `lifetimeXp` are old per-action XP fields, now ignored: XP
    // comes from banked Daily Scores, see xpUtils.)
    if (base.lifetimeTaskCount === undefined) {
      const xpLogSaved = localStorage.getItem('gameOfLife_xpLog');
      const log = xpLogSaved ? JSON.parse(xpLogSaved) : [];
      base.lifetimeTaskCount = log.filter(e => e.source === 'task').length;
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
  // Phones start with the small pill so the card doesn't cover the page.
  const [priorityPopupMinimized, setPriorityPopupMinimized] = useState(() => window.matchMedia('(max-width: 768px)').matches);


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

  // The pill opens to show the title + countdown, then shrinks back to an icon.
  const [eventPopupDismissed, setEventPopupDismissed] = useState(false);
  const [eventPillOpen, setEventPillOpen] = useState(true);
  const prevNearestRef = useRef(null);
  useEffect(() => {
    const id = nearestEvent?._ts ?? null;
    if (id !== prevNearestRef.current) {
      setEventPopupDismissed(false);
      setEventPillOpen(true);
      prevNearestRef.current = id;
    }
  }, [nearestEvent]);
  // Home shows its own Now panel and Calendar shows the event itself, so the pill skips them.
  const showEventPill = !!nearestEvent && !eventPopupDismissed && currentPage !== 'welcome' && currentPage !== 'calendar';
  // Only count down while it's on screen, so it isn't already shrunk when you first see it.
  useEffect(() => {
    if (!eventPillOpen || !showEventPill) return;
    const t = setTimeout(() => setEventPillOpen(false), 5000);
    return () => clearTimeout(t);
  }, [eventPillOpen, showEventPill]);

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
  const [scoreBump, setScoreBump] = useState(null);
  // When cloud data last landed (initial load or a live update from another device),
  // so a score change it causes isn't shown as something you just did.
  const remoteAppliedAt = useRef(0);

  // ─── Daily Score ───────────────────────────────────────────────────────────────
  // Computed here (not inside Navbar) so the sidebar chip and any other consumer
  // read one value. Deps are the full state references, not `.length`: ticking a
  // habit writes `habits[i].history[dateKey]` and leaves the array length alone, so
  // a length-keyed memo would leave a stale score on screen until the next reload.
  const scoreInputs = useMemo(
    () => ({ habits, xpLog, logs, commitmentArchive, healthLog, calendarEvents }),
    [habits, xpLog, logs, commitmentArchive, healthLog, calendarEvents]
  );
  const todayKey = useTodayKey();
  const dailyScore = useMemo(() => computeDailyScore(scoreInputs, todayKey), [scoreInputs, todayKey]);

  // The plan from last week's Reset: its priority shows on Home and in the priority
  // card, its experiment gets a nightly tick in Close the Day.
  const weekPlan = useMemo(() => getActivePlan(weeklyReviews, todayKey), [weeklyReviews, todayKey]);
  const currentWeekPriority = weekPlan?.priority || null;

  // ─── Rank ──────────────────────────────────────────────────────────────────────
  // Rank is a "maintain" system: it holds a tier only while the Daily Score keeps
  // clearing that tier's threshold for enough consecutive days, so it can rise AND
  // fall. Computed once here and passed down (rather than letting PlayerDashboard/
  // Navbar recompute it independently) so the transition-detection effect below and
  // every display of it can never silently drift apart.
  const rankStatus = useMemo(
    () => computeRankStatus({ habits, xpLog, logs, commitmentArchive, healthLog, calendarEvents }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [habits.length, xpLog.length, Object.keys(logs).length, commitmentArchive.length, healthLog, calendarEvents]
  );

  // ─── XP: the Daily Score, banked ──────────────────────────────────────────────
  // Each finished day banks round(score × 10) XP in user.xpBank and today is live;
  // level = total / 500 (see xpUtils). The bank shown is always up to date; it's
  // only WRITTEN once the cloud load is done, since a setUser before then marks the
  // user doc as edited here and keeps the cloud copy (with its bank) from loading.
  const xpBank = useMemo(
    () => updateXpBank(scoreInputs, user.xpBank, todayKey),
    [scoreInputs, user.xpBank, todayKey]
  );
  const xpSeries = useMemo(() => getXpSeries(xpBank, todayKey, dailyScore.score), [xpBank, todayKey, dailyScore.score]);
  const xpStatus = useMemo(() => getXpStatus(xpSeries), [xpSeries]);

  useEffect(() => {
    if (!cloudSyncReady || xpBank === user.xpBank) return;
    setUser(prev => ({ ...prev, xpBank }));
  }, [cloudSyncReady, xpBank, user.xpBank]);

  // Level-up: celebrate a level the first time it's reached. `levelSeen` only goes
  // up, so dipping below a level (unticking something) and back doesn't repeat it,
  // and the first run after this change sets the baseline silently.
  useEffect(() => {
    if (!cloudSyncReady) return;
    const seen = user.levelSeen;
    if (seen != null && xpStatus.level <= seen) return;
    setUser(prev => ({ ...prev, levelSeen: Math.max(prev.levelSeen ?? 0, xpStatus.level) }));
    if (seen != null) setLevelUpModal({ level: xpStatus.level, days: daysThatBuiltLevel(xpSeries, xpStatus.level) });
  }, [cloudSyncReady, xpStatus.level, user.levelSeen, xpSeries]);

  // "+0.8 Daily Score" feedback when something you do raises today's score. Rises
  // in quick succession merge into one toast; drops, new days and cloud data don't show.
  const lastScore = useRef({ key: todayKey, score: dailyScore.score });
  useEffect(() => {
    const prev = lastScore.current;
    lastScore.current = { key: todayKey, score: dailyScore.score };
    if (!cloudSyncReady || prev.key !== todayKey) return;
    const delta = Math.round((dailyScore.score - prev.score) * 10) / 10;
    if (delta <= 0 || Date.now() - remoteAppliedAt.current < 2000) return;
    setScoreBump(b => ({
      id: Date.now(),
      delta: Math.round(((b?.delta || 0) + delta) * 10) / 10,
      score: dailyScore.score,
    }));
  }, [dailyScore.score, todayKey, cloudSyncReady]);
  const dismissScoreBump = useCallback(() => setScoreBump(null), []);

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
      remoteAppliedAt.current = Date.now();
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
      remoteAppliedAt.current = Date.now();
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
        const homeBrief = homeBriefFromMorning(brief.text);
        if (homeBrief) setUser(prev => (prev.homeBrief?.date === homeBrief.date ? prev : { ...prev, homeBrief }));
      }
      setPushStateReady(true);
    }).then((fn) => { if (cancelled) fn(); else unsubscribe = fn; }).catch(() => setPushStateReady(true));
    return () => { cancelled = true; unsubscribe?.(); };
  }, [firebaseUser, cloudSyncReady]);

  // ─── Activity Log ─────────────────────────────────────────────────────────────
  // The xpLog is the activity log: the Daily Score counts tasks from it, and the
  // weekly stats count habits from it. Its `amount` no longer moves XP or level.
  // `ref` ties an event to the thing it paid for (a task's id). Before attributes were
  // removed a task logged one event per stat, so older entries may repeat a `ref`.
  // New events carry stat 'xp'; older ones keep the stat they were paid to.
  const logXpEvent = useCallback((amount, source = 'manual', label = '', { ref } = {}) => {
    const today = getLocalDateKey(0);
    const event = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ts: Date.now(),
      date: today,
      stat: 'xp',
      amount,
      source,
      label,
      ...(ref != null ? { ref } : {}),
    };
    setXpLog(prev => {
      const next = [event, ...prev];
      return next.length > 500 ? next.slice(0, 500) : next;
    });
    // Keep a monotonic lifetime task count (the xpLog itself is capped at 500 and
    // rotates, so it can't be trusted for "lifetime" achievement thresholds).
    if (amount > 0 && source === 'task') {
      setUser(prev => ({ ...prev, lifetimeTaskCount: (prev.lifetimeTaskCount || 0) + 1 }));
    }
  }, []);

  // ─── User / XP Functions ───────────────────────────────────────────────────────
  const updateName = (newName) => setUser(prev => ({ ...prev, name: newName }));

  // Every completion (task, habit, block, focus, goal…) is recorded here. It earns no
  // XP by itself: XP is the day's Daily Score, banked (see the XP section above).
  const logActivity = useCallback((amount, meta = {}) => {
    logXpEvent(amount, meta.source || 'manual', meta.label || '', meta);
  }, [logXpEvent]);

  // Toggle a habit for a given day, logging/unlogging the same streak amount as the
  // Tasks page (shared via habitUtils). Lets the daily check-in and the Tasks page stay in sync.
  const handleToggleHabitDay = useCallback((habitId, dateStr) => {
    const habit = habits.find(h => h.id === habitId);
    if (!habit) return;
    const history = { ...(habit.history || {}) };
    if (history[dateStr]) {
      const xp = calcStreakXp(history, dateStr); // streak still includes this day
      delete history[dateStr];
      logActivity(-xp, { source: 'habit', label: habit.name || habit.text });
    } else {
      history[dateStr] = true;
      logActivity(calcStreakXp(history, dateStr), { source: 'habit', label: habit.name || habit.text });
    }
    setHabits(prev => prev.map(h => h.id === habitId ? { ...h, history } : h));
  }, [habits, logActivity]);

  // ─── Pomodoro Session Callback ─────────────────────────────────────────────────
  const handleSessionComplete = useCallback((session) => {
    setPomodoroSessions(prev => [session, ...prev].slice(0, 300));
  }, []);

  // ─── Midnight Rollover ─────────────────────────────────────────────────────────
  const todayStr = () => new Date().toISOString().slice(0, 10);

  // New day: legacy 'tomorrow' tasks become today's, and finished tasks older than
  // a week are cleared out (Tasks keeps them around for "Done today").
  const promoteTomorrowTasks = (currentTodos) =>
    pruneDoneTasks(currentTodos.map(t => t.timeFrame === 'tomorrow' ? { ...t, timeFrame: 'today', xp: 20 } : t));

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
    if (!denied) {
      logActivity(10, { source: 'commitment', label: 'Commitment kept' });
      setCommitmentToast(true);
      setTimeout(() => setCommitmentToast(false), 3200);
    }
    resolveCommitmentRecord(date, text, denied);
  };


  // ─── Achievements Detection ────────────────────────────────────────────────────
  useEffect(() => {
    const data = computeAchievementData(user, xpStatus, habits, xpLog, pomodoroSessions, commitmentArchive, logs, goals);
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
  }, [xpStatus.level, xpStatus.total, xpLog.length, pomodoroSessions.length, commitmentArchive.length, goals]);

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
  // Opens the drawer and sends `text` as your message (the drawer sends a draft on open).
  const askAssistant = (text) => { setAssistantDraft(text); openAssistant(); };
  const closeAssistant = () => { setAssistantOpen(false); markAssistantRead(); };
  const toggleAssistant = useCallback(() => { setAssistantOpen(o => !o); markAssistantRead(); }, [markAssistantRead]);

  // ─── Keyboard Shortcuts ────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      const key = shortcutKeyOf(e);
      // ⌘K / Ctrl+K works even while typing, like every other app's command palette.
      if (key === 'k' && (IS_MAC ? e.metaKey : e.ctrlKey) && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        setPaletteOpen(o => !o);
        return;
      }
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
      // By physical key: Option+1 on a Mac types "¡", so e.key never matched there.
      if (e.altKey && !e.metaKey && !e.ctrlKey) {
        if (ALT_PAGE_KEYS[key]) { e.preventDefault(); setCurrentPage(ALT_PAGE_KEYS[key]); return; }
        if (key === 'm') { e.preventDefault(); toggleAssistant(); return; }
        if (key === 'f') { e.preventDefault(); setFocusModeOpen(true); return; }
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
      user, xp: xpStatus, xpSeries, todos, habits, logs, healthLog, foodPoints, pomodoroSessions, goals, weeklyReviews, xpLog,
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
      goalId: ev.plan?.goalId ?? null,
      intent: ev.plan?.intent || '',
      durationSecs: Math.max(5, minutes) * 60,
    });
    setFocusModeOpen(true);
  }, []);

  const startFocusOnTask = useCallback((task) => {
    setFocusLaunch({ taskId: task.id, intent: '' });
    setFocusModeOpen(true);
  }, []);

  // A goal's Focus button: works on its next task if that's the next step, else on the goal itself.
  const startFocusOnGoal = useCallback((goal, next) => {
    setFocusLaunch(next?.kind === 'task'
      ? { taskId: next.id, goalId: goal.id, intent: '' }
      : { goalId: goal.id, intent: next?.text || '' });
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

  // Every block check-in (Calendar, Home, focus debrief) lands here: same XP rules
  // everywhere, and a task block marked done completes its task too.
  const checkInBlockInstance = (ev, status, reason = null) => {
    const res = checkInBlock(ev, status, { reason });
    if (!res) return null;
    if (res.award) logActivity(res.award.amount, res.award);
    setCalendarEvents(res.update);
    if (res.taskId != null) completeTaskById(res.taskId);
    return res.xp;
  };
  const completeBlockById = (blockId, dateKey) =>
    checkInBlockInstance(findBlockInstance(calendarEvents, blockId, dateKey), 'done');
  const completeTaskById = (taskId) => {
    const done = completeTask(todos.find(t => String(t.id) === String(taskId)));
    if (!done) return null;
    if (done.award) logActivity(done.award.amount, done.award);
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
    assistant.send(checkinPrompt(due.type), { hidden: true, kind: due.type, silent: true }).then((reply) => {
      if (reply) {
        setAssistantCheckins(prev => markCheckinDone(prev, due));
        // The morning briefing's first line doubles as Home's one-liner.
        const homeBrief = due.type === 'morning' ? homeBriefFromMorning(reply) : null;
        if (homeBrief) setUser(prev => ({ ...prev, homeBrief }));
      } else if (reply === false) checkinFailedAt.current[due.type] = Date.now();
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncSettled, clockTick]);

  // Time-block categories: titles no keyword matches go to Gemini in one batch, and
  // the answer is stored on the block (even "other") so no device asks again. Each
  // title is asked once per session; a failed call waits an hour before retrying.
  const { sortBlockCategories } = assistant;
  const categorySortBusy = useRef(false);
  const categorySortAsked = useRef(new Set());
  const categorySortFailedAt = useRef(0);
  useEffect(() => {
    if (!syncSettled || !hasAssistantApiKey() || categorySortBusy.current) return;
    if (Date.now() - categorySortFailedAt.current < 60 * 60 * 1000) return;
    const titles = [...new Set(calendarEvents.filter(needsAiCategory).map(ev => ev.title.trim()))]
      .filter(t => !categorySortAsked.current.has(t))
      .slice(0, MAX_SORT_TITLES);
    if (!titles.length) return;
    // Short wait so a burst of edits (drag, duplicate, undo) becomes one call.
    const timer = setTimeout(async () => {
      categorySortBusy.current = true;
      titles.forEach(t => categorySortAsked.current.add(t));
      const result = await sortBlockCategories(titles);
      categorySortBusy.current = false;
      if (!result.ok) {
        titles.forEach(t => categorySortAsked.current.delete(t));
        categorySortFailedAt.current = Date.now();
        return;
      }
      setCalendarEvents(prev => prev.map(ev => {
        const category = needsAiCategory(ev) ? result.categories[ev.title.trim()] : null;
        return category ? { ...ev, ...aiCategoryFields(category) } : ev;
      }));
    }, 1500);
    return () => clearTimeout(timer);
  }, [syncSettled, calendarEvents, sortBlockCategories]);

  // Home Screen widget: when it's on, publish the snapshot it reads (widgetService.js)
  // a few seconds after any change it shows, and on the 5-minute clock tick for the
  // time-based parts. Skipped when nothing changed, so idle ticks write nothing. The
  // server tick refreshes it too while the app is closed.
  const [widgetSettings, setWidgetSettings] = useState(null);
  useEffect(() => {
    if (!firebaseUser || !cloudSyncReady) return;
    return subscribeWidgetSettings(firebaseUser.uid, setWidgetSettings);
  }, [firebaseUser, cloudSyncReady]);
  useEffect(() => {
    if (firebaseUser && widgetSettings) syncWidgetTimezone(firebaseUser.uid, widgetSettings).catch(() => {});
  }, [firebaseUser, widgetSettings]);

  const widgetToken = firebaseUser ? widgetSettings?.token || null : null;
  const lastWidgetSignature = useRef(null);
  useEffect(() => {
    if (!syncSettled || !widgetToken) return;
    const timer = setTimeout(() => {
      const snapshot = buildWidgetSnapshot({
        todos, habits, logs, xpLog, commitmentArchive, healthLog, calendarEvents, noPhoneBlocks,
        calendarDayEvents, logReviews, user: { categoryColors: user.categoryColors },
      }, new Date());
      const signature = widgetToken + snapshotSignature(snapshot);
      if (signature === lastWidgetSignature.current) return;
      lastWidgetSignature.current = signature;
      publishWidgetSnapshot(firebaseUser.uid, widgetToken, snapshot).catch((err) => {
        lastWidgetSignature.current = null; // retry on the next change or tick
        console.warn('Widget update failed', err);
      });
    }, 3000);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncSettled, widgetToken, clockTick, todos, habits, logs, xpLog, commitmentArchive, healthLog,
    calendarEvents, noPhoneBlocks, calendarDayEvents, logReviews, user.categoryColors]);

  // Home's one-line brief: once per day (after 4am), saved on the user so every
  // device shows the same line. Usually it's the morning check-in's first line;
  // its own model call only runs when there's no morning check-in to wait for
  // (after the morning window, or that check-in failed). Failures retry after an hour.
  const [briefLoading, setBriefLoading] = useState(false);
  const briefInFlight = useRef(false);
  const briefFailedAt = useRef(0);
  const runHomeBrief = useCallback(async (manual = false) => {
    if (briefInFlight.current) return;
    briefInFlight.current = true;
    setBriefLoading(true);
    const result = await assistant.briefHome({ weekPriority: currentWeekPriority, logReviews, background: !manual });
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
    const morningPending = getDueCheckin(now, assistantCheckins, { logs })?.type === 'morning'
      && !(Date.now() - (checkinFailedAt.current.morning || 0) < 60 * 60 * 1000);
    if (morningPending) return;
    runHomeBrief();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncSettled, clockTick, currentPage, user.homeBrief?.date, assistantCheckins?.morning]);

  // Daily Log pattern flags: grouped once per night the first time the Daily Log is
  // open, saved on the user (synced). Skipped until there are enough "improve" notes
  // to repeat; failures retry after an hour.
  const patternsInFlight = useRef(false);
  const patternsFailedAt = useRef(0);
  useEffect(() => {
    if (!syncSettled || currentPage !== 'daily-log' || !hasAssistantApiKey()) return;
    const todayKey = getLocalDateKey(0);
    if (user.logPatterns?.date === todayKey || patternsInFlight.current) return;
    if (Date.now() - patternsFailedAt.current < 60 * 60 * 1000) return;
    if (!hasEnoughForPatterns(logs, todayKey)) return;
    patternsInFlight.current = true;
    assistant.findLogPatterns(todayKey).then((result) => {
      if (result.ok) setUser(prev => ({ ...prev, logPatterns: result.patterns }));
      else patternsFailedAt.current = Date.now();
      patternsInFlight.current = false;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncSettled, clockTick, currentPage, user.logPatterns?.date]);

  const nudges = useMemo(
    () => (syncSettled
      ? computeNudges(new Date(clockTick), { habits, xpLog, logs, commitmentArchive, healthLog, goals, todos, pomodoroSessions, calendarEvents, weeklyReviews }, assistantCheckins)
      : []),
    [syncSettled, clockTick, habits, xpLog, logs, commitmentArchive, healthLog, goals, todos, pomodoroSessions, calendarEvents, weeklyReviews, assistantCheckins]
  );
  // A nudge that only sends you to the page you're already on is pointless, and the
  // Daily Log's Look back step already asks about yesterday's commitment.
  const nudgeIsMoot = (n) => (n.cta.type === 'navigate' && n.cta.page === currentPage)
    || (currentPage === 'daily-log' && n.id.startsWith('commitment_'));
  const activeNudge = nudges.find(n => !nudgeIsMoot(n)) || null;

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
            weekExperiment={weekPlan?.experiment ? { week: weekPlan.week, text: weekPlan.experiment.text } : null}
            logs={logs}
            logReviews={logReviews}
            commitmentArchive={commitmentArchive}
            goals={goals}
            habits={habits}
            pomodoroSessions={pomodoroSessions}
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
            onCheckInBlock={checkInBlockInstance}
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
            onLogActivity={logActivity}
            setTodos={setTodos}
            setHabits={setHabits}
            xpStatus={xpStatus}
            xpSeries={xpSeries}
            commitmentArchive={commitmentArchive}
            xpLog={xpLog}
            pomodoroSessions={pomodoroSessions}
            rankStatus={rankStatus}
            onOpenFocusMode={() => setFocusModeOpen(true)}
            goals={goals}
            healthLog={healthLog}
            noPhoneBlocks={noPhoneBlocks}
            calendarEvents={calendarEvents}
            onNavigate={handleNavigate}
          />
        );
      case 'tasks':
        return (
          <TasksPage
            onLogActivity={logActivity}
            todos={todos}
            setTodos={setTodos}
            xpLog={xpLog}
            goals={goals}
            onStartFocus={startFocusOnTask}
          />
        );
      case 'daily-log':
        return (
          <DailyLogPage
            logs={logs}
            setLogs={setLogs}
            onCommitmentLocked={({ date, text }) => upsertCommitmentRecord(date, text)}
            commitmentArchive={commitmentArchive}
            onResolveCommitment={handleArchiveCommitmentResolve}
            xpLog={xpLog}
            calendarEvents={calendarEvents}
            goals={goals}
            setGoals={setGoals}
            todos={todos}
            pomodoroSessions={pomodoroSessions}
            northStar={user.northStar}
            logPatterns={user.logPatterns}
            habits={habits}
            setHabits={setHabits}
            onToggleHabitDay={handleToggleHabitDay}
            healthLog={healthLog}
            setHealthLog={setHealthLog}
            foodLog={foodLog}
            setFoodLog={setFoodLog}
            foodPoints={foodPoints}
            setFoodPoints={setFoodPoints}
            logReviews={logReviews}
            weekExperiment={weekPlan?.experiment ? { week: weekPlan.week, text: weekPlan.experiment.text } : null}
            onSubmitLog={assistant.reviewLog}
            reviewingDate={assistant.reviewingDate}
            onOpenAssistant={openAssistant}
            onExpandLesson={assistant.expandLesson}
            onCoachImprove={assistant.coachImprove}
            onAskAssistant={askAssistant}
            onNavigate={handleNavigate}
          />
        );
      case 'timer':
        return (
          <TimerPage
            goals={goals}
            onLogActivity={logActivity}
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
            onLogActivity={logActivity}
            todos={todos}
            logs={logs}
            onPlanDay={openPlanner}
            onStartFocus={startFocusFromBlock}
            onCheckInBlock={checkInBlockInstance}
            planner={user.planner}
            categoryColors={user.categoryColors}
            onSaveCategoryColors={(categoryColors) => setUser(prev => ({ ...prev, categoryColors }))}
            goals={goals}
            onNavigate={handleNavigate}
          />
        );
      case 'goals':
        return (
          <GoalsPage
            northStar={user.northStar}
            onSaveNorthStar={(northStar) => setUser(prev => ({ ...prev, northStar }))}
            goals={goals}
            setGoals={setGoals}
            todos={todos}
            setTodos={setTodos}
            onLogActivity={logActivity}
            habits={habits}
            setHabits={setHabits}
            pomodoroSessions={pomodoroSessions}
            calendarEvents={calendarEvents}
            setCalendarEvents={setCalendarEvents}
            plannerSettings={user.planner}
            onCompleteTask={completeTaskById}
            onStartFocus={startFocusOnGoal}
            coachApi={assistant}
          />
        );
      case 'review':
        return (
          <WeeklyReviewPage
            weeklyReviews={weeklyReviews}
            setWeeklyReviews={setWeeklyReviews}
            todayKey={todayKey}
            commitmentArchive={commitmentArchive}
            calendarDayEvents={calendarDayEvents}
            logReviews={logReviews}
            onDraft={assistant.draftWeek}
            onNavigate={handleNavigate}
            xpLog={xpLog}
            xpSeries={xpSeries}
            pomodoroSessions={pomodoroSessions}
            habits={habits}
            todos={todos}
            logs={logs}
            goals={goals}
            healthLog={healthLog}
            calendarEvents={calendarEvents}
            setGoals={setGoals}
            setTodos={setTodos}
            onLogActivity={logActivity}
            onRecalibrate={assistant.recalibrateGoals}
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
        return <PlayerDashboard user={user} onUpdateName={updateName} xpStatus={xpStatus} xpSeries={xpSeries} xpLog={xpLog} pomodoroSessions={pomodoroSessions} habits={habits} todos={todos} logs={logs} commitmentArchive={commitmentArchive} rankStatus={rankStatus} goals={goals} healthLog={healthLog} noPhoneBlocks={noPhoneBlocks} calendarEvents={calendarEvents} onNavigate={handleNavigate} />;
    }
  };

  return (
    <div className="app-container">
      <Navbar
        activePage={currentPage}
        onNavigate={handleNavigate}
        userEmail={user.name}
        xpStatus={xpStatus}
        rankStatus={rankStatus}
        dailyScore={dailyScore.score}
        scoreInputs={scoreInputs}
        todos={todos}
        logReviews={logReviews}
        weeklyReviews={weeklyReviews}
        paletteOpen={paletteOpen}
        onOpenPalette={() => setPaletteOpen(true)}
        onClosePalette={() => setPaletteOpen(false)}
        commands={{
          planDay: () => openPlanner(),
          startFocus: () => setFocusModeOpen(true),
          openAssistant,
          ask: askAssistant,
        }}
        onOpenDataModal={() => setDataModalOpen(true)}
        isMobileMenuOpen={mobileMenuOpen}
        onMobileMenuToggle={() => setMobileMenuOpen(o => !o)}
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
        <LevelUpModal level={levelUpModal.level} days={levelUpModal.days} xpStatus={xpStatus} onClose={() => setLevelUpModal(null)} />
      )}
      {rankChangeModal && (
        <RankChangeModal tier={rankChangeModal.tier} direction={rankChangeModal.direction} streakDays={rankChangeModal.streakDays} onClose={() => setRankChangeModal(null)} />
      )}
      {dataModalOpen && (
        <DataModal onClose={() => setDataModalOpen(false)} />
      )}
      {focusModeOpen && (
        <FocusMode
          key={focusLaunch ? `${focusLaunch.blockId ?? `task${focusLaunch.taskId}`}_${focusLaunch.blockDate}_${focusLaunch.goalId}` : 'free'}
          todos={todos}
          goals={goals}
          onLogActivity={logActivity}
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
            <span className="commitment-toast-label">Counted in today's Daily Score</span>
          </div>
        </div>
      )}

      {scoreBump && (
        <ScoreBumpToast key={scoreBump.id} bump={scoreBump} xpStatus={xpStatus} onDone={dismissScoreBump} />
      )}

      {/* Home shows its own Now panel and weekly priority, so these popups skip it. */}
      {showEventPill && (
        <div className={`event-pill${eventPillOpen ? ' open' : ''}${currentPage === 'daily-log' ? ' event-pill--below-tabs' : ''}`}>
          <button
            className="event-pill-icon"
            onClick={() => setEventPillOpen(o => !o)}
            aria-expanded={eventPillOpen}
            aria-label={`Next event: ${nearestEvent.title}`}
          >
            <CalendarDays size={15} />
          </button>
          <div className="event-pill-body" aria-hidden={!eventPillOpen}>
            <button
              className="event-pill-info"
              onClick={() => setEventPillOpen(false)}
              tabIndex={eventPillOpen ? 0 : -1}
              title={`${nearestEvent.title} · ${formatEventPopupDate(nearestEvent)} ${formatEventPopupTime(nearestEvent)}`}
            >
              <span className="event-pill-title">{nearestEvent.title}</span>
              <span className="event-pill-when">{eventCountdown}</span>
            </button>
            <button
              className="event-pill-close"
              onClick={() => setEventPopupDismissed(true)}
              tabIndex={eventPillOpen ? 0 : -1}
              aria-label="Dismiss next event"
            >
              <X size={13} />
            </button>
          </div>
        </div>
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
    </div>
  );
}

export default App
