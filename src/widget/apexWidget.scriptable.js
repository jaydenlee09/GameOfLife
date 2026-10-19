// APEX Home Screen widget for Scriptable (https://scriptable.app).
// Paste this whole script into a new Scriptable script, then add a Scriptable
// widget to your Home Screen and pick this script. Large is the full layout;
// small, medium and Lock Screen sizes show a shorter version.
//
// It reads a read-only summary that APEX publishes. iOS decides when widgets
// refresh (usually every 5–15 minutes); the "now / next" part uses the phone's
// clock, so it stays right between refreshes.
//
// The link below is private to you. Anyone with it can see this summary, so don't
// share the script. APEX → My Assistant → Alerts → "Reset link" makes a new one.

const DOC_URL = '__APEX_DOC_URL__';
const APP_URL = '__APEX_APP_URL__';

// ── Look (APEX graphite + blue) ──────────────────────────────────────────────
const C = {
  bgTop: new Color('#1c1c1e'),
  bgBottom: new Color('#000000'),
  card: new Color('#ffffff', 0.07),
  text: new Color('#ffffff', 0.92),
  dim: new Color('#ffffff', 0.55),
  faint: new Color('#ffffff', 0.32),
  accent: new Color('#38bdf8'),
  good: new Color('#30d158'),
  track: new Color('#ffffff', 0.12),
};
const font = {
  bold: (n) => Font.boldSystemFont(n),
  semi: (n) => Font.semiboldSystemFont(n),
  med: (n) => Font.mediumSystemFont(n),
  reg: (n) => Font.systemFont(n),
};

// ── Time helpers (phone clock = your timezone) ───────────────────────────────
const pad = (n) => String(n).padStart(2, '0');
const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const clock = (ms) => {
  const d = new Date(ms);
  const h = d.getHours();
  const m = d.getMinutes();
  return `${h % 12 === 0 ? 12 : h % 12}${m ? `:${pad(m)}` : ''} ${h < 12 ? 'AM' : 'PM'}`;
};
const span = (item) => (item.startMs === item.endMs ? clock(item.startMs) : `${clock(item.startMs)} – ${clock(item.endMs)}`);
const remaining = (targetMs, nowMs) => {
  const mins = Math.max(1, Math.ceil((targetMs - nowMs) / 60000));
  const h = Math.floor(mins / 60);
  return h > 0 ? `${h}h ${mins % 60}m` : `${mins}m`;
};
const ago = (ms, nowMs) => {
  const mins = Math.round((nowMs - ms) / 60000);
  return mins < 60 ? `${mins}m ago` : `${Math.round(mins / 60)}h ago`;
};
const pageUrl = (page) => (page ? `${APP_URL}/?page=${page}` : APP_URL);

// ── Data ─────────────────────────────────────────────────────────────────────
const fm = FileManager.local();
const cachePath = fm.joinPath(fm.cacheDirectory(), 'apex-widget.json');

const load = async () => {
  try {
    const req = new Request(DOC_URL);
    req.timeoutInterval = 15;
    const res = await req.loadJSON();
    if (res.error) {
      return { problem: res.error.code === 404 ? 'This widget link was reset or turned off. Copy the new script from APEX.' : 'APEX blocked the widget. Check the Firestore rule.' };
    }
    const snapshot = JSON.parse(res.fields?.json?.stringValue || 'null');
    fm.writeString(cachePath, JSON.stringify(snapshot));
    return { snapshot };
  } catch {
    // Offline: show the last copy rather than nothing.
    if (fm.fileExists(cachePath)) return { snapshot: JSON.parse(fm.readString(cachePath)), offline: true };
    return { problem: 'Can’t reach APEX right now.' };
  }
};

