// tests/elena/elenaDailyLimitControls.test.ts
// P1 fix (Elena parental controls: daily reading-time limit). Covers the
// two pieces the pure-logic tests (dailyLimit.test.ts) and the workspace
// wiring tests (elenaRealProgress.test.ts) don't: real IDB persistence for
// ParentControlSettings, and the Parent Dashboard UI that lets a parent
// view/change the limit. No jsdom/render harness for these files in this
// repo — source inspection, matching this repo's established pattern.

import fs from "fs";
import path from "path";

const IDB_SRC = fs.readFileSync(path.resolve(__dirname, "../../lib/elena/idbStore.ts"), "utf8");
const DASHBOARD_SRC = fs.readFileSync(path.resolve(__dirname, "../../components/elena/ParentDashboard.tsx"), "utf8");

describe("lib/elena/idbStore.ts — parent-controls store is real, versioned persistence", () => {
  it("REQUIRED: a dedicated parent-controls object store exists, keyed by childProfileId (per-child, not per-family)", () => {
    expect(IDB_SRC).toMatch(/const STORE_PARENT_CONTROLS = "parent-controls";/);
    expect(IDB_SRC).toMatch(/db\.createObjectStore\(STORE_PARENT_CONTROLS, \{ keyPath: "childProfileId" \}\);/);
  });

  it("REQUIRED: the DB version was bumped again on top of the v4 parent-gate bump, so existing users get this upgrade too", () => {
    const match = IDB_SRC.match(/const DB_VERSION\s*=\s*(\d+);/);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBeGreaterThanOrEqual(5);
  });

  it("REQUIRED: the store is created behind an objectStoreNames.contains guard, like every other store here — old-version DBs upgrade in place instead of needing a migration", () => {
    const idx = IDB_SRC.indexOf("db.createObjectStore(STORE_PARENT_CONTROLS,");
    expect(idx).toBeGreaterThan(-1);
    const before = IDB_SRC.slice(Math.max(0, idx - 120), idx);
    expect(before).toMatch(/if \(!db\.objectStoreNames\.contains\(STORE_PARENT_CONTROLS\)\) \{/);
  });

  it("REQUIRED: saveParentControlSettings and loadParentControlSettings are real, exported functions", () => {
    expect(IDB_SRC).toMatch(/export async function saveParentControlSettings\(settings: ParentControlSettings\): Promise<void>/);
    expect(IDB_SRC).toMatch(/export async function loadParentControlSettings\(childProfileId: string\): Promise<ParentControlSettings \| null>/);
  });
});

describe("components/elena/ParentDashboard.tsx — real daily-limit control, not a placeholder", () => {
  it("REQUIRED: accepts dailyLimitMinutes and onSetDailyLimit as props instead of owning limit state internally", () => {
    const idx = DASHBOARD_SRC.indexOf("interface ParentDashboardProps");
    expect(idx).toBeGreaterThan(-1);
    const block = DASHBOARD_SRC.slice(idx, DASHBOARD_SRC.indexOf("}", idx) + 1);
    expect(block).toMatch(/dailyLimitMinutes: number \| null;/);
    expect(block).toMatch(/onSetDailyLimit: \(minutes: number \| null\) => void;/);
  });

  it("REQUIRED: offers a real 'no limit' option alongside numeric presets, not just an unbounded numeric input", () => {
    const idx = DASHBOARD_SRC.indexOf("const DAILY_LIMIT_PRESETS");
    expect(idx).toBeGreaterThan(-1);
    const block = DASHBOARD_SRC.slice(idx, DASHBOARD_SRC.indexOf("];", idx) + 2);
    expect(block).toMatch(/minutes: null/);
    expect(block).toMatch(/minutes: \d+/);
  });

  it("REQUIRED: picking a preset calls onSetDailyLimit with that preset's minutes", () => {
    const idx = DASHBOARD_SRC.indexOf("DAILY_LIMIT_PRESETS.map");
    expect(idx).toBeGreaterThan(-1);
    const block = DASHBOARD_SRC.slice(idx, idx + 400);
    expect(block).toMatch(/onClick=\{\(\) => onSetDailyLimit\(minutes\)\}/);
  });

  it("the currently active preset is visibly highlighted", () => {
    const idx = DASHBOARD_SRC.indexOf("DAILY_LIMIT_PRESETS.map");
    const block = DASHBOARD_SRC.slice(idx, idx + 600);
    expect(block).toMatch(/dailyLimitMinutes === minutes/);
  });
});
