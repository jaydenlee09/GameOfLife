// ─── Time-block categories ────────────────────────────────────────────────────
// A block's color says what area of life it belongs to (Academic, Work, Fitness…).
// The category is picked, in order of priority, by:
//   1. the user (block editor)            → stored as `category`, `categoryBy: 'user'`
//   2. the AI (My Assistant, Plan My Day,  → stored as `category`, `categoryBy: 'ai'`
//      or the background sort in App.jsx for titles no keyword matches)
//   3. a keyword in the title             → never stored, derived at render
// A block may also carry a custom `color` (hex) that beats its category's color.
// Category colors themselves can be changed app-wide (`user.categoryColors`).

const STR = (description) => ({ type: 'STRING', description });

// Priority order matters for single words: the first category with a match wins.
// Phrases (2+ words) are checked across every category first, so "run errands"
// is Chores before "run" can make it Fitness.
export const BLOCK_CATEGORIES = [
  {
    id: 'academic', label: 'Academic', color: '#38bdf8',
    hint: 'school, classes, studying, homework, exams, courses',
    words: ['school', 'class', 'classes', 'lecture', 'study', 'studying', 'homework', 'hw', 'exam', 'test', 'quiz',
      'midterm', 'finals', 'essay', 'assignment', 'lab', 'tutor', 'tutoring', 'revision', 'revise', 'math', 'maths',
      'calculus', 'algebra', 'geometry', 'physics', 'chemistry', 'chem', 'biology', 'bio', 'history', 'english',
      'spanish', 'french', 'science', 'econ', 'economics', 'psychology', 'college', 'university', 'uni', 'course',
      'coursework', 'flashcard', 'flashcards', 'ap', 'seminar', 'thesis', 'textbook', 'sat', 'office hours',
      'study hall', 'book report', 'college app', 'college apps'],
  },
  {
    id: 'fitness', label: 'Fitness', color: '#30d158',
    hint: 'exercise, gym, sports, training',
    words: ['gym', 'workout', 'work out', 'exercise', 'run', 'running', 'jog', 'jogging', 'lift', 'lifting', 'weights',
      'cardio', 'yoga', 'pilates', 'swim', 'swimming', 'bike', 'biking', 'cycling', 'hike', 'hiking', 'walk',
      'stretch', 'stretching', 'training', 'soccer', 'basketball', 'football', 'tennis', 'volleyball', 'baseball',
      'hockey', 'golf', 'boxing', 'climbing', 'crossfit', 'sport', 'sports', 'pushups', 'push-ups',
      'abs', 'leg day', 'martial arts', 'karate', 'cross country'],
  },
  {
    id: 'social', label: 'Social', color: '#ff375f',
    hint: 'friends, family, dates, time with people',
    words: ['friends', 'friend', 'family', 'date', 'party', 'hangout', 'hang out', 'birthday', 'wedding', 'mom', 'dad',
      'grandma', 'grandpa', 'brother', 'sister', 'girlfriend', 'boyfriend', 'gf', 'bf', 'catch up', 'meetup',
      'game night', 'dinner with', 'lunch with'],
  },
  {
    id: 'health', label: 'Health', color: '#40c8e0',
    hint: 'sleep, meals, meditation, doctor, self-care routines',
    words: ['sleep', 'meditate', 'meditation', 'doctor', 'dentist', 'therapy', 'therapist', 'meal prep', 'breakfast',
      'lunch', 'dinner', 'cook', 'cooking', 'shower', 'skincare', 'self care', 'self-care', 'journal', 'journaling',
      'mindfulness', 'breathing', 'wind down', 'bedtime', 'bed time', 'morning routine', 'night routine',
      'evening routine', 'vitamins', 'physio', 'checkup', 'check-up', 'blood test', 'eat'],
  },
  {
    id: 'work', label: 'Work', color: '#5e5ce6',
    hint: 'job, shifts, meetings, career tasks',
    words: ['work', 'job', 'shift', 'meeting', 'meetings', 'standup', 'stand-up', 'client', 'office', 'email', 'emails',
      'inbox', 'interview', 'internship', 'deep work', 'presentation', 'report', 'deadline', 'business', 'invoice'],
  },
  {
    id: 'chores', label: 'Chores', color: '#ffd60a',
    hint: 'housework, errands, shopping, bills and admin',
    words: ['laundry', 'clean', 'cleaning', 'tidy', 'chore', 'chores', 'errand', 'errands', 'run errands', 'groceries',
      'grocery', 'shopping', 'dishes', 'vacuum', 'trash', 'walk the dog', 'walk dog', 'bills', 'pay bills', 'bank',
      'car wash', 'oil change', 'organize', 'declutter', 'post office', 'pharmacy', 'pack', 'packing', 'mow'],
  },
  {
    id: 'creative', label: 'Creative', color: '#bf5af2',
    hint: 'music, art, writing, coding or side projects, making things',
    words: ['guitar', 'piano', 'drums', 'violin', 'music', 'sing', 'singing', 'draw', 'drawing', 'paint', 'painting',
      'art', 'writing', 'blog', 'photography', 'video editing', 'edit video', 'design', 'code', 'coding', 'programming',
      'side project', 'craft', 'knit', 'knitting', 'sew', 'sewing', 'compose', 'film', 'filming'],
  },
  {
    id: 'rest', label: 'Rest & fun', color: '#ff9f0a',
    hint: 'games, TV, videos, relaxing, breaks',
    words: ['games', 'gaming', 'game', 'video games', 'tv', 'netflix', 'youtube', 'movie', 'movies', 'nap', 'relax',
      'chill', 'break', 'rest', 'free time', 'anime', 'downtime'],
  },
  { id: 'other', label: 'Other', color: '#8e8e93', hint: 'anything that fits none of the above', words: [] },
];

