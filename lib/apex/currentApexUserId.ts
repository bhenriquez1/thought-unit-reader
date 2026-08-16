// lib/apex/currentApexUserId.ts
// X3 — a single, consistent identity source for DAT Apex's per-user IDB/
// localStorage data (the "readiness" store, the mistake log). Before this,
// three call sites used three different hardcoded literals:
//   app/apex/proctor/page.tsx  → "demo-user"  (writes readiness + attempt)
//   components/apex/TrainingArena.tsx → "demo-user"  (reads readiness)
//   app/apex/page.tsx          → "default"    (reads readiness)
//   app/apex/results/page.tsx  → "demo-user"  (writes mistake log)
// Since the readiness IDB store is keyed by userId, the dashboard
// (app/apex/page.tsx, keyed "default") never saw data written by an actual
// attempt submission (keyed "demo-user") — a real, silent bug. Routing every
// call site through this one function fixes that as a side effect of using
// one shared source, without touching any scoring math or storage schema.
//
// Deliberately NOT Firebase-uid-aware: app/apex/** (App Router) has no
// existing auth-reactive code anywhere today — importing lib/firebase.ts
// here to read `auth.currentUser` would pull the whole Firebase SDK into
// every route that calls this (measured: /apex/proctor and /apex/results'
// First Load JS nearly doubled when this was tried), for a lookup those
// routes don't otherwise need. A stable per-browser guest id fully fixes
// the actual bug (key consistency across all five call sites) without that
// cost. Making DAT Apex's storage aware of which signed-in account is
// active is a separate, larger piece of work — it needs real auth wiring
// into app/apex/** first, which doesn't exist yet.

import { safeSetItem } from "@/lib/storage/safeStorage";

const GUEST_ID_STORAGE_KEY = "avrrio-apex-guest-id";

/**
 * The current DAT Apex user id — a stable per-browser guest id, persisted
 * (not regenerated per call), so every reader/writer of DAT Apex's
 * per-user storage agrees on the same key across the whole session and
 * across reloads.
 */
export function getCurrentApexUserId(): string {
  if (typeof window === "undefined") return "guest";
  const existing = window.localStorage.getItem(GUEST_ID_STORAGE_KEY);
  if (existing) return existing;
  const created = `guest-${crypto.randomUUID()}`;
  safeSetItem(GUEST_ID_STORAGE_KEY, created);
  return created;
}
