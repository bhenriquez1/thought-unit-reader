// lib/highlights/limitAnnotationDensity.ts
// Deterministic post-filter that caps how many annotations render on a page —
// the difference between "expert marginalia" and "diagnostic overlay." The
// prompt (pages/api/page-annotation-plan.ts) already asks the model for fewer,
// well-chosen annotations, but prompt compliance alone isn't reliable enough to
// guarantee density on its own, so this runs as a hard rule after grounding,
// before anything is drawn or fed to the Whiteboard.
//
// Runs on GroundedSurgeonAnnotation[] (post lib/highlights/groundSurgeonQuotes.ts
// — i.e. only quotes that already survived verification against the live PDF
// text layer). Never adds or rewrites content, only selects a subset.

import type { GroundedSurgeonAnnotation } from "./groundSurgeonQuotes";
import type { CanonicalType, Importance } from "../insights/pageAnnotationPlan";

const IMPORTANCE_RANK: Record<Importance, number> = { critical: 0, high: 1, supporting: 2 };

// Base per-category caps — everything except mechanism/procedure, which have a
// combined single slot (see below) rather than independent caps. These are the
// defaults for a page whose pageRole doesn't warrant a different budget; see
// PAGE_ROLE_CAP_OVERRIDES below for page-type-adaptive budgets.
const BASE_CATEGORY_CAPS: Partial<Record<CanonicalType, number>> = {
  definition:         3, // 1 "page thesis" + up to 2 "core rules"
  trap:               1,
  supportingEvidence: 1, // the "example" slot
  decision:           1,
  comparison:         1,
  clinicalPearl:      1,
};

// Page-type-adaptive budget: a page's own pageRole classification (the SAME
// classifier SurgeonAnnotationPlan already produces per page — see
// lib/insights/pageAnnotationPlan.ts) raises the cap for the category that
// classification is actually ABOUT, instead of every page getting the same
// one-size-fits-all budget. A comparison page inherently discusses 2+ compared
// items (one comparisonBracket annotation per pairing is too few at cap 1); a
// worked-example page has several worked steps each worth its own supporting-
// evidence mark; a definition/classification page (a glossary-style page) can
// carry more distinct terms than a page where one definition supports other
// content. Only OVERRIDES the specific category(ies) that page type is about —
// every other category keeps its base cap, so e.g. a comparison page still
// only gets one trap and one clinical pearl unless the page also earns them.
const PAGE_ROLE_CAP_OVERRIDES: Partial<Record<string, Partial<Record<CanonicalType, number>>>> = {
  comparison:                 { comparison: 3 },
  example:                    { supportingEvidence: 3 },
  definition:                 { definition: 4 },
  classification:             { definition: 4, comparison: 2 },
  "decision-tree":            { decision: 3 },
  workflow:                   { decision: 2 },
  diagnosis:                  { decision: 2, clinicalPearl: 2 },
  pharmacology:               { clinicalPearl: 2, trap: 2 },
};

function categoryCapsForPageRole(pageRole: string | null | undefined): Partial<Record<CanonicalType, number>> {
  if (!pageRole) return BASE_CATEGORY_CAPS;
  const overrides = PAGE_ROLE_CAP_OVERRIDES[pageRole];
  return overrides ? { ...BASE_CATEGORY_CAPS, ...overrides } : BASE_CATEGORY_CAPS;
}

// Hard backstop applied after per-category selection — per-category caps alone
// can't stop a page that hits several categories at once from still landing at
// too many total annotations. Target range for a genuinely dense page is
// 5-8 annotations (2-3 primary concepts, 2-4 structural/relationship spans,
// 1-2 traps or clinical-significance points) — 8, not 7, so a page that
// legitimately earns definition + mechanism-or-procedure + comparison +
// decision + trap + clinicalPearl + supportingEvidence (7 distinct
// categories) isn't clipped to 7 before it even reaches its own ceiling.
const GLOBAL_CAP = 8;

// A dense procedural/protocol/decision-branching page is a genuinely
// different shape of content: the sequence itself (each step, each branch)
// IS the page's substance, not one of several competing concepts sharing an
// 8-slot budget with definitions/traps/pearls. A chapter-opener/definition
// page deserves few, well-chosen annotations; a clinical checklist or
// branching decision tree deserves many more, because under-annotating THAT
// page silently drops steps a student needs to see. Only these specific
// pageRoles get the wider ceiling — every other page keeps the standard
// "expert marginalia, not a diagnostic overlay" budget.
const GLOBAL_CAP_OVERRIDES: Partial<Record<string, number>> = {
  procedure:       15,
  workflow:        15,
  "decision-tree": 15,
};

function globalCapForPageRole(pageRole: string | null | undefined): number {
  return (pageRole ? GLOBAL_CAP_OVERRIDES[pageRole] : undefined) ?? GLOBAL_CAP;
}

interface IndexedEntry {
  item: GroundedSurgeonAnnotation;
  index: number;
}

function byImportanceThenOriginalOrder(entries: IndexedEntry[]): IndexedEntry[] {
  return [...entries].sort((a, b) => {
    const rankDiff = IMPORTANCE_RANK[a.item.importance] - IMPORTANCE_RANK[b.item.importance];
    return rankDiff !== 0 ? rankDiff : a.index - b.index;
  });
}

function bestImportanceRank(entries: IndexedEntry[]): number {
  return Math.min(...entries.map(e => IMPORTANCE_RANK[e.item.importance]));
}

function earliestIndex(entries: IndexedEntry[]): number {
  return Math.min(...entries.map(e => e.index));
}

