// lib/notelab/deriveNoteCards.ts
// Backward-compat fallback: when AI noteCards is null/empty (older cached synthesis,
// or the model didn't populate it), derive a reasonable Adaptive Notebook card set
// from the existing flat studyNotes.* fields. Pure derivation — never replaces a
// real AI-generated noteCards array, only fills the gap when one doesn't exist.

import type { CurrentPageStudyModel } from "@/lib/insights/currentPageStudyModel";
import type { NoteCard } from "@/lib/insights/synthesizeTeachingOutput";

function card(type: NoteCard["type"], title: string, body: string | null | undefined): NoteCard | null {
  if (!body || body.trim().length < 8) return null;
  return {
    type,
    title,
    body: body.trim(),
    visual: null,
    priorityTier: null,
    sourceAnchorHints: null,
    span: null,
  };
}

export function deriveNoteCardsFromStudyModel(model: CurrentPageStudyModel): NoteCard[] {
  const sn = model.studyNotes;
  const cards: NoteCard[] = [];

  const mustKnow = card("must_know", "Must Know", model.pageThesis || sn.whyThisMatters);
  if (mustKnow) cards.push(mustKnow);

  const mechanism = card("mechanism", "Mechanism", sn.keyMechanism);
  if (mechanism) cards.push(mechanism);

  const clinicalReasoning = card("clinical_reasoning", "Clinical Reasoning", sn.clinicalReasoning);
  if (clinicalReasoning) cards.push(clinicalReasoning);

  const trap = card("dat_trap", "Trap", sn.commonConfusion);
  if (trap) cards.push(trap);

  const commonMistake = card("common_mistake", "Common Mistake", sn.commonMistake);
  if (commonMistake) cards.push(commonMistake);

  const memoryHook = card("memory_hook", "Memory Hook", sn.quickMemory);
  if (memoryHook) cards.push(memoryHook);

  const connectionMap = card("connection_map", "Connection Map", sn.connectionMap);
  if (connectionMap) cards.push(connectionMap); // text-only — visual: null, no second AI call available

  const clinicalPearl = card("clinical_pearl", "Clinical Pearl", sn.clinicalPearl);
  if (clinicalPearl) cards.push(clinicalPearl);

  const whyThisMatters = card("why_this_matters", "Why This Matters", sn.examStrategy);
  if (whyThisMatters) cards.push(whyThisMatters);

  const miniQuestions = (model.miniTestItems ?? []).slice(0, 3).map((q) => q.question).filter(Boolean);
  const recall = card("recall_questions", "Recall Questions", miniQuestions.length ? miniQuestions.join("\n") : null);
  if (recall) cards.push(recall);

  for (const block of model.conceptBlocks.slice(0, 2)) {
    const pattern = card("pattern_recognition", block.title || "Pattern Recognition", block.pattern);
    if (pattern) cards.push(pattern);
  }

  const complicationRisk = card(
    "complication_risk",
    "Complication Risk",
    model.conceptBlocks.map((b) => b.trap).filter((v): v is string => typeof v === "string" && v.length > 10)[0],
  );
  if (complicationRisk) cards.push(complicationRisk);

  // Safety net for heuristic-only models (synthesis not yet resolved):
  // studyNotes fields are all null, but concept blocks from the heuristic pipeline
  // are already available. Derive additional cards from them so a note saved before
  // synthesis completes still shows meaningful content instead of zero cards.
  if (cards.length <= 1) {
    for (const block of model.conceptBlocks.slice(0, 5)) {
      if (!block.title && !block.pattern) continue;
      const body = [block.pattern, block.mechanism].filter(Boolean).join("\n\n") || block.pattern;
      const c = card("pattern_recognition", block.title || "Key Concept", body);
      if (c && !cards.some((x) => x.title === c.title)) cards.push(c);
    }
    const trapText = model.conceptBlocks.find((b) => b.trap)?.trap ?? null;
    const trapCard = card("dat_trap", "Watch Out", trapText);
    if (trapCard && !cards.some((x) => x.title === trapCard.title)) cards.push(trapCard);
  }

  return cards;
}
