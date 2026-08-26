import { detectContentProfile } from "@/lib/content/contentProfile";
import { buildChildReadAloudText, getChildQuickPrompts } from "@/lib/elena/storyReading";
import { inferPrintedPageNumber } from "@/lib/toc/printedPagination";
import type { TocItem } from "@/lib/stores/tocStore";

describe("adaptive content profiles — real acceptance books", () => {
  it("treats Biocalculus as a math textbook with selective permanent anchors", () => {
    const profile = detectContentProfile({
      bookTitle: "BIOCALCULUS: Calculus for Life Sciences",
      pageText: "A function f(x) assigns each value in the domain to one value in the range.",
    });

    expect(profile.id).toBe("math-textbook");
    expect(profile.highlightBudget).toBeLessThanOrEqual(6);
    expect(profile.permanentHighlighting).toBe(true);
    expect(profile.navigationStyle).toBe("native-outline");
  });

  it("treats Banana Fox as a comic reading experience in Elena Mode", () => {
    const profile = detectContentProfile({
      bookTitle: "Banana Fox and the Secret Sour Society",
      pageText: "DING DONG! BANANA FOX! Who is there?",
      childMode: true,
    });

    expect(profile.id).toBe("child-comic");
    expect(profile.permanentHighlighting).toBe(false);
    expect(profile.navigationStyle).toBe("generated-story-map");
    expect(profile.teachingStyle).toBe("reading-coach");
  });

  it("does not mistake ordinary clinical uses of function, range, or graph for mathematics", () => {
    expect(detectContentProfile({
      bookTitle: "Clinical Physiology",
      pageText: "The function of the kidney can vary across the normal range. The graph below summarizes patient findings.",
    }).id).toBe("adult-textbook");
  });

  it("can identify a math page from several corroborating terms without a math title", () => {
    expect(detectContentProfile({
      bookTitle: "Life Sciences",
      pageText: "The domain and range of this function are shown on the graph and coordinate axes.",
    }).id).toBe("math-textbook");
  });

  it("keeps comic dialogue in source order and removes page furniture", () => {
    expect(buildChildReadAloudText("12\nDING DONG!\nWho is there?\nBanana Fox!\nCopyright 2021"))
      .toBe("DING DONG! Who is there? Banana Fox!");
  });

  it("offers comic-specific speaker, sequence, vocabulary, and prediction prompts", () => {
    const prompts = getChildQuickPrompts("child-comic");
    expect(prompts.map((prompt) => prompt.id)).toEqual(["speaker", "first", "word", "predict"]);
  });
});

describe("printed versus electronic PDF pagination", () => {
  const outline: TocItem[] = [
    { id: "front", title: "Contents", pageNumber: 8, level: 0 },
    {
      id: "chapter-1",
      title: "Chapter 1 Functions",
      pageNumber: 52,
      level: 0,
      children: [{ id: "section-1-1", title: "1.1 Functions", pageNumber: 53, level: 1 }],
    },
    { id: "chapter-2", title: "Chapter 2 Limits", pageNumber: 140, level: 0 },
  ];

  it("infers Biocalculus PDF page 54 as printed page 3", () => {
    expect(inferPrintedPageNumber(outline, 52)).toBe(1);
    expect(inferPrintedPageNumber(outline, 54)).toBe(3);
  });

  it("does not invent printed pagination for front matter", () => {
    expect(inferPrintedPageNumber(outline, 8)).toBeNull();
  });
});
