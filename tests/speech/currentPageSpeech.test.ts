import {
  buildCurrentPageSpeechSegments,
  normalizeSourceWhitespace,
} from "../../lib/speech/currentPageSpeech";

describe("Current Page speech source fidelity", () => {
  it("preserves headings, captions, pipes, short lines, and reading order", () => {
    const source = [
      "CHAPTER 4",
      "A | B",
      "Fig. 2. A short caption.",
      "Go.",
      "Copyright 2026 Example Press.",
      "The final paragraph stays last.",
    ].join("\n");

    const segments = buildCurrentPageSpeechSegments(source);

    expect(segments.join(" ")).toBe(normalizeSourceWhitespace(source));
    expect(segments.join(" ")).toContain("CHAPTER 4");
    expect(segments.join(" ")).toContain("A | B");
    expect(segments.join(" ")).toContain("Fig. 2. A short caption.");
    expect(segments.join(" ")).toContain("Go.");
  });

  it("does not treat common abbreviations as a sentence boundary", () => {
    expect(buildCurrentPageSpeechSegments("See Fig. 2. Then compare Dr. Li's result."))
      .toEqual(["See Fig. 2.", "Then compare Dr. Li's result."]);
  });

  it("splits oversized speech requests without dropping or reordering content", () => {
    const source = Array.from({ length: 120 }, (_, i) => `word${i}`).join(" ");
    const segments = buildCurrentPageSpeechSegments(source, 80);

    expect(segments.length).toBeGreaterThan(1);
    expect(segments.every((segment) => segment.length <= 80)).toBe(true);
    expect(segments.join(" ")).toBe(source);
  });
});
