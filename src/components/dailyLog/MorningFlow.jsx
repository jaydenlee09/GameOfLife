import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Check, ChevronLeft, ChevronRight, Sun, Moon, BatteryCharging, Handshake, Flag, Star, Plus,
  Target, ShieldAlert, Compass, CalendarPlus, CalendarCheck, Play, Pencil, Lock, CheckSquare, Sparkles, LoaderCircle,
  Bell, X, RotateCcw, AlertTriangle, RefreshCw,
} from 'lucide-react';
import { Block } from './CloseDayFlow';
import { CoachRead, WinCheckCard } from './MorningCoach';
import { SleepInput, EnergyPicker, ENERGY_LABELS } from './HealthQuick';
import {
  MORNING_STEP_KEYS, MORNING_STEP_META, getMorningStatus, getMorningStart,
  getWinSuggestions, MOMENT_SUGGESTIONS, morningIfThen, getMorningPatterns, getPatternLines,
  formatRemindAt, getPastPlans, isPickedPlan,
} from '../../utils/morningJournal';
import { getYesterdayCommitment } from '../../utils/homeUtils';
import { expandEventsForDates } from '../../utils/calendarUtils';
import { todayQueue, makeTask, TOP_LIMIT } from '../../utils/taskUtils';
import './CloseDay.css';

// "Start your day": the Daily Log's 3-step morning journal for today's entry.
// Everything saves as you type into entry.morning (sleep into healthLog[today]).

const MotionDiv = motion.div;
const FINE_POINTER = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: fine)').matches;
const SHOWN_TASKS = 6;

const formatDayLabel = (dateKey) => {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
};

const nowMs = () => Date.now();
const formatTime = (ms) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

const SUGGESTION_ICON = { coach: Sparkles, week: Target, goal: Flag, task: Star };

// ─── Steps ────────────────────────────────────────────────────────────────────

const WakeStep = ({ morning, setMorning, todayKey, healthLog, setHealthLog, commitment }) => (
  <>
    <Block Icon={Moon} title="Last night’s sleep" hint="9h+ counts toward today’s score" area="sleep">
      <SleepInput todayKey={todayKey} healthLog={healthLog} setHealthLog={setHealthLog} />
    </Block>

    <Block Icon={BatteryCharging} title="How rested do you feel?" area="rested">
      <EnergyPicker value={morning.energy} onChange={(energy) => setMorning({ energy })} label="How rested do you feel" />
      <span className="hq-hint mj-hint">{morning.energy ? ENERGY_LABELS[morning.energy] : '1 drained · 5 great'}</span>
    </Block>

    {commitment.status !== 'none' && (
      <Block Icon={Handshake} title="Last night you promised" area="promise">
        <p className="cd-quote">{commitment.text}</p>
        {commitment.status === 'kept' && <p className="cd-status cd-status--success"><Check size={14} /> Already kept. Nice.</p>}
        {commitment.status === 'missed' && <p className="cd-status cd-status--muted">Marked as missed. Today is a clean slate.</p>}
        {commitment.status === 'pending' && <p className="cd-status cd-status--muted">Make room for it today. Tonight will ask if you kept it.</p>}
      </Block>
    )}
  </>
);

