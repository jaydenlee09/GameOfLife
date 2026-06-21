import React, { useRef, useState } from 'react';
import './DataModal.css';

const GAME_KEYS = [
  'gameOfLife_user', 'gameOfLife_todos', 'gameOfLife_habits', 'gameOfLife_logs',
  'gameOfLife_chatHistory', 'gameOfLife_calendarEvents', 'gameOfLife_quickEvents',
  'gameOfLife_calendarDayEvents', 'gameOfLife_commitmentArchive', 'gameOfLife_challenges_v2',
  'gameOfLife_goals_v1', 'gameOfLife_xpLog', 'gameOfLife_pomodoroSessions',
  'gameOfLife_achievements', 'gameOfLife_healthLog', 'gameOfLife_weeklyReviews',
  'gameOfLife_shop', 'gameOfLife_lastDate',
];

const DataModal = ({ onClose }) => {
  const fileInputRef = useRef(null);
  const [importStatus, setImportStatus] = useState(null); // null | 'success' | 'error'
  const [importError, setImportError] = useState('');

  const handleExport = () => {
    const data = {};
    for (const key of GAME_KEYS) {
      const val = localStorage.getItem(key);
      if (val !== null) data[key] = JSON.parse(val);
    }
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), version: 1, data }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gameoflife-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (!parsed.data || parsed.version !== 1) throw new Error('Invalid backup file format.');
        if (!window.confirm('This will overwrite ALL your current data. Are you sure?')) return;
        for (const [key, val] of Object.entries(parsed.data)) {
          localStorage.setItem(key, JSON.stringify(val));
        }
        setImportStatus('success');
        setTimeout(() => window.location.reload(), 1200);
      } catch (err) {
        setImportError(err.message || 'Failed to parse file.');
        setImportStatus('error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="data-modal-overlay" onClick={onClose}>
      <div className="data-modal" onClick={e => e.stopPropagation()}>
        <div className="data-modal-header">
          <h2 className="data-modal-title">DATA MANAGEMENT</h2>
          <button className="data-modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="data-modal-body">
          <div className="data-section">
            <div className="data-section-icon">⬇️</div>
            <div className="data-section-content">
              <h3 className="data-section-title">Export Backup</h3>
              <p className="data-section-desc">Download all your data as a JSON file. Keep this safe — it's your complete save file.</p>
              <button className="data-btn data-btn--export" onClick={handleExport}>
                Download Backup
              </button>
            </div>
          </div>

          <div className="data-divider" />

          <div className="data-section">
            <div className="data-section-icon">⬆️</div>
            <div className="data-section-content">
              <h3 className="data-section-title">Import Backup</h3>
              <p className="data-section-desc">Restore from a previously exported file. <strong>This will overwrite all current data.</strong></p>
              <button className="data-btn data-btn--import" onClick={() => fileInputRef.current?.click()}>
                Choose File
              </button>
              <input ref={fileInputRef} type="file" accept=".json" onChange={handleImportFile} style={{ display: 'none' }} />
              {importStatus === 'success' && <span className="data-status data-status--success">✓ Import successful! Reloading...</span>}
              {importStatus === 'error'   && <span className="data-status data-status--error">✕ {importError}</span>}
            </div>
          </div>

          <div className="data-divider" />

          <div className="data-section">
            <div className="data-section-icon">⌨️</div>
            <div className="data-section-content">
              <h3 className="data-section-title">Keyboard Shortcuts</h3>
              <div className="data-shortcuts">
                {[
                  ['Alt+1', 'Statistics'], ['Alt+2', 'Tasks'], ['Alt+3', 'Challenges'],
                  ['Alt+4', 'Daily Log'], ['Alt+5', 'Timer'], ['Alt+6', 'Calendar'],
                  ['Alt+7', 'Goals'], ['Alt+8', 'Health'], ['Alt+9', 'Review'],
                  ['Alt+S', 'Shop'], ['Alt+M', 'Toggle Mentor'], ['Alt+F', 'Focus Mode'],
                ].map(([key, label]) => (
                  <div key={key} className="data-shortcut-row">
                    <kbd className="data-kbd">{key}</kbd>
                    <span className="data-shortcut-label">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DataModal;
