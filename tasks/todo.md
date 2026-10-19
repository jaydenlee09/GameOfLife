# Todo

## Done, uncommitted (2026-10-19): sidebar "Missed": reschedule or let go slipped blocks

User picked idea 1 + recommended options: originals become Skipped ("Plans changed") when rescheduled
unanswered; window = today + yesterday; a Let it go button.

- [x] calendarSidebar: getSlippedBlocks (missed/skipped, today+yesterday, from PLAN_KEPT_START, not
      `outcome.handled`), handleSlippedBlock (checks in Skipped via completionUtils.checkInBlock if
      unanswered, then stores handled: 'rescheduled' | 'let-go'), rescheduledCopy (one-off, same
      length, category + plan link minus planner id, `rescheduledFrom`).
- [x] Sidebar "Missed" section on top (hidden when empty): category stripe, "Yesterday · 4pm–5:30pm ·
      No check-in / Skipped (reason)", Reschedule (today's next free slot) + Let it go. Notes share
      one `sideNote` state with quick blocks.
- Verified: node checks (list/order/exclusions, outcome writes incl. recurring date only, yesterday's
  Plan kept credit unchanged, check-in prompt stops asking, copy fields), lint 0, build, harness:
  4 rows, reschedule 90-min block → 4:00 PM today (skipped a 30-min gap), let go, strip prompt moved
  on, long titles ellipsized, reason line wraps, no horizontal overflow.

## Done, uncommitted (2026-10-19): sidebar follow-up: drop Time left, quick blocks by category

User: remove "Time left today"; quick time blocks should be the same color as their category, like the calendar.

- [x] TimeLeftCard (.jsx/.css) + getTimeLeft deleted.
- [x] calendarSidebar.templateCategoryLookup: template pick → category stored on a same-title block
      (user/AI) → keyword → Other, so a template matches the blocks it makes. Card stripe uses it
      with the user's category color overrides.
- [x] Template editor: color swatches → the block editor's Category chips (Auto shows its guess);
      old per-template `color` dropped on save. A picked category rides onto placed blocks
      (one-tap and drag → form) as categoryBy 'user'.
- [x] Fixed: template editor had a second close button wired to closeDayEventModal (did nothing).
- Verified: node checks (lookup order + time-left removal), lint 0 errors, build, harness:
  4 templates colored Work/Creative(AI-stored)/Social(picked)/Fitness, placed blocks same colors,
  editor chips + save recolors card (Piano → Health).

## Done, uncommitted (2026-10-19): Calendar sidebar, ideas 1-4

Problem (user): make the Calendar page's sidebar better and more helpful.
User choices: ideas 1-4; Schedule puts a later task on its own day; goal deadlines 14 days ahead + overdue.

- [x] 1. One task list: "Needs a time slot" covers this week (Today / Tomorrow / weekday groups).
      Every row drags + has Schedule (first free hour on the task's own day). Read-only "Tasks"
      section removed. Later-timeframe tasks with a due date this week land on the due day.
      taskUtils.getUnscheduledTasks gains `upcoming` [{ dateKey, tasks }]; phone row stays today-only.
- [x] 2. "Time left today" card at the top: free time before bedtime (planner hours via
      computeFreeGaps), booked vs free bar, next free gap.
- [x] 3. Quick blocks: one-tap "next free slot" button. One-off template → placed directly,
      same block drag+Save would make. Recurring template → create form opens prefilled at that
      slot (a series shouldn't start silently).
- [x] 4. Coming up: friendly dates ("Tomorrow 3 PM", "Thu", "Oct 30"), plus goal deadlines
      (next 14 days + overdue, not done); a goal row opens Goals. Needs `goals` + `onNavigate` props.
- [x] Verify: node checks on new helpers, lint (non-empty before/after), build, browser harness
      with heavy data (sidebar overflow, ellipsis, min-width:0), click-test each button.
- Verified: node checks (getTimeLeft now/next/ended/full, findFreeSlot today/other day/none,
  getUnscheduledTasks week groups + planned/done/8-days-out excluded, getComingUp order, labels,
  14-day edge, overdue, completed/no-deadline excluded, raw time kept), lint 0 errors (App's 27
  warnings unchanged), build, scratchpad harness mounting the real CalendarPage at 1280x800 + heavy
  data: tomorrow Schedule → Tue 7:00 AM block, one-off template → 4:00 PM (skipped a 45-min gap),
  repeating template → form at 5:30 PM, goal row → Goals, reminder row → edit form with its time,
  no horizontal overflow, 16/16 long titles ellipsized; phone tray still today-only.
- Bug caught in browser: reminder rows lost their raw `time`, so the edit form opened blank. Fixed.

## Done, uncommitted (2026-10-18): stop wasting Gemini requests

Problem (user): hit "free-tier rate limit"; asked whether AI usage is wasted anywhere.
Audit: no runaway loops; the leak was a burst on app open (check-in up to 7 calls + Home line +
category sort + goal next steps) against ~10 requests/min, plus duplicate features.

User choices: fixes 1-4; Weekly Review "AI Pattern Analysis" removed (not replaced).

- [x] assistantUtils: createRateGate — rolling 60s window, 9 slots, background calls capped at 6
      (so what you ask for always has room); per-minute 429 retried up to 2x after Gemini's
      retryDelay (cap 60s); daily-quota 429 not retried, friendlier "resets midnight Pacific" error.
      Background = silent check-ins, nightly pattern flags, category sort, auto Home line,
      auto goal next step (asBackground wrapper).
- [x] Home line = morning check-in's first line (in-app check-in prompt + server push brief);
      standalone call only after the morning window / failed check-in, or the manual refresh.
      send() now resolves the reply text.
- [x] thinkingBudget 0 for category sort, focus comment, Home line.
- [x] Weekly Review AI Pattern Analysis section + CSS removed (Daily Log flags cover it).
      Removing it let the React compiler lint the component: fixed its dependency list.
- Verified: node checks (gate caps/fg reserve/retry/daily no-retry/concurrency, error parsing,
  first-line parser), lint 0 errors in changed files, app + functions build, browser harness at a
  faked Tue 8am/4pm: morning = 1 agent call + Home line from it (no brief call), 4pm fallback =
  1 brief call, forced 429 retried after 2s with no error, thinking off confirmed, Weekly Review OK.

## Done, uncommitted (2026-10-18): iPhone Home Screen widget (Scriptable)

Problem (user): wants iPhone widgets for APEX that keep them on track. iOS gives web apps no
widgets, so: Scriptable (free) script reading a small read-only summary doc.

User choices: Scriptable · large widget layout = score + what's at stake (streak gap, rank
progress) · Now/Up next block (category color, time left) · Top 3 tasks with done marks ·
habits left · next best move, switching to Close the day after 8pm. Not real time (iOS refresh).

Design:
- [x] `utils/widgetSnapshot.js`: pure buildWidgetSnapshot(state, now) from the same utils as
      Home (computeDailyScore/computeStreak/getNextMove/computeRankStatus/todayQueue/
      getCloseDaySteps/blockColor). Items = today+tomorrow events/No Phone/reminders with
      start/end ms, so the widget picks Now/Next by its own clock between refreshes.
      Refactor getNextUp's item expansion into getDayItems (shared).
- [x] Public doc `widgets/{token}` = { uid, updatedAt, json } (128-bit random token, get-only
      for the world; owner-only writes). Settings in users/{uid}/data/gameOfLife_widget
      { token, timezone }.
- [x] Client: widgetService (enable/reset/disable/publish/subscribe); App effect publishes on
      data change (debounced, skip if unchanged) + clockTick.
- [x] Server tick: also refreshes the widget doc each ~5 min (day rollover, app closed);
      loads state once for push + widget; skips if the client wrote newer data.
- [x] Alerts tab: "Home Screen widget" card: turn on, copy script, reset link, turn off.
- [x] `src/widget/apexWidget.scriptable.js` (imported ?raw; buildWidgetScript bakes in the doc
      URL + app origin): large +
      small/medium/lock-screen fallbacks; tap areas open ?page=.
- [ ] User pastes Firestore rule for /widgets (currently 403 for public reads, probed).
- [ ] After push + rule + Turn on: curl the widgets/{token} REST URL to confirm a live snapshot.
- [x] Verify: node checks on snapshot, script run against a fake Scriptable API rendering to
      canvas/PNG, lint, build, browser test of the card + copy, server build.
- Verified: node checks (snapshot score/streak match Home helpers, Top 3 fill + done marks,
  items colors/order/exclusions, getNextUp identical to before at 7 times of day, server
  processUser: widget-only / app-newer skip / not-owner / both-off / push+widget), script run
  in a fake Scriptable renderer at large 321x324 / 338x354 / 364x382, medium, small, 3 Lock
  Screen sizes, stale/null/404/offline (no overflow after tightening for SE), card flow
  (blocked → on → copy → reset → off) with stubbed API, real buildWidgetScript output, lint
  0 errors, app + functions build. Not verifiable here: real Scriptable rendering on the phone.

## Done, uncommitted (2026-10-18): time blocks colored by category (auto + override)

Problem (user): AI should pick a block's color from the category it fits (school/study/homework
→ Academic), and the user can change it.

User choices: fixed 9 categories (Academic, Work, Fitness, Health, Social, Chores, Creative,
Rest & fun, Other) · keywords first, Gemini only when no keyword matches; Assistant + Plan My
Day blocks get a category from the AI directly · per-block override = category chips + custom
color · category colors editable app-wide.

Design:
- [x] `utils/blockCategories.js`: categories + keyword lists, guessCategory(title),
      blockCategory(ev) = ev.category || keyword || 'other', blockColor(ev, categoryColors)
      = ev.color || category color; batched Gemini classify (schema + normalizer).
      Replaces color-by-type (kind still shown in the hover card).
- [x] Stored fields on a block: `category` + `categoryBy` ('user'|'ai'), `color` (custom hex).
      Keyword matches are never stored (derived at render). Old blocks: no migration.
- [x] App.jsx: background effect sends uncategorized, keyword-less titles to Gemini in one
      batch, writes category (incl. 'other') so it is never re-asked; per-session attempted set,
      retry after 1h on failure. `user.categoryColors` holds per-category color overrides.
- [x] Block editor: Category chips (Auto · <guess> + 9) and Color row (Category default,
      swatches, any color); title edit drops a non-user category so it re-derives.
