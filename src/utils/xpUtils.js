/**
 * Returns the XP required to level up FROM the given level.
 * Level 1 → 100 XP, Level 2 → 125 XP, Level 3 → 150 XP, etc.
 */
export const xpCapForLevel = (level) => 100 + (level - 1) * 25;

/**
 * XP for a completed focus session — EARNED, not self-assigned.
 * 1 XP per minute actually focused. Because the reward is gated by real elapsed
 * time on the timer, it can't be inflated the way a "pick your reward" menu can.
 */
export const xpForFocusMinutes = (mins) => Math.max(1, Math.round(mins));

/**
 * XP for a completed calendar time block — 1 XP per scheduled minute, so the
 * reward scales with how much time you actually committed rather than a free
 * 1–500 field the user typed in.
 */
export const xpForBlockMinutes = (mins) => Math.max(1, Math.round(mins));
