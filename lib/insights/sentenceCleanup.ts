export function toCompleteSentence(input: string): string {
  const cleaned = normalizeSpaces(input)
    .replace(/\b([A-Za-z])\s*-\s*([A-Za-z])\b/g, "$1$2")
    .replace(/^[-•\s]+/, "")
    .trim();

  if (!cleaned) return "No clear sentence could be extracted from this page.";

  let sentence = cleaned;
  if (!/^[A-Z]/.test(sentence)) sentence = sentence.charAt(0).toUpperCase() + sentence.slice(1);
  if (!/[.!?]$/.test(sentence)) sentence = `${sentence}.`;

  if (looksFragmentary(sentence)) {
    return `This page indicates: ${sentence}`;
  }
  return sentence;
}

export function toGeneralSentence(input: string): string {
  return toCompleteSentence(input)
    .replace(/\btransillumination\b/gi, "strong focused light")
    .replace(/\bimplication\b/gi, "meaning");
}

export function toOperatorSentence(signal: string, action?: string): string {
  const base = toCompleteSentence(signal);
  if (!action) return `Signal: ${base}`;
  return `Signal: ${base} Next move: ${toCompleteSentence(action)}`;
}

export function toExpertSentence(input: string): string {
  const compressed = normalizeSpaces(input)
    .replace(/\b(can|may|might|usually|generally)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return toCompleteSentence(compressed);
}

function normalizeSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function looksFragmentary(value: string): boolean {
  const lower = value.toLowerCase();
  const hasVerb = /\b(is|are|was|were|be|reveals?|shows?|indicates?|suggests?|causes?|leads?|means?)\b/.test(lower);
  const hasSubjectLike = /\b(this|that|it|light|fracture|page|finding|signal|pattern|result|condition|rule)\b/.test(lower);
  return !(hasVerb && hasSubjectLike);
}
