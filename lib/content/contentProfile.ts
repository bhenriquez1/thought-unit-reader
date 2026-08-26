export type ContentProfileId =
  | "adult-textbook"
  | "math-textbook"
  | "child-story"
  | "child-comic";

export interface ContentProfile {
  id: ContentProfileId;
  label: string;
  highlightBudget: number;
  permanentHighlighting: boolean;
  navigationStyle: "native-outline" | "generated-story-map";
  teachingStyle: "professor" | "reading-coach";
}

const PROFILES: Record<ContentProfileId, ContentProfile> = {
  "adult-textbook": {
    id: "adult-textbook",
    label: "Textbook",
    highlightBudget: 6,
    permanentHighlighting: true,
    navigationStyle: "native-outline",
    teachingStyle: "professor",
  },
  "math-textbook": {
    id: "math-textbook",
    label: "Math textbook",
    highlightBudget: 5,
    permanentHighlighting: true,
    navigationStyle: "native-outline",
    teachingStyle: "professor",
  },
  "child-story": {
    id: "child-story",
    label: "Story book",
    highlightBudget: 2,
    permanentHighlighting: false,
    navigationStyle: "generated-story-map",
    teachingStyle: "reading-coach",
  },
  "child-comic": {
    id: "child-comic",
    label: "Comic reader",
    highlightBudget: 1,
    permanentHighlighting: false,
    navigationStyle: "generated-story-map",
    teachingStyle: "reading-coach",
  },
};

const MATH_TITLE_RE = /\b(calculus|algebra|geometry|trigonometry|statistics|mathematics|biocalculus)\b/i;
const CHILD_TITLE_RE = /\b(fox|comic|graphic novel|story|adventure|chapter book|picture book)\b/i;
const COMIC_TEXT_RE = /\b(ding dong|bam|pow|wham|slurp|whoosh)\b|(?:\b[A-Z]{2,}\b[!?.]*){2,}/i;
const STRONG_MATH_TEXT_RE = /[∫∑√∞≤≥≈]|\b(?:f|g|h)\s*\(\s*[a-z]\s*\)|\b(?:d[xy]\s*\/\s*d[xy]|lim\s*[_→]|[a-z]\s*=\s*[-+]?\d)/i;
const MATH_TERMS = [
  "domain", "range", "derivative", "integral", "equation", "graph",
  "function", "variable", "slope", "axis", "limit", "coordinate",
] as const;

/** Ordinary scientific prose often contains one overloaded word such as
 * "function", "range", or "graph". Require mathematical notation or several
 * corroborating terms before changing the entire notebook schema. */
function hasUnambiguousMathText(text: string): boolean {
  if (STRONG_MATH_TEXT_RE.test(text)) return true;
  const lower = text.toLowerCase();
  const matches = MATH_TERMS.filter((term) => new RegExp(`\\b${term}\\b`, "i").test(lower));
  const found = new Set(matches);
  const hasDomainRangePair = found.has("domain") && found.has("range");
  const hasTechnicalTerm = ["derivative", "integral", "equation", "slope", "axis", "limit", "coordinate"]
    .some((term) => found.has(term as typeof MATH_TERMS[number]));
  return found.size >= 3 && (hasDomainRangePair || hasTechnicalTerm);
}

export function detectContentProfile(input: {
  bookTitle?: string | null;
  pageText?: string | null;
  childMode?: boolean;
}): ContentProfile {
  const title = input.bookTitle ?? "";
  const text = input.pageText ?? "";

  if (input.childMode) {
    const comic = /\b(comic|graphic novel|banana fox)\b/i.test(title) || COMIC_TEXT_RE.test(text);
    return PROFILES[comic ? "child-comic" : "child-story"];
  }

  if (MATH_TITLE_RE.test(title) || hasUnambiguousMathText(text)) return PROFILES["math-textbook"];
  if (CHILD_TITLE_RE.test(title) && COMIC_TEXT_RE.test(text)) return PROFILES["child-comic"];
  return PROFILES["adult-textbook"];
}

export function getContentProfile(id: ContentProfileId): ContentProfile {
  return PROFILES[id];
}

export function isChildProfile(id: ContentProfileId): boolean {
  return id === "child-story" || id === "child-comic";
}
