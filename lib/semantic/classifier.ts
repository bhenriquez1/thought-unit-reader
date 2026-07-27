// lib/semantic/classifier.ts
// Versioned domain classifier. Produces a confidence score and evidence terms
// for each classification. Replaces detectPageDomain() for the semantic pack
// engine — the original detectPageDomain() is kept for backward compatibility
// with existing consumers (intelligenceSynthesis, scoreDomainPriority, etc.).
//
// Classifier version: bump CLASSIFIER_VERSION in types.ts when changing patterns.

import type { SemanticDomain, ClassificationResult } from "./types";
import { CLASSIFIER_VERSION } from "./types";

// ── Domain signatures ────────────────────────────────────────────────────────

interface DomainSignature {
  domain: SemanticDomain;
  pattern: RegExp;
  titleKeywords: string[];
  /** Minimum keyword hits in body text before a title boost applies. */
  minimumHits: number;
  /** Pattern whose presence reduces confidence (used for cross-domain disambiguation). */
  exclusionPattern?: RegExp;
}

const DOMAIN_SIGNATURES: DomainSignature[] = [
  {
    domain: "dentistry",
    pattern: /\b(tooth|teeth|dental|caries|pulp|enamel|dentin|occlusion|extraction|inlay|onlay|crown|bridge|implant|periodontal|gingiv(?:al|itis|ectomy)|periodontitis|carious|restoration|amalgam|composite|bonding|impression|periapical|alveolar|mandible|maxilla|bruxism|tmj|temporomandibular|endodontic|root canal|eruption|deciduous|premolar|molar|canine|incisor|oral mucosa|furcation|calculus|plaque|biofilm|oral hygiene|prophylaxis|fluoride|sealant|veneer|porcelain|zirconia|alginate|polyvinyl|resin cement|cementum|dentin bonding|pulpectomy|pulpotomy|apicoectomy|gingivectomy|osseointegration|interdental|embrasure|cusp|fissure|pit|tubercle|cingulum|incisal|occlusal|probing depth|attachment loss|bone loss|fremitus|percussion|vitality test|working length|obturation|gutta.percha|post and core)\b/gi,
    titleKeywords: ["dentistry", "dental", "oral", "tooth", "teeth", "prosthodontics", "periodontics", "endodontics", "orthodontics", "oral surgery", "oral medicine", "dental materials"],
    minimumHits: 3,
  },
  {
    domain: "medicine",
    pattern: /\b(patient|diagnosis|treatment|symptom|prognosis|etiology|pathology|pathophysiology|medication|drug|dose|prescription|therapy|physician|blood pressure|heart rate|respiratory|vital sign|biopsy|surgery|anesthesia|comorbidity|adverse effect|side effect|mechanism of action|pharmacokinetics|bioavailability|half.life|metabolism|excretion|renal|hepatic|cardiac|pulmonary|gastrointestinal|neurological|endocrine|infection|inflammation|fever|acute|chronic|systemic|benign|malignant|mortality|morbidity|electrocardiogram|echocardiogram|serolog|antibiotic|antiviral|chemotherapy|immunotherapy|vaccine|triage|differential diagnosis|workup|staging|grading|hematology|oncology|cardiology|pulmonology|gastroenterology|neurology|nephrology|rheumatology|intensive care|icu|ward|admission|discharge)\b/gi,
    titleKeywords: ["medicine", "medical", "clinical", "pathophysiology", "pharmacology", "internal medicine", "surgery", "pediatrics", "emergency"],
    minimumHits: 3,
  },
  {
    domain: "biology",
    pattern: /\b(cell|nucleus|mitochondria|ribosome|membrane|DNA|RNA|protein|enzyme|metabolism|photosynthesis|cellular respiration|mitosis|meiosis|chromosome|gene|allele|phenotype|genotype|dominant|recessive|mutation|evolution|natural selection|adaptation|species|population|ecology|ecosystem|organism|prokaryote|eukaryote|bacteria|virus|fungi|plant|animal|tissue|organ|ATP|glucose|lipid|carbohydrate|amino acid|nucleotide|transcription|translation|replication|homeostasis|osmosis|diffusion|active transport|receptor|signal transduction|hormone|neuron|synapse|action potential|antibody|antigen|lymphocyte|macrophage|cytokine|apoptosis|chloroplast|Calvin cycle|Krebs cycle|electron transport|glycolysis|oxidative phosphorylation|Hardy.Weinberg|genetic drift|speciation|phylogeny|taxonomy|kingdom|phylum|genus|species)\b/gi,
    titleKeywords: ["biology", "cell biology", "genetics", "ecology", "evolution", "microbiology", "molecular biology", "biochemistry"],
    minimumHits: 4,
  },
  {
    domain: "general-chemistry",
    pattern: /\b(atom|molecule|element|compound|bond|ionic|covalent|electron|proton|neutron|orbital|periodic|valence|electronegativity|polarity|acid|base|pH|buffer|oxidation|reduction|redox|equilibrium|constant|molarity|molality|stoichiometry|limiting reagent|theoretical yield|percent yield|enthalpy|entropy|Gibbs|thermodynamics|kinetics|activation energy|catalyst|ideal gas|avogadro|mole|molar mass|empirical formula|molecular formula|Lewis structure|VSEPR|hybridization|resonance|formal charge|solubility|precipitate|titration|indicator|colligative|vapor pressure|boiling point elevation|freezing point depression|osmotic pressure|electrolysis|galvanic|faraday|oxidation state|half.reaction|periodic table|group|period|alkali|alkaline|halogen|noble gas|transition metal)\b/gi,
    titleKeywords: ["general chemistry", "chemistry", "inorganic chemistry", "thermodynamics", "electrochemistry", "nuclear chemistry", "chemical"],
    minimumHits: 4,
    // Discount when heavy OChem vocabulary is present
    exclusionPattern: /\b(functional group|alkene|alkyne|aromatic|benzene|aldehyde|ketone|ester|amide|nucleophile|electrophile|carbocation|SN1|SN2|E1|E2|stereochemistry|chirality|enantiomer|diastereomer|stereocenter)\b/gi,
  },
  {
    domain: "organic-chemistry",
    pattern: /\b(functional group|alkane|alkene|alkyne|aromatic|benzene|alcohol|ether|aldehyde|ketone|carboxylic acid|ester|amide|amine|halide|substitution|elimination|addition|nucleophile|electrophile|carbocation|carbanion|radical|SN1|SN2|E1|E2|arrow pushing|stereochemistry|chirality|enantiomer|diastereomer|stereocenter|configuration|conformation|chair|boat|axial|equatorial|Newman projection|Fischer projection|resonance structure|delocalization|conjugation|aromaticity|hückel|retrosynthesis|protecting group|grignard|aldol|wittig|diels.alder|michael addition|beckmann|baeyer.villiger|regiochemistry|regioselectivity|enantioselective|diastereoselectivity)\b/gi,
    titleKeywords: ["organic chemistry", "organic", "orgo", "mechanisms", "synthesis", "stereochemistry"],
    minimumHits: 3,
  },
  {
    domain: "physics",
    pattern: /\b(force|velocity|acceleration|momentum|mass|kinetic energy|potential energy|work|power|newton|gravity|friction|tension|torque|angular momentum|rotational|moment of inertia|center of mass|simple harmonic|oscillation|wave|frequency|wavelength|amplitude|period|resonance|interference|diffraction|electromagnetic|electric field|magnetic field|charge|current|voltage|resistance|capacitance|inductance|circuit|ohm.s law|kirchhoff|carnot|fluid|bernoulli|viscosity|surface tension|reflection|refraction|lens|mirror|focal length|quantum|photon|photoelectric|uncertainty principle|schrödinger|wave function|nuclear|radioactive|half.life|special relativity|lorentz|maxwell|faraday|coulomb|doppler|snell.s law|young.s double slit|thin film interference)\b/gi,
    titleKeywords: ["physics", "mechanics", "electromagnetism", "thermodynamics", "quantum", "optics", "waves", "classical mechanics"],
    minimumHits: 4,
  },
  {
    domain: "anatomy",
    pattern: /\b(muscle|bone|nerve|artery|vein|organ|tissue|origin|insertion|innervation|blood supply|anatomical|superior|inferior|anterior|posterior|medial|lateral|proximal|distal|dorsal|ventral|sagittal|coronal|transverse|fascia|tendon|ligament|cartilage|joint|skull|vertebra|rib|pelvis|femur|tibia|fibula|humerus|radius|ulna|sternum|clavicle|scapula|brain|spinal cord|cranial nerve|brachial plexus|lumbar plexus|sympathetic|parasympathetic|dermatome|myotome|foramen|fossa|condyle|tubercle|canal|hiatus|anastomosis|lymphatic|thoracic duct|meninges|dura mater|arachnoid|pia mater|epidural|ventricle|choroid plexus|cerebellum|brainstem|hypothalamus|thalamus|basal ganglia|cortex|sulcus|gyrus|lobe)\b/gi,
    titleKeywords: ["anatomy", "anatomical", "dissection", "gross anatomy", "neuroanatomy", "histology", "embryology"],
    minimumHits: 4,
  },
  {
    domain: "law",
    pattern: /\b(statute|case law|court|plaintiff|defendant|attorney|counsel|judge|jury|verdict|ruling|precedent|common law|civil law|criminal law|tort|contract|property law|evidence|witness|testimony|motion|appeal|jurisdiction|standing|liability|damages|negligence|duty of care|breach|causation|strict liability|mens rea|actus reus|reasonable doubt|preponderance|discovery|deposition|subpoena|injunction|settlement|arbitration|mediation|statute of limitations|constitutional|due process|equal protection|federalism|judicial review|habeas corpus|stare decisis|ratio decidendi|obiter dictum|certiorari|unjust enrichment|promissory estoppel|consideration|offer and acceptance|revocation)\b/gi,
    titleKeywords: ["law", "legal", "jurisprudence", "constitutional law", "contracts", "torts", "criminal law", "property law", "evidence"],
    minimumHits: 3,
  },
  {
    domain: "history",
    pattern: /\b(war|revolution|empire|kingdom|dynasty|civilization|century|decade|ancient|medieval|modern|colonial|industrial|world war|cold war|president|king|queen|emperor|general|battle|treaty|independence|constitution|democracy|republic|monarchy|parliament|congress|election|colonization|imperialism|nationalism|socialism|capitalism|enlightenment|renaissance|reformation|feudalism|slavery|abolitionism|suffrage|civil rights|genocide|Holocaust|migration|trade route|exploration|settlement|indigenous|urbanization|industrialization|mechanization|silk road|crusade|plague|famine|mesopotamia|egypt|greece|rome|china|india|ottoman|byzantine|mongol|aztec|inca|maya)\b/gi,
    titleKeywords: ["history", "historical", "civilization", "world history", "american history", "european history", "ancient history"],
    minimumHits: 4,
  },
  {
    domain: "finance",
    pattern: /\b(revenue|profit|loss|income|expense|asset|liability|equity|balance sheet|income statement|cash flow|return on|investment|portfolio|risk|diversification|stock|bond|dividend|yield|interest rate|inflation|GDP|recession|market|valuation|P\/E ratio|EPS|EBITDA|debt|leverage|liquidity|solvency|working capital|NPV|IRR|discounted cash flow|DCF|break.even|gross margin|net margin|financial statement|accounting|audit|depreciation|amortization|hedge|derivative|option|futures|arbitrage|beta|alpha|Sharpe ratio|efficient market|CAPM|cost of capital|WACC|terminal value|credit|yield curve|duration|volatility|VaR|stress test)\b/gi,
    titleKeywords: ["finance", "financial", "economics", "accounting", "investment", "corporate finance", "financial markets"],
    minimumHits: 3,
  },
  {
    domain: "fiction",
    pattern: /\b(character|dialogue|plot|narrator|narrative|theme|protagonist|antagonist|setting|conflict|resolution|climax|foreshadow|metaphor|simile|imagery|symbolism|allegory|irony|satire|genre|stanza|rhyme|meter|prose|poetry|novel|story|fiction|nonfiction|memoir|biography|autobiography|literary|point of view|first person|third person|omniscient|unreliable narrator|stream of consciousness|bildungsroman|dystopia|utopia|tragedy|comedy|romance|thriller|mystery)\b/gi,
    titleKeywords: ["novel", "fiction", "literature", "poetry", "short stories", "drama", "narrative"],
    minimumHits: 4,
  },
];

