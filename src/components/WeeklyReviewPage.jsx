import React, { useState, useMemo } from 'react';
import './WeeklyReviewPage.css';

const getLocalDateKey = (offsetDays = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

const getMondayKey = (offsetWeeks = 0) => {
  const d = new Date();
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1 - day) + offsetWeeks * 7;
  d.setDate(d.getDate() + diff);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

const formatWeekRange = (mondayKey) => {
  const mon = new Date(mondayKey + 'T00:00:00');
  const sun = new Date(mon);
  sun.setDate(sun.getDate() + 6);
  const opts = { month: 'short', day: 'numeric' };
  return `${mon.toLocaleDateString('en-US', opts)} – ${sun.toLocaleDateString('en-US', opts)}`;
};

const computeWeekStats = (mondayKey, xpLog, pomodoroSessions, habits, todos, logs, challenges) => {
  const mon = new Date(mondayKey + 'T00:00:00');
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon);
    d.setDate(d.getDate() + i);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  });

  const xpEarned     = xpLog.filter(e => days.includes(e.date) && e.amount > 0).reduce((s, e) => s + e.amount, 0);
  const tasksCompleted = xpLog.filter(e => days.includes(e.date) && e.source === 'task').length;
  const habitsCompleted = xpLog.filter(e => days.includes(e.date) && e.source === 'habit' && e.amount > 0).length;
  const focusMinutes  = pomodoroSessions.filter(s => days.includes(s.date) && s.completed).reduce((s, p) => s + Math.floor(p.durationSecs / 60), 0);
  const challengesDone = challenges.filter(c => c.completed && c.startedAt && days.some(d => {
    const cDate = new Date(c.startedAt).toISOString().slice(0,10);
    return d === cDate;
  })).length;

  // Top emotion
  const emotionCount = {};
  for (const d of days) {
    for (const e of (logs[d]?.emotions || [])) emotionCount[e] = (emotionCount[e] || 0) + 1;
  }
  const topEmotion = Object.entries(emotionCount).sort((a,b) => b[1]-a[1])[0]?.[0] || null;

  return { xpEarned, tasksCompleted, habitsCompleted, focusMinutes, challengesDone, topEmotion };
};

const STAT_ITEMS = [
  { key: 'xpEarned',       icon: '⚡', label: 'XP Earned',         fmt: v => `${v} XP` },
  { key: 'tasksCompleted', icon: '✅', label: 'Tasks Done',         fmt: v => `${v}` },
  { key: 'habitsCompleted',icon: '🔥', label: 'Habit Completions',  fmt: v => `${v}` },
  { key: 'focusMinutes',   icon: '⏱️', label: 'Focus Time',         fmt: v => v >= 60 ? `${Math.floor(v/60)}h ${v%60}m` : `${v}m` },
  { key: 'challengesDone', icon: '⚔️', label: 'Challenges Done',    fmt: v => `${v}` },
];

const getWeekDays = (mondayKey) => {
  const mon = new Date(mondayKey + 'T00:00:00');
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon);
    d.setDate(d.getDate() + i);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  });
};