/** Today's task list with a star per row for the Top 3, plus a quick add. */
const TopThree = ({ todos, setTodos, todayKey }) => {
  const [text, setText] = useState('');
  const queue = todayQueue(todos, todayKey);
  const topCount = queue.filter((t) => t.topDate === todayKey).length;
  const full = topCount >= TOP_LIMIT;

  const toggle = (task) => {
    const on = task.topDate !== todayKey;
    if (on && full) return;
    setTodos((prev) => prev.map((t) => (t.id === task.id ? { ...t, topDate: on ? todayKey : null, topAt: on ? Date.now() : null } : t)));
  };
  const add = () => {
    const value = text.trim();
    if (!value) return;
    setTodos((prev) => [...prev, makeTask({ text: value, top: !full }, todayKey)]);
    setText('');
  };

  return (
    <Block Icon={Star} title="Top 3 for today" hint={`${topCount}/${TOP_LIMIT} starred`} area="top3">
      {queue.length > 0 ? (
        <ul className="mj-tasks">
          {queue.slice(0, SHOWN_TASKS).map((t) => {
            const isTop = t.topDate === todayKey;
            return (
              <li key={t.id}>
                <button
                  type="button"
                  className={`mj-task${isTop ? ' is-top' : ''}`}
                  aria-pressed={isTop}
                  onClick={() => toggle(t)}
                  disabled={!isTop && full}
                  title={!isTop && full ? 'Top 3 is full. Unstar one to make room.' : undefined}
                >
                  <Star size={15} fill={isTop ? 'currentColor' : 'none'} className="mj-task-star" />
                  <span className="mj-task-text">{t.text}</span>
                </button>
              </li>
            );
          })}
          {queue.length > SHOWN_TASKS && <li className="mj-tasks-more">+{queue.length - SHOWN_TASKS} more on your Tasks page</li>}
        </ul>
      ) : (
        <p className="cd-question mj-empty">Nothing on today’s list yet. Add what has to happen today.</p>
      )}
      <div className="mj-add">
        <input
          type="text"
          className="cd-input"
          value={text}
          placeholder={full ? 'Add a task for today…' : 'Add a task (starred)…'}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          aria-label="Add a task for today"
        />
        <button type="button" className="cd-btn" onClick={add} disabled={!text.trim()} aria-label="Add task"><Plus size={16} /></button>
      </div>
    </Block>
  );
};

const FocusStep = ({ morning, setMorning, suggestions, todos, setTodos, todayKey, coachRead }) => (
  <>
    {coachRead}

    <Block Icon={Flag} title="Today is a win if I…" hint="Just one thing" area="win">
      <input
        type="text"
        className="cd-input cd-input--big"
        value={morning.win || ''}
        placeholder="finish the first draft of my essay"
        onChange={(e) => setMorning({ win: e.target.value })}
        autoFocus={!morning.win && FINE_POINTER}
      />
      {!morning.win?.trim() && suggestions.length > 0 && (
        <div className="cd-chips mj-suggestions">
          {suggestions.map((s) => {
            const Icon = SUGGESTION_ICON[s.source];
            return (
              <button key={s.text} type="button" className="cd-chip" onClick={() => setMorning({ win: s.text })}>
                <Icon size={13} /> {s.text}
              </button>
            );
          })}
        </div>
      )}
    </Block>

    <TopThree todos={todos} setTodos={setTodos} todayKey={todayKey} />
  </>
);

/** One tappable "If …, I will …" plan. Picking it fills both halves (and the reminder, when it has a time). */
const IfThenOption = ({ option, icon, picked, onPick }) => (
  <button type="button" className={`cd-chip mj-ifthen-opt${picked ? ' is-picked' : ''}`} aria-pressed={picked} onClick={onPick}>
    {picked ? <Check size={13} /> : icon}
    <span className="mj-ifthen-text">
      <span className="mj-ifthen-key">If</span> {option.when}, <span className="mj-ifthen-key">I will</span> {option.then}.
      {option.at && <span className="mj-ifthen-at"><Bell size={11} /> {formatRemindAt(option.at)}</span>}
    </span>
  </button>
);

/**
 * AI actions that prove "Today I'll be someone who…", each one tap from being a
 * task for today. Shown only while they match the line as it's written now.
 */
