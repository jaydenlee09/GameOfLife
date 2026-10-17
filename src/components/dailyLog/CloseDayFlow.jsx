import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Check, ChevronLeft, ChevronRight, Moon, Plus, X, Trophy, TrendingUp, Lightbulb, PenLine, Target,
  Repeat, HeartPulse, MessageCircle, Sparkles, Shuffle, History, AlertTriangle, LoaderCircle, Lock, Pencil, Flame,
  CheckSquare, NotebookText, Handshake, PieChart,
} from 'lucide-react';
import EMOTIONS from '../../utils/logMeta';
import {
  STEP_META, getLookBack, getSteps, getStepStatus, getFirstOpenStep, isCommitmentLocked,
  pickPrompt, getLastPromptId, pickResurfacedLesson, getCommitmentSuggestions,
  parseIfThen, composeIfThen, getPendingHealthAwards, explainScore,
} from '../../utils/closeDay';
import { getHabitLeak } from '../../utils/logPatterns';
import { getYesterdayCommitment } from '../../utils/homeUtils';
import { getFocusGoal } from '../../utils/goalUtils';
import { computeDailyScore, computeStreak, scoreColor, shiftDateKey, STREAK_THRESHOLD } from '../../utils/scoreUtils';
import { entryHasContent, entryFingerprint } from '../../utils/logReview';
import STAT_META from '../statMeta';
import HealthQuick from './HealthQuick';
import HabitChecklist from './HabitChecklist';
import LogReviewSection from './LogReview';
import LessonInsight from './LessonInsight';
import './CloseDay.css';

const COMMIT_HOLD_DURATION = 3000;
const MotionDiv = motion.div;
// Autofocus only with a mouse: on a phone it would throw the keyboard over the step.
const FINE_POINTER = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: fine)').matches;

const formatDayLabel = (dateKey, opts = { weekday: 'long', month: 'long', day: 'numeric' }) => {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', opts);
};

const daysAgoLabel = (fromKey, todayKey) => {
  if (fromKey === shiftDateKey(todayKey, -1)) return 'yesterday';
  return `on ${formatDayLabel(fromKey, { weekday: 'long' })}`;
};

// "Charge my phone" reads as "…, I will charge my phone"; leaves "I", "TV" etc. alone.
const lowerFirst = (s) => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);

const formatTime = (ms) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

// ─── Small pieces ─────────────────────────────────────────────────────────────

// `area` names the block's slot in the monitor layout (CloseDay.css, >= 1400px).
const Block = ({ Icon, title, hint, children, className = '', area }) => (
  <section className={`cd-block ${area ? `cd-a-${area} ` : ''}${className}`}>
    {title && (
      <header className="cd-block-head">
        <h3 className="cd-block-title">{Icon && <Icon size={16} />} {title}</h3>
        {hint && <span className="cd-block-hint">{hint}</span>}
      </header>
    )}
    {children}
  </section>
);

const Segmented = ({ options, value, onChange, label }) => (
  <div className="cd-seg" role="radiogroup" aria-label={label}>
    {options.map(o => (
      <button
        key={o.value}
        type="button"
        role="radio"
        aria-checked={value === o.value}
        className={`cd-seg-btn cd-seg-btn--${o.tone || 'neutral'}${value === o.value ? ' active' : ''}`}
        onClick={() => onChange(o.value)}
      >
        {o.label}
      </button>
    ))}
  </div>
);

/** 1-3 text inputs over a fixed 3-slot array; starts with one row and grows on "Add another". */
const ListInputs = ({ values, onChangeAt, placeholders, addLabel, autoFocusFirst }) => {
  const arr = [0, 1, 2].map(i => values?.[i] || '');
  const lastFilled = arr.reduce((last, v, i) => (v.trim() ? i : last), -1);
  const [shown, setShown] = useState(Math.max(1, lastFilled + 1));
  const count = Math.max(shown, lastFilled + 1);
  return (
    <div className="cd-list">
      {arr.slice(0, count).map((v, i) => (
        <div key={i} className="cd-list-row">
          <span className="cd-list-num">{i + 1}</span>
          <input
            type="text"
            className="cd-input"
            value={v}
            placeholder={placeholders[i]}
            onChange={e => onChangeAt(i, e.target.value)}
            autoFocus={autoFocusFirst && i === 0 && !v && FINE_POINTER}
          />
        </div>
      ))}
      {count < 3 && arr[count - 1]?.trim() && (
        <button type="button" className="cd-add-row" onClick={() => setShown(count + 1)}>
          <Plus size={14} /> {addLabel}
        </button>
      )}
    </div>
  );
};

