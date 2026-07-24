import React, { useRef, useState } from 'react';
import { X, Download, Upload, Check, Keyboard } from 'lucide-react';
import './DataModal.css';

const GAME_KEYS = [
  'gameOfLife_user', 'gameOfLife_todos', 'gameOfLife_habits', 'gameOfLife_logs',
  'gameOfLife_chatHistory', 'gameOfLife_calendarEvents', 'gameOfLife_quickEvents',
  'gameOfLife_calendarDayEvents', 'gameOfLife_commitmentArchive', 'gameOfLife_challenges_v2',
  'gameOfLife_goals_v1', 'gameOfLife_xpLog', 'gameOfLife_pomodoroSessions',
  'gameOfLife_achievements', 'gameOfLife_healthLog', 'gameOfLife_foodLog',
  'gameOfLife_foodPoints', 'gameOfLife_weeklyReviews',
  'gameOfLife_shop', 'gameOfLife_lastDate',
  'gameOfLife_brainDump', 'gameOfLife_brainDumpConnections',
];

const DataModal = ({ onClose }) => {
  const fileInputRef = useRef(null);
  const [importStatus, setImportStatus] = useState(null); // null | 'success' | 'error'
  const [importError, setImportError] = useState('');

  const handleExport = () => {
    const data = {};
    for (const key of GAME_KEYS) {
      const val = localStorage.getItem(key);
      if (val === null) continue;
      // gameOfLife_lastDate is stored as a raw date string, not JSON.
      data[key] = key === 'gameOfLife_lastDate' ? val : JSON.parse(val);
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
          localStorage.setItem(key, key === 'gameOfLife_lastDate' ? val : JSON.stringify(val));
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
          <h2 className="data-modal-title">Data Management</h2>
          <button className="data-modal-close" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="data-modal-body">
          <div className="data-section">
            <div className="data-section-icon"><Download size={22} /></div>
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
            <div className="data-section-icon"><Upload size={22} /></div>
            <div className="data-section-content">
              <h3 className="data-section-title">Import Backup</h3>
              <p className="data-section-desc">Restore from a previously exported file. <strong>This will overwrite all current data.</strong></p>
              <button className="data-btn data-btn--import" onClick={() => fileInputRef.current?.click()}>
                Choose File
              </button>
              <input ref={fileInputRef} type="file" accept=".json" onChange={handleImportFile} style={{ display: 'none' }} />
              {importStatus === 'success' && <span className="data-status data-status--success"><Check size={14} /> Import successful! Reloading...</span>}
              {importStatus === 'error'   && <span className="data-status data-status--error"><X size={14} /> {importError}</span>}
            </div>
          </div>

          <div className="data-divider" />

          <div className="data-section">
            <div className="data-section-icon"><Keyboard size={22} /></div>
            <div className="data-section-content">
              <h3 className="data-section-title">Keyboard Shortcuts</h3>
              <div className="data-shortcuts">
                {[
                  ['Alt+1', 'Statistics'], ['Alt+2', 'Tasks'], ['Alt+3', 'Daily Log'],
                  ['Alt+4', 'Timer'], ['Alt+5', 'Calendar'], ['Alt+6', 'Goals'],
                  ['Alt+7', 'Review'],
                  ['Alt+S', 'Shop'], ['Alt+M', 'Toggle Assistant'], ['Alt+F', 'Focus Mode'],
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
