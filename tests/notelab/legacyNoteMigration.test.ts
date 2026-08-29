import { getCanonicalNotebookSections, type UltraNote } from "../../lib/notelab/ultraNoteStore";

function legacyEndoNote(): UltraNote {
  return {
    id: "note-endo-p12",
    bookId: "endo-book",
    bookTitle: "Pathways of the Pulp",
    pageNumber: 12,
    topic: "Working length",
    coreIdea: "Working length controls where instrumentation and obturation terminate.",
    pageThesis: "Working length should respect the apical constriction.",
    subject: "Dental / Clinical",
    createdAt: 1,
    studentNotes: "My instructor prefers confirming with an apex locator and radiograph.",
    memoryShortcuts: ["Constriction, not radiographic apex."],
    miniTest: ["Why can the radiographic apex mislead working-length selection?"],
    concepts: [{
      ordinal: 1,
      title: "Apical constriction",
      pattern: "The narrowest apical portion of the canal.",
      surgicalReason: "It is the preferred biologic termination landmark.",
      trap: "Do not automatically terminate at the radiographic apex.",
      rule: "Corroborate electronic and radiographic findings.",
    }],
    sections: [
      { label: "Chief Concern / Problem", content: "Where should canal preparation terminate?" },
      { label: "Why This Matters Clinically", content: "Over-instrumentation can injure apical tissues." },
      { label: "Procedure Logic", content: "Establish patency, use the apex locator, then confirm." },
      { label: "Danger Zone", content: "A distorted radiograph can shift the apparent apex." },
      { label: "Memory Hook", content: "Stop at the constriction." },
      { label: "Source", content: "Pathways of the Pulp · PDF page 12" },
    ],
  };
}

describe("legacy NoteLab migration", () => {
  it("recomposes old dental cards into the canonical notebook without changing the saved record", () => {
    const note = legacyEndoNote();
    const before = JSON.stringify(note);
    const sections = getCanonicalNotebookSections(note);
    const labels = sections.map((section) => section.label);

    expect(labels).toEqual(expect.arrayContaining([
      "Big Idea",
      "Key Facts / Clinical Pearls",
      "Mechanism / Process",
      "Clinical / Application Connection",
      "Common Mistakes / Clinical Risks",
      "Memory Trick",
      "Exam-Important Concepts",
      "Recall Questions",
    ]));
    expect(labels).not.toEqual(expect.arrayContaining([
      "Chief Concern / Problem",
      "Why This Matters Clinically",
      "Procedure Logic",
      "Danger Zone",
      "Memory Hook",
      "Source",
    ]));
    expect(JSON.stringify(note)).toBe(before);
    expect(note.studentNotes).toContain("apex locator");
  });

  it("merges duplicate legacy concepts instead of losing content", () => {
    const sections = getCanonicalNotebookSections(legacyEndoNote());
    const risks = sections.find((section) => section.label === "Common Mistakes / Clinical Risks")?.content ?? "";

    expect(risks).toContain("distorted radiograph");
    expect(risks).toContain("radiographic apex");
  });
});
