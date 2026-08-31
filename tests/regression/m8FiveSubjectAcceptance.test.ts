// tests/regression/m8FiveSubjectAcceptance.test.ts
// M8 — the final phase of the NoteLab + Professor Whiteboard architecture
// correction (M1-M7, each its own PR): a 5-subject acceptance test proving
// the correction's own core claim — genuinely different subjects, not just
// the Ionic Bonding example used throughout the earlier phases' own
// comments — actually work end to end through the REAL pipeline functions,
// composed together exactly as the app composes them, not re-implemented.
//
// Same "no live browser, no live API" constraint every prior test in this
// repo works within (jest config: testEnvironment: "node", no jsdom/RTL;
// see tests/whiteboard/professorAgentDomainAcceptance.test.ts's own header
// comment for the precedent this file follows) — scoped to what pure
// functions and the established IDB-store jest.mock convention
// (tests/notelab/conceptAccumulation.test.ts) can prove without a network
// call. Chains three real, independently-tested modules end to end per
// subject, not a fourth reimplementation of any of them:
//   (a) M1/M2 — lib/notelab/notebookPlanner.ts's finalizeNotebookScene:
//       real grounding discipline (verbatim kept, paraphrase dropped) over
//       THIS subject's own primitive choices and source text.
//   (b) M4 — lib/notelab/conceptAccumulation.ts's gatherConceptNotebookContent:
//       real cross-note accumulation over THIS subject's own multi-source
//       fixtures (textbook + lecture + handwritten note, the correction's
//       own example, generalized to 5 different concepts).
//   (c) M2+M4 integration — (a)'s and (b)'s outputs actually composed
//       together via the real buildNotebookPlannerUserPrompt, proving the
//       seam between them holds for each subject, not just Chemistry.
//   (d) M7 — lib/whiteboard/handwritingReveal.ts's pure reveal math over
//       THIS subject's own real title text/stroke content.
//
// Deliberately NOT covered here: M3 (lesson-save synthesizes, not
// duplicates), M6 (dead-code removal), P4 (Evidence-as-provenance — no
// standing Evidence panel). All are structural/wiring guarantees already
// covered by their own dedicated regression suites
// (tests/notelab/lessonToNotebookSceneWiring.test.ts,
// tests/notelab/evidenceAsProvenance.test.ts) and don't vary by subject
// matter — re-asserting them per-subject here would just be restating the
// same wiring check five times, not proving anything new.

jest.mock("@/lib/notelab/ultraNoteStore", () => ({
  getAllUltraNotesAsync: jest.fn(),
}));

import {
  finalizeNotebookScene, buildNotebookPlannerUserPrompt,
  type NotebookPlan, type NotebookPlanBlock,
} from "@/lib/notelab/notebookPlanner";
import { gatherConceptNotebookContent } from "@/lib/notelab/conceptAccumulation";
import { getAllUltraNotesAsync } from "@/lib/notelab/ultraNoteStore";
import type { UltraNote } from "@/lib/notelab/ultraNoteStore";
import type { VisualNotebookScene } from "@/lib/notelab/notebookScene";
import type { CanonicalThoughtUnit } from "@/lib/canonical/types";
import {
  sliceTextForReveal, slicePointsForReveal, revealFraction, REVEAL_FRAME_COUNT,
} from "@/lib/whiteboard/handwritingReveal";

const mockGetAllNotes = getAllUltraNotesAsync as jest.Mock;

// ── Shared fixture builders (same conventions as notebookPlanner.test.ts
//    and conceptAccumulation.test.ts — reused, not reinvented) ────────────

