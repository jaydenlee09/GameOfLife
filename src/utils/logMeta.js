import {
  Smile, Crown, HandHeart, Waves, Target, Flame, Dumbbell, Sparkles,
  Moon, AlertTriangle, CircleAlert, Angry, Frown, LoaderPinwheel, Meh, Rocket,
} from 'lucide-react';

// Emotions available for daily log multi-select
const EMOTIONS = [
  { id: 'happy',       label: 'Happy',       Icon: Smile, color: '#fbbf24' },
  { id: 'proud',       label: 'Proud',       Icon: Crown, color: '#f97316' },
  { id: 'grateful',    label: 'Grateful',    Icon: HandHeart, color: '#34d399' },
  { id: 'calm',        label: 'Calm',        Icon: Waves, color: '#38bdf8' },
  { id: 'focused',     label: 'Focused',     Icon: Target, color: '#818cf8' },
  { id: 'motivated',   label: 'Motivated',   Icon: Flame, color: '#fb923c' },
  { id: 'confident',   label: 'Confident',   Icon: Dumbbell, color: '#facc15' },
  { id: 'creative',    label: 'Creative',    Icon: Sparkles, color: '#c084fc' },
  { id: 'tired',       label: 'Tired',       Icon: Moon, color: '#94a3b8' },
  { id: 'stressed',    label: 'Stressed',    Icon: AlertTriangle, color: '#f87171' },
  { id: 'anxious',     label: 'Anxious',     Icon: CircleAlert, color: '#fb7185' },
  { id: 'frustrated',  label: 'Frustrated',  Icon: Angry, color: '#ef4444' },
  { id: 'sad',         label: 'Sad',         Icon: Frown, color: '#60a5fa' },
  { id: 'overwhelmed', label: 'Overwhelmed', Icon: LoaderPinwheel, color: '#a78bfa' },
  { id: 'bored',       label: 'Bored',       Icon: Meh, color: '#6b7280' },
  { id: 'excited',     label: 'Excited',     Icon: Rocket, color: '#4ade80' },
];

export default EMOTIONS;