const IdentitySteps = ({ morning, todos, setTodos, todayKey, run }) => {
  const identity = morning.identity?.trim() || '';
  if (!run || !identity) return null;
  const steps = morning.identitySteps?.forIdentity === identity ? morning.identitySteps.steps || [] : [];
  const isAdded = (step) => todos.some((t) => t.text?.trim().toLowerCase() === step.text.toLowerCase());
  const add = (step) => {
    if (isAdded(step)) return;
    setTodos((prev) => [...prev, makeTask({ text: step.text }, todayKey)]);
  };

  if (!steps.length) {
    return (
      <div className="mj-id-steps">
        {run.loading ? (
          <p className="mj-ifthen-wait"><LoaderCircle size={14} className="log-review-spin" /> Turning it into actions…</p>
        ) : (
          <button type="button" className="cd-btn mj-id-run" onClick={run.onRun}><Sparkles size={14} /> Turn it into actions</button>
        )}
        {run.error && !run.loading && (
          <p className="li-error mj-ifthen-error" role="alert"><AlertTriangle size={13} /> <span>{run.error}</span></p>
        )}
      </div>
    );
  }

  return (
    <div className="mj-id-steps">
      <span className="mj-group-label"><Sparkles size={12} /> Prove it today</span>
      <ul className="mj-id-list">
        {steps.map((step) => {
          const added = isAdded(step);
          return (
            <li key={step.text} className="mj-id-step">
              <span className="mj-id-text">
                {step.text}
                {step.minutes && <span className="mj-id-min">{step.minutes} min</span>}
              </span>
              <button
                type="button"
                className={`cd-chip mj-id-add${added ? ' is-added' : ''}`}
                onClick={() => add(step)}
                disabled={added}
                aria-label={added ? `${step.text} is on today’s tasks` : `Add “${step.text}” to today’s tasks`}
              >
                {added ? <><Check size={13} /> Added</> : <><Plus size={13} /> Add to today</>}
              </button>
            </li>
          );
        })}
      </ul>
      <button type="button" className="li-link mj-id-again" onClick={run.onRun} disabled={run.loading}>
        {run.loading ? <LoaderCircle size={12} className="log-review-spin" /> : <RefreshCw size={12} />} Other ideas
      </button>
      {run.error && !run.loading && <p className="li-error mj-ifthen-error" role="alert"><AlertTriangle size={13} /> <span>{run.error}</span></p>}
    </div>
  );
};

const LockInStep = ({ morning, setMorning, northStar, ifThens, pastPlans, todos, setTodos, todayKey, identityRun }) => {
  const vision = northStar?.vision?.trim();
  const ifThen = morningIfThen(morning);
  const remind = formatRemindAt(morning.remindAt);
  const pick = (option, withTime) => setMorning({
    obstacle: option.when,
    plan: option.then,
    ifMoment: true,
    ...(withTime ? { remindAt: option.at || '' } : {}),
  });
  const picked = (option) => isPickedPlan(morning, [option]);
  const showAi = ifThens.loading || ifThens.error || ifThens.options.length > 0;

  return (
    <>
      <Block Icon={ShieldAlert} title="What could knock you off track?" hint="Decide now, not in the moment" area="obstacle">
        {showAi && (
          <div className="mj-ifthen-group">
            <span className="mj-group-label"><Sparkles size={12} /> Plans for today’s win</span>
            {ifThens.loading && ifThens.options.length === 0 && (
              <p className="mj-ifthen-wait"><LoaderCircle size={14} className="log-review-spin" /> Writing plans around your win…</p>
            )}
            {ifThens.error && !ifThens.loading && (
              <p className="li-error mj-ifthen-error" role="alert">
                <AlertTriangle size={13} /> <span>{ifThens.error}</span>
                <button type="button" className="li-link" onClick={ifThens.onRetry}><RefreshCw size={12} /> Try again</button>
              </p>
            )}
            {ifThens.options.length > 0 && (
              <div className="cd-chips">
                {ifThens.options.map((o) => (
                  <IfThenOption key={o.when} option={o} icon={<Sparkles size={13} />} picked={picked(o)} onPick={() => pick(o, true)} />
                ))}
              </div>
            )}
          </div>
        )}

        {pastPlans.length > 0 && (
          <div className="mj-ifthen-group">
            <span className="mj-group-label"><RotateCcw size={12} /> Held before</span>
            <div className="cd-chips">
              {pastPlans.map((o) => (
                <IfThenOption key={`${o.when}|${o.then}`} option={o} icon={<RotateCcw size={13} />} picked={picked(o)} onPick={() => pick(o, false)} />
              ))}
            </div>
          </div>
        )}

        {(showAi || pastPlans.length > 0) && <span className="mj-group-label mj-own-label"><Pencil size={12} /> Or write your own</span>}
        <div className="cd-ifthen">
          <label className="cd-ifthen-row">
            <span>If</span>
            <input
              type="text"
              className="cd-input"
              value={morning.obstacle || ''}
              placeholder="I pick up my phone between blocks"
              onChange={(e) => setMorning({ obstacle: e.target.value, ifMoment: true })}
              autoFocus={!morning.obstacle && FINE_POINTER && !showAi}
            />
          </label>
          {!morning.obstacle?.trim() && (
            <div className="mj-pills">
              {MOMENT_SUGGESTIONS.map((text) => (
                <button key={text} type="button" className="mj-pill" onClick={() => setMorning({ obstacle: text, ifMoment: true })}>{text}</button>
              ))}
            </div>
          )}
          <label className="cd-ifthen-row">
            <span>I will</span>
            <input
              type="text"
              className="cd-input"
              value={morning.plan || ''}
              placeholder="put it in the other room and start a 10-min timer"
              onChange={(e) => setMorning({ plan: e.target.value, ifMoment: true })}
            />
          </label>
        </div>

        {ifThen && (
          <div className="mj-remind">
            <label className="mj-remind-row">
              <Bell size={14} />
              <span>Remind me at</span>
              <input
                type="time"
                className="cd-input mj-remind-time"
                value={morning.remindAt || ''}
                onChange={(e) => setMorning({ remindAt: e.target.value })}
                aria-label="Remind me of this plan at"
              />
              {morning.remindAt && (
                <button type="button" className="mj-remind-clear" onClick={() => setMorning({ remindAt: '' })} aria-label="No reminder">
                  <X size={14} />
                </button>
              )}
            </label>
            <span className="hq-hint mj-hint">
              {remind ? `At ${remind} you’ll get a push: “${ifThen}.”` : 'Pick the time it’s most likely to happen. Needs notifications on.'}
            </span>
          </div>
        )}
      </Block>

      <Block Icon={Compass} title="Today I’ll be someone who…" area="identity">
        {vision && <p className="cd-question mj-vision">Becoming: {vision}</p>}
        <input
          type="text"
          className="cd-input"
          value={morning.identity || ''}
          placeholder="does the hard thing first"
          onChange={(e) => setMorning({ identity: e.target.value })}
        />
        <IdentitySteps morning={morning} todos={todos} setTodos={setTodos} todayKey={todayKey} run={identityRun} />
      </Block>
    </>
  );
};

