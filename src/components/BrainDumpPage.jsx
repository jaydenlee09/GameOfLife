import { useEffect, useRef, useState } from 'react';
import './BrainDumpPage.css';

const makeId = () => `note_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
const makeConnId = () => `conn_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;

const MAX_TEXTAREA_HEIGHT = 240;
const EDGES = ['top', 'right', 'bottom', 'left'];
const DEFAULT_SIZE = { width: 200, height: 44 };
const SNAP_THRESHOLD_PX = 28;
const MAX_TILT_DEG = 14;
const TILT_GAIN = 8; // degrees per (px/ms) of horizontal drag velocity
const TILT_SMOOTHING = 0.35;
const SETTLE_MS = 400; // must match .bd-note--settling's transition duration in BrainDumpPage.css

const autoResize = (el) => {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
};

const getEdgeOffsetFromCenter = (size, edge) => {
  const hw = size.width / 2;
  const hh = size.height / 2;
  switch (edge) {
    case 'top': return { x: 0, y: -hh };
    case 'bottom': return { x: 0, y: hh };
    case 'left': return { x: -hw, y: 0 };
    case 'right': return { x: hw, y: 0 };
    default: return { x: 0, y: 0 };
  }
};

const rotatePoint = ({ x, y }, angleDeg) => {
  if (!angleDeg) return { x, y };
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: x * cos - y * sin, y: x * sin + y * cos };
};

// dx/dy/tilt describe a live drag offset applied to `note` (0/0/0 when at rest).
const getEdgePoint = (note, size, edge, tilt = 0, dx = 0, dy = 0) => {
  const center = { x: note.x + size.width / 2 + dx, y: note.y + size.height / 2 + dy };
  const offset = rotatePoint(getEdgeOffsetFromCenter(size, edge), tilt);
  return { x: center.x + offset.x, y: center.y + offset.y };
};

const computeConnectedComponent = (startId, connections) => {
  const adjacency = new Map();
  connections.forEach(c => {
    if (!adjacency.has(c.fromNoteId)) adjacency.set(c.fromNoteId, []);
    if (!adjacency.has(c.toNoteId)) adjacency.set(c.toNoteId, []);
    adjacency.get(c.fromNoteId).push(c.toNoteId);
    adjacency.get(c.toNoteId).push(c.fromNoteId);
  });
  const visited = new Set([startId]);
  const queue = [startId];
  while (queue.length) {
    const current = queue.shift();
    (adjacency.get(current) || []).forEach(neighbor => {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    });
  }
  return visited;
};

const edgeKey = (noteId, edge) => `${noteId}:${edge}`;
const canonicalConnectionKey = (fromNoteId, fromEdge, toNoteId, toEdge) => {
  const a = edgeKey(fromNoteId, fromEdge);
  const b = edgeKey(toNoteId, toEdge);
  return a < b ? `${a}|${b}` : `${b}|${a}`;
};

