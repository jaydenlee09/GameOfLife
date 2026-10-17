import { CalendarCheck, Clock, Play, Sparkles } from 'lucide-react';
import { getPlanDay, getPendingCheckIns, blockEndMs, blockStartMs, blockRange, fmtRemaining } from '../../utils/calendarUtils';
import { scoreWeights } from '../../utils/scoreUtils';
import BlockCheckIn from './BlockCheckIn';
import './TodayStrip.css';

const fmtMins = (mins) => {
  const h = Math.floor(mins / 60), m = mins % 60;
  return h && m ? `${h}h ${m}m` : h ? `${h}h` : `${m}m`;
};

/**
 * Where today's plan stands, whatever day/week/month the Calendar is showing:
 * time planned, blocks done, what's on now, and the oldest block still waiting for
 * a check-in (today's, or yesterday's while it still counts).
 */
export default function TodayStrip({ calendarEvents, nowMs, onCheckIn, onStartFocus, onPlanDay }) {
  const now = new Date(nowMs);
  const day = getPlanDay(calendarEvents, now);
  const pending = getPendingCheckIns(calendarEvents, now);
  const first = pending[0] || null;
  const { kept, current, next } = day;
  const planWeight = scoreWeights(day.dateKey).plan || 0;

  return (
    <section className="cts" aria-label="Today's plan">
      <div className="cts-row">
        <div className="cts-stats">
          <span className="cts-day">Today</span>
          {kept.total ? (
            <>
              <span className="cts-stat"><Clock size={12} /> {fmtMins(day.plannedMins)} planned</span>
              <span className="cts-stat cts-stat--kept">
                <CalendarCheck size={12} /> {kept.done}/{kept.total} done{kept.partly ? ` · ${kept.partly} partly` : ''}
              </span>
              {day.missed > 0 && <span className="cts-stat cts-stat--missed">{day.missed} missed</span>}
              {kept.skipped > 0 && <span className="cts-stat cts-stat--skipped">{kept.skipped} skipped</span>}
            </>
          ) : (
            <span className="cts-empty">
              Nothing planned yet{planWeight ? `. Keeping your plan is ${planWeight}% of today’s score.` : '.'}
            </span>
          )}
        </div>

        <div className="cts-now">
          {current ? (
            <>
              <span className="cts-now-label cts-now-label--live">Now</span>
              <span className="cts-now-title">{current.title}</span>
              <span className="cts-now-meta">{fmtRemaining(blockEndMs(current), nowMs)} left</span>
              {onStartFocus && (
                <button type="button" className="cts-btn cts-btn--accent" onClick={() => onStartFocus(current)}>
                  <Play size={12} strokeWidth={2.6} /> Start focus
                </button>
              )}
            </>
          ) : next ? (
            <>
              <span className="cts-now-label">Next</span>
              <span className="cts-now-title">{next.title}</span>
              <span className="cts-now-meta">{blockRange(next)} · in {fmtRemaining(blockStartMs(next), nowMs)}</span>
            </>
          ) : !kept.total && onPlanDay ? (
            <button type="button" className="cts-btn cts-btn--accent" onClick={() => onPlanDay(day.dateKey)}>
              <Sparkles size={12} strokeWidth={2.6} /> Plan my day
            </button>
          ) : kept.total ? (
            <span className="cts-now-meta">Nothing left on today’s plan.</span>
          ) : null}
        </div>
      </div>

      {first && (
        <div className="cts-checkin">
          <BlockCheckIn
            key={`${first.id}-${first._instanceDate}`}
            ev={first}
            dayLabel={first._instanceDate !== day.dateKey ? 'Yesterday' : 'Ended'}
            onAnswer={(status, reason) => onCheckIn(first, status, reason)}
          />
          {pending.length > 1 && <span className="cts-more">+{pending.length - 1} more to check in</span>}
        </div>
      )}
    </section>
  );
}
