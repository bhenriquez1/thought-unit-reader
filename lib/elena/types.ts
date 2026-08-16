// lib/elena/types.ts
// Canonical types for Elena Mode — a dedicated child-learning product.
//
// Elena Mode is NOT a LearningProfile value. It is NOT a rendering variant
// of Avrrio Reader. It is a separate product with its own workspace boundary,
// parent/child role separation, and persistence layer.
//
// Naming rules (enforced by tests):
//   - Internal stable names: ElenaMode, ChildLearningWorkspace, ChildProfile,
//     ParentDashboard, ChildContentSafetyPolicy
//   - Displayed copy uses the child's configured name via getChildDisplayCopy()
//   - Do NOT use "Elena" as a hard-coded label anywhere in runtime code

/* ─── Reading level ────────────────────────────────────────────────────────── */

export type ReadingLevel =
  | "emergent"        // pre-reader, letter recognition
  | "early"           // kindergarten–grade 1
  | "developing"      // grade 1–2
  | "transitional"    // grade 2–3
  | "fluent"          // grade 3–5
  | "advanced";       // grade 5+

/* ─── Age range ─────────────────────────────────────────────────────────────── */

export type ChildAgeRange =
  | "3-4"
  | "5-6"
  | "7-8"
  | "9-10"
  | "11-12";

/* ─── Accessibility preferences ─────────────────────────────────────────────── */

export type ChildAccessibilityPreferences = {
  /** Larger fonts, higher contrast, simplified layouts */
  highContrastMode:    boolean;
  /** Text-to-speech enabled by default */
  textToSpeech:        boolean;
  /** Reduce motion and animations */
  reducedMotion:       boolean;
  /** Dyslexia-friendly font */
  dyslexiaFont:        boolean;
};

/* ─── Child profile ──────────────────────────────────────────────────────────── */

/**
 * Core profile for a child learner in Elena Mode.
 * `displayName` is the name shown in the child-facing UI (via getChildDisplayCopy).
 * `preferredName` overrides displayName for in-session greetings when set.
 */
export type ChildProfile = {
  id:                      string;
  /** Full display name as entered by parent (e.g. "Elena") */
  displayName:             string;
  /** Short/nickname used in greetings — falls back to displayName when absent */
  preferredName?:          string;
  ageRange?:               ChildAgeRange;
  readingLevel?:           ReadingLevel;
  /** Topics and subjects the child enjoys (used for content recommendations) */
  interests:               string[];
  accessibilityPreferences: ChildAccessibilityPreferences;
  /** Links this child profile to the parent's account */
  parentAccountId:         string;
  createdAt:               string;
  updatedAt:               string;
};

/* ─── Content safety ─────────────────────────────────────────────────────────── */

export type ContentAgeRating = "all" | "5+" | "8+" | "12+";

export type ChildContentSafetyPolicy = {
  childProfileId:       string;
  maxAgeRating:         ContentAgeRating;
  /** Explicit block list of content tags (e.g. "violence", "adult-themes") */
  blockedTags:          string[];
  /** Whether AI-generated explanations must go through child-safe filtering */
  requireSafeFiltering: boolean;
  /** Whether parent must approve new books before child can access */
  requireParentApproval: boolean;
};

/* ─── Reading placement ──────────────────────────────────────────────────────── */

export type ReadingPlacementResult = {
  childProfileId:  string;
  placedLevel:     ReadingLevel;
  confidence:      number;  // 0–1
  assessedAt:      string;
  /** Which assessment pathway was used */
  method:          "screener" | "parent-reported" | "inferred-from-activity";
};

/* ─── Learning session ───────────────────────────────────────────────────────── */

export type ChildSessionActivity =
  | "reading"
  | "comprehension-quiz"
  | "vocabulary"
  | "read-aloud"
  | "exploration";

export type ChildLearningSession = {
  id:              string;
  childProfileId:  string;
  startedAt:       string;
  endedAt?:        string;
  activity:        ChildSessionActivity;
  bookId?:         string;
  /** Pages or sections completed during this session */
  pagesCompleted:  number;
  wordsRead?:      number;
};

/* ─── Progress ───────────────────────────────────────────────────────────────── */

export type ChildProgress = {
  childProfileId:   string;
  currentLevel:     ReadingLevel;
  booksCompleted:   number;
  totalSessions:    number;
  totalMinutes:     number;
  /** Running word-count across all sessions */
  totalWordsRead:   number;
  /** ISO date of most recent session */
  lastActiveAt:     string;
  updatedAt:        string;
};

/* ─── Reward state ───────────────────────────────────────────────────────────── */

/**
 * Reward state schema — fields intentionally minimal for groundwork PR.
 * Full reward engine (badges, streaks, achievements) comes in a later PR.
 */
export type ChildRewardState = {
  childProfileId:  string;
  totalStars:      number;
  /** Current reading streak in days */
  currentStreak:   number;
  longestStreak:   number;
  updatedAt:       string;
};

/* ─── Child-owned library ─────────────────────────────────────────────────────
 * A book a child has uploaded into their OWN Elena library. The PDF binary is
 * stored via the shared lib/db/documentStore.ts (the SAME storage the adult
 * Reader uses) — this record only tracks Elena-side identity and per-child
 * reading position. documentId is the canonical id used to build pageTruthKey
 * (lib/useActivePageIntelligence.ts's buildPageTruthKey), matching the rest
 * of the app.
 */

export type ChildLibraryEntry = {
  /** `${childProfileId}::${documentId}` — composite key, keeps reading position per child. */
  id:              string;
  childProfileId:  string;
  /** Canonical document identity — key into lib/db/documentStore.ts and pageTruthKey. */
  documentId:      string;
  title:           string;
  /** 0 until the viewer reports the real page count on first open. */
  totalPages:      number;
  /** 1-based, resumable reading position. */
  currentPage:     number;
  addedAt:         string;
  updatedAt:       string;
  lastOpenedAt:    string;
};

/* ─── Parent controls ────────────────────────────────────────────────────────── */

export type ParentControlSettings = {
  parentAccountId:     string;
  childProfileId:      string;
  /** Daily reading time limit in minutes; null = no limit */
  dailyTimeLimitMinutes: number | null;
  /** Hours of the day when the app is accessible (24h format) */
  accessHours?: {
    startHour: number;  // 0–23
    endHour:   number;  // 0–23
  };
  safetyPolicy:        ChildContentSafetyPolicy;
};
