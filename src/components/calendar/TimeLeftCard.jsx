import { Hourglass } from 'lucide-react';
import { getTimeLeft } from '../../utils/calendarSidebar';
import './TimeLeftCard.css';

const fmtMins = (mins) => {
  const h = Math.floor(mins / 60), m = mins % 60;
  return h && m ? `${h}h ${m}m` : h ? `${h}h` : `${m}m`;
};
const fmtClock = (mins) => {
  const h = Math.floor(mins / 60) % 24, m = mins % 60;
  const hour = h % 12 || 12;
  return `${hour}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`;
};

/**
 * "Time left today": free time between now and bedtime (the planner's hours, the
 * same window Plan my day fills), how much of it is booked, and the next free gap.
 */
export default function TimeLeftCard({ planner, calendarEvents, nowMs }) {
  const t = getTimeLeft({ planner, calendarEvents, now: new Date(nowMs) });
  const bed = fmtClock(t.end);
  const freePct = t.windowMins ? Math.round((t.freeMins / t.windowMins) * 100) : 0;

  return (
    <section className="ctl" aria-label="Time left today" title="Counts your waking hours from Plan my day">
      <div className="ctl-head">
        <Hourglass size={12} aria-hidden="true" />
        <span className="ctl-label">Time left today</span>
      </div>
      {t.ended ? (
        <p className="ctl-sub">Past {bed}. Today&rsquo;s window is closed.</p>
      ) : (
        <>
          <p className="ctl-big">
            {fmtMins(t.freeMins)} <span className="ctl-big-unit">free before {bed}</span>
          </p>
          <div
            className="ctl-bar"
            role="img"
            aria-label={`${fmtMins(t.bookedMins)} booked, ${fmtMins(t.freeMins)} free`}
          >
            <span className="ctl-bar-booked" style={{ width: `${100 - freePct}%` }} />
          </div>
          <p className="ctl-sub">
            <span className="ctl-booked-key" /> {fmtMins(t.bookedMins)} booked
          </p>
          <p className={`ctl-next${t.nextGap?.isNow ? ' ctl-next--now' : ''}`}>
            {!t.nextGap
              ? 'No free time left today.'
              : t.nextGap.isNow
                ? `Free now until ${fmtClock(t.nextGap.end)}`
                : `Next free ${fmtClock(t.nextGap.start)}–${fmtClock(t.nextGap.end)}`}
          </p>
        </>
      )}
    </section>
  );
}
