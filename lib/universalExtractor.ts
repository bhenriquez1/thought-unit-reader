export type StopReason = 'exception_trigger' | 'attachment_trigger' | 'max_sentences' | 'end_of_text';

export interface ConceptOutput {
  id: string;
  core_sentence: string;
  exceptions: string[];
  sentence_count: number;
  stop_reason: StopReason;
  exception_triggers: string[];
  attachment_triggers: string[];
  source_sentences: string[];
}

export type PageClassification =
  | 'DEFINITION'
  | 'EXAMPLE'
  | 'PROCEDURE'
  | 'FIGURE'
  | 'EXERCISES'
  | 'NARRATIVE';

const EXCEPTION_TRIGGERS = [
  { id: 'A', pattern: /\bexcept\b|\bexception\b/i },
  { id: 'B', pattern: /\bunless\b/i },
  { id: 'C', pattern: /\bhowever\b|\bbut\b/i },
  { id: 'D', pattern: /\balthough\b|\beven though\b/i },
  { id: 'E', pattern: /\brarely\b|\brare\b|\buncommon\b/i },
  { id: 'F', pattern: /\bcontraindicated\b|\bwarning\b|\bcaution\b/i },
  { id: 'G', pattern: /\bif\b.+\bthen\b/i },
  { id: 'H', pattern: /\bedge case\b|\bspecial case\b/i }
] as const;

const ATTACHMENT_TRIGGERS = [
  { id: 'P', pattern: /\bpattern\b|\bprinciple\b|\brule\b/i },
  { id: 'X', pattern: /\bexample\b|\bfor instance\b|\be\.g\.\b/i },
  { id: 'V', pattern: /\bfigure\b|\bdiagram\b|\btable\b|\bchart\b|\bimage\b/i }
] as const;

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(Boolean);
}

function findTriggers(sentence: string, source: ReadonlyArray<{ id: string; pattern: RegExp }>): string[] {
  return source.filter(t => t.pattern.test(sentence)).map(t => t.id);
}

export function classifyPageText(text: string): PageClassification {
  const t = text.toLowerCase();
  if (/\bdefine|definition|means\b/.test(t)) return 'DEFINITION';
  if (/\bexample|case study|worked example\b/.test(t)) return 'EXAMPLE';
  if (/\bstep\s*\d|procedure|algorithm|first,|next,|finally\b/.test(t)) return 'PROCEDURE';
  if (/\bfigure\b|\bdiagram\b|\btable\b|\bimage\b/.test(t)) return 'FIGURE';
  if (/\bexercise\b|\bpractice\b|\bquestion\b|\bquiz\b/.test(t)) return 'EXERCISES';
  return 'NARRATIVE';
}

export function extractConcepts(text: string, maxSentencesPerConcept = 4): ConceptOutput[] {
  const sentences = splitSentences(text);
  const concepts: ConceptOutput[] = [];

  for (let i = 0; i < sentences.length; i += maxSentencesPerConcept) {
    const chunk = sentences.slice(i, i + maxSentencesPerConcept);
    if (!chunk.length) break;

    const core_sentence = chunk[0];
    const exceptions = chunk.slice(1).filter(s => findTriggers(s, EXCEPTION_TRIGGERS).length > 0);
    const exception_triggers = [...new Set(chunk.flatMap(s => findTriggers(s, EXCEPTION_TRIGGERS)))];
    const attachment_triggers = [...new Set(chunk.flatMap(s => findTriggers(s, ATTACHMENT_TRIGGERS)))];

    let stop_reason: StopReason = 'end_of_text';
    if (exception_triggers.length) stop_reason = 'exception_trigger';
    else if (attachment_triggers.length) stop_reason = 'attachment_trigger';
    else if (chunk.length === maxSentencesPerConcept) stop_reason = 'max_sentences';

    concepts.push({
      id: `concept-${i / maxSentencesPerConcept}`,
      core_sentence,
      exceptions,
      sentence_count: chunk.length,
      stop_reason,
      exception_triggers,
      attachment_triggers,
      source_sentences: chunk
    });
  }

  return concepts;
}
