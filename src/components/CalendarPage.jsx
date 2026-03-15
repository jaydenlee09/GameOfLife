import { useState, useEffect, useRef } from 'react';
import STAT_META from './statMeta';
import './CalendarPage.css';

// ─── Constants ────────────────────────────────────────────────────────────────
const SLOT_HEIGHT = 16;
const SLOTS_PER_HOUR = 4;
const TOTAL_SLOTS = 96;
const TOTAL_HEIGHT = TOTAL_SLOTS * SLOT_HEIGHT;
const DAYS_LABEL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
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
const toDateKey = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};
const parseDateKey = (dateKey) => {
  const [y, m, d] = String(dateKey || '').split('-').map(Number);
  if (!y || !m || !d) return null;
  return { y, m, d };
};
const buildDayEventTargetMs = (dateKey, timeHHMM) => {
  const parts = parseDateKey(dateKey);
  if (!parts) return null;
  let hour = 23;
  let minute = 59;
  if (typeof timeHHMM === 'string' && /^\d{2}:\d{2}$/.test(timeHHMM)) {
    const [h, m] = timeHHMM.split(':').map(Number);
    if (Number.isFinite(h) && Number.isFinite(m)) {
      hour = Math.min(23, Math.max(0, h));
      minute = Math.min(59, Math.max(0, m));
    }
  }
  return new Date(parts.y, parts.m - 1, parts.d, hour, minute, 0, 0).getTime();
};
const fmtRemaining = (targetMs, nowMs) => {
  if (!targetMs || !nowMs) return '';
  const diffMs = targetMs - nowMs;
  if (diffMs <= 0) return 'Passed';
  const totalMins = Math.max(0, Math.ceil(diffMs / 60000));
  const days = Math.floor(totalMins / (60 * 24));
  const hours = Math.floor((totalMins - days * 24 * 60) / 60);
  const mins = totalMins % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
};

const daysUntil = (targetMs, nowMs) => {
  if (!targetMs || !nowMs) return null;
  const diff = targetMs - nowMs;
  if (diff <= 0) return 0;
  return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)));
};
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
const cloneSubEvents = (subEvents = []) => subEvents.map((subEvent) => ({ ...subEvent }));
const normalizeBonusTask = (task = {}, index = 0) => ({
  id: task.id ?? `bonus-${index}-${task.title || 'task'}`,
  title: task.title || '',
  xpAmount: Number(task.xpAmount) || 10,
  attributes: Array.isArray(task.attributes) ? [...task.attributes] : [],
  completed: Boolean(task.completed),
  completedDates: Array.isArray(task.completedDates) ? [...task.completedDates] : [],
});
const cloneBonusTasks = (bonusTasks = []) => bonusTasks.map((task, index) => normalizeBonusTask(task, index));
const normalizeEvent = (ev = {}) => ({
  ...ev,
  attributes: Array.isArray(ev.attributes) ? [...ev.attributes] : [],
  subEvents: cloneSubEvents(ev.subEvents || []),
  bonusTasks: cloneBonusTasks(ev.bonusTasks || []),
  completedDates: Array.isArray(ev.completedDates) ? [...ev.completedDates] : [],
});

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

const expandEventsForDates = (storedEvents, dateKeys) => {
  const result = [];
  for (const ev of storedEvents) {
    const normalizedEvent = normalizeEvent(ev);
    if (normalizedEvent.recurrence === 'none' || !normalizedEvent.recurrence) {
      if (dateKeys.includes(normalizedEvent.date)) result.push({ ...normalizedEvent, _instanceDate: normalizedEvent.date });
    } else if (normalizedEvent.recurrence === 'daily') {
      for (const dk of dateKeys) {
        if (dk >= normalizedEvent.date) result.push({ ...normalizedEvent, _instanceDate: dk, _isVirtual: dk !== normalizedEvent.date });
      }
    } else if (normalizedEvent.recurrence === 'weekly') {
      const evDay = new Date(normalizedEvent.date + 'T00:00:00').getDay();
      for (const dk of dateKeys) {
        const dkDay = new Date(dk + 'T00:00:00').getDay();
        if (dk >= normalizedEvent.date && dkDay === evDay) result.push({ ...normalizedEvent, _instanceDate: dk, _isVirtual: dk !== normalizedEvent.date });
      }
    }
  }
  return result.filter(ev => {
    if (ev._exceptDates?.includes(ev._instanceDate)) return false;
    if (ev._forwardDeleteFrom && ev._instanceDate >= ev._forwardDeleteFrom) return false;
    return true;
  });
};

