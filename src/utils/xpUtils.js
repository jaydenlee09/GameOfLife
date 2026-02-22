/**
 * Returns the XP required to level up FROM the given level.
 * Level 1 → 100 XP, Level 2 → 125 XP, Level 3 → 150 XP, etc.
 */
export const xpCapForLevel = (level) => 100 + (level - 1) * 25;
