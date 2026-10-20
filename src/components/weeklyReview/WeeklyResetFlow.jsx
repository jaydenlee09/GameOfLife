import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Check, ChevronLeft, ChevronRight, X, Plus, Sparkles, LoaderCircle, RotateCcw, CalendarRange, TrendingDown,
  Trophy, BarChart3, Target, ListChecks, FlaskConical, CalendarClock, Construction, Lightbulb, CalendarCheck,
  Pencil, Flag, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import { Block, Segmented } from '../dailyLog/CloseDayFlow';
import ResetGoals from './ResetGoals';
import {
  STEP_KEYS, STEP_META, getStepStatus, getFirstOpenStep, getWeekScores, getWeekInsights, getPlanResults,
  getComingUp, nextWeekOf, weekDays, formatWeekRange, applyDraft, tidyList,
} from '../../utils/weeklyReset';
import { getMondayOf } from '../../utils/statsInsights';
import { scoreColor } from '../../utils/scoreUtils';
import '../dailyLog/CloseDay.css';

const MotionDiv = motion.div;
const MAX_ROWS = 5;
const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const dayShort = (dateKey, mondayKey) => WEEKDAY_SHORT[weekDays(mondayKey).indexOf(dateKey)] || dateKey;
const formatTime = (ms) => new Date(ms).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' });

// ─── Small pieces ─────────────────────────────────────────────────────────────

/**
 * A one-line field that wraps and grows instead of cutting off long text (the AI's
 * sentences). Enter doesn't add a line break: every item stays one line of data.
 */
const fitHeight = (el) => {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
};

const GrowingField = ({ value, onChange, placeholder, big = false }) => {
  const ref = useRef(null);
  useLayoutEffect(() => fitHeight(ref.current), [value]);
  useEffect(() => {
    const onResize = () => fitHeight(ref.current);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return (
    <textarea
      ref={ref}
      rows={1}
      className={`cd-input wr-grow${big ? ' cd-input--big' : ''}`}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value.replace(/\n/g, ' '))}
      onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
    />
  );
};

/** Editable rows (the AI's draft, or your own); empty rows are dropped when you lock in. */
const EditableList = ({ values, onChange, placeholder, addLabel }) => {
  const rows = values?.length ? values : [''];
  const setAt = (i, text) => onChange(rows.map((v, j) => (j === i ? text : v)));
  const removeAt = (i) => onChange(rows.filter((_, j) => j !== i));
  return (
    <div className="cd-list">
      {rows.map((v, i) => (
        <div key={i} className="cd-list-row wr-row">
          <GrowingField value={v} placeholder={placeholder} onChange={(text) => setAt(i, text)} />
          {(rows.length > 1 || v) && (
            <button type="button" className="wr-row-remove" onClick={() => removeAt(i)} aria-label="Remove"><X size={14} /></button>
          )}
        </div>
      ))}
      {rows.length < MAX_ROWS && rows[rows.length - 1]?.trim() && (
        <button type="button" className="cd-add-row" onClick={() => onChange([...rows, ''])}><Plus size={14} /> {addLabel}</button>
      )}
    </div>
  );
};

const Drafting = ({ drafting, error, onRetry, what }) => {
  if (drafting) return <div className="cd-reviewing"><LoaderCircle size={16} className="log-review-spin" /> Your assistant is drafting {what}…</div>;
  if (!error) return null;
  return (
    <div className="wr-draft-error">
      <span>{error}</span>
      <button type="button" className="cd-btn cd-btn--small" onClick={onRetry}><RotateCcw size={13} /> Try again</button>
    </div>
  );
};

/** M-S dots for the experiment: did it / didn't / not answered. */
export const TickDots = ({ days }) => (
  <div className="wr-ticks" aria-label="Experiment days">
    {days.map((t, i) => (
      <span key={t.dateKey} className={`wr-tick ${t.done === true ? 'is-done' : t.done === false ? 'is-missed' : ''}`} title={t.dateKey}>
        {t.done === true ? <Check size={11} strokeWidth={3} /> : 'MTWTFSS'[i]}
      </span>
    ))}
  </div>
);

// ─── Steps ────────────────────────────────────────────────────────────────────

