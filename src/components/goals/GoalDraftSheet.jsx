import React, { useState } from 'react';
import { X, Sparkles, Loader2, Plus, RotateCcw, Flame, ListChecks, Flag, ShieldAlert } from 'lucide-react';
import DeadlineChips from './DeadlineChips';
import { HOURS_PER_WEEK } from '../../utils/goalCoach';

/**
 * "Shape with AI": a rough goal + two optional chips → My Assistant drafts the
 * whole goal → every part is editable here, and nothing is saved until Create.
 */
export default function GoalDraftSheet({ initialText = '', now, onDraft, onCreate, onClose }) {
  const [phase, setPhase] = useState('input'); // input | loading | edit
  const [text, setText] = useState(initialText);
  const [hours, setHours] = useState(null);
  const [startingPoint, setStartingPoint] = useState('');
  const [draft, setDraft] = useState(null);
  const [includeTasks, setIncludeTasks] = useState(true);
  const [includeHabit, setIncludeHabit] = useState(true);
  const [error, setError] = useState(null);

  const ask = async () => {
    if (!text.trim()) return;
    setPhase('loading');
    setError(null);
    const res = await onDraft({ text: text.trim(), hoursPerWeek: hours, startingPoint });
    if (!res.ok) { setError(res.error); setPhase('input'); return; }
    setDraft(res.draft);
    setIncludeTasks(res.draft.tasks.length > 0);
    setIncludeHabit(!!res.draft.habit);
    setPhase('edit');
  };

  const set = (field, value) => setDraft((d) => ({ ...d, [field]: value }));
  const setListItem = (field, i, value) => set(field, draft[field].map((x, j) => (j === i ? value : x)));
  const removeListItem = (field, i) => set(field, draft[field].filter((_, j) => j !== i));

  const create = () => {
    const clean = (list) => list.map((x) => x.trim()).filter(Boolean);
    onCreate({ ...draft, title: draft.title.trim(), milestones: clean(draft.milestones), tasks: clean(draft.tasks) }, { includeTasks, includeHabit });
  };

  const isNumber = draft?.measure?.kind === 'number';

  return (
    <div className="gp-modal-overlay" onClick={onClose}>
      <div className="gp-modal gp-draft" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Shape a goal with AI">
        <div className="gp-modal-header">
          <h2 className="gp-modal-title"><Sparkles size={16} className="gp-draft-icon" /> Shape a goal</h2>
          <button type="button" className="gp-modal-close" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>

        {phase !== 'edit' ? (
          <form className="gp-modal-form" onSubmit={(e) => { e.preventDefault(); ask(); }}>
            <label className="gp-field-group">
              <span className="gp-label">What do you want? Rough is fine.</span>
              <textarea className="gp-textarea" rows={2} value={text} autoFocus maxLength={200}
                onChange={(e) => setText(e.target.value)} placeholder="e.g. get fit, launch my app, read more" />
            </label>
            <div className="gp-field-group">
              <span className="gp-label">Time you can give it <span className="gp-label-hint">(optional)</span></span>
              <div className="gp-chips">
                {HOURS_PER_WEEK.map((h) => (
                  <button key={h.id} type="button" className={`gp-chip${hours === h.hours ? ' gp-chip--on' : ''}`}
                    aria-pressed={hours === h.hours} onClick={() => setHours((v) => (v === h.hours ? null : h.hours))}>
                    {h.label}
                  </button>
                ))}
              </div>
            </div>
            <label className="gp-field-group">
              <span className="gp-label">Where are you starting from? <span className="gp-label-hint">(optional)</span></span>
              <input className="gp-text-input" value={startingPoint} maxLength={200} onChange={(e) => setStartingPoint(e.target.value)}
                placeholder="e.g. I can run 2k, I have a prototype" />
            </label>
            {error && <p className="gp-draft-error" role="alert">{error}</p>}
            <button type="submit" className="gp-submit-btn gp-draft-go" disabled={!text.trim() || phase === 'loading'}>
              {phase === 'loading' ? <><Loader2 size={15} className="gp-spin" /> Drafting your goal…</> : <><Sparkles size={15} /> Draft it</>}
            </button>
          </form>
        ) : (
          <div className="gp-modal-form">
            <label className="gp-field-group">
              <span className="gp-label">Goal</span>
              <input className="gp-text-input" value={draft.title} maxLength={140} onChange={(e) => set('title', e.target.value)} />
            </label>
            {draft.why && (
              <label className="gp-field-group">
                <span className="gp-label">Why it matters</span>
                <input className="gp-text-input" value={draft.why} maxLength={200} onChange={(e) => set('why', e.target.value)} />
              </label>
            )}
            <div className="gp-field-group">
              <span className="gp-label">Deadline</span>
              <DeadlineChips value={draft.deadline} onChange={(v) => set('deadline', v)} now={now} />
            </div>

            {isNumber ? (
              <div className="gp-field-group">
                <span className="gp-label">Measured by</span>
                <div className="gp-numeric-inputs">
                  <input type="number" min="1" className="gp-text-input gp-numeric-target-input" value={draft.measure.target}
                    onChange={(e) => set('measure', { ...draft.measure, target: Math.max(0, Math.round(Number(e.target.value) || 0)) })} aria-label="Target" />
                  <input className="gp-text-input" value={draft.measure.unit} maxLength={20} aria-label="Unit"
                    onChange={(e) => set('measure', { ...draft.measure, unit: e.target.value })} />
                </div>
              </div>
            ) : (
              <div className="gp-field-group">
                <span className="gp-label"><Flag size={12} /> Milestones <span className="gp-label-hint">(in order; the first is for this week)</span></span>
                {draft.milestones.map((m, i) => (
                  <div key={i} className="gp-draft-row">
                    <span className="gp-draft-num">{i + 1}</span>
                    <input className="gp-text-input" value={m} maxLength={90} onChange={(e) => setListItem('milestones', i, e.target.value)} aria-label={`Milestone ${i + 1}`} />
                    <button type="button" className="gp-icon-btn" onClick={() => removeListItem('milestones', i)} aria-label={`Remove milestone ${i + 1}`}><X size={14} /></button>
                  </div>
                ))}
                {draft.milestones.length < 6 && (
                  <button type="button" className="gp-woop-toggle" onClick={() => set('milestones', [...draft.milestones, ''])}><Plus size={12} /> Add a milestone</button>
                )}
              </div>
            )}

            {draft.tasks.length > 0 && (
              <div className="gp-field-group">
                <label className="gp-field-checkbox-label">
                  <input type="checkbox" checked={includeTasks} onChange={(e) => setIncludeTasks(e.target.checked)} />
                  <ListChecks size={13} /> Add to this week’s tasks
                </label>
                {includeTasks && draft.tasks.map((t, i) => (
                  <div key={i} className="gp-draft-row">
                    <input className="gp-text-input" value={t} maxLength={120} onChange={(e) => setListItem('tasks', i, e.target.value)} aria-label={`Task ${i + 1}`} />
                    <button type="button" className="gp-icon-btn" onClick={() => removeListItem('tasks', i)} aria-label={`Remove task ${i + 1}`}><X size={14} /></button>
                  </div>
                ))}
              </div>
            )}

            {draft.habit && (
              <label className="gp-field-checkbox-label">
                <input type="checkbox" checked={includeHabit} onChange={(e) => setIncludeHabit(e.target.checked)} />
                <Flame size={13} />
                {draft.habit.existingId != null
                  ? <>Link your habit <strong>{draft.habit.name}</strong></>
                  : <>Start a daily habit: <strong>{draft.habit.newName}</strong></>}
              </label>
            )}

            {(draft.obstacle || draft.ifThenPlan) && (
              <div className="gp-field-group">
                <span className="gp-label"><ShieldAlert size={12} /> What could stop you</span>
                <textarea className="gp-textarea" rows={2} value={draft.obstacle} onChange={(e) => set('obstacle', e.target.value)} aria-label="Obstacle" />
                <span className="gp-label">If it shows up, I will…</span>
                <textarea className="gp-textarea" rows={2} value={draft.ifThenPlan} onChange={(e) => set('ifThenPlan', e.target.value)} aria-label="If-then plan" />
              </div>
            )}

            <div className="gp-draft-actions">
              <button type="button" className="gp-btn" onClick={() => setPhase('input')}><RotateCcw size={14} /> Redo</button>
              <button type="button" className="gp-submit-btn" disabled={!draft.title.trim()} onClick={create}>Create goal</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
