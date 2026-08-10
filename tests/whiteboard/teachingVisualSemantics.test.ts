import {
  colorForRelationship,
  colorForTeachingRole,
  RELATIONSHIP_COLOR,
  TEACHING_ROLE_COLOR,
} from "../../lib/whiteboard/teachingVisualSemantics";

describe("Professor Whiteboard semantic visual language", () => {
  it("maps every teaching role to one stable tldraw color", () => {
    for (const [role, color] of Object.entries(TEACHING_ROLE_COLOR)) {
      expect(colorForTeachingRole(role as keyof typeof TEACHING_ROLE_COLOR)).toBe(color);
    }
    expect(colorForTeachingRole(undefined)).toBeNull();
  });

  it("keeps mechanism, consequence, application, and warning visually distinct", () => {
    const colors = ["mechanism", "consequence", "application", "warning"]
      .map(role => TEACHING_ROLE_COLOR[role as keyof typeof TEACHING_ROLE_COLOR]);
    expect(new Set(colors).size).toBe(colors.length);
  });

  it("uses causal, contrast, and warning connector colors consistently", () => {
    expect(colorForRelationship("causes")).toBe(RELATIONSHIP_COLOR["leads-to"]);
    expect(colorForRelationship("contrasts")).toBe("red");
    expect(colorForRelationship("warns-about")).toBe("red");
    expect(colorForRelationship(undefined)).toBeNull();
  });
});
