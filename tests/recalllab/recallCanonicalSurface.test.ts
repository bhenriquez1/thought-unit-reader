import fs from "fs";
import path from "path";

const publicSurface = fs.readFileSync(path.resolve(__dirname, "../../components/recalllab/RecallLab.tsx"), "utf8");
const reader = fs.readFileSync(path.resolve(__dirname, "../../pages/index.tsx"), "utf8");
const session = fs.readFileSync(path.resolve(__dirname, "../../components/recalllab/Recall2Session.tsx"), "utf8");

describe("Recall canonical navigation", () => {
  it("main Recall navigation mounts the canonical Recall surface directly", () => {
    expect(reader).toMatch(/import\("@\/components\/recalllab\/RecallLab"\)/);
    expect(publicSurface).toMatch(/data-testid="recall-canonical-surface"/);
    expect(publicSurface).toMatch(/<Recall2Lab/);
  });

  it("has no legacy selector or route back to the quarantined surface", () => {
    expect(publicSurface).not.toMatch(/RecallTabBar|activeTab|LegacyRecallLab|kind: "deck"|kind: "session"/);
    expect(publicSurface).not.toMatch(/Recall 2\.0/);
  });

  it("uses the simplified product header", () => {
    expect(publicSurface).toContain(">Recall</div>");
    expect(publicSurface).toContain("Memory engineering • active retrieval • spaced review");
    expect(session).toContain("← Back to Recall");
    expect(session).not.toContain("← Back to Recall 2.0");
    expect(session).toMatch(/topic \?\? "Recall"/);
  });

  it("retains legacy RecallSet data only as a one-way migration source", () => {
    expect(publicSurface).toMatch(/getAllRecallSetsAsync/);
    expect(publicSurface).toMatch(/legacySets=\{legacySets\}/);
  });
});
