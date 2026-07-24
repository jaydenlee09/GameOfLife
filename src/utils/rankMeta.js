import { CloudOff, Hammer, Waves, Lock, Sparkles } from 'lucide-react';

// Rank tiers. Rank is a "maintain" system (see scoreUtils.js#computeRankStatus):
// to HOLD a tier, the Daily Score must clear that tier's own `min` threshold for
// REQUIRED_STREAK_DAYS consecutive days running — so rank is reversible and fully
// traceable to real recent behavior, not a blended average or lifetime level/XP.
//
// Order matters: worst → best. Consumers compare tiers via RANK_TIERS.indexOf(...)
// to determine whether a transition was an improvement or a slip.
// `max` is currently unused (no consumer buckets a raw score into a tier anymore)
// — kept for documentation/possible future use (e.g. a range tooltip).
export const RANK_TIERS = [
  { name: 'Drifting',   min: 0,   max: 2.9,        color: '#94a3b8', icon: 'CloudOff' },
  { name: 'Building',   min: 3.0, max: 4.9,        color: '#60a5fa', icon: 'Hammer'   },
  { name: 'Steady',     min: 5.0, max: 6.4,        color: '#34d399', icon: 'Waves'    },
  { name: 'Locked In',  min: 6.5, max: 8.4,        color: '#fbbf24', icon: 'Lock'     },
  { name: 'Peak State', min: 8.5, max: Infinity,   color: '#f472b6', icon: 'Sparkles' },
];

export const TIER_ICONS = { CloudOff, Hammer, Waves, Lock, Sparkles };

export default RANK_TIERS;
