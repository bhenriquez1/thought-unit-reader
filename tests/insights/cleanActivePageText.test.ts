// tests/insights/cleanActivePageText.test.ts
// Regression coverage for normalizeDropCaps — this function had NO test
// coverage before this change, which is part of why the bug it fixes went
// unnoticed: the old regex merged ANY isolated capital letter (excluding I)
// followed by a lowercase word, anywhere in the text. That's correct for a
// genuine PDF drop-cap artifact ("T he cell" -> "The cell") but also
// incorrectly matched ordinary prose containing a standalone single-letter
// word or classifier ("A patient", "Vitamin B complex", "Group A
// streptococcus"). The corrupted text was what got sent to the Surgeon
// annotation model (see cleanActivePageText's callers in
// pages/api/page-annotation-plan.ts), while grounding
// (lib/highlights/groundSurgeonQuotes.ts) checked the annotation's quoted
// text against the RAW (uncorrupted) PDF text layer — a faithfully-quoted
// annotation would silently fail to ground and get dropped, with no
// server-side failure signal (the server's own plausibility check compares
// against the same corrupted text, so it looks fine there).

import { normalizeDropCaps, cleanActivePageText } from "../../lib/insights/cleanActivePageText";

describe("normalizeDropCaps — genuine drop-cap repair still works", () => {
  it("merges a drop-capped first letter at the start of the text", () => {
    expect(normalizeDropCaps("T he cell cycle regulates growth.")).toBe("The cell cycle regulates growth.");
    expect(normalizeDropCaps("C ellular respiration occurs in mitochondria.")).toBe("Cellular respiration occurs in mitochondria.");
  });

  it("merges a drop-capped letter immediately after a paragraph-break newline", () => {
    const input = "First paragraph ends here.\nS econd paragraph begins with a drop cap.";
    expect(normalizeDropCaps(input)).toBe("First paragraph ends here.\nSecond paragraph begins with a drop cap.");
  });

  it("merges a drop-capped letter immediately after sentence-ending punctuation", () => {
    const input = "End of chapter. B lood pressure rises rapidly in this condition.";
    expect(normalizeDropCaps(input)).toBe("End of chapter. Blood pressure rises rapidly in this condition.");
  });

  it("still excludes capital I (the pronoun), unchanged from before", () => {
    expect(normalizeDropCaps("I love this subject.")).toBe("I love this subject.");
  });
});

describe("normalizeDropCaps — REQUIRED: does not corrupt ordinary prose (the actual bug)", () => {
  it("REQUIRED: never merges the indefinite article 'A' into the following word, at any position", () => {
    expect(normalizeDropCaps("A patient with diabetes presents with symptoms.")).toBe("A patient with diabetes presents with symptoms.");
    // Even at the very start of the text, where a genuine drop-cap WOULD be
    // caught by the position check — "A" is excluded by letter, not by
    // position, because "A" is already a complete valid word on its own.
    expect(normalizeDropCaps("A cell is the basic unit of life.")).toBe("A cell is the basic unit of life.");
  });

  it("REQUIRED: never merges a single-letter classifier that follows a preceding word (not a sentence boundary)", () => {
    expect(normalizeDropCaps("Vitamin B complex is essential.")).toBe("Vitamin B complex is essential.");
    expect(normalizeDropCaps("Group A streptococcus causes infection.")).toBe("Group A streptococcus causes infection.");
    expect(normalizeDropCaps("Type B diabetes differs from Type A diabetes.")).toBe("Type B diabetes differs from Type A diabetes.");
    expect(normalizeDropCaps("Hepatitis C infection is common worldwide.")).toBe("Hepatitis C infection is common worldwide.");
    expect(normalizeDropCaps("Grade B evidence supports this treatment.")).toBe("Grade B evidence supports this treatment.");
  });

  it("does not touch a letter+word pair that appears further into a sentence, even with an excludable letter", () => {
    expect(normalizeDropCaps("The patient was assigned to Group B for the trial.")).toBe("The patient was assigned to Group B for the trial.");
  });
});

describe("cleanActivePageText — end-to-end: the reported bug examples survive cleaning intact", () => {
  it("REQUIRED: a page opening with 'A patient...' is not corrupted", () => {
    const raw = "A patient with diabetes presents with elevated glucose levels requiring immediate management.";
    expect(cleanActivePageText(raw)).toContain("A patient with diabetes");
  });

  it("REQUIRED: 'Vitamin B complex' mid-page is not corrupted", () => {
    const raw = "The body requires several nutrients. Vitamin B complex supports metabolic function throughout the cell.";
    expect(cleanActivePageText(raw)).toContain("Vitamin B complex");
  });

  it("REQUIRED: 'Group A streptococcus' mid-page is not corrupted", () => {
    const raw = "Bacterial infections vary widely. Group A streptococcus causes pharyngitis in many patients.";
    expect(cleanActivePageText(raw)).toContain("Group A streptococcus");
  });

  it("a genuine drop-capped chapter opener is still repaired end-to-end", () => {
    const raw = "T he mitochondria is the powerhouse of the cell, producing ATP through respiration.";
    expect(cleanActivePageText(raw)).toContain("The mitochondria is the powerhouse");
  });
});

describe("cleanActivePageText — stripFigureCaptions option", () => {
  const raw = "Figure 3.2 The ATP synthase complex spans the membrane. Additional prose follows.";

  it("REQUIRED: strips figure captions by default (unchanged existing behavior for synthesis/grounding callers)", () => {
    expect(cleanActivePageText(raw)).not.toContain("Figure 3.2");
  });

  it("REQUIRED: keeps figure captions intact when stripFigureCaptions is false — used by Current Page speech, which may not silently drop instructional caption content", () => {
    const cleaned = cleanActivePageText(raw, undefined, { stripFigureCaptions: false });
    expect(cleaned).toContain("Figure 3.2");
    expect(cleaned).toContain("The ATP synthase complex spans the membrane.");
  });

  it("stripFigureCaptions:false does not disable any other stripping stage (headers/footers/page numbers still stripped)", () => {
    const withHeader = "30 UNIT ONE The Chemistry of Life Figure 3.2 A caption here. Cells are alive.";
    const cleaned = cleanActivePageText(withHeader, undefined, { stripFigureCaptions: false });
    expect(cleaned).not.toMatch(/UNIT ONE/);
    expect(cleaned).toContain("Figure 3.2");
    expect(cleaned).toContain("Cells are alive.");
  });
});
