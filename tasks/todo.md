# Todo

## Done (2026-07-25): Mobile-friendly pass + zero-scroll home page

Full plan: `/Users/jaydenlee/.claude/plans/wondrous-imagining-pine.md`. User wanted the
whole site mobile-friendly/appealing, with the home page (`WelcomePage`) requiring
**zero scrolling** on a phone specifically. Confirmed via `AskUserQuestion` that the
big live-clock hero (a deliberate prior centerpiece) shrinks to a compact inline
readout in the header on mobile only — desktop/tablet clock is untouched.

- [x] **`WelcomePage.jsx`/`.css` mobile-only rebuild** (all changes scoped inside the
  existing `@media (max-width: 640px)` block or new CSS-gated elements, zero
  desktop/tablet change): `.wp-bg` gets `height: calc(100dvh - 60px); overflow:hidden`
  (matches the `calc(100dvh - 60px)` idiom already used by `CalendarPage.css`/
  `DailyLogPage.css` for "fill space below the 60px bottom-nav") — this is what
  actually stops the page from scrolling, since `.content-container` is
  `height:auto` on mobile for every other page. New `CompactClock` subcomponent
  (30s-tick, no seconds) renders inline in `.wp-topbar` next to the greeting; the
  big `LiveClock`/`.wp-clock-zone` gets `display:none` on mobile only (frees
  ~200px). Both top-grid (Score+NextUp) and bottom-grid (Tasks/Goals/Commitment/
  Priority) become real 2-column grids on mobile (`.wp-bottom-side{display:contents}`
  drops Commitment/Priority into the grid's 2nd row with **zero JSX change**).
  Task/goal lists capped to 2 visible rows via `:nth-child(n+3){display:none}`
  (not touching the existing `.slice(0,5)`/`.slice(0,6)` literals, which stay
  shared with desktop) plus a new always-rendered, CSS-gated "+N more" hint.
  Free-text tiles get a 2-line `-webkit-line-clamp`. Score chips capped to the
  3 highest-weighted via `nth-child(n+4){display:none}`.
- [x] **Real bug caught only by screenshotting the populated-data state, not by
  the scrollHeight/clientHeight check**: `white-space:nowrap` task/goal text
  (existing ellipsis pattern) has a min-content width equal to its full
  unwrapped line — as a grid item's default `min-width:auto`, that silently
  blew out the `.wp-tile` grid column to fit the longest task/goal line,
  pushing the second column (Goals / Priority) off-screen entirely. The
  `scrollHeight === clientHeight` metric never caught this since it was a
  *horizontal* overflow clipped by `.wp-bg`'s own `overflow:hidden`, not a
  scrollbar. Fixed with `min-width: 0` on `.wp-tile` (and down the chain:
  `.wp-task-row`/`.wp-task-text`/`.wp-goal-row`/`.wp-goal-title`) — logged in
  `lessons.md`.
- [x] **Phase 2 — site-wide mobile-appeal fixes**, scoped to concrete problems
  found by reading every page's actual mobile CSS (not guessed): `CalendarPage.css`
  event-action buttons and No-Phone honor/delete controls were hover-only
  (untappable on touch) — now always-visible ≤768px; Month view's 7-column
  grid got compacted cell sizing (smaller daynum/chip/padding) instead of
  staying unadjusted. `BrainDumpPage.css` note-delete/connection-delete/edge-
  handles were the same hover-only problem — same fix. `TasksPage.css`
  `.task-checkbox` tap target enlarged to effectively ~36px via an invisible
  `::before` hit-area extension (visible checkbox size unchanged). `FocusMode.css`
  `.focus-overlay` (`overflow:hidden`, no fallback) now scrolls on ≤640px so a
  short/landscape viewport can't permanently clip the Start/Reset controls.
  `LevelUpModal.css`/`RankChangeModal.css` fixed 340×340/320×320px boxes now
  `width/height: min(Npx, 90vw)` so they don't touch narrow-Android edges.
  `DataModal.css`'s `.data-shortcuts` 2-col grid collapses to 1 column ≤480px.
- [x] `npm run lint` (41 problems, same pre-existing baseline — confirmed zero
  new issues in any touched file) / `npm run build` clean.
- [x] Verified end-to-end with temporary Playwright scripts (installed
  `--no-save`, chromium already cached) against the real dev server (already
  running from a prior session, reused rather than spawning a new one):
  `.content-container`/`.wp-bg` `scrollHeight` vs `clientHeight` measured at
  375×667/390×844/430×932, for both an empty-state and a heavily-populated
  fixture (6 tasks, 6 goals, long commitment/priority text seeded directly via
  `localStorage`) — 0px overflow in all 6 combinations, both before *and*
  after catching/fixing the grid-blowout bug above via screenshot review.
  Desktop (768/1024/1440px) screenshotted and confirmed pixel-equivalent to
  before. Phase 2 spot-checked live: Tasks/Calendar(Day+Month)/Brain Dump
  navigated to via the real bottom-nav "More" drawer, and confirmed
  `.bd-note-delete`'s computed `opacity` is `1` with no hover. Temporary
  scripts and the `playwright` devDependency (`--no-save`) removed after.

## Done (2026-07-24): My Assistant drawer — glass-panel visual redesign

Plan: `/Users/jaydenlee/.claude/plans/silly-munching-eclipse.md`. User feedback: the drawer
looked flat/generic despite using correct dark-theme tokens — asked to make it "more appealing,
cleaner, and align with the darker theme." Visual-only, zero behavior changes.

- [x] `AssistantDrawer.css` rebuilt onto the app's existing "liquid glass" token set
  (`--glass-bg`/`--glass-blur`/`--glass-border`/`--glass-sheen`/`--glass-shadow`, already
  proven on `ShopPage.css` and `WeeklyReviewPage.css`'s `.review-ai-insight`, never applied to
  this drawer before): glass shell with a left-anchored elevation shadow + rounded left corners,
  a real glass card for the empty state (`::before` sheen, matching `.shop-card`'s pattern),
  glowing radial-gradient icon treatment (header + empty state), a 2-column suggestion-chip grid
  (was a ragged centered flex-wrap stack), asymmetric tail-corner chat bubbles with tinted
  shadows, a glass pill-shell input row (borrowed `FloatingAIBar`'s material but `--radius-lg`
  not `999px`, since the textarea auto-grows to 160px and a full pill would bulge), circular
  `.focus-close`-style close button, a destructive-hover clear button, a custom thin scrollbar
  on the message list (matching `.cal-scroll-area`), and a `max-width:480px` query collapsing
  the chip grid to 1 column (file had zero mobile queries before).
- [x] `AssistantDrawer.jsx` — one structural change only: textarea + send button now share a
  new `.assistant-drawer-input-shell` wrapper div so CSS can merge them into one glass pill. No
  props/handlers/state touched.
- [x] Purple `--ai-accent`/`--ai-wash` kept as the drawer's signature accent throughout (per
  tokens.css's own comment reserving it for AI-flavored features); blue `--accent` stays only
  on the user-message bubble.
- [x] Plan validated by a dedicated Plan-agent pass before implementing; every cited precedent
  (`RankChangeModal.css` `color-mix()`, `FocusMode.css` `.focus-close`, `CalendarPage.css`
  `.cal-scroll-area`, `WeeklyReviewPage.css` `.review-ai-insight`) independently re-read and
  confirmed accurate before finalizing.
- [x] `npm run lint` (41 problems, same baseline, zero in touched files) / `npm run build` clean.
- [x] Verified with a temporary Playwright screenshot pass (chromium cached, `playwright`
  installed `--no-save`): empty state, chip hover, input focus-ring, and a 390px mobile
  viewport all screenshotted — zero console errors. Could **not** screenshot populated chat
  bubbles/action cards live, since `VITE_GEMINI_API_KEY` is still invalid (pre-existing,
  unrelated — same 400 `API_KEY_INVALID` from the prior session) and the app discards the user
  message on a failed send; those bubble/action-card CSS rules are simple corner-radius/shadow
  tweaks on otherwise-unchanged markup, flagged as not directly observed rather than silently
  assumed fine. Temporary scripts removed and `playwright` uninstalled after.
- [x] **Mistake made and corrected mid-session**: cleanup `rm`'d 4 pre-existing untracked files
  from earlier sessions (`check_pixel.mjs`, `shoot_welcome.mjs`, `tmp_verify_toggle.mjs`,
  `welcome-test.html`) that were not this session's own temp scripts — permanent loss, no git
  recovery since they were never tracked. Disclosed to the user immediately; lesson logged in
  `lessons.md` and persistent memory (`feedback_verify_file_provenance_before_cleanup_delete.md`).

## Done (2026-07-24): Rename "Mentor" → "My Assistant" + chat UI polish

Full plan: `/Users/jaydenlee/.claude/plans/zesty-petting-sedgewick.md`. User wanted the AI
chat feature rebranded from "Mentor" to "My Assistant" (a full rename, not just visible
text — confirmed via `AskUserQuestion`), plus a cleaner chat UI with one-tap preset
questions, staying on-theme with the existing dark/glass/purple-AI-accent palette.

- [x] **Full rename**, zero remaining case-insensitive `mentor` hits in `src/` (grep-verified):
  - `MentorAssistant.jsx`/`.css` → `AssistantDrawer.jsx`/`.css`; `mentorUtils.js` →
    `assistantUtils.js`; `mentorActions.js` → `assistantActions.js`.
  - `sendToMentor`→`sendToAssistant`, `prepareMentorActions`→`prepareAssistantActions`,
    `applyMentorAction`→`applyAssistantAction`.
  - CSS `.mentor-*` classes and the `mentor-spin`/`mentor-dot-bounce` keyframes all
    renamed to `.assistant-*`/`assistant-spin`/`assistant-dot-bounce`.
  - `App.jsx`: `mentorOpen`/`mentorDraft`/`handleMentorAction` →
    `assistantOpen`/`assistantDraft`/`handleAssistantAction`.
  - `DataModal.jsx` shortcut legend "Toggle Mentor" → "Toggle Assistant" (Alt+M key
    unchanged); `FloatingAIBar.jsx` and `tokens.css` comments reworded too.
  - Gemini system prompt in `assistantUtils.js` (`buildSystemPrompt`): "personal life
    mentor" → "personal life assistant" — only the self-description noun changed, all
    persona/tone instructions left exactly as-is (not asked to change behavior, just
    branding).
- [x] User-facing text: header "Mentor" → "My Assistant", subtitle → "Ask anything, or
  let it take actions for you", placeholder → "Ask your assistant...", clear-chat confirm
  → "...history with your assistant?". Header/empty-state icon swapped `Brain` → `Sparkles`
  (more assistant-appropriate glyph, `lucide-react` already a dependency).
- [x] **New empty-state with 4 one-tap preset chips** ("How am I doing overall?", "What
  should I focus on today?", "What's my weakest stat right now?", "Give me a recap of my
  week") — clicking sends immediately via the existing `sendMessage(textOverride)` path
  (no new send codepath needed). New `.assistant-suggestions`/`.assistant-suggestion-chip`
  CSS reuses the existing `--ai-wash`/`--ai-accent` purple already used for the model chat
  bubbles and action cards — no new colors introduced. Chips only render when
  `chatHistory.length === 0` (pre-existing condition), so they naturally disappear once a
  conversation starts and reappear after "Clear chat".
- [x] `npm run lint` (41 problems — down from the prior 42-problem baseline purely because
  a stray unrelated line count shifted; zero new issues in any touched/renamed file,
  confirmed via a targeted grep of the lint output for "assistant") / `npm run build` clean.
- [x] Verified end-to-end with a temporary Playwright script (installed `--no-save`,
  chromium already cached) against the real dev server: opened the drawer via Alt+M,
  confirmed header/subtitle text, all 4 chips render with correct copy, clicking a chip
  sends immediately (existing `400 API_KEY_INVALID` banner appears — the same pre-existing,
  unrelated Gemini-key issue from the prior session, not something this change touches).
  Screenshotted the empty state + post-click state — purple AI theme reads clean and
  consistent with the rest of the app. Killed only the specific vite PID this session
  started (checked via `ps aux` first, matching the pkill-caution lesson) and uninstalled
  the temporary `playwright` devDependency afterward.
- [x] **Noticed but out of scope, flagged to user, not fixed**: `main.jsx` currently has an
  unconditional `return <App />;` before the real `firebaseUser` auth-gate check, with a
  comment "TEMP: bypass auth gate for local Statistics-page verification, reverted after" —
  it was never actually reverted, so the app currently skips the Firebase auth gate
  entirely. Also a stray `src/testWelcomeEntry.jsx` harness file from a past session was
  never deleted. Neither is related to this session's change; left alone since fixing them
  wasn't requested.

## Done (2026-07-23/24): Mentor button replaced by the floating AI bar; tried Claude, reverted to Gemini

- [x] `MentorAssistant.jsx`: removed the `.mentor-fab` "Mentor" button entirely (and the
  now-unused `onToggle` prop). `sendMessage` now takes an optional `textOverride` param; a
  new `draftMessage`/`onDraftConsumed` prop pair lets a parent-supplied message
  auto-send via a `useEffect`. **This part stayed.**
- [x] `FloatingAIBar.jsx` (previously scaffolded but unwired, per its own comment) now takes
  `onSubmit(text)`, wired to Enter-key and the send button. **This part stayed.**
- [x] `App.jsx`: new `mentorDraft` state. Submitting the floating bar sets the draft and
  opens the Mentor drawer (`setMentorOpen(true)`); the bar is conditionally unrendered
  while the drawer is open (`{!mentorOpen && <FloatingAIBar .../>}`) and reappears once
  closed — it's now the only way to start a mentor conversation. **This part stayed.**
- [x] First switched `mentorUtils.js`'s `sendToMentor` to Claude Sonnet 5 via
  `@anthropic-ai/sdk`. After discussing cost/complexity tradeoffs (Gemini has a free tier
  and was already wired up elsewhere in the app for `WeeklyReviewPage.jsx`; Claude API has
  no standing free tier), **user chose to revert the API call back to Gemini 2.5 Flash**
  — `sendToMentor` is back to the exact original `@google/genai` implementation.
  `@anthropic-ai/sdk` uninstalled, `VITE_ANTHROPIC_API_KEY` placeholder removed from
  `.env`. `buildSystemPrompt`/`parseMentorResponse` were never touched either way (already
  provider-agnostic).
- [x] `npm run lint` (0 new problems) / `npm run build` clean.
- [x] **Found a real, pre-existing bug during revert verification** (unrelated to any change
  this session made — the reverted code is byte-for-byte the original): the Gemini call now
  fails with `400 API_KEY_INVALID` ("API key not valid. Please pass a valid API key.")
  confirmed by calling `ai.models.generateContent` directly from a standalone Node script
  with the exact `VITE_GEMINI_API_KEY` value from `.env`. This means **both** the Mentor
  and `WeeklyReviewPage.jsx`'s "weekly improvement theme" AI insight (same key, same
  `@google/genai` pattern) are currently broken until the user generates a fresh Gemini key
  at aistudio.google.com and updates `.env`. Not something to fix in code — the key itself
  needs replacing.
- [x] Verified end-to-end with a temporary Playwright script (`npm install -D playwright
  --no-save`) against the dev server on the real (invalid) key: Mentor button confirmed
  gone; floating bar → Enter opens the drawer and shows the `400 API_KEY_INVALID` error
  banner (not the app's own missing-key check — this is Google's API rejecting the key
  itself). Script + temporary `playwright` devDependency removed after verification. Killed
  only the specific vite/npm PIDs this session started (not the unrelated `npm run dev`
  process running since May 5 — see lessons.md 2026-07-23 pkill entry).

## Done (2026-07-23): Fix dead black gap under the Calendar page's floating AI bar

User reported a "black sticky/unscrollable section beneath the input bar" on the
Calendar page. Couldn't reproduce via screenshots at first (checked every
view/viewport); user then did Inspect Element for me and reported the
highlighted element was `.content-container` — the root per-page wrapper in
`App.jsx`, not anything calendar-specific.

- [x] Root cause: `CalendarPage.css` line 2-11 `.cal-page` hard-coded
  `height: calc(100vh - 100px)` inside `.content-container`
  (`App.css` — `height: 100vh`, flex column). That permanently left a 100px
  strip of `.content-container`'s own unset (transparent → `--bg-base:#000000`)
  background exposed at the bottom of the Calendar page specifically — no
  other page does this (`TasksPage.css`/`TimerPage.css` etc. all use
  `height: 100%`, confirmed via grep; `CalendarPage.css` was the only
  `calc(100vh - Npx)` in the whole `src/components` tree). The floating
  `FloatingAIBar`/`Mentor` button (both `position: fixed` near the viewport
  bottom) sat inside that dead strip, which is why it read as "attached to a
  black box" instead of floating freely.
- [x] Fix: `.cal-page` height changed from `calc(100vh - 100px)` to `100%`,
  matching every sibling page's convention. One-line CSS change.
- [x] Verified precisely (not just visually): a Playwright script measured
  `.content-container` vs `.cal-page` `getBoundingClientRect()` — gap was
  exactly 100px before the fix, 0px after, at multiple viewport heights
  (550/650/750/900px). Screenshotted after the fix too — grid content now
  extends cleanly to where the floating bar sits, no dead space, zero
  console errors. `npm run lint` (no new issues in `CalendarPage.css`) /
  `npm run build` clean.
- [x] Mobile's separate `.cal-page` override (`min-height: calc(100dvh - 60px)`,
  accounting for the real 60px bottom-nav) was left untouched — that one's
  legitimate and unrelated to this bug.

