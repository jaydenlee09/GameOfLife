import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './index.css';
import './App.css';
import WelcomePage from './components/WelcomePage.jsx';

const toKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const today = new Date();
const todayKey = toKey(today);
const yesterday = new Date(today);
yesterday.setDate(yesterday.getDate() - 1);
const yesterdayKey = toKey(yesterday);
const tomorrow = new Date(today);
tomorrow.setDate(tomorrow.getDate() + 1);
const tomorrowKey = toKey(tomorrow);

const isEmpty = new URLSearchParams(window.location.search).get('empty') === '1';

const populatedProps = {
  user: { name: 'Jayden' },
  todos: [
    { id: 't1', text: 'Write project proposal', timeFrame: 'today', xp: 30, categories: ['tasks'] },
    { id: 't2', text: 'Review pull request from teammate', timeFrame: 'today', xp: 20, categories: ['tasks'] },
    { id: 't3', text: 'Call the dentist', timeFrame: 'today', xp: 10, categories: ['tasks'] },
  ],
  setTodos: () => {},
  onUpdateStat: () => {},
  calendarEvents: [],
  noPhoneBlocks: [],
  calendarDayEvents: { [tomorrowKey]: [{ id: 'r1', title: 'Team standup', time: '09:30' }] },
  currentWeekPriority: 'Ship the WelcomePage redesign and get feedback',
  logs: {
    [todayKey]: { emotions: ['calm'], proud: ['Shipped the redesign'] },
    [yesterdayKey]: { commitment: 'No phone after 10pm' },
  },
  commitmentArchive: [{ date: yesterdayKey, confirmedOn: Date.now(), denied: false }],
  goals: [
    { id: 'g1', title: 'Ship the redesign', period: 'monthly', periodKey: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`, pinned: true, completed: false, milestones: [{ id: 'm1', completed: true }, { id: 'm2', completed: false }] },
    { id: 'g2', title: 'Read 12 books', period: 'yearly', periodKey: String(today.getFullYear()), pinned: false, completed: false, targetValue: 12, currentValue: 5 },
  ],
  habits: [
    { id: 'h1', name: 'Read', history: { [todayKey]: true } },
    { id: 'h2', name: 'Exercise', history: {} },
  ],
  xpLog: [
    { source: 'task', date: todayKey },
    { source: 'task', date: todayKey },
  ],
  pomodoroSessions: [{ date: todayKey, completed: true, durationSecs: 1800 }],
  onNavigate: (page) => console.log('navigate ->', page),
};

const emptyProps = {
  user: { name: 'Jayden' },
  todos: [],
  setTodos: () => {},
  onUpdateStat: () => {},
  calendarEvents: [],
  noPhoneBlocks: [],
  calendarDayEvents: {},
  currentWeekPriority: '',
  logs: {},
  commitmentArchive: [],
  goals: [],
  habits: [],
  xpLog: [],
  pomodoroSessions: [],
  onNavigate: (page) => console.log('navigate ->', page),
};

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <div className="app-container">
      <div className="content-container">
        <WelcomePage {...(isEmpty ? emptyProps : populatedProps)} />
      </div>
    </div>
  </StrictMode>,
);
