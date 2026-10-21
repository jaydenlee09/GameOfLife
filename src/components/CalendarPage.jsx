import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import './CalendarPage.css';
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2, X, PhoneOff, Copy, Check, Circle, ListChecks, NotebookText, Repeat, Play, Sparkles, Palette, CalendarPlus, Target, ChevronDown } from 'lucide-react';
import { xpForBlockMinutes } from '../utils/xpUtils';
import EMOTIONS from '../utils/logMeta';
import {
  toDateKey, buildDayEventTargetMs, fmtRemaining,
  normalizeEvent, expandEventsForDates, isInstanceCompleted,
  cloneSubEvents, cloneBonusTasks, normalizeBonusTask,
  getBlockStatus, getBlockOutcome, PLAN_KEPT_START, blockRange,
  blockKind, BLOCK_KIND_COLORS, BLOCK_KIND_LABELS,
} from '../utils/calendarUtils';
import {
  BLOCK_CATEGORIES, COLOR_SWATCHES, blockColor, blockCategory, categoryColor, categoryMeta,
  storedCategoryFields, categoryFormFields, autoCategoryForForm, applyCategoryForm, isCategoryId,
} from '../utils/blockCategories';
import {
  findFreeSlot, getComingUp, templateCategoryLookup, getSlippedBlocks, handleSlippedBlock, rescheduledCopy, blockMinutes,
} from '../utils/calendarSidebar';
import { dayLabel, getUnscheduledTasks } from '../utils/taskUtils';
import TodayStrip from './calendar/TodayStrip';
import TaskTray from './calendar/TaskTray';
import BlockCheckIn from './calendar/BlockCheckIn';

// ─── Constants ────────────────────────────────────────────────────────────────
const SLOT_HEIGHT = 16;
const SLOTS_PER_HOUR = 4;
const TOTAL_SLOTS = 96;
const TOTAL_HEIGHT = TOTAL_SLOTS * SLOT_HEIGHT;
const MIN_EVENT_SLOTS = 1; // 15 min minimum duration
const HOVER_CARD_DELAY = 320; // ms of dwell before a block's detail card appears
const HOVER_CARD_WIDTH = 268; // keep in sync with .cal-hovercard width in CalendarPage.css
const HOVER_CARD_GAP = 10;    // gap between the block and its card
const HOVER_CARD_MARGIN = 8;  // min distance the card keeps from the viewport edge
const TASK_BLOCK_MINS = 60;   // a task placed from the tray becomes a block this long
const DAYS_LABEL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']; // index = Date#getDay() (0=Sun…6=Sat)
const MONTHS_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ─── Pure Helpers ─────────────────────────────────────────────────────────────
const fmtHour = (h) => {
  if (h === 0) return '12 AM';
  if (h < 12) return `${h} AM`;
  if (h === 12) return '12 PM';
  return `${h - 12} PM`;
};
const fmtTime = (h, m) => {
  const suffix = h < 12 ? 'AM' : 'PM';
  const hour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
};
const fmtDuration = (mins) => {
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
};
// Per-device UI flags (sidebar collapsed etc.). Storage can be blocked or full,
// so a failed read falls back to the default and a failed write is ignored.
const readFlag = (key, fallback) => {
  try {
    const saved = localStorage.getItem(key);
    return saved === 'true' ? true : saved === 'false' ? false : fallback;
  } catch { return fallback; }
};
const writeFlag = (key, value) => {
  try { localStorage.setItem(key, String(value)); } catch { /* not persisted this time */ }
};
const SIDEBAR_OPEN_KEY = 'gameOfLife_calendarSidebarOpen';
// Each sidebar section remembers whether it's collapsed. 'upcoming' keeps its older key.
const SECTION_KEYS = {
  missed: 'gameOfLife_calendarMissedCollapsed',
  tasks: 'gameOfLife_calendarTasksCollapsed',
  blocks: 'gameOfLife_calendarBlocksCollapsed',
  upcoming: 'gameOfLife_calendarUpcomingMinimized',
};

const weekdayOfDateKey = (dateKey) => new Date(dateKey + 'T00:00:00').getDay();
const getMondayOfWeek = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
};
const slotToMinutes = (slot) => slot * 15;
const minsFromEvent = (ev) => ev.startHour * 60 + ev.startMin;
const minsEndFromEvent = (ev) => ev.endHour * 60 + ev.endMin;
const overlaps = (a, b) => minsFromEvent(a) < minsEndFromEvent(b) && minsFromEvent(b) < minsEndFromEvent(a);

const buildColumns = (events) => {
  if (!events.length) return [];
  const sorted = [...events].sort((a, b) => minsFromEvent(a) - minsFromEvent(b));
  const result = sorted.map(e => ({ ...e, colIndex: 0, totalCols: 1 }));
  const clusters = [];
  let cluster = [];
  for (let i = 0; i < result.length; i++) {
    if (!cluster.length) { cluster.push(result[i]); }
    else if (overlaps(cluster[cluster.length - 1], result[i])) { cluster.push(result[i]); }
    else { clusters.push(cluster); cluster = [result[i]]; }
  }
  if (cluster.length) clusters.push(cluster);
  for (const cl of clusters) {
    const cols = [];
    for (const ev of cl) {
      const sm = minsFromEvent(ev);
      let placed = false;
      for (let c = 0; c < cols.length; c++) {
        if (sm >= cols[c]) { ev.colIndex = c; cols[c] = minsEndFromEvent(ev); placed = true; break; }
      }
      if (!placed) { ev.colIndex = cols.length; cols.push(minsEndFromEvent(ev)); }
      ev.totalCols = cols.length;
    }
    const maxCols = cl.reduce((m, e) => Math.max(m, e.colIndex + 1), 0);
    for (const ev of cl) ev.totalCols = maxCols;
  }
  return result;
};

const hasLogContent = (entry) => {
  if (!entry) return false;
  return Boolean(
    (entry.emotions && entry.emotions.length > 0) ||
    (entry.proud && entry.proud.some((v) => v && v.trim())) ||
    (entry.improve && entry.improve.some((v) => v && v.trim())) ||
    (entry.learned && entry.learned.trim()) ||
    (entry.notes && entry.notes.trim()) ||
    (entry.commitment && entry.commitment.trim())
  );
};
const formatLogDate = (dateKey) => {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
};

const isBonusTaskCompleted = (task, ev) => {
  if (ev.recurrence === 'none' || !ev.recurrence) return Boolean(task.completed);
  return task.completedDates?.includes(ev._instanceDate);
};
// Pixel heights of a block's parts (keep in sync with .cal-event-* in CalendarPage.css).
const BLOCK_ROWS = {
  head: 17,     // .cal-event-inner padding + title line
  time: 16,
  checkIn: 21,
  task: { first: 4, row: 19, gap: 3 },  // .cal-event-bonus-list margin-top / row / gap
  step: { first: 3, row: 17, gap: 2 },  // .cal-event-subevents
};
// How many tasks and steps fit under a block's title. Tasks get the room first
// (they're what you tick off); steps take what's left. The rest shows on the
// title's task badge and in the hover card, never as a half-clipped row.
const fitBlockRows = (height, { time, checkIn, tasks, steps }) => {
  let room = height - BLOCK_ROWS.head - (time ? BLOCK_ROWS.time : 0) - (checkIn ? BLOCK_ROWS.checkIn : 0);
  const take = (count, { first, row, gap }) => {
    const n = Math.max(0, Math.min(count, Math.floor((room - first + gap) / (row + gap))));
    if (n) room -= first + n * row + (n - 1) * gap;
    return n;
  };
  const shownTasks = take(tasks, BLOCK_ROWS.task);
  return { shownTasks, shownSteps: take(steps, BLOCK_ROWS.step) };
};
// The check-in saved for this instance (not one derived from `completed`).
const storedOutcome = (ev) => ((ev.recurrence === 'none' || !ev.recurrence) ? ev.outcome : ev.outcomes?.[ev._instanceDate]) || null;
// A task from the tray, as a block. `plan.kind: 'task'` links it, so marking the
// block done also completes the task (see App's checkInBlockInstance).
const taskToBlock = (task, dateKey, startMins) => {
  const start = Math.max(0, Math.min(startMins, 24 * 60 - TASK_BLOCK_MINS));
  const end = Math.min(start + TASK_BLOCK_MINS, 24 * 60 - 1); // the grid ends at 23:59
  return {
    id: Date.now(),
    title: (task.text || 'Task').trim().slice(0, 60),
    date: dateKey,
    startHour: Math.floor(start / 60), startMin: start % 60,
    endHour: Math.floor(end / 60), endMin: end % 60,
    xpAmount: 20,
    recurrence: 'none', recurrenceDays: [], notes: '', subEvents: [], bonusTasks: [],
    completed: false, completedDates: [],
    plan: { kind: 'task', taskId: task.id, intent: '' },
  };
};
const buildDetachedInstanceEvent = (ev, overrides = {}) => {
  const normalizedEvent = normalizeEvent(ev);
  const instanceDate = ev._instanceDate || normalizedEvent.date;

  return {
    id: overrides.id || Date.now(),
    title: overrides.title ?? normalizedEvent.title,
    date: overrides.date ?? instanceDate,
    startHour: overrides.startHour ?? normalizedEvent.startHour,
    startMin: overrides.startMin ?? normalizedEvent.startMin,
    endHour: overrides.endHour ?? normalizedEvent.endHour,
    endMin: overrides.endMin ?? normalizedEvent.endMin,
    xpAmount: overrides.xpAmount ?? normalizedEvent.xpAmount,
    recurrence: 'none',
    notes: overrides.notes ?? normalizedEvent.notes ?? '',
    subEvents: overrides.subEvents ? cloneSubEvents(overrides.subEvents) : cloneSubEvents(normalizedEvent.subEvents),
    bonusTasks: overrides.bonusTasks
      ? cloneBonusTasks(overrides.bonusTasks)
      : normalizedEvent.bonusTasks.map((task, index) => {
          const normalizedTask = normalizeBonusTask(task, index);
          return {
            ...normalizedTask,
            completed: isBonusTaskCompleted(normalizedTask, ev),
            completedDates: [],
          };
        }),
    completed: isInstanceCompleted(ev),
    completedDates: [],
    ...(storedOutcome(ev) ? { outcome: storedOutcome(ev) } : {}),
    ...storedCategoryFields(ev),
  };
};
const buildDetachedNoPhoneInstance = (block, overrides = {}) => {
  const instanceDate = block._instanceDate || block.date;
  return {
    id: overrides.id || Date.now(),
    date: overrides.date ?? instanceDate,
    startHour: overrides.startHour ?? block.startHour,
    startMin: overrides.startMin ?? block.startMin,
    endHour: overrides.endHour ?? block.endHour,
    endMin: overrides.endMin ?? block.endMin,
    label: overrides.label ?? block.label,
    recurrence: 'none',
  };
};