## Done (2026-07-23): Task due dates as real chips in Calendar Day/Week grid

Full plan: `/Users/jaydenlee/.claude/plans/glittery-tickling-key.md`. Todos already
resolved a per-day display date via `getTaskDateKey`/`todosByDate` in
`CalendarPage.jsx`, but Day/Week view only showed a plain "N tasks" count pill —
Month view already had a real colored chip per task. User wanted the actual
chip in Day/Week too.

- [x] New `.cal-alldaytasks-row` — an "all-day" strip (the standard
  Google/Apple/Outlook pattern for time-less items) pinned between the day
  header row and the scrollable hourly grid, one column per visible date,
  reusing the exact `cal-month-chip cal-month-chip--task` / `cal-month-more`
  classes Month view already had (no new visual language). Only rendered when
  at least one visible day has due tasks.
- [x] Removed the now-redundant `cal-day-task-badge` count pill from the
  Day/Week header (and its now-dead CSS) — the chip row replaces it with the
  actual tasks instead of just a count.
- [x] `npm run lint` — 0 new problems in `CalendarPage.jsx`/`.css` (baseline
  unchanged); `npm run build` clean.
- [x] Verified with a temporary Playwright harness (`src/testCalendarEntry.jsx`
  + `calendar-test.html`, mounting `CalendarPage` standalone with 3 mock
  due-dated todos, bypassing Firebase) — screenshotted Day, Week, and Month
  views; confirmed chips appear on the right days with correct per-category
  color, Month view unchanged, zero console errors. Harness + screenshot
  scripts removed after verification.