/** What's on now / next, from the snapshot's ranges and the phone's clock (mirrors Home). */
const nowNext = (s, nowMs) => {
  const items = s.items || [];
  const today = dateKey(new Date(nowMs));
  const current = items.find((i) => i.kind === 'event' && i.startMs <= nowMs && nowMs < i.endMs) || null;
  const noPhone = items.find((i) => i.kind === 'block' && i.startMs <= nowMs && nowMs < i.endMs) || null;
  const next = items.filter((i) => i.startMs > nowMs).sort((a, b) => a.startMs - b.startMs)[0] || null;
  return { current, noPhone, next, nextIsToday: !!next && dateKey(new Date(next.startMs)) === today };
};

const goalText = (score) => (score.toThreshold > 0
  ? `${score.toThreshold.toFixed(1)} to go ${score.streak > 0 ? 'to keep your streak' : 'to start a streak'}`
  : score.streak > 0 ? `Streak safe · ${score.streak} day${score.streak === 1 ? '' : 's'}` : 'Streak safe today');

const rankText = (rank) => (rank.next
  ? `${rank.name} · ${Math.min(rank.next.days, rank.requiredDays)}/${rank.requiredDays} days at ${rank.next.min}+ for ${rank.next.name}`
  : `${rank.name} · top rank, hold it`);

// When the next thing changes on screen, so iOS can refresh around then.
const nextBoundary = (s, nowMs) => {
  const times = (s?.items || []).flatMap((i) => [i.startMs, i.endMs]).filter((t) => t > nowMs);
  return times.length ? Math.min(...times) : Infinity;
};

// ── Drawing ──────────────────────────────────────────────────────────────────
const ring = (value, color, size, { label = true, mono = false } = {}) => {
  const ctx = new DrawContext();
  const px = size * 3;
  ctx.size = new Size(px, px);
  ctx.opaque = false;
  ctx.respectScreenScale = false;
  const lw = px * 0.11;
  const r = (px - lw) / 2;
  const c = px / 2;
  ctx.setLineWidth(lw);
  ctx.setStrokeColor(mono ? new Color('#ffffff', 0.25) : C.track);
  ctx.strokeEllipse(new Rect(lw / 2, lw / 2, px - lw, px - lw));
  const frac = Math.max(0, Math.min(1, (value || 0) / 10));
  if (frac > 0) {
    const path = new Path();
    const steps = Math.max(2, Math.round(120 * frac));
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const a = -Math.PI / 2 + (2 * Math.PI * frac * i) / steps;
      pts.push(new Point(c + r * Math.cos(a), c + r * Math.sin(a)));
    }
    path.addLines(pts);
    ctx.addPath(path);
    ctx.setStrokeColor(mono ? Color.white() : color);
    ctx.strokePath();
  }
  if (label) {
    ctx.setFont(Font.boldRoundedSystemFont(px * 0.3));
    ctx.setTextColor(mono ? Color.white() : C.text);
    ctx.setTextAlignedCenter();
    const text = value == null ? '–' : value.toFixed(1);
    ctx.drawTextInRect(text, new Rect(0, c - px * 0.2, px, px * 0.4));
  }
  return ctx.getImage();
};

const text = (stack, str, f, color, lines = 1) => {
  const t = stack.addText(str);
  t.font = f;
  t.textColor = color;
  t.lineLimit = lines;
  t.minimumScaleFactor = 0.8;
  return t;
};

const symbol = (stack, name, size, color) => {
  const sym = SFSymbol.named(name);
  if (!sym) return null;
  sym.applyFont(Font.semiboldSystemFont(size));
  const img = stack.addImage(sym.image);
  img.imageSize = new Size(size + 2, size + 2);
  img.tintColor = color;
  return img;
};

const card = (parent, url) => {
  const s = parent.addStack();
  s.layoutVertically();
  s.backgroundColor = C.card;
  s.cornerRadius = 14;
  s.setPadding(8, 11, 8, 11);
  if (url) s.url = url;
  return s;
};

const fullWidth = (stack) => {
  const row = stack.addStack();
  row.layoutHorizontally();
  return row;
};

const sectionLabel = (stack, str, color = C.dim) => text(stack, str.toUpperCase(), font.bold(10), color);