const WeeklyReviewPage = ({ weeklyReviews = {}, setWeeklyReviews, xpLog = [], pomodoroSessions = [], habits = [], todos = [], logs = {}, challenges = [] }) => {
  const [weekOffset, setWeekOffset] = useState(0);
  const mondayKey = getMondayKey(weekOffset);
  const isCurrentWeek = weekOffset === 0;
  const saved = weeklyReviews[mondayKey];

  const stats = useMemo(
    () => computeWeekStats(mondayKey, xpLog, pomodoroSessions, habits, todos, logs, challenges),
    [mondayKey, xpLog.length, pomodoroSessions.length, habits.length, todos.length, Object.keys(logs).length, challenges.length]
  );

  const [wentWell,     setWentWell]     = useState(saved?.wentWell     || '');
  const [heldBack,     setHeldBack]     = useState(saved?.heldBack     || '');
  const [improvements, setImprovements] = useState(saved?.improvements || '');
  const [priority,     setPriority]     = useState(saved?.priority     || '');
  const [justSaved,    setJustSaved]    = useState(false);

  const [aiInsight,  setAiInsight]  = useState(null);
  const [aiLoading,  setAiLoading]  = useState(false);
  const [aiError,    setAiError]    = useState(null);

  const analyzeImprovements = async () => {
    setAiLoading(true);
    setAiError(null);
    setAiInsight(null);

    const days = getWeekDays(mondayKey);
    const allItems = [];
    for (const day of days) {
      const entry = logs[day];
      if (!entry?.improve) continue;
      for (const item of entry.improve) {
        if (item?.trim()) allItems.push(item.trim());
      }
    }

    if (allItems.length === 0) {
      setAiError('No improvement entries found for this week.');
      setAiLoading(false);
      return;
    }

    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey });

      const prompt = `Here are things I wrote as areas to improve on in my daily journal entries this week:\n\n${allItems.map((item, i) => `${i + 1}. ${item}`).join('\n')}\n\nWhat is the most common theme or pattern? Be direct and concise — 2–3 sentences max. Name the specific recurring pattern, then give one concrete action I can take.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { temperature: 0.7, maxOutputTokens: 1024 },
      });

      setAiInsight(response.text?.trim() || 'Could not generate insight.');
    } catch {
      setAiError('Failed to analyze. Check your API key.');
    }

    setAiLoading(false);
  };

  const handleSave = () => {
    setWeeklyReviews(prev => ({
      ...prev,
      [mondayKey]: { wentWell, heldBack, improvements, priority, completedAt: Date.now(), stats },
    }));
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2000);
  };

  const handleWeekChange = (dir) => {
    const newOffset = weekOffset + dir;
    if (newOffset > 0) return;
    const newKey = getMondayKey(newOffset);
    const newSaved = weeklyReviews[newKey];
    setWeekOffset(newOffset);
    setWentWell(newSaved?.wentWell || '');
    setHeldBack(newSaved?.heldBack || '');
    setImprovements(newSaved?.improvements || '');
    setPriority(newSaved?.priority || '');
    setAiInsight(null);
    setAiError(null);
  };

  const pastReviews = Object.entries(weeklyReviews)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 8);

  return (
    <div className="review-page">
      <h1 className="section-page-title">WEEKLY REVIEW</h1>

      <div className="review-layout">
        {/* ── Main Review ──────────────────────────────────────────────────── */}
        <div className="review-main">
          {/* Week nav */}
          <div className="review-week-nav">
            <button className="review-nav-btn" onClick={() => handleWeekChange(-1)}>◀</button>
            <div className="review-week-info">
              <span className="review-week-label">{isCurrentWeek ? 'This Week' : 'Past Week'}</span>
              <span className="review-week-range">{formatWeekRange(mondayKey)}</span>
            </div>
            <button className="review-nav-btn" onClick={() => handleWeekChange(1)} disabled={isCurrentWeek}>▶</button>
          </div>

          {/* Auto stats */}
          <div className="review-stats-grid">
            {STAT_ITEMS.map(({ key, icon, label, fmt }) => (
              <div key={key} className="review-stat-card">
                <span className="review-stat-icon">{icon}</span>
                <span className="review-stat-value">{fmt(stats[key])}</span>
                <span className="review-stat-label">{label}</span>
              </div>
            ))}
            {stats.topEmotion && (
              <div className="review-stat-card">
                <span className="review-stat-icon">😊</span>
                <span className="review-stat-value">{stats.topEmotion}</span>
                <span className="review-stat-label">Top Mood</span>
              </div>
            )}
          </div>

          {/* AI Improvement Insight */}
          <div className="review-ai-insight">
            <div className="review-ai-header">
              <span className="review-ai-title">🤖 AI Pattern Analysis</span>
              <button
                className="review-ai-btn"
                onClick={analyzeImprovements}
                disabled={aiLoading}
              >
                {aiLoading ? 'Analyzing…' : 'Analyze Improvements'}
              </button>
            </div>
            {!aiInsight && !aiError && !aiLoading && (
              <p className="review-ai-hint">Tap to find the most common thing you wrote in "things I can improve" across this week's daily logs.</p>
            )}
            {aiLoading && <p className="review-ai-hint">Scanning your entries…</p>}
            {aiError && <p className="review-ai-error">{aiError}</p>}
            {aiInsight && (
              <div className="review-ai-result">
                <p className="review-ai-text">
                  {aiInsight.split(/\*\*(.*?)\*\*/g).map((part, i) =>
                    i % 2 === 1 ? <strong key={i}>{part}</strong> : part
                  )}
                </p>
              </div>
            )}
          </div>

          {/* Reflection prompts */}
          <div className="review-prompts">
            <div className="review-prompt-group">
              <label className="review-prompt-label">✅ What went well this week?</label>
              <textarea
                className="review-textarea"
                placeholder="Wins, breakthroughs, proud moments..."
                value={wentWell}
                onChange={e => setWentWell(e.target.value)}
                rows={3}
              />
            </div>
            <div className="review-prompt-group">
              <label className="review-prompt-label">🚧 What held me back?</label>
              <textarea
                className="review-textarea"
                placeholder="Obstacles, bad habits, missed opportunities..."
                value={heldBack}
                onChange={e => setHeldBack(e.target.value)}
                rows={3}
              />
            </div>
            <div className="review-prompt-group">
              <label className="review-prompt-label">📈 What do I need to improve on next week?</label>
              <textarea
                className="review-textarea"
                placeholder="Skills to sharpen, habits to build, behaviors to change..."
                value={improvements}
                onChange={e => setImprovements(e.target.value)}
                rows={3}
              />
            </div>
            <div className="review-prompt-group">
              <label className="review-prompt-label">🎯 #1 Priority for next week</label>
              <textarea
                className="review-textarea review-textarea--highlight"
                placeholder="The single most important thing to focus on..."
                value={priority}
                onChange={e => setPriority(e.target.value)}
                rows={2}
              />
            </div>
          </div>

          <button className={`review-save-btn ${justSaved ? 'saved' : ''}`} onClick={handleSave}>
            {justSaved ? '✓ Review Saved!' : 'Save Review'}
          </button>
        </div>

        {/* ── Past Reviews ─────────────────────────────────────────────────── */}
        <div className="review-sidebar">
          <h3 className="review-sidebar-title">PAST REVIEWS</h3>
          {pastReviews.length === 0 ? (
            <p className="review-sidebar-empty">No reviews yet. Complete your first one!</p>
          ) : (
            pastReviews.map(([key, r]) => (
              <div
                key={key}
                className={`review-past-item ${key === mondayKey ? 'active' : ''}`}
                onClick={() => {
                  const off = Math.round((new Date(getMondayKey(0)) - new Date(key + 'T00:00:00')) / (7 * 86400000)) * -1;
                  setWeekOffset(off);
                  setWentWell(r.wentWell || '');
                  setHeldBack(r.heldBack || '');
                  setImprovements(r.improvements || '');
                  setPriority(r.priority || '');
                }}
              >
                <span className="review-past-range">{formatWeekRange(key)}</span>
                {r.stats && <span className="review-past-xp">⚡ {r.stats.xpEarned} XP</span>}
                {r.priority && <p className="review-past-priority">🎯 {r.priority}</p>}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default WeeklyReviewPage;
