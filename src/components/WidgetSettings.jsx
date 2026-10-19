import { useEffect, useState } from 'react';
import { LayoutGrid, Copy, RotateCw, Check } from 'lucide-react';
import * as widgetService from '../services/widgetService';

const SCRIPTABLE_URL = 'https://apps.apple.com/us/app/scriptable/id1405459188';

// iOS web apps sometimes refuse the async clipboard API; fall back to a hidden textarea.
const copyText = async (value) => {
  try {
    await navigator.clipboard.writeText(value);
    return;
  } catch { /* fall through */ }
  const area = document.createElement('textarea');
  area.value = value;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  area.setSelectionRange(0, value.length);
  const ok = document.execCommand('copy');
  document.body.removeChild(area);
  if (!ok) throw new Error('Couldn’t copy. Long-press to copy from a desktop browser instead.');
};

/**
 * Home Screen widget card in the Alerts tab: turn it on, copy the Scriptable script
 * (with this user's private link baked in), reset the link, or turn it off.
 */
export default function WidgetSettings({ uid, api = widgetService }) {
  const { subscribeWidgetSettings, enableWidget, disableWidget, buildWidgetScript } = api;
  const [settings, setSettings] = useState(undefined); // undefined = loading
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => (uid ? subscribeWidgetSettings(uid, setSettings) : undefined), [uid, subscribeWidgetSettings]);

  const run = async (fn, okText) => {
    setBusy(true);
    setMessage(null);
    try {
      const value = await fn();
      if (value !== undefined) setSettings(value);
      if (okText) setMessage({ ok: true, text: okText });
    } catch (err) {
      setMessage({ ok: false, text: err.message || String(err) });
    } finally {
      setBusy(false);
    }
  };

  const copy = () => run(async () => {
    await copyText(buildWidgetScript(settings.token));
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
    return undefined;
  });

  if (!uid || settings === undefined) return null;
  const on = !!settings?.token;

  return (
    <div className="notif-card">
      <div className="notif-device-row">
        <span className={`notif-device-status ${on ? 'notif-device-status--on' : ''}`}>
          <LayoutGrid size={15} /> Home Screen widget
        </span>
        {on ? (
          <button className="assistant-action-btn assistant-action-btn--reject" disabled={busy}
            onClick={() => run(() => disableWidget(uid, settings.token), 'Widget turned off. The one on your phone will say so.')}>
            Turn off
          </button>
        ) : (
          <button className="assistant-action-btn assistant-action-btn--approve" disabled={busy}
            onClick={() => run(() => enableWidget(uid), 'Widget is on. Follow the steps below.')}>
            {busy ? 'Turning on…' : 'Turn on'}
          </button>
        )}
      </div>
      <p className="notif-card-text">
        Your score, what&rsquo;s on now, Top 3, habits left and your next move on your iPhone Home Screen,
        through the free Scriptable app. It refreshes every 5&ndash;15 minutes (iOS decides).
      </p>

      {on && (
        <>
          <ol className="notif-steps">
            <li>Install <a href={SCRIPTABLE_URL} target="_blank" rel="noreferrer">Scriptable</a> from the App Store.</li>
            <li>Tap <strong>Copy script</strong> below. In Scriptable, tap <strong>+</strong>, paste, and name it <strong>APEX</strong>.</li>
            <li>Long-press your Home Screen, tap <strong>Edit</strong> → <strong>Add Widget</strong> → <strong>Scriptable</strong>, pick the <strong>large</strong> size and add it.</li>
            <li>Long-press the new widget → <strong>Edit Widget</strong> → <strong>Script</strong> → <strong>APEX</strong>.</li>
          </ol>
          <div className="widget-actions">
            <button className="notif-test-btn" disabled={busy} onClick={copy}>
              {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied' : 'Copy script'}
            </button>
            <button className="notif-test-btn" disabled={busy}
              onClick={() => run(() => enableWidget(uid, settings.token), 'New link made. Copy the script again and replace it in Scriptable.')}>
              <RotateCw size={13} /> Reset link
            </button>
          </div>
          <p className="notif-card-text">
            The script holds a private link to a read-only summary. Don&rsquo;t share it; if you do, reset the link.
          </p>
        </>
      )}
      {message && <div className={`assistant-notice ${message.ok ? '' : 'assistant-notice--warn'}`}>{message.text}</div>}
    </div>
  );
}
