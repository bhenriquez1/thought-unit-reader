import { professorCompletionBudget } from "../../pages/api/professor-lesson-plan";

describe("professorCompletionBudget", () => {
  it("gives a realistic six-node lesson enough room for structured JSON", () => {
    expect(professorCompletionBudget(6)).toBe(7_900);
  });

  it("uses a bounded minimum and maximum", () => {
    expect(professorCompletionBudget(0)).toBe(4_650);
    expect(professorCompletionBudget(Number.NaN)).toBe(4_650);
    expect(professorCompletionBudget(100)).toBe(9_000);
  });
});
