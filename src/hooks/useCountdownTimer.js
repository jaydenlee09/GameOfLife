import { useState, useRef, useCallback, useEffect } from 'react';

// Ascending chime played when a focus session completes. Shared so TimerPage and
// FocusMode (its fullscreen variant) don't each carry their own copy.
export const playFinishSound = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.18);
      gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.18);
      gain.gain.linearRampToValueAtTime(0.35, ctx.currentTime + i * 0.18 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.18 + 0.5);
      osc.start(ctx.currentTime + i * 0.18);
      osc.stop(ctx.currentTime + i * 0.18 + 0.55);
    });
  } catch { /* silently fail */ }
};

/**
 * Drift-proof countdown timer shared by TimerPage and FocusMode.
 * Remaining time is recomputed from a fixed end timestamp (not decremented per tick),
 * so background-tab throttling can't cause drift, and it resyncs on visibility change.
 * `onComplete` fires once, after the common teardown + chime.
 */
export function useCountdownTimer(initialSecs, onComplete) {
  const [totalSecs, setTotalSecs] = useState(initialSecs);
  const [timeLeft, setTimeLeft]   = useState(initialSecs);
  const [isRunning, setIsRunning] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);

  const intervalRef = useRef(null);
  const endTimeRef  = useRef(null); // wall-clock ms when the timer hits 0
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; });

  const tick = useCallback(() => {
    if (!endTimeRef.current) return;
    const remaining = Math.max(0, Math.round((endTimeRef.current - Date.now()) / 1000));
    setTimeLeft(remaining);
    if (remaining <= 0) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
      endTimeRef.current = null;
      setIsRunning(false);
      setHasStarted(false);
      playFinishSound();
      if (onCompleteRef.current) onCompleteRef.current();
    }
  }, []);

  useEffect(() => {
    if (isRunning) {
      if (!endTimeRef.current) endTimeRef.current = Date.now() + timeLeft * 1000;
      intervalRef.current = setInterval(tick, 1000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning, tick]);

  useEffect(() => {
    const onVisibilityChange = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [tick]);

  const start = () => {
    if (timeLeft === 0) return;
    setIsRunning(true);
    setHasStarted(true);
  };
  const pause = () => { setIsRunning(false); endTimeRef.current = null; };
  const reset = () => { setIsRunning(false); setHasStarted(false); setTimeLeft(totalSecs); endTimeRef.current = null; };
  const setDuration = (secs) => {
    setIsRunning(false);
    setHasStarted(false);
    setTotalSecs(secs);
    setTimeLeft(secs);
    endTimeRef.current = null;
  };

  return { totalSecs, timeLeft, isRunning, hasStarted, setTimeLeft, start, pause, reset, setDuration };
}
