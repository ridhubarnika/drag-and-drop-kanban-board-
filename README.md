# KanFlow — Kanban Board

A fully functional, zero-dependency Kanban board with drag-and-drop, inline editing, priority tracking, and full localStorage persistence.

## Features

- **Drag & Drop** — native HTML5 Drag API, no libraries. Cards snap to the correct position when dropped between existing cards (not just at the bottom of a column).
- **Card Creation** — each column has an "+ Add Card" button that reveals an inline textarea and confirm/cancel pair. On confirm, a card is created with a unique ID (`crypto.randomUUID`-style), an optional description, a priority (P1–P4), and a creation timestamp.
- **Inline Editing** — double-clicking a card title or description makes it editable with a `contenteditable` span. Press **Enter** or click outside to save. Press **Escape** to discard changes.
- **Priority Badges & Colour Coding** — P1 = red, P2 = orange, P3 = blue, P4 = grey. Click any badge to open a dropdown and change priority. A coloured left-stripe on each card reflects its priority.
- **LocalStorage Persistence** — every state change (card created, moved, edited, deleted) is immediately serialised to `localStorage`. On page load, the board is deserialised and rebuilt — it looks identical after a refresh.
- **Search & Filter** — a search bar at the top filters cards across all columns in real time. Non-matching cards fade to 30% opacity. Priority filter buttons (All / P1 / P2 / P3 / P4) combine with search.
- **Keyboard Accessibility** — all cards are focusable via Tab. Pressing **Space** or **Enter** on a focused card opens a context menu (move to next/prev column, delete). **Delete** / **Backspace** on a focused card removes it.

