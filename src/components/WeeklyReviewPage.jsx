import React, { useState, useMemo } from 'react';
import './WeeklyReviewPage.css';
import {
  ChevronLeft, ChevronRight, Pin, ArrowRight, Check, Construction, TrendingUp,
  CheckSquare, Target, Zap, Sparkles, Loader2, RotateCcw,
} from 'lucide-react';
import {
  toggleMilestone,
  toggleGoalCompleted,
  pushDeadline,
  goalCompletionXp,
  getFocusGoals,
  getGoalEvents,
  deadlineLabel,
  goalDateKey,
  MILESTONE_XP,
} from '../utils/goalUtils';
import { applyCoachChange, changeLabel } from '../utils/goalCoach';
import { computeWeekStats, getMondayKey, formatWeekRange, getWeekDays } from '../utils/weekStatsUtils';

const WeeklyReviewPage = ({ weeklyReviews = {}, setWeeklyReviews, xpLog = [], pomodoroSessions = [], habits = [], todos = [], logs = {}, goals = [], healthLog = {}, calendarEvents = [], setGoals, setTodos, onAwardXp, onRecalibrate }) => {
  const [weekOffset, setWeekOffset] = useState(0);
  const mondayKey = getMondayKey(weekOffset);
  const isCurrentWeek = weekOffset === 0;
  const saved = weeklyReviews[mondayKey];

  const logCount = Object.keys(logs).length;
  const stats = useMemo(
    () => computeWeekStats(mondayKey, xpLog, pomodoroSessions, habits, todos, logs, goals, healthLog),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- length-keyed on purpose (recomputed when items are added/removed)
    [mondayKey, xpLog.length, pomodoroSessions.length, habits.length, todos.length, logCount, goals, healthLog]
  );

  // This week: the focus goals plus anything due by Sunday. Past weeks: the goals
  // that moved (or were achieved) that week. Each carries that week's activity.
  const weekGoals = useMemo(() => {
    const sundayKey = getWeekDays(mondayKey)[6];
    const data = { todos, habits, pomodoroSessions, calendarEvents };
    const inWeek = (key) => key >= mondayKey && key <= sundayKey;
    const withWeek = (g) => {
      const events = getGoalEvents(g, data).filter((e) => inWeek(e.date));
      return { goal: g, count: events.length, minutes: events.reduce((sum, e) => sum + (e.minutes || 0), 0) };
    };
    const picked = isCurrentWeek
      ? [...new Set([...getFocusGoals(goals), ...goals.filter((g) => !g.completed && g.deadline && g.deadline <= sundayKey)])]
      : goals.filter((g) => (g.completedAt && inWeek(goalDateKey(new Date(g.completedAt)))) || withWeek(g).count > 0);
    return picked.map(withWeek);
  }, [goals, mondayKey, isCurrentWeek, todos, habits, pomodoroSessions, calendarEvents]);
  const sundayKey = getWeekDays(mondayKey)[6];

  const awardGoalXp = (goal) => {
    const xp = goalCompletionXp(goal);
    if (onAwardXp && xp > 0) onAwardXp(xp, { source: 'goal', label: goal.title });
  };

  const awardMilestoneXp = (goal, milestoneText) => {
    onAwardXp?.(MILESTONE_XP, { source: 'milestone', label: milestoneText });
  };

  const handleToggleGoalComplete = (goal) => {
    const { goal: updated, shouldAwardXp } = toggleGoalCompleted(goal);
    setGoals(prev => prev.map(g => g.id === goal.id ? updated : g));
    if (shouldAwardXp) awardGoalXp(goal);
  };

  const handleToggleMilestone = (goal, milestoneId) => {
    const { goal: updatedGoal, justCompleted, milestoneText } = toggleMilestone(goal, milestoneId);
    const allDone = updatedGoal.milestones.length > 0 && updatedGoal.milestones.every(m => m.completed);
    let finalGoal = updatedGoal;
    let shouldAwardGoalXp = false;
    if (allDone && !updatedGoal.completed) {
      const result = toggleGoalCompleted(updatedGoal);
      finalGoal = result.goal;
      shouldAwardGoalXp = result.shouldAwardXp;
    }
    setGoals(prev => prev.map(g => g.id === goal.id ? finalGoal : g));
    if (justCompleted) awardMilestoneXp(goal, milestoneText);
    if (shouldAwardGoalXp) awardGoalXp(goal);
  };

  // ── Goal coach: weekly recalibration ──
  // Saved on the week's review so it isn't re-run; each change applies on a tap.
  const recal = saved?.goalCoach || null;
  const [recalBusy, setRecalBusy] = useState(false);
  const [recalError, setRecalError] = useState(null);
  const runRecalibration = async () => {
    setRecalBusy(true);
    setRecalError(null);
    const res = await onRecalibrate();
    setRecalBusy(false);
    if (!res.ok) { setRecalError(res.error); return; }
    setWeeklyReviews(prev => ({ ...prev, [mondayKey]: { ...prev[mondayKey], goalCoach: { ...res.recalibration, applied: {} } } }));
  };
  const applyChanges = (pairs) => {
    const live = pairs.filter(({ change }) => !recal?.applied?.[change.id]);
    if (!live.length) return;
    setGoals(prev => prev.map((g) => live.reduce((acc, { goalId, change }) => (
      String(goalId) === String(acc.id) ? (applyCoachChange(acc, change).goal || acc) : acc
    ), g)));
    const tasks = live.map(({ goalId, change }) => {
      const goal = goals.find((g) => String(g.id) === String(goalId));
      return goal ? applyCoachChange(goal, change).task : null;
    }).filter(Boolean).map((t, i) => ({ ...t, id: t.id + i }));
    if (tasks.length) setTodos(prev => [...prev, ...tasks]);
    setWeeklyReviews(prev => {
      const week = prev[mondayKey] || {};
      const applied = { ...week.goalCoach?.applied };
      live.forEach(({ change }) => { applied[change.id] = true; });
      return { ...prev, [mondayKey]: { ...week, goalCoach: { ...week.goalCoach, applied } } };
    });
  };
  const allPending = (recal?.goals || []).flatMap((entry) => (
    goals.some((g) => String(g.id) === String(entry.goalId))
      ? entry.changes.filter((c) => !recal.applied?.[c.id]).map((change) => ({ goalId: entry.goalId, change }))
      : []
  ));

  const handlePushDeadline = (goal) => {
    setGoals(prev => prev.map(g => (g.id === goal.id ? pushDeadline(g, 7, new Date()) : g)));
  };

  const [wentWell,     setWentWell]     = useState(saved?.wentWell     || '');
  const [heldBack,     setHeldBack]     = useState(saved?.heldBack     || '');
  const [improvements, setImprovements] = useState(saved?.improvements || '');
  const [priority,     setPriority]     = useState(saved?.priority     || '');
  const [justSaved,    setJustSaved]    = useState(false);

  const handleSave = () => {
    setWeeklyReviews(prev => ({
      ...prev,
      // Keep anything else stored on the week (e.g. the goal coach's recalibration).
      [mondayKey]: { ...prev[mondayKey], wentWell, heldBack, improvements, priority, completedAt: Date.now(), stats },
    }));
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2000);
  };

  const handleWeekChange = (dir) => {
    const newOffset = weekOffset + dir;
    if (newOffset > 0) return;
    const newKey = getMondayKey(newOffset);
    const newSaved = weeklyReviews[newKey];
    setWeekOffset(newOffset);
    setWentWell(newSaved?.wentWell || '');
    setHeldBack(newSaved?.heldBack || '');
    setImprovements(newSaved?.improvements || '');
    setPriority(newSaved?.priority || '');
  };

  const pastReviews = Object.entries(weeklyReviews)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 8);

  return (
    <div className="review-page">
      <h1 className="section-page-title">Weekly Review</h1>

      <div className="review-layout">
        {/* ── Main Review ──────────────────────────────────────────────────── */}
        <div className="review-main">
          {/* Week nav */}
          <div className="review-week-nav">
            <button className="review-nav-btn" onClick={() => handleWeekChange(-1)}><ChevronLeft size={16} /></button>
            <div className="review-week-info">
              <span className="review-week-label">{isCurrentWeek ? 'This Week' : 'Past Week'}</span>
              <span className="review-week-range">{formatWeekRange(mondayKey)}</span>
            </div>
            <button className="review-nav-btn" onClick={() => handleWeekChange(1)} disabled={isCurrentWeek}><ChevronRight size={16} /></button>
          </div>

          {/* Goal Check-In */}
          {weekGoals.length > 0 && (
            <div className="review-goal-checkin">
              <h3 className="review-goal-checkin-title"><Target size={18} /> Goal Check-In</h3>
              {weekGoals.map(({ goal, count, minutes }) => {
                const isComplete = !!goal.completed;
                return (
                  <div key={goal.id} className={`review-goal-item ${isComplete ? 'review-goal-item--complete' : ''}`}>
                    <div className="review-goal-header">
                      <label className="review-goal-title-row">
                        <input
                          type="checkbox"
                          checked={isComplete}
                          onChange={() => handleToggleGoalComplete(goal)}
                        />
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
                            <input
                              type="checkbox"
                              checked={m.completed}
                              onChange={() => handleToggleMilestone(goal, m.id)}
                            />
                            <span>{m.text}</span>
                          </label>
                        ))}
                      </div>
                    )}

                    {(goal.obstacle?.trim() || goal.ifThenPlan?.trim()) && (
                      <div className="review-goal-woop">
                        {goal.obstacle?.trim() && <p><strong>Obstacle:</strong> {goal.obstacle}</p>}
                        {goal.ifThenPlan?.trim() && <p><strong>If → then:</strong> {goal.ifThenPlan}</p>}
                      </div>
                    )}

                    {!isComplete && isCurrentWeek && goal.deadline && goal.deadline <= sundayKey && (
                      <button type="button" className="review-goal-carry-btn" onClick={() => handlePushDeadline(goal)}>
                        Push deadline a week <ArrowRight size={14} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Goal coach: recalibrate the plan */}
          {(isCurrentWeek || recal) && weekGoals.some(({ goal }) => !goal.completed) && (
            <div className="review-recal">
              <div className="review-recal-head">
                <h3 className="review-goal-checkin-title"><Sparkles size={16} /> Recalibrate your goals</h3>
                {isCurrentWeek && recal && !recalBusy && (
                  <button type="button" className="review-recal-again" onClick={runRecalibration}><RotateCcw size={13} /> Run again</button>
                )}
              </div>
              {!recal && (
                <>
                  <p className="review-ai-hint">My Assistant compares each goal's plan with what you actually did this week, then suggests changes so next week is realistic. Nothing changes until you apply it.</p>
                  <button type="button" className="review-recal-btn" onClick={runRecalibration} disabled={recalBusy}>
                    {recalBusy ? <><Loader2 size={15} className="review-spin" /> Reviewing your week…</> : <><Sparkles size={15} /> Recalibrate with AI</>}
                  </button>
                </>
              )}
              {recalBusy && recal && <p className="review-ai-hint"><Loader2 size={13} className="review-spin" /> Reviewing your week…</p>}
              {recalError && <p className="review-ai-error">{recalError}</p>}
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
                          ) : isCurrentWeek && exists ? (
                            <button type="button" className="review-recal-apply" onClick={() => applyChanges([{ goalId: entry.goalId, change }])}>Apply</button>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
              {recal && isCurrentWeek && allPending.length > 1 && (
                <button type="button" className="review-recal-btn" onClick={() => applyChanges(allPending)}><Check size={15} /> Apply all {allPending.length}</button>
              )}
            </div>
          )}

          {/* Reflection prompts */}
          <div className="review-prompts">
            <div className="review-prompt-group">
              <label className="review-prompt-label"><CheckSquare size={16} /> What went well this week?</label>
              <textarea
                className="review-textarea"
                placeholder="Wins, breakthroughs, proud moments..."
                value={wentWell}
                onChange={e => setWentWell(e.target.value)}
                rows={3}
              />
            </div>
            <div className="review-prompt-group">
              <label className="review-prompt-label"><Construction size={16} /> What held me back?</label>
              <textarea
                className="review-textarea"
                placeholder="Obstacles, bad habits, missed opportunities..."
                value={heldBack}
                onChange={e => setHeldBack(e.target.value)}
                rows={3}
              />
            </div>
            <div className="review-prompt-group">
              <label className="review-prompt-label"><TrendingUp size={16} /> What do I need to improve on next week?</label>
              <textarea
                className="review-textarea"
                placeholder="Skills to sharpen, habits to build, behaviors to change..."
                value={improvements}
                onChange={e => setImprovements(e.target.value)}
                rows={3}
              />
            </div>
            <div className="review-prompt-group">
              <label className="review-prompt-label"><Target size={16} /> #1 Priority for next week</label>
              <textarea
                className="review-textarea review-textarea--highlight"
                placeholder="The single most important thing to focus on..."
                value={priority}
                onChange={e => setPriority(e.target.value)}
                rows={2}
              />
            </div>
          </div>

          <button className={`review-save-btn ${justSaved ? 'saved' : ''}`} onClick={handleSave}>
            {justSaved ? <><Check size={14} /> Review Saved!</> : 'Save Review'}
          </button>
        </div>

        {/* ── Past Reviews ─────────────────────────────────────────────────── */}
        <div className="review-sidebar">
          <h3 className="review-sidebar-title">Past Reviews</h3>
          {pastReviews.length === 0 ? (
            <p className="review-sidebar-empty">No reviews yet. Complete your first one!</p>
          ) : (
            pastReviews.map(([key, r]) => (
              <div
                key={key}
                className={`review-past-item ${key === mondayKey ? 'active' : ''}`}
                onClick={() => {
                  const off = Math.round((new Date(getMondayKey(0)) - new Date(key + 'T00:00:00')) / (7 * 86400000)) * -1;
                  setWeekOffset(off);
                  setWentWell(r.wentWell || '');
                  setHeldBack(r.heldBack || '');
                  setImprovements(r.improvements || '');
                  setPriority(r.priority || '');
                }}
              >
                <span className="review-past-range">{formatWeekRange(key)}</span>
                {r.stats && <span className="review-past-xp"><Zap size={12} /> {r.stats.xpEarned} XP</span>}
                {r.priority && <p className="review-past-priority"><Target size={12} /> {r.priority}</p>}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default WeeklyReviewPage;