// ── Scoring helpers ──────────────────────────────────────────────────────────

function countUniqueMatches(text: string, pattern: RegExp): string[] {
  const cloned = new RegExp(pattern.source, pattern.flags);
  const matches = text.match(cloned) ?? [];
  return [...new Set(matches.map(m => m.toLowerCase()))];
}

function scoreDomain(
  text: string,
  title: string,
  sig: DomainSignature,
): { score: number; evidence: string[] } {
  const textHits = countUniqueMatches(text, sig.pattern);
  // Normalize: each additional hit gives diminishing returns; 20+ unique hits → 1.0
  const textScore = Math.min(textHits.length / 20, 1);

  const titleLower = title.toLowerCase();
  const titleHits = sig.titleKeywords.filter(kw => titleLower.includes(kw.toLowerCase()));
  const titleBonus = titleHits.length > 0 ? 0.3 * Math.min(titleHits.length / 2, 1) : 0;

  // Discount score when exclusion patterns dominate (cross-domain contamination)
  const exclusionPenalty =
    sig.exclusionPattern && countUniqueMatches(text, sig.exclusionPattern).length >= 3
      ? 0.25
      : 0;

  const raw = textScore + titleBonus - exclusionPenalty;
  return {
    score:    Math.max(0, Math.min(1, raw)),
    evidence: [
      ...textHits.slice(0, 5).map(m => `term:${m}`),
      ...titleHits.map(kw => `title:${kw}`),
    ],
  };
}

