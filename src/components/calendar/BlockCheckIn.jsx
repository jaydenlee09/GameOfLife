import { useState } from 'react';
import { Check, Contrast, X, ChevronLeft, PhoneOff } from 'lucide-react';
import { SKIP_REASONS, NOPHONE_SLIP_REASONS, getBlockOutcome, blockRange } from '../../utils/calendarUtils';
import './BlockCheckIn.css';

/**
 * "Did you do it?" for one block instance: Done / Partly / Skipped, and Skipped asks
 * why in one tap. Used by the Calendar (strip + grid) and Home. A block already
 * marked partly can only be raised to done (see checkInBlock). A no-phone block
 * (`ev._noPhone`) asks the same three ways, worded as stayed off / mostly / slipped.
 */
export default function BlockCheckIn({ ev, onAnswer, dayLabel = null, className = '' }) {
  const [skipping, setSkipping] = useState(false);
  const partly = getBlockOutcome(ev)?.status === 'partly';
  const np = !!ev._noPhone;
  const reasons = np ? NOPHONE_SLIP_REASONS : SKIP_REASONS;

  return (
    <div className={`cci ${className}`}>
      <div className="cci-q">
        <span className="cci-when">
          {dayLabel ? `${dayLabel} · ` : ''}{np && ev.title !== 'No Phone' ? `${ev.title} · ` : ''}{blockRange(ev)}
        </span>
        <span className="cci-title">
          {np ? (
            <><PhoneOff size={13} strokeWidth={2.5} className="cci-title-icon" /> {partly ? 'Stayed off your phone after all?' : 'Did you stay off your phone?'}</>
          ) : partly ? <>Finished “{ev.title}” after all?</> : <>Did you do “{ev.title}”?</>}
        </span>
      </div>
      {skipping ? (
        <div className="cci-reasons" role="group" aria-label={np ? 'Why did you pick it up?' : 'Why did it slip?'}>
          <button type="button" className="cci-back" onClick={() => setSkipping(false)} aria-label="Back">
            <ChevronLeft size={14} />
          </button>
          <span className="cci-why">Why?</span>
          {reasons.map((reason) => (
            <button key={reason} type="button" className="cci-reason" onClick={() => onAnswer('skipped', reason)}>{reason}</button>
          ))}
        </div>
      ) : (
        <div className="cci-actions">
          <button type="button" className="cci-btn cci-btn--done" onClick={() => onAnswer('done')}>
            <Check size={14} strokeWidth={2.6} /> {np ? 'Stayed off' : 'Done'}
          </button>
          {!partly && (
            <>
              <button type="button" className="cci-btn cci-btn--partly" onClick={() => onAnswer('partly')}>
                <Contrast size={14} strokeWidth={2.4} /> {np ? 'Mostly' : 'Partly'}
              </button>
              <button type="button" className="cci-btn cci-btn--skip" onClick={() => setSkipping(true)}>
                <X size={14} strokeWidth={2.6} /> {np ? 'Slipped' : 'Skipped'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
