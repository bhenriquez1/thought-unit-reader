// tests/recalllab/recall2DashboardLearningStateWiring.test.ts
// Confirms the canonical Recall home actually fetches and
// threads the shared Learning State signal into every stats/queue call
// site, not just the pure lib functions it calls. No jsdom/render harness
// for this component in this repo — source inspection, matching this
// repo's established pattern for React components.

import fs from "fs";
import path from "path";

const SRC = fs.readFileSync(path.resolve(__dirname, "../../components/recalllab/Recall2Lab.tsx"), "utf8");

describe("components/recalllab/Recall2Lab.tsx — canonical Recall home", () => {
  it("REQUIRED: fetches node signals via fetchRecallWeaknessSignals whenever blueprints change", () => {
    expect(SRC).toMatch(/import \{ fetchRecallWeaknessSignals \} from "@\/lib\/recalllab\/recall2LearningStateSignals";/);
    const idx = SRC.indexOf("fetchRecallWeaknessSignals(blueprints)");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(Math.max(0, idx - 300), idx + 400);
    expect(block).toMatch(/useEffect\(/);
    expect(block).toMatch(/\}, \[blueprints\]\);/);
  });

  it("REQUIRED: computeRecall2Stats is called with the fetched nodeSignals, not just blueprints", () => {
    expect(SRC).toMatch(/computeRecall2Stats\(blueprints, nodeSignals\)/);
  });

  it("REQUIRED: every stored-card queue passes shared nodeSignals", () => {
    const matches = SRC.match(/buildSessionQueue\([^)]*\)/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(3);
    for (const call of matches) {
      expect(call).toMatch(/nodeSignals/);
    }
  });

  it("removes the competing Recall2Dashboard and silently migrates legacy sets as data", () => {
    expect(fs.existsSync(path.resolve(__dirname, "../../components/recalllab/Recall2Dashboard.tsx"))).toBe(false);
    expect(SRC).toMatch(/saveBlueprintsDedup\(recallSetToBlueprints\(set\), set\.bookId\)/);
    expect(SRC).not.toMatch(/IMPORT FROM RECALL LAB 1\.0/);
  });
});
