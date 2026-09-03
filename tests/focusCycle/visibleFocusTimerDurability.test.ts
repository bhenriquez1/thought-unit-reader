// tests/focusCycle/visibleFocusTimerDurability.test.ts
// L9 — Brian's live-testing diagnosis found the durable, wall-clock-deadline
// fix in PR #755 landed on lib/stores/focusCycleStore.ts, which powers
// FocusCycleCard — a component imported but never rendered anywhere in this
// app (confirmed: no `<FocusCycleCard` JSX usage in the repo). The floating
// timer students actually see is a completely separate, interval-based,
// never-persisted `focusState` local to pages/index.tsx, so the durability
// fix never reached it: a reload lost all progress, and a throttled
// background tab could silently drift. This closes that gap on the timer
// that's actually visible, using the same wall-clock-deadline principle
// (see tests/focusCycle/stableTimer.test.ts for the focusCycleStore.ts side).
//
// No jsdom/render harness for pages/index.tsx in this repo — source
// inspection, matching this repo's established pattern for this file.

import fs from "fs";
import path from "path";

const SRC = fs.readFileSync(path.resolve(__dirname, "../../pages/index.tsx"), "utf8");

describe("pages/index.tsx — the visible floating focus timer is wall-clock-deadline based, not a plain decrementing counter", () => {
  it("REQUIRED: FocusTimerState carries a deadline field alongside mode/time/running", () => {
    const idx = SRC.indexOf("export interface FocusTimerState {");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 250);
    expect(block).toMatch(/mode: "focus" \| "short_break" \| "long_break";/);
    expect(block).toMatch(/time: number;/);
    expect(block).toMatch(/running: boolean;/);
    expect(block).toMatch(/deadline: number \| null;/);
  });

  it("REQUIRED: computeFocusRemainingSeconds re-derives remaining time from deadline - Date.now(), never trusting a stale `time` while running", () => {
    const idx = SRC.indexOf("function computeFocusRemainingSeconds(state: FocusTimerState): number {");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 250);
    expect(block).toMatch(/Math\.max\(0, Math\.round\(\(state\.deadline - Date\.now\(\)\) \/ 1000\)\)/);
  });

  it("REQUIRED: the once-a-second tick recomputes from the deadline via advanceFocusTimer instead of decrementing a counter — immune to throttled/delayed ticks", () => {
    const idx = SRC.indexOf("function advanceFocusTimer(");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 900);
    expect(block).toMatch(/const remaining = computeFocusRemainingSeconds\(state\);/);
    expect(block).toMatch(/if \(remaining > 0\) return \{ next: \{ \.\.\.state, time: remaining \}, cycleCompleted: false \};/);
    expect(SRC).not.toMatch(/prev\.time > 1\) return \{ \.\.\.prev, time: prev\.time - 1 \}/);
  });

  it("REQUIRED: the timer is persisted (mode/time/running/deadline/settings/cycleCount) on every change and restored on mount", () => {
    expect(SRC).toMatch(/const FOCUS_TIMER_STORAGE_KEY = "avrrio-focus-timer-v1";/);
    const persistIdx = SRC.indexOf("safeSetItem(FOCUS_TIMER_STORAGE_KEY, JSON.stringify({");
    expect(persistIdx).toBeGreaterThan(-1);
    const persistBlock = SRC.slice(persistIdx, persistIdx + 300);
    expect(persistBlock).toMatch(/mode: focusState\.mode,/);
    expect(persistBlock).toMatch(/deadline: focusState\.deadline,/);
    expect(persistBlock).toMatch(/cycleCount,/);
    expect(SRC).toMatch(/localStorage\.getItem\(FOCUS_TIMER_STORAGE_KEY\)/);
  });

  it("REQUIRED: mount-time rehydration re-derives state via advanceFocusTimer, so a segment that finished while the tab was closed resolves immediately rather than showing stale time", () => {
    const idx = SRC.indexOf("const raw = localStorage.getItem(FOCUS_TIMER_STORAGE_KEY);");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 1200);
    expect(block).toMatch(/const \{ next, cycleCompleted \} = advanceFocusTimer\(restoredState, restoredSettings\);/);
    expect(block).toMatch(/setFocusState\(next\);/);
  });

  it("REQUIRED: pausing (registerInterruption, manual tab-switch pause, and the Start/Pause toggle) always freezes `time` via computeFocusRemainingSeconds before clearing the deadline — never just stops the interval and leaves a stale number", () => {
    const pauseSites = SRC.match(/time: computeFocusRemainingSeconds\(prev\), running: false, deadline: null/g) ?? [];
    // registerInterruption + trySwitchShellTab's manual pause + the Start/Pause toggle's pause branch
    expect(pauseSites.length).toBeGreaterThanOrEqual(3);
  });

  it("REQUIRED: starting (the toggle button and the Take-a-Break button) always sets a fresh deadline from the current time", () => {
    expect(SRC).toMatch(/running: true, deadline: Date\.now\(\) \+ prev\.time \* 1000/);
    expect(SRC).toMatch(/setFocusState\(\{ mode: isLong \? "long_break" : "short_break", time: breakSeconds, running: true, deadline: Date\.now\(\) \+ breakSeconds \* 1000 \}\);/);
  });
});

describe("pages/index.tsx — switching to NoteLab mid-focus-session is part of the study workflow, not an interruption", () => {
  it("REQUIRED: trySwitchShellTab's protected-tab list exempts notelab alongside reader/toc/syllabus/podcast", () => {
    const idx = SRC.indexOf('const isProtected = !["reader", "toc", "syllabus", "podcast", "notelab"].includes(tab);');
    expect(idx).toBeGreaterThan(-1);
  });
});