const isInstanceCompleted = (ev) => {
  if (ev.recurrence === 'none' || !ev.recurrence) return ev.completed;
  return ev.completedDates?.includes(ev._instanceDate);
};
const isBonusTaskCompleted = (task, ev) => {
  if (ev.recurrence === 'none' || !ev.recurrence) return Boolean(task.completed);
  return task.completedDates?.includes(ev._instanceDate);
};
const primaryColor = (ev) => {
  if (!ev.attributes?.length) return '#fbbf24';
  return STAT_META[ev.attributes[0]]?.color || '#fbbf24';
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
    attributes: overrides.attributes ? [...overrides.attributes] : [...normalizedEvent.attributes],
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
  };
};

// ─── Default Forms ────────────────────────────────────────────────────────────
const defaultForm = (o = {}) => ({
  title: '', date: toDateKey(new Date()),
  startHour: 9, startMin: 0, endHour: 10, endMin: 0,
  xpAmount: 20, attributes: [], recurrence: 'none', notes: '', subEvents: [], bonusTasks: [], ...o,
});
const defaultTmplForm = () => ({ title: '', duration: 60, attributes: [], xpAmount: 20, recurrence: 'none', color: '#fbbf24' });
const defaultBonusTaskForm = () => ({ title: '', xpAmount: 10, attributes: [] });
const toTimeInput = (h, m) => `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
const parseTimeInput = (val) => { const [h,m] = val.split(':'); return { h: parseInt(h,10), m: parseInt(m,10) }; };

// ─── Main Component ───────────────────────────────────────────────────────────
export default function CalendarPage({
  calendarEvents,
  setCalendarEvents,
  calendarDayEvents = {},
  setCalendarDayEvents,
  quickEvents,
  setQuickEvents,
  onUpdateStat,
}) {
  const [view, setView] = useState('week');
  const [anchor, setAnchor] = useState(() => new Date());
  const [modal, setModal] = useState(null);
  const [dayEventModal, setDayEventModal] = useState(null); // { mode: 'create'|'edit', dateKey, id? }
  const [dayEventForm, setDayEventForm] = useState({ title: '', time: '', color: '#fbbf24' });
  const [dayEventErr, setDayEventErr] = useState('');
  const [form, setForm] = useState(defaultForm());
  const [editingId, setEditingId] = useState(null);
  const [editScope, setEditScope] = useState(null);
  const [deleteScope, setDeleteScope] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [tmplModal, setTmplModal] = useState(null);
  const [tmplForm, setTmplForm] = useState(defaultTmplForm());
  const [newBonusTask, setNewBonusTask] = useState(defaultBonusTaskForm());
  const [dragOver, setDragOver] = useState(null);
  const [draggingTemplate, setDraggingTemplate] = useState(null);
  const [draggingEvent, setDraggingEvent] = useState(null); // { ev, offsetSlots }
  const [currentMinute, setCurrentMinute] = useState(() => { const n = new Date(); return n.getHours()*60+n.getMinutes(); });
  const [nowMs, setNowMs] = useState(() => Date.now());
  const gridRef = useRef(null);
  const todayKey = toDateKey(new Date());

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
      ...(fromTemplate ? { title: fromTemplate.title, attributes: [...fromTemplate.attributes], xpAmount: fromTemplate.xpAmount, recurrence: fromTemplate.recurrence } : {}),
    }));
    setEditingId(null);
    setNewBonusTask(defaultBonusTaskForm());
    setModal('create');
  };

  const openEdit = (ev) => {
    if (ev.recurrence !== 'none' && ev._isVirtual) { setEditScope({ show: true, ev }); return; }
    const normalizedEvent = normalizeEvent(ev);
    setForm({ title: normalizedEvent.title, date: normalizedEvent.date, startHour: normalizedEvent.startHour, startMin: normalizedEvent.startMin, endHour: normalizedEvent.endHour, endMin: normalizedEvent.endMin, xpAmount: normalizedEvent.xpAmount, attributes: [...normalizedEvent.attributes], recurrence: normalizedEvent.recurrence, notes: normalizedEvent.notes || '', subEvents: cloneSubEvents(normalizedEvent.subEvents), bonusTasks: cloneBonusTasks(normalizedEvent.bonusTasks) });
    setEditingId(ev.id);
    setNewBonusTask(defaultBonusTaskForm());
    setModal('edit');
  };

  const openDayEventCreate = (dateKey) => {
    setDayEventErr('');
    setDayEventForm({ title: '', time: '', color: '#fbbf24' });
    setDayEventModal({ mode: 'create', dateKey });
  };

  const openDayEventEdit = (dateKey, item) => {
    if (!dateKey || !item?.id) return;
    setDayEventErr('');
    setDayEventForm({
      title: item.title || '',
      time: item.time || '',
      color: item.color || '#fbbf24',
    });
    setDayEventModal({ mode: 'edit', dateKey, id: item.id });
  };

  const closeDayEventModal = () => {
    setDayEventModal(null);
    setDayEventErr('');
    setDayEventForm({ title: '', time: '', color: '#fbbf24' });
  };

  const closeModal = () => { setModal(null); setEditingId(null); setEditScope(null); setDeleteScope(null); setNewSubEvent(''); setNewBonusTask(defaultBonusTaskForm()); };

  const saveDayEvent = () => {
    const dateKey = dayEventModal?.dateKey;
    const title = dayEventForm.title.trim();
    if (!dateKey) return;
    if (!title) { setDayEventErr('Title is required.'); return; }
    const time = (dayEventForm.time || '').trim();
    const color = (dayEventForm.color || '#fbbf24').trim();
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

  const buildEventFromForm = (id) => ({
    id: id || Date.now(), title: form.title.trim(), date: form.date,
    startHour: form.startHour, startMin: form.startMin, endHour: form.endHour, endMin: form.endMin,
    xpAmount: Number(form.xpAmount)||20, attributes: form.attributes, recurrence: form.recurrence,
    notes: form.notes||'', subEvents: cloneSubEvents(form.subEvents||[]), bonusTasks: cloneBonusTasks(form.bonusTasks||[]), completed: false, completedDates: [],
  });

  const isFormValid = () => form.title.trim() && (form.endHour*60+form.endMin) > (form.startHour*60+form.startMin);

  const saveEvent = () => { if (!isFormValid()) return; setCalendarEvents(prev=>[...prev, buildEventFromForm()]); closeModal(); };

  const updateEvent = (scope='all') => {
    if (!isFormValid()) return;
    if (scope === 'all') {
      setCalendarEvents(prev=>prev.map(ev=>ev.id!==editingId?ev:{
        ...ev, title:form.title.trim(), startHour:form.startHour, startMin:form.startMin,
        endHour:form.endHour, endMin:form.endMin, xpAmount:Number(form.xpAmount)||20,
        attributes:form.attributes, recurrence:form.recurrence, notes:form.notes||'', subEvents:cloneSubEvents(form.subEvents||[]), bonusTasks:cloneBonusTasks(form.bonusTasks||[]),
      }));
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
    setForm({ title:normalizedEvent.title, date:ev._instanceDate, startHour:normalizedEvent.startHour, startMin:normalizedEvent.startMin, endHour:normalizedEvent.endHour, endMin:normalizedEvent.endMin, xpAmount:normalizedEvent.xpAmount, attributes:[...normalizedEvent.attributes], recurrence:normalizedEvent.recurrence, notes:normalizedEvent.notes||'', subEvents:cloneSubEvents(normalizedEvent.subEvents), bonusTasks:instanceBonusTasks });
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

  // ─── Complete ────────────────────────────────────────────────────────────────
  const completeEvent = (ev, e) => {
    e.stopPropagation();
    if (isInstanceCompleted(ev)) return;
    ev.attributes.forEach(attr=>onUpdateStat(attr, ev.xpAmount));
    if (ev.recurrence==='none'||!ev.recurrence) setCalendarEvents(prev=>prev.map(e=>e.id===ev.id?{...e,completed:true}:e));
    else setCalendarEvents(prev=>prev.map(e=>e.id===ev.id?{...e,completedDates:[...(e.completedDates||[]),ev._instanceDate]}:e));
  };

  const markBonusTaskComplete = (ev, task) => {
    if (isBonusTaskCompleted(task, ev)) return;
    task.attributes.forEach((attr) => onUpdateStat(attr, task.xpAmount));
    if (ev.recurrence === 'none' || !ev.recurrence) {
      setCalendarEvents((prev) => prev.map((calendarEvent) => {
        if (calendarEvent.id !== ev.id) return calendarEvent;
        const normalizedEvent = normalizeEvent(calendarEvent);
        return {
          ...normalizedEvent,
          bonusTasks: normalizedEvent.bonusTasks.map((bonusTask, index) => {
            const normalizedTask = normalizeBonusTask(bonusTask, index);
            return normalizedTask.id === task.id ? { ...normalizedTask, completed: true } : normalizedTask;
          }),
        };
      }));
      setForm((currentForm) => ({
        ...currentForm,
        bonusTasks: (currentForm.bonusTasks || []).map((bonusTask, index) => {
          const normalizedTask = normalizeBonusTask(bonusTask, index);
          return normalizedTask.id === task.id ? { ...normalizedTask, completed: true } : normalizedTask;
        }),
      }));
      return;
    }

    setCalendarEvents((prev) => prev.map((calendarEvent) => {
      if (calendarEvent.id !== ev.id) return calendarEvent;
      const normalizedEvent = normalizeEvent(calendarEvent);
      return {
        ...normalizedEvent,
        bonusTasks: normalizedEvent.bonusTasks.map((bonusTask, index) => {
          const normalizedTask = normalizeBonusTask(bonusTask, index);
          if (normalizedTask.id !== task.id) return normalizedTask;
          return {
            ...normalizedTask,
            completedDates: [...(normalizedTask.completedDates || []), ev._instanceDate],
          };
        }),
      };
    }));
    setForm((currentForm) => ({
      ...currentForm,
      bonusTasks: (currentForm.bonusTasks || []).map((bonusTask, index) => {
        const normalizedTask = normalizeBonusTask(bonusTask, index);
        if (normalizedTask.id !== task.id) return normalizedTask;
        return {
          ...normalizedTask,
          completedDates: [...(normalizedTask.completedDates || []), ev._instanceDate],
        };
      }),
    }));
  };

  const completeBonusTask = (ev, task, e) => {
    e.stopPropagation();
    markBonusTaskComplete(ev, task);
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
      const { ev, startSlot } = draggingEvent;
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
    }
    setDragOver(null);
    setDraggingTemplate(null);
    setDraggingEvent(null);
  };

  const handleDragEnd = () => { setDragOver(null); setDraggingTemplate(null); setDraggingEvent(null); };

  // ─── Notes Preview (removed) / Sub-events ───────────────────────────────────
  const [newSubEvent, setNewSubEvent] = useState('');
  const addSubEvent = () => {
    const t = newSubEvent.trim();
    if (!t) return;
    setForm(f => ({ ...f, subEvents: [...(f.subEvents||[]), { id: Date.now(), title: t }] }));
    setNewSubEvent('');
  };
  const removeSubEvent = (id) => setForm(f => ({ ...f, subEvents: f.subEvents.filter(s => s.id !== id) }));
  const toggleNewBonusTaskAttr = (key) => setNewBonusTask((current) => ({
    ...current,
    attributes: current.attributes.includes(key)
      ? current.attributes.filter((attr) => attr !== key)
      : [...current.attributes, key],
  }));
  const addBonusTask = () => {
    const trimmedTitle = newBonusTask.title.trim();
    if (!trimmedTitle || !newBonusTask.attributes.length) return;
    setForm((currentForm) => ({
      ...currentForm,
      bonusTasks: [
        ...(currentForm.bonusTasks || []),
        normalizeBonusTask({
          id: Date.now(),
          title: trimmedTitle,
          xpAmount: Number(newBonusTask.xpAmount) || 10,
          attributes: newBonusTask.attributes,
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
  const openTmplEdit = (tmpl) => { setTmplForm({...tmpl}); setTmplModal({edit:true,id:tmpl.id}); };
  const closeTmplModal = () => setTmplModal(null);
  const saveTmpl = () => { if (!tmplForm.title.trim()) return; setQuickEvents(prev=>[...prev,{...tmplForm,id:Date.now(),title:tmplForm.title.trim()}]); closeTmplModal(); };
  const updateTmpl = () => { if (!tmplForm.title.trim()) return; setQuickEvents(prev=>prev.map(t=>t.id===tmplModal.id?{...tmplForm,id:tmplModal.id,title:tmplForm.title.trim()}:t)); closeTmplModal(); };
  const deleteTmpl = (id) => setQuickEvents(prev=>prev.filter(t=>t.id!==id));
  const toggleTmplAttr = (key) => setTmplForm(f=>({...f,attributes:f.attributes.includes(key)?f.attributes.filter(a=>a!==key):[...f.attributes,key]}));
  const toggleAttr = (key) => setForm(f=>({...f,attributes:f.attributes.includes(key)?f.attributes.filter(a=>a!==key):[...f.attributes,key]}));

  // ─── Expand events ───────────────────────────────────────────────────────────
  const expandedEvents = expandEventsForDates(calendarEvents, activeDateKeys);
  const byDate = {};
  for (const dk of activeDateKeys) byDate[dk] = [];
  for (const ev of expandedEvents) { if (byDate[ev._instanceDate]!==undefined) byDate[ev._instanceDate].push(ev); }
  const columnedByDate = {};
  for (const dk of activeDateKeys) columnedByDate[dk] = buildColumns(byDate[dk]);
  const editingEvent = modal === 'edit' ? calendarEvents.find((ev) => ev.id === editingId) : null;

  const upcomingDayEvents = (() => {
    const entries = [];
    const obj = calendarDayEvents && typeof calendarDayEvents === 'object' ? calendarDayEvents : {};
    for (const [dateKey, items] of Object.entries(obj)) {
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        const targetMs = buildDayEventTargetMs(dateKey, item?.time);
        if (!targetMs) continue;
        if (targetMs < nowMs) continue;
        entries.push({
          dateKey,
          id: item?.id,
          title: item?.title || 'Untitled',
          time: item?.time || null,
          color: item?.color || '#fbbf24',
          targetMs,
        });
      }
    }
    entries.sort((a, b) => a.targetMs - b.targetMs);
    return entries.slice(0, 6);
  })();

  // ─── Time Grid (Day / Week) ──────────────────────────────────────────────────
  const renderTimeGrid = (dates) => (
    <div className="cal-grid-wrapper">
      <div className="cal-day-header-row" style={{ gridTemplateColumns: `64px repeat(${dates.length}, minmax(0, 1fr))` }}>
        <div className="cal-time-gutter-header" />
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
              <span className="cal-day-name">{DAYS_LABEL[d.getDay()]}</span>
              <span className={`cal-day-num ${isToday?'cal-day-num--today':''}`}>{d.getDate()}</span>
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
                    <span className="cal-dayevents-mini-label">＋ Add event</span>
                  </>
                ) : (
                  <>
                    <span className="cal-dayevents-mini-top">
                      <span className="cal-dayevents-mini-dot" style={{ '--mini-color': soonest.evt.color || '#fbbf24' }} />
                      <span className="cal-dayevents-mini-title">{soonest.evt.title || 'Untitled'}</span>
                    </span>
                    <span className="cal-dayevents-mini-meta">{soonestRemaining}</span>
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>
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
                  return (
                    <div
                      key={s}
                      className={`cal-slot ${s%4===0?'cal-slot--hour':''} ${isDragTarget?'cal-slot--drag':''}`}
                      style={{ top: s*SLOT_HEIGHT, height: isDragTarget ? durationSlots*SLOT_HEIGHT : SLOT_HEIGHT }}
                      onClick={()=>openCreate(dk,s)}
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
                {dayEvents.map((ev,ei)=>{
                  const startMin=minsFromEvent(ev), endMin=minsEndFromEvent(ev);
                  const top=(startMin/(24*60))*TOTAL_HEIGHT;
                  const height=Math.max(((endMin-startMin)/(24*60))*TOTAL_HEIGHT,18);
                  const left=`calc(${(ev.colIndex/ev.totalCols)*100}% + 2px)`;
                  const width=`calc(${(1/ev.totalCols)*100}% - 4px)`;
                  const color=primaryColor(ev);
                  const done=isInstanceCompleted(ev);
                  return (
                    <div
                      key={`${ev.id}-${ev._instanceDate}-${ei}`}
                      className={`cal-event ${done?'cal-event--done':''}`}
                      style={{top,height,left,width,'--ev-color':color}}
                      draggable
                      onDragStart={(e)=>handleEventDragStart(e,ev)}
                      onDragEnd={handleDragEnd}
                      onClick={(e)=>{e.stopPropagation();openEdit(ev);}}
                    >
                      <div className="cal-event-inner">
                        <div className="cal-event-title">{ev.title}</div>
                        {height>30&&<div className="cal-event-time">{fmtTime(ev.startHour,ev.startMin)} – {fmtTime(ev.endHour,ev.endMin)}</div>}
                        {height>48&&ev.attributes.length>0&&(
                          <div className="cal-event-attrs">
                            {ev.attributes.map(a=><span key={a} className="cal-event-attr-dot" style={{background:STAT_META[a]?.color}} title={STAT_META[a]?.label}/>)}
                          </div>
                        )}
                        {height>60&&ev.subEvents?.length>0&&(
                          <div className="cal-event-subevents">
                            {ev.subEvents.map(se=>(
                              <div key={se.id} className="cal-event-subevent">{se.title}</div>
                            ))}
                          </div>
                        )}
                        {height>88&&ev.bonusTasks?.length>0&&(
                          <div className="cal-event-bonus-list">
                            {ev.bonusTasks.slice(0, height > 140 ? ev.bonusTasks.length : 2).map((task, taskIndex)=>{
                              const normalizedTask = normalizeBonusTask(task, taskIndex);
                              const bonusDone = isBonusTaskCompleted(normalizedTask, ev);
                              return (
                                <button
                                  key={normalizedTask.id}
                                  type="button"
                                  className={`cal-event-bonus ${bonusDone?'cal-event-bonus--done':''}`}
                                  onClick={(e)=>completeBonusTask(ev, normalizedTask, e)}
                                  title={bonusDone ? 'Completed bonus task' : `Complete bonus task: ${normalizedTask.title}`}
                                >
                                  <span className="cal-event-bonus-check">{bonusDone?'✓':'○'}</span>
                                  <span className="cal-event-bonus-label">{normalizedTask.title}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      <div className="cal-event-actions">
                        <button className={`cal-event-btn cal-event-complete ${done?'cal-event-complete--done':''}`} onClick={(e)=>completeEvent(ev,e)} title={done?'Completed':'Mark complete'}>{done?'✓':'○'}</button>
                        <button className="cal-event-btn cal-event-delete" onClick={(e)=>requestDelete(ev,e)} title="Delete">✕</button>
                      </div>
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
                <div className={`cal-month-daynum ${isToday?'cal-month-daynum--today':''}`}>{d.getDate()}</div>

                <button
                  type="button"
                  className="cal-month-dayevents"
                  onClick={(e)=>{e.stopPropagation();openDayEventCreate(dk);}}
                  title="Add an event"
                >
                  <div className="cal-month-dayevents-head">
                    <span className="cal-month-dayevents-label">Events</span>
                    <span className="cal-month-dayevents-add">＋</span>
                  </div>
                  <div className="cal-month-dayevents-list">
                    {dayReminders.length===0 && (
                      <div className="cal-month-dayevents-empty">Click to add</div>
                    )}
                    {dayReminders.slice(0,2).map((evt)=>{
                      const targetMs = buildDayEventTargetMs(dk, evt.time);
                      const color = evt.color || '#fbbf24';
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
                        style={{'--chip-color':primaryColor(ev)}}
                        onClick={(e)=>{e.stopPropagation();openEdit(ev);}}>
                        {ev.title}
                      </div>
                    );
                  })}
                  {dayEvs.length>3&&<div className="cal-month-more">+{dayEvs.length-3} more</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ─── Sidebar ─────────────────────────────────────────────────────────────────
  const renderSidebar = () => (
    <div className={`cal-sidebar ${sidebarOpen?'cal-sidebar--open':'cal-sidebar--closed'}`}>
      <button className="cal-sidebar-toggle" onClick={()=>setSidebarOpen(o=>!o)} title={sidebarOpen?'Collapse':'Expand'}>
        {sidebarOpen?'‹':'›'}
      </button>
      {sidebarOpen&&(
        <div className="cal-sidebar-content">
          <div className="cal-sidebar-header">
            <span className="cal-sidebar-title">Quick Time Blocks</span>
            <button className="cal-sidebar-add-btn" onClick={openTmplCreate} title="Add template">＋</button>
          </div>
          <p className="cal-sidebar-hint">Drag onto the calendar to place</p>
          <div className="cal-sidebar-list">
            {quickEvents.map(tmpl=>(
              <div key={tmpl.id} className="cal-tmpl-card" style={{'--tmpl-color':tmpl.color||'#fbbf24'}}
                draggable onDragStart={(e)=>handleTemplateDragStart(e,tmpl)} onDragEnd={handleDragEnd}>
                <div className="cal-tmpl-info">
                  <div className="cal-tmpl-title">{tmpl.title}</div>
                  <div className="cal-tmpl-meta">
                    {tmpl.duration}min
                    {tmpl.recurrence!=='none'&&<span className="cal-tmpl-recur">{tmpl.recurrence}</span>}
                  </div>
                  {tmpl.attributes.length>0&&(
                    <div className="cal-tmpl-attrs">
                      {tmpl.attributes.map(a=><span key={a} className="cal-tmpl-attr-dot" style={{background:STAT_META[a]?.color}} title={STAT_META[a]?.label}/>)}
                    </div>
                  )}
                </div>
                <div className="cal-tmpl-actions">
                  <button className="cal-tmpl-btn" onClick={()=>openTmplEdit(tmpl)} title="Edit">✏</button>
                  <button className="cal-tmpl-btn cal-tmpl-btn--del" onClick={()=>deleteTmpl(tmpl.id)} title="Delete">✕</button>
                </div>
              </div>
            ))}
            {quickEvents.length===0&&<p className="cal-sidebar-empty">No templates yet.<br/>Click ＋ to add one.</p>}
          </div>

          <div className="cal-sidebar-divider" />

          <div className="cal-sidebar-header">
            <span className="cal-sidebar-title">Upcoming Events</span>
          </div>
          <p className="cal-sidebar-hint">Deadlines & reminders</p>
          <div className="cal-sidebar-list cal-sidebar-list--events">
            {upcomingDayEvents.map((evt) => {
              const d = daysUntil(evt.targetMs, nowMs);
              const meta = d === 0 ? 'Today' : `${d}d`;
              return (
                <button
                  key={`${evt.dateKey}-${evt.id}`}
                  type="button"
                  className="cal-upcoming-item"
                  style={{ '--up-color': evt.color }}
                  onClick={() => openDayEventEdit(evt.dateKey, evt)}
                  title="Edit event"
                >
                  <span className="cal-upcoming-dot" />
                  <span className="cal-upcoming-main">
                    <span className="cal-upcoming-title">{evt.title}</span>
                    <span className="cal-upcoming-sub">{evt.dateKey}{evt.time ? ` • ${evt.time}` : ''}</span>
                  </span>
                  <span className="cal-upcoming-meta">{meta}</span>
                </button>
              );
            })}
            {upcomingDayEvents.length === 0 && (
              <p className="cal-sidebar-empty">No upcoming events.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );

  // ─── Shared Modal Fields ─────────────────────────────────────────────────────
  const renderAttrPills = (attrs, toggle) => (
    <div className="cal-attr-pills">
      {Object.entries(STAT_META).map(([key,meta])=>{
        const sel=attrs.includes(key); const Icon=meta.Icon;
        return (
          <button key={key} type="button" className={`cal-attr-pill ${sel?'cal-attr-pill--selected':''}`} style={sel?{'--pill-color':meta.color}:{}} onClick={()=>toggle(key)}>
            <Icon size={13}/>{meta.label}
          </button>
        );
      })}
    </div>
  );

  const renderRecurBtns = (val, set) => (
    <div className="cal-recur-row">
      {['none','daily','weekly'].map(r=>(
        <button key={r} type="button" className={`cal-recur-btn ${val===r?'cal-recur-btn--active':''}`} onClick={()=>set(r)}>
          {r==='none'?'No Repeat':r==='daily'?'Daily':'Weekly'}
        </button>
      ))}
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
          <button className="cal-nav-btn" onClick={()=>navigate(-1)}>&#8249;</button>
          <button className="cal-nav-btn" onClick={()=>navigate(1)}>&#8250;</button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="cal-body">
        {renderSidebar()}
        <div className="cal-main">
          {view==='day'&&renderTimeGrid([anchor])}
          {view==='week'&&renderTimeGrid(weekDates)}
          {view==='month'&&renderMonthView()}
        </div>
      </div>

      {/* ── Create / Edit Event Modal ── */}
      {(modal==='create'||modal==='edit')&&(
        <div className="cal-modal-overlay" onClick={closeModal}>
          <div className="cal-modal" onClick={e=>e.stopPropagation()}>
            <div className="cal-modal-header">
              <h3>{modal==='create'?'New Time Block':'Edit Time Block'}</h3>
              <button className="cal-modal-close" onClick={closeModal}>✕</button>
            </div>
            <div className="cal-modal-body">
              <div className="cal-field">
                <label className="cal-label">Title</label>
                <input className="cal-input" placeholder="Time block title…" value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} autoFocus />
              </div>
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
                <label className="cal-label">XP per attribute</label>
                <input className="cal-input cal-input--xp" type="number" min="1" max="500" value={form.xpAmount} onChange={e=>setForm(f=>({...f,xpAmount:e.target.value}))}/>
              </div>
              <div className="cal-field">
                <label className="cal-label">Attributes (full XP to each)</label>
                {renderAttrPills(form.attributes, toggleAttr)}
              </div>
              <div className="cal-field">
                <label className="cal-label">Repeat</label>
                {renderRecurBtns(form.recurrence, r=>setForm(f=>({...f,recurrence:r})))}
              </div>
              <div className="cal-field">
                <label className="cal-label">Sub-Blocks</label>
                <div className="cal-subevents-list">
                  {(form.subEvents||[]).map(se=>(
                    <div key={se.id} className="cal-subevent-row">
                      <span className="cal-subevent-name">{se.title}</span>
                      <button type="button" className="cal-subevent-del" onClick={()=>removeSubEvent(se.id)}>✕</button>
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
                <label className="cal-label">Bonus Tasks</label>
                <div className="cal-bonus-list">
                  {(form.bonusTasks||[]).map((task, index)=>{
                    const normalizedTask = normalizeBonusTask(task, index);
                    const bonusDone = editingEvent
                      ? isBonusTaskCompleted(normalizedTask, normalizeEvent(editingEvent))
                      : Boolean(normalizedTask.completed);
                    return (
                    <div key={normalizedTask.id ?? `bonus-task-${index}`} className={`cal-bonus-row ${bonusDone?'cal-bonus-row--done':''}`}>
                      {modal==='edit' && editingEvent && (
                        <button
                          type="button"
                          className={`cal-bonus-check ${bonusDone?'cal-bonus-check--done':''}`}
                          onClick={()=>markBonusTaskComplete(normalizeEvent(editingEvent), normalizedTask)}
                          disabled={bonusDone}
                          title={bonusDone ? 'Bonus task completed' : `Mark ${normalizedTask.title} complete`}
                        >
                          {bonusDone?'✓':'○'}
                        </button>
                      )}
                      <div className="cal-bonus-main">
                        <span className="cal-bonus-name">{normalizedTask.title}</span>
                        <span className="cal-bonus-meta">+{normalizedTask.xpAmount} XP to {normalizedTask.attributes.map((attr)=>STAT_META[attr]?.label || attr).join(', ')}</span>
                      </div>
                      <button type="button" className="cal-subevent-del" onClick={()=>removeBonusTask(normalizedTask.id)}>✕</button>
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
                    <div className="cal-field">
                      <label className="cal-label">XP</label>
                      <input
                        className="cal-input cal-input--xp"
                        type="number"
                        min="1"
                        max="500"
                        value={newBonusTask.xpAmount}
                        onChange={(e)=>setNewBonusTask((current)=>({...current,xpAmount:e.target.value}))}
                      />
                    </div>
                  </div>
                  <div className="cal-field">
                    <label className="cal-label">Reward Attributes</label>
                    {renderAttrPills(newBonusTask.attributes, toggleNewBonusTaskAttr)}
                  </div>
                  <button type="button" className="cal-btn cal-btn--ghost cal-bonus-add-btn" disabled={!newBonusTask.title.trim() || !newBonusTask.attributes.length} onClick={addBonusTask}>Add Bonus Task</button>
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
              <button className="cal-modal-close" onClick={closeTmplModal}>✕</button>
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
                <div className="cal-field">
                  <label className="cal-label">XP per attribute</label>
                  <input className="cal-input cal-input--xp" type="number" min="1" max="500" value={tmplForm.xpAmount} onChange={e=>setTmplForm(f=>({...f,xpAmount:Number(e.target.value)}))}/>
                </div>
              </div>
              <div className="cal-field">
                <label className="cal-label">Attributes</label>
                {renderAttrPills(tmplForm.attributes, toggleTmplAttr)}
              </div>
              <div className="cal-field">
                <label className="cal-label">Repeat</label>
                {renderRecurBtns(tmplForm.recurrence, r=>setTmplForm(f=>({...f,recurrence:r})))}
              </div>
              <div className="cal-field">
                <label className="cal-label">Color</label>
                <div className="cal-color-row">
                  {['#fbbf24','#f87171','#4ade80','#38bdf8','#c084fc','#fb923c','#f472b6','#a3e635'].map(c=>(
                    <button key={c} type="button" className={`cal-color-swatch ${tmplForm.color===c?'cal-color-swatch--active':''}`} style={{background:c}} onClick={()=>setTmplForm(f=>({...f,color:c}))}/>
                  ))}
                </div>
              </div>
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
              <button className="cal-modal-close" onClick={closeDayEventModal}>✕</button>
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
    </div>
  );
}