- [x] Category colors modal: palette button in the Calendar header (phone too) + "Edit category colors" link in the editor. (Sidebar was too full for a list.)
- [x] Blocks get a light category tint; hover card shows the category.
- [x] create_calendar_event tool + Plan My Day schema gain an optional `category` enum.
- [x] Verify: node checks for guess/normalize, lint, build, browser test of editor/modal/colors.
- Verified: node checks (36 keyword cases, editor save rules, plan/tool category), lint 0 errors
  (27 old warnings), build, browser harness (stubbed auth + fake Gemini): grid colors per category,
  one batched AI call for keyword-less titles saved as categoryBy 'ai', rename → Auto re-guesses,
  user pick + custom color saved, category recolor saved to user.categoryColors, phone 375px fits.


## Done, uncommitted (2026-10-18): AI goal coach + accountability

Problem (user): making one goal takes a lot of thinking and calibration; wants AI in the process,
steps, and ways to stay accountable.

User choices: draft + 2 quick chips (time per week, starting point) · draft includes measure +
milestones, this week's tasks, linked habit, obstacle + if-then · all four accountability
features (pace check, auto next step, weekly recalibration, get unstuck) · AI only suggests;
nothing changes until one tap.

Design:
- New `utils/goalCoach.js` (pure, like lessonInsight/logReview): four tool-free structured-JSON
  calls through `geminiGenerateJson`, each with schema + context builder + normalizer that
  validates everything in code (dates YYYY-MM-DD and not past, caps on list lengths, habit link
  must be an existing habit id or a new daily-habit name, task text trimmed).
  1. draftGoal({ text, hoursPerWeek, startingPoint }) → { title, deadline, why, measure:
     { kind: 'number', target, unit } | { kind: 'milestones' }, milestones[3-6] (first doable
     this week), tasks[1-2] for this week, habit { existingId | newName } | null, obstacle,
     ifThenPlan }. Context: North Star, other active goals, existing habits, today.
  2. suggestNextStep(goal) → { text, why } (one milestone).
  3. getUnstuck(goal) → { step (≤20 min), minutes, why }.
  4. recalibrate(focus goals + this week's activity, pace, missed tasks/blocks) → per goal:
     { verdict, changes[] } where a change is one of: moveDeadline(date), setTarget(n),
     addMilestone(text), dropMilestone(id), addTask(text); max 3 per goal.
- Hooks: `useAssistant` gains draftGoal / suggestNextStep / getUnstuck / recalibrateGoals
  (same { ok, error } shape and friendlyError as the others).
- Goal creation: quick add keeps Enter = plain add. New "Shape with AI" button beside it opens a
  draft sheet: the typed text, chips Time per week (1h / 3h / 5h+ / skip) and an optional
  "Where are you starting from?" line → Draft it → editable draft (title, deadline chips, measure,
  milestone list editable/removable, tasks + habit as toggles, obstacle/if-then fields) →
  Create goal (one tap applies goal + tasks + habit link/new habit). Failure shows the error and
  keeps the text; plain add still works.
- Pace (no AI, goalUtils.getGoalPace): for goals with a deadline and a % (milestones/number):
  expected = time elapsed since creation / total time; behind when progress < expected − 15
  points (once ≥ 15% of the time has passed); ahead when > expected + 15. Shown as a badge on the
  card ("Behind pace"), counted in status, on Home rows, in My Assistant/Plan My Day context.
- Auto next step: ticking the last open milestone (goal not done) fires suggestNextStep once and
  shows "Next: … · Add" in the card's Next row; goals with no next step get a "Suggest a step"
  button there. Suggestions are kept on the goal (`coach.nextStep`) until added or dismissed.
- Get unstuck: quiet or behind-pace goals get a "Get unstuck" button → smallest step, then
  "Add as task" or "Schedule it" (first free gap today, else tomorrow, via computeFreeGaps +
  planToEvents as a goal block linked to the goal).
- Weekly recalibration: Weekly Review's Goal Check-In gets "Recalibrate with AI" (current week).
  Result saved on that week's review (`weeklyReviews[monday].goalCoach`) so it isn't re-run;
  each change has its own Apply button, plus Apply all. The Sunday goals push says
  "…Recalibrate in Weekly Review" and opens Review. In-app weekly check-in prompt mentions it.
- No XP from any AI path (milestones/tasks it adds pay only when you complete them).

Steps:
- [x] goalCoach.js (schemas, contexts, normalizers) + getGoalPace + node checks
- [x] useAssistant hooks + App wiring
- [x] Draft sheet on Goals page (chips, draft editor, create)
- [x] Pace badge (Goals, Home, AI contexts), next step + Get unstuck on cards
- [x] Weekly Review recalibration + push/check-in copy
- [x] Verify: node checks, harness with faked Gemini at 1440 + 375, lint diff, build, memory

Changes from the plan: 'behind' became a goal status (after overdue and quiet), so Home, the
Goals subtitle ("N need attention") and the Statistics tile count it · a number goal's suggested
step (and any recalibration addMilestone) becomes a task, since a milestone would switch its %
bar from the number to milestones · Get unstuck also shows on overdue goals · auto next step is
for focus goals only and skips when there's no API key · Goals popups moved to the 9500 layer
(above the AI bar and tab bar) · Weekly Review Save now merges instead of replacing the week.

Verified: node checks (draft validation: bad/past dates, dup/over-long lists, habit by id or
same name, number vs milestones; records incl. unique milestone ids, toggles; next step dup
guard; unstuck minute clamp; recalibration: unknown/duplicate goal ids, setTarget only on number
goals, dropMilestone only open ids, max 3; apply each type; scheduleStep today vs tomorrow; pace
behind/on/ahead/early/none; push Sunday recap opens Review). Harness (real App, Gemini stubbed by
schema) at 1440 + 375: auto next step on stepless focus goals (once), Add as task on a number
goal, Get unstuck → Schedule it (19:45 goal block linked), Shape with AI with chips (context
carries hours/start/North Star/habits) → edit → Create (goal, 4 milestones, 2 tasks, habit
linked, card opens), number draft with new habit + tasks off, Weekly Review recalibrate →
Apply one → Apply all (no duplicates) → Save keeps it; sheet fits a phone above the tab bar; no
horizontal overflow; no console errors. Lint 39 (no new), app + functions build pass.

## Done, uncommitted (2026-10-17): Goals you actually use

Problem (user): goals are too hard to create, don't connect to the rest of the site or show
progress, and get forgotten because nobody opens the Goals page. Would rather use Notes.
Root causes in code: 7-part GoalModal · goals bucketed into calendar week/month/year (weekly ones
go Overdue every Monday) · `getGoalProgress` only counts hand-ticked milestones / typed numbers,
ignoring linked tasks, habits, focus and calendar blocks · goals only surface as one title on Home.

User choices: optional deadline (no buckets) · progress auto from linked work (milestones/number
still drive the % bar when present) · reminders on Home tiles, Close the Day, push, task/focus
goal chip · no Notes import.

Design:
- Data (backward compatible, normalizeGoal migrates on load, no Firestore rewrite needed):
  `deadline` 'YYYY-MM-DD' | null. Old goals: deadline = their period's last day (from
  period/periodKey); `period`/`periodKey` kept but ignored. Overdue = deadline passed, not done.
  Goal XP by horizon (createdAt → deadline): ≤10 days 50, ≤45 150, longer or none 400 (same
  table as today's weekly/monthly/yearly), milestone discount unchanged, still paid once.
- `goalUtils.getGoalActivity(goal, { todos, habits, pomodoroSessions, calendarEvents, now })`,
  pure: per-day list of what moved it (linked task done, linked habit check-in, focus minutes on
  the goal or a goal-linked task, goal/task block done or partly, milestone ticked, number
  changed). Gives `lastMovedAt`, `daysQuiet`, this week's count + focus minutes, 7-day strip.
  Status: on track / quiet (5+ days) / overdue / done. Replaces `updatedAt` as "last progress"
  everywhere (assistant stalled nudge, dayPlanner daysSinceProgress, stats tile).
- Focus sessions get optional `goalId` (makeFocusSession); goal-linked task sessions count too.
- Quick add on Goals page: one text box + deadline chips (End of month / 3 months / End of year /
  No date / pick date) → Enter saves. Card expands to add milestones, number, obstacle plan,
  link habit, add task (same fields as today, moved out of the create step). Edit modal kept
  for full edits, minus the period picker.
- Goals page: Focus (pinned, up to 3) → Active → Done (collapsed). No period tabs/arrows.
  Card: title, deadline ("12 days left" / "Overdue"), % bar if milestones/number, this-week
  strip + "Last moved 2 days ago", next step (first open milestone or open linked task).
- Home: Why tile's single goal row becomes up to 3 goal rows (focus goals first, else soonest
  deadline) with status dot + "quiet 6d" / bar; tap opens Goals.
- Close the Day, Check-in step: "Moved a goal today?" one tap per focus goal (Yes = logs a
  manual `goal.checkins[date]` that counts as activity; auto-detected activity shows already
  ticked). No XP (XP stays earned through the linked work).
- Tasks: QuickAdd gets a goal chip (pick an active goal); TaskDetail can link/unlink a goal.
  Focus (FocusMode + Timer): "For goal" picker beside the intent; defaults to the task's goal.
- Push: new `goals` type in pushSchedule (default on): a goal quiet 5+ days (once per goal per
  3 days, evening) and a Sunday 18:00 "goals check" listing focus goals' week. Settings toggle
  in NotificationSettings. Ships through the existing GitHub Actions bundle.
- WeeklyReviewPage Goal Check-In: focus goals + any due this week (not periodKey); "carry
  forward" becomes "push deadline" (+7 days). Assistant tools: get_goals returns deadline +
  activity; add a `create_goal` (title, deadline) tool tier auto+undo. Achievements untouched.

Steps:
- [x] goalUtils: deadline migration, horizon XP, getGoalActivity/status + node checks
- [x] Focus sessions + task links carry goalId (makeFocusSession, FocusMode, Timer, QuickAdd, TaskDetail)
- [x] GoalsPage rebuild: quick add, Focus/Active/Done, activity card, expand-to-detail
- [x] Home goal rows, Close the Day goal tap
- [x] Weekly Review, dayPlanner, assistant tools/nudges, stats tile → deadline + activity
- [x] Push `goals` type + settings toggle
- [x] Verify in browser (1440 + 375, empty + populated, old-format goals), lint before/after, build, memory

