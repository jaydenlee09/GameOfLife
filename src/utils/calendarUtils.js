// Pure, state-free helpers for expanding stored calendar events/blocks
// (including daily/weekly recurrence and exception dates) into concrete
// per-date instances. Shared by CalendarPage and WelcomePage.

export const toDateKey = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const parseDateKey = (dateKey) => {
  const [y, m, d] = String(dateKey || '').split('-').map(Number);
  if (!y || !m || !d) return null;
  return { y, m, d };
};

export const buildDayEventTargetMs = (dateKey, timeHHMM) => {
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

export const fmtRemaining = (targetMs, nowMs) => {
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

export const cloneSubEvents = (subEvents = []) => subEvents.map((subEvent) => ({ ...subEvent }));
export const normalizeBonusTask = (task = {}, index = 0) => ({
  id: task.id ?? `bonus-${index}-${task.title || 'task'}`,
  title: task.title || '',
  xpAmount: Number(task.xpAmount) || 10,
  attributes: Array.isArray(task.attributes) ? [...task.attributes] : [],
  completed: Boolean(task.completed),
  completedDates: Array.isArray(task.completedDates) ? [...task.completedDates] : [],
});
export const cloneBonusTasks = (bonusTasks = []) => bonusTasks.map((task, index) => normalizeBonusTask(task, index));
export const normalizeEvent = (ev = {}) => ({
  ...ev,
  attributes: Array.isArray(ev.attributes) ? [...ev.attributes] : [],
  subEvents: cloneSubEvents(ev.subEvents || []),
  bonusTasks: cloneBonusTasks(ev.bonusTasks || []),
  completedDates: Array.isArray(ev.completedDates) ? [...ev.completedDates] : [],
  // Which weekdays (0=Sun…6=Sat) a 'weekly' recurrence lands on. Empty/missing
  // falls back to the item's own anchor-date weekday — see expandEventsForDates.
  recurrenceDays: Array.isArray(ev.recurrenceDays) ? [...ev.recurrenceDays] : [],
});

export const expandEventsForDates = (storedEvents, dateKeys) => {
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
      const days = normalizedEvent.recurrenceDays.length ? normalizedEvent.recurrenceDays : [evDay];
      for (const dk of dateKeys) {
        const dkDay = new Date(dk + 'T00:00:00').getDay();
        if (dk >= normalizedEvent.date && days.includes(dkDay)) result.push({ ...normalizedEvent, _instanceDate: dk, _isVirtual: dk !== normalizedEvent.date });
      }
    }
  }
  return result.filter(ev => {
    if (ev._exceptDates?.includes(ev._instanceDate)) return false;
    if (ev._forwardDeleteFrom && ev._instanceDate >= ev._forwardDeleteFrom) return false;
    return true;
  });
};

export const isInstanceCompleted = (ev) => {
  if (ev.recurrence === 'none' || !ev.recurrence) return ev.completed;
  return ev.completedDates?.includes(ev._instanceDate);
};
