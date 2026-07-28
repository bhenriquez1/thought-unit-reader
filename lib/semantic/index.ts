// lib/semantic/index.ts
// Barrel export for the semantic pack engine.

export type {
  SemanticDomain,
  CanonicalSemanticType,
  SemanticLabelDefinition,
  SemanticPack,
  SemanticDomainAssignment,
  ClassificationResult,
  RankingRule,
} from "./types";

export { CONFIDENCE, CLASSIFIER_VERSION } from "./types";

export { classifyDomain, classifyChapter, shouldSwitchDomain } from "./classifier";

export {
  saveAssignment,
  getAssignment,
  getAllAssignments,
  deleteAssignment,
  upsertUserOverride,
} from "./domainAssignmentStore";

export type { ResolvedPack } from "./resolvePack";
export {
  resolvePack,
  resolvePackFromResult,
  getDisplayLabel,
  getDisplayIcon,
} from "./resolvePack";

export { UNIVERSAL_LABELS, UNIVERSAL_PACK } from "./packs/universal";
export { GENERAL_PACK } from "./packs/general";
export { DENTISTRY_PACK } from "./packs/dentistry";
export { GENERAL_CHEMISTRY_PACK } from "./packs/generalChemistry";

export {
  legacySemanticLabelToCanonical,
  paragraphKindToCanonical,
  kindFromCanonicalType,
} from "./legacyMigration";