const BrainDumpPage = ({ brainDumpNotes = [], setBrainDumpNotes, brainDumpConnections = [], setBrainDumpConnections }) => {
  const canvasRef = useRef(null);
  const dragRef = useRef(null);
  const connectDragRef = useRef(null);
  const noteElRefs = useRef({});
  const registerCallbacksRef = useRef({});
  const handleElRefs = useRef({});
  const connLineElRefs = useRef({});
  const previewLineRef = useRef(null);
  const resizeObserverRef = useRef(null);

  const [sizes, setSizes] = useState({});
  const [draftNote, setDraftNote] = useState(null); // { x, y } — not yet committed
  const [draftText, setDraftText] = useState('');
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      setSizes(prev => {
        let changed = false;
        const next = { ...prev };
        entries.forEach(entry => {
          const id = entry.target.dataset.noteId;
          if (!id) return;
          // entry.contentRect excludes padding/border; measure the border box
          // directly so this matches the synchronous getBoundingClientRect()
          // measurement taken when the note first mounts.
          const { width, height } = entry.target.getBoundingClientRect();
          const existing = next[id];
          if (!existing || existing.width !== width || existing.height !== height) {
            next[id] = { width, height };
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    });
    resizeObserverRef.current = observer;
    return () => observer.disconnect();
  }, []);

  const getSize = (id) => sizes[id] || DEFAULT_SIZE;

  const getNoteElRegistrar = (id) => {
    if (!registerCallbacksRef.current[id]) {
      registerCallbacksRef.current[id] = (el) => {
        if (el) {
          noteElRefs.current[id] = el;
          el.dataset.noteId = id;
          const rect = el.getBoundingClientRect();
          setSizes(prev => {
            const existing = prev[id];
            if (existing && existing.width === rect.width && existing.height === rect.height) return prev;
            return { ...prev, [id]: { width: rect.width, height: rect.height } };
          });
          resizeObserverRef.current?.observe(el);
        } else {
          const prevEl = noteElRefs.current[id];
          if (prevEl) resizeObserverRef.current?.unobserve(prevEl);
          delete noteElRefs.current[id];
        }
      };
    }
    return registerCallbacksRef.current[id];
  };

  const registerHandleEl = (noteId, edge) => (el) => {
    if (!handleElRefs.current[noteId]) handleElRefs.current[noteId] = {};
    if (el) handleElRefs.current[noteId][edge] = el;
    else delete handleElRefs.current[noteId][edge];
  };

  const registerConnLine = (connId, part) => (el) => {
    if (!connLineElRefs.current[connId]) connLineElRefs.current[connId] = {};
    if (el) connLineElRefs.current[connId][part] = el;
    else delete connLineElRefs.current[connId][part];
  };

  const notesById = new Map(brainDumpNotes.map(n => [n.id, n]));
  const validConnections = brainDumpConnections.filter(
    c => notesById.has(c.fromNoteId) && notesById.has(c.toNoteId)
  );

  const handleCanvasClick = (e) => {
    if (e.target !== e.currentTarget) return; // click landed on a note, not empty space
    if (draftNote) return;
    const rect = canvasRef.current.getBoundingClientRect();
    setDraftNote({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setDraftText('');
  };

  const commitDraft = () => {
    const trimmed = draftText.trim();
    if (trimmed) {
      const now = Date.now();
      setBrainDumpNotes(prev => [
        ...prev,
        { id: makeId(), text: trimmed, x: draftNote.x, y: draftNote.y, createdAt: now, updatedAt: now },
      ]);
    }
    setDraftNote(null);
    setDraftText('');
  };

  const startEditing = (note) => {
    setDraftText(note.text);
    setEditingId(note.id);
  };

  const commitEdit = (id) => {
    const trimmed = draftText.trim();
    if (!trimmed) {
      setBrainDumpNotes(prev => prev.filter(n => n.id !== id));
      setBrainDumpConnections(prev => prev.filter(c => c.fromNoteId !== id && c.toNoteId !== id));
    } else {
      setBrainDumpNotes(prev => prev.map(n => (n.id === id ? { ...n, text: trimmed, updatedAt: Date.now() } : n)));
    }
    setEditingId(null);
    setDraftText('');
  };

  const deleteNote = (id, e) => {
    e.stopPropagation();
    setBrainDumpNotes(prev => prev.filter(n => n.id !== id));
    setBrainDumpConnections(prev => prev.filter(c => c.fromNoteId !== id && c.toNoteId !== id));
    delete registerCallbacksRef.current[id];
    setSizes(prev => {
      if (!(id in prev)) return prev;
      const { [id]: _removed, ...rest } = prev;
      return rest;
    });
  };

  const handleDeleteConnection = (connId, e) => {
    e.stopPropagation();
    setBrainDumpConnections(prev => prev.filter(c => c.id !== connId));
  };

  const handleNotePointerDown = (e, note) => {
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const groupIds = computeConnectedComponent(note.id, validConnections);
    const group = [...groupIds]
      .map(id => {
        const n = notesById.get(id);
        return n ? { id, el: noteElRefs.current[id], origX: n.x, origY: n.y } : null;
      })
      .filter(Boolean);
    const lines = validConnections.filter(c => groupIds.has(c.fromNoteId) && groupIds.has(c.toNoteId));

    dragRef.current = {
      id: note.id,
      el,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      group,
      lines,
      lastX: e.clientX,
      lastY: e.clientY,
      lastT: e.timeStamp,
      angle: 0,
    };
  };

  const updateConnectionLineDom = (conn, dx, dy, angle) => {
    const refs = connLineElRefs.current[conn.id];
    if (!refs) return;
    const fromNote = notesById.get(conn.fromNoteId);
    const toNote = notesById.get(conn.toNoteId);
    if (!fromNote || !toNote) return;
    const p1 = getEdgePoint(fromNote, getSize(conn.fromNoteId), conn.fromEdge, angle, dx, dy);
    const p2 = getEdgePoint(toNote, getSize(conn.toNoteId), conn.toEdge, angle, dx, dy);
    [refs.visible, refs.hit].forEach(line => {
      if (!line) return;
      line.setAttribute('x1', p1.x);
      line.setAttribute('y1', p1.y);
      line.setAttribute('x2', p2.x);
      line.setAttribute('y2', p2.y);
    });
    if (refs.deleteGroup) {
      refs.deleteGroup.setAttribute('transform', `translate(${(p1.x + p2.x) / 2}, ${(p1.y + p2.y) / 2})`);
    }
  };

  const handleNotePointerMove = (e, note) => {
    const d = dragRef.current;
    if (!d || d.id !== note.id) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) > 4) {
      d.moved = true;
      d.group.forEach(g => g.el?.classList.add('bd-note--dragging'));
    }
    if (!d.moved) return;

    const dt = e.timeStamp - d.lastT;
    if (dt > 0) {
      const vx = (e.clientX - d.lastX) / dt;
      const target = Math.max(-MAX_TILT_DEG, Math.min(MAX_TILT_DEG, vx * TILT_GAIN));
      d.angle += (target - d.angle) * TILT_SMOOTHING;
    }
    d.lastX = e.clientX;
    d.lastY = e.clientY;
    d.lastT = e.timeStamp;

    const transform = `translate3d(${dx}px, ${dy}px, 0) rotate(${d.angle}deg)`;
    d.group.forEach(g => { if (g.el) g.el.style.transform = transform; });
    d.lines.forEach(conn => updateConnectionLineDom(conn, dx, dy, d.angle));
  };

  const handleNotePointerUp = (e, note) => {
    const d = dragRef.current;
    if (!d || d.id !== note.id) return;
    d.el.releasePointerCapture(d.pointerId);

    if (d.moved) {
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      const finalAngle = d.angle;

      d.group.forEach(g => {
        if (!g.el) return;
        const el = g.el;
        el.classList.remove('bd-note--dragging');
        el.style.transform = `translate3d(0px, 0px, 0) rotate(${finalAngle}deg)`;
        el.classList.add('bd-note--settling');
        void el.offsetHeight; // force reflow so the next transform write starts a new transition
        el.style.transform = 'translate3d(0px, 0px, 0) rotate(0deg)';

        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          el.classList.remove('bd-note--settling');
          el.style.transform = '';
          el.removeEventListener('transitionend', onTransitionEnd);
        };
        const onTransitionEnd = (ev) => {
          if (ev.target === el && ev.propertyName === 'transform') finish();
        };
        el.addEventListener('transitionend', onTransitionEnd);
        setTimeout(finish, SETTLE_MS + 100);
      });

      setBrainDumpNotes(prev =>
        prev.map(n => {
          const groupEntry = d.group.find(g => g.id === n.id);
          if (!groupEntry) return n;
          return { ...n, x: Math.max(0, groupEntry.origX + dx), y: Math.max(0, groupEntry.origY + dy), updatedAt: Date.now() };
        })
      );
    } else {
      startEditing(note);
    }
    dragRef.current = null;
  };

  const updatePreviewLine = (e) => {
    const d = connectDragRef.current;
    if (!d || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const pointerX = e.clientX - rect.left;
    const pointerY = e.clientY - rect.top;

    const sourceNote = notesById.get(d.sourceNoteId);
    if (!sourceNote) return;
    const p1 = getEdgePoint(sourceNote, getSize(d.sourceNoteId), d.sourceEdge);

    let nearest = null;
    let nearestDist = Infinity;
    brainDumpNotes.forEach(n => {
      if (n.id === d.sourceNoteId) return;
      const size = getSize(n.id);
      EDGES.forEach(edge => {
        const p = getEdgePoint(n, size, edge);
        const dist = Math.hypot(p.x - pointerX, p.y - pointerY);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearest = { noteId: n.id, edge, point: p };
        }
      });
    });

    let endPoint = { x: pointerX, y: pointerY };
    let newTarget = null;
    if (nearest && nearestDist <= SNAP_THRESHOLD_PX) {
      endPoint = nearest.point;
      newTarget = { noteId: nearest.noteId, edge: nearest.edge };
    }

    if (d.targetHandleEl && (!newTarget || d.targetNoteId !== newTarget.noteId || d.targetEdge !== newTarget.edge)) {
      d.targetHandleEl.classList.remove('bd-note-handle--target');
      d.targetHandleEl = null;
    }
    if (newTarget && !d.targetHandleEl) {
      const el = handleElRefs.current[newTarget.noteId]?.[newTarget.edge];
      if (el) {
        el.classList.add('bd-note-handle--target');
        d.targetHandleEl = el;
      }
    }
    d.targetNoteId = newTarget?.noteId ?? null;
    d.targetEdge = newTarget?.edge ?? null;

    if (previewLineRef.current) {
      previewLineRef.current.setAttribute('x1', p1.x);
      previewLineRef.current.setAttribute('y1', p1.y);
      previewLineRef.current.setAttribute('x2', endPoint.x);
      previewLineRef.current.setAttribute('y2', endPoint.y);
    }
  };

  const handleHandlePointerDown = (e, note, edge) => {
    e.stopPropagation();
    const handleEl = e.currentTarget;
    handleEl.setPointerCapture(e.pointerId);
    connectDragRef.current = {
      sourceNoteId: note.id,
      sourceEdge: edge,
      pointerId: e.pointerId,
      targetNoteId: null,
      targetEdge: null,
      targetHandleEl: null,
    };
    if (previewLineRef.current) previewLineRef.current.style.display = '';
    updatePreviewLine(e);
  };

  const handleHandlePointerMove = (e) => {
    if (!connectDragRef.current) return;
    updatePreviewLine(e);
  };

  const handleHandlePointerUp = (e) => {
    const d = connectDragRef.current;
    if (!d) return;
    e.currentTarget.releasePointerCapture(d.pointerId);
    if (d.targetHandleEl) d.targetHandleEl.classList.remove('bd-note-handle--target');
    if (previewLineRef.current) previewLineRef.current.style.display = 'none';

    if (d.targetNoteId && d.targetNoteId !== d.sourceNoteId) {
      const key = canonicalConnectionKey(d.sourceNoteId, d.sourceEdge, d.targetNoteId, d.targetEdge);
      setBrainDumpConnections(prev => {
        const exists = prev.some(
          c => canonicalConnectionKey(c.fromNoteId, c.fromEdge, c.toNoteId, c.toEdge) === key
        );
        if (exists) return prev;
        return [...prev, { id: makeConnId(), fromNoteId: d.sourceNoteId, fromEdge: d.sourceEdge, toNoteId: d.targetNoteId, toEdge: d.targetEdge }];
      });
    }
    connectDragRef.current = null;
  };

  const isEmpty = brainDumpNotes.length === 0 && !draftNote;

  return (
    <div className="bd-page">
      <div className="bd-canvas" ref={canvasRef} onClick={handleCanvasClick}>
        <svg className="bd-connections-layer">
          {validConnections.map(conn => {
            const fromNote = notesById.get(conn.fromNoteId);
            const toNote = notesById.get(conn.toNoteId);
            const p1 = getEdgePoint(fromNote, getSize(conn.fromNoteId), conn.fromEdge);
            const p2 = getEdgePoint(toNote, getSize(conn.toNoteId), conn.toEdge);
            const mx = (p1.x + p2.x) / 2;
            const my = (p1.y + p2.y) / 2;
            return (
              <g key={conn.id} className="bd-conn-group">
                <line ref={registerConnLine(conn.id, 'visible')} className="bd-conn-line" x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} />
                <line ref={registerConnLine(conn.id, 'hit')} className="bd-conn-hit" x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} />
                <g
                  ref={registerConnLine(conn.id, 'deleteGroup')}
                  className="bd-conn-delete"
                  transform={`translate(${mx}, ${my})`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => handleDeleteConnection(conn.id, e)}
                >
                  <circle r="9" />
                  <line x1="-4" y1="-4" x2="4" y2="4" />
                  <line x1="-4" y1="4" x2="4" y2="-4" />
                </g>
              </g>
            );
          })}
          <line ref={previewLineRef} className="bd-conn-preview" x1={0} y1={0} x2={0} y2={0} style={{ display: 'none' }} />
        </svg>

        {isEmpty && <div className="bd-empty-hint">Click anywhere to jot something down</div>}

        {brainDumpNotes.map(note =>
          editingId === note.id ? (
            <div key={note.id} className="bd-note bd-note--editing" style={{ left: note.x, top: note.y }} ref={getNoteElRegistrar(note.id)}>
              <textarea
                className="bd-note-textarea"
                autoFocus
                ref={autoResize}
                value={draftText}
                onChange={(e) => {
                  setDraftText(e.target.value);
                  autoResize(e.target);
                }}
                onBlur={() => commitEdit(note.id)}
              />
            </div>
          ) : (
            <div
              key={note.id}
              className="bd-note"
              style={{ left: note.x, top: note.y }}
              ref={getNoteElRegistrar(note.id)}
              onPointerDown={(e) => handleNotePointerDown(e, note)}
              onPointerMove={(e) => handleNotePointerMove(e, note)}
              onPointerUp={(e) => handleNotePointerUp(e, note)}
            >
              <button
                type="button"
                className="bd-note-delete"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => deleteNote(note.id, e)}
                aria-label="Delete note"
              >
                ×
              </button>
              <div className="bd-note-text">{note.text}</div>
              {EDGES.map(edge => (
                <div
                  key={edge}
                  className={`bd-note-handle bd-note-handle--${edge}`}
                  ref={registerHandleEl(note.id, edge)}
                  onPointerDown={(e) => handleHandlePointerDown(e, note, edge)}
                  onPointerMove={handleHandlePointerMove}
                  onPointerUp={handleHandlePointerUp}
                />
              ))}
            </div>
          )
        )}

        {draftNote && (
          <div className="bd-note bd-note--editing" style={{ left: draftNote.x, top: draftNote.y }}>
            <textarea
              className="bd-note-textarea"
              autoFocus
              ref={autoResize}
              value={draftText}
              onChange={(e) => {
                setDraftText(e.target.value);
                autoResize(e.target);
              }}
              onBlur={commitDraft}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default BrainDumpPage;
