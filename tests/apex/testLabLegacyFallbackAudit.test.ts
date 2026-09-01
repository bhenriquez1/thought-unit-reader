import fs from "fs";
import path from "path";

function read(relPath: string): string {
  return fs.readFileSync(path.resolve(__dirname, "../..", relPath), "utf8");
}

function exists(relPath: string): boolean {
  return fs.existsSync(path.resolve(__dirname, "../..", relPath));
}

const DASHBOARD = "app/apex/page.tsx";

describe("canonical TestLab — source-first workspace", () => {
  it("removes the old DAT pattern-training dashboard and its dead component", () => {
    const src = read(DASHBOARD);
    expect(exists("components/apex/TrainingArena.tsx")).toBe(false);
    expect(src).not.toMatch(/TrainingArena|Learn & Improve|Pattern Readiness by Section|Full-Length Exams/);
  });

  it("starts with exam purpose, Reader source, then configuration", () => {
    const src = read(DASHBOARD);
    expect(src).toMatch(/What are you preparing for\?/);
    expect(src).toMatch(/Choose your source/);
    expect(src).toMatch(/Configure the test/);
    expect(src).toMatch(/getUserBookCatalogue\(\)/);
  });

  it("uses the shared multi-profile catalog and marks unavailable profiles honestly", () => {
    const src = read(DASHBOARD);
    expect(src).toMatch(/EXAM_PROFILE_CATALOG\.map/);
    expect(src).toMatch(/disabled=\{!profile\.available\}/);
    expect(src).toMatch(/Coming soon/);
  });

  it("does not enable generation without a grounded source", () => {
    const src = read(DASHBOARD);
    expect(src).toMatch(/disabled=\{!selectedBook\}/);
    expect(src).toMatch(/never a generic substitute or a fake successful result/);
  });

  it("passes the chosen source (by stable documentId, not bookId/title) and mode into the detailed builder", () => {
    const dashboard = read(DASHBOARD);
    const generator = read("app/apex/generator/page.tsx");
    // TestLab source binding fix — documentId is the real deep-link
    // identity now; sourceBookId is still accepted on the generator page
    // only as a legacy fallback for an already-generated link, never as
    // the value this app itself writes.
    expect(dashboard).toMatch(/params\.set\("sourceDocumentId", documentId\)/);
    expect(generator).toMatch(/searchParams\?\.get\('sourceDocumentId'\)/);
    expect(generator).toMatch(/books\.find\(\(book\) => book\.documentId === requestedSourceDocumentId\)/);
  });

  it("defaults the new source-first experience to Custom Exam instead of inheriting the old DAT dashboard preference", () => {
    const dashboard = read(DASHBOARD);
    const generator = read("app/apex/generator/page.tsx");
    expect(dashboard).toMatch(/activeProfileId:v2/);
    expect(dashboard).toMatch(/CUSTOM_EXAM_PROFILE_ID/);
    expect(generator).toMatch(/: CUSTOM_EXAM_PROFILE_ID/);
  });

  it("locks Practice and Simulation into distinct guided experiences and removes DAT quick presets", () => {
    const generator = read("app/apex/generator/page.tsx");
    expect(generator).toMatch(/launchIntent === 'practice'/);
    expect(generator).toMatch(/launchIntent === 'simulation'/);
    expect(generator).toMatch(/Learn as you go/);
    expect(generator).toMatch(/Simulation Conditions/);
    expect(generator).not.toMatch(/Quick Presets|Full DAT Simulation|Standard DAT|Advanced DAT/);
  });
});

describe("removed TestLab product fallbacks", () => {
  it("keeps previously removed dead dashboards deleted", () => {
    expect(exists("components/surgeonView2/SurgeonCockpit.tsx")).toBe(false);
    expect(exists("components/apex/DATDrillMode.tsx")).toBe(false);
  });

  it("redirects old pattern-training URLs to the canonical TestLab entry", () => {
    for (const route of [
      "app/apex/patterns/page.tsx",
      "app/apex/patterns/decision-tree/page.tsx",
      "app/apex/patterns/flashcards/page.tsx",
    ]) {
      expect(read(route)).toMatch(/redirect\("\/apex"\)/);
    }
  });
});
