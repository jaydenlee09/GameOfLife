# Todo

## Done (2026-06-20): Fix cross-device sync & save bugs

Full plan: /Users/jaydenlee/.claude/plans/eager-tickling-meerkat.md. All four implemented in src/App.jsx + src/services/firestoreService.js:

- [x] **Bug 1** — stale `gameOfLife_rewards` key renamed to `gameOfLife_shop`; legacy-doc fallback read added in `loadAllUserData`.
- [x] **Bug 2** — `touchedSinceLoadStart` ref added; local edits made while a Firestore load is in flight survive instead of being overwritten.
- [x] **Bug 3** — real-time `onSnapshot` sync added (`subscribeToUserData` in firestoreService.js), with a `lastWrittenValue` cache to prevent feedback loops with our own writes.
- [x] **Bug 4** — `visibilitychange`('hidden') + `pagehide` listeners added alongside `beforeunload` to flush pending writes on mobile backgrounding.

Verified: `npm run lint` (zero new warnings/errors vs. baseline), `npm run build` (clean), Vite dev-server transform check on both changed files (no syntax errors).

**Still open**: real two-device (laptop+phone, signed into actual Google account) confirmation — not something testable without the user's real credentials. Ask user to confirm before fully closing this out.
