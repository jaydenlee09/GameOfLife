// All predefined challenges. xp: 30 = daily, 40 = full-day, 100 = week-long.
const CHALLENGES_POOL = [
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
    duration: 'fullDay',
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
    duration: 'fullDay',
  },
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
];

export default CHALLENGES_POOL;
