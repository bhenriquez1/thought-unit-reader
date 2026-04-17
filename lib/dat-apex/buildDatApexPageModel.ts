// lib/dat-apex/buildDatApexPageModel.ts
//
// Converts a PageReadingGraph + document context into a DatApexPageModel.
// Routes through subject-specific PDRM, trap, and question sub-engines.

import type {
  DatApexPageModel,
  DatSubject,
  DatTopicFamily,
  DatWeight,
  PdrmBlock,
} from "./types";
import { matchBlueprintEntry } from "./blueprintMaps";
import { buildPdrm } from "./pdrm/index";
import { buildTraps } from "./traps/index";
import { buildQuestions } from "./questions/index";

// ---------------------------------------------------------------------------
// Public input type (graph shape consumed from lib/reading-graph)
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
  const entry = matchBlueprintEntry(`${chapterTitle} ${sectionTitle}`, subject);
  return entry?.topicFamily ?? "unknown";
}

function resolveDatWeight(
  chapterTitle: string,
  sectionTitle: string,
  subject: DatSubject
): DatWeight {
  const entry = matchBlueprintEntry(`${chapterTitle} ${sectionTitle}`, subject);
  return entry?.datWeight ?? "medium";
}

function first(...candidates: Array<string | null | undefined>): string {
  for (const c of candidates) {
    const s = (c ?? "").trim();
    if (s) return s;
  }
  return "";
}

function buildRecallPrompts(pdrm: PdrmBlock, subject: DatSubject): string[] {
  const prompts = [
    `What is the key pattern here? (${pdrm.pattern})`,
    `What decision rule applies?`,
    `Why does this principle hold?`,
    `What mistake do students most often make?`,
  ];
  if (subject === "organic_chemistry") {
    prompts.push("What are the conditions/reagents and what product forms?");
  } else if (subject === "general_chemistry") {
    prompts.push("What happens to this property when a variable changes?");
  } else {
    prompts.push("Where does this process occur and what does it produce?");
  }
  return prompts;
}

function buildTestedAngles(graph: PageGraphInput, subject: DatSubject): string[] {
  const combined = [
    graph.chapterTitle ?? "",
    graph.sectionTitle ?? "",
    graph.pageSummary ?? "",
    graph.mainSignal ?? "",
  ].join(" ").toLowerCase();

  if (subject === "biology") {
    if (/respiration|glycolysis|krebs|atp/.test(combined))
      return ["Where does each stage occur?", "What is the net ATP yield?", "Which molecules carry electrons to ETC?"];
    if (/genetics|meiosis|inheritance|allele/.test(combined))
      return ["Predict offspring ratios", "Cross-over frequency", "Identify inheritance pattern"];
    if (/transcription|translation/.test(combined))
      return ["Direction of synthesis", "Template vs. coding strand", "Role of each RNA type"];
    if (/membrane|transport/.test(combined))
      return ["Active vs. passive transport", "Osmosis direction", "Channel vs. carrier"];
  } else if (subject === "general_chemistry") {
    if (/equilibrium|le chatelier/.test(combined))
      return ["Predict shift direction", "Effect of temperature on K", "Effect of pressure on gas equilibrium"];
    if (/acid|base|ph|buffer/.test(combined))
      return ["Identify stronger acid", "Calculate pH after mixing", "Buffer capacity logic"];
    if (/electrochemistry|redox/.test(combined))
      return ["Assign oxidation states", "Calculate E°cell", "Identify cathode/anode"];
    if (/kinetics|rate/.test(combined))
      return ["Determine rate order", "Half-life calculation", "Effect of catalyst on Ea"];
  } else if (subject === "organic_chemistry") {
    if (/sn1|sn2/.test(combined))
      return ["Predict mechanism from substrate", "Predict stereochemical outcome", "Choose nucleophile/solvent combination"];
    if (/alkene|addition/.test(combined))
      return ["Predict regiochemistry", "Markovnikov vs. anti-Markovnikov", "Syn vs. anti addition"];
    if (/aromatic|eas/.test(combined))
      return ["Predict directing effect", "Activating vs. deactivating", "Choose correct product"];
    if (/stereochemistry/.test(combined))
      return ["Assign R/S configuration", "Enantiomer vs. diastereomer", "Predict optical activity"];
  }

  return [
    "Identify the core concept",
    "Apply the principle to a new scenario",
    "Distinguish from a similar concept",
  ];
}

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

  // Fail-closed: no output for weak or unclassified pages
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

  // Build all layers via sub-engines
  const pdrm = buildPdrm(graph, subject, topicFamily);

  const pageText = [
    graph.chapterTitle ?? "",
    graph.sectionTitle ?? "",
    graph.pageSummary ?? "",
    graph.mainSignal ?? "",
    ...(graph.supportSignals ?? []),
    ...(graph.topTakeaways ?? []),
  ].join(" ");

  const trapSignals = buildTraps(pageText, subject, topicFamily, graph.traps ?? []);
  const angles = buildTestedAngles(graph, subject);
  const recallPrompts = buildRecallPrompts(pdrm, subject);
  const generatedQuestions = buildQuestions(pdrm, trapSignals, subject, topicFamily, graph.pageNumber);

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
    likelyQuestionTypes: generatedQuestions.map((q) => q.type),
    recallPrompts,
    generatedQuestions,
    confidence:
      datWeight === "very_high" ? 0.88
      : datWeight === "high"      ? 0.78
      :                             0.60,
  };
}
