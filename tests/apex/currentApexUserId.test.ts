// tests/apex/currentApexUserId.test.ts
// X3 — a single, consistent identity source for DAT Apex's per-user
// storage, fixing a real bug: the readiness IDB store was written under
// "demo-user" (proctor) but read under "default" (dashboard), so the
// dashboard never saw real attempt data. getCurrentApexUserId() is
// behaviorally tested for the Node-env fallback (no `window`, matching
// this repo's jest environment); the browser-only persisted-guest-id path
// gets static-analysis coverage, matching the established pattern for
// browser-only modules in this repo (no jsdom in this jest config).

import fs from "fs";
import path from "path";
import { getCurrentApexUserId } from "@/lib/apex/currentApexUserId";

describe("getCurrentApexUserId — Node-env fallback", () => {
  it("REQUIRED: resolves to a stable, non-throwing value when window is unavailable (this repo's jest environment)", () => {
    expect(typeof window).toBe("undefined");
    expect(getCurrentApexUserId()).toBe("guest");
  });

  it("is deterministic across repeated calls in the same environment", () => {
    expect(getCurrentApexUserId()).toBe(getCurrentApexUserId());
  });
});

describe("lib/apex/currentApexUserId.ts — browser-path source shape", () => {
  const SRC = fs.readFileSync(path.resolve(__dirname, "../../lib/apex/currentApexUserId.ts"), "utf8");

  it("REQUIRED: the guest id is persisted (read-or-create), never regenerated per call", () => {
    const idx = SRC.indexOf("export function getCurrentApexUserId");
    const block = SRC.slice(idx, idx + 500);
    expect(block).toMatch(/const existing = window\.localStorage\.getItem\(GUEST_ID_STORAGE_KEY\);/);
    expect(block).toMatch(/if \(existing\) return existing;/);
    expect(block).toMatch(/safeSetItem\(GUEST_ID_STORAGE_KEY, created\);/);
  });

  it("REQUIRED: does not import lib/firebase.ts — this module must stay lightweight (no full Firebase SDK) since app/apex/** has no other auth-reactive code today", () => {
    expect(SRC).not.toMatch(/from ["']@\/lib\/firebase["']/);
  });
});

describe("Every former demo-user/default call site now routes through getCurrentApexUserId", () => {
  function read(rel: string): string {
    return fs.readFileSync(path.resolve(__dirname, "../..", rel), "utf8");
  }

  it("REQUIRED: app/apex/proctor/page.tsx — attempt userId and readiness update", () => {
    const src = read("app/apex/proctor/page.tsx");
    expect(src).not.toMatch(/"demo-user"/);
    expect(src).toMatch(/userId:\s*getCurrentApexUserId\(\)/);
    expect(src).toMatch(/updateReadinessAfterAttempt\(getCurrentApexUserId\(\), result\)/);
  });

  it("REQUIRED: app/apex/page.tsx — readiness read, previously the mismatched \"default\" key", () => {
    const src = read("app/apex/page.tsx");
    expect(src).not.toMatch(/loadReadinessState\("default"\)/);
    expect(src).toMatch(/loadReadinessState\(getCurrentApexUserId\(\)\)/);
  });

  it("REQUIRED: app/apex/results/page.tsx — mistake logger", () => {
    const src = read("app/apex/results/page.tsx");
    expect(src).not.toMatch(/'demo-user'/);
    expect(src).toMatch(/const userId = getCurrentApexUserId\(\);/);
  });
});