export const CATEGORY_IDS = BLOCK_CATEGORIES.map((c) => c.id);
const BY_ID = Object.fromEntries(BLOCK_CATEGORIES.map((c) => [c.id, c]));

export const isCategoryId = (id) => typeof id === 'string' && Object.hasOwn(BY_ID, id);
export const categoryMeta = (id) => BY_ID[id] || BY_ID.other;

const HEX = /^#[0-9a-f]{6}$/i;
export const isHexColor = (value) => typeof value === 'string' && HEX.test(value);

// One regex per category for phrases and one for single words. A word may take a
// plural "s"/"es" ("classes", "errands"); hyphens and spaces in phrases are flexible.
const escape = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[\s-]+/g, '[\\s-]+');
const buildRegex = (words) => (words.length
  ? new RegExp(`(?:^|[^a-z0-9])(?:${words.map(escape).join('|')})(?:e?s)?(?=$|[^a-z0-9])`, 'i')
  : null);
const MATCHERS = BLOCK_CATEGORIES.map((c) => ({
  id: c.id,
  phrases: buildRegex(c.words.filter((w) => /[\s-]/.test(w))),
  single: buildRegex(c.words.filter((w) => !/[\s-]/.test(w))),
}));

/** The category a title's keywords point to, or null when none match. */
export const guessCategory = (title) => {
  const text = typeof title === 'string' ? title.trim() : '';
  if (!text) return null;
  const phrase = MATCHERS.find((m) => m.phrases?.test(text));
  if (phrase) return phrase.id;
  return MATCHERS.find((m) => m.single?.test(text))?.id ?? null;
};

/** A block's category: stored (user/AI) first, then keywords, else Other. */
export const blockCategory = (ev) => (isCategoryId(ev?.category) ? ev.category : guessCategory(ev?.title) || 'other');

/** A category's color, honoring the user's app-wide overrides. */
export const categoryColor = (id, overrides) => {
  const custom = overrides?.[id];
  return isHexColor(custom) ? custom : categoryMeta(id).color;
};

/** The color a block is drawn in: its own custom color, else its category's. */
export const blockColor = (ev, overrides) => (isHexColor(ev?.color) ? ev.color : categoryColor(blockCategory(ev), overrides));

/** True when only the AI can say what this block is (no stored category, no keyword). */
export const needsAiCategory = (ev) => !isCategoryId(ev?.category)
  && typeof ev?.title === 'string' && ev.title.trim() !== '' && !guessCategory(ev.title);

/** Fields to store when the AI picks a category (anything invalid stores nothing). */
export const aiCategoryFields = (category) => (isCategoryId(category) ? { category, categoryBy: 'ai' } : {});

