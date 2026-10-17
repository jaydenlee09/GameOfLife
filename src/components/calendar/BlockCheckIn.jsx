import { useState } from 'react';
import { Check, Contrast, X, ChevronLeft } from 'lucide-react';
import { SKIP_REASONS, getBlockOutcome, blockRange } from '../../utils/calendarUtils';
import './BlockCheckIn.css';

/**
 * "Did you do it?" for one block instance: Done / Partly / Skipped, and Skipped asks
 * why in one tap. Used by the Calendar (strip + grid) and Home. A block already
 * marked partly can only be raised to done (see checkInBlock).
 */
export default function BlockCheckIn({ ev, onAnswer, dayLabel = null, className = '' }) {
  const [skipping, setSkipping] = useState(false);
  const partly = getBlockOutcome(ev)?.status === 'partly';

  return (
    <div className={`cci ${className}`}>
      <div className="cci-q">
        <span className="cci-when">{dayLabel ? `${dayLabel} · ` : ''}{blockRange(ev)}</span>
        <span className="cci-title">
          {partly ? <>Finished “{ev.title}” after all?</> : <>Did you do “{ev.title}”?</>}
        </span>
      </div>
      {skipping ? (
        <div className="cci-reasons" role="group" aria-label="Why did it slip?">
          <button type="button" className="cci-back" onClick={() => setSkipping(false)} aria-label="Back">
            <ChevronLeft size={14} />
          </button>
          <span className="cci-why">Why?</span>
          {SKIP_REASONS.map((reason) => (
            <button key={reason} type="button" className="cci-reason" onClick={() => onAnswer('skipped', reason)}>{reason}</button>
          ))}
        </div>
      ) : (
        <div className="cci-actions">
          <button type="button" className="cci-btn cci-btn--done" onClick={() => onAnswer('done')}>
            <Check size={14} strokeWidth={2.6} /> Done
          </button>
          {!partly && (
            <>
              <button type="button" className="cci-btn cci-btn--partly" onClick={() => onAnswer('partly')}>
                <Contrast size={14} strokeWidth={2.4} /> Partly
              </button>
              <button type="button" className="cci-btn cci-btn--skip" onClick={() => setSkipping(true)}>
                <X size={14} strokeWidth={2.6} /> Skipped
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