// Pages whose OWN classification is fundamentally about a multi-step process
// get two mechanism/procedure slots instead of one — a procedure page routinely
// has both a numbered sequence AND the mechanism it accomplishes, and clipping
// to one silently drops half the page's actual content. procedure/workflow/
// decision-tree pages get a higher ceiling than mechanism-only pages: a dense
// clinical checklist or branching protocol page often legitimately contains
// SEVERAL distinct numbered sequences (e.g. three different treatment
// protocols being laid out), not just one mechanism plus one procedure — see
// selectMechanismOrProcedure's cap-vs-procedureSlots split below.
const MECHANISM_PROCEDURE_CAP_OVERRIDES: Partial<Record<string, number>> = {
  // procedure gets (cap - 1) slots below — deliberately close to the raised
  // 15-item GLOBAL_CAP_OVERRIDES ceiling for these SAME three pageRoles, so a
  // genuinely dense checklist/workflow/branching-decision page isn't
  // bottlenecked by a small procedure-specific sub-cap once it's already
  // earned the wider page-level budget.
  procedure:                    13,
  workflow:                     13,
  "decision-tree":               13,
  mechanism:                    2,
  "organic-chemistry-reaction": 2,
  "mathematical-derivation":    2,
};

/**
 * mechanism and procedure share ONE slot by default (not one each) — "one
 * mechanism or procedure" per the density rule — unless the page's own
 * pageRole is itself about a multi-step process (see
 * MECHANISM_PROCEDURE_CAP_OVERRIDES above), in which case mechanism keeps its
 * single top pick (multiple competing "mechanism" annotations for one page is
 * rarely correct even on a mechanism-heavy page) while procedure gets the
 * REMAINING slots (cap - 1) — a dense procedural/workflow/decision-tree page
 * can legitimately carry several distinct numbered sequences. Ties within a
 * slot are broken by higher importance within the tied group, then by
 * whichever group's earliest annotation appeared first in the original plan.
 */
function selectMechanismOrProcedure(
  byType: Map<CanonicalType, IndexedEntry[]>,
  pageRole: string | null | undefined,
): IndexedEntry[] {
  const mechanism = byType.get("mechanism") ?? [];
  const procedure = byType.get("procedure") ?? [];
  if (mechanism.length === 0 && procedure.length === 0) return [];

  const cap = (pageRole ? MECHANISM_PROCEDURE_CAP_OVERRIDES[pageRole] : undefined) ?? 1;
  if (cap >= 2) {
    // Both types get their own slot(s) — no "winner take all" contest.
    return [
      ...byImportanceThenOriginalOrder(mechanism).slice(0, 1),
      ...byImportanceThenOriginalOrder(procedure).slice(0, cap - 1),
    ];
  }

  let winner: IndexedEntry[];
  if (mechanism.length !== procedure.length) {
    winner = mechanism.length > procedure.length ? mechanism : procedure;
  } else {
    const mechRank = bestImportanceRank(mechanism);
    const procRank = bestImportanceRank(procedure);
    if (mechRank !== procRank) {
      winner = mechRank < procRank ? mechanism : procedure; // lower rank = higher importance
    } else {
      winner = earliestIndex(mechanism) <= earliestIndex(procedure) ? mechanism : procedure;
    }
  }
  return byImportanceThenOriginalOrder(winner).slice(0, 1);
}

export function limitAnnotationDensity(
  grounded: GroundedSurgeonAnnotation[],
  pageRole?: string | string[] | null,
): GroundedSurgeonAnnotation[] {
  if (grounded.length === 0) return [];

  // v7 page-adaptive path. Multi-role plans are coverage-first: preserve
  // every grounded critical/high instructional unit, remove exact duplicates,
  // and use role-specific safety ceilings only as a final readability guard.
  // Older single-role callers retain the compatibility behavior below.
  if (Array.isArray(pageRole)) {
    const roles = new Set(pageRole);
    const dense = roles.has("procedure-sequence") || roles.has("clinical-diagnostic");
    const mixed = roles.has("mixed") || roles.size > 1;
    const simple = roles.size === 1 && (roles.has("definition-heavy") || roles.has("narrative-history"));
    const ceiling = dense ? 15 : mixed ? 12 : simple ? 4 : 10;
    const seen = new Set<string>();
    const deduped = grounded.filter(item => {
      const key = item.groundedText.toLowerCase().replace(/\s+/g, " ").trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const essential = deduped.filter(item => item.importance !== "supporting");
    const supporting = deduped.filter(item => item.importance === "supporting");
    const selected = essential.length >= ceiling
      ? essential
      : [...essential, ...supporting.slice(0, ceiling - essential.length)];
    return selected.sort((a, b) => deduped.indexOf(a) - deduped.indexOf(b));
  }

  const indexed: IndexedEntry[] = grounded.map((item, index) => ({ item, index }));

  const byType = new Map<CanonicalType, IndexedEntry[]>();
  for (const entry of indexed) {
    const bucket = byType.get(entry.item.canonicalType) ?? [];
    bucket.push(entry);
    byType.set(entry.item.canonicalType, bucket);
  }

  const selected: IndexedEntry[] = [];
  const categoryCaps = categoryCapsForPageRole(pageRole);

  for (const [type, cap] of Object.entries(categoryCaps) as Array<[CanonicalType, number]>) {
    const entries = byType.get(type);
    if (!entries?.length) continue;
    selected.push(...byImportanceThenOriginalOrder(entries).slice(0, cap));
  }

  selected.push(...selectMechanismOrProcedure(byType, pageRole));

  // Global backstop: rank ALL per-category survivors by importance, cap at
  // the page-role-adaptive ceiling, then restore original relative order for
  // the final output.
  const globallyCapped = byImportanceThenOriginalOrder(selected).slice(0, globalCapForPageRole(pageRole));
  const finalOrder = [...globallyCapped].sort((a, b) => a.index - b.index);

  return finalOrder.map(e => e.item);
}
