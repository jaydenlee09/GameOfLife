import { Dumbbell, Brain, Sparkles, Target, Wind, Heart, Crosshair, Palette, Zap } from 'lucide-react';

const STAT_META = {
  strength:     { label: 'Strength',      Icon: Dumbbell,   color: '#ef4444' },
  intelligence: { label: 'Intelligence',  Icon: Brain,      color: '#818cf8' },
  charisma:     { label: 'Charisma',      Icon: Sparkles,   color: '#f472b6' },
  discipline:   { label: 'Discipline',    Icon: Target,     color: '#fb923c' },
  mentalHealth: { label: 'Mental Health', Icon: Wind,       color: '#34d399' },
  health:       { label: 'Health',        Icon: Heart,      color: '#f87171' },
  focus:        { label: 'Focus',         Icon: Crosshair,  color: '#38bdf8' },
  creativity:   { label: 'Creativity',    Icon: Palette,    color: '#c084fc' },
  productivity: { label: 'Productivity',  Icon: Zap,        color: '#fbbf24' },
};

export default STAT_META;
