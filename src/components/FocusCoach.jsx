import { useEffect, useRef, useState } from 'react';
import { Lightbulb, Check, Loader2, Sparkles, CalendarCheck, ListChecks } from 'lucide-react';
import { FOCUS_BLOCKERS, FOCUS_OUTCOMES } from '../utils/focusInsights';
import { isInstanceCompleted } from '../utils/calendarUtils';
import './FocusCoach.css';

/** "This session I will…": the one outcome the session is for. */
export function IntentField({ value, onChange, locked }) {
  if (locked) {
    return value ? <p className="fc-intent-locked"><span>Goal</span> {value}</p> : null;
  }
  return (
    <label className="fc-intent">
      <span>This session I will finish…</span>
      <input
        value={value}
        maxLength={160}
        placeholder="e.g. Draft the intro and first section"
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

/** Jot a stray thought into Brain Dump without leaving the session. */
export function ParkThought({ onPark, count }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [flash, setFlash] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);
  useEffect(() => {
    if (!flash) return undefined;
    const id = setTimeout(() => setFlash(false), 1500);
    return () => clearTimeout(id);
  }, [flash]);

  // Enter and the blur that follows it can both call save; only the first counts.
  const savedRef = useRef(false);
  useEffect(() => { if (open) savedRef.current = false; }, [open]);
  const save = () => {
    if (savedRef.current) return;
    savedRef.current = true;
    const trimmed = text.trim();
    if (trimmed) { onPark(trimmed); setFlash(true); }
    setText('');
    setOpen(false);
  };

  return (
    <div className="fc-park">
      {open ? (
        <input
          ref={inputRef}
          className="fc-park-input"
          value={text}
          maxLength={300}
          placeholder="Thought to deal with later… (Enter)"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') { savedRef.current = true; setText(''); setOpen(false); }
          }}
          onBlur={save}
        />
      ) : (
        <button className="fc-park-btn" onClick={() => setOpen(true)}>
          {flash ? <><Check size={13} /> Parked in Brain Dump</> : <><Lightbulb size={13} /> Park a thought{count ? ` (${count})` : ''}</>}
        </button>
      )}
    </div>
  );
}

/**
 * End-of-session debrief. Phase 1: how did it go (outcome, blockers, note), or
 * skip. Phase 2: what was earned, one-tap completes for the linked block/task,
 * and the coach's comment.
 *
 * `onSave(debrief|null)` stores the session and returns it; `onComment(session)`
 * resolves { ok, comment, error }; `onCommentSaved(id, comment)` stores the reply.
 */
export function FocusDebrief({
  intent, xpLine, linkedBlock, linkedTask, onSave, onComment, onCommentSaved, onCompleteBlock, onCompleteTask, onClose,
}) {
  // Snapshot what the session was linked to: completing the task removes it
  // from the list, and the result panel should still say what was done.
  const [block] = useState(linkedBlock);
  const [task] = useState(linkedTask);
  const [phase, setPhase] = useState('form');
  const [outcome, setOutcome] = useState(null);
  const [blockers, setBlockers] = useState([]);
  const [note, setNote] = useState('');
  const [comment, setComment] = useState({ status: 'idle' });
  const [blockXp, setBlockXp] = useState(() => (block && isInstanceCompleted(block) ? 0 : null));
  const [taskXp, setTaskXp] = useState(null);

  const toggleBlocker = (id) => setBlockers((list) => (list.includes(id) ? list.filter((b) => b !== id) : [...list, id]));

  const finish = (debrief) => {
    const session = onSave(debrief);
    setPhase('result');
    if (!session || !debrief || !onComment) return;
    setComment({ status: 'loading' });
    onComment(session).then((result) => {
      if (result.ok) {
        setComment({ status: 'done', text: result.comment });
        onCommentSaved?.(session.id, result.comment);
      } else {
        setComment({ status: 'error', text: result.error });
      }
    });
  };

  if (phase === 'form') {
    return (
      <div className="fc-debrief">
        <h2 className="fc-title">Session complete</h2>
        {intent && <p className="fc-sub">You set out to: <strong>{intent}</strong></p>}
        <p className="fc-label">Did you get it done?</p>
        <div className="fc-chips">
          {FOCUS_OUTCOMES.map((o) => (
            <button key={o.id} className={`fc-chip fc-chip--${o.id} ${outcome === o.id ? 'fc-chip--on' : ''}`} onClick={() => setOutcome(o.id)}>{o.label}</button>
          ))}
        </div>
        {outcome && outcome !== 'done' && (
          <>
            <p className="fc-label">What got in the way?</p>
            <div className="fc-chips">
              {FOCUS_BLOCKERS.map((b) => (
                <button key={b.id} className={`fc-chip ${blockers.includes(b.id) ? 'fc-chip--on' : ''}`} onClick={() => toggleBlocker(b.id)}>{b.label}</button>
              ))}
            </div>
          </>
        )}
        {outcome && (
          <input
            className="fc-note"
            value={note}
            maxLength={200}
            placeholder="Anything else? (optional)"
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
          />
        )}
        <div className="fc-actions">
          <button className="fc-btn fc-btn--ghost" onClick={() => finish(null)}>Skip</button>
          <button
            className="fc-btn fc-btn--primary"
            disabled={!outcome}
            onClick={() => finish({ outcome, blockers: outcome === 'done' ? [] : blockers, note: note.trim() })}
          >
            Save debrief
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fc-debrief">
      <h2 className="fc-title">Nice work</h2>
      <p className="fc-xp">{xpLine}</p>

      {(block || task) && (
        <div className="fc-links">
          {block && (
            blockXp !== null
              ? <p className="fc-linked-done"><Check size={14} /> Block completed{blockXp ? ` (+${blockXp} XP)` : ''}</p>
              : <button className="fc-btn fc-btn--link" onClick={() => setBlockXp(onCompleteBlock() ?? 0)}><CalendarCheck size={14} /> Complete "{block.title}"</button>
          )}
          {task && (
            taskXp !== null
              ? <p className="fc-linked-done"><Check size={14} /> Task done{taskXp ? ` (+${taskXp} XP)` : ''}</p>
              : <button className="fc-btn fc-btn--link" onClick={() => setTaskXp(onCompleteTask() ?? 0)}><ListChecks size={14} /> Mark "{task.text}" done</button>
          )}
        </div>
      )}

      {comment.status !== 'idle' && (
        <div className={`fc-comment fc-comment--${comment.status}`}>
          <Sparkles size={14} />
          {comment.status === 'loading' ? <span><Loader2 size={13} className="fc-spin" /> My Assistant is reading your debrief…</span> : <span>{comment.text}</span>}
        </div>
      )}

      <div className="fc-actions">
        <button className="fc-btn fc-btn--primary" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}
