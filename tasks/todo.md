# Todo

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