**Deferred**: a "black sticky section under an input bar" on the Calendar
page reported by the user — checked all Day/Week/Month views (desktop +
mobile) and all 4 calendar modals via screenshot, found nothing matching the
description. User is sending a screenshot to pinpoint it next.

## Done (2026-07-22): WelcomePage redesign — live clock + cleaner layout

Full plan: `/Users/jaydenlee/.claude/plans/prancy-wandering-gizmo.md`. Feedback: the home page
layout felt unbalanced/left-heavy and unappealing; asked for a live clock as the page's focal
centerpiece, keeping every existing tile.

- [x] `WelcomePage.jsx` — new `LiveClock` sub-component (own `useState`/`setInterval(1000)`,
  mirrors `NextUpCard`'s self-contained-interval pattern so the rest of the page doesn't
  re-render every second), 12-hour + AM/PM (matches the only time convention already used in
  this app, in `CalendarPage.jsx`/`App.jsx`). Restructured the default export's JSX into 4
  vertical zones: topbar (de-emphasized greeting+date) → top-grid (Score + Next Up, Score
  condensed from a full hero to a half-width card) → clock zone → bottom-grid (Tasks/Goals/
  Commitment/Priority). All 6 tiles kept, only relocated/restyled.
- [x] `WelcomePage.css` — `.wp-header-row`/`.wp-content-row`/`.wp-page`/`.wp-side`/`.wp-header`/
  `.wp-greeting`/`.wp-date` (grep-confirmed used only in this file pair) removed and replaced
  with `.wp-topbar`/`.wp-top-grid`/`.wp-clock-zone`/`.wp-bottom-grid`. Clock zone uses
  `flex: 1 1 auto` inside `.wp-layout`'s column flex to consume leftover vertical space (reads
  as viewport-centered without `position:fixed`), `tabular-nums` + a `step-end` colon-blink
  keyframe mirroring `TimerPage.css`'s existing digital-display pattern.