Changes from the plan: no-deadline goals pay 150 XP (not 400), so "type a goal, tick it" can't
farm the top tier · deleting a goal now unlinks its tasks instead of deleting them · in-app
stalled nudge moved from pinned-7-days to focus-goals-5-days (same rule as the push) · short
phones hide the week-priority row (not the goals row) and the third goal.

Verified: node checks (migration incl. weekly/monthly/yearly ends, horizon XP, activity from all
6 sources incl. recurring block outcomes + task-linked focus, quiet/overdue, focus ordering, push
deadline; push: Sunday recap, quiet on day 5 then every 3rd, window, type off; tools: get_goals
deadline/momentum, create_goal + dup/date guards, update_goal deadline none, tiers). Real App
harness (auth/Firestore/push stubbed, seeded) at 1440 + 375x812 + 375x667: milestone +15 and next
step advances, inline task linked, task complete +50 counts, quick add 3 months, +1 week on
overdue, Mark achieved pays once, edit modal, delete unlinks tasks + habit, Focus button opens
Focus Mode with goal + intent, Tasks goal chip + TaskDetail goal select, Close the Day auto
"Counted" + manual tap on/off with no XP, Weekly Review week counts + push deadline, Statistics
tile, empty state; Home zero-scroll at 812 and 667; no horizontal overflow; no console errors.
Lint 40 → 39 (old GoalsPage purity error gone, no new). App + functions build pass.

## Done, uncommitted (2026-10-17): Desktop sidebar, more helpful but still minimal

User choices: all four additions (grouped links, live status hints, next-move card, ⌘K jump-or-ask);
floating "Ask anything" bar stays as is (⌘K is a second door into the same assistant, no new AI
calls); footer squeezed to one compact row + XP bar + user row.

Design:
- Groups: Today (Home, Tasks, Calendar, Daily Log, Timer) · Grow (Goals, Statistics, Review) ·
  Extras (Shop, Brain Dump). Quiet labels; collapsed sidebar shows thin dividers instead.
  The empty `.sidebar-brand` strip goes; the ⌘K button takes its place.
- Hints (`getNavHints` in new `utils/navUtils.js`, pure, takes `now`), shown only when actionable:
  Tasks "N left" (todayQueue) · Calendar: "N to check in" (amber) > "now" > next block's start
  time (getPlanDay) · Daily Log dot in the evening until Close the Day is done (getCloseDaySteps)
  · Review dot from Sunday noon until this week's review is saved. Collapsed: a dot on the icon.