/** Press and hold for COMMIT_HOLD_DURATION to lock a commitment (pointer, or Space/Enter). */
const HoldToCommit = ({ disabled, onCommit }) => {
  const [progress, setProgress] = useState(0);
  const timerRef = useRef(null);

  const stop = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setProgress(0);
  }, []);

  const start = () => {
    if (disabled || timerRef.current) return;
    const startedAt = Date.now();
    timerRef.current = setInterval(() => {
      const pct = Math.min(((Date.now() - startedAt) / COMMIT_HOLD_DURATION) * 100, 100);
      setProgress(pct);
      if (pct >= 100) {
        stop();
        onCommit();
      }
    }, 16);
  };

  useEffect(() => stop, [stop]);

  return (
    <button
      type="button"
      className={`commit-hold-btn${progress > 0 ? ' commit-hold-btn--holding' : ''}${disabled ? ' commit-hold-btn--disabled' : ''}`}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); start(); } }}
      onKeyUp={e => { if (e.key === ' ' || e.key === 'Enter') stop(); }}
      onContextMenu={e => e.preventDefault()}
      disabled={disabled}
    >
      <span className="commit-hold-label">{progress > 0 ? 'Keep holding…' : 'Hold to commit'}</span>
      <div className="commit-hold-progress" style={{ width: `${progress}%` }} />
    </button>
  );
};

// ─── Steps ────────────────────────────────────────────────────────────────────

const LookBackStep = ({ lookBack, entry, todayKey, updateField, onResolveCommitment }) => {
  const { commitment, carry, focus } = lookBack;
  return (
    <>
      {commitment.status !== 'none' && (
        <Block Icon={Target} title="Yesterday you committed to" area="commit">
          <p className="cd-quote">{commitment.text}</p>
          {commitment.status === 'pending' ? (
            <div className="cd-actions">
              <button type="button" className="cd-btn cd-btn--success" onClick={() => onResolveCommitment(commitment.dateKey, commitment.text, false)}>
                <Check size={16} /> I kept it
              </button>
              <button type="button" className="cd-btn" onClick={() => onResolveCommitment(commitment.dateKey, commitment.text, true)}>
                I didn’t
              </button>
            </div>
          ) : commitment.status === 'kept' ? (
            <p className="cd-status cd-status--success"><Check size={14} /> Kept. That’s a promise you can trust yourself with.</p>
          ) : (
            <p className="cd-status cd-status--muted">Missed. That’s data, not a verdict. What got in the way?</p>
          )}
        </Block>
      )}

      {carry && (
        <Block Icon={TrendingUp} title={`You wanted to improve ${daysAgoLabel(carry.from, todayKey)}`} area="carry">
          <p className="cd-quote">{carry.text}</p>
          <p className="cd-question">Did you work on it today?</p>
          <Segmented
            label="Did you work on it today?"
            value={entry.loopCheck?.result || null}
            onChange={result => updateField('loopCheck', { from: carry.from, text: carry.text, result })}
            options={[
              { value: 'yes', label: 'Yes', tone: 'success' },
              { value: 'partly', label: 'A little', tone: 'warning' },
              { value: 'no', label: 'Not today', tone: 'neutral' },
            ]}
          />
        </Block>
      )}

      {focus && (
        <Block Icon={Sparkles} title="Last night’s review said to focus on" className="cd-block--quiet" area="focus">
          <p className="cd-quote cd-quote--small">{focus}</p>
        </Block>
      )}
    </>
  );
};