const WeekStep = ({ reviewKey, scores, insights, headline, lastPlan, answers, setAnswer }) => {
  const { leaks, deltas } = insights;
  return (
    <>
      <Block Icon={CalendarRange} title="Daily Score" hint={`${scores.cleared} of 7 days at ${scores.threshold}+`}>
        <div className="wr-days">
          {scores.days.map((d) => (
            <div key={d.dateKey} className={`wr-day wr-day--${d.status}`}>
              <span className="wr-day-score" style={d.score != null && d.status !== 'before' ? { color: scoreColor(d.score) } : undefined}>
                {d.score != null && d.status !== 'before' ? d.score : '–'}
              </span>
              <span className="wr-day-letter">{d.letter}</span>
            </div>
          ))}
        </div>
        {scores.average != null && (
          <p className="wr-avg">
            Average <strong>{scores.average}</strong>
            {scores.previousAverage != null && <> · week before {scores.previousAverage}</>}
            {scores.days.some((d) => d.status === 'today') && <> · today still counting</>}
          </p>
        )}
      </Block>

      {headline && (
        <Block Icon={Sparkles} title="Your assistant’s read" className="cd-block--quiet">
          <p className="cd-quote cd-quote--small">{headline}</p>
        </Block>
      )}

      {(leaks?.biggest || leaks?.strength) && (
        <div className="wr-pair">
          {leaks.biggest && (
            <Block Icon={TrendingDown} title={`Biggest leak: ${leaks.biggest.label}`} hint={`−${leaks.biggest.lost} pts`}>
              <p className="cd-quote cd-quote--small">{leaks.biggest.evidence}</p>
            </Block>
          )}
          {leaks.strength && (
            <Block Icon={Trophy} title={`Strength: ${leaks.strength.label}`}>
              <p className="cd-quote cd-quote--small">{leaks.strength.evidence}</p>
            </Block>
          )}
        </div>
      )}

      <Block Icon={BarChart3} title="Against the week before" hint="Same days">
        <ul className="wr-deltas">
          {deltas.map((d) => (
            <li key={d.key}>
              <span className="wr-delta-label"><d.Icon size={14} /> {d.label}</span>
              <span className="wr-delta-value">{d.fmt(d.value)}</span>
              {d.delta != null && d.delta !== 0 ? (
                <span className={`wr-delta ${d.delta > 0 ? 'is-up' : 'is-down'}`}>
                  {d.delta > 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                  {d.key === 'focusMinutes' ? d.fmt(Math.abs(d.delta)) : Math.abs(d.delta)}
                </span>
              ) : <span className="wr-delta">–</span>}
            </li>
          ))}
        </ul>
      </Block>

      {lastPlan && (
        <Block Icon={Target} title="Last week you planned" hint={formatWeekRange(reviewKey)}>
          {lastPlan.priority && (
            <div className="wr-last">
              <p className="cd-quote">{lastPlan.priority}</p>
              <p className="cd-question">Did you hit your #1 priority?</p>
              <Segmented
                label="Did you hit your priority?"
                value={answers.priority || null}
                onChange={(v) => setAnswer('priority', v)}
                options={[
                  { value: 'yes', label: 'Yes', tone: 'success' },
                  { value: 'partly', label: 'Partly', tone: 'warning' },
                  { value: 'no', label: 'No', tone: 'neutral' },
                ]}
              />
            </div>
          )}

          {lastPlan.outcomes.length > 0 && (
            <ul className="wr-outcomes">
              {lastPlan.outcomes.map((o) => (
                <li key={o.index}>
                  <button
                    type="button"
                    className={`wr-outcome ${o.done ? 'is-done' : ''}`}
                    disabled={o.auto}
                    onClick={() => setAnswer('outcomes', { ...answers.outcomes, [o.index]: !o.done })}
                    aria-pressed={o.done}
                  >
                    <span className="cd-check">{o.done && <Check size={12} strokeWidth={3} />}</span>
                    <span className="wr-outcome-text">{o.text}</span>
                    {o.auto && <span className="wr-outcome-meta">Done in Tasks</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {lastPlan.experiment && (
            <div className="wr-last">
              <p className="wr-kicker"><FlaskConical size={13} /> Your experiment</p>
              <p className="cd-quote">{lastPlan.experiment.text}</p>
              <TickDots days={lastPlan.experiment.days} />
              <p className="wr-evidence">
                Done on {lastPlan.experiment.done} of {lastPlan.experiment.days.length} days
                {lastPlan.experiment.scoreDone != null && lastPlan.experiment.scoreSkipped != null && (
                  <> · Daily Score {lastPlan.experiment.scoreDone} on days you did it, {lastPlan.experiment.scoreSkipped} when you didn’t</>
                )}
              </p>
              <p className="cd-question">Did it help?</p>
              <Segmented
                label="Keep, tweak or drop the experiment"
                value={answers.experiment || null}
                onChange={(v) => setAnswer('experiment', v)}
                options={[
                  { value: 'keep', label: 'Keep it', tone: 'success' },
                  { value: 'tweak', label: 'Tweak it', tone: 'warning' },
                  { value: 'drop', label: 'Drop it', tone: 'neutral' },
                ]}
              />
              {answers.experiment === 'keep' && <p className="cd-status cd-status--success"><Check size={14} /> Added to your Playbook: rules that work for you.</p>}
              {answers.experiment === 'tweak' && <p className="cd-status cd-status--muted">You can reword it for next week in Plan.</p>}
            </div>
          )}
        </Block>
      )}
    </>
  );
};

const ReflectStep = ({ review, update, draftUi, weekLessons }) => {
  const lessons = review.lessons || [];
  const fromLogs = weekLessons.filter((l) => !lessons.some((x) => x.trim().toLowerCase() === l.text.toLowerCase()));
  return (
    <>
      <Drafting {...draftUi} what="your review" />
      <Block Icon={Trophy} title="Wins" hint="Edit, delete or add">
        <EditableList values={review.wins} onChange={(wins) => update({ wins })} placeholder="Something you’re proud of this week" addLabel="Add a win" />
      </Block>
      <Block Icon={Construction} title="What held you back">
        <EditableList values={review.blockers} onChange={(blockers) => update({ blockers })} placeholder="What got in the way" addLabel="Add another" />
      </Block>
      <Block Icon={Lightbulb} title="Lessons to carry forward">
        <EditableList values={lessons} onChange={(next) => update({ lessons: next })} placeholder="What you learned about how you work" addLabel="Add a lesson" />
        {fromLogs.length > 0 && (
          <div className="wr-suggest">
            <span className="wr-suggest-label">From your Daily Logs</span>
            {fromLogs.slice(0, 4).map((l) => (
              <button key={l.date} type="button" className="cd-chip" onClick={() => update({ lessons: [...lessons.filter((x) => x.trim()), l.text].slice(0, MAX_ROWS) })}>
                <Plus size={14} /> <span>{l.text}</span>
              </button>
            ))}
          </div>
        )}
      </Block>
    </>
  );
};

const PlanStep = ({ review, update, draftUi, planWeek, comingUp, lastPlan, answers, weekWord }) => {
  const draft = review.draft;
  const outcomes = [0, 1, 2].map((i) => review.outcomes?.[i] || { text: '', taskId: null });
  const setOutcome = (i, text) => update({ outcomes: outcomes.map((o, j) => (j === i ? { ...o, text } : o)) });
  const experiment = review.experiment || null;
  // An emptied experiment is stored as-is while editing; locking in turns it into null.
  const setExperiment = (text, why = experiment?.why || '') => update({ experiment: { text, why } });
  const expSuggestions = [
    draft?.experiment && { text: draft.experiment.text, why: draft.experiment.why, label: 'Suggested' },
    answers.experiment === 'tweak' && lastPlan?.experiment && { text: lastPlan.experiment.text, why: 'Last week’s, tweaked.', label: 'Last week’s' },
  ].filter((s) => s && s.text.trim() && s.text.trim() !== experiment?.text?.trim());

  return (
    <>
      <Drafting {...draftUi} what="next week’s plan" />
      <Block Icon={Target} title="#1 priority" hint={formatWeekRange(planWeek)}>
        <GrowingField
          big
          value={review.priority || ''}
          placeholder={`The one thing that would make ${weekWord} a good week`}
          onChange={(priority) => update({ priority })}
        />
        {draft?.priorityWhy && review.priority?.trim() === draft.priority && <p className="wr-why">{draft.priorityWhy}</p>}
        {draft?.priority && review.priority?.trim() !== draft.priority && (
          <div className="wr-suggest">
            <button type="button" className="cd-chip" onClick={() => update({ priority: draft.priority })}>
              <Sparkles size={14} /> <span>{draft.priority}</span>
            </button>
          </div>
        )}
      </Block>

      <Block Icon={ListChecks} title="3 outcomes that make it a good week">
        <div className="cd-list">
          {outcomes.map((o, i) => (
            <div key={i} className="cd-list-row">
              <span className="cd-list-num">{i + 1}</span>
              <GrowingField value={o.text} placeholder="A result you can check off" onChange={(text) => setOutcome(i, text)} />
            </div>
          ))}
        </div>
        <label className="wr-toggle">
          <input type="checkbox" checked={review.outcomeTasks !== false} onChange={(e) => update({ outcomeTasks: e.target.checked })} />
          Add them to Tasks for that week
        </label>
      </Block>

      <Block Icon={FlaskConical} title="One experiment" hint="Ticked each night in Close the Day">
        <GrowingField
          value={experiment?.text || ''}
          placeholder="A small daily change to try for 7 days"
          onChange={(text) => setExperiment(text)}
        />
        {experiment?.why && experiment.text?.trim() && <p className="wr-why">{experiment.why}</p>}
        {expSuggestions.length > 0 && (
          <div className="wr-suggest">
            {expSuggestions.map((s) => (
              <button key={s.label} type="button" className="cd-chip" onClick={() => setExperiment(s.text, s.why)}>
                <Sparkles size={14} /> <span><em className="wr-chip-kicker">{s.label}:</em> {s.text}</span>
              </button>
            ))}
          </div>
        )}
      </Block>

      {comingUp.length > 0 && (
        <Block Icon={CalendarClock} title="Coming up that week" className="cd-block--quiet">
          <ul className="wr-coming">
            {comingUp.map((c, i) => (
              <li key={i}>
                <span className="wr-coming-day">{dayShort(c.date, planWeek)}</span>
                <span className={c.kind === 'deadline' ? 'wr-coming-deadline' : ''}>{c.kind === 'deadline' && <Flag size={12} />} {c.text}</span>
              </li>
            ))}
          </ul>
        </Block>
      )}
    </>
  );
};

/** The plan as a read-only card (Commit step, the "Week set" view, past reviews). */
export const PlanSummary = ({ review, title = 'Your week', area }) => {
  const outcomes = (review.outcomes || []).filter((o) => o?.text?.trim());
  return (
    <Block Icon={CalendarCheck} title={title} area={area}>
      {review.priority?.trim() ? <p className="cd-quote">{review.priority}</p> : <p className="cd-status cd-status--muted">No #1 priority set.</p>}
      {outcomes.length > 0 && (
        <ul className="wr-plan-list">
          {outcomes.map((o, i) => <li key={i}><ListChecks size={14} /> {o.text}</li>)}
        </ul>
      )}
      {review.experiment?.text?.trim() && (
        <p className="wr-plan-exp"><FlaskConical size={14} /> <span><strong>Experiment:</strong> {review.experiment.text}</span></p>
      )}
    </Block>
  );
};

const CommitStep = ({ review, status, onGoTo, onLock, planWeek }) => (
  <>
    <PlanSummary review={review} title={`Plan for ${formatWeekRange(planWeek)}`} />
    <Block className="cd-block--quiet">
      <ul className="cd-checklist">
        {STEP_KEYS.filter((k) => k !== 'commit').map((k) => (
          <li key={k} className={status[k] ? 'done' : ''}>
            <span className="cd-check">{status[k] && <Check size={12} strokeWidth={3} />}</span>
            <span className="cd-checklist-label">{STEP_META[k].label}</span>
            {!status[k] && <button type="button" className="cd-link" onClick={() => onGoTo(k)}>Go back</button>}
          </li>
        ))}
      </ul>
    </Block>
    <button type="button" className="cd-close-btn" onClick={onLock} disabled={!review.priority?.trim()}>
      <CalendarCheck size={18} /> Lock in my week
    </button>
    <p className="cd-close-hint">
      {review.priority?.trim()
        ? `Your priority goes on Home${review.outcomeTasks !== false && (review.outcomes || []).some((o) => o?.text?.trim()) ? ', outcomes go into Tasks' : ''}${review.experiment?.text?.trim() ? ', and Close the Day asks about your experiment each night' : ''}.`
        : 'Set a #1 priority first.'}
    </p>
  </>
);

const WeekSet = ({ review, planWeek, todayKey, onEdit }) => {
  const startsLater = planWeek > getMondayOf(todayKey);
  return (
    <div className="cd-closed">
      <div className="cd-closed-hero">
        <span className="cd-closed-moon"><CalendarCheck size={28} /></span>
        <h2 className="cd-title">Week set.</h2>
        <p className="cd-closed-sub">Locked in {formatTime(review.completedAt)}. {startsLater ? 'Your plan starts Monday.' : 'Your plan runs this week.'}</p>
      </div>
      <PlanSummary review={review} title={`Plan for ${formatWeekRange(planWeek)}`} />
      <Block Icon={Sparkles} title="What happens next" className="cd-block--quiet">
        <ul className="wr-next">
          <li>Home shows your #1 priority all week.</li>
          {review.experiment?.text?.trim() && <li>Close the Day asks if you did your experiment, every night.</li>}
          <li>Next Sunday’s Reset checks how it went and builds on it.</li>
        </ul>
      </Block>
      <button type="button" className="cd-btn cd-btn--ghost cd-edit-btn" onClick={onEdit}><Pencil size={14} /> Edit this week’s Reset</button>
    </div>
  );
};

// ─── Flow ─────────────────────────────────────────────────────────────────────

const WeeklyResetFlow = ({
  reviewKey, todayKey, review, updateReview, weeklyReviews, data, logReviews, calendarDayEvents,
  goalProps, onDraft, onLock, onNavigate,
}) => {
  const reduceMotion = useReducedMotion();
  const rootRef = useRef(null);
  const planWeek = nextWeekOf(reviewKey);

  const scores = useMemo(() => getWeekScores(data, reviewKey, todayKey), [data, reviewKey, todayKey]);
  const insights = useMemo(() => getWeekInsights(data, reviewKey, todayKey), [data, reviewKey, todayKey]);
  const lastPlan = useMemo(() => getPlanResults(data, weeklyReviews, reviewKey, todayKey), [data, weeklyReviews, reviewKey, todayKey]);
  const comingUp = useMemo(() => getComingUp({ calendarEvents: data.calendarEvents, calendarDayEvents, goals: data.goals }, planWeek), [data, calendarDayEvents, planWeek]);
  const weekLessons = useMemo(() => weekDays(reviewKey)
    .map((date) => ({ date, text: data.logs?.[date]?.learned?.trim() }))
    .filter((l) => l.text), [data.logs, reviewKey]);

  const answers = review.lastWeek || {};
  const setAnswer = (key, value) => updateReview((week) => ({ lastWeek: { ...week.lastWeek, [key]: value } }));
  const update = (patch) => updateReview(() => patch);

  const status = getStepStatus({ review, lastPlan });
  const [step, setStep] = useState(() => (review.completedAt ? 'done' : getFirstOpenStep(status)));
  const index = STEP_KEYS.indexOf(step);
  // A late Reset (done after Sunday) plans the week you're already in.
  const weekWord = planWeek > getMondayOf(todayKey) ? 'next week' : 'this week';
  const title = step === 'plan' ? `Make ${weekWord} a good one.` : STEP_META[step]?.title;

  // Opening a step marks it seen (see getStepStatus).
  useEffect(() => {
    if (step !== 'done' && !review.seen?.[step]) updateReview((week) => ({ seen: { ...week.seen, [step]: true } }));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the step changes
  }, [step]);

  // ── AI draft: once per week, as soon as the Reset opens ──
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState(null);
  const runDraft = async () => {
    if (!onDraft) return;
    setDrafting(true);
    setDraftError(null);
    const res = await onDraft({ reviewKey, todayKey, logReviews });
    setDrafting(false);
    if (!res.ok) { setDraftError(res.error); return; }
    updateReview((week) => applyDraft(week, res.draft));
  };
  const drafted = useRef(false);
  useEffect(() => {
    if (drafted.current || review.draft || review.completedAt || !onDraft) return;
    drafted.current = true;
    runDraft();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- once per mount
  }, []);
  const draftUi = { drafting, error: draftError, onRetry: runDraft };

  const goTo = (key) => setStep(key);
  const next = () => goTo(STEP_KEYS[Math.min(index + 1, STEP_KEYS.length - 1)]);
  const back = () => goTo(STEP_KEYS[Math.max(index - 1, 0)]);
  const lock = () => {
    onLock({
      wins: tidyList(review.wins),
      blockers: tidyList(review.blockers),
      lessons: tidyList(review.lessons),
      priority: review.priority.trim(),
      experiment: review.experiment?.text?.trim() ? { text: review.experiment.text.trim(), why: review.experiment.why || '' } : null,
    });
    goTo('done');
  };

  const motionProps = {
    initial: { opacity: 0, y: reduceMotion ? 0 : 14 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: reduceMotion ? 0 : -8 },
    transition: { duration: 0.24, ease: [0.25, 0.1, 0.25, 1] },
  };

  return (
    <div className="cd wr" ref={rootRef}>
      <header className="cd-head">
        <span className="cd-eyebrow"><CalendarRange size={14} /> Weekly Reset · {formatWeekRange(reviewKey)}</span>
        {step !== 'done' && (
          <nav className="cd-steps" aria-label="Weekly Reset steps">
            {STEP_KEYS.map((k, i) => (
              <button
                key={k}
                type="button"
                className={`cd-step${k === step ? ' current' : ''}${status[k] ? ' done' : ''}`}
                onClick={() => goTo(k)}
                aria-current={k === step ? 'step' : undefined}
              >
                <span className="cd-step-dot">{status[k] && k !== step ? <Check size={11} strokeWidth={3} /> : i + 1}</span>
                <span className="cd-step-label">{STEP_META[k].label}</span>
              </button>
            ))}
          </nav>
        )}
      </header>

      <AnimatePresence mode="wait" initial={false} onExitComplete={() => rootRef.current?.scrollIntoView({ block: 'start' })}>
        <MotionDiv key={step} className="wr-body" {...motionProps}>
          {step === 'done' ? (
            <WeekSet review={review} planWeek={planWeek} todayKey={todayKey} onEdit={() => goTo('plan')} />
          ) : (
            <>
              <h2 className="cd-title">{title}</h2>
              {step === 'week' && (
                <WeekStep reviewKey={reviewKey} scores={scores} insights={insights} headline={review.draft?.headline} lastPlan={lastPlan} answers={answers} setAnswer={setAnswer} />
              )}
              {step === 'reflect' && <ReflectStep review={review} update={update} draftUi={draftUi} weekLessons={weekLessons} />}
              {step === 'goals' && <ResetGoals reviewKey={reviewKey} review={review} updateReview={updateReview} onNavigate={onNavigate} {...goalProps} />}
              {step === 'plan' && <PlanStep review={review} update={update} draftUi={draftUi} planWeek={planWeek} comingUp={comingUp} lastPlan={lastPlan} answers={answers} weekWord={weekWord} />}
              {step === 'commit' && <CommitStep review={review} status={status} onGoTo={goTo} onLock={lock} planWeek={planWeek} />}

              <footer className="cd-nav">
                {index > 0
                  ? <button type="button" className="cd-btn cd-btn--ghost" onClick={back}><ChevronLeft size={16} /> Back</button>
                  : <span />}
                {step !== 'commit' && (
                  <button type="button" className="cd-btn cd-btn--primary" onClick={next}>
                    {status[step] ? 'Next' : 'Skip for now'} <ChevronRight size={16} />
                  </button>
                )}
              </footer>
            </>
          )}
        </MotionDiv>
      </AnimatePresence>
    </div>
  );
};

export default WeeklyResetFlow;
