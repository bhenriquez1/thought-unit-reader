// lib/dat-apex/types.ts

export type DatSubject =
  | "biology"
  | "general_chemistry"
  | "organic_chemistry"
  | "unknown";

export type DatWeight = "very_high" | "high" | "medium" | "low" | "ignore";

export type DatTopicFamily =
  // Biology
  | "chemical_foundations"
  | "biomolecules"
  | "cell_structure"
  | "membranes_transport"
  | "metabolism"
  | "cellular_respiration"
  | "photosynthesis"
  | "cell_signaling"
  | "cell_cycle"
  | "meiosis_genetics"
  | "dna_replication"
  | "gene_expression"
  | "gene_regulation"
  | "biotechnology"
  | "evolution_population"
  | "physiology_endocrine"
  | "physiology_nervous"
  | "physiology_immune"
  | "physiology_other"
  | "ecology"
  | "diversity"
  | "bio_other"
  // General Chemistry
  | "stoichiometry"
  | "atomic_structure"
  | "periodic_trends"
  | "bonding"
  | "molecular_geometry"
  | "intermolecular_forces"
  | "gases"
  | "solutions"
  | "thermochemistry"
  | "kinetics"
  | "equilibrium"
  | "acid_base"
  | "thermodynamics"
  | "electrochemistry"
  | "gc_other"
  // Organic Chemistry
  | "structure_bonding"
  | "acids_bases_orgo"
  | "stereochemistry"
  | "alkyl_halides"
  | "substitution_elimination"
  | "alkenes"
  | "alkynes"
  | "alcohols_ethers_epoxides"
  | "aromatic"
  | "carbonyl"
  | "carboxylic_derivatives"
  | "amines"
  | "spectroscopy"
  | "orgo_other"
  | "unknown";

export interface DocumentProfile {
  documentId: string;
  title: string;
  normalizedTitle: string;
  subject: DatSubject;
  confidence: number;
  detectedSignals: {
    biologyTerms: number;
    generalChemTerms: number;
    organicChemTerms: number;
  };
  pageCount: number;
  chapterCandidates: string[];
}

export interface ChapterMapNode {
  id: string;
  title: string;
  normalizedTitle: string;
  pageStart: number;
  pageEnd?: number;
  level: 1 | 2 | 3;
  parentId?: string;
  subject: DatSubject;
  topicFamily: DatTopicFamily;
  datWeight: DatWeight;
  matchedBlueprintTags: string[];
  confidence: number;
}

export interface PdrmBlock {
  pattern: string;
  decision: string;
  reason: string;
  miss: string;
}

export interface DatQuestion {
  id: string;
  type:
    | "concept_check"
    | "mechanism"
    | "comparison"
    | "trap_check"
    | "application"
    | "product_prediction"
    | "passage_style";
  stem: string;
  answer?: string;
  answerLogic: string;
  distractorLogic?: string[];
  difficulty: "easy" | "medium" | "hard";
}

export interface DatApexPageModel {
  documentId: string;
  pageNumber: number;
  subject: DatSubject;
  chapterTitle?: string;
  sectionTitle?: string;
  topicFamily: DatTopicFamily;
  datWeight: DatWeight;
  concept: string;
  pattern: string;
  decision: string;
  reason: string;
  miss: string;
  testedAngles: string[];
  trapSignals: string[];
  likelyQuestionTypes: string[];
  recallPrompts: string[];
  generatedQuestions: DatQuestion[];
  confidence: number;
}

export interface DatApexDocumentModel {
  documentId: string;
  profile: DocumentProfile;
  chapterMap: ChapterMapNode[];
  pageModels: DatApexPageModel[];
  highYieldPages: number[];
  builtAt: string;
}

export interface SubjectDetectionResult {
  subject: DatSubject;
  confidence: number;
  signals: DocumentProfile["detectedSignals"];
}
