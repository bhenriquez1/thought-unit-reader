export function cleanSentence(input: string): string {
  if (!input) return "";

  let sentence = input;
  sentence = sentence.replace(/\n+/g, " ");
  sentence = sentence.replace(/(\w+)-\s+(\w+)/g, "$1$2");
  sentence = sentence.replace(/\s+/g, " ").trim();
  sentence = sentence.replace(/^(and|or|but|so|because|whereas)\s+/i, "");

  if (sentence.length > 0) {
    sentence = sentence.charAt(0).toUpperCase() + sentence.slice(1);
  }

  if (sentence && !/[.!?]$/.test(sentence)) {
    sentence += ".";
  }

  return sentence;
}

export function completeFragment(input: string): string {
  const sentence = cleanSentence(input);
  if (!sentence) return "";

  const tooShort = sentence.split(" ").length < 5;
  const noVerb = !/(is|are|was|were|may|can|will|should|reveals?|indicates?|shows?|suggests?|means?|requires?)/i.test(sentence);

  if (tooShort || noVerb) {
    return `This indicates that ${sentence.charAt(0).toLowerCase()}${sentence.slice(1)}`;
  }

  return sentence;
}

export function roleSentence(input: string, role: "general" | "operator" | "expert"): string {
  const base = completeFragment(input);

  switch (role) {
    case "general":
      return base;
    case "operator":
      return cleanSentence(base.replace(/^This indicates that\s*/i, ""));
    case "expert":
      return cleanSentence(base.replace(/^This indicates that\s*/i, "").replace(/\bthe\b\s*/gi, "").trim());
    default:
      return base;
  }
}

export const toGeneralSentence = (input: string) => roleSentence(input, "general");
export const toOperatorSentence = (input: string) => roleSentence(input, "operator");
export const toExpertSentence = (input: string) => roleSentence(input, "expert");

export const cleanupSentence = cleanSentence;
