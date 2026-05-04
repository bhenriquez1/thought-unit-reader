import { extractConceptBlocks, type PageModelForConcepts } from "@/lib/insights/extractConceptBlocks";
import { findMainTeachingZone } from "@/lib/insights/findMainTeachingZone";
import { isValidCoreParagraph } from "@/lib/insights/buildUltraPageView";
import { buildHighlightNeighborhoods } from "@/lib/highlights/buildHighlightNeighborhoods";

describe("strict selection/retention rules", () => {
  it("keeps definition first and mechanism second when present", () => {
    const page: PageModelForConcepts = {
      documentId: "doc",
      pageNumber: 1,
      paragraphs: [
        { id: "p-def", text: "Matter is defined as anything that has mass and occupies space.", sentenceIds: ["s-def"], score: 2 },
        { id: "p-var", text: "However, unlike compounds, elements cannot be chemically decomposed.", sentenceIds: ["s-var"], score: 10 },
        { id: "p-mech", text: "Bond polarity causes unequal electron distribution and leads to molecular interactions.", sentenceIds: ["s-mech"], score: 7 },
      ],
      sentences: [
        { id: "s-def", text: "Matter is defined as anything that has mass and occupies space.", paragraphId: "p-def", score: 1 },
        { id: "s-var", text: "However, unlike compounds, elements cannot be chemically decomposed.", paragraphId: "p-var", score: 5 },
        { id: "s-mech", text: "Bond polarity causes unequal electron distribution and leads to molecular interactions.", paragraphId: "p-mech", score: 4 },
      ],
      headings: [],
    };

    const concepts = extractConceptBlocks(page);
    expect(concepts[0]?.conceptRole).toBe("definition");
    expect(concepts[1]?.conceptRole).toBe("mechanism");
  });

  it("preserves explanation neighbor when a formula paragraph is selected", () => {
    const paragraphs: any[] = [
      { id: "p0", paragraphType: "formula", cleanedText: "If y=f(x), then dy/dx = 2x.", rawText: "", priorityScore: 9 },
      { id: "p1", paragraphType: "mixed", cleanedText: "This means slope depends on x and increases with larger x values.", rawText: "", priorityScore: 3 },
      { id: "p2", paragraphType: "mixed", cleanedText: "Sidebar note", rawText: "", priorityScore: 1 },
      { id: "p3", paragraphType: "mixed", cleanedText: "Another unrelated paragraph for context only.", rawText: "", priorityScore: 1 },
      { id: "p4", paragraphType: "mixed", cleanedText: "Extra filler content that should not matter.", rawText: "", priorityScore: 1 },
      { id: "p5", paragraphType: "mixed", cleanedText: "More filler content that should not matter.", rawText: "", priorityScore: 1 },
    ];

    const zone = findMainTeachingZone(paragraphs as any);
    const ids = new Set(zone.map((p: any) => p.id));
    expect(ids.has("p0")).toBe(true);
    expect(ids.has("p1")).toBe(true);
  });

  it("accepts short math explanation paragraphs in core filtering", () => {
    expect(isValidCoreParagraph({ paragraphType: "mixed", cleanedText: "The function value depends on x near the limit.", rawText: "" } as any)).toBe(true);
  });

  it("suppresses anchor-only neighborhoods when deeper neighborhoods exist", () => {
    const neighborhoods = buildHighlightNeighborhoods([
      {
        id: "concept-a",
        title: "Anchor Only",
        anchorSentence: "Definition is given here in one sentence.",
        supportSentences: [],
        supportSentenceIds: [],
        trapCandidates: [],
        paragraphIds: ["p1"],
        importance: "medium",
        score: 0.5,  // after anchor_only penalty (-0.45) → 0.05, below the 0.3 threshold
        conceptRole: "definition",
      },
      {
        id: "concept-b",
        title: "With Support",
        anchorSentence: "Process causes an effect in the system.",
        supportSentences: ["Because the gradient changes, molecules move across the membrane quickly."],
        supportSentenceIds: ["s2"],
        trapCandidates: [],
        paragraphIds: ["p2"],
        importance: "high",
        score: 9,
        conceptRole: "mechanism",
      },
    ]);

    expect(neighborhoods.some((n) => n.conceptId === "concept-a")).toBe(false);
    const kept = neighborhoods.find((n) => n.conceptId === "concept-b");
    expect(kept?.depthLevel).toBe("full");
  });
});
