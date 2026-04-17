// lib/dat-apex/subjectDetection.ts

import type { DatSubject, SubjectDetectionResult } from "./types";

// ---------------------------------------------------------------------------
// Signal lexicons
// ---------------------------------------------------------------------------

const BIO_SIGNALS = [
  "cell", "mitosis", "meiosis", "dna", "rna", "gene", "allele", "chromosome",
  "transcription", "translation", "ribosome", "photosynthesis", "respiration",
  "glycolysis", "krebs", "electron transport", "membrane", "phospholipid",
  "protein", "enzyme", "hormone", "receptor", "signal transduction", "apoptosis",
  "immune", "antibody", "antigen", "lymphocyte", "evolution", "natural selection",
  "mutation", "genotype", "phenotype", "ecology", "population", "organism",
  "nucleus", "mitochondria", "chloroplast", "endoplasmic reticulum", "golgi",
  "atp", "nadh", "fadh", "fermentation", "osmosis", "diffusion",
];

const GC_SIGNALS = [
  "stoichiometry", "molarity", "molality", "enthalpy", "entropy", "gibbs",
  "equilibrium", "le chatelier", "kinetics", "rate law", "activation energy",
  "acid", "base", "ph", "buffer", "titration", "electrochemistry", "galvanic",
  "electrolytic", "redox", "oxidation", "reduction", "electron configuration",
  "periodic table", "ionization energy", "electronegativity", "bond energy",
  "ideal gas", "boyle", "charles", "avogadro", "molar mass", "limiting reagent",
  "colligative", "solubility", "precipitate", "reaction quotient", "hess",
  "calorimetry", "hybridization", "vsepr", "dipole", "van der waals",
];

const ORGO_SIGNALS = [
  "nucleophile", "electrophile", "carbocation", "carbanion", "radical",
  "sn1", "sn2", "e1", "e2", "substitution", "elimination", "addition",
  "alkene", "alkyne", "alkane", "arene", "benzene", "aromatic",
  "aldehyde", "ketone", "carboxylic acid", "ester", "amide", "anhydride",
  "alcohol", "ether", "epoxide", "amine", "nitrile",
  "stereochemistry", "enantiomer", "diastereomer", "chirality", "r/s",
  "markovnikov", "anti-markovnikov", "zaitsev", "rearrangement",
  "carbonyl", "acyl", "grignard", "wittig", "aldol", "enolate",
  "resonance", "inductive effect", "leaving group", "mechanism",
];

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

function scoreText(text: string, signals: string[]): number {
  const lower = text.toLowerCase();
  let hits = 0;
  for (const signal of signals) {
    const re = new RegExp(`\\b${signal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (re.test(lower)) hits += 1;
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function detectSubject(
  texts: string[]
): SubjectDetectionResult {
  const combined = texts.join(" ");

  const bioScore = scoreText(combined, BIO_SIGNALS);
  const gcScore = scoreText(combined, GC_SIGNALS);
  const orgoScore = scoreText(combined, ORGO_SIGNALS);

  const total = bioScore + gcScore + orgoScore || 1;
  const signals = {
    biologyTerms: bioScore,
    generalChemTerms: gcScore,
    organicChemTerms: orgoScore,
  };

  const top = Math.max(bioScore, gcScore, orgoScore);
  const second = [bioScore, gcScore, orgoScore]
    .filter((s) => s !== top)
    .reduce((a, b) => Math.max(a, b), 0);

  // Require the winner to be meaningfully ahead of second place
  const gap = top - second;
  const confidence = top === 0 ? 0 : Math.min(1, gap / Math.max(top, 1));

  if (confidence < 0.15 || top < 3) {
    return { subject: "unknown", confidence, signals };
  }

  let subject: DatSubject;
  if (top === bioScore) subject = "biology";
  else if (top === gcScore) subject = "general_chemistry";
  else subject = "organic_chemistry";

  return { subject, confidence, signals };
}