// ── Sections ─────────────────────────────────────────────────────────────────
const header = (w, s, nowMs, { compact = false } = {}) => {
  const row = w.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();
  row.url = pageUrl(null);
  const size = compact ? 46 : 52;
  const img = row.addImage(ring(s.score.value, new Color(s.score.color), size));
  img.imageSize = new Size(size, size);
  row.addSpacer(12);
  const col = row.addStack();
  col.layoutVertically();
  const top = fullWidth(col);
  text(top, 'Daily Score', font.semi(12), C.dim);
  top.addSpacer();
  if (nowMs - s.generatedAt > 30 * 60000) text(top, ago(s.generatedAt, nowMs), font.reg(10), C.faint);
  col.addSpacer(2);
  const goalRow = fullWidth(col);
  goalRow.centerAlignContent();
  const safe = s.score.toThreshold <= 0;
  symbol(goalRow, safe ? 'checkmark.circle.fill' : 'flame.fill', 12, safe ? C.good : new Color('#ff9f0a'));
  goalRow.addSpacer(4);
  text(goalRow, goalText(s.score), font.bold(compact ? 13 : 15), C.text);
  if (!compact) {
    col.addSpacer(3);
    const rankRow = fullWidth(col);
    text(rankRow, rankText(s.rank), font.med(11), new Color(s.rank.color));
  }
};

const nowSection = (w, s, nowMs, { compact = false } = {}) => {
  const { current, noPhone, next, nextIsToday } = nowNext(s, nowMs);
  const box = card(w, pageUrl('calendar'));
  const top = fullWidth(box);
  const titleSize = compact ? 14 : 16;

  const bar = (color) => {
    const b = top.addStack();
    b.size = new Size(4, compact ? 30 : 38);
    b.backgroundColor = new Color(color);
    b.cornerRadius = 2;
    top.addSpacer(9);
  };

  const body = (label, labelColor, title, meta) => {
    const col = top.addStack();
    col.layoutVertically();
    sectionLabel(col, label, labelColor);
    col.addSpacer(1);
    text(col, title, font.bold(titleSize), C.text);
    if (meta) {
      col.addSpacer(1);
      text(col, meta, font.reg(11), C.dim);
    }
    top.addSpacer();
  };

  if (current) {
    bar(current.color);
    const then = next && nextIsToday ? ` · Then ${next.label} at ${clock(next.startMs)}` : '';
    body(`Now · ends in ${remaining(current.endMs, nowMs)}`, new Color(current.color), current.label, compact ? null : `${span(current)}${then}`);
  } else if (noPhone) {
    bar(noPhone.color);
    const then = next && nextIsToday ? `Then ${next.label} at ${clock(next.startMs)}` : null;
    body(`No Phone · ${remaining(noPhone.endMs, nowMs)} left`, new Color(noPhone.color), noPhone.label, compact ? null : then);
  } else if (next && nextIsToday) {
    bar(next.color);
    body(`Next up · in ${remaining(next.startMs, nowMs)}`, C.accent, next.label, compact ? null : span(next));
  } else {
    bar('#3a3a3c');
    const tomorrow = next && !nextIsToday ? `Tomorrow: ${next.label} at ${clock(next.startMs)}` : 'Tap to plan your day';
    body(s.plannedToday ? 'Open time' : 'Unplanned',
      C.dim, s.plannedToday ? 'Nothing else scheduled' : 'Today isn’t planned yet', compact ? null : tomorrow);
  }
};

