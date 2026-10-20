import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pin, ArrowRight, Check, Sparkles, Loader2, RotateCcw, Flag } from 'lucide-react';
import {
  toggleMilestone, toggleGoalCompleted, pushDeadline, goalCompletionXp, getGoalEvents,
  deadlineLabel, MILESTONE_XP,
} from '../../utils/goalUtils';
import { applyCoachChange, changeLabel } from '../../utils/goalCoach';
import { weekDays, nextWeekOf, getResetGoals } from '../../utils/weeklyReset';

/**
 * Step 3: tick off goals and milestones, then the goal coach's recalibration,
 * which runs on its own the first time the step opens and is saved on the review.
 * Each suggested change applies only on a tap.
 */
const ResetGoals = ({ reviewKey, review, updateReview, goals, setGoals, todos, setTodos, habits, pomodoroSessions, calendarEvents, onLogActivity, onRecalibrate, onNavigate }) => {
  const days = weekDays(reviewKey);
  const resetGoals = useMemo(() => getResetGoals(goals, reviewKey), [goals, reviewKey]);
  const weekGoals = useMemo(() => {
    const data = { todos, habits, pomodoroSessions, calendarEvents };
    return resetGoals.map((goal) => {
      const events = getGoalEvents(goal, data).filter((e) => e.date >= days[0] && e.date <= days[6]);
      return { goal, count: events.length, minutes: events.reduce((sum, e) => sum + (e.minutes || 0), 0) };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- days is derived from reviewKey
  }, [resetGoals, reviewKey, todos, habits, pomodoroSessions, calendarEvents]);
  const planEnd = weekDays(nextWeekOf(reviewKey))[6];

  const awardGoalXp = (goal) => {
    const xp = goalCompletionXp(goal);
    if (onLogActivity && xp > 0) onLogActivity(xp, { source: 'goal', label: goal.title });
  };

  const handleToggleGoalComplete = (goal) => {
    const { goal: updated, shouldAwardXp } = toggleGoalCompleted(goal);
    setGoals((prev) => prev.map((g) => (g.id === goal.id ? updated : g)));
    if (shouldAwardXp) awardGoalXp(goal);
  };

  const handleToggleMilestone = (goal, milestoneId) => {
    const { goal: updatedGoal, justCompleted, milestoneText } = toggleMilestone(goal, milestoneId);
    const allDone = updatedGoal.milestones.length > 0 && updatedGoal.milestones.every((m) => m.completed);
    let finalGoal = updatedGoal;
    let shouldAwardGoalXp = false;
    if (allDone && !updatedGoal.completed) {
      const result = toggleGoalCompleted(updatedGoal);
      finalGoal = result.goal;
      shouldAwardGoalXp = result.shouldAwardXp;
    }
    setGoals((prev) => prev.map((g) => (g.id === goal.id ? finalGoal : g)));
    if (justCompleted) onLogActivity?.(MILESTONE_XP, { source: 'milestone', label: milestoneText });
    if (shouldAwardGoalXp) awardGoalXp(goal);
  };

  const handlePushDeadline = (goal) => {
    setGoals((prev) => prev.map((g) => (g.id === goal.id ? pushDeadline(g, 7, new Date()) : g)));
  };

  // ── Recalibration ──
  const recal = review?.goalCoach || null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const hasOpenGoals = weekGoals.some(({ goal }) => !goal.completed);
  const run = async () => {
    if (!onRecalibrate) return;
    setBusy(true);
    setError(null);
    const res = await onRecalibrate();
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    updateReview(() => ({ goalCoach: { ...res.recalibration, applied: {} } }));
  };
  const autoRan = useRef(false);
  useEffect(() => {
    if (autoRan.current || recal || !hasOpenGoals || !onRecalibrate || review?.completedAt) return;
    autoRan.current = true;
    run();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once, when the step first opens
  }, []);

  const applyChanges = (pairs) => {
    const live = pairs.filter(({ change }) => !recal?.applied?.[change.id]);
    if (!live.length) return;
    setGoals((prev) => prev.map((g) => live.reduce((acc, { goalId, change }) => (
      String(goalId) === String(acc.id) ? (applyCoachChange(acc, change).goal || acc) : acc
    ), g)));
    const tasks = live.map(({ goalId, change }) => {
      const goal = goals.find((g) => String(g.id) === String(goalId));
      return goal ? applyCoachChange(goal, change).task : null;
    }).filter(Boolean).map((t, i) => ({ ...t, id: t.id + i }));
    if (tasks.length) setTodos((prev) => [...prev, ...tasks]);
    updateReview((week) => {
      const applied = { ...week.goalCoach?.applied };
      live.forEach(({ change }) => { applied[change.id] = true; });
      return { goalCoach: { ...week.goalCoach, applied } };
    });
  };
  const allPending = (recal?.goals || []).flatMap((entry) => (
    goals.some((g) => String(g.id) === String(entry.goalId))
      ? entry.changes.filter((c) => !recal.applied?.[c.id]).map((change) => ({ goalId: entry.goalId, change }))
      : []
  ));

  if (!weekGoals.length) {
    return (
      <section className="cd-block">
        <p className="cd-quote cd-quote--small">No focus goals yet. A goal gives next week’s plan something to aim at.</p>
        <button type="button" className="cd-btn" onClick={() => onNavigate?.('goals')}><Flag size={15} /> Set a goal</button>
      </section>
    );
  }

  return (
    <>
      <section className="cd-block wr-goals">
        <header className="cd-block-head">
          <h3 className="cd-block-title"><Flag size={16} /> Tick off what you finished</h3>
        </header>
        {weekGoals.map(({ goal, count, minutes }) => {
          const isComplete = !!goal.completed;
          return (
            <div key={goal.id} className={`review-goal-item ${isComplete ? 'review-goal-item--complete' : ''}`}>
              <div className="review-goal-header">
                <label className="review-goal-title-row">
                  <input type="checkbox" checked={isComplete} onChange={() => handleToggleGoalComplete(goal)} />
                  <span className="review-goal-title">{goal.title}</span>
                </label>
                {goal.pinned && <span className="review-goal-pin" title="Pinned focus goal"><Pin size={14} /></span>}
              </div>
              <p className={`review-goal-week ${count ? '' : 'review-goal-week--none'}`}>
                {count ? `${count} thing${count === 1 ? '' : 's'} moved it this week${minutes ? ` · ${minutes}m focus` : ''}` : 'Nothing moved it this week'}
                {' · '}{deadlineLabel(goal, new Date())}
              </p>
              {goal.milestones?.length > 0 && (
                <div className="review-goal-milestones">
                  {goal.milestones.map((m) => (
                    <label key={m.id} className={`review-goal-milestone ${m.completed ? 'review-goal-milestone--done' : ''}`}>
                      <input type="checkbox" checked={m.completed} onChange={() => handleToggleMilestone(goal, m.id)} />
                      <span>{m.text}</span>
                    </label>
                  ))}
                </div>
              )}
              {!isComplete && goal.deadline && goal.deadline <= planEnd && (
                <button type="button" className="review-goal-carry-btn" onClick={() => handlePushDeadline(goal)}>
                  Push deadline a week <ArrowRight size={14} />
                </button>
              )}
            </div>
          );
        })}
      </section>

      {(hasOpenGoals || recal) && (
        <section className="review-recal">
          <div className="review-recal-head">
            <h3 className="review-goal-checkin-title"><Sparkles size={16} /> Adjust your goals’ plans</h3>
            {recal && !busy && !review?.completedAt && (
              <button type="button" className="review-recal-again" onClick={run}><RotateCcw size={13} /> Run again</button>
            )}
          </div>
          {busy && <p className="review-ai-hint"><Loader2 size={13} className="review-spin" /> Comparing each goal’s plan with your week…</p>}
          {!recal && !busy && !error && (
            <p className="review-ai-hint">Your assistant compares each goal’s plan with what you actually did, then suggests changes. Nothing changes until you apply it.</p>
          )}
          {error && (
            <>
              <p className="review-ai-error">{error}</p>
              <button type="button" className="review-recal-btn" onClick={run}><RotateCcw size={14} /> Try again</button>
            </>
          )}
          {recal && recal.goals.map((entry) => {
            const exists = goals.some((g) => String(g.id) === String(entry.goalId));
            return (
              <div key={entry.goalId} className="review-recal-goal">
                <p className="review-recal-title">{entry.title}</p>
                {entry.verdict && <p className="review-recal-verdict">{entry.verdict}</p>}
                {entry.changes.length === 0 && <p className="review-recal-none">Keep going as planned.</p>}
                {entry.changes.map((change) => {
                  const applied = !!recal.applied?.[change.id];
                  return (
                    <div key={change.id} className={`review-recal-change ${applied ? 'is-applied' : ''}`}>
                      <div className="review-recal-change-text">
                        <span>{changeLabel(change)}</span>
                        {change.reason && <span className="review-recal-reason">{change.reason}</span>}
                      </div>
                      {applied ? (
                        <span className="review-recal-done"><Check size={13} /> Applied</span>
                      ) : exists ? (
                        <button type="button" className="review-recal-apply" onClick={() => applyChanges([{ goalId: entry.goalId, change }])}>Apply</button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            );
          })}
          {recal && allPending.length > 1 && (
            <button type="button" className="review-recal-btn" onClick={() => applyChanges(allPending)}><Check size={15} /> Apply all {allPending.length}</button>
          )}
        </section>
      )}
    </>
  );
};

export default ResetGoals;
