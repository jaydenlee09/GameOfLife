import { useState } from 'react';
import { Compass, Pencil } from 'lucide-react';

// The user's North Star: who they're becoming. Goals are the steps; this is the
// direction. My Assistant reads it first and measures its coaching against it.
export default function NorthStarCard({ northStar, onSave }) {
  const hasVision = !!northStar?.vision?.trim();
  const [editing, setEditing] = useState(false);
  const [vision, setVision] = useState('');
  const [identity, setIdentity] = useState('');

  const startEdit = () => {
    setVision(northStar?.vision || '');
    setIdentity((northStar?.identity || []).join('\n'));
    setEditing(true);
  };

  const save = (e) => {
    e.preventDefault();
    const trimmed = vision.trim();
    if (!trimmed) return;
    onSave({
      vision: trimmed,
      identity: identity.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 5),
      updatedAt: Date.now(),
    });
    setEditing(false);
  };

  if (editing) {
    return (
      <form className="gp-northstar gp-northstar--editing" onSubmit={save}>
        <div className="gp-northstar-label"><Compass size={14} /> North Star</div>
        <label className="gp-northstar-field">
          <span>Who are you becoming?</span>
          <textarea
            value={vision}
            onChange={(e) => setVision(e.target.value)}
            placeholder="I'm becoming someone who…"
            rows={2}
            autoFocus
          />
        </label>
        <label className="gp-northstar-field">
          <span>Identity statements (one per line, up to 5)</span>
          <textarea
            value={identity}
            onChange={(e) => setIdentity(e.target.value)}
            placeholder={'I train 5 days a week.\nI protect my mornings for deep work.'}
            rows={3}
          />
        </label>
        <div className="gp-northstar-actions">
          <button type="button" className="gp-northstar-btn" onClick={() => setEditing(false)}>Cancel</button>
          <button type="submit" className="gp-northstar-btn gp-northstar-btn--primary" disabled={!vision.trim()}>Save</button>
        </div>
      </form>
    );
  }

  return (
    <div className={`gp-northstar ${hasVision ? '' : 'gp-northstar--empty'}`}>
      <div className="gp-northstar-head">
        <div className="gp-northstar-label"><Compass size={14} /> North Star</div>
        <button className="gp-northstar-edit" onClick={startEdit} aria-label={hasVision ? 'Edit North Star' : 'Set North Star'}>
          <Pencil size={13} /> {hasVision ? 'Edit' : 'Set it'}
        </button>
      </div>
      {hasVision ? (
        <>
          <p className="gp-northstar-vision">{northStar.vision}</p>
          {northStar.identity?.length > 0 && (
            <ul className="gp-northstar-identity">
              {northStar.identity.map((line) => <li key={line}>{line}</li>)}
            </ul>
          )}
        </>
      ) : (
        <p className="gp-northstar-placeholder">
          Who are you becoming? Write it down, and every goal here and every suggestion from My Assistant gets measured against it.
        </p>
      )}
    </div>
  );
}