- Next-move card: getNextMove (same as Home's "Next:" line), click goes to `move.page || 'welcome'`.
  Hidden when there's no move and when collapsed.
- ⌘K / Ctrl+K palette (`CommandPalette.jsx`, rendered by Navbar, open state in App): actions
  (Plan my day, Start focus, Open My Assistant, Close the day) + every page with its Alt shortcut;
  typed text with no exact intent falls through to "Ask My Assistant: …" (askAssistant).
  Alt page keys move to `navUtils` so App's handler and the palette's hints can't drift.
- `useNow` moves from WelcomePage to `hooks/useNow.js` and is shared.

Steps:
- [x] navUtils (ALT_PAGE_KEYS, getNavHints) + hooks/useNow; App passes scoreInputs/data + commands
- [x] Navbar: ⌘K button, next-move card, grouped links with hints, compact footer, collapsed state
- [x] CommandPalette + ⌘K handler
- [x] Verify in browser: 1440 wide, collapsed, phone More sheet, palette keyboard flow, ask fallback
- [x] Lint (before/after, non-empty), build, memory

Verified: browser at 1440/1280 wide, collapsed and phone More sheet (no overflow, toggle clears the
search box); ⌘K open/type/Enter/arrows/Esc; Plan my day runs; ask fallback reaches Gemini request body;
Option+2 / Option+S by key code; Ctrl+K ignored on Mac; Calendar hint missed → time after Done;
navUtils unit checks (evening/Sunday/now cases); lint no new issues (Navbar's 2 old errors gone); build ok.
Note: More sheet tile order follows the new groups (Timer, Goals, Statistics, Review, Shop, Brain Dump).


## Done, uncommitted (2026-10-17): Calendar that holds you to the plan

Goal: the calendar should hold you to the plan, not just record it. Four parts: a missed-block
state plus an end-of-block check-in, a Today strip, "Plan kept" in the Daily Score, and an
unscheduled Top 3 tray.

User choices: Plan kept = 10% (Habits 25, Tasks 25, Sleep 20, Plan 10, Log 10, Commitment 10),
counted only from 2026-10-17 on (earlier days keep the old formula, so streak and rank history
don't change) · a day with no blocks scores 0 for Plan · Done = full XP + credit, Partly = half
of both, Skipped = nothing + a one-tap reason · check-in shown in the app (Calendar + Home) and
sent as a push · Done on a task block also completes the task · the tray shows unscheduled Top 3,
then today's other tasks · task → 60-minute block.

Design:
- Outcome per instance: `outcomes: { [dateKey]: { status: 'done'|'partly'|'skipped', reason?, at } }`
  on every block (one-off and recurring alike). Done and Partly still set `completed`/`completedDates`,
  so every existing "is it finished" check (Home, push, planner, focus) keeps working unchanged.
  Old data (completed, no outcome) reads as Done. No migration needed.
- `getBlockStatus(ev, nowMs)` in calendarUtils: done / partly / skipped / missed (ended, no answer)
  / now / upcoming. Single source for the grid, strip, Home, push and score.
- `checkInBlock(ev, status, reason)` in completionUtils replaces direct `completeBlock` calls:
  pays XP (Partly = half; Partly → Done pays the rest; Skipped can be re-answered; Done is final,
  as it is now), records the outcome, and returns `taskId` for a task block marked Done.
  One App-level `checkInBlock` handler (it also completes the linked task) is used by Calendar,
  Home, the focus debrief and the assistant's complete-block path.
- Score: the score functions take one inputs object `{ habits, xpLog, logs, commitmentArchive,
  healthLog, calendarEvents }` instead of 5 positional arrays (all ~15 callers updated; a missed
  caller crashes loudly instead of scoring wrong). Days >= PLAN_KEPT_START get the `plan` part:
  credit / blocks × 10, labelled "2/5 blocks kept · 1 skipped (Distracted)". Anything that
  hard-codes weights (Statistics SCORE_COMPONENTS, TrendChart, explainScore, getNextMove) reads
  the per-day weight from the breakdown instead, and skips parts the day doesn't have.

Steps:
- [x] calendarUtils: outcomes, `getBlockStatus`, `blockEndMs`, `PLAN_KEPT_START`, `SKIP_REASONS`
- [x] completionUtils `checkInBlock` + App handler (task completion, XP log) wired into Calendar,
      FocusCoach debrief and the assistant tools
- [x] scoreUtils: inputs object + plan part + date-based weights; update every caller, App memo deps
- [x] Calendar grid: missed (dim + red edge + "Check in"), partly, skipped styles; circle button
      opens a check-in popover (Done / Partly / Skipped → reason chips)
- [x] Today strip above the grid (all views, always today): planned time · kept x/y · missed ·
      Now/Next with Start focus · first unanswered block with inline Done/Partly/Skipped (+N more,
      today and yesterday) · empty day → "No blocks today" + Plan my day
- [x] Home: check-in card for the oldest unanswered block (today/yesterday)
- [x] Tray: "Needs a time slot" at the top of the sidebar (desktop; drag onto the grid or tap
      Schedule) and a chip row under the strip on phones (Schedule = next free 60-min gap today,
      via dayPlanner's `computeFreeGaps` + `user.planner`). Block carries `plan: { kind: 'task', taskId }`
- [x] Push: new `checkins` type ("After each time block ends"): "Did you do X?" within 60 min of a
      block's end if still unanswered, opens Calendar. Toggle in NotificationSettings
- [x] Plan row in Close the Day's "Where your points went" (fix → Calendar), Statistics leak +
      trend series, Home next move ("Check in on a block")
- [x] Verify: node checks (pre-start days score identical to before; weights; no-blocks = 0; partly
      half; XP top-up; push decisions), lint vs baseline, build, harness at 1440 + 375 (check-in
      flow end to end with data shaped like the real write path, tray drag + Schedule, strip states)

**Verified:** node checks (60 pre-start days score and break down identically to HEAD's formula;
weights sum 100; no blocks = 0; done/partly/skipped credit + label; partly→done XP top-up, done final,
partly can't drop; recurring per-date outcomes; taskId only on done; explainScore plan row absent on
old days; check-in push fires once, skips answered/off/>60 min late; pending excludes pre-start days;
tray hides tasks with a block in the week ahead, a skipped block frees the task; next move suggests a
check-in). Lint findings identical to HEAD (42), app + functions build pass. Harness (own port, seeded)
at 1440, 375, 320: strip states, Partly/Skipped+reason/Done from the strip, Done from the grid popup
also completed the linked task (+task XP), Schedule → 11:30 block, drag to Sunday, Home card advances
then disappears, Close the Day Plan row, Statistics legend; no horizontal overflow.
Found + fixed in testing: the grid "Check in" pill sat under the hover action bar (a click hit
Duplicate) → moved into the block's content; Close the Day crashed on the new `plan` key (icon map
had no entry); tray kept showing a task dragged onto tomorrow → counts blocks in the week ahead.
Also removed a stray, handler-less "Add event" label in the calendar sidebar (leftover in HEAD).
Not verifiable here: a real push on the phone (needs the GitHub Actions tick after deploy).

## Done, uncommitted (2026-10-17): Mobile nav + smaller popups

User choices: tabs Home/Tasks/Calendar/Log + More; event pill top-right that shrinks to an icon;
priority card becomes a pill too.

- [x] Bottom nav moves into Navbar.jsx (one place owns navigation). Tabs: Home, Tasks, Calendar,
      Log, More. More highlights when the current page lives in the sheet.
- [x] More sheet lists only the pages not in the bar (3-col tiles), real header + close, footer kept.
- [x] Bar polish: bigger labels, active pill behind icon, hover only on hover devices (fixes the
      sticky-white active tab on iPhone), press feedback, re-tap active tab scrolls to top.
- [x] Page change scrolls to top (mobile scrolls the window, so pages opened mid-way down).
- [x] Safe area: viewport-fit=cover + `--bottom-nav-h` token replacing every hard-coded 60px.
- [x] Event pill: top-right, icon + title + countdown, shrinks to an icon after 4s, tap to expand,
      X to dismiss. Hidden on Home and Calendar; sits below Daily Log's tabs.
- [x] Priority: starts as a pill on phones, above the AI bar; popups stay under the More sheet.
- [x] Verify (harness, 375x812, 320x568, 1440x900): Home tab active on Home; pill opens on first
      view and shrinks after 5s (timer only runs while visible; first try shrank it on Home);
      tap icon/info toggles; Daily Log pill at y66 under the tabs; priority pill 10px above the AI
      bar; page change and tab re-tap land at top; More sheet lists 6 pages, More stays lit on
      them, pills sit under its backdrop; no label/tile overflow at 320; desktop has no tab bar,
      --bottom-nav-h 0, pill clear of the AI bar. Lint counts unchanged (27/56), build passes.
      Not verifiable here: the real iPhone home-indicator inset (needs the installed app).

## Done, uncommitted (2026-10-17): Daily Log fills the screen on monitors

At >= 1400px (same breakpoint as Statistics) the routine drops its 680px column and uses the full
width: two columns per step, placed by `cd-a-*` area classes on each card (Block's new `area` prop)
and a per-step `cd-body--<step>` grid. Check in = mood/rating/habits | body; Reflect = writing |
question + lesson, pattern cards side by side; Tomorrow = ideas | promise; Finish = checklist,
numbers, button | points; Day closed = numbers, points, tomorrow | review. A trailing `1fr` row
absorbs a tall spanning card so the cards beside it stay packed. Past entries: two-column grid,
mood/meta/review span both. Below 1400px nothing changes.

- [x] Verify: 2560x1440, 1920x1080 (every step fits on screen), 1440x900 (no overflow/clipping),
      1366 and 375 unchanged, past entry at 1920. Found + fixed at 1440: the Workouts card (191px)
      overflowed; a container query wraps the type picker onto its own row when the card is
      under 240px (needed higher specificity than the base `.hq-workout-add .health-select` rule).

## Done, uncommitted (2026-10-16): "Where your points went" on the Daily Log

Goal: after the Daily Score, show where points were missed and how to win them back tonight.

- [x] `explainScore` in closeDay.js: per-part points earned / possible (sums exactly to the score),
      a fix per part (`step` in the routine or `page`), or a note when it can't be won back tonight.
- [x] ScoreBreakdown block on Finish + Day closed: bar per part, "X to go to keep/start a streak",
      fix buttons (tick a habit -> Check in, finish a task -> Tasks page, log sleep -> Check in,
      add a mood/win -> Check in, mark yesterday's -> Look back, missed/no commitment -> "Lock
      tonight's to earn this tomorrow" -> Tomorrow).
- [x] Fixed on the way: scoreUtils labelled an *unmarked* commitment "Commitment missed"; now "Not
      marked yet" (also corrects Home's chip and the review's context). Only "No commitment" is
      string-matched elsewhere (statsInsights), unchanged.
- [x] Verify: node checks (points sum to score, perfect day has no fixes, all commitment states),
      lint diff (no new), build, harness at 1440 + 375: rows/hint/streak goal, mark-kept fix raised
      the score 1 -> 2 and cleared that row, task fix opens To-Do, closed screen, no overflow.

Not changed (flagged to user): sleep scores 0 unless > 9h, while the check-in calls 8-10h "Optimal".

## Done, uncommitted (2026-10-16): Daily Log "Learn more" on lessons

Goal: after writing "one thing I learned", tap once to learn a little more about it.

**Locked decisions (Q&A 2026-10-16):** tap a button (no auto-run) · content = quick explainer +
try it tomorrow + go deeper (follow-up question to My Assistant + a search link) · saved on the
entry (synced) · available on tonight's Reflect step, past entries and every item in the Lessons tab.

**My defaults:** stored as `entry.lessonInsight {explainer, tryIt, deeperQuestion, searchFor,
forText, generatedAt}`; editing the lesson shows "You edited this lesson since · Refresh" ·
results are saved by date (not the selected entry), so a call that finishes after you switch days
lands on the right entry · "go deeper" sends `About something I learned ("…"): <question>` to the
drawer · prompt tells the model to correct a wrong/oversimplified lesson and never invent studies or
numbers · not part of entryFingerprint (AI output, not your writing).

- [x] `src/utils/lessonInsight.js` (context, schema, prompt, normalize, stale check, search URL).
- [x] `expandLesson` in useAssistant; `askAssistant` in App.
- [x] `dailyLog/LessonInsight.jsx` (full + compact) in Reflect, past entries, Lessons tab; styles.
- [x] Verify: node checks, lint diff (no new), build, harness at 1440 + 375: button only once a
      lesson exists, loading state, saved + rendered, stale + refresh, search link, go-deeper opens
      the drawer and sends, older lesson from the Lessons tab saves to its own date, past entry
      shows the card, no overflow.

## Done, uncommitted (2026-10-16): Daily Log -> "Close the Day" routine

Goal: the Daily Log stops being a 9-section form and becomes a short guided night routine whose
answers carry forward, so each night builds on the last.

**Locked decisions (Q&A 2026-10-16):** guided steps (past entries open as a full read/edit page) ·
all four growth features: close the loop, lessons library, pattern flags, rotating prompt + 1-10
day rating · night mode look, Daily Log only · phone and desktop equal priority · pattern flags =
AI groups last 14 days of "improve" notes once a night (cached) + code facts (most-missed habit).

**Steps (today's entry):**
1. Look back: yesterday's commitment kept / missed (same `resolveCommitmentRecord` as Home) +
   "Did you work on: <yesterday's improve>?" yes / partly / no.
2. Check in: emotions (same 16, multi-select, muted chips), 1-10 day rating, energy, habits not
   ticked yet, sleep / water / screen time (autosave), food tracker collapsed ("anything not logged").
3. Reflect: wins (1 required, up to 3), one thing to improve (+ add up to 3), lesson learned,
   tonight's rotating prompt, one resurfaced old lesson, pattern flag card if any.
4. Tomorrow: commitment with suggestion chips (tonight's improve, pinned goal, last review's
   tomorrowFocus) + optional "If/when ___, I will ___" template; Hold to Commit.
5. Finish: one button -> health XP (same once-per-day rules) + Submit & get review; "Day closed"
   screen with score, streak, review card. AI failure never blocks closing the day.

**My defaults:** steps freely navigable (step pills), so food can be logged any time of day ·
a closed day reopens on its summary with Edit · new entry fields are additive (`dayRating`,
`loopCheck`, `prompt: {id, text, answer}`, `closedAt`); `proud` / `improve` / `commitment` keep
their shapes so Daily Score, Home, Calendar viewer, review and assistant tools keep working ·
prompt pool is static code (deterministic per date, some templated with North Star / pinned goal) ·
Lessons = a "Lessons" tab beside the entry list (desktop) / sheet (phone) built from `learned` ·
pattern result cached per date in a synced key, "Make it a habit" opens the prefilled habit form ·
night theme = scoped tokens on `.daily-log-container` · install framer-motion (CLAUDE.md) for step
transitions · fix: "committed" is local state, so a locked commitment shows "Hold to Commit" again
after leaving the page; derive it from `commitmentArchive`.

- [x] `src/utils/closeDay.js`: steps/completion, yesterday loop data, prompt pool + pick, lessons list,
      commitment suggestions, pattern context/schema/prompt (pure, unit-tested).
- [x] Pattern flags: generate + cache in useAssistant, synced key wired in App.
- [x] Health inputs autosave; XP award moves to Finish.
- [x] DailyLogPage: guided flow for today, full page for past entries, Lessons tab, day-closed screen.
- [x] CSS, phone + desktop. (Night mode was built, then dropped on the user's call: the page uses the
      app's normal graphite + blue, Montserrat and glass cards. No Fraunces font.)
- [x] Verify: node checks, lint diff, build, real App harness (auth/Gemini stubbed) at 375/430/768/1440,
      empty + heavy data, past entries still editable, Home/score/review unchanged.

**Also changed on the way:** health inputs autosave and the old "Save Today's Log" button is gone (XP is
paid per reward key at Close the day, legacy `xpAwarded` days owe nothing) · workout notes field dropped
from the add row (old notes still stored) · moot nudges hidden (navigate-to-current-page, and the
commitment nudge on Daily Log) · `getFocusGoal` / `getCurrentGoalPeriodKey` moved to goalUtils (Home
uses it too) · review failure on Close the day now shows its error + retry · phone: mood chart hidden
in the 200px sidebar strip (it squashed the date pills) · `entryFingerprint` appends new fields only
when present, so existing reviews don't all flip to "edited since review".

**Verified:** 13 node checks (carry-forward, look back, step status, lock derivation, prompt
determinism/gating/no-repeat, lessons + anniversaries, suggestions, if-then round trip, health awards
incl. legacy, pattern window/leak/normalize/generate). Lint: no new problems in any touched file
(DailyLogPage 7 -> 6). Build OK. Real App harness (auth bypassed, Gemini faked) at 1440 / 768 / 430 /
375, heavy + empty data: full walk-through of all 5 steps, commitment kept (+10 Discipline), hold to
commit (lock survives leaving the page), health XP +60 then food-only +15 on re-close, no double pay,
no re-review when unchanged, re-review when edited, pattern call once per night + cached, AI failure
still closes the day and shows why, past entry editable, Lessons tab, no horizontal overflow.

## Done (2026-10-16): Statistics fills the screen on monitors

At >= 1400px the 920px reading cap is dropped and the page becomes a full-width grid that fills the
viewport height: verdict | leak | strength on top, trend chart (grows to fill) | deltas below, More
toggle pinned at the bottom. `.stats-main` keeps `min-height: calc(100% - 70px)` so opening More
doesn't collapse the chart. Below 1400px nothing changes.

- [x] Wrap main sections in `.stats-main`; monitor grid + `display: contents` on the insight row.
- [x] TrendChart plot in an absolute inner box so it can grow with its card (180px minimum).
- [x] Verify: 2560x1440, 1920x1080, 1440x900 fill with no page scroll, More bar clear of the AI
      bar, chart height stable when More opens; 1366x768 and 375 unchanged; no clipped cards,
      no horizontal overflow, no console errors.

## Done (2026-10-16, 729496a): Statistics page: minimal "leaks + fix"

Goal: Statistics stops being a wall of ~30 numbers and answers one question: what's working,
what's costing me, what's the one thing to fix. Home already covers "what do I do now".

**Locked decisions (Q&A 2026-10-16):** layout = verdict line, biggest leak + fix button, one
strength, 30-day score trend stacked by component, this-week-vs-last deltas · radar / activity
feed / heatmap / feature tiles go into one collapsed "More" section · insights are code only
(Daily Score math, no AI) · window = Mon-Sun week.

**My defaults:** only finished days count toward the leak (today is in progress, same rule as the
streak) · fewer than 3 finished days this week -> leak uses the last 14 finished days, labeled ·
deltas compare this week so far to the same weekdays last week (fair) · Today's Score ring and
Focus Mode button removed (Home + sidebar have them) · name edit + level move into "More".

- [x] `src/utils/statsInsights.js`: week verdict (day dots), component leaks, strength, week deltas.
- [x] `weekStatsUtils`: day-list stats helper shared with computeWeekStats.
- [x] TrendChart score mode -> stacked by the 5 score components + legend.
- [x] PlayerDashboard rebuild + CSS (desktop / tablet / phone).
- [x] Verify: node unit checks, lint diff, build, real App harness at phone + desktop, empty + heavy data.

**Also changed on the way:** TrendChart had `margin.left: -20` with a hidden YAxis, which pushed the
first bar off the left edge (x = -17px); now 4px · days before any tracked activity show as neutral
dots, not red misses · page leaves 72px at the bottom so the last card scrolls clear of the AI bar ·
`getEarliestActivityKey` exported from scoreUtils.

**Verified:** 12 node checks (Monday math, verdict statuses incl. today/before, exact leak points,
today excluded, 14-day fallback, most-missed habit, no habits, like-for-like deltas, sleep not
comparable, computeWeekStats unchanged). Lint clean on all touched files (0 before, 0 after). Build OK.
Real App in a scratchpad harness (auth + Firestore + push stubbed) at 1440 / 768 / 375, heavy and
empty data: no horizontal overflow, no clipped cards, tooltip, fix button -> Daily Log, More section,
last row clears the AI bar, no console errors.


## Done, uncommitted (2026-10-16): Home screen redesign: "locked in" Home

Goal: Home goes from a status board to a "what do I do now" screen. Minimal, one screen,
good on phone / tablet / laptop / wide monitor.

**Locked decisions (Q&A 2026-10-16):** Now panel replaces the big clock (clock moves small into
the top bar) · AI = one sentence per day from My Assistant, generated once and saved · all four
additions: next-best-move hint, habit quick-tick, North Star + priority line (Goals shrink to the
pinned goal), morning/evening modes · phone keeps the zero-scroll rule.

**My defaults:** evening mode = 20:00–23:59 (Now panel becomes "Close the day": Daily Log,
tomorrow's commitment, Submit & get review); morning 4–11 leads with Plan my day when today has
no time blocks · brief stored as `user.homeBrief = {date, text, generatedAt}` (user key already
syncs) and generated on Home only, after sync settles, retry after 1h on failure, manual refresh
icon · next-best-move is computed in code from the Daily Score formula, never by the AI · the
global "Next event" and "Priority" popups are hidden on Home (the page already shows both) ·
Home task ticks go through `completeTaskById` (completionUtils, same XP as everywhere) · phone
budget reserves room for the floating AI bar.

- [x] `src/utils/homeUtils.js`: getNextUp (moved, carries the block instance), getDayMode,
      getYesterdayCommitment (shared pending rule), getNextMove (score gains), getCloseDaySteps.
- [x] `src/utils/homeBrief.js`: context, schema, prompt, generateHomeBrief; `briefHome` in useAssistant.
- [x] WelcomePage rebuild: top bar (greeting, date, clock), brief line, Now panel (now / next /
      unplanned / evening close-the-day), score card + next move, habit chips, tasks,
      commitment, Why tile (North Star, week priority, pinned goal).
- [x] App wiring: new props, brief effect, hide duplicate popups on Home, habit XP label uses
      `name`.
- [x] CSS: desktop / tablet / phone layouts, phone zero-scroll incl. AI bar.
- [x] Verify: node unit checks, lint diff, build, real App harness (auth stubbed, Gemini faked) at
      375 / 390 / 430 / 768 / 1024 / 1440, empty and heavy data, morning / day / evening.

**Also changed on the way:** the Apex logo background photo is gone from Home (it bled through the
glass cards; a faint blue glow replaces it) · the "Mark it" commitment nudge is hidden while on Home
(the tile is right there) · habit XP log labels were `undefined` (`habit.text`), now the name.

**Verified:** 14 node tests (modes, getNextUp current/next/planned/no-phone, commitment statuses,
next-move gains + time-of-day tie-breaks, close-day steps, brief context/tidy/truncate/empty).
Lint: new files clean, App.jsx 27 before / 27 after, none new. Build OK. Real App in a scratchpad
harness (auth stubbed, Gemini faked at fetch, fake clock): habit tick (+0.5, XP label set), task
tick via completeTaskById (+1.0), "I kept it" (+1.0), Start focus opens Focus Mode linked to the
block, Plan my day opens the planner, next-move link → Daily Log, evening checklist + "Now:" line,
brief generated once / saved on user / not re-called on reload / refresh replaces it / failure
hides the line and doesn't retry within the hour, popups + self-pointing nudge hidden only on Home.
Layout: 10 sizes x 4 data states — no clipped tile, no horizontal overflow, nothing under the AI
bar; phones 375x667 and up fit with zero scroll. **Known:** 320x568 scrolls ~100px (fallback,
nothing hidden); 1024x768 uses the 2-column tablet layout and scrolls. **Not verified:** a real
Gemini call for the brief (local key invalid) — check the first live line on the deployed site.


## Done, uncommitted (2026-10-16): Plan My Day + Focus session coach

Goal: the AI turns "what matters today" into a real schedule, and every focus session runs
plan → intent → work → debrief, so the planner learns when you actually focus well.

**Locked decisions (Q&A 2026-10-16):** entry = Calendar day-view button + morning check-in offer ·
preview card (remove / ±15 min per block) then "Add to calendar", one undo · hours set once
(wake/bed + fixed busy times) and end time adjustable per plan · contents = open tasks, goal work,
habits, breaks & buffer · AI picks 25–90 min blocks, break after 50+ min, new 60/90 presets · coach =
intent before, park-it during, debrief after, AI comment on the debrief · planned blocks get
"Start focus" · **block-linked sessions pay no focus XP** (the block's Complete pays, once).

**My defaults (stated to user):** replanning only fills free gaps (never moves/deletes) · breaks show
in the preview but aren't added to the Calendar · No-Phone blocks count as free · Timer page gets the
same intent/park/debrief · debrief offers "Complete block" / "Mark task done" buttons (user taps;
existing XP rules) · habit slots carry no stat attributes (0 block XP; tick the habit itself).

**Design rules:**
- AI proposes, code validates: free gaps are computed deterministically; any AI block outside a
  gap, overlapping another, off the 15-min grid or referencing an unknown task/goal is fixed or dropped.
- One JSON-schema Gemini call (same pattern as logReview), no tools, so it can't write anything.
- Applying = one `insertMany` op on calendarEvents logged as ONE activity entry; undo = `removeMany`
  that keeps blocks already completed (XP earned stays).
- Best focus hours are computed from session history in code, never guessed by the model.

- [x] `src/utils/focusInsights.js`: pure stats from pomodoroSessions (by start hour: minutes,
      done-rate from debriefs; top windows; common blockers).
- [x] `src/utils/dayPlanner.js`: settings defaults/normalize, `computeFreeGaps`, `buildPlanContext`,
      PLAN_SCHEMA + prompt, `normalizePlan` (validation), `planToEvents`, `generateDayPlan`.
- [x] `assistantTools.js`: `insertMany` / `removeMany` ops + undoBlocker; extract block completion
      into a shared helper so Calendar and the focus debrief complete blocks the same way.
- [x] `DayPlanner.jsx` modal (App-level): settings step (first run / gear), generating, preview list
      with remove/shift, insights line, Add to calendar → activity + undo.
- [x] Entry points: Calendar header button (day view), "Plan my day" button on morning check-in
      messages in the drawer; morning prompt stops creating blocks itself.
- [x] Calendar: planned blocks marked (`plan` field), "Start focus" action → opens Focus Mode
      prefilled (task, intent, length, blockId).
- [x] Focus coach: shared intent field, Park-it → Brain Dump, debrief screen (outcome + blocker +
      note), session fields saved, AI comment (one tool-free call), block-linked XP rule, 60/90 presets.
      Same coach on Timer page.
- [x] Fix habit `text`→`name` reads in assistant code (found earlier; the planner needs habit names).
- [x] Verify: node unit runs (gaps, normalizePlan, insights, ops/undo), lint diff, build, real UI
      with stubbed Gemini (desktop + 375px).

**Also fixed on the way:** Focus Mode close X was invisible (global button padding squashed the svg;
`padding:0`) · Focus Mode and the planner now sit above the mobile bottom nav (both were z 9000) ·
every block (not only planned ones) gets Start focus · Tasks/Calendar completion now go through
`completionUtils` (same payout, one source).

**Verified:** 19 node tests (gaps incl. busy/recurring/end override, normalizePlan clipping/sliding/
dropping, shift, planToEvents, insertMany/removeMany + undo keeps completed, completeBlock/Task,
insights, session record, context, generateDayPlan + focus comment with stubbed model); lint diff
empty (44 pre-existing before/after); build. Real UI in a scratchpad harness (real App, auth stubbed,
Gemini faked at fetch): first-run settings → build → shift/remove → add (3 events with `plan`, one
activity, chat note) → undo → re-add → Start focus prefill (task, intent, 60m, linked tag) → park
thought (1 Brain Dump note) → debrief Partly+Phone → 0 focus XP, comment saved as `coachNote` →
Complete block (+60) / Mark task done (+20) → undo keeps the completed block; morning drawer
button; Timer page Skip (+25 XP, no AI call); AI error path; 375px planner sheet + Focus + debrief.
Two bugs found and fixed by the UI test: sliding a block past a break shortened it; drawer covered
the planner. **Not verified:** a real Gemini call (local key invalid) — first live run should check
PLAN_SCHEMA is accepted and plan quality.


## Done (2026-10-16): Run push notifications from GitHub Actions instead of Cloud Functions

Why: user wants the least setup and no card on file (repo is public → Actions minutes are free).
Same push logic (`runPushTick`); only the trigger changes. Cloud Function entry stays as the
documented upgrade path if on-time delivery ever matters more.

- [x] `functions/src/cli.js`: one tick from env `FIREBASE_SERVICE_ACCOUNT` (JSON) + `GEMINI_API_KEY`;
      exits 0 with a notice when secrets are missing (no failure-email spam before setup).
      Share `makeGenerate` between both entry points.
- [x] `.github/workflows/push-notifications.yml`: cron every 5 min + manual run, no overlapping runs.
- [x] GitHub runs late: heads-up default 20 min, and a block that started ≤5 min ago still gets
      a "starting now" push instead of being silently skipped.
- [x] Alerts copy ("test arrives within ~20 min"), README rewritten around the Actions setup.
- [x] Verify: cli against fakes / missing-secret path, schedule tests, lint, builds. Ask before push
      (push to main also redeploys the site if the host auto-deploys).

**Verified:** cli missing-secret path exits 0 quietly, bad JSON exits 1 with a clear message; schedule
tests incl. late-tick "starting now", 20-min default, custom lead, test push once/within an hour;
server tick tests unchanged-pass; workflow YAML parses; lint + both builds. **Not verified:** a real
Actions run (needs push + the user's two GitHub secrets) and a real push on the iPhone.

## Built, not deployed (2026-10-16): Push notifications to iPhone (Cloud Functions + FCM)

Goal: My Assistant reaches you when APEX is closed.

**Locked decisions (Q&A 2026-10-16):** iPhone (installed Home Screen web app, iOS 16.4+) · Firebase
Cloud Functions (Blaze plan; the user upgrades, I never enter payment) · types: morning brief, evening
log reminder, streak at risk, time-block heads-up, commitment reminder (no weekly) · hybrid content:
Gemini writes the morning brief, the rest are templates.

**Design rules:**
- Server only writes server-owned docs (`gameOfLife_pushState`); it never writes app data like chat,
  so it can't race the client's whole-blob sync. The client merges the morning brief into chat itself
  and marks the morning check-in done, so it isn't generated twice.
- Reuse, don't re-derive: streak/habit/commitment pushes come from `computeNudges` (same rules as
  in-app nudges); morning brief runs `runAssistantTurn` with **read-only** tools injected.
- Shared utils use the process timezone, so the function sets `process.env.TZ` to the user's
  saved timezone before evaluating them.
- Every send is deduped by id in pushState; windows are "at/after time, within N hours" so a
  late or skipped tick still delivers once.

- [x] `src/utils/pushSchedule.js`: pure `decidePushes(now, settings, state, pushState)`.
- [x] `functions/`: scheduled every 5 min; reads settings/state, sends via FCM, prunes dead tokens;
      esbuild bundles shared `src/utils` (lucide-react stubbed). `firebase.json`, `.firebaserc`.
- [x] Client: PWA manifest + iOS icons/meta, `public/firebase-messaging-sw.js`,
      `src/services/pushService.js` (permission, token, settings doc), Notifications tab in the
      My Assistant drawer, `?page=` deep links + SW click navigation, morning-brief merge.
- [x] Verify: unit-run decidePushes over a simulated day; bundle loads; send path with mocked
      messaging; manifest/SW register in the browser; lint + build.
- [x] User steps (documented): Blaze upgrade + budget alert, VAPID key, `firebase login`,
      GEMINI secret, deploy, add to Home Screen, enable.

**Verified:** decidePushes over a simulated day (each push once, in window, conditions re-checked);
server tick against fake Firestore/FCM/Gemini (AI brief via read-only tools, Tokyo TZ, dead-token
prune, dedupe, Gemini-failure template, no double brief, transient-failure retry); functions bundle
builds + loads; real SW registers/activates on localhost; Alerts tab at 375px via harness; manifest
+ icons served; lint (no new problems) + both builds. **Not verified:** a real deploy and a real
push to an iPhone — blocked on the user's Blaze upgrade, VAPID key, `firebase login`.

## Done (2026-10-16): Daily Log → My Assistant review report (uncommitted)

Goal: submitting a Daily Log gets an AI report that analyses the day.

**Locked decisions (Q&A 2026-10-16):** new "Submit & get review" button (separate from Hold to
Commit) · report card saved on that day's log **and** copied into the My Assistant chat for
follow-ups · scope = the entry + that day's score/habits/health/calendar/commitment, compared with
the prior 7 days and checked against North Star/goals/memory · **report only**, no tools/actions.

- [x] `src/utils/logReview.js`: gather context by reusing the read tools (get_journal, get_health,
      get_calendar, get_commitments) + computeDailyScore per day; Gemini JSON-schema call (no tools);
      normalize; chat-text formatter; entry fingerprint for "edited since review".
- [x] `geminiGenerateJson` in assistantUtils (shares the client + key check).
- [x] `useAssistant.reviewLog(dateKey)`: saves the review + appends a hidden user msg and a
      `kind: 'log-review'` model msg to chat. Per-date loading state; inline error.
- [x] New synced key `gameOfLife_logReviews` `{[dateKey]: review}` (capped 120 days) — separate
      doc so the logs doc doesn't grow toward Firestore's 1 MB limit.
- [x] DailyLogPage: Submit button / loading / error / report card (+ "Ask a follow-up",
      "Review again", stale notice). Drawer label for the new chat kind.
- [x] Verify: lint, build, unit-run logReview with stubbed Gemini, real UI with an in-page stub.

**Verified:** logReview unit run (context, normalize, fingerprint, cap) against stubbed Gemini; real
`@google/genai` SDK serializes `responseSchema` (fetch stubbed); real DailyLogPage + useAssistant in a
temp harness with in-page Gemini stub: submit → loading → card, chat copy (hidden user + `log-review`
model msg), stale notice after edit, Review again, Ask a follow-up, 400 error path, past entry, mobile
+ 1280px. **Not live-verified:** local Gemini key still invalid.

## Done (2026-10-16): My Assistant → a real agent (uncommitted)

Goal: turn My Assistant from a reactive chatbot (one JSON reply, 3 create-only actions, forgets past
20 messages) into an agent that looks things up, acts across the app, remembers you, starts
conversations itself, and coaches toward a stated vision.

**Locked decisions (Q&A 2026-10-16):** all four capabilities (tool loop, memory, proactive check-ins,
north star) · safe actions auto-apply with undo, risky ones confirm · check-ins fire in-app on open
(no backend) · "direct coach" tone · stay on Gemini 2.5 Flash (settled preference, see memory).

**Blocker (user):** `VITE_GEMINI_API_KEY` is still invalid (400). I can build and unit-test against
mocked Gemini responses, but live tool-calling can't be verified until a fresh key is in `.env`.

**Guardrail: XP stays earned.** The peak-system redesign made XP behavior-derived, never
self-assigned. So the agent gets **no tool that grants XP**: it cannot complete tasks, tick habits,
complete calendar blocks, honor No-Phone blocks or resolve commitments. It can remind you, and you
tap. Tasks it creates get the timeframe-default XP (`TASK_TIMEFRAME_XP`), not an AI-chosen number.

### Phase 1: Tool-use loop (foundation)
- [x] New `src/utils/assistantTools.js`: Gemini `functionDeclarations` + executors, in three tiers:
  - **Read:** `get_today_overview`, `get_logs(from,to)`, `get_goals(id?)`, `get_score_history(days)`,
    `get_habits`, `get_calendar(from,to)`, `search_brain_dump(query)`, `get_memory`.
  - **Auto (apply now + undo):** `create_task`, `create_calendar_event`, `create_quick_event_template`,
    `add_brain_dump_note`, `add_goal_milestone`, `remember`, `forget`.
  - **Confirm (approve card):** `update_task`, `delete_task`, `move_calendar_event`,
    `delete_calendar_event`, `update_goal`, `set_north_star`.
  - Fold the existing normalizers from `assistantActions.js` in (reuse, don't duplicate).
- [x] `sendToAssistant` becomes a loop: call with `tools`; while the response has `functionCalls`,
      execute and append `functionResponse`, capped at ~6 rounds. Drop `responseMimeType: json` and
      the ~40 lines of "payload MUST include…" prose (a real schema now enforces it).
- [x] Read tools need *current* state mid-loop, not render-time props: App exposes a
      `getAssistantState()` backed by a ref that's updated every render.
- [x] Tool turns stay ephemeral. Only the final text + an `actionsTaken` list persist to
      `chatHistory`, so the stored `{role, parts:[{text}]}` shape is unchanged and needs no migration.
- [x] Slim `buildSystemPrompt` to a compact snapshot (today, score/rank, pinned goals, memory, north
      star). The model pulls the rest through read tools, which keeps tokens down across rounds.

### Phase 2: Undo + activity log
- [x] New synced key `gameOfLife_assistantActivity`: `{id, at, tool, label, inverse}` per auto action
      (inverse = delete-by-id for creates, prior-object snapshot for edits). Cap ~100.
- [x] Undo button on each action chip in the chat + a "Recent activity" list in the drawer.
- [x] Confirm tier reuses the existing approve/reject cards.

### Phase 3: Long-term memory
- [x] New synced key `gameOfLife_assistantMemory`: `[{id, text, kind: pattern|preference|fact|win,
      createdAt}]`, capped ~60, injected into every prompt.
- [x] Prompt guidance: store durable insights ("skips workouts after <6h sleep"), not one-off facts.
- [x] Drawer panel "What I know about you": view / edit / delete entries.

### Phase 4: North star
- [x] `northStar: {vision, identity: [..], updatedAt}` on the synced user object (additive, backward
      compatible). Editable card at the top of the Goals page.
- [x] Injected first in the prompt; the coach measures suggestions against it. If it's empty, the first
      morning briefing asks you to write it.

### Phase 5: Proactive check-ins (in-app, on open)
- [x] New `src/utils/assistantTriggers.js` + synced key `gameOfLife_assistantCheckins`
      (`lastMorning`, `lastEvening`, `lastWeekly`, `dismissed`). Synced so two devices don't both fire.
- [x] Evaluate on load + tab-visible, **only after `cloudSyncReady`** (no firing on stale local data).
  - **Morning briefing** (first open of the day): agent run that plans today and can auto-add blocks.
  - **Evening debrief** (after 8pm, Daily Log empty): recap + prompt to log.
  - **Weekly plan** (Sunday / first open of the week): recap + next week's plan, tied to Weekly Review.
  - **Rule-based nudges (no AI call):** rank streak at risk, yesterday's commitment unresolved, goal
    untouched 7+ days, habit streak about to break.
- [x] Delivery: briefings land as an unread assistant message + badge on FloatingAIBar (the drawer
      doesn't auto-pop). Nudges show as a small toast that opens the drawer.
- [x] At most 1 AI call per check-in type per day, to stay friendly with the free tier.

### Phase 6: Persona
- [x] Direct coach: honest, names slipping, supportive, cites your own data, ends with one next action.

### Verification
- [x] Baseline `npm run lint` error count first; finish with no new errors + `npm run build` passing.
- [x] Unit tests: each executor + its undo inverse; the loop against mocked multi-round Gemini
      responses (incl. round cap, unknown tool, bad args); trigger logic with a fake clock.
- [x] Live (needs valid key): "plan my day" multi-step run, undo, memory surviving reload/other device,
      morning briefing firing once.

**Files:** new `assistantTools.js`, `assistantTriggers.js`; edit `assistantUtils.js`,
`assistantActions.js`, `AssistantDrawer.jsx/.css`, `FloatingAIBar.jsx/.css`, `App.jsx`,
`services/firestoreService.js` (`DATA_KEYS`), `GoalsPage.jsx/.css`.

### Outcome + deviations from the plan
- `assistantActions.js` was **deleted**: its normalizers moved into `assistantTools.js`, its apply logic
  became the pure `applySliceOp` ops. New `src/hooks/useAssistant.js` owns send/approve/reject/undo so
  `AssistantDrawer` is presentational; `NorthStarCard.jsx` is its own component.
- Names differ from the plan sketch above. Final read tools: `get_tasks`, `get_calendar`, `get_goals`,
  `get_habits`, `get_journal`, `get_health`, `get_score_history`, `get_focus_sessions`,
  `get_xp_breakdown`, `get_commitments`, `get_weekly_reviews`, `search_brain_dump`, `get_wishlist`,
  `get_achievements` (memory is always in the prompt, so no `get_memory`). The latest-state ref lives
  in `useAssistant` (`stateRef`), not a `getAssistantState()` on App. Check-in keys are
  `morning`/`evening`/`weekly`/`nudges`. The loop is `runAssistantTurn`; `sendToAssistant` is gone.
- 27 tools: 14 read, 7 auto, 6 confirm. Auto ops are committed **after** the loop finishes, so a turn that
  errors midway applies nothing. Confirm proposals are re-validated against current state at approval.
- No-arg tools omit `parameters` entirely (Gemini rejects an OBJECT schema with empty `properties`).
- Commitment nudge uses exactly Home's `CommitmentTile` "pending" rule (Daily Log text + archive record),
  caught in browser testing; the first version keyed off the archive only and could point at a tile
  with no buttons.
- Fixed two pre-existing drawer layout bugs surfaced by testing: action cards overflowed (no
  `box-sizing`), and on mobile the bottom nav (z 9000) covered the drawer's input (drawer was z 1120).

### Verification (2026-10-16)
- Lint: 12 errors (= baseline), 43 problems (+3 = the existing `persist` exhaustive-deps pattern for the
  3 new keys). `npm run build` passes.
- 27 unit tests (scratchpad, node:test via esbuild): every tool, every op + inverse, undo XP blockers,
  loop multi-round/round-cap/unknown tool/bad args/fallback text/atomic failure, history→contents,
  prompt, trigger windows with a fake clock, all 4 nudge kinds.
- Real `@google/genai` browser build driven through the loop with stubbed `fetch`: request shape,
  thought-signature echo, call-id round trip, parsing.
- Real app in the browser pane (throwaway harness: Vite JS API + auth stub, both in scratchpad, deleted
  after) with Gemini stubbed in-page: multi-tool turn, Undo, Approve, approve-then-Undo (restored at
  original index), Memory/Activity tabs, North Star card + edit, unread check-in pill → drawer, the
  commitment nudge clearing when resolved, mobile 375px. Model-supplied `xp: 500` stored as 20.
- **Not verified live:** `VITE_GEMINI_API_KEY` is still invalid (400), so Gemini's own server-side
  acceptance of the tool schemas and real model behavior are untested until a fresh key is in `.env`.

## Done (2026-09-09): Daily Score in the sidebar

Goal: surface the Daily Score (0-10, *computed* — see `scoreUtils.js`) in the sidebar footer so it is
visible from every page, the way Rank already is. Score feeds Rank, so it reads top-down: Score -> Rank
-> XP -> user.

- [x] `scoreUtils.js`: export a shared `scoreColor(score)` (>=8 green / >=5 orange / else red). Three
      near-identical copies already exist (`WelcomePage.jsx:91`, `PlayerDashboard.jsx:130`,
      `stats/TrendChart.jsx:8`) — don't add a 4th. Dedupe the two byte-identical ones; leave
      TrendChart's alone (it cuts at `STREAK_THRESHOLD`, i.e. 6 not 5 — different on purpose).
- [x] `App.jsx`: compute `dailyScore` in one `useMemo` beside `rankStatus` and pass it down — same
      rationale as the existing rank comment (one source of truth, displays can't drift apart).
      Deps must be the array/object **references** (`habits`, `xpLog`, ...), NOT `.length`: ticking a
      habit mutates `habits[i].history[dateKey]` without changing `habits.length`, so a length-keyed
      memo would leave a stale score on screen until reload.
- [x] `Navbar.jsx`: `sidebar-score-chip` as the first row of `.sidebar-footer`, mirroring the rank
      chip's ring geometry. Number goes *inside* the ring so the collapsed sidebar still shows the
      real value, not just a colored arc.
- [x] `Navbar.css`: style it; when collapsed hide only the text column (same pattern as
      `.sidebar-rank-name`) and check it in the mobile drawer footer too.
- [x] Verify in a real browser: expanded / collapsed / mobile drawer, and that the number moves live
      when a habit is ticked. Then `npm run lint` + `npm run build`.

Verified via a throwaway Vite harness (`sidebar-harness.html` + `src/sidebar-harness.jsx`, both deleted
after — they were this session's own files, checked against the clean session-start `git status` per the
2026-07-24 lesson), mounting `Navbar` alone so Firebase auth wasn't in the way:

- Expanded, collapsed and mobile-drawer states all screenshotted. Collapsed hides only the text column
  and the score ring lands **0.00px** off the rank ring's centre; `scrollWidth === clientWidth` on the
  footer in every state, so no min-content blowout (2026-07-25 lesson).
- Live update proven, not assumed: ticking two habits moved the ring 5.0 -> 6.0 -> 7.0 and unticking one
  took it back to 6.0, with `stroke-dashoffset` exact each time (40.84 of an 81.68 circumference = 50%
  at 5.0). Confirms the reference-based memo deps; a `.length`-keyed one would have sat at 5.0.
- Colour crossover checked at both ends: orange #ff9f0a at 5.0-7.9, green #30d158 at 9.0, on the number
  *and* the arc. `scoreColor` boundaries + the clamp checked in node across
  `undefined/null/NaN/±Infinity/-3/0/4.9/5/8/10/12`.
- First measurement of the mobile drawer read "chip below the viewport" — it was taken mid-slide-in, with
  the drawer still at `translateY(100%)`. Re-measured after force-finishing the animations: chip sits
  inside both drawer and viewport. (Same shape as the 2026-09-09 boundary-measurement lesson.)
- `npm run lint` 40 problems / 12 errors — byte-identical to the `git stash` baseline, so nothing new.
  `npm run build` clean. Real app entry loads with **zero console errors** in a fresh tab.

Left alone deliberately: `stats/TrendChart.jsx` keeps its own score colour (it cuts at `STREAK_THRESHOLD`
= 6, not 5 — a different, intentional grading), and `rankStatus`'s memo in App.jsx still uses `.length`
deps, so the rank chip can lag a habit tick until reload. Pre-existing, flagged to the user, not fixed
here.

## Done (2026-09-09): Hover detail card for calendar time blocks

Time blocks in the Calendar day/week grid are height-constrained — a 15-min block shows only a
truncated title, and `notes` (a real field on every event, editable in the modal) was **never
rendered anywhere on the grid at all**. Hovering a block now surfaces its full details + notes
without opening the edit modal.

- [x] `src/components/CalendarPage.jsx` — `hoverCard` state + 320ms dwell timer;
      `onMouseEnter` / `onMouseLeave` / `onMouseDownCapture` on `.cal-event`. Capture-phase
      mousedown is required because `beginEventResize` calls `stopPropagation()`.
- [x] Card renders as a `position:fixed` sibling at the `.cal-page` root, NOT nested in the
      block — `.cal-event` is `overflow:hidden` inside `.cal-scroll-area` (`overflow-y:auto`),
      so a nested card would be clipped on both axes.
- [x] `pointer-events:none` so it never intercepts the block's drag / resize / click-to-edit.
      (Trade-off: notes text isn't selectable — correct for a hover tooltip.)
- [x] `useLayoutEffect` flip/clamp: prefer right of the block, flip left near the right edge,
      clamp into the viewport. Fresh measure per hover via a `key` remount + CSS
      `visibility:hidden` → effect reveals + rAF opacity fade.
- [x] Re-measures on scroll/resize so the card stays glued to a block moving under the cursor.
- [x] Suppressed while `resizeSession` / `draggingEvent` / `modal` is active, and on touch
      (`matchMedia('(hover: hover)')` guard + a `@media (hover: none)` CSS backstop) — tapping
      already opens the full edit modal there.
- [x] Content: title + Done badge, full time range + duration, XP total, recurrence (reusing
      `WEEKDAY_LABELS`), attributes with names + per-attribute XP split, sub-events, bonus tasks
      with completion state, and **notes** (`white-space:pre-wrap`, clamped to 8 lines).
- [x] `src/components/CalendarPage.css` — `.cal-hovercard*`, `z-index:900` (under the 1000 modal layer).

Scope: day + week time-grid blocks (`.cal-event`). Month-view chips and no-phone bands untouched.

Verified: `npm run build` clean; `npm run lint` identical 40 problems (12 errors, 28 warnings)
before and after via `git stash` diff, zero findings in either changed file. Playwright pass on a
temporary harness (`src/testCalendarHover.jsx` + `calendar-hover-test.html`, mounting
`CalendarPage` with mock state under `StrictMode`, bypassing Firebase auth — both files removed
after): card appears on dwell with notes/steps/bonus tasks and disappears on mouseout; a 15-min
block shows its full detail; a block with no detail shows the empty hint; bottom-of-viewport
clamp fits exactly (700.75 + 191.25 = 892 = 900−8); right-edge block flips left (block x=1277 →
card x=999); card stays glued through a mid-viewport scroll (block and card both moved +24.0px);
click-through still opens "Edit Time Block" and drag-resize through the card still worked
(64→96px); an 8-line clamp engaged on a 20-line note (clientH 126 vs scrollH 631); day view
positions correctly; on an iPhone 13 context the card never renders. No console errors.

Note: `offsetWidth`/`offsetHeight` were the first clamp measurement and rounded to whole pixels,
letting a fractional-height card overhang the viewport by 0.25px — switched to
`getBoundingClientRect()`.

---

## Done (2026-08-07): Weekly recurrence on specific weekdays

Full plan: `/Users/jaydenlee/.claude/plans/linear-gliding-pebble.md`. Calendar events, Quick
Templates, and No-Phone blocks previously locked "weekly" recurrence to whatever single
day-of-week the item's own `date` fell on. Added a `recurrenceDays` field (ints 0-6, Sun=0…Sat=6)
so users can pick any combination — "every Monday", "every Sat & Sun", etc. Confirmed scope via
`AskUserQuestion`: applies everywhere weekly repeat exists, and the My Assistant AI schema too.

- [x] `src/utils/calendarUtils.js` — `expandEventsForDates`'s weekly branch now matches against
      `recurrenceDays` (falling back to the anchor date's own weekday when empty/missing, so all
      existing stored data behaves identically to before — no migration needed); `normalizeEvent`
      normalizes the new array field like the other array fields there.
- [x] `src/components/CalendarPage.jsx` — new shared `renderWeekdayPicker` helper (a row of
      Su/Mo/Tu/We/Th/Fr/Sa toggle chips, blocks deselecting the last remaining day so an event can
      never end up with zero recurrence days), rendered under the existing `renderRecurBtns` in all
      three modals (event/template/no-phone) whenever `recurrence === 'weekly'`. `recurrenceDays`
      threaded through every place `recurrence` already was (defaults, create, edit, edit-scope
      "this/this-forward/all", template drag-drop). Sidebar template badge shows weekday
      abbreviations (e.g. "Mo We Fr") instead of the bare word "weekly" when set.
- [x] `src/components/CalendarPage.css` — `.cal-weekday-row`/`.cal-weekday-chip` styles matching
      the existing `.cal-recur-btn` visual language.
- [x] My Assistant AI extension — `assistantUtils.js` system-prompt schema, `assistantActions.js`
      (`normalizeRecurrenceDays` clamps/dedupes/sorts ints 0-6 and forces `[]` when recurrence
      isn't 'weekly'), and `AssistantDrawer.jsx`'s pending-action preview (shows "Mo We" etc.)
      all updated so natural-language requests like "add gym every Monday and Wednesday" work.

Verified: `npm run lint` — identical 40 pre-existing baseline problems before and after (`git
stash` diff), zero new issues in any changed file. `npm run build` clean. Two targeted Node
scripts against the pure logic (`expandEventsForDates`, `prepareAssistantActions`) confirmed: a
legacy weekly event with no `recurrenceDays` still recurs on exactly its own anchor weekday
(backward compat), a Mon+Sat event anchored on a Wednesday correctly lands only on Mondays/
Saturdays going forward (and excludes the anchor date itself, since Wednesday wasn't selected),
and the assistant-side normalizer correctly deduped/sorted/clamped a deliberately-malformed
`recurrenceDays` input and zeroed it out for a non-weekly action. End-to-end UI pass via a
temporary Playwright harness (`src/testCalendarRecur.jsx` + `calendar-recur-test.html`, mounting
`CalendarPage` directly with mock state, bypassing Firebase auth — same pattern as prior sessions'
verification) — created a weekly event on a Monday slot, confirmed "Mo" was pre-checked, added
"Sa", confirmed the last-remaining-day guard blocked removing down to zero, saved, and confirmed
the event appeared as two separate blocks on the Mon and Sat columns of the same week (and nowhere
else). Zero console errors captured. Harness files, the scratch Playwright install, and
screenshots were all removed after verification.

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

---

## 2026-10-17: Tasks page rebuild (use it daily, phone-first)

User pain points (all four + "mobile version is hard to use and unpleasant"): adding is slow, forgets to open it, list goes stale, no clear next move. Decisions: one-tap complete + Undo (no popups), Top 3 must-dos, fix Daily Score per-attribute double count.

- [x] `src/utils/taskUtils.js`: pure helpers (buckets: top/today/carried/upcoming/later/doneToday, carried-days, prune old done, count completions per task)
- [x] `completeTask` keeps finished tasks (`completed`, `completedAt`) so "Done today" exists; prune non-goal done tasks after 7 days at rollover
- [x] xpLog task events carry `ref` (task id); Daily Score / Home / week stats / log review / lifetime counter count one per task, not per attribute
- [x] Rebuild TasksPage: quick-add bar (Enter adds, chips Today/Tomorrow/This week/Later), Today view (Top 3 + progress, carried-over triage, rest, Done today), Upcoming, Later tabs; one-tap complete with Undo toast; detail = side panel on desktop, bottom sheet on phone (rename, notes, when, due, stats, subtasks, Start focus, delete)
- [x] Start focus from a task (FocusMode launch with taskId)
- [x] Home Tasks tile + morning push fallback + home brief list Top 3 first
- [x] Keep shared modal/section-title CSS other pages rely on; new styles `tk-` prefixed, app tokens only
- [x] Verify: lint, build, unit checks of taskUtils, harness screenshots at 375/390/768/1280/1600, interaction tests

**Verified:** eslint clean (App warnings pre-existing), `npm run build` ok, 11 node unit groups for taskUtils/completeTask/Daily Score/morning push pass, harness checks: one-tap complete + Undo + payout after 5s, flush on leaving page, 2-stat task counts once on Daily Score and lifetime counter, Top 3 cap, carried triage, quick add → Tomorrow toast, legacy 'tomorrow' migration, Start focus pins the task, Home tile Top 3 first. No horizontal overflow at 320/390/768/1024/1100/1920 in all three views + sheet. Found and fixed during testing: overdue task moved to Tomorrow stayed on Today (explicit reschedule now beats the deadline pull). Uncommitted.

---

## 2026-10-17: Remove attributes (stats) everywhere

User never looks at them and they add friction (calendar blocks with no attribute paid 0 XP; bonus tasks needed one). Decisions: remove every picker; XP is paid once, in full, to the global total (no per-stat split or N× multiplier); dashboard Attributes card + radar and the Assistant's weakest/strongest stat line go; old saved fields left untouched (ignored). Calendar blocks are colored by type (event / task / habit / goal) — user chose this.

- [x] App: `updateStat(stat, amt)` → `awardXp(amt, meta)`; logs stat `'xp'`, no `user.stats` writes; prop `onUpdateStat` → `onAwardXp`
- [x] Payouts once: block check-in, task, subtask, habit, goal + milestone, bonus task, no-phone, commitment, close-the-day health, focus sessions
- [x] Remove pickers/badges: calendar event/template/bonus forms + dots + hover card, Tasks quick add/detail/row, Goals editor/badges, Daily Log habit editor/badges, Timer/Focus stat picker
- [x] Calendar: `blockColor(ev)` by `plan.kind`, task chips use the task color
- [x] Dashboard: drop Attributes card + radar; Assistant: drop stat analysis, VALID STAT KEYS, stat params on tools, planner attributes
- [x] Verify: lint (before/after), build, unit checks for payouts, browser walk of every touched screen

**Verified:** eslint unchanged (same 40 pre-existing messages, only line numbers shift), `npm run build` ok, 14 node unit checks (block/task/goal/health payouts, block kind colors, normalizers keep old event attributes, planner + Assistant tools emit no stats, system prompt has no stat lines). Harness walk with old-style data: block check-in +60 once (stats untouched, level-up fires), bonus task +10 once (was 20), subtask +10 (was 20), task +20 with ref + lifetime count +1, milestone 15 + goal 35 = 50, habit +10 / untick -10 (was ±20), close-the-day "+10 XP · High energy day", calendar colors task/habit/goal/event, hover card kind chip, block/template/goal/habit forms have no attribute fields, Statistics More has no Attributes card, Timer + Focus Mode have no stat picker, no console errors. `src/components/statMeta.js` deleted. Uncommitted.

## Done, uncommitted (2026-10-17): Calendar popups reachable on phones

Bug: on mobile the New/Edit Time Block popup's bottom (incl. "Add Time Block") sat under the
floating AI bar (z 1050) and the tab bar (z 9000), because `.cal-modal-overlay` was z 1000.
Fix: overlay to z 9500 (same layer as Plan My Day), `.cal-modal` max-height 90dvh +
overscroll-behavior: contain. Applies to every calendar popup that uses `.cal-modal-overlay`.
- [x] Verified in auth-stub harness at 390x664 and 320x568: wheel-scroll, tap saves the block
- [x] Desktop still centered; build passes

## 2026-10-19 — Calendar sidebar: remember collapsed state (idea 7)
Sir picked only idea 7 (skipped 5 "week by category" and 6 "mini month").
- [x] `sidebarOpen` / `upcomingMinimized` read + written via try/catch `readFlag`/`writeFlag` in CalendarPage.jsx (keys `gameOfLife_calendarSidebarOpen`, `gameOfLife_calendarUpcomingMinimized`; local only, not synced)
- [x] Harness check: defaults with empty storage, both survive reload, garbage values fall back to defaults, no overflow in the 220px sidebar with heavy data
- [x] Lint JSON 0 messages before and after; build passes. Not committed.
