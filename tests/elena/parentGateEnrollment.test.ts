// tests/elena/parentGateEnrollment.test.ts
// P1 fix — flagged by automated review on #671 (unresolved discussion on
// components/elena/ParentGate.tsx:30, posted just after merge). "No PIN
// record exists yet" (a fresh/upgraded install, or a transient IDB read
// failure — same code path) used to be treated as authorization to create
// one: whoever tapped the child-visible Parent button first could pick and
// confirm a PIN and immediately unlock the dashboard. Since there's no real
// identity check available in a local, backend-less app, this adds the
// standard mitigation apps aimed at kids use: a simple arithmetic
// "parental gate" a young child is unlikely to solve, required before
// create mode is ever reachable.
//
// Real behavioral tests for the pure gate-challenge logic in
// lib/elena/parentGate.ts. The component wiring (routing both the
// no-record and read-failure cases through "gate" instead of "create") is
// covered by source inspection in elenaParentGate.test.ts, matching this
// repo's established pattern for React components.

import { generateGateChallenge, verifyGateChallenge } from "@/lib/elena/parentGate";

describe("generateGateChallenge", () => {
  it("produces two addends in the intended range (not trivially small, e.g. always single-digit)", () => {
    for (let i = 0; i < 50; i++) {
      const { a, b } = generateGateChallenge();
      expect(a).toBeGreaterThanOrEqual(10);
      expect(a).toBeLessThan(50);
      expect(b).toBeGreaterThanOrEqual(10);
      expect(b).toBeLessThan(50);
    }
  });

  it("varies across calls instead of always returning the same challenge", () => {
    const challenges = Array.from({ length: 20 }, () => generateGateChallenge());
    const unique = new Set(challenges.map((c) => `${c.a}+${c.b}`));
    expect(unique.size).toBeGreaterThan(1);
  });
});

describe("verifyGateChallenge", () => {
  it("REQUIRED: true for the correct sum", () => {
    expect(verifyGateChallenge({ a: 12, b: 7 }, "19")).toBe(true);
  });

  it("REQUIRED: false for any wrong answer", () => {
    expect(verifyGateChallenge({ a: 12, b: 7 }, "20")).toBe(false);
    expect(verifyGateChallenge({ a: 12, b: 7 }, "0")).toBe(false);
  });

  it("tolerates surrounding whitespace", () => {
    expect(verifyGateChallenge({ a: 12, b: 7 }, "  19  ")).toBe(true);
  });

  it("REQUIRED: non-numeric input is rejected, not coerced to a false-positive match", () => {
    expect(verifyGateChallenge({ a: 12, b: 7 }, "nineteen")).toBe(false);
    expect(verifyGateChallenge({ a: 12, b: 7 }, "")).toBe(false);
    expect(verifyGateChallenge({ a: 12, b: 7 }, "  ")).toBe(false);
  });
});