const tasksSection = (w, s) => {
  const box = card(w, pageUrl('tasks'));
  const head = fullWidth(box);
  sectionLabel(head, 'Top 3');
  head.addSpacer();
  if (s.tasks.more > 0) text(head, `+${s.tasks.more} more`, font.med(10), C.faint);
  box.addSpacer(3);
  if (!s.tasks.list.length) {
    text(box, 'All clear. Nothing left for today.', font.med(13), C.dim);
    return;
  }
  s.tasks.list.forEach((t, i) => {
    if (i) box.addSpacer(2);
    const row = fullWidth(box);
    row.centerAlignContent();
    symbol(row, t.done ? 'checkmark.circle.fill' : 'circle', 13, t.done ? C.good : C.dim);
    row.addSpacer(7);
    const label = text(row, t.text, font.med(13), t.done ? C.faint : C.text);
    if (t.done) label.textOpacity = 0.9;
    row.addSpacer();
    if (t.top) symbol(row, 'star.fill', 9, new Color('#ffd60a'));
  });
};

const habitsSection = (w, s) => {
  const box = card(w, pageUrl('daily-log'));
  const head = fullWidth(box);
  const done = s.habits.total - s.habits.leftCount;
  sectionLabel(head, 'Habits left');
  head.addSpacer();
  if (s.habits.total) text(head, `${done}/${s.habits.total}`, font.bold(10), C.dim);
  box.addSpacer(3);
  if (!s.habits.total) text(box, 'No habits yet', font.med(13), C.dim);
  else if (!s.habits.leftCount) text(box, 'All done today ✓', font.semi(13), C.good);
  else text(box, s.habits.left.join('  ·  '), font.med(13), C.text);
};

const footer = (w, s, now) => {
  const evening = now.getHours() >= 20;
  const row = w.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();
  row.cornerRadius = 12;
  row.setPadding(7, 11, 7, 11);
  row.backgroundColor = new Color('#38bdf8', 0.14);

  if (evening && s.close?.length) {
    const doneCount = s.close.filter((c) => c.done).length;
    row.url = pageUrl('daily-log');
    symbol(row, doneCount === s.close.length ? 'moon.stars.fill' : 'moon.fill', 12, C.accent);
    row.addSpacer(6);
    const step = s.close.find((c) => !c.done);
    text(row, step ? `Close the day ${doneCount}/${s.close.length} · ${step.label}` : 'Day closed. Well done.', font.semi(12), C.text);
    row.addSpacer();
    return;
  }
  row.url = pageUrl(null);
  symbol(row, 'arrow.right.circle.fill', 12, C.accent);
  row.addSpacer(6);
  if (s.move) {
    text(row, `Next: ${s.move.text}`, font.semi(12), C.text);
    row.addSpacer();
    // Fixed width so a long move truncates instead of squeezing out the points.
    const gain = row.addStack();
    gain.size = new Size(34, 0);
    gain.addSpacer();
    text(gain, `+${s.move.gain.toFixed(1)}`, font.bold(12), C.accent);
  } else {
    text(row, 'Everything that counts today is done.', font.semi(12), C.text);
    row.addSpacer();
  }
};

// ── Layouts ──────────────────────────────────────────────────────────────────
const base = (family) => {
  const w = new ListWidget();
  w.url = pageUrl(null);
  // Lock Screen widgets draw over the wallpaper: no background, no padding.
  if (family.startsWith('accessory')) {
    w.setPadding(0, 0, 0, 0);
    return w;
  }
  const g = new LinearGradient();
  g.colors = [C.bgTop, C.bgBottom];
  g.locations = [0, 1];
  w.backgroundGradient = g;
  return w;
};

const message = (w, title, body) => {
  w.setPadding(16, 16, 16, 16);
  text(w, 'APEX', font.bold(12), C.accent);
  w.addSpacer(6);
  text(w, title, font.bold(15), C.text, 2);
  if (body) {
    w.addSpacer(4);
    text(w, body, font.reg(12), C.dim, 3);
  }
  w.addSpacer();
};

// Sized to fit the smallest large widget (iPhone SE, 321×324). The flexible gaps
// share whatever height is left, so the sections stay evenly spaced on every phone.
const large = (w, s, now) => {
  const nowMs = now.getTime();
  const gap = () => w.addSpacer();
  w.setPadding(12, 14, 12, 14);
  header(w, s, nowMs);
  gap();
  nowSection(w, s, nowMs);
  gap();
  tasksSection(w, s);
  gap();
  habitsSection(w, s);
  gap();
  footer(w, s, now);
};

