import { extractConceptBlocks, type PageModelForConcepts, type ConceptBlockInput } from "@/lib/insights/extractConceptBlocks";
import { findMainTeachingZone } from "@/lib/insights/findMainTeachingZone";
import { buildHighlightNeighborhoods } from "@/lib/highlights/buildHighlightNeighborhoods";
import type { ParagraphInsight } from "@/lib/insights/types";

describe("strict hierarchy and retention fixes", () => {
  it("keeps definition first and mechanism second when both exist", () => {
    const page: PageModelForConcepts = {
      documentId: "d",
      pageNumber: 1,
      paragraphs: [
        { id: "p1", text: "X is defined as a regulated process that links signals and outcomes.", sentenceIds: ["s1"], score: 2 },
        { id: "p2", text: "This mechanism causes ATP production to fall rapidly under hypoxia.", sentenceIds: ["s2"], score: 8 },
        { id: "p3", text: "However, unlike acute adaptation, chronic compensation is slower.", sentenceIds: ["s3"], score: 12 },
      ],
      sentences: [
        { id: "s1", text: "X is defined as a regulated process that links signals and outcomes.", paragraphId: "p1", score: 1 },
        { id: "s2", text: "This mechanism causes ATP production to fall rapidly under hypoxia.", paragraphId: "p2", score: 1 },
        { id: "s3", text: "However, unlike acute adaptation, chronic compensation is slower.", paragraphId: "p3", score: 1 },
      ],
    };

    const concepts = extractConceptBlocks(page);
    expect(concepts[0]?.conceptRole).toBe("definition");
    const mechanismIndex = concepts.findIndex((c) => c.conceptRole === "mechanism");
    const variationIndex = concepts.findIndex((c) => c.conceptRole === "variation");
    expect(mechanismIndex).toBeGreaterThanOrEqual(0);
    if (variationIndex >= 0) {
      expect(mechanismIndex).toBeLessThan(variationIndex);
    }
  });

  it("retains an adjacent explanation paragraph when a formula paragraph is selected", () => {
    const paragraphs: ParagraphInsight[] = [
      { id: "p0", paragraphType: "formula", cleanedText: "If y = f(g(x)), then dy/dx = f'(g(x)) * g'(x).", rawText: "", priorityScore: 7, extractedSignals: {}, coreSignals: [], takeaway: "", takeaways: [], traps: [], logicChains: [] } as any,
      { id: "p1", paragraphType: "mixed", cleanedText: "This means the outer derivative is evaluated at the inner function before multiplying by inner change.", rawText: "", priorityScore: 1, extractedSignals: {}, coreSignals: [], takeaway: "", takeaways: [], traps: [], logicChains: [] } as any,
      { id: "p2", paragraphType: "mixed", cleanedText: "Example values are substituted after differentiation.", rawText: "", priorityScore: 0.5, extractedSignals: {}, coreSignals: [], takeaway: "", takeaways: [], traps: [], logicChains: [] } as any,
      { id: "p3", paragraphType: "mixed", cleanedText: "Unrelated narrative paragraph with no math explanation markers.", rawText: "", priorityScore: 4, extractedSignals: {}, coreSignals: [], takeaway: "", takeaways: [], traps: [], logicChains: [] } as any,
      { id: "p4", paragraphType: "mixed", cleanedText: "Another paragraph.", rawText: "", priorityScore: 2, extractedSignals: {}, coreSignals: [], takeaway: "", takeaways: [], traps: [], logicChains: [] } as any,
      { id: "p5", paragraphType: "mixed", cleanedText: "Background paragraph.", rawText: "", priorityScore: 1, extractedSignals: {}, coreSignals: [], takeaway: "", takeaways: [], traps: [], logicChains: [] } as any,
    ];

    const zone = findMainTeachingZone(paragraphs);
    expect(zone.some((p) => p.id === "p0")).toBe(true);
    expect(zone.some((p) => p.id === "p1")).toBe(true);
  });

  it("suppresses anchor-only neighborhoods when richer ones exist", () => {
    const concepts: ConceptBlockInput[] = [
      {
        id: "c1",
        title: "Anchor Only",
        anchorSentence: "Cell membranes are dynamic barriers.",
        supportSentences: [],
        supportSentenceIds: [],
        trapCandidates: [],
        paragraphIds: ["p1"],
        importance: "medium",
        score: 8,
        conceptRole: "definition",
      },
      {
        id: "c2",
        title: "With Support",
        anchorSentence: "Transport proteins regulate membrane permeability.",
        supportSentences: ["Because channel state changes with voltage, flux varies over time."],
        supportSentenceIds: ["p2s1"],
        trapCandidates: [],
        paragraphIds: ["p2"],
        importance: "high",
        score: 9,
        conceptRole: "mechanism",
      },
    ];

    const neighborhoods = buildHighlightNeighborhoods(concepts);
    expect(neighborhoods.some((n) => n.conceptId === "c1")).toBe(false);
    expect(neighborhoods.some((n) => n.conceptId === "c2")).toBe(true);
    expect(neighborhoods[0]?.depthLevel).toBe("full");
  });
});
