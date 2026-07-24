import React, { useState, useMemo } from 'react';
import './WeeklyReviewPage.css';
import {
  ChevronLeft, ChevronRight, Pin, ArrowRight, Check, Bot, Construction, TrendingUp,
  CheckSquare, Target, Zap,
} from 'lucide-react';
import {
  toggleMilestone,
  toggleGoalCompleted,
  cloneGoalForward,
  GOAL_XP_BY_PERIOD,
  MILESTONE_XP,
} from '../utils/goalUtils';
import { computeWeekStats, getMondayKey, formatWeekRange, getWeekDays } from '../utils/weekStatsUtils';

const WeeklyReviewPage = ({ weeklyReviews = {}, setWeeklyReviews, xpLog = [], pomodoroSessions = [], habits = [], todos = [], logs = {}, goals = [], healthLog = {}, setGoals, onUpdateStat }) => {
  const [weekOffset, setWeekOffset] = useState(0);
  const mondayKey = getMondayKey(weekOffset);
  const isCurrentWeek = weekOffset === 0;
  const saved = weeklyReviews[mondayKey];

  const stats = useMemo(
    () => computeWeekStats(mondayKey, xpLog, pomodoroSessions, habits, todos, logs, goals, healthLog),
    [mondayKey, xpLog.length, pomodoroSessions.length, habits.length, todos.length, Object.keys(logs).length, goals, healthLog]
  );

  const weekGoals = useMemo(() => {
    const weekly = goals.filter(g => g.period === 'weekly' && g.periodKey === mondayKey);
    const pinned = weekly.filter(g => g.pinned);
    return pinned.length > 0 ? pinned : weekly;
  }, [goals, mondayKey]);

  const awardGoalXp = (goal) => {
    if (!onUpdateStat) return;
    const attrs = goal.attributes?.length ? goal.attributes : ['discipline'];
    const xpTotal = GOAL_XP_BY_PERIOD[goal.period] || GOAL_XP_BY_PERIOD.weekly;
    const xpEach = Math.floor(xpTotal / attrs.length);
    attrs.forEach(attr => onUpdateStat(attr, xpEach, { source: 'goal', label: goal.title }));
  };

  const awardMilestoneXp = (goal, milestoneText) => {
    if (!onUpdateStat) return;
    const attrs = goal.attributes?.length ? goal.attributes : ['discipline'];
    attrs.forEach(attr => onUpdateStat(attr, MILESTONE_XP, { source: 'milestone', label: milestoneText }));
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

  const handleCarryForward = (goal) => {
    const nextMondayKey = getMondayKey(1);
    const cloned = cloneGoalForward(goal, nextMondayKey);
    setGoals(prev => [cloned, ...prev.map(g => g.id === goal.id ? { ...g, carriedForwardId: cloned.id } : g)]);
  };

  const [wentWell,     setWentWell]     = useState(saved?.wentWell     || '');
  const [heldBack,     setHeldBack]     = useState(saved?.heldBack     || '');
  const [improvements, setImprovements] = useState(saved?.improvements || '');
  const [priority,     setPriority]     = useState(saved?.priority     || '');
  const [justSaved,    setJustSaved]    = useState(false);

  const [aiInsight,  setAiInsight]  = useState(null);
  const [aiLoading,  setAiLoading]  = useState(false);
  const [aiError,    setAiError]    = useState(null);

  const analyzeImprovements = async () => {
    setAiLoading(true);
    setAiError(null);
    setAiInsight(null);

    const days = getWeekDays(mondayKey);
    const allItems = [];
    for (const day of days) {
      const entry = logs[day];
      if (!entry?.improve) continue;
      for (const item of entry.improve) {
        if (item?.trim()) allItems.push(item.trim());
      }
    }

    if (allItems.length === 0) {
      setAiError('No improvement entries found for this week.');
      setAiLoading(false);
      return;
    }

    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey });

      const prompt = `Here are things I wrote as areas to improve on in my daily journal entries this week:\n\n${allItems.map((item, i) => `${i + 1}. ${item}`).join('\n')}\n\nWhat is the most common theme or pattern? Be direct and concise — 2–3 sentences max. Name the specific recurring pattern, then give one concrete action I can take.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { temperature: 0.7, maxOutputTokens: 1024 },
      });

      setAiInsight(response.text?.trim() || 'Could not generate insight.');
    } catch {
      setAiError('Failed to analyze. Check your API key.');
    }

    setAiLoading(false);
  };

  const handleSave = () => {
    setWeeklyReviews(prev => ({
      ...prev,
      [mondayKey]: { wentWell, heldBack, improvements, priority, completedAt: Date.now(), stats },
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
    setAiInsight(null);
    setAiError(null);
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
              {weekGoals.map((goal) => {
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

                    {!isComplete && isCurrentWeek && (
                      <button
                        type="button"
                        className="review-goal-carry-btn"
                        disabled={!!goal.carriedForwardId}
                        onClick={() => handleCarryForward(goal)}
                      >
                        {goal.carriedForwardId ? <><Check size={14} /> Carried to next week</> : <>Carry to next week <ArrowRight size={14} /></>}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* AI Improvement Insight */}
          <div className="review-ai-insight">
            <div className="review-ai-header">
              <span className="review-ai-title"><Bot size={16} /> AI Pattern Analysis</span>
              <button
                className="review-ai-btn"
                onClick={analyzeImprovements}
                disabled={aiLoading}
              >
                {aiLoading ? 'Analyzing…' : 'Analyze Improvements'}
              </button>
            </div>
            {!aiInsight && !aiError && !aiLoading && (
              <p className="review-ai-hint">Tap to find the most common thing you wrote in "things I can improve" across this week's daily logs.</p>
            )}
            {aiLoading && <p className="review-ai-hint">Scanning your entries…</p>}
            {aiError && <p className="review-ai-error">{aiError}</p>}
            {aiInsight && (
              <div className="review-ai-result">
                <p className="review-ai-text">
                  {aiInsight.split(/\*\*(.*?)\*\*/g).map((part, i) =>
                    i % 2 === 1 ? <strong key={i}>{part}</strong> : part
                  )}
                </p>
              </div>
            )}
          </div>

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