const medium = (w, s, now) => {
  const nowMs = now.getTime();
  w.setPadding(12, 14, 12, 14);
  header(w, s, nowMs, { compact: true });
  w.addSpacer(8);
  nowSection(w, s, nowMs, { compact: true });
  w.addSpacer();
};

const small = (w, s, now) => {
  const nowMs = now.getTime();
  w.setPadding(12, 12, 12, 12);
  const top = fullWidth(w);
  top.centerAlignContent();
  const img = top.addImage(ring(s.score.value, new Color(s.score.color), 50));
  img.imageSize = new Size(50, 50);
  top.addSpacer(8);
  const col = top.addStack();
  col.layoutVertically();
  text(col, s.score.toThreshold > 0 ? `${s.score.toThreshold.toFixed(1)} to go` : 'Safe', font.bold(13), C.text);
  text(col, `${s.score.streak}d streak`, font.med(11), C.dim);
  w.addSpacer();
  const { current, next, nextIsToday } = nowNext(s, nowMs);
  const item = current || (nextIsToday ? next : null);
  if (item) {
    sectionLabel(w, current ? `Now · ${remaining(current.endMs, nowMs)} left` : `Next · ${clock(next.startMs)}`, new Color(item.color));
    text(w, item.label, font.bold(14), C.text, 2);
  } else if (s.move) {
    sectionLabel(w, 'Next move', C.accent);
    text(w, s.move.text, font.semi(13), C.text, 2);
  } else {
    text(w, 'Nothing scheduled', font.semi(13), C.dim);
  }
};

const accessory = (w, s, now, family) => {
  const nowMs = now.getTime();
  const { current, next, nextIsToday } = nowNext(s, nowMs);
  const item = current || (nextIsToday ? next : null);
  if (family === 'accessoryCircular') {
    w.addImage(ring(s.score.value, Color.white(), 58, { mono: true })).imageSize = new Size(58, 58);
  } else if (family === 'accessoryInline') {
    text(w, `APEX ${s.score.value.toFixed(1)}${item ? ` · ${item.label} ${clock(current ? current.endMs : item.startMs)}` : ''}`, font.semi(12), Color.white());
  } else {
    text(w, `${s.score.value.toFixed(1)} · ${goalText(s.score)}`, font.bold(13), Color.white());
    if (item) text(w, `${current ? 'Now' : clock(item.startMs)} · ${item.label}`, font.med(12), Color.white());
    else if (s.move) text(w, `Next: ${s.move.text}`, font.med(12), Color.white());
  }
};

// ── Run ──────────────────────────────────────────────────────────────────────
const now = new Date();
const family = config.widgetFamily || 'large';
const { snapshot, problem } = await load();
const w = base(family);

if (problem) {
  message(w, problem, null);
} else if (!snapshot) {
  message(w, 'Almost there', 'Open APEX once so it can fill in your widget.');
} else if (snapshot.date !== dateKey(now)) {
  // Yesterday's numbers would mislead; the server catches up within a few minutes.
  if (family.startsWith('accessory')) text(w, 'APEX · new day', font.semi(12), Color.white());
  else message(w, 'New day', 'Open APEX to load today. Your widget catches up within a few minutes.');
} else if (family.startsWith('accessory')) {
  accessory(w, snapshot, now, family);
} else if (family === 'small') {
  small(w, snapshot, now);
} else if (family === 'medium') {
  medium(w, snapshot, now);
} else {
  large(w, snapshot, now);
}

// Ask iOS to refresh at the next block boundary, or in 5 minutes, whichever is sooner.
const soonest = Math.min(nextBoundary(snapshot, now.getTime()), now.getTime() + 5 * 60000);
w.refreshAfterDate = new Date(Math.max(soonest, now.getTime() + 60000));

if (config.runsInWidget) Script.setWidget(w);
else await w.presentLarge();
Script.complete();
