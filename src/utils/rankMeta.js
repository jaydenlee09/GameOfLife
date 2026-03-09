import bronzeBadge       from '../assets/badges/bronze.png';
import silverBadge       from '../assets/badges/silver.png';
import goldBadge         from '../assets/badges/gold.png';
import platinumBadge     from '../assets/badges/platinum.png';
import masterBadge       from '../assets/badges/master.png';
import championBadge     from '../assets/badges/champion.png';
import grandChampionBadge from '../assets/badges/grand_champion.png';
import supremeBadge      from '../assets/badges/supreme.png';

const RANKS = [
  { name: 'Bronze',        minLevel: 1,  maxLevel: 5,   badge: bronzeBadge,        color: '#cd7f32' },
  { name: 'Silver',        minLevel: 6,  maxLevel: 10,  badge: silverBadge,        color: '#c0c0c0' },
  { name: 'Gold',          minLevel: 11, maxLevel: 20,  badge: goldBadge,          color: '#fbbf24' },
  { name: 'Platinum',      minLevel: 21, maxLevel: 30,  badge: platinumBadge,      color: '#67e8f9' },
  { name: 'Master',        minLevel: 31, maxLevel: 45,  badge: masterBadge,        color: '#c084fc' },
  { name: 'Champion',      minLevel: 46, maxLevel: 60,  badge: championBadge,      color: '#f97316' },
  { name: 'Grand Champion',minLevel: 61, maxLevel: 80,  badge: grandChampionBadge, color: '#ef4444' },
  { name: 'Supreme',       minLevel: 81, maxLevel: Infinity, badge: supremeBadge,  color: '#fbbf24' },
];

export const getRankForLevel = (level) =>
  RANKS.find(r => level >= r.minLevel && level <= r.maxLevel) || RANKS[0];

// Returns the rank for a given level, or null if the level is NOT the first level of that rank
// (used to detect rank-up moments)
export const getRankUpAtLevel = (level) => {
  const rank = getRankForLevel(level);
  return level === rank.minLevel ? rank : null;
};

export default RANKS;