/** "academic (school, classes, …); work (…); …" for prompts and tool descriptions. */
export const CATEGORY_GUIDE = BLOCK_CATEGORIES.map((c) => `${c.id} (${c.hint})`).join('; ');

// ─── Background sort for titles no keyword matches ───────────────────────────
export const MAX_SORT_TITLES = 40;

export const CATEGORY_SORT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    results: {
      type: 'ARRAY',
      description: 'One entry per title you were given.',
      items: {
        type: 'OBJECT',
        properties: {
          index: { type: 'INTEGER', description: 'The number of the title in the list.' },
          category: { type: 'STRING', enum: CATEGORY_IDS },
        },
        required: ['index', 'category'],
        propertyOrdering: ['index', 'category'],
      },
    },
  },
  required: ['results'],
};

const SORT_SYSTEM_PROMPT = `You sort calendar time-block titles from a personal planner app into exactly one category each.

CATEGORIES: ${CATEGORY_GUIDE}.

RULES:
- Pick what the person is most likely doing in that block. The owner is often a student, so school subjects and study work are academic.
- Use "other" only when nothing fits.
- Return one result for every numbered title.`;

/** Validates the model's JSON into { [title]: categoryId } for the titles asked about. */
export const normalizeCategorySort = (raw, titles) => {
  const data = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw;
  const out = {};
  for (const r of Array.isArray(data?.results) ? data.results : []) {
    const title = titles[Number(r?.index) - 1];
    if (title && isCategoryId(r?.category)) out[title] = r.category;
  }
  return out;
};

/** One tool-free call that sorts up to MAX_SORT_TITLES titles. `generate` = geminiGenerateJson. */
export const sortTitlesIntoCategories = async ({ titles, generate }) => {
  const list = titles.slice(0, MAX_SORT_TITLES);
  if (!list.length) return {};
  const response = await generate({
    systemPrompt: SORT_SYSTEM_PROMPT,
    contents: [{ role: 'user', parts: [{ text: list.map((t, i) => `${i + 1}. ${t}`).join('\n') }] }],
    schema: CATEGORY_SORT_SCHEMA,
  });
  return normalizeCategorySort(response.text, list);
};

// ─── Saving ───────────────────────────────────────────────────────────────────
/** The category/color fields a block carries over when it is copied or detached. */
export const storedCategoryFields = (ev) => ({
  ...(isCategoryId(ev?.category) ? { category: ev.category, categoryBy: ev.categoryBy === 'user' ? 'user' : 'ai' } : {}),
  ...(isHexColor(ev?.color) ? { color: ev.color } : {}),
});

/**
 * The block editor's category state. `category` is the user's own pick (null = Auto);
 * `aiCategory` is what the AI stored before, kept only while the title is unchanged.
 */
export const categoryFormFields = (ev) => {
  const stored = isCategoryId(ev?.category) ? ev.category : null;
  const byUser = ev?.categoryBy === 'user';
  return {
    category: byUser ? stored : null,
    aiCategory: byUser ? null : stored,
    origTitle: ev?.title || '',
    color: isHexColor(ev?.color) ? ev.color : '',
  };
};

/** What Auto resolves to in the editor right now (null = nothing yet; the AI sorts it after saving). */
export const autoCategoryForForm = (form) => (form.aiCategory && form.title.trim() === form.origTitle.trim()
  ? form.aiCategory
  : guessCategory(form.title));

/** Applies the editor's category/color choice to a block, removing fields that no longer apply. */
export const applyCategoryForm = (ev, form) => {
  // eslint-disable-next-line no-unused-vars
  const { category, categoryBy, color, ...rest } = ev;
  const keepAi = form.aiCategory && form.title.trim() === form.origTitle.trim();
  return {
    ...rest,
    ...(isCategoryId(form.category) ? { category: form.category, categoryBy: 'user' } : keepAi ? { category: form.aiCategory, categoryBy: 'ai' } : {}),
    ...(isHexColor(form.color) ? { color: form.color } : {}),
  };
};

// Swatches offered for a block's custom color and for recoloring a category.
export const COLOR_SWATCHES = ['#38bdf8', '#5e5ce6', '#30d158', '#40c8e0', '#ff375f', '#ffd60a', '#bf5af2', '#ff9f0a', '#8e8e93', '#f87171', '#a3e635', '#f472b6'];
