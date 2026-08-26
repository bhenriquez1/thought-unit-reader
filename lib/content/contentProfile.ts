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
const MATH_TEXT_RE = /[∫∑√∞≤≥≈]|\bf\s*\(\s*x\s*\)|\b(domain|range|derivative|integral|function|equation|graph)\b/i;

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

  if (MATH_TITLE_RE.test(title) || MATH_TEXT_RE.test(text)) return PROFILES["math-textbook"];
  if (CHILD_TITLE_RE.test(title) && COMIC_TEXT_RE.test(text)) return PROFILES["child-comic"];
  return PROFILES["adult-textbook"];
}

export function getContentProfile(id: ContentProfileId): ContentProfile {
  return PROFILES[id];
}

export function isChildProfile(id: ContentProfileId): boolean {
  return id === "child-story" || id === "child-comic";
}

