import React, { useMemo, useState } from 'react';
import './WeeklyReviewPage.css';
import { Zap, Target, FlaskConical, BookOpenCheck, Check, ListChecks, CalendarRange, ArrowLeft, Construction, Trophy, Lightbulb } from 'lucide-react';
import WeeklyResetFlow, { PlanSummary, TickDots } from './weeklyReview/WeeklyResetFlow';
import { Block } from './dailyLog/CloseDayFlow';
import {
  getReviewWeek, getPlanResults, getPlaybook, nextWeekOf, formatWeekRange, syncOutcomeTasks,
} from '../utils/weeklyReset';
import { getMondayOf } from '../utils/statsInsights';
import { computeWeekStats, getWeekDays } from '../utils/weekStatsUtils';

/** A past week, read-only. Older reviews have free-text fields instead of lists. */
const ReviewSummary = ({ weekKey, review }) => {
  if (!review) return <p className="review-sidebar-empty wr-empty">No review for this week.</p>;
  const list = (items, legacy) => {
    const rows = (items || []).filter((x) => x?.trim());
    if (rows.length) return <ul className="wr-plan-list">{rows.map((x, i) => <li key={i}>{x}</li>)}</ul>;
    return legacy?.trim() ? <p className="cd-quote cd-quote--small wr-prewrap">{legacy}</p> : null;
  };
  const wins = list(review.wins, review.wentWell);
  const blockers = list(review.blockers, review.heldBack);
  const lessons = list(review.lessons, review.improvements);
  return (
    <div className="cd wr">
      <header className="cd-head">
        <span className="cd-eyebrow"><CalendarRange size={14} /> Weekly Review · {formatWeekRange(weekKey)}</span>
      </header>
      <div className="wr-body">
        {review.draft?.headline && <p className="cd-quote cd-quote--small">{review.draft.headline}</p>}
        {wins && <Block Icon={Trophy} title="Wins">{wins}</Block>}
        {blockers && <Block Icon={Construction} title="What held you back">{blockers}</Block>}
        {lessons && <Block Icon={Lightbulb} title={review.lessons?.length ? 'Lessons' : 'To improve'}>{lessons}</Block>}
        <PlanSummary review={review} title={`Plan for ${formatWeekRange(nextWeekOf(weekKey))}`} />
        {!review.completedAt && <p className="review-sidebar-empty">This Reset was never locked in.</p>}
      </div>
    </div>
  );
};

/** The plan running this week, with live progress. */
const ThisWeekCard = ({ plan }) => (
  <section className="review-side-card">
    <h3 className="review-sidebar-title"><Target size={13} /> This week</h3>
    {plan.priority && <p className="review-side-priority">{plan.priority}</p>}
    {plan.outcomes.length > 0 && (
      <ul className="review-side-outcomes">
        {plan.outcomes.map((o) => (
          <li key={o.index} className={o.done ? 'is-done' : ''}>
            <span className="cd-check">{o.done && <Check size={11} strokeWidth={3} />}</span> {o.text}
          </li>
        ))}
      </ul>
    )}
    {plan.experiment && (
      <div className="review-side-exp">
        <p><FlaskConical size={13} /> {plan.experiment.text}</p>
        <TickDots days={getWeekDays(plan.week).map((dateKey) => plan.experiment.days.find((d) => d.dateKey === dateKey) || { dateKey, done: null })} />
      </div>
    )}
  </section>
);

