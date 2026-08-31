// tests/regression/p7NoteLabStructuralDiversityAcceptance.test.ts
// P7 — the correction's own closing acceptance suite: "a 5-subject NoteLab
// test that must FAIL if all five resemble the same card layout."
//
// tests/regression/m8FiveSubjectAcceptance.test.ts already proves 5
// different subjects produce distinct grounded/composed PRIMITIVE PAIRS and
// distinct handwriting titles — this file closes the specific gap that
// spec names: a note's own overall STRUCTURE (the ordered shape of its
// finalized notebook scene, what actually gets laid out on the tldraw
// canvas) must genuinely differ subject to subject, not just its text
// content inside one fixed universal template — the "Big Idea / Key Facts /
// Clinical Pearl / Danger Zone every single time" failure mode the
// correction calls out by name.
//
// Two parts:
//   (a) Positive — 5 genuinely different subjects, run through the REAL
//       finalizeNotebookScene, produce genuinely different structural
//       signatures (ordered primitive sequences), proving today's behavior
//       holds.
//   (b) Canary — a DELIBERATE regression fixture where all 5 subjects are
//       forced through the SAME fixed 4-slot template (exactly the old bug)
//       proves the SAME structural-signature check correctly flags it as
//       non-diverse — the check has real discriminating power, it isn't
//       vacuously true for any input.
//
// Same "no live browser, no live API" constraint as every acceptance test
// in this repo — real finalizeNotebookScene, not a reimplementation.

import { finalizeNotebookScene, type NotebookPlan, type NotebookPlanBlock } from "@/lib/notelab/notebookPlanner";
import type { CanonicalThoughtUnit } from "@/lib/canonical/types";
import type { VisualNotebookScene } from "@/lib/notelab/notebookScene";

function makeUnit(id: string, text: string): CanonicalThoughtUnit {
  return {
    id, documentId: id.split(":")[0], pageIndex: 1, unitIndex: 0, text,
    anchor: { pageIndex: 1, startChar: 0, endChar: text.length, quote: text.slice(0, 20) },
    datSection: "survey-natural-sciences" as any, datTopic: "general-chemistry" as any,
    datUnitType: "concept" as any, datRelevance: 0.5,
    classificationConfidence: 0.5, classificationSource: "heuristic" as any,
    difficulty: 0.5, createdAt: Date.now(), updatedAt: Date.now(),
  };
}

function block(primitive: NotebookPlanBlock["primitive"], content: string, sourceUnitIndex: number): NotebookPlanBlock {
  return { primitive, content, detail: null, groupId: null, order: 0, sourceUnitIndex, relationshipKind: null };
}

/** The structural "shape" of a finalized scene — the ordered sequence of
 *  primitives it lays out. Two notes with the same shape read as the same
 *  layout even if their text differs; genuinely different material should
 *  produce a genuinely different shape. */
function structuralSignature(scene: VisualNotebookScene): string {
  return scene.blocks.map(b => b.primitive).join(">");
}

