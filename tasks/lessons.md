# Lessons

Format: `[date] | what went wrong | rule to prevent it`

---

[2026-06-21] | Spent the first round of debugging a "cross-device sync broken" report entirely in application code, when the real root cause was Firestore's default test-mode security rules silently expiring 30 days after creation and denying all reads/writes | For any Firebase/Firestore sync or save issue, check the Rules tab first (test-mode expires 30 days after the database is created) before deep-diving into application code.

[2026-06-21] | Added a `touchedSinceLoadStart` guard ref to stop an async load from clobbering an in-flight local edit, but never cleared it after the load resolved — it ended up permanently blocking real-time updates for any key touched once, for the rest of the session | Any guard tied to an async window (load, debounce, etc.) must be explicitly cleared when that window closes, not just reset on the next outer trigger. Audit new guards for unbounded lifetime before shipping.

[2026-06-24] | Built a click-and-drag range-select for the new "No Phone Time" calendar feature and finalized the drag on `onMouseUp`/`onMouseLeave` of the day-column wrapper element. A fast/automated drag whose pointer left that element mid-gesture fired `onMouseLeave` and collapsed the selection to 1 slot before the real mouseup. | Any drag-to-select interaction must finalize on a `window`-level `mouseup` listener (added via `useEffect` while the drag is active, removed after), never on `onMouseUp`/`onMouseLeave` of the element being dragged over — the pointer routinely leaves that element mid-drag even in normal (non-automated) use.
