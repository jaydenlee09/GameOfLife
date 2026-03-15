const TASK_TIMEFRAME_XP = {
  today: 20,
  tomorrow: 30,
  'this-week': 50,
  'this-month': 100,
};

const VALID_TIMEFRAMES = Object.keys(TASK_TIMEFRAME_XP);
const VALID_RECURRENCE = ['none', 'daily', 'weekly'];
const VALID_CHALLENGE_DURATIONS = ['daily', 'weekly', 'monthly'];

const makeId = (prefix = 'id') => `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;

const toTrimmedString = (value) => (typeof value === 'string' ? value.trim() : '');
const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseTimeLike = (timeString) => {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(toTrimmedString(timeString));
  if (!match) return null;
  return { hour: Number(match[1]), minute: Number(match[2]) };
};

const normalizeDateKey = (value) => {
  const text = toTrimmedString(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  return text;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const normalizeTaskPayload = (payload, validStats) => {
  const text = toTrimmedString(payload?.text || payload?.title);
  if (!text) throw new Error('Task is missing text.');

  const timeFrame = VALID_TIMEFRAMES.includes(payload?.timeFrame) ? payload.timeFrame : 'today';
  const requestedCategories = Array.isArray(payload?.categories)
    ? payload.categories
    : payload?.category
      ? [payload.category]
      : [];
  const categories = requestedCategories.filter((category) => validStats.includes(category));
  const normalizedCategories = categories.length ? categories : ['discipline'];

  const fallbackXp = TASK_TIMEFRAME_XP[timeFrame];
  const xp = clamp(Math.round(toNumber(payload?.xp, fallbackXp)), 1, 5000);

  return {
    text,
    timeFrame,
    xp,
    categories: normalizedCategories,
    notes: toTrimmedString(payload?.notes),
  };
};

const normalizeCalendarEventPayload = (payload, validStats) => {
  const title = toTrimmedString(payload?.title || payload?.text || payload?.name);
  if (!title) throw new Error('Calendar event is missing a title.');

  const date = normalizeDateKey(payload?.date);
  if (!date) throw new Error('Calendar event requires date in YYYY-MM-DD format.');

  const startTime = parseTimeLike(payload?.startTime);
  const endTime = parseTimeLike(payload?.endTime);

  let startHour = toNumber(payload?.startHour, startTime?.hour ?? 9);
  let startMin = toNumber(payload?.startMin, startTime?.minute ?? 0);
  let endHour = toNumber(payload?.endHour, endTime?.hour ?? startHour + 1);
  let endMin = toNumber(payload?.endMin, endTime?.minute ?? startMin);

  startHour = clamp(Math.floor(startHour), 0, 23);
  endHour = clamp(Math.floor(endHour), 0, 23);
  startMin = clamp(Math.floor(startMin / 15) * 15, 0, 45);
  endMin = clamp(Math.floor(endMin / 15) * 15, 0, 45);

  const startTotal = startHour * 60 + startMin;
  let endTotal = endHour * 60 + endMin;
  if (endTotal <= startTotal) {
    endTotal = clamp(startTotal + 60, 15, 23 * 60 + 45);
    endHour = Math.floor(endTotal / 60);
    endMin = endTotal % 60;
  }

  const requestedAttributes = Array.isArray(payload?.attributes) ? payload.attributes : [];
  const attributes = requestedAttributes.filter((attribute) => validStats.includes(attribute));

  const recurrence = VALID_RECURRENCE.includes(payload?.recurrence) ? payload.recurrence : 'none';
  const xpAmount = clamp(Math.round(toNumber(payload?.xpAmount, 20)), 1, 5000);

  return {
    title,
    date,
    startHour,
    startMin,
    endHour,
    endMin,
    xpAmount,
    attributes,
    recurrence,
    notes: toTrimmedString(payload?.notes),
  };
};

const normalizeQuickTemplatePayload = (payload, validStats) => {
  const title = toTrimmedString(payload?.title || payload?.text || payload?.name);
  if (!title) throw new Error('Template is missing a title.');

  const duration = clamp(Math.round(toNumber(payload?.duration, 60)), 15, 720);
  const xpAmount = clamp(Math.round(toNumber(payload?.xpAmount, 20)), 1, 5000);

  const requestedAttributes = Array.isArray(payload?.attributes) ? payload.attributes : [];
  const attributes = requestedAttributes.filter((attribute) => validStats.includes(attribute));

  const recurrence = VALID_RECURRENCE.includes(payload?.recurrence) ? payload.recurrence : 'none';
  const color = /^#[0-9a-fA-F]{6}$/.test(toTrimmedString(payload?.color)) ? payload.color : '#818cf8';

  return {
    title,
    duration,
    xpAmount,
    attributes,
    recurrence,
    color,
  };
};

const normalizeChallengePayload = (payload, validStats) => {
  const text = toTrimmedString(payload?.text || payload?.title);
  if (!text) throw new Error('Challenge is missing text.');

  const category = validStats.includes(payload?.category) ? payload.category : 'discipline';
  const duration = VALID_CHALLENGE_DURATIONS.includes(payload?.duration) ? payload.duration : 'daily';
  const xpFallback = duration === 'monthly' ? 500 : duration === 'weekly' ? 100 : 30;
  const xp = clamp(Math.round(toNumber(payload?.xp, xpFallback)), 1, 9999);

  return {
    text,
    category,
    duration,
    xp,
  };
};

const friendlyLabel = (type, payload) => {
  if (type === 'create_task') return `Create task: ${payload.text}`;
  if (type === 'create_calendar_event') return `Add calendar block: ${payload.title}`;
  if (type === 'create_quick_event_template') return `Create time block template: ${payload.title}`;
  if (type === 'create_challenge') return `Create challenge: ${payload.text}`;
  return 'Unknown action';
};

export const prepareMentorActions = (rawActions, validStats) => {
  const actions = [];
  const errors = [];
  const statKeys = Array.isArray(validStats) && validStats.length ? validStats : ['discipline'];

  const list = Array.isArray(rawActions) ? rawActions : [];
  list.forEach((rawAction, index) => {
    try {
      const type = toTrimmedString(rawAction?.type).toLowerCase();
      const payload = rawAction?.payload || {};

      let normalizedPayload;
      if (type === 'create_task') normalizedPayload = normalizeTaskPayload(payload, statKeys);
      else if (type === 'create_calendar_event') normalizedPayload = normalizeCalendarEventPayload(payload, statKeys);
      else if (type === 'create_quick_event_template') normalizedPayload = normalizeQuickTemplatePayload(payload, statKeys);
      else if (type === 'create_challenge') normalizedPayload = normalizeChallengePayload(payload, statKeys);
      else throw new Error(`Unsupported action type: ${type || 'missing type'}`);

      actions.push({
        id: makeId(`mentor_action_${index}`),
        type,
        payload: normalizedPayload,
        status: 'pending',
        label: friendlyLabel(type, normalizedPayload),
      });
    } catch (error) {
      errors.push(error.message || 'Invalid action proposal.');
    }
  });

  return { actions, errors };
};

export const applyMentorAction = (action, { setTodos, setCalendarEvents, setQuickEvents, setChallenges }) => {
  if (!action?.type || !action?.payload) {
    return { ok: false, message: 'Action payload is missing.' };
  }

  if (action.type === 'create_task') {
    const nextTask = {
      id: Date.now() + Math.floor(Math.random() * 10_000),
      text: action.payload.text,
      timeFrame: action.payload.timeFrame,
      xp: action.payload.xp,
      categories: action.payload.categories,
      category: action.payload.categories[0],
      completed: false,
      notes: action.payload.notes || '',
      subtasks: [],
    };
    setTodos((prev) => [...prev, nextTask]);
    return { ok: true, message: `Created task: ${nextTask.text}` };
  }

  if (action.type === 'create_calendar_event') {
    const nextEvent = {
      id: Date.now() + Math.floor(Math.random() * 10_000),
      title: action.payload.title,
      date: action.payload.date,
      startHour: action.payload.startHour,
      startMin: action.payload.startMin,
      endHour: action.payload.endHour,
      endMin: action.payload.endMin,
      xpAmount: action.payload.xpAmount,
      attributes: action.payload.attributes,
      recurrence: action.payload.recurrence,
      notes: action.payload.notes || '',
      subEvents: [],
      bonusTasks: [],
      completed: false,
      completedDates: [],
    };
    setCalendarEvents((prev) => [...prev, nextEvent]);
    return { ok: true, message: `Added calendar block: ${nextEvent.title}` };
  }

  if (action.type === 'create_quick_event_template') {
    const nextTemplate = {
      id: `tmpl_${Date.now()}_${Math.floor(Math.random() * 10_000)}`,
      title: action.payload.title,
      duration: action.payload.duration,
      attributes: action.payload.attributes,
      xpAmount: action.payload.xpAmount,
      recurrence: action.payload.recurrence,
      color: action.payload.color,
    };
    setQuickEvents((prev) => [...prev, nextTemplate]);
    return { ok: true, message: `Created time block template: ${nextTemplate.title}` };
  }

  if (action.type === 'create_challenge') {
    const nextChallenge = {
      id: `custom_${Date.now()}_${Math.floor(Math.random() * 10_000)}`,
      text: action.payload.text,
      xp: action.payload.xp,
      category: action.payload.category,
      duration: action.payload.duration,
      isCustom: true,
      completed: false,
      started: false,
      startedAt: null,
    };
    setChallenges((prev) => [...prev, nextChallenge]);
    return { ok: true, message: `Created challenge: ${nextChallenge.text}` };
  }

  return { ok: false, message: `Unsupported action type: ${action.type}` };
};