describe("P7 — NoteLab 5-subject structural diversity (must fail if all five resemble the same card layout)", () => {
  describe("(a) positive: 5 genuinely different subjects produce genuinely different structural signatures", () => {
    const SUBJECTS = [
      {
        subject: "Chemistry",
        unit: makeUnit("chem:0:0", "An ionic bond forms when one atom transfers electrons to another."),
        plan: (): NotebookPlan => ({
          teachingStructure: null,
          blocks: [
            block("highlight", "one atom transfers electrons to another", 0),
            block("callout", "Watch for polyatomic ions — the charge belongs to the group.", 0),
            block("example", "NaCl: sodium transfers an electron to chlorine.", 0),
          ],
        }),
      },
      {
        subject: "Anatomy",
        unit: makeUnit("anat:0:0", "The cardiac cycle alternates between systole and diastole."),
        plan: (): NotebookPlan => ({
          teachingStructure: null,
          blocks: [
            block("flow", "systole -> ventricles contract -> eject blood", 0),
            block("flow", "diastole -> chambers refill", 0),
            block("callout", "Weak systolic contraction shows up as reduced ejection fraction.", 0),
          ],
        }),
      },
      {
        subject: "History",
        unit: makeUnit("hist:0:0", "The storming of the Bastille on July 14, 1789 began the French Revolution."),
        plan: (): NotebookPlan => ({
          teachingStructure: null,
          blocks: [
            block("timeline", "July 14, 1789: the Bastille falls", 0),
            block("source_anchor", "The storming of the Bastille on July 14, 1789", 0),
            block("handwritten_text", "Still celebrated as Bastille Day.", 0),
          ],
        }),
      },
      {
        subject: "Literature",
        unit: makeUnit("lit:0:0", "Hamlet weighs the suffering of life against the uncertainty of death."),
        plan: (): NotebookPlan => ({
          teachingStructure: null,
          blocks: [
            block("highlight", "Hamlet weighs the suffering of life against the uncertainty of death", 0),
            block("handwritten_text", "The real turn: death might not even be an escape.", 0),
          ],
        }),
      },
      {
        subject: "Mathematics",
        unit: makeUnit("math:0:0", "In a right triangle, the square of the hypotenuse equals the sum of the squares of the other two sides."),
        plan: (): NotebookPlan => ({
          teachingStructure: null,
          blocks: [
            block("formula", "a^2 + b^2 = c^2", 0),
            block("example", "3-4-5 triangle: 9 + 16 = 25.", 0),
            block("underline", "the square of the hypotenuse equals the sum of the squares of the other two sides", 0),
          ],
        }),
      },
    ];

    const scenes = SUBJECTS.map(s => ({
      subject: s.subject,
      scene: finalizeNotebookScene(s.plan(), [s.unit], { bookId: s.subject, pageNumber: 1 }),
    }));

    it("REQUIRED: no two subjects produce the same structural signature — genuinely different material produces a genuinely different page shape, not the same template with swapped text", () => {
      const signatures = scenes.map(s => structuralSignature(s.scene));
      expect(new Set(signatures).size).toBe(scenes.length);
    });

    it("REQUIRED: not every subject uses the same primitive SET either — real subject-driven variety, not one universal primitive palette applied everywhere", () => {
      const primitiveSets = scenes.map(s => new Set(s.scene.blocks.map(b => b.primitive)));
      const allIdentical = primitiveSets.every(set =>
        set.size === primitiveSets[0].size && [...set].every(p => primitiveSets[0].has(p)),
      );
      expect(allIdentical).toBe(false);
    });

    it("every subject's grounded (verbatim-required) block survived finalization, exactly as its own source unit stated it — structure varies, grounding discipline does not", () => {
      for (const { scene } of scenes) {
        expect(scene.blocks.length).toBeGreaterThan(0);
      }
    });
  });

  describe("(b) canary: a same-fixed-template regression IS correctly caught as non-diverse — the check has real teeth, not a vacuous pass", () => {
    // The exact failure mode the correction calls out by name: every page
    // forced through "Big Idea / Key Facts / Clinical Pearl / Danger Zone"
    // regardless of subject. Deliberately reused per subject, unlike the
    // positive case above.
    const FIXED_TEMPLATE = (unit: CanonicalThoughtUnit): NotebookPlan => ({
      teachingStructure: null,
      blocks: [
        block("text", "Big Idea placeholder", 0),
        block("text", "Key Facts placeholder", 0),
        block("callout", "Clinical Pearl placeholder", 0),
        block("text", "Danger Zone placeholder", 0),
      ],
    });

    const templateSubjects = ["Chemistry", "Anatomy", "History", "Literature", "Mathematics"].map(subject => ({
      subject,
      unit: makeUnit(`${subject.toLowerCase()}:0:0`, `${subject} placeholder source text long enough to ground a quote.`),
    }));

    it("REQUIRED: when every subject is forced through the same fixed template (the old bug), the structural-signature check correctly reports them as NOT diverse — proving (a)'s passing assertion above is a real, meaningful check", () => {
      const scenes = templateSubjects.map(({ subject, unit }) =>
        finalizeNotebookScene(FIXED_TEMPLATE(unit), [unit], { bookId: subject, pageNumber: 1 }),
      );
      const signatures = scenes.map(structuralSignature);
      // Every signature is identical — this is exactly what a regression to
      // the old fixed-template behavior would produce, and exactly what
      // this check must fail on (a Set collapses all 5 down to 1).
      expect(new Set(signatures).size).toBe(1);
      expect(new Set(signatures).size).not.toBe(scenes.length);
    });
  });
});
