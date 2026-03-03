// lib/intelligence/toneAdapter.ts
// Tone Adaptation — Polish | Student | Clinical | Expert
//
// Transforms a clinical insight string to the target comprehension level
// without altering factual content.
//
// Student  → simple wording, shorter sentences, minimal jargon
// Clinical → academic tone, precise terminology, structured reasoning (DEFAULT)
// Expert   → condensed professional language, dense conceptual phrasing

// ============================================================================
// Types
// ============================================================================

export type ToneLevel = 'polish' | 'student' | 'clinical' | 'expert';

export const TONE_LABELS: Record<ToneLevel, string> = {
  polish:   'Polish',
  student:  'Student',
  clinical: 'Clinical',
  expert:   'Expert',
};

export const TONE_DESCRIPTIONS: Record<ToneLevel, string> = {
  polish:   'Improves wording and flow without changing factual meaning',
  student:  'Simple wording, basic explanations, minimal jargon',
  clinical: 'Academic tone, precise terminology, structured reasoning',
  expert:   'Condensed professional language, assumes prior knowledge',
};

// ============================================================================
// Vocabulary maps
// ============================================================================

// Expert → Student simplifications (applied for student mode)
const TO_STUDENT: [RegExp, string][] = [
  [/\belicit(s|ed|ing)?\b/gi, 'gather'],
  [/\bsubjective (findings?|data|information)\b/gi, 'patient-reported symptoms'],
  [/\bobjective (findings?|data|information)\b/gi, 'test results'],
  [/\bdiagnostic synthesis\b/gi, 'putting the diagnosis together'],
  [/\bformulat(e|ing|ion)\b/gi, 'create'],
  [/\bpertinent\b/gi, 'relevant'],
  [/\bintegrat(e|ed|ing)\b/gi, 'combine'],
  [/\bestablish(ing)? (an?|the) (accurate )?diagnosis\b/gi, 'make a diagnosis'],
  [/\bclinician\b/gi, 'doctor'],
  [/\bphysician\b/gi, 'doctor'],
  [/\bhistory[\s-]taking\b/gi, 'asking questions'],
  [/\bauscultation\b/gi, 'listening with a stethoscope'],
  [/\bpalpation\b/gi, 'feeling the area'],
  [/\bpercussion\b/gi, 'tapping to check for sounds'],
  [/\bpathognomonic\b/gi, 'a definitive sign'],
  [/\bgold standard\b/gi, 'the best test'],
  [/\bfirst[- ]line\b/gi, 'the first choice'],
  [/\bdifferential (diagnosis)?\b/gi, 'list of possible diagnoses'],
  [/\bsequelae\b/gi, 'complications'],
  [/\bcomorbid(ity|ities)?\b/gi, 'other conditions'],
];

// Student/Clinical → Expert condensations (applied for expert mode)
const TO_EXPERT: [RegExp, string][] = [
  [/\bgather (subjective |patient-reported )?(symptoms|information|data)\b/gi, 'elicit subjective data'],
  [/\bput(ting)? (the )?diagnosis together\b/gi, 'diagnostic synthesis'],
  [/\bmake (a|the) diagnosis\b/gi, 'establish diagnosis'],
  [/\basket(ing)? questions\b/gi, 'history-taking'],
  [/\blist of possible diagnoses\b/gi, 'differential diagnosis'],
  [/\bthe best test\b/gi, 'gold standard'],
  [/\bfirst choice\b/gi, 'first-line'],
  [/\bdoctor\b/gi, 'clinician'],
  [/\bcombine\b/gi, 'integrate'],
  [/\brelevant\b/gi, 'pertinent'],
  [/\bcreate\b/gi, 'formulate'],
  [/\bcomplicat(ion|ions)\b/gi, 'sequelae'],
];

// ============================================================================
// Sentence-level tone transforms
// ============================================================================

/** Simplify sentence structure for Student mode (target ≤20 words/sentence) */
function simplifyForStudent(text: string): string {
  let out = text;
  // Apply vocabulary simplifications
  for (const [re, replacement] of TO_STUDENT) {
    re.lastIndex = 0;
    out = out.replace(re, replacement);
  }
  // Add bridging phrase if text starts with a noun phrase (no subject context)
  out = out.replace(/^(The clinician|The doctor|Clinician)/i, 'A doctor');
  return out;
}

/** Condense for Expert mode */
function condenseForExpert(text: string): string {
  let out = text;
  for (const [re, replacement] of TO_EXPERT) {
    re.lastIndex = 0;
    out = out.replace(re, replacement);
  }
  // Remove filler lead-ins
  out = out.replace(/^(Note that|It is important to note that|It should be noted that)\s*/i, '');
  out = out.replace(/^(Importantly,)\s*/i, '');
  return out;
}

// ============================================================================
// Section-level adapters — per Gold Standard section
// ============================================================================

const SECTION_INTROS: Record<ToneLevel, Record<string, string>> = {
  polish: {
    corePrinciple:       'Core Principle',
    mechanism:           'Mechanism',
    clinicalSignificance: 'Clinical Significance',
    whyItMatters:        'Why It Matters',
    examRelevance:       'Exam Relevance',
  },
  student: {
    corePrinciple:       'The main idea is:',
    mechanism:           'Here is how it works:',
    clinicalSignificance: 'Why this matters in practice:',
    whyItMatters:        'Why you should know this:',
    examRelevance:       'This will likely appear on the exam:',
  },
  clinical: {
    corePrinciple:       'Core Principle',
    mechanism:           'Mechanism',
    clinicalSignificance: 'Clinical Significance',
    whyItMatters:        'Why It Matters',
    examRelevance:       'Exam Relevance',
  },
  expert: {
    corePrinciple:       'Principle',
    mechanism:           'Pathophysiology',
    clinicalSignificance: 'Clinical Implication',
    whyItMatters:        'Rationale',
    examRelevance:       'High-Yield',
  },
};

export function getSectionLabel(tone: ToneLevel, section: keyof typeof SECTION_INTROS['clinical']): string {
  return SECTION_INTROS[tone]?.[section] ?? section;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Adapt a paragraph insight to the target tone level.
 * Clinical (default) returns the text unchanged.
 */
export function adaptTone(text: string, tone: ToneLevel): string {
  if (!text) return text;
  switch (tone) {
    case 'student':  return simplifyForStudent(text);
    case 'expert':   return condenseForExpert(text);
    case 'polish':
    case 'clinical':
    default:         return text;
  }
}

/**
 * Apply both micro polish and tone adaptation in the correct order.
 * Polish runs first (grammar fix), then tone adaptation (vocabulary).
 */
export function polishAndAdapt(
  text: string,
  polishEnabled: boolean,
  tone: ToneLevel,
  applyPolish: (t: string) => string,
): string {
  const polished = polishEnabled ? applyPolish(text) : text;
  return adaptTone(polished, tone);
}