// ── Public classifier API ────────────────────────────────────────────────────

/** Classify a single block of text (one page or concatenated paragraphs). */
export function classifyDomain(text: string, title = ""): ClassificationResult {
  const scores: Array<{ domain: SemanticDomain; score: number; evidence: string[] }> = [];

  for (const sig of DOMAIN_SIGNATURES) {
    const uniqueHits = countUniqueMatches(text, sig.pattern).length;
    const titleHits  = sig.titleKeywords.filter(kw => title.toLowerCase().includes(kw.toLowerCase()));
    // Must meet either the minimum body-text hit count OR have a title match
    if (uniqueHits < sig.minimumHits && titleHits.length === 0) continue;

    const { score, evidence } = scoreDomain(text, title, sig);
    if (score > 0) scores.push({ domain: sig.domain, score, evidence });
  }

  scores.sort((a, b) => b.score - a.score);

  const top = scores[0];
  if (!top || top.score < 0.1) {
    return { domain: "general", confidence: 0, evidence: [], classifierVersion: CLASSIFIER_VERSION };
  }

  const second = scores[1];
  const margin = second ? top.score - second.score : top.score;
  // Higher margin → higher confidence
  const confidence = Math.min(1, top.score * (1 + margin * 0.5));

  return {
    domain:            top.domain,
    confidence:        Math.round(confidence * 100) / 100,
    evidence:          top.evidence,
    classifierVersion: CLASSIFIER_VERSION,
  };
}

/**
 * Classify at chapter level by aggregating multiple pages.
 * The first page is weighted 2× (chapter headers and titles appear there).
 */
export function classifyChapter(
  pages: Array<{ text: string; title?: string }>,
  documentTitle = "",
): ClassificationResult {
  if (pages.length === 0) {
    return { domain: "general", confidence: 0, evidence: [], classifierVersion: CLASSIFIER_VERSION };
  }
  // Double the first page to weight chapter-opening titles and introductions
  const combined = pages.map((p, i) => (i === 0 ? p.text + " " + p.text : p.text)).join(" ");
  const firstTitle = pages[0]?.title ?? documentTitle;
  return classifyDomain(combined, firstTitle || documentTitle);
}

/**
 * Decide whether the active domain should switch based on a new result.
 * Switch rule: new confidence ≥ 0.75 AND margin over current ≥ 0.15.
 * (The "at least 3 substantive units" check is the caller's responsibility.)
 */
export function shouldSwitchDomain(
  currentDomain: SemanticDomain,
  currentConfidence: number,
  newResult: ClassificationResult,
): boolean {
  if (newResult.domain === currentDomain) return false;
  return (
    newResult.confidence >= 0.75 &&
    newResult.confidence - currentConfidence >= 0.15
  );
}
