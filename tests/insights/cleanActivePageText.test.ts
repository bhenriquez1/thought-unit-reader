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

import { normalizeDropCaps, cleanActivePageText, classifyLineRole } from "../../lib/insights/cleanActivePageText";

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

describe("cleanActivePageText — CHECKPOINT_MARKER_RE/CALLOUT_LABEL_RE only strip a genuine standalone marker, never a phrase embedded mid-sentence (Current Mode losslessness correction)", () => {
  it("REQUIRED: still strips a checkpoint marker glued via space right after the PRECEDING sentence's own period — the common real case, unchanged", () => {
    const raw = "The Krebs cycle produces NADH. Check Your Understanding. Explain how NADH is used.";
    const cleaned = cleanActivePageText(raw);
    expect(cleaned).not.toMatch(/Check Your Understanding/);
    expect(cleaned).toContain("The Krebs cycle produces NADH.");
    expect(cleaned).toContain("Explain how NADH is used.");
  });

  it("REQUIRED: still strips a checkpoint marker that opens its own paragraph after a newline", () => {
    const raw = "Osmosis moves water across membranes.\nDid You Know? This principle also explains IV fluid therapy.\nClinicians rely on it daily.";
    const cleaned = cleanActivePageText(raw);
    expect(cleaned).not.toMatch(/Did You Know/);
    expect(cleaned).toContain("Osmosis moves water across membranes.");
    expect(cleaned).toContain("Clinicians rely on it daily.");
  });

  it("REQUIRED: does NOT strip a sentence where the phrase is embedded mid-sentence, not starting a new one — the actual bug this fixes", () => {
    // "and did you know" continues the SAME sentence (preceded by "and", a
    // lowercase word, never a sentence boundary) — this is ordinary body
    // prose using the phrase conversationally, not a standalone callout box.
    const raw = "This raises an important question, and did you know that ionic bonds form through electron transfer, which connects to our earlier discussion.";
    const cleaned = cleanActivePageText(raw);
    expect(cleaned).toBe(raw);
  });

  it("REQUIRED: does NOT strip a callout label embedded mid-sentence", () => {
    const raw = "The chapter's key concepts build on prior material introduced earlier in the unit.";
    const cleaned = cleanActivePageText(raw);
    expect(cleaned).toBe(raw);
  });

  it("still strips an ALL-CAPS callout label that genuinely opens its own line", () => {
    const raw = "Chemical bonds store energy.\nKEY CONCEPTS\nIonic and covalent bonds differ in electron sharing.";
    const cleaned = cleanActivePageText(raw);
    expect(cleaned).not.toMatch(/KEY CONCEPTS/);
    expect(cleaned).toContain("Chemical bonds store energy.");
    expect(cleaned).toContain("Ionic and covalent bonds differ in electron sharing.");
  });
});

describe("classifyLineRole — stabilization item 4C-1: region-role tagging", () => {
  it("classifies ordinary body prose as 'body'", () => {
    expect(classifyLineRole("The mitochondria produce ATP through cellular respiration.")).toBe("body");
  });

  it("classifies a checkpoint/review marker distinctly from a generic heading", () => {
    expect(classifyLineRole("Check Your Understanding: explain the process.")).toBe("checkpoint-review");
  });

  it("classifies a callout/sidebar label distinctly", () => {
    expect(classifyLineRole("KEY CONCEPTS")).toBe("callout-label");
  });

  it("classifies a full figure/table caption sentence distinctly from a bare structural label", () => {
    expect(classifyLineRole("Figure 3.2 The ATP synthase complex spans the membrane.")).toBe("figure-table-caption");
    // A bare label with no caption sentence, and no Figure/Table/Photo/
    // Illustration keyword, falls to the coarser 'heading' bucket instead —
    // STRUCTURAL_LABEL_RE matches "Concept"/"Example"/etc. prefixes that
    // FIGURE_CAPTION_RE's keyword list doesn't cover at all.
    expect(classifyLineRole("Concept 2.2")).toBe("heading");
  });

  it("classifies a chapter/unit keyword header and a section-number heading as 'heading'", () => {
    expect(classifyLineRole("CHAPTER 4 Acid-Base Equilibrium")).toBe("heading");
    expect(classifyLineRole("2.1 Limits of Sequences")).toBe("heading");
  });

  it("classifies page furniture (bare page number, footer/copyright line) as 'page-furniture'", () => {
    expect(classifyLineRole("42")).toBe("page-furniture");
    expect(classifyLineRole("All rights reserved. Copyright 2024 Pearson Education.")).toBe("page-furniture");
  });

  it("classifies empty/whitespace-only text as 'page-furniture' rather than throwing or defaulting to 'body'", () => {
    expect(classifyLineRole("")).toBe("page-furniture");
    expect(classifyLineRole("   ")).toBe("page-furniture");
  });

  it("REQUIRED: repeated calls never drift due to global-regex lastIndex state — FIGURE_CAPTION_RE/CHECKPOINT_MARKER_RE/CALLOUT_LABEL_RE all carry the 'g' flag for their original replace() use, which makes RegExp.test() stateful across calls on the SAME object; classifyLineRole must be immune since it's called once per sentence on a page, many times per page", () => {
    const figureCaption = "Figure 3.2 The ATP synthase complex spans the membrane.";
    const checkpoint = "Check Your Understanding: explain the process.";
    const callout = "KEY CONCEPTS";
    // Interleaved, repeated calls — a stateful lastIndex bug would make a
    // LATER call against the SAME matching text silently return false
    // because the regex resumed searching past the first match position.
    for (let i = 0; i < 5; i++) {
      expect(classifyLineRole(figureCaption)).toBe("figure-table-caption");
      expect(classifyLineRole(checkpoint)).toBe("checkpoint-review");
      expect(classifyLineRole(callout)).toBe("callout-label");
      expect(classifyLineRole(figureCaption)).toBe("figure-table-caption");
    }
  });
});
