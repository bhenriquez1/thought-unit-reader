// lib/bookIntelligence/reasoningStrategies.ts
// Maps document domains to expert reasoning frameworks.
//
// This is NOT the Learning Profile framing (lib/learningProfile/profileContext.ts).
// Learning Profile answers "how should this be explained to THIS learner."
// Reasoning Strategy answers "what thinking framework does THIS DOMAIN use."
//
// A dental student reading a programming book gets:
//   ReasoningStrategy = programming (system design, execution flow, debugging)
//   ProfileFraming    = dental (clinical pearl format, chair-side relevance)
//
// Both are injected into AI system prompts, but they answer different questions
// and must never be conflated.

import type { Domain, ReasoningStrategy } from "./types";

const REASONING_STRATEGIES: Record<string, ReasoningStrategy> = {
  medicine: {
    id: "medicine",
    label: "Clinical Reasoning",
    systemBlock:
      "Apply clinical reasoning: normal structure and function → pathophysiology → " +
      "clinical presentation → diagnosis and differential → treatment → prognosis. " +
      "Connect mechanisms to patient outcomes. Distinguish must-know from nice-to-know.",
  },
  dentistry: {
    id: "dentistry",
    label: "Dental Clinical Reasoning",
    systemBlock:
      "Apply dental clinical reasoning: oral anatomy and function → pathology → " +
      "clinical presentation → diagnosis → treatment planning → procedural steps → " +
      "postoperative management. Connect science to the chair-side encounter.",
  },
  nursing: {
    id: "nursing",
    label: "Nursing Process Reasoning",
    systemBlock:
      "Apply nursing process reasoning: assessment → nursing diagnosis → planning → " +
      "intervention → evaluation. Frame concepts around patient safety, therapeutic " +
      "communication, and evidence-based practice.",
  },
  pharmacy: {
    id: "pharmacy",
    label: "Pharmacological Reasoning",
    systemBlock:
      "Apply pharmacological reasoning: mechanism of action → pharmacokinetics → " +
      "pharmacodynamics → therapeutic use → adverse effects → drug interactions → " +
      "clinical monitoring. Connect molecular action to patient-level outcomes.",
  },
  veterinary: {
    id: "veterinary",
    label: "Veterinary Clinical Reasoning",
    systemBlock:
      "Apply veterinary clinical reasoning: species-specific anatomy and physiology → " +
      "pathology → diagnosis → treatment → zoonotic considerations. Note species " +
      "differences explicitly when they affect interpretation.",
  },
  biology: {
    id: "biology",
    label: "Biological Systems Reasoning",
    systemBlock:
      "Apply biological systems reasoning: structure → function → mechanism → " +
      "regulation → evolutionary significance. Trace cause-and-effect chains " +
      "from molecular to organism level. Use pathway logic for metabolic content.",
  },
  chemistry: {
    id: "chemistry",
    label: "Chemical Reasoning",
    systemBlock:
      "Apply chemical reasoning: atomic/molecular structure → properties → " +
      "reactivity → reaction mechanism → products and energetics. " +
      "Balance equations, track electrons, and connect thermodynamics to equilibrium.",
  },
  "organic-chemistry": {
    id: "organic-chemistry",
    label: "Organic Mechanism Reasoning",
    systemBlock:
      "Apply organic mechanism reasoning: functional group identification → " +
      "electron movement (curved-arrow notation) → reaction mechanism step-by-step → " +
      "stereochemical outcome → synthetic application. Always show why electrons move.",
  },
  biochemistry: {
    id: "biochemistry",
    label: "Biochemical Pathway Reasoning",
    systemBlock:
      "Apply biochemical pathway reasoning: substrate → enzyme (cofactors, regulation) → " +
      "product → pathway integration → clinical relevance. Trace energy currency " +
      "(ATP, NADH) and regulatory checkpoints through each pathway.",
  },
  physics: {
    id: "physics",
    label: "Physical Systems Reasoning",
    systemBlock:
      "Apply physical systems reasoning: define the system and boundary conditions → " +
      "identify forces/fields/conservation laws → derive the governing equation → " +
      "solve → interpret the physical meaning of the result. Check units and limits.",
  },
  mathematics: {
    id: "mathematics",
    label: "Mathematical Reasoning",
    systemBlock:
      "Apply mathematical reasoning: precise definition → theorem statement → " +
      "proof or derivation (show each step) → worked example → generalization. " +
      "Distinguish intuition from rigorous argument. Identify when a result holds " +
      "and when it does not.",
  },
  statistics: {
    id: "statistics",
    label: "Statistical Reasoning",
    systemBlock:
      "Apply statistical reasoning: research question → data structure → " +
      "assumptions → method selection → computation → interpretation → " +
      "limitations. Distinguish statistical significance from practical significance.",
  },
  engineering: {
    id: "engineering",
    label: "Engineering Design Reasoning",
    systemBlock:
      "Apply engineering design reasoning: requirements and constraints → " +
      "governing physical laws → model selection → analysis → design → " +
      "failure mode identification → validation. Always consider safety margins " +
      "and real-world tolerances.",
  },
  "computer-science": {
    id: "computer-science",
    label: "Computational Reasoning",
    systemBlock:
      "Apply computational reasoning: problem decomposition → algorithm design → " +
      "data structure selection → correctness argument → complexity analysis → " +
      "implementation → testing and edge cases. Trace execution for non-obvious cases.",
  },
  "data-science": {
    id: "data-science",
    label: "Data Science Reasoning",
    systemBlock:
      "Apply data science reasoning: problem framing → data collection and quality → " +
      "exploratory analysis → feature engineering → model selection → evaluation → " +
      "interpretation and deployment considerations. Always question the data before " +
      "the model.",
  },
  law: {
    id: "law",
    label: "Legal IRAC Reasoning",
    systemBlock:
      "Apply legal IRAC reasoning: Issue identification → Rule statement → " +
      "Application to facts → Conclusion. Cite precedent where relevant. " +
      "Distinguish holdings from dicta. Note jurisdictional variations.",
  },
  business: {
    id: "business",
    label: "Business Reasoning",
    systemBlock:
      "Apply business reasoning: stakeholder identification → problem framing → " +
      "framework application (Porter, SWOT, financial ratios, etc.) → " +
      "trade-off analysis → recommendation with implementation considerations. " +
      "Ground recommendations in data.",
  },
  economics: {
    id: "economics",
    label: "Economic Reasoning",
    systemBlock:
      "Apply economic reasoning: define the agent and incentives → state assumptions → " +
      "apply the model → derive predictions → compare to evidence → assess welfare " +
      "implications. Identify market failures and policy levers explicitly.",
  },
  finance: {
    id: "finance",
    label: "Financial Reasoning",
    systemBlock:
      "Apply financial reasoning: cash flow identification → time value adjustment → " +
      "risk assessment → valuation → decision rule application. " +
      "Connect accounting statements to financial model inputs.",
  },
  accounting: {
    id: "accounting",
    label: "Accounting Reasoning",
    systemBlock:
      "Apply accounting reasoning: identify the transaction → determine affected accounts → " +
      "apply recognition and measurement rules → record entry → trace to financial " +
      "statements → interpret the economic meaning.",
  },
  psychology: {
    id: "psychology",
    label: "Psychological Reasoning",
    systemBlock:
      "Apply psychological reasoning: observation → theory and construct definition → " +
      "research design and methodology → findings → alternative explanations → " +
      "applied implications. Distinguish correlation from causation.",
  },
  history: {
    id: "history",
    label: "Historical Reasoning",
    systemBlock:
      "Apply historical reasoning: chronology → causation → context → " +
      "competing interpretations → significance. Identify primary sources versus " +
      "secondary analysis. Consider whose perspective is represented and whose is absent.",
  },
  philosophy: {
    id: "philosophy",
    label: "Philosophical Reasoning",
    systemBlock:
      "Apply philosophical reasoning: argument reconstruction → premise identification → " +
      "validity and soundness evaluation → objection and reply → comparison of " +
      "positions. Distinguish descriptive from normative claims.",
  },
  literature: {
    id: "literature",
    label: "Literary Reasoning",
    systemBlock:
      "Apply literary reasoning: close reading → textual evidence → theme identification → " +
      "formal analysis (structure, voice, imagery, symbol) → contextual interpretation → " +
      "critical position with arguable claim. Anchor interpretations in the text itself.",
  },
  "language-learning": {
    id: "language-learning",
    label: "Language Acquisition Reasoning",
    systemBlock:
      "Apply language acquisition reasoning: input comprehension → pattern recognition → " +
      "rule internalization → production practice → error analysis → fluency building. " +
      "Distinguish form, meaning, and use. Connect grammar rules to communicative function.",
  },
};

/** Canonical fallback for unknown or multidisciplinary documents */
const GENERIC_REASONING: ReasoningStrategy = {
  id: "generic",
  label: "Analytical Reasoning",
  systemBlock:
    "Apply analytical reasoning: identify the core concept or claim → " +
    "examine the supporting evidence or mechanism → consider alternative " +
    "explanations → synthesize a clear understanding → connect to related " +
    "ideas in the same source.",
};

/**
 * Returns the domain-appropriate reasoning strategy.
 * Falls back to the generic analytical framework for unknown or
 * multidisciplinary documents — never returns undefined.
 */
export function getReasoningStrategy(domain: Domain | undefined | null): ReasoningStrategy {
  if (!domain) return GENERIC_REASONING;
  return REASONING_STRATEGIES[domain] ?? GENERIC_REASONING;
}

export { REASONING_STRATEGIES, GENERIC_REASONING };
