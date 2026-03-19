import React, { useState, useEffect, useRef, useCallback } from 'react';
import './DailyLogPage.css';
import EMOTIONS from '../utils/logMeta';
import { saveVideo, getVideo, deleteVideo } from '../utils/videoDB';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getTodayKey = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const getTomorrowKey = () => {
  const now = new Date();
  now.setDate(now.getDate() + 1);
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const formatDisplayDate = (dateKey) => {
  // dateKey: 'YYYY-MM-DD'
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

const formatShortDate = (dateKey) => {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const EMPTY_ENTRY = () => ({
  emotions: [],
  proud: ['', '', ''],
  improve: ['', '', ''],
  learned: '',
  notes: '',
  videoName: null,
  commitment: '',
});

// ─── Video Upload Section ─────────────────────────────────────────────────────

const VideoSection = ({ date, videoName, onVideoChange }) => {
  const fileInputRef = useRef(null);
  // objectUrl is a fresh blob URL created from the IndexedDB blob — lives only
  // in this component's lifetime and is revoked on cleanup.
  const [objectUrl, setObjectUrl] = useState(null);
  const objectUrlRef = useRef(null);

  // Load blob from IndexedDB whenever the date or videoName changes
  useEffect(() => {
    let cancelled = false;

    // Revoke any previous object URL
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
      setObjectUrl(null);
    }

    if (!videoName) return;

    getVideo(date)
      .then((blob) => {
        if (cancelled || !blob) return;
        const url = URL.createObjectURL(blob);
        objectUrlRef.current = url;
        setObjectUrl(url);
      })
      .catch(() => {
        // silently ignore — user will see upload UI
      });

    return () => {
      cancelled = true;
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [date, videoName]);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Persist raw blob to IndexedDB so it survives page reloads
    saveVideo(date, file).catch(console.error);

    // Create a temporary object URL for immediate playback in this session
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    setObjectUrl(url);

    onVideoChange({ name: file.name });
  };

  const handleRemove = () => {
    deleteVideo(date).catch(console.error);
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setObjectUrl(null);
    onVideoChange(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="log-section">
      <h3 className="log-section-title">📹 Day in Review</h3>
      <p className="log-section-subtitle">Upload a short video from your camera roll</p>

      {objectUrl ? (
        <div className="video-preview-wrapper">
          <video
            className="video-preview"
            src={objectUrl}
            controls
            playsInline
          />
          <div className="video-meta">
            <span className="video-name">{videoName}</span>
            <button className="video-remove-btn" onClick={handleRemove}>✕ Remove</button>
          </div>
        </div>
      ) : videoName ? (
        // Blob is still loading from IndexedDB (or failed)
        <div className="video-preview-wrapper">
          <div className="video-loading">⏳ Loading video…</div>
          <div className="video-meta">
            <span className="video-name">{videoName}</span>
            <button className="video-remove-btn" onClick={handleRemove}>✕ Remove</button>
          </div>
        </div>
      ) : (
        <label className="video-upload-area" htmlFor="video-upload-input">
          <div className="video-upload-icon">🎬</div>
          <div className="video-upload-text">Tap to upload a video</div>
          <div className="video-upload-hint">Under 1 minute · MP4, MOV, etc.</div>
          <input
            ref={fileInputRef}
            id="video-upload-input"
            type="file"
            accept="video/*"
            className="video-file-input"
            onChange={handleFileChange}
          />
        </label>
      )}
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const COMMIT_HOLD_DURATION = 3000;

const DailyLogPage = ({ logs, setLogs, onCommitmentLocked }) => {
  const todayKey = getTodayKey();
  const [selectedDate, setSelectedDate] = useState(todayKey);

  // ── Hold-to-Commit state ──
  const [commitHolding, setCommitHolding] = useState(false);
  const [commitProgress, setCommitProgress] = useState(0);
  const [committed, setCommitted] = useState(false);
  const commitIntervalRef = useRef(null);
  const commitStartRef = useRef(null);

  const startCommitHold = useCallback((entry) => {
    if (!entry.commitment?.trim() || committed) return;
    if (commitIntervalRef.current) return;
    setCommitHolding(true);
    commitStartRef.current = Date.now();
    commitIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - commitStartRef.current;
      const pct = Math.min((elapsed / COMMIT_HOLD_DURATION) * 100, 100);
      setCommitProgress(pct);
      if (pct >= 100) {
        clearInterval(commitIntervalRef.current);
        commitIntervalRef.current = null;
        setCommitHolding(false);
        setCommitted(true);
        onCommitmentLocked && onCommitmentLocked({
          date: selectedDate,
          text: entry.commitment.trim(),
        });
      }
    }, 16);
  }, [committed, onCommitmentLocked, selectedDate]);

  const stopCommitHold = useCallback(() => {
    if (commitIntervalRef.current) {
      clearInterval(commitIntervalRef.current);
      commitIntervalRef.current = null;
    }
    setCommitHolding(false);
    setCommitProgress(0);
  }, []);

  // Reset committed state when date or commitment text changes
  useEffect(() => {
    setCommitted(false);
    setCommitProgress(0);
    setCommitHolding(false);
    if (commitIntervalRef.current) {
      clearInterval(commitIntervalRef.current);
      commitIntervalRef.current = null;
    }
  }, [selectedDate]);

  // Ensure today's entry always exists
  useEffect(() => {
    setLogs(prev => {
      if (!prev[todayKey]) {
        return { ...prev, [todayKey]: EMPTY_ENTRY() };
      }
      return prev;
    });
  }, [todayKey, setLogs]);

  // Current entry (read from logs, fallback to empty)
  const currentEntry = logs[selectedDate] || EMPTY_ENTRY();

  // Auto-save: update a specific field in the current entry
  const updateField = useCallback((field, value) => {
    setLogs(prev => ({
      ...prev,
      [selectedDate]: {
        ...(prev[selectedDate] || EMPTY_ENTRY()),
        [field]: value,
      },
    }));
  }, [selectedDate, setLogs]);

  // Sorted dates: newest first, today always on top
  const sortedDates = Object.keys(logs).sort((a, b) => b.localeCompare(a));

  // ── Emotion toggle ──
  const toggleEmotion = (emotionId) => {
    const current = currentEntry.emotions || [];
    const updated = current.includes(emotionId)
      ? current.filter(e => e !== emotionId)
      : [...current, emotionId];
    updateField('emotions', updated);
  };

  // ── Proud/Improve array fields ──
  const updateArrayField = (field, index, value) => {
    const arr = [...(currentEntry[field] || ['', '', ''])];
    arr[index] = value;
    updateField(field, arr);
  };

  // ── Video ──
  const handleVideoChange = (videoData) => {
    updateField('videoName', videoData ? videoData.name : null);
  };

  const isToday = selectedDate === todayKey;

  return (
    <div className="daily-log-container">

      {/* ── Left Sidebar: Entry List ── */}
      <aside className="log-sidebar">
        <div className="log-sidebar-header">
          <h2 className="log-sidebar-title">📓 Journal</h2>
        </div>

        <div className="log-entries-list">
          {sortedDates.length === 0 && (
            <div className="log-empty-hint">No entries yet.</div>
          )}
          {sortedDates.map(dateKey => {
            const isActive = dateKey === selectedDate;
            const isEntryToday = dateKey === todayKey;
            const entry = logs[dateKey] || EMPTY_ENTRY();
            const hasContent =
              entry.emotions?.length > 0 ||
              entry.proud?.some(v => v.trim()) ||
              entry.improve?.some(v => v.trim()) ||
              entry.learned?.trim() ||
              entry.notes?.trim() ||
              entry.videoName;

            return (
              <button
                key={dateKey}
                className={`log-entry-pill ${isActive ? 'active' : ''} ${isEntryToday ? 'today' : ''}`}
                onClick={() => setSelectedDate(dateKey)}
              >
                <div className="log-entry-pill-left">
                  <span className="log-entry-dot" style={{ opacity: hasContent ? 1 : 0.25 }} />
                  <div>
                    <span className="log-entry-date">{formatShortDate(dateKey)}</span>
                    {isEntryToday && <span className="log-entry-today-badge">Today</span>}
                  </div>
                </div>
                {entry.emotions?.length > 0 && (
                  <span className="log-entry-emotions-preview">
                    {entry.emotions.slice(0, 3).map(eid => {
                      const em = EMOTIONS.find(e => e.id === eid);
                      return em ? em.emoji : '';
                    }).join('')}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </aside>

      {/* ── Right Panel: Log Form ── */}
      <main className="log-main">
        {/* Date Header */}
        <div className="log-date-header">
          <h1 className="log-date-title">{formatDisplayDate(selectedDate)}</h1>
          {isToday && <span className="log-today-badge">Today</span>}
          {!isToday && (
            <span className="log-readonly-badge">Past Entry</span>
          )}
        </div>

        <div className="log-form">

          {/* ── Emotions ── */}
          <div className="log-section">
            <h3 className="log-section-title">💭 How did you feel today?</h3>
            <p className="log-section-subtitle">Select all that apply</p>
            <div className="emotions-grid">
              {EMOTIONS.map(emotion => {
                const selected = (currentEntry.emotions || []).includes(emotion.id);
                return (
                  <button
                    key={emotion.id}
                    className={`emotion-chip ${selected ? 'selected' : ''}`}
                    style={selected ? { '--chip-color': emotion.color, borderColor: emotion.color, backgroundColor: emotion.color + '22' } : {}}
                    onClick={() => toggleEmotion(emotion.id)}
                  >
                    <span className="emotion-emoji">{emotion.emoji}</span>
                    <span className="emotion-label">{emotion.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Proud Of ── */}
          <div className="log-section">
            <h3 className="log-section-title">🏆 Three things I'm proud of</h3>
            <div className="reflection-inputs">
              {[0, 1, 2].map(i => (
                <div key={i} className="reflection-input-row">
                  <span className="reflection-number">{i + 1}</span>
                  <input
                    type="text"
                    className="reflection-input"
                    placeholder={`Something you're proud of...`}
                    value={(currentEntry.proud || ['', '', ''])[i]}
                    onChange={e => updateArrayField('proud', i, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* ── Improve ── */}
          <div className="log-section">
            <h3 className="log-section-title">📈 Three things I can improve</h3>
            <div className="reflection-inputs">
              {[0, 1, 2].map(i => (
                <div key={i} className="reflection-input-row">
                  <span className="reflection-number">{i + 1}</span>
                  <input
                    type="text"
                    className="reflection-input"
                    placeholder={`Something to work on...`}
                    value={(currentEntry.improve || ['', '', ''])[i]}
                    onChange={e => updateArrayField('improve', i, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* ── Learned ── */}
          <div className="log-section">
            <h3 className="log-section-title">💡 One thing I learned</h3>
            <textarea
              className="learned-textarea"
              placeholder="What did you learn today?"
              value={currentEntry.learned || ''}
              onChange={e => updateField('learned', e.target.value)}
              rows={4}
            />
          </div>

          {/* ── Additional Notes ── */}
          <div className="log-section">
            <h3 className="log-section-title">📝 Additional Notes</h3>
            <textarea
              className="notes-textarea"
              placeholder="Anything else you want to remember about today?"
              value={currentEntry.notes || ''}
              onChange={e => updateField('notes', e.target.value)}
              rows={5}
            />
          </div>

          {/* ── Video Upload ── */}
          <VideoSection
            date={selectedDate}
            videoName={currentEntry.videoName || null}
            onVideoChange={handleVideoChange}
          />

          {/* ── Commitment for Tomorrow ── */}
          <div className="log-section commitment-section">
            <h3 className="log-section-title">🎯 Commitment for Tomorrow</h3>
            <p className="log-section-subtitle">One thing you commit to doing tomorrow</p>
            <input
              type="text"
              className={`reflection-input commitment-input${committed ? ' commitment-input--locked' : ''}`}
              placeholder="I will..."
              value={currentEntry.commitment || ''}
              onChange={e => isToday && !committed && updateField('commitment', e.target.value)}
              readOnly={!isToday || committed}
            />
            {isToday && (
              <div className="commit-hold-btn-wrap">
                {committed ? (
                  <div className="commit-confirmed-banner">
                    <span>✅ Commitment locked in!</span>
                  </div>
                ) : (
                  <button
                    className={`commit-hold-btn${commitHolding ? ' commit-hold-btn--holding' : ''}${!currentEntry.commitment?.trim() ? ' commit-hold-btn--disabled' : ''}`}
                    onPointerDown={() => startCommitHold(currentEntry)}
                    onPointerUp={stopCommitHold}
                    onPointerLeave={stopCommitHold}
                    disabled={!currentEntry.commitment?.trim()}
                  >
                    <span className="commit-hold-label">
                      {commitProgress > 0 ? 'Hold…' : 'Hold to Commit'}
                    </span>
                    <div
                      className="commit-hold-progress"
                      style={{ width: `${commitProgress}%` }}
                    />
                  </button>
                )}
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  );
};

export default DailyLogPage;