const LockedIn = ({ morning, todayKey, todos, setTodos, identityRun, plannedToday, onPlanDay, onStartFocus, onNavigate, onEdit }) => {
  const top = todos.filter((t) => !t.completed && t.topDate === todayKey);
  const ifThen = morningIfThen(morning);
  return (
    <div className="mj-locked">
      <div className="cd-closed-hero cd-a-hero">
        <span className="cd-closed-moon"><Sun size={28} /></span>
        <h2 className="cd-title">Locked in.</h2>
        <p className="cd-closed-sub">Set at {formatTime(morning.doneAt)}. You know what today is for. Go make it real.</p>
      </div>

      <Block Icon={Flag} title="Today is a win if I" area="mwin">
        <p className="cd-quote">{morning.win?.trim() || '–'}</p>
      </Block>

      {(ifThen || morning.identity?.trim()) && (
        <Block Icon={Lock} title="Your plan" area="mplan">
          {ifThen && <p className="cd-quote cd-quote--small">{ifThen}.</p>}
          {ifThen && formatRemindAt(morning.remindAt) && (
            <p className="hq-hint mj-remind-note"><Bell size={12} /> Reminder at {formatRemindAt(morning.remindAt)}</p>
          )}
          {morning.identity?.trim() && <p className="cd-quote cd-quote--small">Today I’m someone who {morning.identity.trim()}.</p>}
          {morning.identitySteps?.forIdentity === morning.identity?.trim() && (
            <IdentitySteps morning={morning} todos={todos} setTodos={setTodos} todayKey={todayKey} run={identityRun} />
          )}
        </Block>
      )}

      {top.length > 0 && (
        <Block Icon={CheckSquare} title="Top 3" area="mtop">
          <ol className="mj-top-list">
            {top.map((t) => <li key={t.id}>{t.text}</li>)}
          </ol>
        </Block>
      )}

      <div className="mj-actions cd-a-mactions">
        {plannedToday ? (
          <button type="button" className="cd-btn cd-btn--primary" onClick={() => onNavigate?.('calendar')}><CalendarCheck size={16} /> See today’s plan</button>
        ) : (
          <button type="button" className="cd-btn cd-btn--primary" onClick={onPlanDay}><CalendarPlus size={16} /> Plan my day</button>
        )}
        <button type="button" className="cd-btn" onClick={onStartFocus}><Play size={15} /> Start focus</button>
      </div>

      <button type="button" className="cd-btn cd-btn--ghost cd-edit-btn cd-a-edit" onClick={onEdit}>
        <Pencil size={14} /> Edit this morning
      </button>
    </div>
  );
};

