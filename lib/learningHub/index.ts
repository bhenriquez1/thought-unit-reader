// lib/learningHub/index.ts
// Barrel export for the Learning Hub organization layer.
//
// L1 (Learning Hub orchestration correction) — hierarchyBuilder.ts,
// conceptLearningPlan.ts, semanticToc.ts, and masteryBreakdown.ts were
// deleted here: each defined its own independent mastery/recommendation
// model, but none was ever imported by any production component — no
// caller besides each other and this barrel. The canonical per-concept
// learning state is lib/knowledge/knowledgeGraphSchema.ts's
// KnowledgeNodeProgress, already live via knowledgeStateSelectors.ts
// (see components/learningHub/KnowledgeStatePanel.tsx); a second,
// disconnected model must not be reintroduced under this directory.

export * from "./titleNormalizer";
