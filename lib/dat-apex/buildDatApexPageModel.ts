// lib/dat-apex/buildDatApexPageModel.ts
//
// Converts a PageReadingGraph + document context into a DatApexPageModel.
// This is the main per-page entry point for the DAT Apex engine.

import type {
  DatApexPageModel,
  DatQuestion,
  DatSubject,
  DatTopicFamily,
  DatWeight,
  PdrmBlock,
} from "./types";
import { matchBlueprintEntry } from "./blueprintMaps";

// ---------------------------------------------------------------------------
// Input type (graph shape consumed from lib/reading-graph)
// ---------------------------------------------------------------------------

export interface PageGraphInput {
  documentId: string;
  pageNumber: number;
  subject: DatSubject;
  chapterTitle?: string | null;
  sectionTitle?: string | null;
  pageSummary?: string | null;
  mainSignal?: string | null;
  supportSignals?: string[];
  traps?: string[];
  topTakeaways?: string[];
}

export interface BuildDatApexPageModelInput {
  graph: PageGraphInput;
  chapterTitle?: string | null;
  sectionTitle?: string | null;
  overrideSubject?: DatSubject;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeTitle(title?: string | null): string {
  return (title ?? "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function resolveTopicFamily(
  chapterTitle: string,
  sectionTitle: string,
  subject: DatSubject
): DatTopicFamily {
  const combined = `${chapterTitle} ${sectionTitle}`;
  const entry = matchBlueprintEntry(combined, subject);
  return entry?.topicFamily ?? "unknown";
}

function resolveDatWeight(
  chapterTitle: string,
  sectionTitle: string,
  subject: DatSubject
): DatWeight {
  const combined = `${chapterTitle} ${sectionTitle}`;
  const entry = matchBlueprintEntry(combined, subject);
  return entry?.datWeight ?? "medium";
}

function first(...candidates: Array<string | null | undefined>): string {
  for (const c of candidates) {
    const s = (c ?? "").trim();
    if (s) return s;
  }
  return "";
}

// ---------------------------------------------------------------------------
// PDRM builders (subject-specific)
// ---------------------------------------------------------------------------

function buildBiologyPdrm(graph: PageGraphInput): PdrmBlock {
  const signal = first(graph.mainSignal, graph.pageSummary, graph.topTakeaways?.[0]);
  const support = graph.supportSignals ?? [];

  return {
    pattern: first(signal, "Biological process / structure-function relationship"),
    decision: first(
      support[0],
      "Where does this occur? What does it produce? What controls it?"
    ),
    reason: first(
      support[1],
      "Understand the pathway, location, and molecular output."
    ),
    miss: first(
      graph.traps?.[0],
      "Location confusion, process-order swap, or similar-term substitution."
    ),
  };
}

function buildGenChemPdrm(graph: PageGraphInput): PdrmBlock {
  const signal = first(graph.mainSignal, graph.pageSummary, graph.topTakeaways?.[0]);
  const support = graph.supportSignals ?? [];

  return {
    pattern: first(signal, "Quantitative or conceptual chemistry relationship"),
    decision: first(
      support[0],
      "What changes? What is the relationship? Which equation applies?"
    ),
    reason: first(
      support[1],
      "Apply the underlying law, trend, or thermodynamic principle."
    ),
    miss: first(
      graph.traps?.[0],
      "Sign error, trend reversal, or mixing equilibrium with kinetics."
    ),
  };
}

function buildOrgoChemPdrm(graph: PageGraphInput): PdrmBlock {
  const signal = first(graph.mainSignal, graph.pageSummary, graph.topTakeaways?.[0]);
  const support = graph.supportSignals ?? [];

  return {
    pattern: first(signal, "Reaction family / mechanism pattern"),
    decision: first(
      support[0],
      "Substrate class, nucleophile/base, solvent, leaving group, sterics."
    ),
    reason: first(
      support[1],
      "Mechanism depends on carbocation stability, sterics, or electron density."
    ),
    miss: first(
      graph.traps?.[0],
      "Wrong mechanism, wrong product, or stereochemical outcome error."
    ),
  };
}

function buildPdrm(graph: PageGraphInput, subject: DatSubject): PdrmBlock {
  if (subject === "biology") return buildBiologyPdrm(graph);
  if (subject === "general_chemistry") return buildGenChemPdrm(graph);
  if (subject === "organic_chemistry") return buildOrgoChemPdrm(graph);
  // fallback
  return {
    pattern: first(graph.mainSignal, graph.pageSummary, ""),
    decision: first(graph.supportSignals?.[0], ""),
    reason: first(graph.supportSignals?.[1], ""),
    miss: first(graph.traps?.[0], ""),
  };
}

// ---------------------------------------------------------------------------
// Trap signal builders
// ---------------------------------------------------------------------------

const BIO_TRAP_PATTERNS = [
  { re: /mitosis|meiosis/i, trap: "Confusing mitosis with meiosis: mitosis produces identical diploid daughter cells; meiosis produces genetically distinct haploid gametes." },
  { re: /glycolysis|krebs|electron transport/i, trap: "Mixing up ATP yield per stage or confusing the location (cytoplasm vs. mitochondrial matrix vs. inner membrane)." },
  { re: /transcription|translation/i, trap: "Confusing where transcription (nucleus) and translation (ribosome/cytoplasm) occur, or mixing up template vs. coding strand." },
  { re: /dominant|recessive/i, trap: "Assuming the most common phenotype is dominant. Recessive alleles can be common in a population." },
  { re: /hormone|receptor/i, trap: "Swapping steroid vs. peptide hormone mechanisms: steroids enter the cell; peptides act on surface receptors." },
  { re: /active transport|passive/i, trap: "Confusing active transport (requires ATP) with facilitated diffusion (no ATP, follows gradient)." },
];

const GC_TRAP_PATTERNS = [
  { re: /equilibrium|rate|kinetics/i, trap: "Equilibrium constant says nothing about reaction rate. A large K does not mean a fast reaction." },
  { re: /acid|base|conjugate/i, trap: "Stronger acid → weaker conjugate base. Students often reverse this relationship." },
  { re: /enthalpy|entropy|gibbs|spontaneous/i, trap: "Spontaneity depends on ΔG = ΔH − TΔS, not on ΔH alone. Endothermic reactions can be spontaneous at high T." },
  { re: /electronegativity|ionization|radius/i, trap: "Atomic radius decreases left→right across a period, but increases top→bottom in a group. Ionization energy is the inverse." },
  { re: /solubility|ksp/i, trap: "Common ion effect lowers solubility. Students forget that adding a common ion shifts equilibrium left (Le Chatelier)." },
  { re: /redox|oxidation/i, trap: "OIL RIG: Oxidation Is Loss, Reduction Is Gain. Students flip the sign or confuse the electrode labels (anode = oxidation)." },
];

const ORGO_TRAP_PATTERNS = [
  { re: /sn1|sn2/i, trap: "SN1 needs tertiary substrate + polar protic solvent + weak nucleophile. SN2 needs primary substrate + polar aprotic + strong nucleophile. Mixing these is the #1 orgo trap." },
  { re: /e1|e2|elimination/i, trap: "Strong base + heat favors E2. E1 occurs with weak base on tertiary substrate. Confusing base with nucleophile is a common miss." },
  { re: /markovnikov|anti.markovnikov/i, trap: "Markovnikov: H adds to less-substituted carbon. Anti-Markovnikov (HBR/peroxide): radical mechanism reverses this." },
  { re: /stereochemistry|enantiomer|diastereomer/i, trap: "Enantiomers are non-superimposable mirror images; diastereomers are not mirror images. SN2 inverts configuration; SN1 gives racemic mixture." },
  { re: /carbonyl|aldehyde|ketone/i, trap: "Aldehydes are more reactive than ketones toward nucleophilic addition (less steric hindrance). Students often forget this reactivity order." },
  { re: /aromatic|benzene|eas/i, trap: "Activating groups direct ortho/para; deactivating groups direct meta. Halogens deactivate the ring but direct ortho/para." },
];

function buildTrapSignals(
  graph: PageGraphInput,
  subject: DatSubject
): string[] {
  const combined = [
    graph.chapterTitle ?? "",
    graph.sectionTitle ?? "",
    graph.pageSummary ?? "",
    graph.mainSignal ?? "",
    ...(graph.supportSignals ?? []),
  ].join(" ");

  const patterns =
    subject === "biology"
      ? BIO_TRAP_PATTERNS
      : subject === "general_chemistry"
        ? GC_TRAP_PATTERNS
        : ORGO_TRAP_PATTERNS;

  const matched = patterns
    .filter(({ re }) => re.test(combined))
    .map(({ trap }) => trap);

  // Always include explicitly extracted traps from the graph
  const explicit = (graph.traps ?? []).filter(Boolean);

  const all = [...new Set([...matched, ...explicit])];
  return all.slice(0, 4);
}

// ---------------------------------------------------------------------------
// Tested angles + question type inference
// ---------------------------------------------------------------------------

const BIO_ANGLE_MAP: Array<{ re: RegExp; angles: string[]; qTypes: DatQuestion["type"][] }> = [
  { re: /respiration|glycolysis|krebs|atp/i, angles: ["Where does each stage occur?", "What is the net ATP yield?", "Which molecules carry electrons to ETC?"], qTypes: ["concept_check", "comparison", "application"] },
  { re: /genetics|meiosis|inheritance|allele/i, angles: ["Predict offspring ratios", "Cross-over frequency", "Identify inheritance pattern"], qTypes: ["concept_check", "application", "trap_check"] },
  { re: /transcription|translation/i, angles: ["Direction of synthesis", "Template vs coding strand", "Role of each RNA type"], qTypes: ["mechanism", "comparison", "trap_check"] },
  { re: /membrane|transport/i, angles: ["Active vs passive", "Osmosis direction", "Channel vs carrier"], qTypes: ["concept_check", "comparison", "trap_check"] },
];

const GC_ANGLE_MAP: Array<{ re: RegExp; angles: string[]; qTypes: DatQuestion["type"][] }> = [
  { re: /equilibrium|le chatelier/i, angles: ["Predict shift direction", "Effect of temperature on K", "Effect of pressure on gas equilibrium"], qTypes: ["concept_check", "application", "trap_check"] },
  { re: /acid|base|ph|buffer/i, angles: ["Identify stronger acid", "Calculate pH after mixing", "Buffer capacity logic"], qTypes: ["concept_check", "comparison", "application"] },
  { re: /electrochemistry|redox/i, angles: ["Assign oxidation states", "Calculate E°cell", "Identify cathode/anode"], qTypes: ["concept_check", "application", "mechanism"] },
  { re: /kinetics|rate/i, angles: ["Determine rate order", "Half-life calculation", "Effect of catalyst on activation energy"], qTypes: ["concept_check", "application", "comparison"] },
];

const ORGO_ANGLE_MAP: Array<{ re: RegExp; angles: string[]; qTypes: DatQuestion["type"][] }> = [
  { re: /sn1|sn2/i, angles: ["Predict mechanism from substrate", "Predict stereochemical outcome", "Choose nucleophile/solvent combination"], qTypes: ["mechanism", "product_prediction", "trap_check"] },
  { re: /alkene|addition/i, angles: ["Predict regiochemistry", "Markovnikov vs anti-Markovnikov", "Syn vs anti addition"], qTypes: ["product_prediction", "mechanism", "comparison"] },
  { re: /aromatic|eas/i, angles: ["Predict directing effect", "Identify activating vs deactivating", "Choose correct product"], qTypes: ["product_prediction", "concept_check", "trap_check"] },
  { re: /stereochemistry/i, angles: ["Assign R/S configuration", "Identify enantiomer vs diastereomer", "Predict optical activity"], qTypes: ["concept_check", "comparison", "trap_check"] },
];

function buildTestedAnglesAndQTypes(
  graph: PageGraphInput,
  subject: DatSubject
): { angles: string[]; qTypes: DatQuestion["type"][] } {
  const combined = [
    graph.chapterTitle ?? "",
    graph.sectionTitle ?? "",
    graph.pageSummary ?? "",
    graph.mainSignal ?? "",
  ].join(" ");

  const angleMap =
    subject === "biology"
      ? BIO_ANGLE_MAP
      : subject === "general_chemistry"
        ? GC_ANGLE_MAP
        : ORGO_ANGLE_MAP;

  for (const { re, angles, qTypes } of angleMap) {
    if (re.test(combined)) return { angles, qTypes };
  }

  // Generic fallbacks
  return {
    angles: ["Identify the core concept", "Apply the principle to a new scenario", "Distinguish from a similar concept"],
    qTypes: ["concept_check", "comparison", "trap_check"],
  };
}

// ---------------------------------------------------------------------------
// Recall prompt builders
// ---------------------------------------------------------------------------

function buildRecallPrompts(pdrm: PdrmBlock, subject: DatSubject): string[] {
  const prompts = [
    `What is the key pattern from this page? (Pattern: ${pdrm.pattern})`,
    `What decision rule do you use here?`,
    `Why does this principle hold? Can you explain the reasoning?`,
    `What mistake do students most often make with this concept?`,
  ];

  if (subject === "organic_chemistry") {
    prompts.push("What are the conditions and reagents? What product forms?");
  } else if (subject === "general_chemistry") {
    prompts.push("What happens to the equilibrium/rate/property when you change a variable?");
  } else {
    prompts.push("Where does this process occur and what does it produce?");
  }

  return prompts;
}

// ---------------------------------------------------------------------------
// Question stubs (grounded, non-hallucinated)
// ---------------------------------------------------------------------------

function buildGroundedQuestions(
  pdrm: PdrmBlock,
  traps: string[],
  qTypes: DatQuestion["type"][],
  subject: DatSubject,
  pageNumber: number
): DatQuestion[] {
  const questions: DatQuestion[] = [];

  // Question 1: concept check based on pattern
  if (pdrm.pattern) {
    questions.push({
      id: `dat-q-${pageNumber}-1`,
      type: qTypes[0] ?? "concept_check",
      stem: `Which of the following best describes the key principle: "${pdrm.pattern}"?`,
      answerLogic: pdrm.reason,
      distractorLogic: [pdrm.miss],
      difficulty: "medium",
    });
  }

  // Question 2: decision-rule application
  if (pdrm.decision) {
    questions.push({
      id: `dat-q-${pageNumber}-2`,
      type: qTypes[1] ?? "application",
      stem: `A student must decide: "${pdrm.decision}". What is the correct approach?`,
      answerLogic: pdrm.reason,
      distractorLogic: [pdrm.miss],
      difficulty: "medium",
    });
  }

  // Question 3: trap check
  if (traps[0]) {
    questions.push({
      id: `dat-q-${pageNumber}-3`,
      type: "trap_check",
      stem: `True or False (and explain): ${traps[0].split(":")[0]}?`,
      answerLogic: traps[0],
      difficulty: "hard",
    });
  }

  return questions;
}

// ---------------------------------------------------------------------------
// Low-confidence gate
// ---------------------------------------------------------------------------

function isWeakPage(graph: PageGraphInput): boolean {
  const hasSignal = Boolean(graph.mainSignal || graph.pageSummary);
  const hasSupport = (graph.supportSignals?.length ?? 0) > 0 || (graph.topTakeaways?.length ?? 0) > 0;
  return !hasSignal && !hasSupport;
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

export function buildDatApexPageModel(
  input: BuildDatApexPageModelInput
): DatApexPageModel {
  const { graph } = input;
  const subject = input.overrideSubject ?? graph.subject;

  const chapterTitle = normalizeTitle(input.chapterTitle ?? graph.chapterTitle);
  const sectionTitle = normalizeTitle(input.sectionTitle ?? graph.sectionTitle);

  const topicFamily = resolveTopicFamily(chapterTitle, sectionTitle, subject);
  const datWeight = resolveDatWeight(chapterTitle, sectionTitle, subject);

  // Gate: refuse weak pages
  if (isWeakPage(graph) || subject === "unknown") {
    return {
      documentId: graph.documentId,
      pageNumber: graph.pageNumber,
      subject,
      chapterTitle: input.chapterTitle ?? graph.chapterTitle ?? undefined,
      sectionTitle: input.sectionTitle ?? graph.sectionTitle ?? undefined,
      topicFamily,
      datWeight: "ignore",
      concept: "",
      pattern: "",
      decision: "",
      reason: "",
      miss: "",
      testedAngles: [],
      trapSignals: [],
      likelyQuestionTypes: [],
      recallPrompts: [],
      generatedQuestions: [],
      confidence: 0,
    };
  }

  const pdrm = buildPdrm(graph, subject);
  const trapSignals = buildTrapSignals(graph, subject);
  const { angles, qTypes } = buildTestedAnglesAndQTypes(graph, subject);
  const recallPrompts = buildRecallPrompts(pdrm, subject);
  const questions = buildGroundedQuestions(pdrm, trapSignals, qTypes, subject, graph.pageNumber);

  return {
    documentId: graph.documentId,
    pageNumber: graph.pageNumber,
    subject,
    chapterTitle: input.chapterTitle ?? graph.chapterTitle ?? undefined,
    sectionTitle: input.sectionTitle ?? graph.sectionTitle ?? undefined,
    topicFamily,
    datWeight,
    concept: first(graph.mainSignal, graph.pageSummary, ""),
    pattern: pdrm.pattern,
    decision: pdrm.decision,
    reason: pdrm.reason,
    miss: pdrm.miss,
    testedAngles: angles,
    trapSignals,
    likelyQuestionTypes: qTypes,
    recallPrompts,
    generatedQuestions: questions,
    confidence: datWeight === "very_high" ? 0.88 : datWeight === "high" ? 0.78 : 0.6,
  };
}
