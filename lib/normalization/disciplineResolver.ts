export type Discipline = 'math' | 'clinical' | 'law' | 'history' | 'science' | 'general';

const MATCHERS: Array<{ discipline: Discipline; pattern: RegExp }> = [
  { discipline: 'math', pattern: /\b(theorem|lemma|proof|equation|integral|derivative|matrix|algebra)\b/i },
  { discipline: 'clinical', pattern: /\b(patient|diagnosis|symptom|treatment|clinical|pathology|dose|prognosis)\b/i },
  { discipline: 'law', pattern: /\b(statute|doctrine|precedent|holding|rule|plaintiff|defendant|court)\b/i },
  { discipline: 'history', pattern: /\b(empire|war|century|treaty|revolution|dynasty|historian|timeline)\b/i },
  { discipline: 'science', pattern: /\b(experiment|hypothesis|variable|method|observation|result|mechanism)\b/i },
];

export function resolveDiscipline(text: string): Discipline {
  for (const matcher of MATCHERS) {
    if (matcher.pattern.test(text)) return matcher.discipline;
  }
  return 'general';
}
