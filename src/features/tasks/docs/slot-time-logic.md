# Task Slot & Time Logic (block-driven)

## Overview

Every task in the day view belongs to one of four **slots** (time buckets). The slot
controls which column the task card appears in and carries its own colour palette.

| Slot ID     | Label     | Time Range | Glyph | Default time |
| ----------- | --------- | ---------- | ----- | ------------ |
| `morning`   | Dawn      | 06 – 10    | ◐     | `06:00`      |
| `deep`      | Deep Work | 10 – 13    | ❖     | `10:00`      |
| `afternoon` | Afternoon | 13 – 17    | ☉     | `13:00`      |
| `evening`   | Twilight  | 17 – 22    | ☾     | `17:00`      |

> **Tasks no longer carry a `startTime` field.** A task's time-of-day comes from its
> **schedule blocks**. See `aetheria-docs/requirements/block-driven-scheduling.md`.

---

## How a task's slot is determined

Source: `TaskManagement.tsx` builds a `blockMap` keyed by `` `${taskId}|${date}` `` from
the schedule blocks in view (`useScheduleBlocks`). For a card shown on date D:

```
blockTime = earliest block of (task, D)?.startTime
slot      = offsetToSlot(day, blockTime)   // adapters.ts
```

`offsetToSlot` (adapters.ts) maps the time to a slot:

```
Priority 1 — blockTime present  → parse hour → slot (morning/deep/afternoon/evening)
Priority 2 — no block, today     → current clock hour fallback
Priority 3 — no block, other day → 'morning'
```

`UITask.startTime` is kept as a **derived display value** (the block's time), so card
components (ScheduleStrip, expanded card) are unchanged — only its source
moved from the task entity to the block.

### Habits

Habits use `entry.time` from their schedule directly (unchanged) — same hour→slot mapping.

---

## Drag-and-drop → creates / moves a block

Source: `TaskManagement.tsx → handleMoveToSlot()`

Dropping a task card into a slot column:

1. `newTime = slotToDefaultTime(targetSlot)` (start of the slot's range).
2. Optimistic UI: update the local `UITask` `{ slot, day, startTime: newTime }`.
3. Persist a **schedule block** for the target date (`offsetToISO(day)`):
   - a block already exists that day → `PATCH /schedule-blocks/:id { startTime }`
   - none yet → `POST /schedule-blocks { sourceType:'task', date, startTime, duration }`
     (duration = `task.est ?? 60`).

On refetch, `blockMap` resolves the same block time, so the card stays put.

---

## Create / edit form

Source: `TaskForm.tsx` — there is **no Start Time input**. Initial scheduling happens by
dragging a card into a slot, or via the **Session Planner** (`SessionPlanner.tsx`), which
manages a task's blocks directly.

---

## API contract

`POST /api/v1/tasks` and `PATCH /api/v1/tasks/:id` **do not accept `startTime`.**
Time-of-day is managed through `/api/v1/schedule-blocks`.

---

## File map

| File                                                  | Role                                                         |
| ----------------------------------------------------- | ------------------------------------------------------------ |
| `src/features/tasks/data/mock.ts`                     | `SLOTS` array + `UITask.startTime` (derived display)         |
| `src/features/tasks/data/adapters.ts`                 | `taskToUITask(t, log, blockTime)`, `offsetToSlot()`, helpers |
| `src/features/tasks/components/shared/TaskForm.tsx`   | Create/edit form (no startTime)                              |
| `src/features/tasks/components/TaskManagement.tsx`    | `blockMap`, `handleMoveToSlot()` → block create/update       |
| `src/features/schedule/hooks/useScheduleBlocks.ts`    | block list + create/update/delete mutations                  |
| `src/features/schedule/components/SessionPlanner.tsx` | manage a task's blocks                                       |
| `src/server/models/task.model.ts`                     | Task schema — **no** `startTime`                             |
| `scripts/migrate-starttime-to-blocks.ts`              | one-time backfill: task.startTime → schedule block           |
