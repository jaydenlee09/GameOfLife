export const getScreentimeStatus = (h) => h <= 1 ? 'ideal' : h <= 3 ? 'toomuch' : 'excessive';
export const SCREENTIME_COLORS = { ideal: '#30d158', toomuch: '#ff9f0a', excessive: '#ff453a' };

// Mirrors the Daily Log sleep-result banding (good/ok/bad).
export const getSleepStatus = (h) => (h >= 8 && h <= 10) ? 'good' : h >= 6 ? 'ok' : 'bad';
export const SLEEP_COLORS = { good: '#30d158', ok: '#ff9f0a', bad: '#ff453a' };
