// lib/syllabus/documentClassifier.ts
// Heuristic document classifier — runs client-side before AI generation.
// Scores each discipline category from filename, TOC titles, and optional sample text.
// Returns the best match with a confidence score and an ExpertProfile mapping.

import type { DocumentClassification } from "./syllabusSchema";

// ── Discipline definitions ────────────────────────────────────────────────

interface DisciplineRule {
  docType:   string;
  discipline: string;
  profileId:  string;
  patterns:   RegExp[];
  weight:     number;   // base weight — higher = stronger match per hit
}

const DISCIPLINE_RULES: DisciplineRule[] = [
  // Medical / clinical
  {
    docType: "Medical Textbook", discipline: "Medicine", profileId: "nursing",
    weight: 3,
    patterns: [/medical|medicine|clinical|pathology|pharmacology|anatomy|physiology|biochemistry|histology|microbiology|immunology|neurology|cardiology|oncology|radiology|surgery|obstetric|pediatric|internal medicine|harrison|gray's anatomy|robbins/i],
  },
  // Dental
  {
    docType: "Dental Textbook", discipline: "Dentistry", profileId: "dental",
    weight: 4,
    patterns: [/dental|dent|dentistry|oral|prosthodontic|endodontic|periodontic|orthodontic|pedodontic|oral surgery|oral medicine|oral pathology|tooth|teeth/i],
  },
  // Nursing / Pharmacology
  {
    docType: "Nursing / Pharmacology", discipline: "Nursing", profileId: "nursing",
    weight: 3,
    patterns: [/nursing|nclex|pharmacology|drug therapy|patient care|clinical nursing|kaplan nursing|saunders|dosage calculation|nurse/i],
  },
  // Pharmacy / Veterinary
  {
    docType: "Pharmacy / Veterinary", discipline: "Health Sciences", profileId: "nursing",
    weight: 2,
    patterns: [/pharmacy|pharmaceutical|veterinary|veterinarian|veterinary medicine|drug dispensing/i],
  },
  // DAT / Pre-dental exam
  {
    docType: "DAT Preparation", discipline: "Pre-Dental", profileId: "dat",
    weight: 5,
    patterns: [/\bdat\b|dental admission test|kaplan dat|princeton review dat|crack the dat|dat prep/i],
  },
  // MCAT / Pre-med exam
  {
    docType: "MCAT Preparation", discipline: "Pre-Medical", profileId: "biology",
    weight: 5,
    patterns: [/mcat|medical college admission|kaplan mcat|princeton review mcat|examkrackers/i],
  },
  // Board review
  {
    docType: "Board Review / Certification", discipline: "Medicine", profileId: "nursing",
    weight: 3,
    patterns: [/board review|usmle|step 1|step 2|step 3|nbde|naplex|nclex|first aid for|comprehensive review|high-yield|high yield|rapid review/i],
  },
  // Organic Chemistry
  {
    docType: "Organic Chemistry Textbook", discipline: "Chemistry", profileId: "chemistry",
    weight: 4,
    patterns: [/organic chemistry|orgo|organic reactions|stereochemistry|carbonyl|aromatic|wade|clayden|klein organic|mcmurry organic/i],
  },
  // General Chemistry
  {
    docType: "Chemistry Textbook", discipline: "Chemistry", profileId: "chemistry",
    weight: 3,
    patterns: [/chemistry|chemical|stoichiometry|thermodynamics|equilibrium|electrochemistry|zumdahl|silberberg|chang chemistry|tro chemistry/i],
  },
  // Biochemistry
  {
    docType: "Biochemistry Textbook", discipline: "Biochemistry", profileId: "chemistry",
    weight: 3,
    patterns: [/biochemistry|molecular biology|lehninger|stryer|nelson cox|garrett grisham|amino acid|enzyme kinetics|metabolic pathway/i],
  },
  // Biology
  {
    docType: "Biology Textbook", discipline: "Biology", profileId: "biology",
    weight: 3,
    patterns: [/biology|cell biology|genetics|evolution|ecology|campbell biology|molecular biology|microbiology|botany|zoology|campbell|reece/i],
  },
  // Physics
  {
    docType: "Physics Textbook", discipline: "Physics", profileId: "physics",
    weight: 3,
    patterns: [/physics|mechanics|electromagnetism|thermodynamics|quantum|optics|relativity|halliday|serway|giancoli|young university physics/i],
  },
  // Mathematics
  {
    docType: "Mathematics Textbook", discipline: "Mathematics", profileId: "math",
    weight: 3,
    patterns: [/calculus|linear algebra|differential equations|statistics|probability|discrete math|abstract algebra|real analysis|topology|numerical analysis|stewart calculus/i],
  },
  // Computer Science / Programming
  {
    docType: "Computer Science / Programming", discipline: "Computer Science", profileId: "cs",
    weight: 3,
    patterns: [/computer science|programming|algorithm|data structure|software engineering|operating system|database|network|machine learning|artificial intelligence|python|javascript|java|c\+\+|the pragmatic|clean code|design patterns|cracking the coding/i],
  },
  // Engineering
  {
    docType: "Engineering Textbook", discipline: "Engineering", profileId: "physics",
    weight: 2,
    patterns: [/engineering|electrical circuits|structural analysis|fluid mechanics|thermodynamics of engineering|materials science|statics|dynamics|signals systems/i],
  },
  // Law
  {
    docType: "Law Textbook", discipline: "Law", profileId: "law",
    weight: 4,
    patterns: [/law|legal|constitution|tort|contract|criminal law|civil procedure|evidence law|property law|administrative law|jurisprudence|black letter|barbri|law school/i],
  },
  // Business / Management
  {
    docType: "Business / Management", discipline: "Business", profileId: "general",
    weight: 2,
    patterns: [/business|management|marketing|operations|supply chain|organizational behavior|strategic management|mba|case study|harvard business/i],
  },
  // Economics
  {
    docType: "Economics Textbook", discipline: "Economics", profileId: "general",
    weight: 3,
    patterns: [/economics|microeconomics|macroeconomics|econometrics|game theory|mankiw|samuelson|krugman economics|principles of economics/i],
  },
  // Finance / Accounting
  {
    docType: "Finance / Accounting", discipline: "Finance", profileId: "general",
    weight: 3,
    patterns: [/finance|accounting|financial statement|balance sheet|income statement|valuation|cfa|cpa|financial modeling|corporate finance|brealey|damodaran/i],
  },
  // Psychology
  {
    docType: "Psychology Textbook", discipline: "Psychology", profileId: "general",
    weight: 3,
    patterns: [/psychology|psycholog|cognition|developmental|abnormal|social psychology|myers psychology|personality|cognitive neuroscience|behavioral/i],
  },
  // Sociology / Anthropology
  {
    docType: "Social Science Textbook", discipline: "Social Sciences", profileId: "general",
    weight: 2,
    patterns: [/sociology|anthropology|social theory|culture|ethnography|gender studies|race and ethnicity|mass media|social research/i],
  },
  // History
  {
    docType: "History Textbook", discipline: "History", profileId: "history",
    weight: 3,
    patterns: [/history|historical|world war|revolution|empire|civilization|ancient|medieval|modern history|american history|european history|cold war|colonial/i],
  },
  // Literature / Philosophy
  {
    docType: "Literature / Philosophy", discipline: "Humanities", profileId: "history",
    weight: 2,
    patterns: [/literature|philosophy|literary analysis|fiction|poetry|rhetoric|ethics|metaphysics|epistemology|logic|aesthetics|plato|aristotle|kant|nietzsche/i],
  },
  // Language learning
  {
    docType: "Language Learning", discipline: "Languages", profileId: "general",
    weight: 3,
    patterns: [/spanish|french|german|chinese|japanese|korean|arabic|portuguese|italian|language learning|vocabulary|grammar exercises|duolingo|rosetta/i],
  },
  // Architecture / Design
  {
    docType: "Architecture / Design", discipline: "Design", profileId: "general",
    weight: 2,
    patterns: [/architecture|architectural|urban design|interior design|structural design|are exam|ncidq|architectural history/i],
  },
  // Lab manual
  {
    docType: "Lab Manual", discipline: "Science", profileId: "biology",
    weight: 3,
    patterns: [/lab manual|laboratory|experiment|protocol|lab report|lab guide|practical guide|lab technique|student lab/i],
  },
  // Research paper / Thesis
  {
    docType: "Research Paper / Thesis", discipline: "Research", profileId: "general",
    weight: 3,
    patterns: [/thesis|dissertation|abstract|introduction.*methods.*results.*discussion|literature review|research methodology|systematic review|meta-analysis/i],
  },
  // Technical documentation
  {
    docType: "Technical Documentation", discipline: "Technology", profileId: "cs",
    weight: 3,
    patterns: [/api reference|technical specification|user manual|installation guide|configuration guide|developer guide|system architecture|release notes/i],
  },
  // Standards / Specifications
  {
    docType: "Standards / Specifications", discipline: "Engineering", profileId: "general",
    weight: 3,
    patterns: [/iso \d+|ieee \d+|ansi |nist |astm |din \d+|standard specification|technical standard|code of practice/i],
  },
];

// ── Classifier ────────────────────────────────────────────────────────────

export function classifyDocument(
  filename: string,
  tocTitles: string[],
  sampleText?: string,
): DocumentClassification {
  const scores = new Map<number, number>();  // index → score

  function scoreText(text: string, weight: number) {
    DISCIPLINE_RULES.forEach((rule, i) => {
      if (rule.patterns.some(p => p.test(text))) {
        scores.set(i, (scores.get(i) ?? 0) + rule.weight * weight);
      }
    });
  }

  // Filename gets highest weight — explicit naming is a strong signal
  scoreText(filename, 3.0);

  // TOC titles collectively — medium weight per title, but many titles compound
  const tocJoined = tocTitles.slice(0, 60).join(" ");
  scoreText(tocJoined, 1.5);

  // Sample text — lower weight (content may overlap many domains)
  if (sampleText) {
    scoreText(sampleText.slice(0, 3000), 0.8);
  }

  // Find best match
  let bestIdx    = -1;
  let bestScore  = 0;
  let totalScore = 0;
  scores.forEach((score, idx) => {
    totalScore += score;
    if (score > bestScore) {
      bestScore = score;
      bestIdx   = idx;
    }
  });

  if (bestIdx === -1 || bestScore === 0) {
    return {
      docType:             "General / Unknown",
      discipline:          "General",
      isMultiDisciplinary: false,
      confidence:          0.25,
      signal:              "no domain keywords matched filename or table of contents",
      detectedProfileId:   "general",
    };
  }

  const rule         = DISCIPLINE_RULES[bestIdx];
  // Confidence: ratio of best score to total, capped at 0.95
  const rawConf      = Math.min(0.95, bestScore / Math.max(totalScore, 1));
  // Boost confidence slightly for unambiguous high-weight matches
  const confidence   = Math.round((rawConf + (bestScore >= 8 ? 0.1 : 0)) * 100) / 100;

  // Multi-disciplinary: if second-best score is > 50% of best
  let secondBest = 0;
  scores.forEach((score, idx) => {
    if (idx !== bestIdx && score > secondBest) secondBest = score;
  });
  const isMultiDisciplinary = secondBest >= bestScore * 0.5;

  // Build signal string
  const filenameHit = rule.patterns.some(p => p.test(filename));
  const tocHit      = rule.patterns.some(p => p.test(tocJoined));
  const signal      = filenameHit
    ? `matched "${rule.docType}" keywords in filename`
    : tocHit
      ? `matched "${rule.docType}" keywords in table of contents`
      : `matched "${rule.docType}" keywords in document content`;

  return {
    docType:             rule.docType,
    discipline:          rule.discipline,
    isMultiDisciplinary,
    confidence:          Math.min(0.95, confidence),
    signal,
    detectedProfileId:   rule.profileId,
  };
}