const CheckInStep = ({ entry, updateField, todayKey, habits, habitHandlers, onToggleHabitDay, health }) => {
  const emotions = entry.emotions || [];
  const toggleEmotion = (id) => updateField('emotions', emotions.includes(id) ? emotions.filter(e => e !== id) : [...emotions, id]);
  const habitsDone = habits.filter(h => h.history?.[todayKey]).length;
  return (
    <>
      <Block Icon={Sparkles} title="Rate today" hint="How it felt, not how it scored" area="rate">
        <div className="cd-rating" role="radiogroup" aria-label="Rate today from 1 to 10">
          {Array.from({ length: 10 }, (_, i) => i + 1).map(n => {
            const active = entry.dayRating === n;
            return (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={active}
                className={`cd-rating-btn${active ? ' active' : ''}`}
                style={active ? { '--rating-color': scoreColor(n) } : undefined}
                onClick={() => updateField('dayRating', active ? null : n)}
              >
                {n}
              </button>
            );
          })}
        </div>
      </Block>

      <Block Icon={MessageCircle} title="How did you feel?" hint="Pick any" area="feel">
        <div className="cd-emotions">
          {EMOTIONS.map(em => {
            const selected = emotions.includes(em.id);
            return (
              <button
                key={em.id}
                type="button"
                className={`cd-emotion${selected ? ' selected' : ''}`}
                style={selected ? { '--chip-color': em.color } : undefined}
                onClick={() => toggleEmotion(em.id)}
                aria-pressed={selected}
              >
                <em.Icon size={15} /> {em.label}
              </button>
            );
          })}
        </div>
      </Block>

      <Block Icon={Repeat} title="Habits" hint={habits.length ? `${habitsDone}/${habits.length} done` : null} area="habits">
        <HabitChecklist habits={habits} todayKey={todayKey} onToggleHabitDay={onToggleHabitDay} {...habitHandlers} />
      </Block>

      <Block Icon={HeartPulse} title="Body" area="body">
        <HealthQuick todayKey={todayKey} {...health} />
      </Block>
    </>
  );
};

