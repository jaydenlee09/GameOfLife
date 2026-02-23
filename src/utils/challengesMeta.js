// All predefined challenges.
// duration: 'daily' (24h), 'weekly' (7d), 'monthly' (30d)
const CHALLENGES_POOL = [
  // ── Daily ─────────────────────────────────────────────────────────────────
  {
    id: 'run_3km',
    text: 'Go on a 3km run',
    xp: 30,
    category: 'health',
    duration: 'daily',
  },
  {
    id: 'no_phone_3h',
    text: 'No phone for 3 hours',
    xp: 30,
    category: 'mentalHealth',
    duration: 'daily',
  },
  {
    id: 'no_phone_day',
    text: 'No phone for the whole day',
    xp: 40,
    category: 'mentalHealth',
    duration: 'daily',
  },
  {
    id: 'drink_water',
    text: 'Drink 4 bottles of water',
    xp: 30,
    category: 'health',
    duration: 'daily',
  },
  {
    id: 'vlog_day',
    text: 'Vlog the entire day hour by hour',
    xp: 40,
    category: 'creativity',
    duration: 'daily',
  },
  // ── Weekly ────────────────────────────────────────────────────────────────
  {
    id: 'sleep_schedule',
    text: 'Sleep at the same time for one week',
    xp: 100,
    category: 'discipline',
    duration: 'weekly',
  },
  {
    id: 'no_sugar_week',
    text: 'No sugar for the whole week',
    xp: 100,
    category: 'health',
    duration: 'weekly',
  },
  {
    id: 'pushups_week',
    text: '50 pushups everyday for a week',
    xp: 100,
    category: 'strength',
    duration: 'weekly',
  },
  // ── Monthly ───────────────────────────────────────────────────────────────
  {
    id: 'meditate_month',
    text: '5 minute meditation everyday for a month',
    xp: 500,
    category: 'mentalHealth',
    duration: 'monthly',
  },
  {
    id: 'no_junk_month',
    text: 'No junk food for a month',
    xp: 500,
    category: 'health',
    duration: 'monthly',
  },
];

export default CHALLENGES_POOL;
