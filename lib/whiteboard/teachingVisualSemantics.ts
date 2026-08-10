import type { RelationshipKind, TeachingRole } from "./professorLessonPlan";

/**
 * Stable Professor-board visual language. These are tldraw color tokens,
 * deliberately keyed by pedagogical meaning rather than source importance.
 * A mechanism is violet on every page; an application is green on every
 * page; a warning is red on every page.
 */
export const TEACHING_ROLE_COLOR: Record<TeachingRole, string> = {
  definition: "blue",
  mechanism: "violet",
  consequence: "orange",
  application: "green",
  warning: "red",
  summary: "light-blue",
  reinforcement: "yellow",
  context: "grey",
};

export const RELATIONSHIP_COLOR: Record<RelationshipKind, string> = {
  supports: "blue",
  causes: "green",
  contrasts: "red",
  "leads-to": "green",
  "part-of": "violet",
  "warns-about": "red",
};

export function colorForTeachingRole(role: TeachingRole | undefined): string | null {
  return role ? TEACHING_ROLE_COLOR[role] : null;
}

export function colorForRelationship(kind: RelationshipKind | undefined): string | null {
  return kind ? RELATIONSHIP_COLOR[kind] : null;
}
