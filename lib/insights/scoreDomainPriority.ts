// lib/insights/scoreDomainPriority.ts
// Unified domain-aware priority scorer.
// Routes to domain-specific logic and returns a common slot mapping
// (pattern / reason / trap / rule / support) so buildConceptFields
// can apply boosts without knowing which domain is active.

import type { PageDomain } from "./detectPageDomain";
import type { ClinicalPriorityCandidate } from "./scoreClinicalPriority";

export type DomainSlot = "pattern" | "reason" | "trap" | "rule" | "support";

export interface DomainPriorityScore {
  id: string;
  text: string;
  role: string;
  slot: DomainSlot;
  score: number;
}

export function scoreDomainPriority(
  candidates: ClinicalPriorityCandidate[],
  domain: PageDomain
): DomainPriorityScore[] {
  return candidates
    .map((c) => scoreOne(c, domain))
    .sort((a, b) => b.score - a.score);
}

function scoreOne(c: ClinicalPriorityCandidate, domain: PageDomain): DomainPriorityScore {
  const text = c.text ?? "";
  const lower = text.toLowerCase();
  let score = 0.2;
  let role = "support";
  let slot: DomainSlot = "support";

  // Domain-specific role assignment
  switch (domain) {
    case "clinical": {
      if (/\bchief complaint\b|\bpatient reports?\b|\bsymptom\b|\bfinding\b|\bdiagnosis\b|\bdefined as\b|\bcharacterized by\b/.test(lower)) {
        score += 0.32; role = "chief_signal"; slot = "pattern";
      } else if (/\bindicates?\b|\bsuggests?\b|\bimplies?\b|\breflects?\b|\bmeans?\b|\bconsistent with\b|\bcauses?\b|\bleads? to\b|\bresults? in\b/.test(lower)) {
        score += 0.24; role = "interpretation"; slot = "reason";
      } else if (/\bmust\b|\bshould\b|\brequires?\b|\bdifferentiate\b|\bdetermine\b|\bestablish\b/.test(lower)) {
        score += 0.28; role = "diagnostic_rule"; slot = "rule";
      } else if (/\btreatment\b|\bmanage\b|\bmanagement\b|\bintervention\b|\bnecessary\b|\bdecision\b/.test(lower)) {
        score += 0.18; role = "treatment_implication"; slot = "rule";
      }
      if (/\brather than\b|\bdo not\b|\bconfuse\b|\bmistake\b|\bunlike\b|\bin contrast\b|\bnot the same\b/.test(lower)) {
        score += 0.22; role = "trap"; slot = "trap";
      }
      break;
    }
    case "science": {
      // Named-substance examples must not outscore the conceptual rule they illustrate.
      // "Iodine is the trace element that..." defines iodine (an example), not the page topic.
      // "Water (H2O) is the most abundant compound..." is an observational fact, not a rule.
      // These would otherwise match the definition regex below and get a +0.32 boost.
      const isNamedSubstanceExample =
        /^[A-Z][a-z]{1,20}(?:\s+[A-Z][a-z]+)?\s+is (a|an|the) (trace|essential|major|minor|macro|micro|most abundant|only)?\s*(element|mineral|compound|ion|vitamin|electrolyte|metalloid|halogen|nutrient)\b/.test(text) ||
        /^[A-Z][a-z]{1,15}(?:\s*\([A-Za-z0-9₀-₉²³+\-]+\))?\s+is (the |a |an )?(most|least|only|found|abundant|present|common|mainly|primarily|widely|highly|extremely)\b/.test(text) ||
        /^[A-Z][a-z]{1,20}(?:\s+[A-Z][a-z]+)?\s+(deficiency|toxicity|poisoning|overdose|exposure)\b/.test(text);
      if (isNamedSubstanceExample) {
        score -= 0.08; role = "support"; slot = "support"; break;
      }
      if (/\bis defined as\b|\brefers? to\b|\bmeans?\b|\bis called\b|\bconsists? of\b|\bcharacterized by\b|\bis the \w+ of\b|\bis an? \w+ (that|which)\b/.test(lower)) {
        score += 0.32; role = "definition"; slot = "pattern";
      } else if (/\bleads? to\b|\bcauses?\b|\bresults? in\b|\bbecause\b|\btherefore\b|\bthus\b|\bconsequently\b/.test(lower)) {
        score += 0.28; role = "mechanism"; slot = "reason";
      } else if (/\bmust\b|\balways\b|\bdetermines?\b|\brequires?\b|\bgoverns?\b/.test(lower)) {
        score += 0.24; role = "rule"; slot = "rule";
      }
      if (/\bhowever\b|\bunlike\b|\bexcept\b|\bin contrast\b|\bdifferent from\b|\bdistinct from\b/.test(lower)) {
        score += 0.22; role = "exception"; slot = "trap";
      }
      break;
    }
    case "math": {
      // Math filler — "We indicate this by...", "In other words...", "Notice that..." etc.
      // These carry no mathematical content and must be suppressed before any other scoring.
      const isMathFiller = /^(we (indicate|say|note|see|observe|call|denote|write|have seen|recall that)|in other words,?|notice that\b|observe that\b|here we\b|it (is|can be) (shown|seen|noted)\b|this (gives|shows|yields)\b|recall (that|from)\b)/i.test(lower.trimStart());
      if (isMathFiller) {
        score -= 0.25; role = "filler"; slot = "support"; break;
      }

      // Convergence / limit definition language — highest priority on math pages.
      // "A sequence has a limit when its terms approach a fixed value" is the core idea.
      const isMathDefinition = /\b(is (called|defined as|said to be)|converges? (to|toward)|has (a |no )?limit\b|limit (exists?|does not exist)|does not converge\b|diverges?\b|approaches? (a |the )?(value|limit|number|zero|fixed)\b|sequence (converges?|has a|does not))\b/i.test(lower);
      const isMathFormula = /[=∫∂∑]|lim\b|d\/d[xt]|\bintegral\b|\bderivative\b|\btheorem\b/i.test(text)
        && /[a-zA-Z0-9]/.test(text.replace(/\s/g, ""));

      if (isMathDefinition) {
        score += 0.42; role = "definition"; slot = "pattern";
      } else if (isMathFormula) {
        score += 0.34; role = "formula"; slot = "pattern";
      } else if (/\bequals?\b|\brepresents?\b|\bthis means\b|\bwhere\b|\bdefined as\b|\binterpret\b/.test(lower)) {
        score += 0.24; role = "interpretation"; slot = "reason";
      } else if (/\bif\b.*\bthen\b|\bgiven that\b|\bprovided\b|\bfor all\b|\bwhenever\b/.test(lower)) {
        score += 0.22; role = "condition"; slot = "rule";
      }

      // Divergence / oscillation / non-existence — valuable contrast/trap content
      if (/\b(oscillates?\b|does not (exist|converge)\b|no limit\b|diverges?\b|alternates?\b|(-1)\^n\b)\b/i.test(lower)) {
        score += 0.30; role = "trap"; slot = "trap";
      } else if (/\bdo not\b|\bavoid\b|\bcommon mistake\b|\bconfuse\b|\bnot the same\b/.test(lower)) {
        score += 0.22; role = "common_mistake"; slot = "trap";
      }
      break;
    }
    case "fiction": {
      if (/\b(said|told|went|came|saw|felt|thought|realized|discovered|found|heard)\b/.test(lower)) {
        score += 0.24; role = "event"; slot = "pattern";
      } else if (/\bsymbolizes?\b|\brepresents?\b|\btheme\b|\bmotif\b|\bconflict\b|\bmeaning\b/.test(lower)) {
        score += 0.24; role = "theme"; slot = "reason";
      } else if (/\bforeshadow\b|\birony\b|\bparadox\b|\ballusion\b/.test(lower)) {
        score += 0.18; role = "literary_device"; slot = "rule";
      }
      if (/\bstruggle\b|\bversus\b|\bopposed\b|\btension\b|\bconflict\b/.test(lower)) {
        score += 0.16; role = "conflict"; slot = "trap";
      }
      break;
    }
    default: { // general
      if (/\bis defined as\b|\brefers? to\b|\bmeans?\b|\bconsists? of\b|\bcharacterized by\b/.test(lower)) {
        score += 0.28; role = "definition"; slot = "pattern";
      } else if (/\bbecause\b|\btherefore\b|\bleads? to\b|\bcauses?\b|\bresults? in\b|\bindicates?\b/.test(lower)) {
        score += 0.24; role = "explanation"; slot = "reason";
      } else if (/\bmust\b|\bshould\b|\brequires?\b/.test(lower)) {
        score += 0.20; role = "rule"; slot = "rule";
      }
      if (/\bhowever\b|\bunlike\b|\bdo not\b|\bconfuse\b|\bin contrast\b/.test(lower)) {
        score += 0.18; role = "contrast"; slot = "trap";
      }
      break;
    }
  }

  // Universal length preference (10–28 words = explanatory sweet spot)
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words >= 10 && words <= 28) score += 0.08;
  if (words < 7) score -= 0.18;

  if (c.semanticScore   != null) score += c.semanticScore   * 0.18;
  if (c.explanatoryScore != null) score += c.explanatoryScore * 0.14;

  return {
    id: c.id,
    text,
    role,
    slot,
    score: Math.max(0, Math.min(score, 1)),
  };
}
