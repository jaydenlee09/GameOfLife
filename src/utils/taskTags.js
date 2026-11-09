// ─── Task tags ────────────────────────────────────────────────────────────────
// A task carries its tags by name: `task.tags = ['School', 'Errands']`. Names match
// case-insensitively, and the first spelling a tag was given wins.
// The tag list itself (order + colors) lives on the user: `user.taskTags =
// [{ name, color }]`. A name used on a task but missing from that list (the AI
// made it, or the list hasn't synced yet) still works: it gets a stable color from
// its name until the user picks one. Pure functions only; no React here.

import { COLOR_SWATCHES } from './blockCategories';

export const TAG_MAX_LEN = 24;
export const TAGS_PER_TASK = 5;

/** "  #school  stuff " → "school stuff" (no leading #, single spaces, capped). */
export const cleanTagName = (name) => String(name ?? '')
  .replace(/^[\s#]+/, '')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, TAG_MAX_LEN)
  .trim();

export const tagKey = (name) => cleanTagName(name).toLowerCase();

/** A task's tags, deduped, ignoring anything malformed in old or synced data. */
export const tagsOf = (task) => {
  if (!Array.isArray(task?.tags)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of task.tags) {
    if (typeof raw !== 'string') continue;
    const name = cleanTagName(raw);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
};

export const hasTag = (task, name) => {
  const key = tagKey(name);
  return !!key && tagsOf(task).some((t) => t.toLowerCase() === key);
};

const registryOf = (registry) => (Array.isArray(registry) ? registry : [])
  .filter((t) => t && typeof t.name === 'string' && cleanTagName(t.name));

const findEntry = (registry, name) => {
  const key = tagKey(name);
  return registryOf(registry).find((t) => tagKey(t.name) === key) || null;
};

// Stable per name, so an unlisted tag looks the same on every device.
const hashColor = (name) => {
  let h = 0;
  for (const ch of tagKey(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLOR_SWATCHES[h % COLOR_SWATCHES.length];
};

const isHex = (c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);

export const tagColor = (name, registry) => {
  const entry = findEntry(registry, name);
  return entry && isHex(entry.color) ? entry.color : hashColor(name);
};

/** The first swatch none of `tags` ({ name, color }) uses yet (then wrap around). */
export const nextTagColor = (registry) => {
  const used = new Set(registryOf(registry).map((t) => String(t.color).toLowerCase()));
  return COLOR_SWATCHES.find((c) => !used.has(c.toLowerCase()))
    || COLOR_SWATCHES[registryOf(registry).length % COLOR_SWATCHES.length];
};

/**
 * Every tag worth showing: the user's list first (in its order), then names only
 * found on tasks (A→Z). `count` = open tasks carrying it.
 */
export const knownTags = (registry, todos) => {
  const out = [];
  const byKey = new Map();
  const push = (name, color) => {
    const key = tagKey(name);
    if (!key || byKey.has(key)) return;
    const tag = { name: cleanTagName(name), color, count: 0 };
    byKey.set(key, tag);
    out.push(tag);
  };
  for (const t of registryOf(registry)) push(t.name, isHex(t.color) ? t.color : hashColor(t.name));
  const extra = [];
  for (const task of todos || []) {
    for (const name of tagsOf(task)) {
      const key = name.toLowerCase();
      if (!byKey.has(key) && !extra.some((n) => n.toLowerCase() === key)) extra.push(name);
    }
  }
  extra.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  for (const name of extra) push(name, hashColor(name));
  for (const task of todos || []) {
    if (task.completed) continue;
    for (const name of tagsOf(task)) byKey.get(name.toLowerCase()).count += 1;
  }
  return out;
};

/** The existing spelling of a tag (from the list or any task), else the cleaned name. */
export const canonicalTag = (name, registry, todos) => {
  const key = tagKey(name);
  if (!key) return '';
  const entry = findEntry(registry, name);
  if (entry) return cleanTagName(entry.name);
  for (const task of todos || []) {
    const hit = tagsOf(task).find((t) => t.toLowerCase() === key);
    if (hit) return hit;
  }
  return cleanTagName(name);
};

/** Names → canonical, deduped, capped list (for the AI and quick add). */
export const resolveTags = (names, registry, todos) => {
  const out = [];
  for (const raw of Array.isArray(names) ? names : []) {
    const name = canonicalTag(raw, registry, todos);
    if (name && !out.some((t) => t.toLowerCase() === name.toLowerCase())) out.push(name);
    if (out.length >= TAGS_PER_TASK) break;
  }
  return out;
};

export const toggleTagIn = (tags, name) => {
  const key = tagKey(name);
  const list = Array.isArray(tags) ? tags : [];
  if (list.some((t) => tagKey(t) === key)) return list.filter((t) => tagKey(t) !== key);
  return list.length >= TAGS_PER_TASK ? list : [...list, cleanTagName(name)];
};

// ── Tag list edits (user.taskTags) ──

/** Adds a tag to the list (no-op if it's there). */
export const addTagTo = (registry, name, color) => {
  const clean = cleanTagName(name);
  if (!clean || findEntry(registry, clean)) return registryOf(registry);
  return [...registryOf(registry), { name: clean, color: isHex(color) ? color : nextTagColor(registry) }];
};

/** Sets a tag's color, adding it to the list if it was task-only. */
export const recolorTagIn = (registry, name, color) => {
  if (!isHex(color)) return registryOf(registry);
  const key = tagKey(name);
  const list = registryOf(registry);
  return list.some((t) => tagKey(t.name) === key)
    ? list.map((t) => (tagKey(t.name) === key ? { ...t, color } : t))
    : [...list, { name: cleanTagName(name), color }];
};

/**
 * Renaming onto another tag's name merges the two (the target keeps its color).
 * Returns the list unchanged for an empty or same name.
 */
export const renameTagIn = (registry, from, to) => {
  const clean = cleanTagName(to);
  const fromKey = tagKey(from);
  const list = registryOf(registry);
  if (!clean || !fromKey) return list;
  const target = list.find((t) => tagKey(t.name) === clean.toLowerCase() && tagKey(t.name) !== fromKey);
  if (target) return list.filter((t) => tagKey(t.name) !== fromKey);
  const own = list.find((t) => tagKey(t.name) === fromKey);
  if (!own) return [...list, { name: clean, color: tagColor(from, list) }];
  return list.map((t) => (t === own ? { ...t, name: clean } : t));
};

export const removeTagFrom = (registry, name) => {
  const key = tagKey(name);
  return registryOf(registry).filter((t) => tagKey(t.name) !== key);
};

// ── Task edits (todos) ──

export const renameTagOnTasks = (todos, from, to) => {
  const clean = cleanTagName(to);
  const fromKey = tagKey(from);
  if (!clean || !fromKey) return todos;
  return (todos || []).map((task) => {
    if (!hasTag(task, from)) return task;
    const tags = [];
    for (const t of tagsOf(task)) {
      const next = t.toLowerCase() === fromKey ? clean : t;
      if (!tags.some((x) => x.toLowerCase() === next.toLowerCase())) tags.push(next);
    }
    return { ...task, tags };
  });
};

export const removeTagFromTasks = (todos, name) => (todos || []).map((task) => (
  hasTag(task, name) ? { ...task, tags: tagsOf(task).filter((t) => tagKey(t) !== tagKey(name)) } : task
));

/** Keep only tasks carrying `name` in every bucket bucketTasks() returns. */
export const filterBuckets = (buckets, name) => {
  if (!name) return buckets;
  const keep = (list) => list.filter((t) => hasTag(t, name));
  return {
    ...buckets,
    top: keep(buckets.top),
    carried: keep(buckets.carried),
    today: keep(buckets.today),
    upcoming: keep(buckets.upcoming),
    doneToday: keep(buckets.doneToday),
    later: Object.fromEntries(Object.entries(buckets.later).map(([k, list]) => [k, keep(list)])),
  };
};