// ─── Default Forms ────────────────────────────────────────────────────────────
const defaultForm = (o = {}) => ({
  title: '', date: toDateKey(new Date()),
  startHour: 9, startMin: 0, endHour: 10, endMin: 0,
  xpAmount: 20, recurrence: 'none', recurrenceDays: [], notes: '', subEvents: [], bonusTasks: [],
  category: null, aiCategory: null, origTitle: '', color: '', ...o,
});
const defaultTmplForm = () => ({ title: '', duration: 60, xpAmount: 20, recurrence: 'none', recurrenceDays: [], category: null });
// A template's own pick, as block fields: a placed block keeps it like an editor pick would.
const tmplCategoryFields = (tmpl) => (isCategoryId(tmpl?.category) ? { category: tmpl.category, categoryBy: 'user' } : {});
const defaultNoPhoneForm = (o = {}) => ({
  date: toDateKey(new Date()), startHour: 8, startMin: 0, endHour: 9, endMin: 0,
  label: 'No Phone', recurrence: 'none', recurrenceDays: [], ...o,
});
const defaultBonusTaskForm = () => ({ title: '', xpAmount: 10 });
const toTimeInput = (h, m) => `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
const parseTimeInput = (val) => { const [h,m] = val.split(':'); return { h: parseInt(h,10), m: parseInt(m,10) }; };

// ─── Main Component ───────────────────────────────────────────────────────────
export default function CalendarPage({
  calendarEvents,
  setCalendarEvents,
  noPhoneBlocks = [],
  setNoPhoneBlocks,
  calendarDayEvents = {},
  setCalendarDayEvents,
  quickEvents,
  setQuickEvents,
  onLogActivity,
  todos = [],
  logs = {},
  onPlanDay,
  onStartFocus,
  onCheckInBlock,
  planner,
  categoryColors = {},
  onSaveCategoryColors,
  goals = [],
  onNavigate,
}) {
  const [view, setView] = useState(() => {
    const saved = localStorage.getItem('gameOfLife_calendarView');
    if (saved === 'day' || saved === 'week' || saved === 'month') return saved;
    return window.innerWidth < 768 ? 'day' : 'week';
  });
  const [anchor, setAnchor] = useState(() => new Date());
  const [modal, setModal] = useState(null);
  const [dayEventModal, setDayEventModal] = useState(null); // { mode: 'create'|'edit', dateKey, id? }
  const [dayEventForm, setDayEventForm] = useState({ title: '', time: '', color: '#38bdf8' });
  const [dayEventErr, setDayEventErr] = useState('');
  const [form, setForm] = useState(defaultForm());
  const [editingId, setEditingId] = useState(null);
  const [editScope, setEditScope] = useState(null);
  const [deleteScope, setDeleteScope] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(() => readFlag(SIDEBAR_OPEN_KEY, true));
  const [collapsed, setCollapsed] = useState(() => Object.fromEntries(
    Object.entries(SECTION_KEYS).map(([id, key]) => [id, readFlag(key, false)]),
  ));
  const [sideNote, setSideNote] = useState(null); // { where: 'slip'|'tmpl', ok, text } after a sidebar one-tap
  const [nextEventMinimized, setNextEventMinimized] = useState(false);
  const [tmplModal, setTmplModal] = useState(null);
  const [tmplForm, setTmplForm] = useState(defaultTmplForm());
  const [newBonusTask, setNewBonusTask] = useState(defaultBonusTaskForm());
  const [dragOver, setDragOver] = useState(null);
  const [draggingTemplate, setDraggingTemplate] = useState(null);
  const [draggingEvent, setDraggingEvent] = useState(null); // { ev, offsetSlots }
  const [resizeSession, setResizeSession] = useState(null); // { ev, edge, startStartSlot, startEndSlot, startClientY }
  const [resizeDeltaSlots, setResizeDeltaSlots] = useState(0);
  const [noPhoneMode, setNoPhoneMode] = useState(false);
  const [npDragStart, setNpDragStart] = useState(null); // { dateKey, slot }
  const [npDragCurrent, setNpDragCurrent] = useState(null); // { dateKey, slot }
  const [noPhoneModal, setNoPhoneModal] = useState(null); // { mode: 'create'|'edit', id? }
  const [noPhoneForm, setNoPhoneForm] = useState(defaultNoPhoneForm());
  const [noPhoneEditScope, setNoPhoneEditScope] = useState(null);
  const [noPhoneDeleteScope, setNoPhoneDeleteScope] = useState(null);
  const [logViewerDate, setLogViewerDate] = useState(null);
  const [checkInEv, setCheckInEv] = useState(null); // block whose "did you do it?" is open
  const [catColorsDraft, setCatColorsDraft] = useState(null); // app-wide category colors being edited (null = closed)
  const [draggingTask, setDraggingTask] = useState(null); // task dragged from the tray
  const [hoverCard, setHoverCard] = useState(null); // { ev, rect } — detail card for a hovered time block
  const hoverTimerRef = useRef(null);
  const hoverAnchorRef = useRef(null); // the .cal-event element the card is glued to
  const hoverCardRef = useRef(null);
  const [currentMinute, setCurrentMinute] = useState(() => { const n = new Date(); return n.getHours()*60+n.getMinutes(); });
  const [nowMs, setNowMs] = useState(() => Date.now());
  const gridRef = useRef(null);
  const todayKey = toDateKey(new Date());

  const getTaskDateKey = (todo) => {
    if (todo.scheduledDate) return todo.scheduledDate;
    if (todo.dueDate) return todo.dueDate;
    if (todo.timeFrame === 'today' || !todo.timeFrame) return todayKey;
    return null;
  };

  useEffect(() => {
    const id = setInterval(() => {
      const n = new Date();
      setCurrentMinute(n.getHours() * 60 + n.getMinutes());
      setNowMs(n.getTime());
    }, 60000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setNowMs(Date.now());
  }, [view, anchor]);

  useEffect(() => {
    localStorage.setItem('gameOfLife_calendarView', view);
  }, [view]);

  useEffect(() => { writeFlag(SIDEBAR_OPEN_KEY, sidebarOpen); }, [sidebarOpen]);
  useEffect(() => {
    Object.entries(SECTION_KEYS).forEach(([id, key]) => writeFlag(key, collapsed[id]));
  }, [collapsed]);

  useEffect(() => {
    if (gridRef.current) {
      const pct = currentMinute / (24*60);
      gridRef.current.scrollTop = Math.max(0, pct * gridRef.current.scrollHeight - 200);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Date Ranges ────────────────────────────────────────────────────────────
  const weekDates = (() => {
    const mon = getMondayOfWeek(anchor);
    return Array.from({length:7},(_,i)=>{ const d=new Date(mon); d.setDate(d.getDate()+i); return d; });
  })();

  const monthCalDates = (() => {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const startOfGrid = getMondayOfWeek(first);
    return Array.from({length:42},(_,i)=>{ const d=new Date(startOfGrid); d.setDate(d.getDate()+i); return d; });
  })();

  const activeDates = view === 'day' ? [anchor] : view === 'week' ? weekDates : monthCalDates;
  const activeDateKeys = activeDates.map(toDateKey);

  // ─── Navigation ─────────────────────────────────────────────────────────────
  const navigate = (dir) => setAnchor(prev => {
    const d = new Date(prev);
    if (view === 'day') d.setDate(d.getDate() + dir);
    else if (view === 'week') d.setDate(d.getDate() + dir*7);
    else d.setMonth(d.getMonth() + dir);
    return d;
  });
  const goToday = () => setAnchor(new Date());

  const headerLabel = () => {
    if (view === 'day') return `${DAYS_LABEL[anchor.getDay()]} ${MONTHS_SHORT[anchor.getMonth()]} ${anchor.getDate()}, ${anchor.getFullYear()}`;
    if (view === 'week') {
      const first = weekDates[0], last = weekDates[6];
      if (first.getMonth() === last.getMonth()) return `${MONTHS_FULL[first.getMonth()]} ${first.getFullYear()}`;
      return `${MONTHS_SHORT[first.getMonth()]} – ${MONTHS_SHORT[last.getMonth()]} ${last.getFullYear()}`;
    }
    return `${MONTHS_FULL[anchor.getMonth()]} ${anchor.getFullYear()}`;
  };

  // ─── Modal Helpers ───────────────────────────────────────────────────────────
  const openCreate = (date, slot, fromTemplate = null) => {
    const startMins = slotToMinutes(slot);
    const endMins = fromTemplate ? startMins + fromTemplate.duration : startMins + 60;
    const clampEnd = Math.min(endMins, 24*60 - 1);
    setForm(defaultForm({
      date,
      startHour: Math.floor(startMins/60), startMin: startMins%60,
      endHour: Math.floor(clampEnd/60), endMin: clampEnd%60,
      ...(fromTemplate ? { title: fromTemplate.title, xpAmount: fromTemplate.xpAmount, recurrence: fromTemplate.recurrence, recurrenceDays: [...(fromTemplate.recurrenceDays || [])], category: isCategoryId(fromTemplate.category) ? fromTemplate.category : null } : {}),
    }));
    setEditingId(null);
    setNewBonusTask(defaultBonusTaskForm());
    setModal('create');
  };

  const openEdit = (ev) => {
    if (ev.recurrence !== 'none' && ev._isVirtual) { setEditScope({ show: true, ev }); return; }
    const normalizedEvent = normalizeEvent(ev);
    setForm({ title: normalizedEvent.title, date: normalizedEvent.date, startHour: normalizedEvent.startHour, startMin: normalizedEvent.startMin, endHour: normalizedEvent.endHour, endMin: normalizedEvent.endMin, xpAmount: normalizedEvent.xpAmount, recurrence: normalizedEvent.recurrence, recurrenceDays: normalizedEvent.recurrenceDays.length ? normalizedEvent.recurrenceDays : [weekdayOfDateKey(normalizedEvent.date)], notes: normalizedEvent.notes || '', subEvents: cloneSubEvents(normalizedEvent.subEvents), bonusTasks: cloneBonusTasks(normalizedEvent.bonusTasks), ...categoryFormFields(normalizedEvent) });
    setEditingId(ev.id);
    setNewBonusTask(defaultBonusTaskForm());
    setModal('edit');
  };

  const openDayEventCreate = (dateKey) => {
    setDayEventErr('');
    setDayEventForm({ title: '', time: '', color: '#38bdf8' });
    setDayEventModal({ mode: 'create', dateKey });
  };

  const openDayEventEdit = (dateKey, item) => {
    if (!dateKey || !item?.id) return;
    setDayEventErr('');
    setDayEventForm({
      title: item.title || '',
      time: item.time || '',
      color: item.color || '#38bdf8',
    });
    setDayEventModal({ mode: 'edit', dateKey, id: item.id });
  };

  const openLogViewer = (dateKey) => setLogViewerDate(dateKey);
  const closeLogViewer = () => setLogViewerDate(null);

  const closeDayEventModal = () => {
    setDayEventModal(null);
    setDayEventErr('');
    setDayEventForm({ title: '', time: '', color: '#38bdf8' });
  };

  const closeModal = () => { setModal(null); setEditingId(null); setEditScope(null); setDeleteScope(null); setNewSubEvent(''); setNewBonusTask(defaultBonusTaskForm()); };

  const saveDayEvent = () => {
    const dateKey = dayEventModal?.dateKey;
    const title = dayEventForm.title.trim();
    if (!dateKey) return;
    if (!title) { setDayEventErr('Title is required.'); return; }
    const time = (dayEventForm.time || '').trim();
    const color = (dayEventForm.color || '#38bdf8').trim();
    if (typeof setCalendarDayEvents === 'function') {
      setCalendarDayEvents((prev) => {
        const base = prev && typeof prev === 'object' ? prev : {};
        const next = { ...base };
        const existing = Array.isArray(next[dateKey]) ? next[dateKey] : [];

        if (dayEventModal?.mode === 'edit' && dayEventModal?.id) {
          next[dateKey] = existing.map((evt) =>
            evt.id === dayEventModal.id
              ? { ...evt, title, time: time || null, color }
              : evt
          );
        } else {
          const newItem = {
            id: Date.now(),
            title,
            time: time || null,
            color,
            createdAtMs: Date.now(),
          };
          next[dateKey] = [...existing, newItem];
        }
        return next;
      });
    }
    closeDayEventModal();
  };

  const buildEventFromForm = (id) => applyCategoryForm({
    id: id || Date.now(), title: form.title.trim(), date: form.date,
    startHour: form.startHour, startMin: form.startMin, endHour: form.endHour, endMin: form.endMin,
    xpAmount: Number(form.xpAmount)||20, recurrence: form.recurrence, recurrenceDays: form.recurrenceDays||[],
    notes: form.notes||'', subEvents: cloneSubEvents(form.subEvents||[]), bonusTasks: cloneBonusTasks(form.bonusTasks||[]), completed: false, completedDates: [],
  }, form);

  const isFormValid = () => form.title.trim() && (form.endHour*60+form.endMin) > (form.startHour*60+form.startMin);

  const saveEvent = () => { if (!isFormValid()) return; setCalendarEvents(prev=>[...prev, buildEventFromForm()]); closeModal(); };

  const updateEvent = (scope='all') => {
    if (!isFormValid()) return;
    if (scope === 'all') {
      setCalendarEvents(prev=>prev.map(ev=>ev.id!==editingId?ev:applyCategoryForm({
        ...ev, title:form.title.trim(), startHour:form.startHour, startMin:form.startMin,
        endHour:form.endHour, endMin:form.endMin, xpAmount:Number(form.xpAmount)||20,
        recurrence:form.recurrence, recurrenceDays:form.recurrenceDays||[], notes:form.notes||'', subEvents:cloneSubEvents(form.subEvents||[]), bonusTasks:cloneBonusTasks(form.bonusTasks||[]),
      }, form)));
    } else {
      setCalendarEvents(prev=>[
        ...prev.map(ev=>ev.id!==editingId?ev:{...ev,_exceptDates:[...(ev._exceptDates||[]),form.date]}),
        {...buildEventFromForm(), id:Date.now()},
      ]);
    }
    closeModal();
  };

  const handleEditScopeSelect = (scope) => {
    const ev = editScope.ev;
    const normalizedEvent = normalizeEvent(ev);
    const instanceBonusTasks = normalizedEvent.bonusTasks.map((task, index) => {
      const normalizedTask = normalizeBonusTask(task, index);
      return ev.recurrence !== 'none' && ev._isVirtual
        ? { ...normalizedTask, completed: isBonusTaskCompleted(normalizedTask, ev), completedDates: [] }
        : normalizedTask;
    });
    setForm({ title:normalizedEvent.title, date:ev._instanceDate, startHour:normalizedEvent.startHour, startMin:normalizedEvent.startMin, endHour:normalizedEvent.endHour, endMin:normalizedEvent.endMin, xpAmount:normalizedEvent.xpAmount, recurrence:normalizedEvent.recurrence, recurrenceDays: normalizedEvent.recurrenceDays.length ? normalizedEvent.recurrenceDays : [weekdayOfDateKey(normalizedEvent.date)], notes:normalizedEvent.notes||'', subEvents:cloneSubEvents(normalizedEvent.subEvents), bonusTasks:instanceBonusTasks, ...categoryFormFields(normalizedEvent) });
    setEditingId(ev.id);
    setEditScope(null);
    setNewBonusTask(defaultBonusTaskForm());
    if (scope === 'this') {
      const newId = Date.now();
      setCalendarEvents(prev=>[
        ...prev.map(e=>e.id===ev.id?{...e,_exceptDates:[...(e._exceptDates||[]),ev._instanceDate]}:e),
        buildDetachedInstanceEvent(ev, { id: newId }),
      ]);
      setTimeout(()=>setEditingId(newId),0);
    }
    setModal('edit');
  };

  // ─── Duplicate ───────────────────────────────────────────────────────────────
  const duplicateEvent = (ev, e) => {
    e.stopPropagation();
    // eslint-disable-next-line no-unused-vars
    const { outcome, ...copy } = buildDetachedInstanceEvent(ev, { id: Date.now() });
    const newEvent = { ...copy, completed: false, completedDates: [] };
    setCalendarEvents(prev => [...prev, newEvent]);
  };

  // ─── Delete ──────────────────────────────────────────────────────────────────
  const requestDelete = (ev, e) => {
    e.stopPropagation();
    if (ev.recurrence !== 'none') { setDeleteScope({ show:true, ev }); return; }
    setCalendarEvents(prev=>prev.filter(e=>e.id!==ev.id));
  };
  const handleDeleteScope = (scope) => {
    const ev = deleteScope.ev;
    if (scope==='this') setCalendarEvents(prev=>prev.map(e=>e.id===ev.id?{...e,_exceptDates:[...(e._exceptDates||[]),ev._instanceDate]}:e));
    else if (scope==='this-forward') setCalendarEvents(prev=>prev.map(e=>e.id===ev.id?{...e,_forwardDeleteFrom:ev._instanceDate}:e));
    else setCalendarEvents(prev=>prev.filter(e=>e.id!==ev.id));
    setDeleteScope(null);
  };

  // ─── No-Phone Block CRUD ───────────────────────────────────────────────────────
  const openNoPhoneCreate = (dateKey, startSlot, endSlot) => {
    const startMins = slotToMinutes(Math.min(startSlot, endSlot));
    const endMins = slotToMinutes(Math.max(startSlot, endSlot) + 1);
    setNoPhoneForm(defaultNoPhoneForm({
      date: dateKey,
      startHour: Math.floor(startMins/60), startMin: startMins%60,
      endHour: Math.floor(endMins/60), endMin: endMins%60,
    }));
    setNoPhoneModal({ mode: 'create' });
  };
  const openNoPhoneEdit = (block) => {
    if (block.recurrence !== 'none' && block._isVirtual) { setNoPhoneEditScope({ show: true, block }); return; }
    const recurrenceDays = Array.isArray(block.recurrenceDays) && block.recurrenceDays.length ? block.recurrenceDays : [weekdayOfDateKey(block.date)];
    setNoPhoneForm({ date: block.date, startHour: block.startHour, startMin: block.startMin, endHour: block.endHour, endMin: block.endMin, label: block.label || 'No Phone', recurrence: block.recurrence || 'none', recurrenceDays });
    setNoPhoneModal({ mode: 'edit', id: block.id });
  };
  const closeNoPhoneModal = () => { setNoPhoneModal(null); setNoPhoneEditScope(null); setNoPhoneDeleteScope(null); };

  const isNoPhoneFormValid = () => (noPhoneForm.endHour*60+noPhoneForm.endMin) > (noPhoneForm.startHour*60+noPhoneForm.startMin);
  const buildNoPhoneFromForm = (id) => ({
    id: id || Date.now(), date: noPhoneForm.date,
    startHour: noPhoneForm.startHour, startMin: noPhoneForm.startMin, endHour: noPhoneForm.endHour, endMin: noPhoneForm.endMin,
    label: noPhoneForm.label.trim() || 'No Phone', recurrence: noPhoneForm.recurrence, recurrenceDays: noPhoneForm.recurrenceDays||[],
  });
  const saveNoPhoneBlock = () => { if (!isNoPhoneFormValid()) return; setNoPhoneBlocks(prev=>[...prev, buildNoPhoneFromForm()]); closeNoPhoneModal(); };
  const updateNoPhoneBlock = (scope='all') => {
    if (!isNoPhoneFormValid()) return;
    if (scope === 'all') {
      setNoPhoneBlocks(prev=>prev.map(b=>b.id!==noPhoneModal.id?b:{
        ...b, startHour:noPhoneForm.startHour, startMin:noPhoneForm.startMin,
        endHour:noPhoneForm.endHour, endMin:noPhoneForm.endMin, label:noPhoneForm.label.trim()||'No Phone', recurrence:noPhoneForm.recurrence, recurrenceDays:noPhoneForm.recurrenceDays||[],
      }));
    } else {
      setNoPhoneBlocks(prev=>[
        ...prev.map(b=>b.id!==noPhoneModal.id?b:{...b,_exceptDates:[...(b._exceptDates||[]),noPhoneForm.date]}),
        {...buildNoPhoneFromForm(), id:Date.now()},
      ]);
    }
    closeNoPhoneModal();
  };
  const handleNoPhoneEditScopeSelect = (scope) => {
    const block = noPhoneEditScope.block;
    const recurrenceDays = Array.isArray(block.recurrenceDays) && block.recurrenceDays.length ? block.recurrenceDays : [weekdayOfDateKey(block.date)];
    setNoPhoneForm({ date: block._instanceDate, startHour: block.startHour, startMin: block.startMin, endHour: block.endHour, endMin: block.endMin, label: block.label || 'No Phone', recurrence: block.recurrence, recurrenceDays });
    setNoPhoneEditScope(null);
    if (scope === 'this') {
      const newId = Date.now();
      setNoPhoneBlocks(prev=>[
        ...prev.map(b=>b.id===block.id?{...b,_exceptDates:[...(b._exceptDates||[]),block._instanceDate]}:b),
        buildDetachedNoPhoneInstance(block, { id: newId }),
      ]);
      setTimeout(()=>setNoPhoneModal({ mode:'edit', id:newId }),0);
    } else {
      setNoPhoneModal({ mode: 'edit', id: block.id });
    }
  };
  const requestDeleteNoPhone = (block, e) => {
    e.stopPropagation();
    if (block.recurrence !== 'none') { setNoPhoneDeleteScope({ show:true, block }); return; }
    setNoPhoneBlocks(prev=>prev.filter(b=>b.id!==block.id));
  };
  const handleNoPhoneDeleteScope = (scope) => {
    const block = noPhoneDeleteScope.block;
    if (scope==='this') setNoPhoneBlocks(prev=>prev.map(b=>b.id===block.id?{...b,_exceptDates:[...(b._exceptDates||[]),block._instanceDate]}:b));
    else if (scope==='this-forward') setNoPhoneBlocks(prev=>prev.map(b=>b.id===block.id?{...b,_forwardDeleteFrom:block._instanceDate}:b));
    else setNoPhoneBlocks(prev=>prev.filter(b=>b.id!==block.id));
    setNoPhoneDeleteScope(null);
  };

  // ─── No-Phone adherence: honoring a block is logged, so it's a tracked commitment ──
  const isNoPhoneHonored = (block) => (block.recurrence==='none'||!block.recurrence)
    ? !!block.honored
    : (block.honoredDates||[]).includes(block._instanceDate);

  const honorNoPhoneBlock = (block, e) => {
    e.stopPropagation();
    if (isNoPhoneHonored(block)) return;
    // Logged with the block's length, like any other block.
    const xp = Math.max(1, xpForBlockMinutes(minsEndFromEvent(block) - minsFromEvent(block)));
    onLogActivity(xp, { source: 'nophone', label: block.label || 'No-phone time honored' });
    if (block.recurrence==='none'||!block.recurrence) {
      setNoPhoneBlocks(prev=>prev.map(b=>b.id===block.id?{...b,honored:true}:b));
    } else {
      setNoPhoneBlocks(prev=>prev.map(b=>b.id===block.id?{...b,honoredDates:[...(b.honoredDates||[]),block._instanceDate]}:b));
    }
  };

  // ─── No-Phone Drag-to-create ───────────────────────────────────────────────────
  const handleNoPhoneSlotMouseDown = (dateKey, slot) => {
    if (!noPhoneMode) return;
    setNpDragStart({ dateKey, slot });
    setNpDragCurrent({ dateKey, slot });
  };
  const handleNoPhoneSlotMouseEnter = (dateKey, slot) => {
    if (!noPhoneMode || !npDragStart || npDragStart.dateKey !== dateKey) return;
    setNpDragCurrent({ dateKey, slot });
  };
  const npDragCurrentRef = useRef(null);
  npDragCurrentRef.current = npDragCurrent;
  useEffect(() => {
    if (!npDragStart) return;
    const finalize = () => {
      const current = npDragCurrentRef.current || npDragStart;
      openNoPhoneCreate(npDragStart.dateKey, npDragStart.slot, current.slot);
      setNpDragStart(null);
      setNpDragCurrent(null);
    };
    window.addEventListener('mouseup', finalize);
    return () => window.removeEventListener('mouseup', finalize);
  }, [npDragStart]);

  // ─── Check in ─────────────────────────────────────────────────────────────────
  // Done / Partly / Skipped all go through App (same XP rules everywhere; a task
  // block marked done completes its task too).
  const checkIn = (ev, status, reason) => {
    onCheckInBlock?.(ev, status, reason);
    setCheckInEv(null);
  };
  const openCheckIn = (ev, e) => {
    e?.stopPropagation();
    cancelHoverCard();
    setCheckInEv(ev);
  };

  // ─── Tray: tasks into time blocks ────────────────────────────────────────────
  // Schedule = the first free hour left today, inside the usual day set in the planner.
  // Tray "Schedule": the first free hour on the task's own day (today unless it's set for later).
  const scheduleTask = (task, dateKey = todayKey) => {
    const start = findFreeSlot({ dateKey, minutes: TASK_BLOCK_MINS, planner, calendarEvents });
    const day = dateKey === todayKey ? null : dayLabel(dateKey, todayKey);
    if (start == null) {
      return { ok: false, text: day
        ? `No free hour left on ${day}. Drag it onto the grid instead.`
        : 'No free hour left today. Make room on the grid, or plan it for tomorrow.' };
    }
    const block = taskToBlock(task, dateKey, start);
    setCalendarEvents((prev) => [...prev, block]);
    return { ok: true, text: `Scheduled for ${day ? `${day}, ` : ''}${fmtTime(block.startHour, block.startMin)}.` };
  };

  useEffect(() => {
    if (!sideNote) return undefined;
    const id = setTimeout(() => setSideNote(null), 4000);
    return () => clearTimeout(id);
  }, [sideNote]);

  // Missed: a slipped block goes into today's first free slot of the same length (the
  // original is marked handled, and Skipped if it was never answered), or is let go.
  const rescheduleSlipped = (ev) => {
    const minutes = Math.max(15, blockMinutes(ev));
    const start = findFreeSlot({ dateKey: todayKey, minutes, planner, calendarEvents });
    if (start == null) { setSideNote({ where: 'slip', ok: false, text: `No free ${fmtDuration(minutes)} left today. Let it go, or drag time around on the grid.` }); return; }
    const copy = rescheduledCopy(ev, todayKey, start);
    setCalendarEvents((prev) => [...handleSlippedBlock(ev, 'rescheduled')(prev), copy]);
    setSideNote({ where: 'slip', ok: true, text: `${ev.title} moved to ${fmtTime(copy.startHour, copy.startMin)} today.` });
  };
  const letGoSlipped = (ev) => setCalendarEvents(handleSlippedBlock(ev, 'let-go'));

  // Quick block one-tap: today's first free slot that fits. A one-off template becomes
  // the same block drag + Save would make; a repeating one opens the form at that slot,
  // so a series never starts without you seeing it.

  const placeTemplate = (tmpl) => {
    const minutes = Math.max(15, Number(tmpl.duration) || 60);
    const start = findFreeSlot({ dateKey: todayKey, minutes, planner, calendarEvents });
    if (start == null) { setSideNote({ where: 'tmpl', ok: false, text: `No free ${fmtDuration(minutes)} left today. Drag it onto another day.` }); return; }
    if (tmpl.recurrence && tmpl.recurrence !== 'none') { openCreate(todayKey, start / 15, tmpl); return; }
    const end = Math.min(start + minutes, 24 * 60 - 1);
    setCalendarEvents((prev) => [...prev, {
      id: Date.now(), title: (tmpl.title || 'Block').trim(), date: todayKey,
      startHour: Math.floor(start / 60), startMin: start % 60,
      endHour: Math.floor(end / 60), endMin: end % 60,
      xpAmount: Number(tmpl.xpAmount) || 20, recurrence: 'none', recurrenceDays: [],
      notes: '', subEvents: [], bonusTasks: [], completed: false, completedDates: [],
      ...tmplCategoryFields(tmpl),
    }]);
    setSideNote({ where: 'tmpl', ok: true, text: `${tmpl.title} placed at ${fmtTime(Math.floor(start / 60), start % 60)}.` });
  };

  const setBonusTaskCompletion = (ev, task, shouldBeCompleted) => {
    const normalizedEvent = normalizeEvent(ev);
    const normalizedTask = normalizeBonusTask(task);
    const isRecurring = !(normalizedEvent.recurrence === 'none' || !normalizedEvent.recurrence);
    const instanceDate = normalizedEvent._instanceDate || normalizedEvent.date;

    if (!instanceDate) return;

    const currentlyCompleted = isBonusTaskCompleted(normalizedTask, { ...normalizedEvent, _instanceDate: instanceDate });
    if (currentlyCompleted === shouldBeCompleted) return;

    const xpDelta = shouldBeCompleted ? normalizedTask.xpAmount : -normalizedTask.xpAmount;
    onLogActivity(xpDelta, { source: 'calendar', label: normalizedTask.title });

    if (!isRecurring) {
      setCalendarEvents((prev) => prev.map((calendarEvent) => {
        if (calendarEvent.id !== normalizedEvent.id) return calendarEvent;
        const stored = normalizeEvent(calendarEvent);
        return {
          ...stored,
          bonusTasks: stored.bonusTasks.map((bonusTask, index) => {
            const bt = normalizeBonusTask(bonusTask, index);
            return bt.id === normalizedTask.id ? { ...bt, completed: shouldBeCompleted } : bt;
          }),
        };
      }));
      setForm((currentForm) => ({
        ...currentForm,
        bonusTasks: (currentForm.bonusTasks || []).map((bonusTask, index) => {
          const bt = normalizeBonusTask(bonusTask, index);
          return bt.id === normalizedTask.id ? { ...bt, completed: shouldBeCompleted } : bt;
        }),
      }));
      return;
    }

    setCalendarEvents((prev) => prev.map((calendarEvent) => {
      if (calendarEvent.id !== normalizedEvent.id) return calendarEvent;
      const stored = normalizeEvent(calendarEvent);
      return {
        ...stored,
        bonusTasks: stored.bonusTasks.map((bonusTask, index) => {
          const bt = normalizeBonusTask(bonusTask, index);
          if (bt.id !== normalizedTask.id) return bt;
          const existingDates = Array.isArray(bt.completedDates) ? bt.completedDates : [];
          const nextDates = shouldBeCompleted
            ? existingDates.includes(instanceDate) ? existingDates : [...existingDates, instanceDate]
            : existingDates.filter((d) => d !== instanceDate);
          return { ...bt, completedDates: nextDates };
        }),
      };
    }));
    setForm((currentForm) => ({
      ...currentForm,
      bonusTasks: (currentForm.bonusTasks || []).map((bonusTask, index) => {
        const bt = normalizeBonusTask(bonusTask, index);
        if (bt.id !== normalizedTask.id) return bt;
        const existingDates = Array.isArray(bt.completedDates) ? bt.completedDates : [];
        const nextDates = shouldBeCompleted
          ? existingDates.includes(instanceDate) ? existingDates : [...existingDates, instanceDate]
          : existingDates.filter((d) => d !== instanceDate);
        return { ...bt, completedDates: nextDates };
      }),
    }));
  };

  const toggleBonusTaskCompletion = (ev, task) => {
    const normalizedEvent = normalizeEvent(ev);
    const normalizedTask = normalizeBonusTask(task);
    const instanceDate = normalizedEvent._instanceDate || normalizedEvent.date;
    const done = isBonusTaskCompleted(normalizedTask, { ...normalizedEvent, _instanceDate: instanceDate });
    setBonusTaskCompletion({ ...normalizedEvent, _instanceDate: instanceDate }, normalizedTask, !done);
  };

  const completeBonusTask = (ev, task, e) => {
    e.stopPropagation();
    toggleBonusTaskCompletion(ev, task);
  };

  // ─── Drag & Drop ─────────────────────────────────────────────────────────────
  const handleTemplateDragStart = (e, tmpl) => { setDraggingTemplate(tmpl); e.dataTransfer.effectAllowed='copy'; };

  const handleEventDragStart = (e, ev) => {
    e.stopPropagation();
    const startSlot = ev.startHour * SLOTS_PER_HOUR + Math.round(ev.startMin / 15);
    setDraggingEvent({ ev, startSlot });
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleSlotDragOver = (e, date, slot) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = draggingEvent ? 'move' : 'copy';
    setDragOver({date, slot});
  };

  const handleSlotDrop = (e, date, slot) => {
    e.preventDefault();
    if (draggingEvent) {
      const { ev } = draggingEvent;
      const durationSlots = (minsEndFromEvent(ev) - minsFromEvent(ev)) / 15;
      let newStartSlot = slot;
      let newEndSlot = newStartSlot + durationSlots;
      // clamp to 0–96
      if (newStartSlot < 0) { newEndSlot -= newStartSlot; newStartSlot = 0; }
      if (newEndSlot > TOTAL_SLOTS) { newStartSlot -= (newEndSlot - TOTAL_SLOTS); newEndSlot = TOTAL_SLOTS; }
      const newStartH = Math.floor(newStartSlot / SLOTS_PER_HOUR);
      const newStartM = (newStartSlot % SLOTS_PER_HOUR) * 15;
      const newEndH = Math.floor(newEndSlot / SLOTS_PER_HOUR);
      const newEndM = (newEndSlot % SLOTS_PER_HOUR) * 15;
      if (ev.recurrence !== 'none' && ev._isVirtual && date !== ev._instanceDate) {
        // Moving a recurring instance to a different date — detach and save as one-off
        setCalendarEvents(prev => [
          ...prev.map(e => e.id === ev.id ? { ...e, _exceptDates: [...(e._exceptDates || []), ev._instanceDate] } : e),
          buildDetachedInstanceEvent(ev, {
            id: Date.now(),
            date,
            startHour: newStartH,
            startMin: newStartM,
            endHour: newEndH,
            endMin: newEndM,
          }),
        ]);
      } else if (ev.recurrence !== 'none' && ev._isVirtual) {
        // Same date, just retime — detach this instance
        setCalendarEvents(prev => [
          ...prev.map(e => e.id === ev.id ? { ...e, _exceptDates: [...(e._exceptDates || []), ev._instanceDate] } : e),
          buildDetachedInstanceEvent(ev, {
            id: Date.now(),
            date,
            startHour: newStartH,
            startMin: newStartM,
            endHour: newEndH,
            endMin: newEndM,
          }),
        ]);
      } else {
        setCalendarEvents(prev => prev.map(e => e.id === ev.id
          ? { ...e, date, startHour: newStartH, startMin: newStartM, endHour: newEndH, endMin: newEndM }
          : e
        ));
      }
    } else if (draggingTemplate) {
      openCreate(date, slot, draggingTemplate);
    } else if (draggingTask) {
      const task = draggingTask;
      setCalendarEvents((prev) => [...prev, taskToBlock(task, date, slotToMinutes(slot))]);
    }
    handleDragEnd();
  };

  const handleDragEnd = () => { setDragOver(null); setDraggingTemplate(null); setDraggingEvent(null); setDraggingTask(null); };

  // ─── Event Resize (drag top/bottom edge, snapped to 15-min increments) ───────
  const resizeSessionRef = useRef(null);
  resizeSessionRef.current = resizeSession;
  const resizeDeltaRef = useRef(0);

  // ─── Time-block hover detail card ───────────────────────────────────────────
  // The card is rendered as a position:fixed sibling at the .cal-page root, not
  // inside the block: .cal-event is overflow:hidden and lives inside
  // .cal-scroll-area (overflow-y:auto), so a nested card would be clipped.
  const cancelHoverCard = () => {
    clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = null;
    hoverAnchorRef.current = null;
    setHoverCard(prev => (prev ? null : prev));
  };

  const handleEventHoverEnter = (e, ev) => {
    // Touch taps fire a synthetic mouseenter; there the tap already opens the
    // full edit modal, so the card is for genuinely hover-capable pointers only.
    if (!window.matchMedia?.('(hover: hover)').matches) return;
    if (resizeSession || draggingEvent || noPhoneMode) return;
    const el = e.currentTarget;
    clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      hoverAnchorRef.current = el;
      setHoverCard({ ev, rect: el.getBoundingClientRect() });
    }, HOVER_CARD_DELAY);
  };

  useEffect(() => () => clearTimeout(hoverTimerRef.current), []);

  // Keep the card glued to its block while the grid scrolls under the cursor.
  const hoverCardOpen = Boolean(hoverCard);
  useEffect(() => {
    if (!hoverCardOpen) return undefined;
    const reposition = () => {
      const el = hoverAnchorRef.current;
      if (!el || !el.isConnected) { cancelHoverCard(); return; }
      setHoverCard(prev => (prev ? { ...prev, rect: el.getBoundingClientRect() } : prev));
    };
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [hoverCardOpen]);

  const hoverCardVisible = Boolean(hoverCard) && !modal && !resizeSession && !draggingEvent;

  // Position after paint: prefer the right of the block, flip left near the right
  // edge, clamp into the viewport vertically. The card mounts hidden (CSS) and is
  // revealed here so it is never painted at a stale position.
  useLayoutEffect(() => {
    const el = hoverCardRef.current;
    if (!hoverCardVisible || !el) return undefined;
    const r = hoverCard.rect;
    const { width: cw, height: ch } = el.getBoundingClientRect();
    let left = r.right + HOVER_CARD_GAP;
    if (left + cw > window.innerWidth - HOVER_CARD_MARGIN) {
      const flipped = r.left - HOVER_CARD_GAP - cw;
      left = flipped >= HOVER_CARD_MARGIN ? flipped : Math.max(HOVER_CARD_MARGIN, window.innerWidth - HOVER_CARD_MARGIN - cw);
    }
    let top = r.top;
    if (top + ch > window.innerHeight - HOVER_CARD_MARGIN) top = window.innerHeight - HOVER_CARD_MARGIN - ch;
    if (top < HOVER_CARD_MARGIN) top = HOVER_CARD_MARGIN;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.visibility = 'visible';
    // Fade in on the frame after placement so the transition actually runs.
    const raf = requestAnimationFrame(() => { el.style.opacity = '1'; });
    return () => cancelAnimationFrame(raf);
  }, [hoverCardVisible, hoverCard]);

  const beginEventResize = (e, ev, edge) => {
    e.stopPropagation();
    e.preventDefault();
    const startStartSlot = ev.startHour * SLOTS_PER_HOUR + ev.startMin / 15;
    const startEndSlot = ev.endHour * SLOTS_PER_HOUR + ev.endMin / 15;
    resizeDeltaRef.current = 0;
    setResizeDeltaSlots(0);
    setResizeSession({ ev, edge, startStartSlot, startEndSlot, startClientY: e.clientY });
  };

  const finalizeEventResize = (session, deltaSlots) => {
    if (!deltaSlots) return;
    const { ev, edge, startStartSlot, startEndSlot } = session;
    let newStartSlot = startStartSlot;
    let newEndSlot = startEndSlot;
    if (edge === 'bottom') newEndSlot = startEndSlot + deltaSlots;
    else newStartSlot = startStartSlot + deltaSlots;
    newStartSlot = Math.max(0, Math.min(newStartSlot, TOTAL_SLOTS - MIN_EVENT_SLOTS));
    newEndSlot = Math.max(newStartSlot + MIN_EVENT_SLOTS, Math.min(newEndSlot, TOTAL_SLOTS));
    const newStartH = Math.floor(newStartSlot / SLOTS_PER_HOUR);
    const newStartM = (newStartSlot % SLOTS_PER_HOUR) * 15;
    const newEndH = Math.floor(newEndSlot / SLOTS_PER_HOUR);
    const newEndM = (newEndSlot % SLOTS_PER_HOUR) * 15;
    if (ev.recurrence !== 'none' && ev._isVirtual) {
      // Resizing a recurring instance detaches it into its own one-off event, same as move-drag does.
      setCalendarEvents(prev => [
        ...prev.map(e => e.id === ev.id ? { ...e, _exceptDates: [...(e._exceptDates || []), ev._instanceDate] } : e),
        buildDetachedInstanceEvent(ev, { id: Date.now(), startHour: newStartH, startMin: newStartM, endHour: newEndH, endMin: newEndM }),
      ]);
    } else {
      setCalendarEvents(prev => prev.map(e => e.id === ev.id
        ? { ...e, startHour: newStartH, startMin: newStartM, endHour: newEndH, endMin: newEndM }
        : e
      ));
    }
  };

  useEffect(() => {
    if (!resizeSession) return;
    const handleMove = (e) => {
      const session = resizeSessionRef.current;
      if (!session) return;
      const rawDeltaSlots = Math.round((e.clientY - session.startClientY) / SLOT_HEIGHT);
      const duration = session.startEndSlot - session.startStartSlot;
      let clamped;
      if (session.edge === 'bottom') {
        clamped = Math.max(MIN_EVENT_SLOTS - duration, Math.min(TOTAL_SLOTS - session.startEndSlot, rawDeltaSlots));
      } else {
        clamped = Math.max(-session.startStartSlot, Math.min(duration - MIN_EVENT_SLOTS, rawDeltaSlots));
      }
      resizeDeltaRef.current = clamped;
      setResizeDeltaSlots(clamped);
    };
    const handleUp = () => {
      const session = resizeSessionRef.current;
      if (session) finalizeEventResize(session, resizeDeltaRef.current);
      setResizeSession(null);
      setResizeDeltaSlots(0);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resizeSession]);

  // ─── Notes Preview (removed) / Sub-events ───────────────────────────────────
  const [newSubEvent, setNewSubEvent] = useState('');
  const addSubEvent = () => {
    const t = newSubEvent.trim();
    if (!t) return;
    setForm(f => ({ ...f, subEvents: [...(f.subEvents||[]), { id: Date.now(), title: t }] }));
    setNewSubEvent('');
  };
  const removeSubEvent = (id) => setForm(f => ({ ...f, subEvents: f.subEvents.filter(s => s.id !== id) }));
  const addBonusTask = () => {
    const trimmedTitle = newBonusTask.title.trim();
    if (!trimmedTitle) return;
    setForm((currentForm) => ({
      ...currentForm,
      bonusTasks: [
        ...(currentForm.bonusTasks || []),
        normalizeBonusTask({
          id: Date.now(),
          title: trimmedTitle,
          xpAmount: Number(newBonusTask.xpAmount) || 10,
          completed: false,
          completedDates: [],
        }),
      ],
    }));
    setNewBonusTask(defaultBonusTaskForm());
  };
  const removeBonusTask = (id) => setForm((currentForm) => ({
    ...currentForm,
    bonusTasks: (currentForm.bonusTasks || []).filter((task) => task.id !== id),
  }));

  // ─── Template CRUD ───────────────────────────────────────────────────────────
  const openTmplCreate = () => { setTmplForm(defaultTmplForm()); setTmplModal('create'); };
  const openTmplEdit = (tmpl) => { setTmplForm({...defaultTmplForm(), ...tmpl}); setTmplModal({edit:true,id:tmpl.id}); };
  const closeTmplModal = () => setTmplModal(null);
  // Templates are colored by category now; an old per-template `color` is dropped on save.
  const tmplToSave = () => { const { color: _oldColor, ...rest } = tmplForm; return { ...rest, title: tmplForm.title.trim(), category: isCategoryId(tmplForm.category) ? tmplForm.category : null }; };
  const saveTmpl = () => { if (!tmplForm.title.trim()) return; setQuickEvents(prev=>[...prev,{...tmplToSave(),id:Date.now()}]); closeTmplModal(); };
  const updateTmpl = () => { if (!tmplForm.title.trim()) return; setQuickEvents(prev=>prev.map(t=>t.id===tmplModal.id?{...tmplToSave(),id:tmplModal.id}:t)); closeTmplModal(); };
  const deleteTmpl = (id) => setQuickEvents(prev=>prev.filter(t=>t.id!==id));

  // ─── Expand events ───────────────────────────────────────────────────────────
  const expandedEvents = expandEventsForDates(calendarEvents, activeDateKeys);
  const byDate = {};
  for (const dk of activeDateKeys) byDate[dk] = [];
  for (const ev of expandedEvents) { if (byDate[ev._instanceDate]!==undefined) byDate[ev._instanceDate].push(ev); }
  const columnedByDate = {};
  for (const dk of activeDateKeys) columnedByDate[dk] = buildColumns(byDate[dk]);
  const editingEvent = modal === 'edit' ? calendarEvents.find((ev) => ev.id === editingId) : null;

  // ─── Expand no-phone blocks (full-width bands, never column-packed) ───────────
  const expandedNoPhone = expandEventsForDates(noPhoneBlocks, activeDateKeys);
  const noPhoneByDate = {};
  for (const dk of activeDateKeys) noPhoneByDate[dk] = [];
  for (const block of expandedNoPhone) { if (noPhoneByDate[block._instanceDate]!==undefined) noPhoneByDate[block._instanceDate].push(block); }

  const tmplCategoryOf = templateCategoryLookup(calendarEvents);
  const slipped = getSlippedBlocks(calendarEvents, new Date(nowMs));
  const comingUp = getComingUp({ dayEvents: calendarDayEvents, goals, now: new Date(nowMs) });
  const unslottedCount = (() => {
    const { top, rest, upcoming } = getUnscheduledTasks(todos, calendarEvents, todayKey);
    return top.length + rest.length + upcoming.reduce((n, day) => n + day.tasks.length, 0);
  })();

  const todosByDate = (() => {
    const map = {};
    for (const todo of todos) {
      if (todo.completed) continue;
      const dk = getTaskDateKey(todo);
      if (!dk) continue;
      if (!map[dk]) map[dk] = [];
      map[dk].push(todo);
    }
    return map;
  })();

  // ─── Time Grid (Day / Week) ──────────────────────────────────────────────────
  const renderTimeGrid = (dates) => (
    <div className="cal-grid-wrapper">
      <div className="cal-day-header-row" style={{ gridTemplateColumns: `64px repeat(${dates.length}, minmax(0, 1fr))` }}>
        <div className="cal-time-gutter-header">
          <button
            className="cal-next-event-toggle"
            onClick={() => setNextEventMinimized(m => !m)}
            title={nextEventMinimized ? 'Show next events' : 'Hide next events'}
            aria-label={nextEventMinimized ? 'Show next events' : 'Hide next events'}
          >
            {nextEventMinimized ? <ChevronRight size={11} strokeWidth={3} /> : <ChevronLeft size={11} strokeWidth={3} style={{ transform: 'rotate(-90deg)' }} />}
          </button>
        </div>
        {dates.map((d,i) => {
          const dk = toDateKey(d);
          const isToday = dk === todayKey;
          const dayReminders = Array.isArray(calendarDayEvents?.[dk]) ? calendarDayEvents[dk] : [];
          const soonest = (() => {
            const candidates = dayReminders
              .map((evt) => {
                const targetMs = buildDayEventTargetMs(dk, evt?.time);
                return targetMs ? { evt, targetMs } : null;
              })
              .filter(Boolean)
              .filter((x) => x.targetMs >= nowMs)
              .sort((a, b) => a.targetMs - b.targetMs);
            return candidates[0] || null;
          })();
          const soonestRemaining = soonest ? fmtRemaining(soonest.targetMs, nowMs) : '';
          return (
            <div key={i} className={`cal-day-header ${isToday?'cal-day-header--today':''}`}>
              <div className="cal-day-header-top">
                <span className="cal-day-name">{DAYS_LABEL[d.getDay()]}</span>
                {hasLogContent(logs?.[dk]) && (
                  <button
                    type="button"
                    className="cal-day-log-btn"
                    onClick={(e)=>{e.stopPropagation();openLogViewer(dk);}}
                    title="View daily log"
                    aria-label="View daily log"
                  >
                    <NotebookText size={11} strokeWidth={2.5} />
                  </button>
                )}
              </div>
              <span className={`cal-day-num ${isToday?'cal-day-num--today':''}`}>{d.getDate()}</span>
              {!nextEventMinimized && (
                <button
                  type="button"
                  className="cal-dayevents-mini"
                  onClick={(e)=>{
                    e.stopPropagation();
                    if (soonest?.evt) openDayEventEdit(dk, soonest.evt);
                    else openDayEventCreate(dk);
                  }}
                  title={soonest?.evt ? 'Edit next event' : 'Add an event'}
                >
                  {!soonest?.evt ? (
                    <>
                      <span className="cal-dayevents-mini-label"><Plus size={11} strokeWidth={3} /> Add event</span>
                    </>
                  ) : (
                    <>
                      <span className="cal-dayevents-mini-top">
                        <span className="cal-dayevents-mini-dot" style={{ '--mini-color': soonest.evt.color || '#38bdf8' }} />
                        <span className="cal-dayevents-mini-title">{soonest.evt.title || 'Untitled'}</span>
                      </span>
                      <span className="cal-dayevents-mini-meta">{soonestRemaining}</span>
                    </>
                  )}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {dates.some((d) => (todosByDate[toDateKey(d)] || []).length > 0) && (
        <div className="cal-alldaytasks-row" style={{ gridTemplateColumns: `64px repeat(${dates.length}, minmax(0, 1fr))` }}>
          <div className="cal-alldaytasks-gutter" />
          {dates.map((d, i) => {
            const dk = toDateKey(d);
            const dayTasks = todosByDate[dk] || [];
            return (
              <div key={i} className="cal-alldaytasks-col">
                {dayTasks.slice(0, 3).map((task) => (
                  <div
                    key={task.id}
                    className="cal-month-chip cal-month-chip--task"
                    style={{ '--chip-color': BLOCK_KIND_COLORS.task }}
                    onClick={(e) => e.stopPropagation()}
                    title={task.text}
                  >
                    {task.text}
                  </div>
                ))}
                {dayTasks.length > 3 && (
                  <div className="cal-month-more">+{dayTasks.length - 3} more</div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <div className="cal-scroll-area" ref={gridRef}>
        <div className="cal-time-grid" style={{ height: TOTAL_HEIGHT, gridTemplateColumns: `64px repeat(${dates.length}, minmax(0, 1fr))` }}>
          <div className="cal-time-gutter">
            {Array.from({length:24},(_,h)=>(
              <div key={h} className="cal-hour-cell" style={{height: SLOT_HEIGHT*4}}>
                <span className="cal-hour-label">{fmtHour(h)}</span>
              </div>
            ))}
          </div>
          {dates.map((d,di) => {
            const dk = toDateKey(d);
            const dayEvents = columnedByDate[dk] || [];
            const isToday = dk === todayKey;
            const durationSlots = draggingEvent
                ? Math.round((minsEndFromEvent(draggingEvent.ev) - minsFromEvent(draggingEvent.ev)) / 15)
                : draggingTemplate ? Math.ceil(draggingTemplate.duration/15) : 4;
            return (
              <div key={di} className={`cal-day-col ${isToday?'cal-day-col--today':''}`} style={{height:TOTAL_HEIGHT}}>
                {Array.from({length:TOTAL_SLOTS},(_,s)=>{
                  const isDragTarget = dragOver?.date===dk && dragOver?.slot===s;
                  const isNpTarget = noPhoneMode && npDragStart?.dateKey===dk && s>=Math.min(npDragStart.slot,npDragCurrent?.slot??npDragStart.slot) && s<=Math.max(npDragStart.slot,npDragCurrent?.slot??npDragStart.slot);
                  return (
                    <div
                      key={s}
                      className={`cal-slot ${s%4===0?'cal-slot--hour':''} ${isDragTarget?'cal-slot--drag':''} ${noPhoneMode?'cal-slot--nophone-mode':''} ${isNpTarget?'cal-slot--nophone-drag':''}`}
                      style={{ top: s*SLOT_HEIGHT, height: isDragTarget ? durationSlots*SLOT_HEIGHT : SLOT_HEIGHT }}
                      onClick={()=>{ if (!noPhoneMode) openCreate(dk,s); }}
                      onMouseDown={()=>handleNoPhoneSlotMouseDown(dk,s)}
                      onMouseEnter={()=>handleNoPhoneSlotMouseEnter(dk,s)}
                      onDragOver={(e)=>handleSlotDragOver(e,dk,s)}
                      onDrop={(e)=>handleSlotDrop(e,dk,s)}
                    />
                  );
                })}
                {isToday && (
                  <div className="cal-now-line" style={{top:(currentMinute/(24*60))*TOTAL_HEIGHT}}>
                    <div className="cal-now-dot"/><div className="cal-now-bar"/>
                  </div>
                )}
                {(noPhoneByDate[dk]||[]).map((block,bi)=>{
                  const startMin=minsFromEvent(block), endMin=minsEndFromEvent(block);
                  const top=(startMin/(24*60))*TOTAL_HEIGHT;
                  const height=Math.max(((endMin-startMin)/(24*60))*TOTAL_HEIGHT,8);
                  const honored=isNoPhoneHonored(block);
                  return (
                    <div
                      key={`np-${block.id}-${block._instanceDate}-${bi}`}
                      className={`cal-nophone-band${honored?' cal-nophone-band--honored':''}`}
                      style={{top,height}}
                    >
                      <div className="cal-nophone-chip" onClick={(e)=>{e.stopPropagation();openNoPhoneEdit(block);}}>
                        <span className="cal-nophone-label"><PhoneOff size={10} strokeWidth={3} /> {block.label || 'No Phone'} {fmtTime(block.startHour,block.startMin)}–{fmtTime(block.endHour,block.endMin)}</span>
                        <button
                          className={`cal-nophone-honor${honored?' is-honored':''}`}
                          onClick={(e)=>honorNoPhoneBlock(block,e)}
                          title={honored?'Honored':'Mark honored'}
                          aria-label="Mark honored"
                        ><Check size={11} strokeWidth={3} /></button>
                        <button className="cal-nophone-delete" onClick={(e)=>requestDeleteNoPhone(block,e)} title="Delete" aria-label="Delete">
                          <X size={11} strokeWidth={3} />
                        </button>
                      </div>
                    </div>
                  );
                })}
                {noPhoneMode && npDragStart?.dateKey===dk && npDragCurrent && (() => {
                  const s1=Math.min(npDragStart.slot,npDragCurrent.slot), s2=Math.max(npDragStart.slot,npDragCurrent.slot);
                  const top=s1*SLOT_HEIGHT, height=(s2-s1+1)*SLOT_HEIGHT;
                  return <div className="cal-nophone-band cal-nophone-band--preview" style={{top,height}} />;
                })()}
                {dayEvents.map((ev,ei)=>{
                  const isResizing = resizeSession && resizeSession.ev.id===ev.id && resizeSession.ev._instanceDate===ev._instanceDate;
                  let startMin=minsFromEvent(ev), endMin=minsEndFromEvent(ev);
                  if (isResizing) {
                    const deltaMin = resizeDeltaSlots * 15;
                    if (resizeSession.edge==='bottom') endMin += deltaMin;
                    else startMin += deltaMin;
                  }
                  const top=(startMin/(24*60))*TOTAL_HEIGHT;
                  const height=Math.max(((endMin-startMin)/(24*60))*TOTAL_HEIGHT,18);
                  const left=`calc(${(ev.colIndex/ev.totalCols)*100}% + 2px)`;
                  const width=`calc(${(1/ev.totalCols)*100}% - 4px)`;
                  const color=blockColor(ev, categoryColors);
                  const done=isInstanceCompleted(ev);
                  // Missed/partly/skipped only from the day check-ins began; older blocks look as they did.
                  const rawStatus=getBlockStatus(ev, nowMs);
                  const status=rawStatus==='missed' && ev._instanceDate<PLAN_KEPT_START ? 'past' : rawStatus;
                  const dispStartH=Math.floor(startMin/60), dispStartM=startMin%60;
                  const dispEndH=Math.floor(endMin/60), dispEndM=endMin%60;
                  const showTime=height>30, showCheckIn=status==='missed'&&height>=48;
                  const blockTasks=(ev.bonusTasks||[]).map((task,taskIndex)=>normalizeBonusTask(task,taskIndex));
                  const tasksDone=blockTasks.filter(task=>isBonusTaskCompleted(task,ev)).length;
                  const subEvents=ev.subEvents||[];
                  const {shownTasks,shownSteps}=fitBlockRows(height,{time:showTime,checkIn:showCheckIn,tasks:blockTasks.length,steps:subEvents.length});
                  return (
                    <div
                      key={`${ev.id}-${ev._instanceDate}-${ei}`}
                      className={`cal-event cal-event--${status} ${isResizing?'cal-event--resizing':''}`}
                      style={{top,height,left,width,'--ev-color':color}}
                      draggable={!resizeSession}
                      onDragStart={(e)=>{cancelHoverCard();handleEventDragStart(e,ev);}}
                      onDragEnd={handleDragEnd}
                      onMouseEnter={(e)=>handleEventHoverEnter(e,ev)}
                      onMouseLeave={cancelHoverCard}
                      // capture phase: the resize handles stopPropagation on mousedown
                      onMouseDownCapture={cancelHoverCard}
                      onClick={(e)=>{e.stopPropagation();openEdit(ev);}}
                    >
                      <div
                        className="cal-event-resize-handle cal-event-resize-handle--top"
                        draggable={false}
                        onMouseDown={(e)=>beginEventResize(e,ev,'top')}
                        onClick={(e)=>e.stopPropagation()}
                      />
                      <div className="cal-event-inner">
                        <div className="cal-event-title">
                          {ev.plan?.id && <Sparkles size={9} className="cal-event-planned" aria-label="Planned by My Assistant" />}
                          {shownTasks<blockTasks.length&&(
                            <span
                              className={`cal-event-taskbadge ${tasksDone===blockTasks.length?'cal-event-taskbadge--done':''}`}
                              title={`${blockTasks.length} task${blockTasks.length===1?'':'s'}, ${tasksDone} done`}
                              aria-label={`${blockTasks.length} task${blockTasks.length===1?'':'s'}, ${tasksDone} done`}
                            ><ListChecks size={9} strokeWidth={2.5} />{tasksDone}/{blockTasks.length}</span>
                          )}
                          <span className="cal-event-title-text">{ev.title}</span>
                        </div>
                        {showTime&&<div className="cal-event-time">{fmtTime(dispStartH,dispStartM)} – {fmtTime(dispEndH,dispEndM)}</div>}
                        {showCheckIn&&(
                          <button type="button" className="cal-event-checkin" onClick={(e)=>openCheckIn(ev,e)} onMouseDown={(e)=>e.stopPropagation()}>Check in</button>
                        )}
                        {shownSteps>0&&(
                          <div className="cal-event-subevents">
                            {subEvents.slice(0,shownSteps).map(se=>(
                              <div key={se.id} className="cal-event-subevent">{se.title}</div>
                            ))}
                          </div>
                        )}
                        {shownTasks>0&&(
                          <div className="cal-event-bonus-list">
                            {blockTasks.slice(0,shownTasks).map((normalizedTask)=>{
                              const bonusDone = isBonusTaskCompleted(normalizedTask, ev);
                              return (
                                <button
                                  key={normalizedTask.id}
                                  type="button"
                                  className={`cal-event-bonus ${bonusDone?'cal-event-bonus--done':''}`}
                                  onClick={(e)=>completeBonusTask(ev, normalizedTask, e)}
                                  title={bonusDone ? `Uncheck task: ${normalizedTask.title}` : `Complete task: ${normalizedTask.title}`}
                                >
                                  <span className="cal-event-bonus-check">{bonusDone ? <Check size={10} strokeWidth={3} /> : <Circle size={10} strokeWidth={3} />}</span>
                                  <span className="cal-event-bonus-label">{normalizedTask.title}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      <div className="cal-event-actions">
                        {!done && onStartFocus && <button className="cal-event-btn cal-event-focus" onClick={(e)=>{e.stopPropagation();cancelHoverCard();onStartFocus(ev);}} title="Start focus"><Play size={11} strokeWidth={3} /></button>}
                        <button className={`cal-event-btn cal-event-complete ${status==='done'?'cal-event-complete--done':''}`} onClick={(e)=>{ if (status!=='done') openCheckIn(ev,e); else e.stopPropagation(); }} title={status==='done'?'Done':'Check in: done, partly or skipped'}>{status==='done' ? <Check size={11} strokeWidth={3} /> : <Circle size={11} strokeWidth={3} />}</button>
                        <button className="cal-event-btn cal-event-duplicate" onClick={(e)=>duplicateEvent(ev,e)} title="Duplicate"><Copy size={11} strokeWidth={3} /></button>
                        <button className="cal-event-btn cal-event-delete" onClick={(e)=>requestDelete(ev,e)} title="Delete"><X size={11} strokeWidth={3} /></button>
                      </div>
                      <div
                        className="cal-event-resize-handle cal-event-resize-handle--bottom"
                        draggable={false}
                        onMouseDown={(e)=>beginEventResize(e,ev,'bottom')}
                        onClick={(e)=>e.stopPropagation()}
                      />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  // ─── Month View ──────────────────────────────────────────────────────────────
  const renderMonthView = () => {
    const currentMonth = anchor.getMonth();
    return (
      <div className="cal-month-wrapper">
        <div className="cal-month-dow-row">
          {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=><div key={d} className="cal-month-dow">{d}</div>)}
        </div>
        <div className="cal-month-grid">
          {monthCalDates.map((d,i)=>{
            const dk=toDateKey(d);
            const isToday=dk===todayKey;
            const inMonth=d.getMonth()===currentMonth;
            const dayEvs=columnedByDate[dk]||[];
            const dayReminders = Array.isArray(calendarDayEvents?.[dk]) ? calendarDayEvents[dk] : [];
            return (
              <div key={i} className={`cal-month-cell ${isToday?'cal-month-cell--today':''} ${!inMonth?'cal-month-cell--out':''}`}
                onClick={()=>{setAnchor(d);setView('day');}}>
                <div className="cal-month-daynum-row">
                  <div className={`cal-month-daynum ${isToday?'cal-month-daynum--today':''}`}>{d.getDate()}</div>
                  {(noPhoneByDate[dk]||[]).length>0 && <span className="cal-month-nophone-dot" title="No-phone time scheduled"><PhoneOff size={10} /></span>}
                  {hasLogContent(logs?.[dk]) && (
                    <button
                      type="button"
                      className="cal-month-log-dot"
                      onClick={(e)=>{e.stopPropagation();openLogViewer(dk);}}
                      title="View daily log"
                      aria-label="View daily log"
                    >
                      <NotebookText size={10} />
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  className="cal-month-dayevents"
                  onClick={(e)=>{e.stopPropagation();openDayEventCreate(dk);}}
                  title="Add an event"
                >
                  <div className="cal-month-dayevents-head">
                    <span className="cal-month-dayevents-label">Events</span>
                    <span className="cal-month-dayevents-add"><Plus size={11} strokeWidth={3} /></span>
                  </div>
                  <div className="cal-month-dayevents-list">
                    {dayReminders.length===0 && (
                      <div className="cal-month-dayevents-empty">Click to add</div>
                    )}
                    {dayReminders.slice(0,2).map((evt)=>{
                      const targetMs = buildDayEventTargetMs(dk, evt.time);
                      const color = evt.color || '#38bdf8';
                      return (
                        <button
                          key={evt.id}
                          type="button"
                          className="cal-month-dayevent"
                          style={{ '--dayev-color': color }}
                          onClick={(e)=>{e.stopPropagation();openDayEventEdit(dk, evt);}}
                          title="Edit event"
                        >
                          <span className="cal-month-dayevent-title">{evt.title}</span>
                          <span className="cal-month-dayevent-remaining">{fmtRemaining(targetMs, nowMs)}</span>
                        </button>
                      );
                    })}
                    {dayReminders.length>2 && (
                      <div className="cal-month-dayevents-more">+{dayReminders.length-2} more</div>
                    )}
                  </div>
                </button>

                <div className="cal-month-events">
                  {dayEvs.slice(0,3).map((ev,ei)=>{
                    const done=isInstanceCompleted(ev);
                    return (
                      <div key={`${ev.id}-${ei}`} className={`cal-month-chip ${done?'cal-month-chip--done':''}`}
                        style={{'--chip-color':blockColor(ev, categoryColors)}}
                        onClick={(e)=>{e.stopPropagation();openEdit(ev);}}>
                        {ev.title}
                      </div>
                    );
                  })}
                  {(() => {
                    const dayTasks = (todosByDate[dk] || []);
                    const slotsLeft = Math.max(0, 3 - Math.min(dayEvs.length, 3));
                    return dayTasks.slice(0, slotsLeft).map((task) => (
                      <div key={`t-${task.id}`}
                        className="cal-month-chip cal-month-chip--task"
                        style={{ '--chip-color': BLOCK_KIND_COLORS.task }}
                        onClick={(e) => e.stopPropagation()}>
                        {task.text}
                      </div>
                    ));
                  })()}
                  {(dayEvs.length + (todosByDate[dk] || []).length > 3) && (
                    <div className="cal-month-more">+{dayEvs.length + (todosByDate[dk] || []).length - 3} more</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ─── Sidebar ─────────────────────────────────────────────────────────────────
  const renderSideNote = (where) => (sideNote?.where === where
    ? <p className={`cal-sidebar-note${sideNote.ok ? '' : ' cal-sidebar-note--warn'}`} role="status">{sideNote.text}</p>
    : null);

  // A section's header doubles as its collapse toggle; a collapsed section still shows its count.
  const renderSectionHeader = (id, title, count, extra = null) => {
    const isCollapsed = collapsed[id];
    return (
      <div className="cal-sidebar-header">
        <button
          type="button"
          className="cal-sidebar-section-toggle"
          onClick={() => setCollapsed(c => ({ ...c, [id]: !c[id] }))}
          aria-expanded={!isCollapsed}
          title={isCollapsed ? 'Expand' : 'Collapse'}
        >
          <ChevronDown size={12} strokeWidth={3} className={`cal-sidebar-chevron${isCollapsed ? ' cal-sidebar-chevron--collapsed' : ''}`} />
          <span className="cal-sidebar-title">{title}</span>
          {count > 0 && (id === 'missed' || isCollapsed) && (
            <span className={`cal-sidebar-count${id === 'missed' ? '' : ' cal-sidebar-count--quiet'}`}>{count}</span>
          )}
        </button>
        {extra}
      </div>
    );
  };

  const renderSidebar = () => (
    <>
      <button
        className={`cal-sidebar-toggle ${sidebarOpen?'cal-sidebar-toggle--open':'cal-sidebar-toggle--closed'}`}
        onClick={()=>setSidebarOpen(o=>!o)}
        title={sidebarOpen?'Collapse':'Expand'}
        aria-label={sidebarOpen?'Collapse sidebar':'Expand sidebar'}
      >
        {sidebarOpen ? <ChevronLeft size={14} strokeWidth={3} /> : <ChevronRight size={14} strokeWidth={3} />}
      </button>
      <div className={`cal-sidebar ${sidebarOpen?'cal-sidebar--open':'cal-sidebar--closed'}`}>
      {sidebarOpen&&(
        <div className="cal-sidebar-content">
          {(slipped.length > 0 || sideNote?.where === 'slip') && (
            <>
              {renderSectionHeader('missed', 'Missed', slipped.length)}
              {!collapsed.missed && <>
              <ul className="cal-slip-list">
                {slipped.map((ev) => {
                  const outcome = getBlockOutcome(ev);
                  const why = outcome ? `Skipped${outcome.reason ? ` (${outcome.reason})` : ''}` : 'No check-in';
                  return (
                    <li key={`${ev.id}-${ev._instanceDate}`} className="cal-slip-item" style={{ '--slip-color': blockColor(ev, categoryColors) }}>
                      <span className="cal-slip-main">
                        <span className="cal-slip-title">{ev.title}</span>
                        <span className="cal-slip-sub">{dayLabel(ev._instanceDate, todayKey)} · {blockRange(ev)} · {why}</span>
                      </span>
                      <button type="button" className="cal-slip-btn cal-slip-btn--go" onClick={() => rescheduleSlipped(ev)}
                        title="Move to today's next free slot" aria-label={`Reschedule ${ev.title} to today's next free slot`}>
                        <CalendarPlus size={13} strokeWidth={2.6} />
                      </button>
                      <button type="button" className="cal-slip-btn" onClick={() => letGoSlipped(ev)}
                        title="Let it go" aria-label={`Let ${ev.title} go`}>
                        <X size={13} strokeWidth={2.6} />
                      </button>
                    </li>
                  );
                })}
              </ul>
              {renderSideNote('slip')}
              </>}
              <div className="cal-sidebar-divider" />
            </>
          )}

          {renderSectionHeader('tasks', 'Needs a time slot', unslottedCount)}
          {!collapsed.tasks && <TaskTray
            todos={todos}
            calendarEvents={calendarEvents}
            todayKey={todayKey}
            onDragStart={setDraggingTask}
            onDragEnd={handleDragEnd}
            onSchedule={scheduleTask}
          />}

          <div className="cal-sidebar-divider" />

          {renderSectionHeader('blocks', 'Quick Time Blocks', quickEvents.length, (
            <button className="cal-sidebar-add-btn" onClick={openTmplCreate} title="Add template" aria-label="Add template">
              <Plus size={14} strokeWidth={3} />
            </button>
          ))}
          {!collapsed.blocks && <>
          <div className="cal-sidebar-list">
            {quickEvents.map(tmpl=>(
              <div key={tmpl.id} className="cal-tmpl-card" style={{'--tmpl-color':categoryColor(tmplCategoryOf(tmpl), categoryColors)}}
                draggable onDragStart={(e)=>handleTemplateDragStart(e,tmpl)} onDragEnd={handleDragEnd}>
                <div className="cal-tmpl-info">
                  <div className="cal-tmpl-title">{tmpl.title}</div>
                  <div className="cal-tmpl-meta">
                    {tmpl.duration}min
                    {tmpl.recurrence!=='none'&&<span className="cal-tmpl-recur">{tmpl.recurrence==='weekly'&&tmpl.recurrenceDays?.length?tmpl.recurrenceDays.map(d=>WEEKDAY_LABELS[d]).join(' '):tmpl.recurrence}</span>}
                  </div>
                </div>
                <button className="cal-tmpl-place" onClick={()=>placeTemplate(tmpl)} title="Place in today's next free slot" aria-label={`Place ${tmpl.title} in today's next free slot`}>
                  <CalendarPlus size={13} strokeWidth={2.6} />
                </button>
                <div className="cal-tmpl-actions">
                  <button className="cal-tmpl-btn" onClick={()=>openTmplEdit(tmpl)} title="Edit" aria-label="Edit template">
                    <Pencil size={13} strokeWidth={3} />
                  </button>
                  <button className="cal-tmpl-btn cal-tmpl-btn--del" onClick={()=>deleteTmpl(tmpl.id)} title="Delete" aria-label="Delete template">
                    <Trash2 size={13} strokeWidth={3} />
                  </button>
                </div>
              </div>
            ))}
            {quickEvents.length===0&&<p className="cal-sidebar-empty">No templates yet.<br/>Click the + button to add one.</p>}
          </div>
          {renderSideNote('tmpl')}
          </>}

          <div className="cal-sidebar-divider" />

          {renderSectionHeader('upcoming', 'Coming up', comingUp.length)}
          {!collapsed.upcoming && (
            <div className="cal-sidebar-list cal-sidebar-list--events">
              {comingUp.map((item) => {
                const isGoal = item.kind === 'goal';
                return (
                  <button
                    key={item.key}
                    type="button"
                    className={`cal-upcoming-item${isGoal ? ' cal-upcoming-item--goal' : ''}`}
                    style={isGoal ? undefined : { '--up-color': item.color }}
                    onClick={() => (isGoal ? onNavigate?.('goals') : openDayEventEdit(item.dateKey, item))}
                    disabled={isGoal && !onNavigate}
                    title={isGoal ? 'Open Goals' : 'Edit event'}
                  >
                    {isGoal ? <Target size={11} strokeWidth={2.6} className="cal-upcoming-goal-icon" aria-label="Goal" /> : <span className="cal-upcoming-dot" />}
                    <span className="cal-upcoming-main">
                      <span className="cal-upcoming-title">{item.title}</span>
                      <span className="cal-upcoming-sub">{item.when}</span>
                    </span>
                    <span className={`cal-upcoming-meta${item.tone ? ` cal-upcoming-meta--${item.tone}` : ''}`}>{item.meta}</span>
                  </button>
                );
              })}
              {comingUp.length === 0 && (
                <p className="cal-sidebar-empty">Nothing coming up.</p>
              )}
            </div>
          )}
        </div>
      )}
      </div>
    </>
  );

  // ─── Time-Block Hover Detail Card ────────────────────────────────────────────
  // Everything a block is too short to show: full title, exact times, duration,
  // sub-events, tasks and — the one field the grid never renders
  // anywhere else — the event's notes.
  const renderEventHoverCard = () => {
    if (!hoverCardVisible) return null;
    const ev = hoverCard.ev;
    const startMin = minsFromEvent(ev), endMin = minsEndFromEvent(ev);
    const durMin = Math.max(0, endMin - startMin);
    const kind = blockKind(ev);
    const outcome = getBlockOutcome(ev);
    const missed = !outcome && ev._instanceDate >= PLAN_KEPT_START && getBlockStatus(ev, nowMs) === 'missed';
    const subEvents = ev.subEvents || [];
    const bonusTasks = ev.bonusTasks || [];
    const notes = (ev.notes || '').trim();
    const recurDays = ev.recurrenceDays?.length ? ev.recurrenceDays : [weekdayOfDateKey(ev.date)];
    const recurLabel = ev.recurrence === 'daily'
      ? 'Every day'
      : ev.recurrence === 'weekly'
        ? recurDays.map(d => WEEKDAY_LABELS[d]).join(' ')
        : null;
    const hasDetail = subEvents.length > 0 || bonusTasks.length > 0 || Boolean(notes);

    return (
      <div
        key={`${ev.id}-${ev._instanceDate}`}
        ref={hoverCardRef}
        className="cal-hovercard"
        style={{ '--ev-color': blockColor(ev, categoryColors) }}
        role="tooltip"
      >
        <div className="cal-hovercard-head">
          <span className="cal-hovercard-title">{ev.title || 'Untitled'}</span>
          {outcome?.status === 'done' && <span className="cal-hovercard-done"><Check size={10} strokeWidth={3} />Done</span>}
          {outcome?.status === 'partly' && <span className="cal-hovercard-done cal-hovercard-done--partly">Partly</span>}
          {outcome?.status === 'skipped' && <span className="cal-hovercard-done cal-hovercard-done--skipped">Skipped{outcome.reason ? ` · ${outcome.reason}` : ''}</span>}
          {missed && <span className="cal-hovercard-done cal-hovercard-done--missed">Missed</span>}
        </div>

        <div className="cal-hovercard-time">
          <span>{fmtTime(ev.startHour, ev.startMin)} – {fmtTime(ev.endHour, ev.endMin)}</span>
          <span className="cal-hovercard-dur">{fmtDuration(durMin)}</span>
        </div>

        <div className="cal-hovercard-chips">
          <span className="cal-hovercard-chip cal-hovercard-chip--kind">{categoryMeta(blockCategory(ev)).label}</span>
          {kind !== 'event' && <span className="cal-hovercard-chip">{BLOCK_KIND_LABELS[kind]}</span>}
          {recurLabel && (
            <span className="cal-hovercard-chip"><Repeat size={9} strokeWidth={3} />{recurLabel}</span>
          )}
        </div>

        {subEvents.length > 0 && (
          <div className="cal-hovercard-section">
            <span className="cal-hovercard-label">Steps</span>
            <div className="cal-hovercard-list">
              {subEvents.slice(0, 6).map(se => (
                <span key={se.id} className="cal-hovercard-step">{se.title}</span>
              ))}
              {subEvents.length > 6 && <span className="cal-hovercard-more">+{subEvents.length - 6} more</span>}
            </div>
          </div>
        )}

        {bonusTasks.length > 0 && (
          <div className="cal-hovercard-section">
            <span className="cal-hovercard-label">Tasks</span>
            <div className="cal-hovercard-list">
              {bonusTasks.slice(0, 6).map((task, taskIndex) => {
                const normalizedTask = normalizeBonusTask(task, taskIndex);
                const bonusDone = isBonusTaskCompleted(normalizedTask, ev);
                return (
                  <span key={normalizedTask.id} className={`cal-hovercard-bonus ${bonusDone ? 'cal-hovercard-bonus--done' : ''}`}>
                    {bonusDone ? <Check size={10} strokeWidth={3} /> : <Circle size={10} strokeWidth={3} />}
                    <span className="cal-hovercard-bonus-label">{normalizedTask.title}</span>
                  </span>
                );
              })}
              {bonusTasks.length > 6 && <span className="cal-hovercard-more">+{bonusTasks.length - 6} more</span>}
            </div>
          </div>
        )}

        {notes && (
          <div className="cal-hovercard-section">
            <span className="cal-hovercard-label"><NotebookText size={10} />Notes</span>
            <p className="cal-hovercard-notes">{notes}</p>
          </div>
        )}

        {!hasDetail && <p className="cal-hovercard-empty">No notes or details yet — click to add some.</p>}
      </div>
    );
  };

  // ─── Shared Modal Fields ─────────────────────────────────────────────────────
  // Preset swatches plus "any color" through the native picker.
  const renderSwatches = (value, onPick, label) => {
    const isOther = Boolean(value) && !COLOR_SWATCHES.includes(value);
    return (
      <>
        {COLOR_SWATCHES.map(c=>(
          <button key={c} type="button" className={`cal-color-swatch ${value===c?'cal-color-swatch--active':''}`} style={{background:c}}
            onClick={()=>onPick(c)} aria-label={`${label} ${c}`} aria-pressed={value===c} />
        ))}
        <label className={`cal-color-swatch cal-color-swatch--any ${isOther?'cal-color-swatch--active':''}`} style={isOther?{background:value}:undefined} title="Any color">
          {!isOther && <Plus size={12} strokeWidth={3} />}
          <input type="color" value={value || '#38bdf8'} onChange={e=>onPick(e.target.value)} aria-label={`${label}: any color`} />
        </label>
      </>
    );
  };

  // ─── Category colors (app-wide) ──────────────────────────────────────────────
  const openCatColors = () => setCatColorsDraft({ ...categoryColors });
  const saveCatColors = () => {
    // Only colors that differ from the default are stored.
    const next = Object.fromEntries(Object.entries(catColorsDraft || {})
      .filter(([id, c]) => c && c.toLowerCase() !== categoryMeta(id).color.toLowerCase()));
    onSaveCategoryColors?.(next);
    setCatColorsDraft(null);
  };

  const renderRecurBtns = (val, set) => (
    <div className="cal-recur-row">
      {['none','daily','weekly'].map(r=>(
        <button key={r} type="button" className={`cal-recur-btn ${val===r?'cal-recur-btn--active':''}`} onClick={()=>set(r)}>
          {r==='none'?'No Repeat':r==='daily'?'Daily':'Weekly'}
        </button>
      ))}
    </div>
  );

  // Shown under "Repeat" once 'weekly' is selected. `days` is the effective
  // (already-defaulted-to-anchor-day) selection, never empty while visible.
  const renderWeekdayPicker = (days, setDays) => (
    <div className="cal-weekday-row">
      {WEEKDAY_LABELS.map((label, idx) => {
        const active = days.includes(idx);
        return (
          <button
            key={idx}
            type="button"
            className={`cal-weekday-chip ${active ? 'cal-weekday-chip--active' : ''}`}
            onClick={() => {
              if (active && days.length === 1) return; // keep at least one day selected
              setDays(active ? days.filter(d => d !== idx) : [...days, idx].sort((a,b)=>a-b));
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="cal-page">
      {/* ── Header ── */}
      <div className="cal-header">
        <div className="cal-header-left">
          <h2 className="cal-month-label">{headerLabel()}</h2>
          <button className="cal-today-btn" onClick={goToday}>Today</button>
        </div>
        <div className="cal-view-tabs">
          {['day','week','month'].map(v=>(
            <button key={v} className={`cal-view-tab ${view===v?'cal-view-tab--active':''}`} onClick={()=>setView(v)}>
              {v.charAt(0).toUpperCase()+v.slice(1)}
            </button>
          ))}
        </div>
        <div className="cal-header-right">
          {onPlanDay && (
            <button
              className="cal-plan-btn"
              onClick={()=>{ const key = toDateKey(anchor); onPlanDay(view==='day' && key>=todayKey ? key : todayKey); }}
              title="Let My Assistant build a time-blocked plan"
            >
              <Sparkles size={13} strokeWidth={2.5} /> Plan my day
            </button>
          )}
          {view!=='month' && (
            <button
              className={`cal-nophone-toggle ${noPhoneMode?'cal-nophone-toggle--active':''}`}
              onClick={()=>{ setNoPhoneMode(m=>!m); setNpDragStart(null); setNpDragCurrent(null); }}
              title={noPhoneMode ? 'Exit No Phone mode' : 'Drag on the grid to block out No Phone time'}
            >
              <PhoneOff size={13} strokeWidth={2.5} /> No Phone
            </button>
          )}
          {onSaveCategoryColors && (
            <button className="cal-nav-btn cal-colors-btn" onClick={openCatColors} title="Category colors" aria-label="Category colors">
              <Palette size={14} strokeWidth={2.5} />
            </button>
          )}
          <button className="cal-nav-btn" onClick={()=>navigate(-1)}>&#8249;</button>
          <button className="cal-nav-btn" onClick={()=>navigate(1)}>&#8250;</button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="cal-body">
        {renderSidebar()}
        <div className="cal-main">
          <TodayStrip
            calendarEvents={calendarEvents}
            nowMs={nowMs}
            onCheckIn={checkIn}
            onStartFocus={onStartFocus}
            onPlanDay={onPlanDay}
          />
          <div className="cal-tray-row">
            <TaskTray
              variant="row"
              todos={todos}
              calendarEvents={calendarEvents}
              todayKey={todayKey}
              onDragStart={setDraggingTask}
              onDragEnd={handleDragEnd}
              onSchedule={scheduleTask}
            />
          </div>
          {view==='day'&&renderTimeGrid([anchor])}
          {view==='week'&&renderTimeGrid(weekDates)}
          {view==='month'&&renderMonthView()}
        </div>
      </div>

      {/* ── Block check-in (from the grid) ── */}
      {checkInEv && (
        <div className="cal-modal-overlay" onClick={()=>setCheckInEv(null)}>
          <div className="cal-modal cal-checkin-modal" onClick={(e)=>e.stopPropagation()} role="dialog" aria-label="Check in on this block">
            <div className="cal-modal-header">
              <h3>Check in</h3>
              <button className="cal-modal-close" onClick={()=>setCheckInEv(null)} aria-label="Close"><X size={14} strokeWidth={3} /></button>
            </div>
            <div className="cal-modal-body">
              <BlockCheckIn
                ev={checkInEv}
                dayLabel={checkInEv._instanceDate === todayKey ? 'Today' : formatLogDate(checkInEv._instanceDate)}
                onAnswer={(status, reason)=>checkIn(checkInEv, status, reason)}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Hover detail card for a time block ── */}
      {renderEventHoverCard()}

      {/* ── Create / Edit Event Modal ── */}
      {(modal==='create'||modal==='edit')&&(
        <div className="cal-modal-overlay" onClick={closeModal}>
          <div className="cal-modal" onClick={e=>e.stopPropagation()}>
            <div className="cal-modal-header">
              <h3>{modal==='create'?'New Time Block':'Edit Time Block'}</h3>
              <button className="cal-modal-close" onClick={closeModal}><X size={14} /></button>
            </div>
            <div className="cal-modal-body">
              <div className="cal-field">
                <label className="cal-label">Title</label>
                <input className="cal-input" placeholder="Time block title…" value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} autoFocus />
              </div>
              {(() => {
                // Auto = the AI's earlier pick (title unchanged) or a keyword match; with
                // neither, the block shows as Other until App's background sort answers.
                const auto = autoCategoryForForm(form);
                const effective = form.category || auto || 'other';
                return (
                  <>
                    <div className="cal-field">
                      <div className="cal-label-row">
                        <label className="cal-label">Category</label>
                        {onSaveCategoryColors && <button type="button" className="cal-link-btn" onClick={openCatColors}>Edit category colors</button>}
                      </div>
                      <div className="cal-cat-row" role="radiogroup" aria-label="Category">
                        <button type="button" role="radio" aria-checked={!form.category}
                          className={`cal-cat-chip ${!form.category?'cal-cat-chip--active':''}`}
                          style={{'--cat-color': auto ? categoryColor(auto, categoryColors) : 'var(--text-tertiary)'}}
                          onClick={()=>setForm(f=>({...f,category:null}))}>
                          <Sparkles size={10} strokeWidth={2.5} />Auto{auto ? ` · ${categoryMeta(auto).label}` : ''}
                        </button>
                        {BLOCK_CATEGORIES.map(c=>(
                          <button key={c.id} type="button" role="radio" aria-checked={form.category===c.id}
                            className={`cal-cat-chip ${form.category===c.id?'cal-cat-chip--active':''}`}
                            style={{'--cat-color': categoryColor(c.id, categoryColors)}}
                            onClick={()=>setForm(f=>({...f,category:c.id}))}>
                            <span className="cal-cat-dot" />{c.label}
                          </button>
                        ))}
                      </div>
                      {!form.category && !auto && form.title.trim() && (
                        <p className="cal-field-hint">No keyword match, so My Assistant will sort it after you save.</p>
                      )}
                    </div>
                    <div className="cal-field">
                      <label className="cal-label">Color</label>
                      <div className="cal-color-row">
                        <button type="button" className={`cal-color-default ${!form.color?'cal-color-default--active':''}`}
                          style={{'--cat-color': categoryColor(effective, categoryColors)}}
                          onClick={()=>setForm(f=>({...f,color:''}))} aria-pressed={!form.color}>
                          <span className="cal-cat-dot" />Category color
                        </button>
                        {renderSwatches(form.color, c=>setForm(f=>({...f,color:c})), 'Block color')}
                      </div>
                    </div>
                  </>
                );
              })()}
              <div className="cal-field">
                <label className="cal-label">Date</label>
                <input className="cal-input" type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} />
              </div>
              <div className="cal-field-row">
                <div className="cal-field">
                  <label className="cal-label">Start</label>
                  <input className="cal-input" type="time" step="900" value={toTimeInput(form.startHour,form.startMin)} onChange={e=>{const{h,m}=parseTimeInput(e.target.value);setForm(f=>({...f,startHour:h,startMin:m}));}}/>
                </div>
                <div className="cal-field">
                  <label className="cal-label">End</label>
                  <input className="cal-input" type="time" step="900" value={toTimeInput(form.endHour,form.endMin)} onChange={e=>{const{h,m}=parseTimeInput(e.target.value);setForm(f=>({...f,endHour:h,endMin:m}));}}/>
                </div>
              </div>
              <div className="cal-field">
                <label className="cal-label">Repeat</label>
                {renderRecurBtns(form.recurrence, r=>setForm(f=>({...f,recurrence:r})))}
                {form.recurrence === 'weekly' && renderWeekdayPicker(
                  form.recurrenceDays?.length ? form.recurrenceDays : [weekdayOfDateKey(form.date)],
                  (days) => setForm(f => ({ ...f, recurrenceDays: days })),
                )}
              </div>
              <div className="cal-field">
                <label className="cal-label">Sub-Blocks</label>
                <div className="cal-subevents-list">
                  {(form.subEvents||[]).map(se=>(
                    <div key={se.id} className="cal-subevent-row">
                      <span className="cal-subevent-name">{se.title}</span>
                      <button type="button" className="cal-subevent-del" onClick={()=>removeSubEvent(se.id)}><X size={12} /></button>
                    </div>
                  ))}
                </div>
                <div className="cal-subevent-add-row">
                  <input
                    className="cal-input cal-subevent-input"
                    placeholder="e.g. Math test…"
                    value={newSubEvent}
                    onChange={e=>setNewSubEvent(e.target.value)}
                    onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addSubEvent();}}}
                  />
                  <button type="button" className="cal-btn cal-btn--ghost cal-subevent-add-btn" onClick={addSubEvent}>Add</button>
                </div>
              </div>
              <div className="cal-field">
                <label className="cal-label">Tasks</label>
                <div className="cal-bonus-list">
                  {(form.bonusTasks||[]).map((task, index)=>{
                    const normalizedTask = normalizeBonusTask(task, index);
                    const completionEvent = editingEvent
                      ? { ...normalizeEvent(editingEvent), _instanceDate: form.date }
                      : null;
                    const bonusDone = completionEvent
                      ? isBonusTaskCompleted(normalizedTask, completionEvent)
                      : Boolean(normalizedTask.completed);
                    return (
                    <div key={normalizedTask.id ?? `bonus-task-${index}`} className={`cal-bonus-row ${bonusDone?'cal-bonus-row--done':''}`}>
                      {modal==='edit' && editingEvent && (
                        <button
                          type="button"
                          className={`cal-bonus-check ${bonusDone?'cal-bonus-check--done':''}`}
                          onClick={()=>toggleBonusTaskCompletion(completionEvent, normalizedTask)}
                          title={bonusDone ? `Uncheck ${normalizedTask.title}` : `Mark ${normalizedTask.title} complete`}
                        >
                          {bonusDone ? <Check size={12} /> : <Circle size={12} />}
                        </button>
                      )}
                      <div className="cal-bonus-main">
                        <span className="cal-bonus-name">{normalizedTask.title}</span>
                      </div>
                      <button type="button" className="cal-subevent-del" onClick={()=>removeBonusTask(normalizedTask.id)}><X size={12} /></button>
                    </div>
                  )})}
                </div>
                <div className="cal-bonus-builder">
                  <div className="cal-field-row">
                    <div className="cal-field">
                      <label className="cal-label">Task</label>
                      <input
                        className="cal-input"
                        placeholder="e.g. Floss"
                        value={newBonusTask.title}
                        onChange={(e)=>setNewBonusTask((current)=>({...current,title:e.target.value}))}
                        onKeyDown={(e)=>{if(e.key==='Enter'){e.preventDefault();addBonusTask();}}}
                      />
                    </div>
                    <span className="cal-month-dayevents-add" aria-hidden="true">
                      <Plus size={14} strokeWidth={3} />
                    </span>
                  </div>
                  <button type="button" className="cal-btn cal-btn--ghost cal-bonus-add-btn" disabled={!newBonusTask.title.trim()} onClick={addBonusTask}>Add Task</button>
                </div>
              </div>
              <div className="cal-field">
                <label className="cal-label">Notes</label>
                <textarea className="cal-input cal-textarea" placeholder="Optional notes…" rows={3} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/>
              </div>
            </div>
            {!isFormValid()&&form.title&&<p className="cal-modal-err">End time must be after start time.</p>}
            <div className="cal-modal-footer">
              <button className="cal-btn cal-btn--ghost" onClick={closeModal}>Cancel</button>
              <button className="cal-btn cal-btn--primary" disabled={!isFormValid()} onClick={modal==='create'?saveEvent:()=>updateEvent('all')}>
                {modal==='create'?'Add Time Block':'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Category Colors Modal (opens over the block editor too) ── */}
      {catColorsDraft && (
        <div className="cal-modal-overlay" onClick={()=>setCatColorsDraft(null)}>
          <div className="cal-modal" onClick={e=>e.stopPropagation()} role="dialog" aria-label="Category colors">
            <div className="cal-modal-header">
              <h3>Category colors</h3>
              <button className="cal-modal-close" onClick={()=>setCatColorsDraft(null)} aria-label="Close"><X size={14} /></button>
            </div>
            <div className="cal-modal-body">
              <p className="cal-field-hint">Every block in a category uses its color, unless you gave that block its own.</p>
              {BLOCK_CATEGORIES.map(c=>{
                const value = categoryColor(c.id, catColorsDraft);
                const changed = value.toLowerCase() !== c.color.toLowerCase();
                return (
                  <div key={c.id} className="cal-catcolor-row" style={{'--cat-color': value}}>
                    <div className="cal-catcolor-head">
                      <span className="cal-cat-dot" />
                      <span className="cal-catcolor-name">{c.label}</span>
                      <span className="cal-catcolor-hint">{c.hint}</span>
                      {changed && <button type="button" className="cal-link-btn" onClick={()=>setCatColorsDraft(d=>({...d,[c.id]:null}))}>Reset</button>}
                    </div>
                    <div className="cal-color-row cal-color-row--sm">
                      {renderSwatches(value, col=>setCatColorsDraft(d=>({...d,[c.id]:col})), `${c.label} color`)}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="cal-modal-footer">
              <button className="cal-btn cal-btn--ghost" onClick={()=>setCatColorsDraft(null)}>Cancel</button>
              <button className="cal-btn cal-btn--primary" onClick={saveCatColors}>Save colors</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit scope (recurring) ── */}
      {editScope?.show&&(
        <div className="cal-modal-overlay" onClick={()=>setEditScope(null)}>
          <div className="cal-scope-modal" onClick={e=>e.stopPropagation()}>
            <h4>Edit recurring time block</h4>
            <p>Which time blocks do you want to change?</p>
            <div className="cal-scope-btns">
              <button className="cal-btn cal-btn--ghost" onClick={()=>handleEditScopeSelect('this')}>This time block only</button>
              <button className="cal-btn cal-btn--ghost" onClick={()=>handleEditScopeSelect('this-forward')}>This &amp; future blocks</button>
              <button className="cal-btn cal-btn--ghost" onClick={()=>handleEditScopeSelect('all')}>All blocks</button>
              <button className="cal-modal-close" onClick={closeModal} aria-label="Close">
                <X size={16} strokeWidth={3} />
              </button>
            </div>
            <button className="cal-btn cal-btn--ghost cal-scope-cancel" onClick={()=>setEditScope(null)}>Cancel</button>
          </div>
        </div>
      )}

      {/* ── Delete scope (recurring) ── */}
      {deleteScope?.show&&(
        <div className="cal-modal-overlay" onClick={()=>setDeleteScope(null)}>
          <div className="cal-scope-modal" onClick={e=>e.stopPropagation()}>
            <h4>Delete recurring time block</h4>
            <p>Which time blocks do you want to delete?</p>
            <div className="cal-scope-btns">
              <button className="cal-btn cal-btn--ghost" onClick={()=>handleDeleteScope('this')}>This time block only</button>
              <button className="cal-btn cal-btn--ghost" onClick={()=>handleDeleteScope('this-forward')}>This &amp; future blocks</button>
              <button className="cal-btn cal-btn--danger" onClick={()=>handleDeleteScope('all')}>All blocks</button>
              <button className="cal-modal-close" onClick={closeTmplModal} aria-label="Close">
                <X size={16} strokeWidth={3} />
              </button>
            </div>
            <button className="cal-btn cal-btn--ghost cal-scope-cancel" onClick={()=>setDeleteScope(null)}>Cancel</button>
          </div>
        </div>
      )}

      {/* ── Template Modal ── */}
      {tmplModal&&(
        <div className="cal-modal-overlay" onClick={closeTmplModal}>
          <div className="cal-modal" onClick={e=>e.stopPropagation()}>
            <div className="cal-modal-header">
              <h3>{tmplModal==='create'?'New Template':'Edit Template'}</h3>
              <button className="cal-modal-close" onClick={closeTmplModal} aria-label="Close">
                <X size={16} strokeWidth={3} />
              </button>
            </div>
            <div className="cal-modal-body">
              <div className="cal-field">
                <label className="cal-label">Name</label>
                <input className="cal-input" placeholder="Template name…" value={tmplForm.title} onChange={e=>setTmplForm(f=>({...f,title:e.target.value}))} autoFocus/>
              </div>
              <div className="cal-field-row">
                <div className="cal-field">
                  <label className="cal-label">Duration (min)</label>
                  <input className="cal-input cal-input--xp" type="number" min="5" max="480" step="5" value={tmplForm.duration} onChange={e=>setTmplForm(f=>({...f,duration:Number(e.target.value)}))}/>
                </div>
              </div>
              <div className="cal-field">
                <label className="cal-label">Repeat</label>
                {renderRecurBtns(tmplForm.recurrence, r=>setTmplForm(f=>({...f,recurrence:r})))}
                {tmplForm.recurrence === 'weekly' && renderWeekdayPicker(
                  tmplForm.recurrenceDays?.length ? tmplForm.recurrenceDays : [new Date().getDay()],
                  (days) => setTmplForm(f => ({ ...f, recurrenceDays: days })),
                )}
              </div>
              {(() => {
                // Same chips as the block editor; Auto is what the calendar would color it.
                const auto = templateCategoryLookup(calendarEvents)({ title: tmplForm.title });
                return (
                  <div className="cal-field">
                    <label className="cal-label">Category</label>
                    <div className="cal-cat-row" role="radiogroup" aria-label="Category">
                      <button type="button" role="radio" aria-checked={!tmplForm.category}
                        className={`cal-cat-chip ${!tmplForm.category?'cal-cat-chip--active':''}`}
                        style={{'--cat-color': categoryColor(auto, categoryColors)}}
                        onClick={()=>setTmplForm(f=>({...f,category:null}))}>
                        <Sparkles size={10} strokeWidth={2.5} />Auto{tmplForm.title.trim() ? ` · ${categoryMeta(auto).label}` : ''}
                      </button>
                      {BLOCK_CATEGORIES.map(c=>(
                        <button key={c.id} type="button" role="radio" aria-checked={tmplForm.category===c.id}
                          className={`cal-cat-chip ${tmplForm.category===c.id?'cal-cat-chip--active':''}`}
                          style={{'--cat-color': categoryColor(c.id, categoryColors)}}
                          onClick={()=>setTmplForm(f=>({...f,category:c.id}))}>
                          <span className="cal-cat-dot" />{c.label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
            <div className="cal-modal-footer">
              <button className="cal-btn cal-btn--ghost" onClick={closeTmplModal}>Cancel</button>
              <button className="cal-btn cal-btn--primary" disabled={!tmplForm.title.trim()} onClick={tmplModal==='create'?saveTmpl:updateTmpl}>
                {tmplModal==='create'?'Add Template':'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Day Event Modal ── */}
      {dayEventModal?.dateKey&&(
        <div className="cal-modal-overlay" onClick={closeDayEventModal}>
          <div className="cal-modal" onClick={e=>e.stopPropagation()}>
            <div className="cal-modal-header">
              <h3>{dayEventModal.mode === 'edit' ? 'Edit Event' : 'New Event'}</h3>
              <button className="cal-modal-close" onClick={closeDayEventModal}><X size={14} /></button>
            </div>
            <div className="cal-modal-body">
              <div className="cal-field">
                <label className="cal-label">Date</label>
                <input className="cal-input" type="date" value={dayEventModal.dateKey} disabled />
              </div>
              <div className="cal-field">
                <label className="cal-label">Title</label>
                <input
                  className="cal-input"
                  placeholder="e.g. Assignment due…"
                  value={dayEventForm.title}
                  onChange={(e)=>{setDayEventErr('');setDayEventForm(f=>({...f,title:e.target.value}));}}
                  onKeyDown={(e)=>{if(e.key==='Enter'){e.preventDefault();saveDayEvent();}}}
                  autoFocus
                />
              </div>
              <div className="cal-field">
                <label className="cal-label">Time (optional)</label>
                <input
                  className="cal-input"
                  type="time"
                  value={dayEventForm.time}
                  onChange={(e)=>setDayEventForm(f=>({...f,time:e.target.value}))}
                />
              </div>
              <div className="cal-field">
                <label className="cal-label">Tag color</label>
                <div className="cal-color-row">
                  {['#fbbf24','#f87171','#4ade80','#38bdf8','#c084fc','#fb923c','#f472b6','#a3e635'].map(c=>{
                    const active = dayEventForm.color === c;
                    return (
                      <button
                        key={c}
                        type="button"
                        className={`cal-color-swatch ${active?'cal-color-swatch--active':''}`}
                        style={{background:c}}
                        onClick={()=>setDayEventForm(f=>({...f,color:c}))}
                        title={active ? 'Selected' : 'Select color'}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
            {dayEventErr&&<p className="cal-modal-err">{dayEventErr}</p>}
            <div className="cal-modal-footer">
              <button className="cal-btn cal-btn--ghost" onClick={closeDayEventModal}>Cancel</button>
              <button className="cal-btn cal-btn--primary" disabled={!dayEventForm.title.trim()} onClick={saveDayEvent}>
                {dayEventModal.mode === 'edit' ? 'Save Changes' : 'Add Event'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── No Phone Block Modal ── */}
      {noPhoneModal&&(
        <div className="cal-modal-overlay" onClick={closeNoPhoneModal}>
          <div className="cal-modal" onClick={e=>e.stopPropagation()}>
            <div className="cal-modal-header">
              <h3>{noPhoneModal.mode === 'edit' ? 'Edit No Phone Time' : 'New No Phone Time'}</h3>
              <button className="cal-modal-close" onClick={closeNoPhoneModal}><X size={14} /></button>
            </div>
            <div className="cal-modal-body">
              <div className="cal-field">
                <label className="cal-label">Label</label>
                <input
                  className="cal-input"
                  placeholder="e.g. No Phone"
                  value={noPhoneForm.label}
                  onChange={(e)=>setNoPhoneForm(f=>({...f,label:e.target.value}))}
                  autoFocus
                />
              </div>
              <div className="cal-field-row">
                <div className="cal-field">
                  <label className="cal-label">Start</label>
                  <input
                    className="cal-input"
                    type="time"
                    step="900"
                    value={toTimeInput(noPhoneForm.startHour, noPhoneForm.startMin)}
                    onChange={(e)=>{const {h,m}=parseTimeInput(e.target.value); setNoPhoneForm(f=>({...f,startHour:h,startMin:m}));}}
                  />
                </div>
                <div className="cal-field">
                  <label className="cal-label">End</label>
                  <input
                    className="cal-input"
                    type="time"
                    step="900"
                    value={toTimeInput(noPhoneForm.endHour, noPhoneForm.endMin)}
                    onChange={(e)=>{const {h,m}=parseTimeInput(e.target.value); setNoPhoneForm(f=>({...f,endHour:h,endMin:m}));}}
                  />
                </div>
              </div>
              <div className="cal-field">
                <label className="cal-label">Repeat</label>
                {renderRecurBtns(noPhoneForm.recurrence, r=>setNoPhoneForm(f=>({...f,recurrence:r})))}
                {noPhoneForm.recurrence === 'weekly' && renderWeekdayPicker(
                  noPhoneForm.recurrenceDays?.length ? noPhoneForm.recurrenceDays : [weekdayOfDateKey(noPhoneForm.date)],
                  (days) => setNoPhoneForm(f => ({ ...f, recurrenceDays: days })),
                )}
              </div>
            </div>
            {!isNoPhoneFormValid()&&<p className="cal-modal-err">End time must be after start time.</p>}
            <div className="cal-modal-footer">
              <button className="cal-btn cal-btn--ghost" onClick={closeNoPhoneModal}>Cancel</button>
              <button
                className="cal-btn cal-btn--primary"
                disabled={!isNoPhoneFormValid()}
                onClick={()=>noPhoneModal.mode==='create'?saveNoPhoneBlock():updateNoPhoneBlock()}
              >
                {noPhoneModal.mode === 'edit' ? 'Save Changes' : 'Add No Phone Time'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── No Phone Edit scope (recurring) ── */}
      {noPhoneEditScope?.show&&(
        <div className="cal-modal-overlay" onClick={()=>setNoPhoneEditScope(null)}>
          <div className="cal-scope-modal" onClick={e=>e.stopPropagation()}>
            <h4>Edit recurring No Phone block</h4>
            <p>Which blocks do you want to change?</p>
            <div className="cal-scope-btns">
              <button className="cal-btn cal-btn--ghost" onClick={()=>handleNoPhoneEditScopeSelect('this')}>This block only</button>
              <button className="cal-btn cal-btn--ghost" onClick={()=>handleNoPhoneEditScopeSelect('this-forward')}>This &amp; future blocks</button>
              <button className="cal-btn cal-btn--ghost" onClick={()=>handleNoPhoneEditScopeSelect('all')}>All blocks</button>
              <button className="cal-modal-close" onClick={()=>setNoPhoneEditScope(null)} aria-label="Close">
                <X size={16} strokeWidth={3} />
              </button>
            </div>
            <button className="cal-btn cal-btn--ghost cal-scope-cancel" onClick={()=>setNoPhoneEditScope(null)}>Cancel</button>
          </div>
        </div>
      )}

      {/* ── No Phone Delete scope (recurring) ── */}
      {noPhoneDeleteScope?.show&&(
        <div className="cal-modal-overlay" onClick={()=>setNoPhoneDeleteScope(null)}>
          <div className="cal-scope-modal" onClick={e=>e.stopPropagation()}>
            <h4>Delete recurring No Phone block</h4>
            <p>Which blocks do you want to delete?</p>
            <div className="cal-scope-btns">
              <button className="cal-btn cal-btn--ghost" onClick={()=>handleNoPhoneDeleteScope('this')}>This block only</button>
              <button className="cal-btn cal-btn--ghost" onClick={()=>handleNoPhoneDeleteScope('this-forward')}>This &amp; future blocks</button>
              <button className="cal-btn cal-btn--danger" onClick={()=>handleNoPhoneDeleteScope('all')}>All blocks</button>
              <button className="cal-modal-close" onClick={()=>setNoPhoneDeleteScope(null)} aria-label="Close">
                <X size={16} strokeWidth={3} />
              </button>
            </div>
            <button className="cal-btn cal-btn--ghost cal-scope-cancel" onClick={()=>setNoPhoneDeleteScope(null)}>Cancel</button>
          </div>
        </div>
      )}

      {/* ── Daily Log Viewer (read-only) ── */}
      {logViewerDate && (() => {
        const entry = logs?.[logViewerDate] || {};
        const proudItems = (entry.proud || []).filter((v) => v && v.trim());
        const improveItems = (entry.improve || []).filter((v) => v && v.trim());
        return (
          <div className="cal-modal-overlay" onClick={closeLogViewer}>
            <div className="cal-modal" onClick={e=>e.stopPropagation()}>
              <div className="cal-modal-header">
                <h3><NotebookText size={16} className="cal-logview-title-icon" /> {formatLogDate(logViewerDate)}</h3>
                <button className="cal-modal-close" onClick={closeLogViewer}><X size={14} /></button>
              </div>
              <div className="cal-modal-body cal-logview-body">
                {entry.emotions?.length > 0 && (
                  <div className="cal-logview-section">
                    <span className="cal-logview-label">Feelings</span>
                    <div className="cal-logview-emotions">
                      {entry.emotions.map((eid) => {
                        const em = EMOTIONS.find((e) => e.id === eid);
                        if (!em) return null;
                        return (
                          <span key={eid} className="cal-logview-emotion-chip" style={{ '--chip-color': em.color }}>
                            <em.Icon size={13} /> {em.label}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
                {proudItems.length > 0 && (
                  <div className="cal-logview-section">
                    <span className="cal-logview-label">Proud of</span>
                    <ul className="cal-logview-list">
                      {proudItems.map((t, i) => <li key={i}>{t}</li>)}
                    </ul>
                  </div>
                )}
                {improveItems.length > 0 && (
                  <div className="cal-logview-section">
                    <span className="cal-logview-label">To improve</span>
                    <ul className="cal-logview-list">
                      {improveItems.map((t, i) => <li key={i}>{t}</li>)}
                    </ul>
                  </div>
                )}
                {entry.learned?.trim() && (
                  <div className="cal-logview-section">
                    <span className="cal-logview-label">Learned</span>
                    <p className="cal-logview-text">{entry.learned}</p>
                  </div>
                )}
                {entry.notes?.trim() && (
                  <div className="cal-logview-section">
                    <span className="cal-logview-label">Notes</span>
                    <p className="cal-logview-text">{entry.notes}</p>
                  </div>
                )}
                {entry.commitment?.trim() && (
                  <div className="cal-logview-section">
                    <span className="cal-logview-label">Commitment</span>
                    <p className="cal-logview-text">{entry.commitment}</p>
                  </div>
                )}
                {!hasLogContent(entry) && <p className="cal-sidebar-empty">No log entry for this day.</p>}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