const PatternCards = ({ flags, habitLeak, commitmentLocked, onMakeHabit, onUseForTomorrow }) => {
  const [hidden, setHidden] = useState([]);
  const cards = [
    ...flags.map(f => ({
      key: `ai:${f.theme}`,
      kicker: `Came up ${f.count} times in 2 weeks`,
      title: f.theme,
      body: f.insight,
      habit: f.habit,
      tomorrow: f.tryTomorrow,
    })),
    ...(habitLeak ? [{
      key: `habit:${habitLeak.name}`,
      kicker: `Missed ${habitLeak.missed} of the last ${habitLeak.days} days`,
      title: habitLeak.name,
      body: 'This habit keeps slipping. Make tomorrow the day it doesn’t.',
      habit: '',
      tomorrow: `Do “${habitLeak.name}” tomorrow, even a 2-minute version`,
    }] : []),
  ].filter(c => !hidden.includes(c.key));
  if (!cards.length) return null;
  return (
    <div className="cd-patterns cd-a-patterns">
      {cards.map(c => (
        <div key={c.key} className="cd-pattern">
          <button type="button" className="cd-pattern-close" onClick={() => setHidden(h => [...h, c.key])} aria-label="Hide for tonight"><X size={14} /></button>
          <span className="cd-pattern-kicker"><AlertTriangle size={13} /> {c.kicker}</span>
          <strong className="cd-pattern-title">{c.title}</strong>
          {c.body && <p className="cd-pattern-body">{c.body}</p>}
          <div className="cd-pattern-actions">
            {c.habit && (
              <button type="button" className="cd-btn cd-btn--small" onClick={() => onMakeHabit(c.habit)}>
                <Repeat size={13} /> Make “{c.habit}” a habit
              </button>
            )}
            {c.tomorrow && (
              <button
                type="button"
                className="cd-btn cd-btn--small"
                onClick={() => onUseForTomorrow(c.tomorrow)}
                disabled={commitmentLocked}
                title={commitmentLocked ? 'Tomorrow’s commitment is already locked' : undefined}
              >
                <Target size={13} /> Use for tomorrow
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

const ReflectStep = ({ entry, updateField, updateArrayField, todayKey, logs, prompt, onShufflePrompt, patterns, lessonHandlers }) => {
  const [notesOpen, setNotesOpen] = useState(!!entry.notes?.trim());
  const resurfaced = useMemo(() => pickResurfacedLesson(logs, todayKey), [logs, todayKey]);
  const answer = entry.prompt?.answer || '';
  return (
    <>
      <PatternCards {...patterns} />

      <Block Icon={Trophy} title="Wins" hint="At least one, however small" area="wins">
        <ListInputs
          values={entry.proud}
          onChangeAt={(i, v) => updateArrayField('proud', i, v)}
          placeholders={['Something you’re proud of…', 'Another one…', 'And one more…']}
          addLabel="Add another win"
          autoFocusFirst
        />
      </Block>

      <Block Icon={TrendingUp} title="One thing to improve" hint="Tomorrow night will ask about it" area="improve">
        <ListInputs
          values={entry.improve}
          onChangeAt={(i, v) => updateArrayField('improve', i, v)}
          placeholders={['What would make tomorrow better?', 'Another…', 'One more…']}
          addLabel="Add another"
        />
      </Block>

      <Block area="prompt">
        <div className="cd-prompt-head">
          <span className="cd-prompt-kicker"><Moon size={13} /> Tonight’s question</span>
          {!answer.trim() && (
            <button type="button" className="cd-link" onClick={onShufflePrompt}><Shuffle size={13} /> Another</button>
          )}
        </div>
        <p className="cd-prompt-text">{prompt.text}</p>
        <textarea
          className="cd-textarea"
          rows={3}
          value={answer}
          placeholder="Write freely…"
          onChange={e => updateField('prompt', { id: prompt.id, text: prompt.text, answer: e.target.value })}
        />
      </Block>

      <Block Icon={Lightbulb} title="One thing I learned" area="learned">
        <textarea
          className="cd-textarea"
          rows={2}
          value={entry.learned || ''}
          placeholder="A lesson, a fact, a realisation…"
          onChange={e => updateField('learned', e.target.value)}
        />
        <LessonInsight dateKey={todayKey} entry={entry} {...lessonHandlers} />
        {resurfaced && (
          <div className="cd-resurfaced">
            <History size={14} />
            <span>
              <em>{resurfaced.label || `On ${formatDayLabel(resurfaced.date, { month: 'short', day: 'numeric' })}`} you learned:</em> {resurfaced.text}
            </span>
          </div>
        )}
      </Block>

      {notesOpen ? (
        <Block Icon={PenLine} title="Notes" area="notes">
          <textarea
            className="cd-textarea"
            rows={3}
            value={entry.notes || ''}
            placeholder="Anything else you want to remember about today?"
            onChange={e => updateField('notes', e.target.value)}
          />
        </Block>
      ) : (
        <button type="button" className="cd-add-row cd-add-row--block cd-a-notes" onClick={() => setNotesOpen(true)}>
          <PenLine size={14} /> Add a note
        </button>
      )}
    </>
  );
};

const TomorrowStep = ({ entry, updateField, todayKey, commitmentLocked, suggestions, onCommitmentLocked }) => {
  const text = entry.commitment || '';
  const [unlocked, setUnlocked] = useState(false);
  const [ifThen, setIfThen] = useState(() => parseIfThen(text));
  const editable = !commitmentLocked || unlocked;

  const setText = (value) => updateField('commitment', value);
  const setIfThenPart = (part, value) => {
    const next = { ...ifThen, [part]: value };
    setIfThen(next);
    setText(composeIfThen(next.cue, next.action));
  };
  const toggleIfThen = () => {
    if (ifThen) {
      setIfThen(null);
    } else {
      const parsed = parseIfThen(text) || { cue: '', action: lowerFirst(text) };
      setIfThen(parsed);
      setText(composeIfThen(parsed.cue, parsed.action));
    }
  };
  const pickSuggestion = (s) => {
    if (ifThen) setIfThenPart('action', lowerFirst(s));
    else setText(s);
  };

  return (
    <>
      {editable && suggestions.length > 0 && (
        <Block Icon={Lightbulb} title="Ideas from tonight" className="cd-block--quiet" area="ideas">
          <div className="cd-chips">
            {suggestions.map(s => (
              <button key={s.text} type="button" className="cd-chip" onClick={() => pickSuggestion(s.text)}>
                {s.source === 'goal' ? <Target size={13} /> : s.source === 'pattern' ? <AlertTriangle size={13} /> : <TrendingUp size={13} />}
                {s.text}
              </button>
            ))}
          </div>
        </Block>
      )}

      <Block Icon={Target} title="Tomorrow I will…" area="promise">
        {editable ? (
          <>
            {ifThen ? (
              <div className="cd-ifthen">
                <label className="cd-ifthen-row">
                  <span>When</span>
                  <input type="text" className="cd-input" value={ifThen.cue} placeholder="I finish lunch" onChange={e => setIfThenPart('cue', e.target.value)} />
                </label>
                <label className="cd-ifthen-row">
                  <span>I will</span>
                  <input type="text" className="cd-input" value={ifThen.action} placeholder="walk for 20 minutes" onChange={e => setIfThenPart('action', e.target.value)} />
                </label>
              </div>
            ) : (
              <input type="text" className="cd-input cd-input--big" value={text} placeholder="One specific thing…" onChange={e => setText(e.target.value)} />
            )}
            <button type="button" className="cd-link" onClick={toggleIfThen}>
              {ifThen ? 'Write it as one line instead' : 'Make it an if-then plan (people who plan the “when” follow through far more often)'}
            </button>
            <div className="cd-hold-wrap">
              <HoldToCommit
                disabled={!text.trim() || (ifThen && (!ifThen.cue.trim() || !ifThen.action.trim()))}
                onCommit={() => { onCommitmentLocked({ date: todayKey, text: text.trim() }); setUnlocked(false); }}
              />
            </div>
          </>
        ) : (
          <div className="cd-locked">
            <p className="cd-quote">{text}</p>
            <div className="cd-locked-row">
              <span className="cd-status cd-status--success"><Lock size={14} /> Locked in. Tomorrow night will ask.</span>
              <button type="button" className="cd-link" onClick={() => setUnlocked(true)}><Pencil size={13} /> Change</button>
            </div>
          </div>
        )}
      </Block>
    </>
  );
};

const SCORE_PART_ICON = { habits: Repeat, tasks: CheckSquare, sleep: Moon, log: NotebookText, commitment: Handshake };

/** Points earned vs possible for each part of the Daily Score, with tonight's fixes. */
const ScoreBreakdown = ({ explained, score, streak, onFix }) => {
  const toThreshold = Math.round((STREAK_THRESHOLD - score) * 10) / 10;
  const goal = toThreshold > 0
    ? `${toThreshold.toFixed(1)} to go ${streak > 0 ? 'to keep your streak' : 'to start a streak'}`
    : null;
  return (
    <Block
      Icon={PieChart}
      area="points"
      title="Where your points went"
      hint={explained.missing > 0 ? `${explained.missing.toFixed(1)} points missed` : 'Perfect day'}
    >
      {goal && <p className="sb-goal"><Flame size={13} /> {goal}</p>}
      <ul className="sb-rows">
        {explained.rows.map(row => {
          const Icon = SCORE_PART_ICON[row.key];
          return (
            <li key={row.key} className={`sb-row${row.missing > 0 ? '' : ' full'}`}>
              <div className="sb-top">
                <span className="sb-label"><Icon size={14} /> {row.label}</span>
                <span className="sb-detail">{row.detail}</span>
                <span className="sb-pts"><strong>{row.points.toFixed(1)}</strong>/{row.max}</span>
              </div>
              <div className="sb-bar" aria-hidden="true">
                <span style={{ width: `${(row.points / row.max) * 100}%`, background: scoreColor((row.points / row.max) * 10) }} />
              </div>
              {(row.fix || row.note) && (
                <div className="sb-foot">
                  {row.note && <span className="sb-note">{row.note}</span>}
                  {row.fix && (
                    <button type="button" className="sb-fix" onClick={() => onFix(row.fix)}>
                      {row.fix.label} <ChevronRight size={13} />
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Block>
  );
};

const FinishStep = ({ steps, status, onGoTo, score, rating, pendingAwards, canClose, onClose, breakdown }) => {
  const xpTotal = pendingAwards.reduce((sum, a) => sum + a.amount, 0);
  return (
    <>
      <Block className="cd-block--quiet" area="checklist">
        <ul className="cd-checklist">
          {steps.filter(k => k !== 'finish').map(k => (
            <li key={k} className={status[k] ? 'done' : ''}>
              <span className="cd-check">{status[k] && <Check size={12} strokeWidth={3} />}</span>
              <span className="cd-checklist-label">{STEP_META[k].label}</span>
              {!status[k] && <button type="button" className="cd-link" onClick={() => onGoTo(k)}>Go back</button>}
            </li>
          ))}
        </ul>
      </Block>

      <div className="cd-finish-stats cd-a-stats">
        <div className="cd-stat">
          <span className="cd-stat-value" style={{ color: scoreColor(score) }}>{score}</span>
          <span className="cd-stat-label">Daily Score so far</span>
        </div>
        <div className="cd-stat">
          <span className="cd-stat-value">{rating || '–'}</span>
          <span className="cd-stat-label">Your rating</span>
        </div>
        <div className="cd-stat">
          <span className="cd-stat-value">{xpTotal ? `+${xpTotal}` : '0'}</span>
          <span className="cd-stat-label">Health XP to collect</span>
        </div>
      </div>

      {breakdown}

      {pendingAwards.length > 0 && (
        <p className="cd-awards cd-a-awards">
          {pendingAwards.map((a, i) => (
            <span key={i} style={{ color: STAT_META[a.stat]?.color }}>+{a.amount} {STAT_META[a.stat]?.label || a.stat} · {a.label}</span>
          ))}
        </p>
      )}

      <button type="button" className="cd-close-btn cd-a-close" onClick={onClose} disabled={!canClose}>
        <Moon size={18} /> Close the day
      </button>
      <p className="cd-close-hint cd-a-hint">
        {canClose ? 'Saves everything, pays your health XP and asks your assistant for tonight’s review.' : 'Write something first, even one win.'}
      </p>
    </>
  );
};

const DayClosed = ({ entry, todayKey, score, streak, review, reviewingDate, reviewError, onSubmitLog, onOpenAssistant, onEdit, breakdown }) => (
  <div className="cd-closed">
    <div className="cd-closed-hero cd-a-hero">
      <span className="cd-closed-moon"><Moon size={28} /></span>
      <h2 className="cd-title">Day closed.</h2>
      <p className="cd-closed-sub">Closed at {formatTime(entry.closedAt)}. Put the phone down. Tomorrow starts tonight.</p>
    </div>

    <div className="cd-finish-stats cd-a-stats">
      <div className="cd-stat">
        <span className="cd-stat-value" style={{ color: scoreColor(score) }}>{score}</span>
        <span className="cd-stat-label">Daily Score</span>
      </div>
      <div className="cd-stat">
        <span className="cd-stat-value"><Flame size={18} /> {streak}</span>
        <span className="cd-stat-label">Day streak</span>
      </div>
      <div className="cd-stat">
        <span className="cd-stat-value">{entry.dayRating || '–'}</span>
        <span className="cd-stat-label">Your rating</span>
      </div>
    </div>

    {breakdown}

    {entry.commitment?.trim() && (
      <Block Icon={Target} title="Tomorrow" area="tomorrow">
        <p className="cd-quote">{entry.commitment}</p>
      </Block>
    )}

    {reviewingDate === todayKey && !review ? (
      <div className="cd-reviewing cd-a-review"><LoaderCircle size={16} className="log-review-spin" /> Your assistant is reading your day…</div>
    ) : (
      <LogReviewSection
        key={`${todayKey}:${reviewError || ''}`}
        dateKey={todayKey}
        entry={entry}
        isToday
        initialError={reviewError}
        review={review}
        reviewingDate={reviewingDate}
        onSubmit={onSubmitLog}
        onOpenAssistant={onOpenAssistant}
      />
    )}

    <button type="button" className="cd-btn cd-btn--ghost cd-edit-btn cd-a-edit" onClick={onEdit}>
      <Pencil size={14} /> Edit tonight’s entry
    </button>
  </div>
);

// ─── Flow ─────────────────────────────────────────────────────────────────────

const CloseDayFlow = ({
  todayKey, entry, updateField, updateArrayField, logs, logReviews, commitmentArchive,
  onResolveCommitment, onCommitmentLocked, habits, onToggleHabitDay, habitHandlers,
  healthLog, setHealthLog, foodLog, setFoodLog, foodPoints, setFoodPoints, onUpdateStat,
  goals, northStar, logPatterns, xpLog, reviewingDate, onSubmitLog, onOpenAssistant, lessonHandlers, onNavigate,
}) => {
  const reduceMotion = useReducedMotion();
  const rootRef = useRef(null);
  const now = useMemo(() => new Date(), []);

  const commitment = getYesterdayCommitment(logs, commitmentArchive, now);
  const lookBack = getLookBack({ entry, logs, logReviews, todayKey, commitment });
  const commitmentLocked = isCommitmentLocked(entry, commitmentArchive, todayKey);
  const steps = getSteps(lookBack);
  const status = getStepStatus({ entry, lookBack, commitmentLocked });

  const [step, setStep] = useState(() => (entry.closedAt ? 'closed' : getFirstOpenStep(steps, status)));
  const current = step === 'closed' || steps.includes(step) ? step : steps[0];
  const index = steps.indexOf(current);

  // Bring the top of the routine back into view between steps: after the old step
  // has faded out and before the new one mounts (so a field it autofocuses can't
  // interrupt the scroll).
  const scrollToTop = () => rootRef.current?.scrollIntoView({ block: 'start' });

  // Tonight's question: frozen once answered, otherwise picked per date (and shufflable).
  const focusGoal = getFocusGoal(goals, now);
  const [shuffle, setShuffle] = useState(0);
  const prompt = entry.prompt?.text
    ? entry.prompt
    : pickPrompt(shuffle ? `${todayKey}#${shuffle}` : todayKey, {
      northStar: northStar?.vision?.trim(),
      goalTitle: focusGoal?.title,
      lastId: getLastPromptId(logs, todayKey),
    });
  const shufflePrompt = () => {
    if (entry.prompt?.text) updateField('prompt', null);
    setShuffle(n => n + 1);
  };

  const flags = logPatterns?.date === todayKey ? logPatterns.flags || [] : [];
  const habitLeak = useMemo(() => getHabitLeak(habits, todayKey), [habits, todayKey]);
  const suggestions = getCommitmentSuggestions({ entry, goals, now, flags });

  const { score, breakdown } = computeDailyScore(habits, xpLog, logs, commitmentArchive, healthLog, todayKey);
  const streak = useMemo(
    () => computeStreak(habits, xpLog, logs, commitmentArchive, healthLog),
    [habits, xpLog, logs, commitmentArchive, healthLog]
  );

  const pending = getPendingHealthAwards(healthLog[todayKey] || {}, foodLog[todayKey]?.entries || []);
  const review = logReviews[todayKey] || null;
  const [reviewError, setReviewError] = useState(null);

  const goTo = (key) => setStep(key);

  const explained = explainScore({
    breakdown,
    habitsTotal: habits.length,
    sleepLogged: healthLog[todayKey]?.sleepHours != null,
    commitmentStatus: commitment.status,
    tonightLocked: commitmentLocked,
  });
  const fixScore = (fix) => {
    if (fix.page) onNavigate?.(fix.page);
    else if (steps.includes(fix.step)) goTo(fix.step);
  };
  const scoreBreakdown = <ScoreBreakdown explained={explained} score={score} streak={streak} onFix={fixScore} />;
  const next = () => goTo(steps[Math.min(index + 1, steps.length - 1)]);
  const back = () => goTo(steps[Math.max(index - 1, 0)]);

  const applyToTomorrow = (text) => {
    if (commitmentLocked) return;
    updateField('commitment', text);
    goTo('tomorrow');
  };

  const closeTheDay = async () => {
    pending.awards.forEach(a => onUpdateStat?.(a.stat, a.amount, { source: 'manual', label: a.label }));
    if (pending.keys.length) {
      setHealthLog(prev => {
        const day = prev[todayKey] || {};
        return { ...prev, [todayKey]: { ...day, xpAwarded: true, xpAwardedFor: [...new Set([...(day.xpAwardedFor || []), ...pending.keys])] } };
      });
    }
    updateField('closedAt', Date.now());
    goTo('closed');
    setReviewError(null);
    // The day is closed either way; a failed review just shows why, with a retry.
    const stale = !review || review.entryFingerprint !== entryFingerprint(entry);
    if (entryHasContent(entry) && stale && !reviewingDate && onSubmitLog) {
      const result = await onSubmitLog(todayKey);
      if (!result?.ok) setReviewError(result?.error || 'The review failed. Try again.');
    }
  };

  const motionProps = {
    initial: { opacity: 0, y: reduceMotion ? 0 : 14 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: reduceMotion ? 0 : -8 },
    transition: { duration: 0.24, ease: [0.25, 0.1, 0.25, 1] },
  };

  return (
    <div className="cd" ref={rootRef}>
      <header className="cd-head">
        <span className="cd-eyebrow"><Moon size={14} /> Tonight · {formatDayLabel(todayKey)}</span>
        {current !== 'closed' && (
          <nav className="cd-steps" aria-label="Close the day steps">
            {steps.map((k, i) => (
              <button
                key={k}
                type="button"
                className={`cd-step${k === current ? ' current' : ''}${status[k] ? ' done' : ''}`}
                onClick={() => goTo(k)}
                aria-current={k === current ? 'step' : undefined}
              >
                <span className="cd-step-dot">{status[k] && k !== current ? <Check size={11} strokeWidth={3} /> : i + 1}</span>
                <span className="cd-step-label">{STEP_META[k].label}</span>
              </button>
            ))}
          </nav>
        )}
      </header>

      <AnimatePresence mode="wait" initial={false} onExitComplete={scrollToTop}>
        <MotionDiv key={current} className={`cd-body cd-body--${current}`} {...motionProps}>
          {current === 'closed' ? (
            <DayClosed
              entry={entry}
              todayKey={todayKey}
              score={score}
              streak={streak}
              review={review}
              reviewingDate={reviewingDate}
              reviewError={reviewError}
              onSubmitLog={onSubmitLog}
              onOpenAssistant={onOpenAssistant}
              onEdit={() => goTo(steps[0])}
              breakdown={scoreBreakdown}
            />
          ) : (
            <>
              <h2 className="cd-title">{STEP_META[current].title}</h2>

              {current === 'lookBack' && (
                <LookBackStep lookBack={lookBack} entry={entry} todayKey={todayKey} updateField={updateField} onResolveCommitment={onResolveCommitment} />
              )}
              {current === 'checkIn' && (
                <CheckInStep
                  entry={entry}
                  updateField={updateField}
                  todayKey={todayKey}
                  habits={habits}
                  habitHandlers={habitHandlers}
                  onToggleHabitDay={onToggleHabitDay}
                  health={{ healthLog, setHealthLog, foodLog, setFoodLog, foodPoints, setFoodPoints }}
                />
              )}
              {current === 'reflect' && (
                <ReflectStep
                  entry={entry}
                  updateField={updateField}
                  updateArrayField={updateArrayField}
                  todayKey={todayKey}
                  logs={logs}
                  prompt={prompt}
                  onShufflePrompt={shufflePrompt}
                  patterns={{ flags, habitLeak, commitmentLocked, onMakeHabit: habitHandlers.onAddHabit, onUseForTomorrow: applyToTomorrow }}
                  lessonHandlers={lessonHandlers}
                />
              )}
              {current === 'tomorrow' && (
                <TomorrowStep
                  entry={entry}
                  updateField={updateField}
                  todayKey={todayKey}
                  commitmentLocked={commitmentLocked}
                  suggestions={suggestions}
                  onCommitmentLocked={onCommitmentLocked}
                />
              )}
              {current === 'finish' && (
                <FinishStep
                  steps={steps}
                  status={status}
                  onGoTo={goTo}
                  score={score}
                  rating={entry.dayRating}
                  pendingAwards={pending.awards}
                  canClose={entryHasContent(entry)}
                  onClose={closeTheDay}
                  breakdown={scoreBreakdown}
                />
              )}

              {current !== 'finish' && (
                <footer className="cd-nav">
                  {index > 0
                    ? <button type="button" className="cd-btn cd-btn--ghost" onClick={back}><ChevronLeft size={16} /> Back</button>
                    : <span />}
                  <button type="button" className="cd-btn cd-btn--primary" onClick={next}>
                    {status[current] ? 'Next' : 'Skip for now'} <ChevronRight size={16} />
                  </button>
                </footer>
              )}
              {current === 'finish' && index > 0 && (
                <footer className="cd-nav">
                  <button type="button" className="cd-btn cd-btn--ghost" onClick={back}><ChevronLeft size={16} /> Back</button>
                  <span />
                </footer>
              )}
            </>
          )}
        </MotionDiv>
      </AnimatePresence>
    </div>
  );
};

export default CloseDayFlow;