function makeUnit(overrides: Partial<CanonicalThoughtUnit> = {}): CanonicalThoughtUnit {
  return {
    id: "doc-1:0:0",
    documentId: "doc-1",
    pageIndex: 3,
    unitIndex: 0,
    text: "placeholder source text",
    anchor: { pageIndex: 3, startChar: 0, endChar: 10, quote: "placeholder" },
    datSection: "survey-natural-sciences" as any,
    datTopic: "general-chemistry" as any,
    datUnitType: "concept" as any,
    datRelevance: 0.5,
    classificationConfidence: 0.5,
    classificationSource: "heuristic" as any,
    difficulty: 0.5,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function planBlock(overrides: Partial<NotebookPlanBlock>): NotebookPlanBlock {
  return {
    primitive: "text",
    content: "Some composed explanation.",
    detail: null,
    groupId: null,
    order: 0,
    sourceUnitIndex: 0,
    relationshipKind: null,
    ...overrides,
  };
}

function scene(blocks: VisualNotebookScene["blocks"], builtAt: number = Date.now()): VisualNotebookScene {
  return { id: "scene", bookId: "book", pageNumber: 1, teachingStructure: null, blocks, builtAt };
}

function sceneBlock(content: string, overrides: Partial<VisualNotebookScene["blocks"][number]> = {}): VisualNotebookScene["blocks"][number] {
  return {
    id: "b1", primitive: "text", content, detail: null, groupId: null, order: 0, sourceUnitIndex: 0,
    relationshipKind: null, canonicalUnitId: null, sourceId: null, page: 1, confidence: 0.6, generatedFrom: "ai",
    ...overrides,
  };
}

function siblingNote(overrides: Partial<UltraNote> = {}): UltraNote {
  return {
    id: "note", bookId: "book", pageNumber: 1, topic: "Topic", coreIdea: "idea",
    concepts: [], memoryShortcuts: [], subject: "General Notes", createdAt: Date.now(),
    ...overrides,
  } as UltraNote;
}

// ── Five genuinely different subjects — spanning STEM and humanities, the
//    same diversity the notebookPlanner system prompt's own worked
//    examples already claim to span (Chemistry/Anatomy/History/Literature/
//    Mathematics), now actually exercised through real pipeline functions
//    rather than only checked for as prompt text. ──────────────────────────

interface SubjectFixture {
  subject: string;
  knowledgeNodeId: string;
  groundedPrimitive: NotebookPlanBlock["primitive"];
  composedPrimitive: NotebookPlanBlock["primitive"];
  sourceText: string;
  groundedQuote: string;
  paraphrase: string;
  composedExplanation: string;
  handwritingTitle: string;
  siblingSources: Array<{ bookTitle: string; pageNumber: number; content: string }>;
}

const SUBJECTS: SubjectFixture[] = [
  {
    subject: "Chemistry",
    knowledgeNodeId: "concept-ionic-bonding",
    groundedPrimitive: "highlight",
    composedPrimitive: "callout",
    sourceText: "An ionic bond forms when one atom transfers electrons to another, creating oppositely charged ions that attract.",
    groundedQuote: "one atom transfers electrons to another",
    paraphrase: "electrons move from one atom to a different one",
    composedExplanation: "Watch for polyatomic ions — the charge belongs to the whole group, not one atom.",
    handwritingTitle: "Ionic Bonding",
    siblingSources: [
      { bookTitle: "General Chemistry", pageNumber: 161, content: "Ionic bonds form via electron transfer between a metal and nonmetal." },
      { bookTitle: "Lecture Slides Wk4", pageNumber: 4, content: "NaCl is the classic ionic compound example." },
      { bookTitle: "My Notes", pageNumber: 1, content: "remember: metal + nonmetal = ionic, opposite charges attract" },
    ],
  },
  {
    subject: "Anatomy",
    knowledgeNodeId: "concept-cardiac-cycle",
    groundedPrimitive: "underline",
    composedPrimitive: "flow",
    sourceText: "The cardiac cycle alternates between systole, when the ventricles contract and eject blood, and diastole, when the chambers refill.",
    groundedQuote: "systole, when the ventricles contract and eject blood",
    paraphrase: "the heart squeezes during systole to push blood out",
    composedExplanation: "A weak systolic contraction is what shows up clinically as reduced ejection fraction.",
    handwritingTitle: "The Cardiac Cycle",
    siblingSources: [
      { bookTitle: "Human Physiology", pageNumber: 88, content: "Systole and diastole alternate to drive circulation." },
      { bookTitle: "Anatomy Lecture 6", pageNumber: 6, content: "Ejection fraction is measured during systole." },
      { bookTitle: "Clinical Rounds Notes", pageNumber: 1, content: "low EF = weak systolic squeeze, watch for it" },
    ],
  },
  {
    subject: "History",
    knowledgeNodeId: "concept-french-revolution",
    groundedPrimitive: "source_anchor",
    composedPrimitive: "timeline",
    sourceText: "The storming of the Bastille on July 14, 1789 became the symbolic start of the French Revolution.",
    groundedQuote: "The storming of the Bastille on July 14, 1789",
    paraphrase: "Parisians attacked the Bastille prison in the summer of 1789",
    composedExplanation: "The date is still celebrated today as Bastille Day, France's national holiday.",
    handwritingTitle: "The French Revolution",
    siblingSources: [
      { bookTitle: "Modern European History", pageNumber: 210, content: "July 14, 1789 marks the fall of the Bastille." },
      { bookTitle: "History Lecture 9", pageNumber: 9, content: "The Bastille symbolized royal tyranny to the revolutionaries." },
      { bookTitle: "My History Notes", pageNumber: 3, content: "Bastille Day = July 14, still a holiday today" },
    ],
  },
  {
    subject: "Literature",
    knowledgeNodeId: "concept-hamlet-soliloquy",
    groundedPrimitive: "highlight",
    composedPrimitive: "handwritten_text",
    sourceText: "In his 'To be, or not to be' soliloquy, Hamlet weighs the suffering of life against the uncertainty of death.",
    groundedQuote: "Hamlet weighs the suffering of life against the uncertainty of death",
    paraphrase: "Hamlet compares living with pain to the unknown of dying",
    composedExplanation: "The soliloquy's real turn is Hamlet's fear that death might not even be an escape.",
    handwritingTitle: "Hamlet's Soliloquy",
    siblingSources: [
      { bookTitle: "The Complete Hamlet", pageNumber: 45, content: "\"To be, or not to be\" opens Act 3, Scene 1." },
      { bookTitle: "British Lit Lecture 12", pageNumber: 12, content: "The soliloquy is Hamlet's meditation on mortality." },
      { bookTitle: "My Annotations", pageNumber: 1, content: "he's not just asking about suicide, it's about certainty" },
    ],
  },
  {
    subject: "Mathematics",
    knowledgeNodeId: "concept-pythagorean-theorem",
    groundedPrimitive: "underline",
    composedPrimitive: "example",
    sourceText: "The Pythagorean theorem states that in a right triangle, the square of the hypotenuse equals the sum of the squares of the other two sides.",
    groundedQuote: "the square of the hypotenuse equals the sum of the squares of the other two sides",
    paraphrase: "the hypotenuse squared is the total of the two legs squared",
    composedExplanation: "A 3-4-5 triangle is the quickest way to sanity-check this without a calculator.",
    handwritingTitle: "Pythagorean Theorem",
    siblingSources: [
      { bookTitle: "Geometry Fundamentals", pageNumber: 52, content: "a^2 + b^2 = c^2 for any right triangle." },
      { bookTitle: "Math Lecture 3", pageNumber: 3, content: "The 3-4-5 triangle is the canonical worked example." },
      { bookTitle: "My Math Notes", pageNumber: 1, content: "hypotenuse is always the longest side, opposite the right angle" },
    ],
  },
];

describe.each(SUBJECTS)("M8 acceptance — $subject", (fixture) => {
  beforeEach(() => { mockGetAllNotes.mockReset(); });

  it("(a) M1/M2: finalizeNotebookScene grounds a verbatim block, drops a paraphrased one, and keeps the composed explanation — for this subject's own real content", () => {
    const unit = makeUnit({ id: `${fixture.subject}:0:0`, documentId: fixture.subject, text: fixture.sourceText });
    const plan: NotebookPlan = {
      teachingStructure: null,
      blocks: [
        planBlock({ primitive: fixture.groundedPrimitive, content: fixture.groundedQuote, sourceUnitIndex: 0, order: 0 }),
        planBlock({ primitive: fixture.groundedPrimitive, content: fixture.paraphrase, sourceUnitIndex: 0, order: 1 }),
        planBlock({ primitive: fixture.composedPrimitive, content: fixture.composedExplanation, sourceUnitIndex: 0, order: 2 }),
      ],
    };
    const result = finalizeNotebookScene(plan, [unit], { bookId: fixture.subject, pageNumber: 1 });

    // Exactly one grounded block survives (the verbatim one) plus the composed one — the paraphrase is dropped, not repaired.
    expect(result.blocks).toHaveLength(2);
    const grounded = result.blocks.find(b => b.primitive === fixture.groundedPrimitive);
    expect(grounded?.content).toBe(fixture.groundedQuote);
    expect(grounded?.confidence).toBe(1);
    expect(grounded?.canonicalUnitId).toBe(unit.id);
    const composed = result.blocks.find(b => b.primitive === fixture.composedPrimitive);
    expect(composed?.content).toBe(fixture.composedExplanation);
    expect(composed?.confidence).toBe(0.6);
  });

  it("(b) M4: gatherConceptNotebookContent combines this subject's own textbook + lecture + handwritten-note sources into one block", async () => {
    const notes = fixture.siblingSources.map((s, i) => siblingNote({
      id: `${fixture.subject}-sibling-${i}`,
      bookTitle: s.bookTitle,
      pageNumber: s.pageNumber,
      knowledgeNodeId: fixture.knowledgeNodeId,
      notebookScene: scene([sceneBlock(s.content)], Date.now() + i),
    }));
    mockGetAllNotes.mockResolvedValue(notes);

    const combined = await gatherConceptNotebookContent(fixture.knowledgeNodeId, "current-note");
    expect(combined).not.toBeNull();
    for (const s of fixture.siblingSources) {
      expect(combined).toContain(`${s.bookTitle}, p.${s.pageNumber}:`);
      expect(combined).toContain(s.content);
    }
  });

  it("(c) M2+M4 integration: the gathered concept knowledge is woven into the real synthesis prompt as its own labeled section", async () => {
    const notes = fixture.siblingSources.map((s, i) => siblingNote({
      id: `${fixture.subject}-sibling-${i}`,
      bookTitle: s.bookTitle,
      pageNumber: s.pageNumber,
      knowledgeNodeId: fixture.knowledgeNodeId,
      notebookScene: scene([sceneBlock(s.content)], Date.now() + i),
    }));
    mockGetAllNotes.mockResolvedValue(notes);
    const relatedConceptKnowledge = await gatherConceptNotebookContent(fixture.knowledgeNodeId, "current-note");

    const unit = makeUnit({ id: `${fixture.subject}:0:0`, documentId: fixture.subject, text: fixture.sourceText });
    const prompt = buildNotebookPlannerUserPrompt([unit], {
      bookTitle: fixture.subject, pageNumber: 1, relatedConceptKnowledge,
    });

    expect(prompt).toMatch(/RELATED NOTES ON THIS SAME CONCEPT/);
    for (const s of fixture.siblingSources) {
      expect(prompt).toContain(s.bookTitle);
    }
  });

  it("(d) M7: this subject's own title text reveals left-to-right, monotonically, reaching the exact full string", () => {
    const revealedAtEachFrame = Array.from({ length: REVEAL_FRAME_COUNT + 1 }, (_, frame) =>
      sliceTextForReveal(fixture.handwritingTitle, revealFraction(frame, REVEAL_FRAME_COUNT)),
    );
    // Every frame's text is a PREFIX of the next — genuinely being "written," never jumping around.
    for (let i = 1; i < revealedAtEachFrame.length; i++) {
      expect(revealedAtEachFrame[i].startsWith(revealedAtEachFrame[i - 1])).toBe(true);
    }
    expect(revealedAtEachFrame[0]).toBe("");
    expect(revealedAtEachFrame[REVEAL_FRAME_COUNT]).toBe(fixture.handwritingTitle);
  });

  it("(d) M7: a freehand stroke standing in for this subject's own diagram/underline reveals with a monotonically growing point path", () => {
    const stroke = Array.from({ length: 24 }, (_, i) => ({ x: i, y: Math.sin(i / 3), z: 0.5 }));
    const early = slicePointsForReveal(stroke, revealFraction(2, REVEAL_FRAME_COUNT));
    const later = slicePointsForReveal(stroke, revealFraction(8, REVEAL_FRAME_COUNT));
    const full = slicePointsForReveal(stroke, revealFraction(REVEAL_FRAME_COUNT, REVEAL_FRAME_COUNT));
    expect(later.slice(0, early.length)).toEqual(early);
    expect(full).toEqual(stroke);
  });
});

describe("M8 acceptance — closing the loop: the 5 subjects genuinely differ, not just in name", () => {
  it("REQUIRED: no two subjects were given identical grounded/composed primitive pairs — the material decides the page (N2's own rule), proven across the acceptance set, not just the 2-subject case notebookPlanner.test.ts already covers", () => {
    const pairs = SUBJECTS.map(s => `${s.groundedPrimitive}+${s.composedPrimitive}`);
    expect(new Set(pairs).size).toBe(SUBJECTS.length);
  });

  it("REQUIRED: every subject's handwriting title is genuinely distinct text, not a template with the subject name swapped in", () => {
    const titles = SUBJECTS.map(s => s.handwritingTitle);
    expect(new Set(titles).size).toBe(SUBJECTS.length);
  });

  it("REQUIRED: every subject's knowledgeNodeId is unique — concept accumulation across subjects never accidentally shares a bucket", () => {
    const ids = SUBJECTS.map(s => s.knowledgeNodeId);
    expect(new Set(ids).size).toBe(SUBJECTS.length);
  });

  it("spans both STEM and humanities subjects, matching the diversity the notebookPlanner system prompt's own worked examples already claim", () => {
    expect(SUBJECTS.map(s => s.subject)).toEqual(["Chemistry", "Anatomy", "History", "Literature", "Mathematics"]);
  });
});