const WeeklyReviewPage = ({
  weeklyReviews = {}, setWeeklyReviews, todayKey, xpLog = [], xpSeries = [], pomodoroSessions = [], habits = [], todos = [], logs = {},
  goals = [], healthLog = {}, calendarEvents = [], calendarDayEvents = {}, commitmentArchive = [], logReviews = {},
  setGoals, setTodos, onLogActivity, onRecalibrate, onDraft, onNavigate,
}) => {
  const reviewKey = getReviewWeek(todayKey);
  const [viewKey, setViewKey] = useState(null);
  const showing = viewKey && viewKey !== reviewKey ? viewKey : reviewKey;
  const review = weeklyReviews[reviewKey] || {};

  const data = useMemo(
    () => ({ habits, xpLog, logs, commitmentArchive, healthLog, calendarEvents, pomodoroSessions, todos, goals }),
    [habits, xpLog, logs, commitmentArchive, healthLog, calendarEvents, pomodoroSessions, todos, goals]
  );
  const xpByDay = useMemo(() => Object.fromEntries(xpSeries.map((d) => [d.dateKey, d.xp])), [xpSeries]);
  const weekXp = (monday) => getWeekDays(monday).reduce((sum, d) => sum + (xpByDay[d] || 0), 0);

  const thisWeekPlan = useMemo(() => getPlanResults(data, weeklyReviews, getMondayOf(todayKey), todayKey), [data, weeklyReviews, todayKey]);
  const playbook = useMemo(() => getPlaybook(weeklyReviews), [weeklyReviews]);

  /** Patches this Reset's review; `fn(week)` returns the fields to change. */
  const updateReview = (fn) => setWeeklyReviews((prev) => {
    const week = prev[reviewKey] || {};
    return { ...prev, [reviewKey]: { ...week, ...fn(week) } };
  });

  const lock = (patch) => {
    // Same `now` both times, so the task ids saved on the review match the tasks added.
    const now = Date.now();
    const args = { outcomes: review.outcomes, planWeek: nextWeekOf(reviewKey), addTasks: review.outcomeTasks !== false, now, todayKey };
    const { outcomes } = syncOutcomeTasks({ ...args, todos });
    setTodos((prev) => syncOutcomeTasks({ ...args, todos: prev }).todos);
    const stats = computeWeekStats(reviewKey, xpLog, pomodoroSessions, habits, todos, logs, goals, healthLog, xpByDay);
    updateReview(() => ({ ...patch, outcomes, completedAt: now, stats }));
  };

  const isLate = !review.completedAt && reviewKey !== getMondayOf(todayKey);
  const pastKeys = Object.keys(weeklyReviews).filter((k) => k !== reviewKey).sort().reverse().slice(0, 8);

  return (
    <div className="review-page">
      <h1 className="section-page-title">Weekly Review</h1>
      <div className="review-layout">
        <div className="review-main">
          {showing !== reviewKey ? (
            <>
              <button type="button" className="cd-btn cd-btn--ghost review-back" onClick={() => setViewKey(null)}>
                <ArrowLeft size={15} /> Back to this week’s Reset
              </button>
              <ReviewSummary weekKey={showing} review={weeklyReviews[showing]} />
            </>
          ) : (
            <>
              {isLate && (
                <p className="review-late">You missed Sunday’s Reset. Do it now and the plan covers the rest of this week.</p>
              )}
              <WeeklyResetFlow
                key={reviewKey}
                reviewKey={reviewKey}
                todayKey={todayKey}
                review={review}
                updateReview={updateReview}
                weeklyReviews={weeklyReviews}
                data={data}
                logReviews={logReviews}
                calendarDayEvents={calendarDayEvents}
                goalProps={{ goals, setGoals, todos, setTodos, habits, pomodoroSessions, calendarEvents, onLogActivity, onRecalibrate }}
                onDraft={onDraft}
                onLock={lock}
                onNavigate={onNavigate}
              />
            </>
          )}
        </div>

        <aside className="review-sidebar">
          {thisWeekPlan && <ThisWeekCard plan={thisWeekPlan} />}

          <section className="review-side-card">
            <h3 className="review-sidebar-title"><BookOpenCheck size={13} /> Your Playbook</h3>
            {playbook.length ? (
              <ul className="review-playbook">
                {playbook.map((r) => <li key={r.keptOn}><Check size={13} /> <span>{r.text}</span></li>)}
              </ul>
            ) : (
              <p className="review-sidebar-empty">Each week you try one experiment. The ones you keep become your rules and live here.</p>
            )}
          </section>

          <h3 className="review-sidebar-title review-sidebar-title--list">Past reviews</h3>
          {pastKeys.length === 0 ? (
            <p className="review-sidebar-empty">Your past weeks show up here.</p>
          ) : pastKeys.map((key) => {
            const r = weeklyReviews[key];
            return (
              <button type="button" key={key} className={`review-past-item ${key === showing ? 'active' : ''}`} onClick={() => setViewKey(key)}>
                <span className="review-past-range">{formatWeekRange(key)}</span>
                <span className="review-past-xp"><Zap size={12} /> {weekXp(key)} XP</span>
                {r.priority && <span className="review-past-priority"><ListChecks size={12} /> {r.priority}</span>}
              </button>
            );
          })}
        </aside>
      </div>
    </div>
  );
};

export default WeeklyReviewPage;
