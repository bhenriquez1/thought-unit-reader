import type { DisciplineType } from '@/types/comprehension';

const DISCIPLINE_PATTERNS: Array<{ discipline: DisciplineType; patterns: RegExp[] }> = [
  { discipline: 'dental_clinical', patterns: [/implant|occlusion|edentulous|periodont|gingiva|maxilla|mandib|prosthodont/i, /crown|abutment|alveolar|ridge/i] },
  { discipline: 'medical_clinical', patterns: [/diagnos|contraindicat|indicat|pathophysiology|treat(?:ment)?|symptom|clinical/i, /disease|patient|therapy|etiology|prognosis/i] },
  { discipline: 'law', patterns: [/holding|doctrine|liability|negligence|strict scrutiny|reasonable person|statute|precedent|rule|exception/i, /plaintiff|defendant|jurisdiction|constitutional|tort/i] },
  { discipline: 'mathematics', patterns: [/function|derivative|integral|limit|theorem|lemma|proof|f\(x\)|\bdy\/dx\b|\bsin\b|\bcos\b/i, /equation|variable|graph|slope|domain|range/i] },
  { discipline: 'history', patterns: [/century|empire|war|treaty|revolution|chronolog|timeline|regime|colonial|alliance/i, /cause|consequence|motivation|period|continuity|change/i] },
  { discipline: 'physics', patterns: [/velocity|acceleration|force|energy|momentum|quantum|thermodynamic|newton/i, /vector|mass|wavelength|frequency|field/i] },
  { discipline: 'chemistry', patterns: [/molecule|reaction|stoichiometry|molar|equilibrium|oxidation|acid|base|pH/i, /compound|bond|orbital|catalyst|polymer/i] },
  { discipline: 'biology', patterns: [/cell|genetic|enzyme|organism|evolution|metabolism|mitosis|meiosis/i, /protein|dna|rna|tissue|species|ecosystem/i] },
  { discipline: 'philosophy', patterns: [/epistemolog|ontology|metaphysic|ethics|normative|dialectic|phenomenolog/i, /argument|premise|conclusion|skeptic/i] },
  { discipline: 'technical_procedural', patterns: [/step\s*\d+|procedure|workflow|configure|install|calibrate|assemble|troubleshoot/i, /input|output|pipeline|precondition|postcondition/i] },
];

export function classifyDiscipline(input: { headingBlocks?: string[]; mergedText?: string; nearbyContext?: string }): DisciplineType {
  const text = [
    ...(input.headingBlocks ?? []),
    input.mergedText ?? '',
    input.nearbyContext ?? '',
  ].join(' ').slice(0, 6000);

  if (!text.trim()) return 'unknown';

  let best: { discipline: DisciplineType; score: number } = { discipline: 'unknown', score: 0 };

  for (const candidate of DISCIPLINE_PATTERNS) {
    const score = candidate.patterns.reduce((acc, regex) => acc + (regex.test(text) ? 1 : 0), 0);
    if (score > best.score) best = { discipline: candidate.discipline, score };
  }

  if (best.score === 0) return 'general_academic';
  return best.discipline;
}
