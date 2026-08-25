// tests/recalllab/recall2DashboardLearningStateWiring.test.ts
// C3 (Phase 0 audit) — confirms Recall2Dashboard actually fetches and
// threads the shared Learning State signal into every stats/queue call
// site, not just the pure lib functions it calls. No jsdom/render harness
// for this component in this repo — source inspection, matching this
// repo's established pattern for React components.

import fs from "fs";
import path from "path";

const SRC = fs.readFileSync(path.resolve(__dirname, "../../components/recalllab/Recall2Dashboard.tsx"), "utf8");

describe("components/recalllab/Recall2Dashboard.tsx — Weak-Area Drill signal wiring", () => {
  it("REQUIRED: fetches node signals via fetchRecallWeaknessSignals whenever blueprints change", () => {
    expect(SRC).toMatch(/import \{ fetchRecallWeaknessSignals \} from "@\/lib\/recalllab\/recall2LearningStateSignals";/);
    const idx = SRC.indexOf("fetchRecallWeaknessSignals(blueprints)");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(Math.max(0, idx - 300), idx + 200);
    expect(block).toMatch(/useEffect\(/);
    expect(block).toMatch(/\}, \[blueprints\]\);/);
  });

  it("REQUIRED: computeRecall2Stats is called with the fetched nodeSignals, not just blueprints", () => {
    expect(SRC).toMatch(/computeRecall2Stats\(blueprints, nodeSignals\)/);
  });

  it("REQUIRED: every buildSessionQueue call site (phase buttons, full session, due-only, per-phase-card counts) passes nodeSignals", () => {
    const matches = SRC.match(/buildSessionQueue\([^)]*\)/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(4);
    for (const call of matches) {
      expect(call).toMatch(/nodeSignals/);
    }
  });
});