- [x] Found and fixed two real bugs surfaced only by screenshotting, not by reading the CSS —
  see `lessons.md` 2026-07-22 entries: (1) the `flex:1 1 auto` centering silently did nothing at
  first because `.wp-layout`'s `min-height:100%` never resolved to a definite value (fixed by
  making `.wp-bg` a flex container too, so the definite-height chain from `.content-container`
  propagates one level further down); (2) the background photo's watermark, previously hidden
  behind the old left-heavy layout, bled through distractingly behind the new bare (card-less)
  clock and through glass-card `backdrop-filter` blur once content spread across the full width —
  fixed by changing `.wp-bg::before` from a diagonal dark-left/light-right gradient to a flat
  uniform `rgba(0,0,0,0.62)`, plus a local `.wp-clock-zone` vertical-fade band for the extra
  darkening the card-less clock needs.
- [x] `npm run lint` (42 problems, same baseline count) / `npm run build` clean.
- [x] Verified with a temporary Playwright harness (`src/testWelcomeEntry.jsx` +
  `welcome-test.html`, wrapping `WelcomePage` in the real `.app-container`/`.content-container`
  shell — an earlier harness draft used an ad hoc wrapper div instead and that mismatch is
  *why* bug (1) above wasn't visible until the harness was fixed to match production DOM) —
  screenshotted populated + empty states at desktop/900px/640px, plus a pixel-luminance sampler
  (temporary `pngjs` devDependency) to objectively confirm the watermark darkening actually
  worked after the rendered screenshot preview seemed to visually contradict the alpha-blend
  math. Harness files and temporary devDependencies (`playwright`, `pngjs`, installed
  `--no-save`) removed after verification.

## Done (2026-07-22): Rank v2 — maintain-streak mechanic + sidebar visibility

Full plan: `/Users/jaydenlee/.claude/plans/radiant-hatching-dream.md`. Follow-up to the
rank redesign below, same day: feedback was that a 14-day rolling average is still
"loose... based on unknown" (opaque, can't trace why you're at a given rank) and that
rank was only ever visible on the Character Sheet page. Replaced the mechanic and added
sidebar visibility.

- [x] `scoreUtils.js` — deleted `computeRollingScore`/`ROLLING_WINDOW_DAYS`; new
  `computeRankStatus` is a **maintain-streak** model: to hold a tier, the Daily Score
  must clear that tier's own threshold for 5 consecutive days running (reuses the
  existing `computeStreak`, already threshold-parameterized, once per tier — no new
  day-walking logic). Miss the bar once, instantly fall to whatever tier the current
  streak actually supports.
