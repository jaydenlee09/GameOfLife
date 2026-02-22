import React, { useState, useEffect, useRef, useCallback } from 'react';
import './DailyLogPage.css';
import EMOTIONS from '../utils/logMeta';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getTodayKey = () => {
  const now = new Date();
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
  videoDataUrl: null,
  videoName: null,
});

// ─── Video Upload Section ─────────────────────────────────────────────────────

const VideoSection = ({ videoDataUrl, videoName, onVideoChange }) => {
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Use IndexedDB for video storage (avoid localStorage 5MB limit)
    const objectUrl = URL.createObjectURL(file);
    onVideoChange({ objectUrl, name: file.name, useObjectUrl: true });
  };

  const handleRemove = () => {
    onVideoChange(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="log-section">
      <h3 className="log-section-title">📹 Day in Review</h3>
      <p className="log-section-subtitle">Upload a short video from your camera roll</p>

      {videoDataUrl ? (
        <div className="video-preview-wrapper">
          <video
            className="video-preview"
            src={videoDataUrl}
            controls
            playsInline
          />
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

const DailyLogPage = ({ logs, setLogs }) => {
  const todayKey = getTodayKey();
  const [selectedDate, setSelectedDate] = useState(todayKey);

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
    if (!videoData) {
      updateField('videoDataUrl', null);
      updateField('videoName', null);
    } else {
      updateField('videoDataUrl', videoData.objectUrl);
      updateField('videoName', videoData.name);
    }
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
              entry.videoDataUrl;

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

          {/* ── Video Upload ── */}
          <VideoSection
            videoDataUrl={currentEntry.videoDataUrl || null}
            videoName={currentEntry.videoName || null}
            onVideoChange={handleVideoChange}
          />

        </div>
      </main>
    </div>
  );
};

export default DailyLogPage;
