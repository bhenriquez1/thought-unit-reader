// tests/chiefResident/chiefResidentAgent.test.ts
// CR1 — real function-call tests for the Chief Resident Agent's pure
// decision core: parsing/validating the model's optional trailing
// delegation directive, and the once-per-target-per-session offer gate.

import {
  resolveChiefResidentTurn,
  shouldOfferDelegation,
  CHIEF_RESIDENT_DELEGATION_DIRECTIVE_INSTRUCTIONS,
  type ChiefResidentDelegationTarget,
} from "../../lib/chiefResident/chiefResidentAgent";

describe("resolveChiefResidentTurn — no directive present", () => {
  it("returns the text unchanged and delegation: null when there is no trailing directive", () => {
    const result = resolveChiefResidentTurn("Let's slow down here. Glycolysis converts glucose to pyruvate.\n\nWhy does this matter?");
    expect(result.delegation).toBeNull();
    expect(result.visibleText).toBe("Let's slow down here. Glycolysis converts glucose to pyruvate.\n\nWhy does this matter?");
  });

  it("mentioning the directive syntax mid-explanation (not trailing) is not treated as a real decision", () => {
    const text = "The [[DELEGATE: NOTELAB | example]] syntax is just something I mentioned, not at the end.\n\nMore explanation follows this.";
    const result = resolveChiefResidentTurn(text);
    expect(result.delegation).toBeNull();
    expect(result.visibleText).toBe(text);
  });
});

describe("resolveChiefResidentTurn — valid directives", () => {
  it("parses a trailing NOTELAB directive and strips it from the visible text", () => {
    const result = resolveChiefResidentTurn(
      "Great — you've got the mechanism down.\n[[DELEGATE: NOTELAB | Build a permanent notebook page for this mechanism]]"
    );
    expect(result.visibleText).toBe("Great — you've got the mechanism down.");
    expect(result.delegation).toEqual({ target: "notelab", reason: "Build a permanent notebook page for this mechanism" });
  });

  it("parses a trailing WHITEBOARD directive and strips it from the visible text", () => {
    const result = resolveChiefResidentTurn(
      "This is easier to see than to describe.\n[[DELEGATE: WHITEBOARD | Draw the electron transport chain step by step]]"
    );
    expect(result.visibleText).toBe("This is easier to see than to describe.");
    expect(result.delegation).toEqual({ target: "whiteboard", reason: "Draw the electron transport chain step by step" });
  });

  it("is case-insensitive on both the DELEGATE keyword and the target", () => {
    const result = resolveChiefResidentTurn("Some teaching text.\n[[delegate: notelab | lowercase should still work]]");
    expect(result.delegation).toEqual({ target: "notelab", reason: "lowercase should still work" });
  });

  it("tolerates trailing whitespace/newlines after the directive", () => {
    const result = resolveChiefResidentTurn("Text here.\n[[DELEGATE: NOTELAB | reason]]  \n  ");
    expect(result.delegation).toEqual({ target: "notelab", reason: "reason" });
    expect(result.visibleText).toBe("Text here.");
  });
});

describe("resolveChiefResidentTurn — malformed directives fail closed", () => {
  it("an unrecognized target yields delegation: null but still strips the line", () => {
    const result = resolveChiefResidentTurn("Teaching text.\n[[DELEGATE: RECALLLAB | some reason]]");
    expect(result.delegation).toBeNull();
    expect(result.visibleText).toBe("Teaching text.");
  });

  it("an empty reason yields delegation: null but still strips the line", () => {
    const result = resolveChiefResidentTurn("Teaching text.\n[[DELEGATE: NOTELAB |    ]]");
    expect(result.delegation).toBeNull();
    expect(result.visibleText).toBe("Teaching text.");
  });
});

describe("shouldOfferDelegation — once-per-target-per-session gate", () => {
  it("returns true when the target has never been offered", () => {
    const offered = new Set<ChiefResidentDelegationTarget>();
    expect(shouldOfferDelegation("notelab", offered)).toBe(true);
  });

  it("returns false once that exact target has already been offered", () => {
    const offered = new Set<ChiefResidentDelegationTarget>(["notelab"]);
    expect(shouldOfferDelegation("notelab", offered)).toBe(false);
  });

  it("a different target is unaffected by another target already being offered", () => {
    const offered = new Set<ChiefResidentDelegationTarget>(["notelab"]);
    expect(shouldOfferDelegation("whiteboard", offered)).toBe(true);
  });
});

describe("CHIEF_RESIDENT_DELEGATION_DIRECTIVE_INSTRUCTIONS", () => {
  it("documents the exact directive grammar resolveChiefResidentTurn parses", () => {
    expect(CHIEF_RESIDENT_DELEGATION_DIRECTIVE_INSTRUCTIONS).toContain("[[DELEGATE: NOTELAB | one-sentence reason]]");
    expect(CHIEF_RESIDENT_DELEGATION_DIRECTIVE_INSTRUCTIONS).toContain("[[DELEGATE: WHITEBOARD | one-sentence reason]]");
  });
});