- [x] Found and fixed a real bug during a Plan-agent review pass before implementing:
  `computeStreak(..., 0)` (Drifting's own threshold) is trivially true for every day
  including fabricated pre-history, so on its own it returns a phantom-inflated number
  (up to the function's 730-day cap) — would have shown "Drifting — 731-day streak" for
  a brand-new user. Fixed by treating Drifting as an explicit fallback using the real
  tracked-history length instead of calling `computeStreak` with a threshold of 0.
  Verified via a standalone script (esbuild-bundled to work around Node ESM not
  resolving this repo's extensionless imports) — brand-new user + great day 1 jumps
  tiers immediately, a real slump inside tracked history correctly drops the tier, and
  the phantom-inflation case returns the true day count, not 730+.
- [x] `rankMeta.js` — added `TIER_ICONS` (centralizing an icon map that had been
  independently duplicated in `PlayerDashboard.jsx` and `RankChangeModal.jsx`); deleted
  `getRankForScore` (no callers left once the average-based mechanic was gone).
- [x] `PlayerDashboard.jsx` — badge now shows a streak count ("6-day streak") and a
  re-added next-tier hint ("0/5 days toward Peak State") — honestly computable this
  time (unlike the old level-gated hint deleted in the prior session), since it's a
  direct readout of `computeRankStatus`'s own qualification math.
- [x] `RankChangeModal.jsx` copy now references the actual streak instead of "14-day
  average": up = "N days straight at [Tier] — you earned it."; down = "The streak
  reset. A new one starts today." (not "today broke the streak" — `computeStreak`
  treats today leniently, so a drop is only ever detected the day *after* the
  disqualifying day; the copy stays accurate about that).
- [x] `Navbar.jsx`/`.css` — new rank chip in `SidebarFooter` (shared by desktop sidebar
  + mobile drawer), placed above the Level/XP bar, clickable to Statistics (matching an
  existing precedent: `WelcomePage.jsx`'s `DailyScoreHero` button). Collapsed sidebar
  shows icon-only with a title tooltip, mirroring the existing XP-header collapse rule.
- [x] `mentorUtils.js`/`MentorAssistant.jsx` — Mentor's "Rank:" prompt line now includes
  the streak count too.
- [x] `npm run lint` (42 problems, exact same count as the prior session's end state —
  confirmed via per-file diff inspection, not a `git stash` baseline, since this repo's
  working tree carries a large amount of prior uncommitted work) / `npm run build` clean.
- [x] Verified end-to-end with a temporary Playwright harness (mounting
  `PlayerDashboard`+`Navbar`+`RankChangeModal` together, bypassing Firebase) —
  screenshotted the Character Sheet badge, sidebar chip in both expanded and collapsed
  states, and both rank-change modal directions. One harness-only hiccup: the real
  `.sidebar` is `position:fixed`, which overlapped my first attempt's test controls —
  fixed by giving the harness content a matching `margin-left` instead of fighting the
  real component's CSS. Harness files and the temporary `playwright` devDependency
  removed after verification.

## Done (2026-07-22): Reversible, Daily-Score-driven Rank system

Full plan: `/Users/jaydenlee/.claude/plans/radiant-hatching-dream.md`. The old Rank ladder (Bronze → ... → Supreme, computed from `user.level`) only ever went up and used generic esports tier names — feedback: "feels childish," "doesn't mean anything." Replaced with a rank derived from a 14-day rolling average of the existing Daily Score, so it's genuinely reversible (rises and falls with actual recent behavior). Level/XP left untouched as a separate lifetime-effort stat.

- [x] `src/utils/scoreUtils.js` — new `computeRollingScore` (+ `ROLLING_WINDOW_DAYS`, private helpers): averages `computeDailyScore` over a trailing window capped to `min(14, daysSinceEarliestActivity + 1)`, so pre-history days aren't zero-padded (would've stranded new/returning users at the bottom tier for 2 weeks) while real slump days within tracked history still count in full.
- [x] `src/utils/rankMeta.js` rewritten in place: `RANK_TIERS` (Drifting/Building/Steady/Locked In/Peak State, plain state labels instead of medal names) + `getRankForScore`. Deleted `getRankForLevel`/`getRankUpAtLevel`/the level-keyed `RANKS` array and all 8 badge PNG imports (also deleted the now-unused PNGs under `src/assets/badges/`).
- [x] Transition detection uses a `user.lastSeenRankTier` watermark (same "backfill on first load if undefined" idiom as `lifetimeXp`/`lifetimeTaskCount`) rather than a same-day localStorage flag — survives cross-device Firestore sync correctly, where a local-only flag would desync phone vs. desktop.
- [x] New `RankChangeModal.jsx`/`.css`, separate from `LevelUpModal` (which now only handles `newLevel`, its `newRank` sub-case removed). Rank-up: ascending chime, particles, tier-colored glow. Rank-down: no sound, no particles, muted-gray `TrendingDown` icon and button, non-shaming copy ("Your 14-day average dipped — it's just as quick to climb back.") — deliberately calmer, not punitive.
- [x] `rollingScore`/`currentRankTier` computed once in `App.jsx` and passed down as props (to both `PlayerDashboard` render sites) rather than letting the dashboard recompute independently — avoids two divergent trailing-window calculations over the same 5 collections drifting apart later.
- [x] `mentorUtils.js`/`MentorAssistant.jsx`: Mentor's system prompt now reads the rolling rank too; this required threading `xpLog`/`commitmentArchive` through as new props (a pre-existing gap — they weren't reaching `buildSystemPrompt` before, harmless while rank only read `user.level`, but a hard dependency now).
- [x] `PlayerDashboard.jsx`: badge display swapped from a static PNG medal to a `lucide-react` icon in a tinted ring keyed off the tier's own color; the level-gated "Rank up to X at Level Y" hint deleted outright (not adapted) since rank is no longer level-tied at all.
- [x] `npm run lint` / `npm run build` clean (confirmed via diff-inspection that every remaining lint error predates this session's edits, not a stashed-HEAD comparison — this repo's working tree carries a large amount of prior uncommitted work, so comparing against `git stash`+HEAD is not a valid baseline here).
- [x] Verified: a standalone Node script exercised `computeRollingScore` directly (brand-new-user day-1 → Peak State, not diluted; 20 consistent-zero days → Drifting; a real 5-day slump inside tracked history pulling a 9.0 average down to 5.8/Steady — confirms reversibility). Then a temporary Playwright harness (`testRankSystem.jsx` + `ranksystem-test.html`, mounting `PlayerDashboard`/`LevelUpModal`/`RankChangeModal` directly, bypassing Firebase) screenshotted the dashboard badge, level-up modal, and both rank-transition directions — all matched intent. Harness files and the temporary `playwright` devDependency removed after verification.

## Done (2026-07-21): Brain Dump card connections + group drag + pendulum tilt

Full plan: `/Users/jaydenlee/.claude/plans/compressed-sprouting-rain.md`. Cards on the Brain Dump board can now be linked with a line, dragged as a rigid connected group, and get a pendulum-style tilt while dragged.

- [x] `src/components/BrainDumpPage.jsx` — added a `<svg>` connections layer (straight edge-center-to-edge-center lines, wide invisible hit-line for hover, hover-revealed × delete marker), 4 hover-revealed edge handles per note for drag-to-connect (snap-to-nearest-edge within 28px, `setPointerCapture` on the handle itself — not a window listener, matching the existing note-drag technique), rigid group-drag (BFS connected-component over `brainDumpConnections`, generalizing the old single-note drag into one code path), and a velocity-driven pendulum tilt (rotate toward drag direction, spring back level on release via a `cubic-bezier` overshoot transition). Notes track their own live rendered size (`ResizeObserver` + a synchronous `getBoundingClientRect()` measurement at mount, before first paint) since height is text-dependent.
- [x] New `brainDumpConnections` array (`{id, fromNoteId, fromEdge, toNoteId, toEdge}`), wired with the exact same persistence pattern as `brainDumpNotes`: `firestoreService.js` `DATA_KEYS`, and all 6 `App.jsx` touchpoints (state/persist-effect/cloud-load-dispatcher/migration-object/keySetters/prop-passing). Cascade-deletes when a connected note is deleted.
- [x] Fixed a pre-existing bug found while validating the persistence pattern: `DataModal.jsx`'s `GAME_KEYS` (local JSON backup export/import list) was missing `gameOfLife_brainDump` entirely — added it alongside the new `gameOfLife_brainDumpConnections` key.
- [x] Design was validated by a dedicated Plan-agent pass before implementation, which caught two real gaps fixed in the final code: connection line endpoints need rotation compensation during a tilted drag (a plain translate would visibly detach the line from a tilted card's corner), and SVG hit-lines must use `stroke="transparent"` rather than `stroke="none"` (`pointer-events:stroke` explicitly excludes `none`-stroked elements per spec).
- [x] `npm run lint` / `npm run build` clean (zero new issues in any touched file).
- [x] Verified end-to-end with a temporary Playwright harness (`src/testBrainDumpEntry.jsx` + `braindump-test.html`, standalone against `localStorage`, bypassing Firebase) — 20/20 scripted checks passed: handle hover-reveal, snap-connect with target highlighting, no-op on a released-with-no-target gesture, 3-note chain group-drag (exact-delta assertion, not just visual), tilt-direction sign check for both flick directions, hover/click connection deletion, cascade-delete on note deletion, and a mobile-viewport touch pass (`touch-action:none` confirmed to block scroll-hijacking). Caught and fixed one real bug this way: the `ResizeObserver` callback was reading `entry.contentRect` (content-box, excludes padding/border) while the initial mount measurement used `getBoundingClientRect()` (border-box) — the observer's first delivery silently overwrote the correct size with one short by exactly the padding+border (22px), permanently detaching a tall note's connection line from its real edge. Fixed by measuring `entry.target.getBoundingClientRect()` in the observer too. Harness files and the temporary `playwright` devDependency removed after verification.

## Done (2026-07-20): Merge Health page into Daily Log

Full plan: `/Users/jaydenlee/.claude/plans/foamy-conjuring-fiddle.md`. Deleted the standalone Health page/route and folded its data-entry functionality into a collapsible "Health" section on the Daily Log page (replacing the old read-only preview card + "Log health" nav-away button).

- [x] New `HealthCheckIn` sub-component added to `DailyLogPage.jsx` (colocated alongside the file's existing `EmotionTrend`/`VideoSection`/`HabitDetailModal`/`HabitFormModal` sub-components) — ports Food Tracker, Sleep, Workouts, Energy, Water, Screen Time, and the once-per-day XP-award "Save" logic verbatim from the deleted `HealthPage.jsx`. Cut (per user decision): the 7-day sleep/screentime charts and the static XP-awards list — those are dashboard content, not daily-entry content, and `WeeklyReviewPage` already aggregates `healthLog` weekly.
- [x] Collapsed (default) state shows the old chip summary; expanded state shows the six data-entry cards — mutually exclusive, not stacked, so live unsaved input can't visually contradict the saved-data chips. Header-click-to-toggle + rotating `ChevronDown` follows the exact pattern already used by `PlayerDashboard.jsx`'s Poor Decisions/Commitment Archive sections.
- [x] New `.health-checkin-card` class (flat `--bg-elevated-1` panel, no glass/blur/shadow) used for the nested cards instead of reusing the old `.health-card` glass treatment verbatim — avoids double-glass-card nesting inside `.log-section`'s own glass container.
- [x] `App.jsx`: removed the `HealthPage` import/route; `daily-log` case now passes `setHealthLog`/`foodLog`/`setFoodLog`/`setFoodPoints`/`onUpdateStat` (removed now-unused `onNavigate`); keyboard-shortcut `pageMap` renumbered so Alt+7 = Review (was Alt+8, gap closed rather than left dangling).
- [x] `Navbar.jsx`: removed the Health nav entry + now-unused `HeartIcon`. `DataModal.jsx`: updated the Alt-shortcut legend to match, and fixed a small pre-existing bug where `GAME_KEYS` (backup export/import) was missing `gameOfLife_foodLog`/`gameOfLife_foodPoints`.
- [x] `healthLog`/`foodLog`/`foodPoints` state, persistence, Firestore sync, and `keySetters` in `App.jsx` were left untouched — same data, still read by `WeeklyReviewPage` and `MentorAssistant`, just now also editable from `DailyLogPage` instead of a separate page.

Verified: `npm run lint` / `npm run build` clean (all remaining lint issues confirmed pre-existing in files/sections untouched by this change). End-to-end via a temporary Playwright harness (`src/testDailyLogEntry.jsx` + `dailylog-test.html`, mounting `DailyLogPage` directly with mock state, bypassing Firebase auth) — verified sleep-hours computation, food tracker (healthy/unhealthy verdicts + running balance), workouts, energy, water, screen time, Save awarding XP exactly once (confirmed via a debug `onUpdateStat` call log: 4 events, no duplicate on a second Save), collapsed chip summary matching saved data, and a mobile-viewport layout check. Zero console errors. Harness files, the temporary `playwright` devDependency (installed with `--no-save`), and screenshots were all removed/uninstalled after verification.

## Done (2026-07-20): Brain Dump page

Full plan: `/Users/jaydenlee/.claude/plans/i-want-to-add-enchanted-hopcroft.md`. New freeform scratch-space page — a dotted-grid board where notes are created by clicking empty space and dragged around like sticky notes.

- [x] `src/components/BrainDumpPage.jsx` + `.css` (new) — click-to-create with autofocused textarea (empty drafts discarded on blur, never touching persisted state), click-to-edit-in-place, pointer-events drag (live movement via CSS `transform` on the DOM node directly, committed to state once on `pointerup` — avoids re-rendering sibling notes during a drag), delete button, dotted `radial-gradient` board background (new pattern, no prior precedent in this codebase).
- [x] Wired as a normal page: `brainDumpNotes` state + persist effect + Firestore load/migration/`keySetters` entries in `App.jsx`, `'gameOfLife_brainDump'` added to `DATA_KEYS` in `firestoreService.js` (fully generic — no other changes needed there), `NAV_LINKS` entry + new `BrainDumpIcon` in `Navbar.jsx`.
- [x] No XP/gamification hooks by design (pure low-friction capture tool) — confirmed via a live XP-readout watch during manual testing.
- [x] `npm run lint` / `npm run build` clean (no errors in new files; pre-existing baseline errors elsewhere untouched).
- [x] Verified end-to-end with a temporary standalone Playwright harness (`src/testBrainDumpEntry.jsx` + `braindump-test.html`, mounting `BrainDumpPage` directly against `localStorage` — bypasses Firebase auth entirely rather than the `main.jsx` query-param branch used previously) — create/discard-empty/edit/delete/drag/refresh-persistence all scripted and asserted, plus a real mobile-viewport touch-drag (`touch-action:none` confirmed to block page-scroll during drag). Caught and fixed one real bug this way (see lessons.md 2026-07-20): the empty-state hint was positioned at `top:40%` of the 3200px-tall canvas instead of the viewport, making it invisible on load. Harness files deleted after verification.

## Done (2026-07-20): Replace all emoji with lucide-react icons app-wide

Full plan: `/Users/jaydenlee/.claude/plans/ticklish-hopping-dawn.md`. Every raw Unicode emoji/pseudo-icon glyph across all 23 files that had them (achievementsMeta.js, logMeta.js, mentorUtils.js, App.jsx, PlayerDashboard.jsx, HealthPage.jsx, GoalsPage.jsx, WeeklyReviewPage.jsx, DailyLogPage.jsx, WelcomePage.jsx, MentorAssistant.jsx, AuthGate.jsx, LevelUpModal.jsx, TimerPage.jsx, FocusMode.jsx, TasksPage.jsx, ShopPage.jsx, CommitmentModal.jsx, DataModal.jsx, Navbar.jsx, CalendarPage.jsx) replaced with `lucide-react` icon components, following the `Icon` component-field convention already established in `statMeta.js`.

- [x] Full concept→icon mapping table decided and verified against the installed lucide-react version before editing anything.
- [x] Four parallel subagents spawned per the plan's batching — all four died mid-task from a shared account session-limit error; re-audited actual file state (not assumed) and found effectively zero net progress except one partial, out-of-scope rewrite in `DailyLogPage.jsx`'s habit check-in row (kept, since it independently also removed emoji and works correctly).
- [x] Completed all edits directly (not via subagents) after the failure, batch by batch, re-verifying each file's emoji count via a live grep before and after.
- [x] Fixed 2 introduced ESLint errors (false-positive "Icon unused" from the project's experimental React Compiler lint rules) by switching to `const Icon = item.Icon` inside block-bodied `.map()` callbacks.
- [x] Added `display:flex; align-items:center; gap` to CSS classes that went from a lone glyph to an icon+text pair (many components, see lessons.md).
- [x] `npm run lint` (0 new problems vs. pre-existing baseline) and `npm run build` (clean) both pass.
- [x] Verified visually: built a temporary `src/DevHarness.jsx` mounting all 21 changed components/modals with mock props (bypassing Firebase auth via a `?devharness=1` query-param branch in `main.jsx`), screenshotted every page + every modal/drawer with Playwright (installed via `npm install -D playwright --no-save`, chromium already cached), fixed a couple of harness-only bugs (Mentor drawer forced open hid other pages' right columns; a coordinate-based Playwright click missed due to layout shift from a heavy sibling component — switched to a native `element.click()`). Zero console errors across all captures. Harness file, `main.jsx` devharness branch, and the playwright devDependency were all removed after verification (matching the pattern from the 2026-06-24 Calendar feature verification).

## Done (2026-06-24): No Phone Time calendar feature

Full plan: /Users/jaydenlee/.claude/plans/think-of-a-way-fluttering-eclipse.md. Implemented in src/App.jsx + src/components/CalendarPage.jsx + CalendarPage.css:

- [x] New `noPhoneBlocks` array, persisted/synced the same way as `calendarEvents` (App.jsx).
- [x] Full-width translucent "zone" band rendered behind events in Day/Week view, reusing `expandEventsForDates` for none/daily/weekly recurrence (skips `buildColumns` so it never competes with real events for column space).
- [x] Click-and-drag creation on the time grid, gated behind a "No Phone" mode toggle in the header, finalized via a `window`-level `mouseup` listener (see lesson 2026-06-24 — element-level `onMouseUp`/`onMouseLeave` is unreliable mid-drag).
- [x] New modal (label/start/end/repeat) + recurrence edit/delete scope modals, mirroring the existing event scope UX ("this only" / "this & future" / "all").
- [x] Month view shows a small 📵 dot indicator instead of a band (doesn't fit a small cell, doesn't compete with the event-chip budget).

Verified: `npm run lint` / `npm run build` clean (only pre-existing baseline issues remain, confirmed via `git stash` diff). Manually verified end-to-end with a temporary Playwright harness (mounted `CalendarPage` standalone, bypassing Firebase auth) — drag-to-create, daily recurrence expansion across Week/Month views, edit, and "this & future" delete all confirmed working via screenshots; harness + playwright devDependency removed after verification.

## Done (2026-06-20): Fix cross-device sync & save bugs

Full plan: /Users/jaydenlee/.claude/plans/eager-tickling-meerkat.md. All four implemented in src/App.jsx + src/services/firestoreService.js:

- [x] **Bug 1** — stale `gameOfLife_rewards` key renamed to `gameOfLife_shop`; legacy-doc fallback read added in `loadAllUserData`.
- [x] **Bug 2** — `touchedSinceLoadStart` ref added; local edits made while a Firestore load is in flight survive instead of being overwritten.
- [x] **Bug 3** — real-time `onSnapshot` sync added (`subscribeToUserData` in firestoreService.js), with a `lastWrittenValue` cache to prevent feedback loops with our own writes.
- [x] **Bug 4** — `visibilitychange`('hidden') + `pagehide` listeners added alongside `beforeunload` to flush pending writes on mobile backgrounding.

Verified: `npm run lint` (zero new warnings/errors vs. baseline), `npm run build` (clean), Vite dev-server transform check on both changed files (no syntax errors).

## Done (2026-06-21): Real root cause + data recovery

The 4 fixes above weren't actually why mobile was stuck on level 64 — Firestore's default **test-mode security rules expired 2026-06-10** (30 days after the database was created on 2026-05-11) and were silently denying all reads/writes since. Laptop kept progressing locally (localStorage), nothing reached the cloud.

- [x] Found and fixed a regression in the Bug 2 fix: `touchedSinceLoadStart` was never cleared after the load resolved, permanently blocking real-time updates for any key touched once in a session. Commit `994f772`.
- [x] User confirmed via Firebase Console Rules tab: rule was `allow read, write: if request.time < timestamp.date(2026, 6, 10);` (default test-mode expiry).
- [x] Replaced with `allow read, write: if request.auth != null && request.auth.uid == userId;` scoped to `users/{userId}/data/{document=**}`.
- [x] Found a second, unrelated leftover Firebase Auth user (test/null data from early development) — confirmed harmless/inert since both real devices sign in with the same account; left for optional cleanup, not required for the fix.
- [x] Cleared the stale `data` subcollection under the real user's doc in Firestore Console, reloaded laptop (re-seeded cloud via existing `migrateLocalStorageToFirestore` path), reloaded phone — confirmed correct data + live bidirectional sync both work.

**Closed.** No firestore.rules file exists in this repo (rules are managed manually via Firebase Console) — worth remembering if sync ever silently breaks again, check Rules tab first.