// ─── Flow ─────────────────────────────────────────────────────────────────────

const MorningFlow = ({
  todayKey, entry, updateField, logs, commitmentArchive, healthLog, setHealthLog,
  todos = [], setTodos, goals, northStar, weekPriority, calendarEvents,
  onPlanDay, onStartFocus, onNavigate, modeSwitch, ai = null, saveMorning,
}) => {
  const reduceMotion = useReducedMotion();
  const rootRef = useRef(null);
  const now = useMemo(() => new Date(), []);

  const morning = entry.morning || {};
  const setMorning = (fields) => updateField('morning', { ...(entry.morning || {}), ...fields });

  const status = getMorningStatus(entry, healthLog[todayKey]?.sleepHours != null);
  const [step, setStep] = useState(() => getMorningStart(entry, status));
  const index = MORNING_STEP_KEYS.indexOf(step);

  const commitment = getYesterdayCommitment(logs, commitmentArchive, now);
  const suggestions = getWinSuggestions({ todos, goals, weekPriority, todayKey, coachOptions: morning.coach?.winOptions });
  const patternLines = useMemo(() => getPatternLines(getMorningPatterns(logs, healthLog, todayKey)), [logs, healthLog, todayKey]);
  const plannedToday = expandEventsForDates(calendarEvents || [], [todayKey]).length > 0;

  // The coach's read: once per morning, as soon as you reach the part it helps with.
  const [coachError, setCoachError] = useState(null);
  const coachTried = useRef(false);
  const runCoach = useCallback(async (opts) => {
    const result = await ai.coach(todayKey, opts);
    if (result.ok) saveMorning(todayKey, { coach: result.coach });
    else setCoachError(result.error);
  }, [ai, saveMorning, todayKey]);
  const coachDue = !!ai && !morning.coach && !morning.doneAt && (step === 'focus' || step === 'lockIn');
  useEffect(() => {
    if (!coachDue || coachTried.current) return;
    coachTried.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- state only changes once the reply lands
    runCoach({ background: true });
  }, [coachDue, runCoach]);
  const retryCoach = () => {
    setCoachError(null);
    runCoach();
  };

  // If-then options for today's win: once per win, when you reach Lock in.
  const win = morning.win?.trim() || '';
  const pastPlans = useMemo(() => getPastPlans(logs, todayKey), [logs, todayKey]);
  const ifThenOptions = morning.ifThenOptions?.forWin === win ? morning.ifThenOptions.options || [] : [];
  const [ifThenRun, setIfThenRun] = useState({ loadingFor: null, errorFor: null, error: null });
  const ifThenTried = useRef(null);
  const runIfThens = useCallback(async (forWin) => {
    setIfThenRun({ loadingFor: forWin, errorFor: null, error: null });
    const result = await ai.ifThens(todayKey, forWin);
    if (result.ok) saveMorning(todayKey, { ifThenOptions: result.ifThens });
    setIfThenRun((r) => (r.loadingFor === forWin
      ? { loadingFor: null, errorFor: result.ok ? null : forWin, error: result.ok ? null : result.error }
      : r));
  }, [ai, saveMorning, todayKey]);
  const ifThensDue = !!ai?.ifThens && !!win && step === 'lockIn' && morning.ifThenOptions?.forWin !== win;
  useEffect(() => {
    if (!ifThensDue || ifThenTried.current === win) return;
    ifThenTried.current = win;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- shows the loading line while the reply is on its way
    runIfThens(win);
  }, [ifThensDue, win, runIfThens]);
  const ifThens = {
    options: ifThenOptions,
    loading: ifThenRun.loadingFor === win && !!win,
    error: ifThenRun.errorFor === win && ifThenOptions.length === 0 ? ifThenRun.error : null,
    onRetry: () => runIfThens(win),
  };

  // Actions for "Today I'll be someone who…": only on a tap, since the line is typed.
  const identity = morning.identity?.trim() || '';
  const [identityRunState, setIdentityRunState] = useState({ loadingFor: null, errorFor: null, error: null });
  const runIdentitySteps = useCallback(async (forIdentity) => {
    setIdentityRunState({ loadingFor: forIdentity, errorFor: null, error: null });
    const result = await ai.identitySteps(todayKey, forIdentity);
    if (result.ok) saveMorning(todayKey, { identitySteps: result.identitySteps });
    setIdentityRunState((r) => (r.loadingFor === forIdentity
      ? { loadingFor: null, errorFor: result.ok ? null : forIdentity, error: result.ok ? null : result.error }
      : r));
  }, [ai, saveMorning, todayKey]);
  const identityRun = ai?.identitySteps ? {
    loading: !!identity && identityRunState.loadingFor === identity,
    error: identityRunState.errorFor === identity ? identityRunState.error : null,
    onRun: () => identity && runIdentitySteps(identity),
  } : null;

  // Lock in checks the win first (and a plan you wrote yourself). Leaving the step or tapping "Lock in now" drops the reply.
  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState(null);
  const checkRun = useRef(0);

  const scrollToTop = () => rootRef.current?.scrollIntoView({ block: 'start' });
  const goTo = (key) => {
    checkRun.current += 1;
    setChecking(false);
    setCheck(null);
    setStep(key);
  };
  const next = () => goTo(MORNING_STEP_KEYS[Math.min(index + 1, MORNING_STEP_KEYS.length - 1)]);
  const back = () => goTo(MORNING_STEP_KEYS[Math.max(index - 1, 0)]);
  const canLock = !!morning.win?.trim();
  const finishLock = (fields) => {
    saveMorning(todayKey, { ...fields, doneAt: nowMs() });
    goTo('locked');
  };
  const lockIn = async () => {
    const ifThen = morningIfThen(morning);
    // A plan you picked (AI option or one that held before) was already shaped; only your own gets checked.
    const ownPlan = morning.ifMoment && ifThen && !isPickedPlan(morning, [...ifThenOptions, ...pastPlans])
      ? { when: morning.obstacle, then: morning.plan }
      : null;
    const winChecked = morning.winCheck?.forWin === win;
    const planChecked = !ownPlan || morning.winCheck?.plan?.forPlan === ifThen;
    if (!ai || (winChecked && planChecked)) {
      finishLock();
      return;
    }
    checkRun.current += 1;
    const run = checkRun.current;
    setChecking(true);
    const result = await ai.checkWin(todayKey, win, ownPlan);
    if (run !== checkRun.current) return;
    setChecking(false);
    if (!result.ok) {
      finishLock();
      return;
    }
    // A win you already kept as-is isn't questioned again just because the plan changed.
    const next = winChecked ? { ...morning.winCheck, plan: result.check.plan } : result.check;
    if (next.verdict === 'clear' && next.plan?.verdict !== 'vague') {
      finishLock({ winCheck: next });
      return;
    }
    saveMorning(todayKey, { winCheck: next });
    setCheck(next);
  };
  const applyRewrite = () => {
    let winCheck = check;
    const fields = {};
    if (check.verdict !== 'clear') {
      fields.win = check.rewrite;
      winCheck = { ...winCheck, forWin: check.rewrite };
    }
    if (check.plan?.verdict === 'vague') {
      Object.assign(fields, { obstacle: check.plan.when, plan: check.plan.then, ifMoment: true });
      winCheck = { ...winCheck, plan: { ...check.plan, forPlan: morningIfThen({ ifMoment: true, obstacle: check.plan.when, plan: check.plan.then }) } };
    }
    finishLock({ ...fields, winCheck });
  };

  const motionProps = {
    initial: { opacity: 0, y: reduceMotion ? 0 : 14 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: reduceMotion ? 0 : -8 },
    transition: { duration: 0.24, ease: [0.25, 0.1, 0.25, 1] },
  };

  return (
    <div className="cd cd--morning" ref={rootRef}>
      <header className="cd-head">
        <div className="cd-head-top">
          <span className="cd-eyebrow"><Sun size={14} /> This morning · {formatDayLabel(todayKey)}</span>
          {modeSwitch}
        </div>
        {step !== 'locked' && (
          <nav className="cd-steps" aria-label="Morning journal steps">
            {MORNING_STEP_KEYS.map((k, i) => (
              <button
                key={k}
                type="button"
                className={`cd-step${k === step ? ' current' : ''}${status[k] ? ' done' : ''}`}
                onClick={() => goTo(k)}
                aria-current={k === step ? 'step' : undefined}
              >
                <span className="cd-step-dot">{status[k] && k !== step ? <Check size={11} strokeWidth={3} /> : i + 1}</span>
                <span className="cd-step-label">{MORNING_STEP_META[k].label}</span>
              </button>
            ))}
          </nav>
        )}
      </header>

      <AnimatePresence mode="wait" initial={false} onExitComplete={scrollToTop}>
        <MotionDiv key={step} className={`cd-body cd-body--m-${step}`} {...motionProps}>
          {step === 'locked' ? (
            <LockedIn
              morning={morning}
              todayKey={todayKey}
              todos={todos}
              setTodos={setTodos}
              identityRun={identityRun}
              plannedToday={plannedToday}
              onPlanDay={onPlanDay}
              onStartFocus={onStartFocus}
              onNavigate={onNavigate}
              onEdit={() => goTo(MORNING_STEP_KEYS[0])}
            />
          ) : (
            <>
              <h2 className="cd-title">{MORNING_STEP_META[step].title}</h2>

              {step === 'wake' && (
                <WakeStep morning={morning} setMorning={setMorning} todayKey={todayKey} healthLog={healthLog} setHealthLog={setHealthLog} commitment={commitment} />
              )}
              {step === 'focus' && (
                <FocusStep
                  morning={morning}
                  setMorning={setMorning}
                  suggestions={suggestions}
                  todos={todos}
                  setTodos={setTodos}
                  todayKey={todayKey}
                  coachRead={<CoachRead coach={morning.coach} loading={coachDue && !coachError} error={coachError} onRetry={retryCoach} patternLines={patternLines} />}
                />
              )}
              {step === 'lockIn' && (
                <LockInStep
                  morning={morning}
                  setMorning={setMorning}
                  northStar={northStar}
                  ifThens={ifThens}
                  pastPlans={pastPlans}
                  todos={todos}
                  setTodos={setTodos}
                  todayKey={todayKey}
                  identityRun={identityRun}
                />
              )}

              {check ? (
                <WinCheckCard
                  check={check}
                  onUseRewrite={applyRewrite}
                  onKeep={() => finishLock()}
                />
              ) : (
              <footer className="cd-nav">
                {index > 0
                  ? <button type="button" className="cd-btn cd-btn--ghost" onClick={back}><ChevronLeft size={16} /> Back</button>
                  : <span />}
                {step === 'lockIn' && checking ? (
                  <button type="button" className="cd-btn cd-btn--primary" onClick={() => finishLock()} aria-busy="true">
                    <LoaderCircle size={15} className="log-review-spin" /> Checking… tap to lock in now
                  </button>
                ) : step === 'lockIn' ? (
                  <button type="button" className="cd-btn cd-btn--primary" onClick={lockIn} disabled={!canLock} title={canLock ? undefined : 'Write today’s win first (step 2)'}>
                    <Lock size={15} /> Lock in my day
                  </button>
                ) : (
                  <button type="button" className="cd-btn cd-btn--primary" onClick={next}>
                    {status[step] ? 'Next' : 'Skip for now'} <ChevronRight size={16} />
                  </button>
                )}
              </footer>
              )}
              {step === 'lockIn' && !canLock && (
                <p className="cd-close-hint mj-lock-hint">
                  Write today’s win first. <button type="button" className="cd-link" onClick={() => goTo('focus')}>Go to Focus</button>
                </p>
              )}
            </>
          )}
        </MotionDiv>
      </AnimatePresence>
    </div>
  );
};

export default MorningFlow;
