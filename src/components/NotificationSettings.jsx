import { useCallback, useEffect, useState } from 'react';
import { Bell, BellOff, Share, PlusSquare, Loader2, Send } from 'lucide-react';
import * as pushService from '../services/pushService';
import { QUIET_GOAL_DAYS } from '../utils/goalUtils';

const TYPE_ROWS = [
  { type: 'morning', label: 'Morning brief', hint: "Your assistant's plan for the day", timeKey: 'morning' },
  { type: 'commitment', label: 'Commitment check', hint: "If today's commitment isn't marked yet", timeKey: 'commitment' },
  { type: 'evening', label: 'Daily Log reminder', hint: "If today's log is empty or not submitted", timeKey: 'evening' },
  { type: 'streak', label: 'Streak at risk', hint: 'If your score or a habit streak will break tonight', timeKey: 'streak', min: '18:00' },
  { type: 'blocks', label: 'Time block heads-up', hint: 'Before each time block and No Phone block' },
  { type: 'checkins', label: 'Block check-in', hint: 'When a time block ends: did you do it?' },
  { type: 'goals', label: 'Goals check', hint: `When a focus goal has had nothing for ${QUIET_GOAL_DAYS}+ days, and a Sunday recap`, timeKey: 'goals' },
];

/**
 * Notifications tab of the My Assistant drawer. Reads/writes the push settings doc
 * through `api` (the real push service unless a test passes a stand-in).
 */
export default function NotificationSettings({ uid, api = pushService }) {
  const {
    getPushSupport, loadPushSettings, savePushSettings, enablePushOnThisDevice,
    disablePushOnThisDevice, thisDeviceToken,
  } = api;
  const [support, setSupport] = useState(null);
  const [settings, setSettings] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    let alive = true;
    Promise.all([getPushSupport(), uid ? loadPushSettings(uid) : null])
      .then(([s, loaded]) => { if (alive) { setSupport(s); setSettings(loaded); } })
      .catch((err) => { if (alive) setMessage({ ok: false, text: err.message }); });
    return () => { alive = false; };
  }, [uid, getPushSupport, loadPushSettings]);

  const thisDeviceOn = !!settings?.enabled && settings.tokens.some((t) => t.token === thisDeviceToken());

  const run = useCallback(async (fn, okText) => {
    setBusy(true);
    setMessage(null);
    try {
      setSettings(await fn());
      if (okText) setMessage({ ok: true, text: okText });
    } catch (err) {
      setMessage({ ok: false, text: err.message || String(err) });
    } finally {
      setBusy(false);
    }
  }, []);

  const update = (patch) => run(() => savePushSettings(uid, { ...settings, ...patch }));

  if (!uid) return <div className="assistant-drawer-messages"><p className="assistant-panel-empty">Sign in to use notifications.</p></div>;
  if (!support || !settings) return <div className="assistant-drawer-messages"><p className="assistant-panel-empty"><Loader2 size={14} className="animate-spin" /> Loading…</p></div>;

  return (
    <div className="assistant-drawer-messages">
      <p className="assistant-panel-intro">
        Your assistant can reach you when APEX is closed: a morning brief, reminders before you slip, and a heads-up before time blocks.
      </p>

      {support.status === 'needs-install' && (
        <div className="notif-card">
          <p className="notif-card-title">Add APEX to your Home Screen first</p>
          <p className="notif-card-text">iPhone only allows notifications from installed web apps (iOS 16.4 or later).</p>
          <ol className="notif-steps">
            <li>In Safari, tap <Share size={13} /> <strong>Share</strong>.</li>
            <li>Tap <PlusSquare size={13} /> <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</li>
            <li>Open APEX from your Home Screen, sign in, and come back to this tab.</li>
          </ol>
        </div>
      )}
      {support.status === 'unsupported' && <p className="assistant-panel-empty">This browser can't receive push notifications.</p>}
      {support.status === 'no-key' && (
        <p className="assistant-panel-empty">Push isn't configured on this build yet (VITE_FIREBASE_VAPID_KEY is missing).</p>
      )}
      {support.status === 'denied' && (
        <p className="assistant-panel-empty">Notifications are blocked for APEX. Allow them in your device settings, then reopen this tab.</p>
      )}

      {support.status === 'ready' && (
        <div className="notif-card">
          <div className="notif-device-row">
            <span className={`notif-device-status ${thisDeviceOn ? 'notif-device-status--on' : ''}`}>
              {thisDeviceOn ? <Bell size={15} /> : <BellOff size={15} />}
              {thisDeviceOn ? 'On for this device' : 'Off for this device'}
            </span>
            {thisDeviceOn ? (
              <button className="assistant-action-btn assistant-action-btn--reject" disabled={busy}
                onClick={() => run(() => disablePushOnThisDevice(uid), 'Notifications turned off for this device.')}>
                Turn off
              </button>
            ) : (
              <button className="assistant-action-btn assistant-action-btn--approve" disabled={busy}
                onClick={() => run(() => enablePushOnThisDevice(uid), 'Notifications are on. Send a test to check.')}>
                {busy ? 'Turning on…' : 'Turn on'}
              </button>
            )}
          </div>
          {settings.tokens.length > 0 && (
            <p className="notif-card-text">
              Receiving on {settings.tokens.length} device{settings.tokens.length === 1 ? '' : 's'}
              {settings.timezone ? ` · times are ${settings.timezone}` : ''}
            </p>
          )}
          {thisDeviceOn && (
            <button className="notif-test-btn" disabled={busy}
              onClick={() => run(() => savePushSettings(uid, { ...settings, testRequestedAt: Date.now() }), 'Test queued. It usually arrives within 5–20 minutes.')}>
              <Send size={13} /> Send a test
            </button>
          )}
        </div>
      )}

      {message && <div className={`assistant-notice ${message.ok ? '' : 'assistant-notice--warn'}`}>{message.text}</div>}

      {settings.enabled && (
        <div className="notif-types">
          {TYPE_ROWS.map((row) => {
            const on = settings.types[row.type] !== false;
            return (
              <div key={row.type} className="notif-type-row">
                <label className="notif-type-main">
                  <input type="checkbox" checked={on} disabled={busy}
                    onChange={(e) => update({ types: { ...settings.types, [row.type]: e.target.checked } })} />
                  <span>
                    <span className="notif-type-label">{row.label}</span>
                    <span className="notif-type-hint">{row.hint}</span>
                  </span>
                </label>
                {row.timeKey ? (
                  <input type="time" className="notif-time" value={settings.times[row.timeKey]} disabled={!on || busy}
                    aria-label={`${row.label} time`} min={row.min}
                    onChange={(e) => {
                      const value = e.target.value;
                      // Streak risk is only known from 18:00 (the in-app nudge rules), so clamp.
                      if (value) update({ times: { ...settings.times, [row.timeKey]: row.min && value < row.min ? row.min : value } });
                    }} />
                ) : (
                  <select className="notif-time" value={settings.blockLeadMinutes} disabled={!on || busy}
                    aria-label="Minutes before a block"
                    onChange={(e) => update({ blockLeadMinutes: Number(e.target.value) })}>
                    {[10, 15, 20, 30, 45].map((m) => <option key={m} value={m}>{m} min before</option>)}
                  </select>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
