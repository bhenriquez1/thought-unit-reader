// lib/adaptiveGuide/studentProfile.ts
// Student-profile model: reading history + recall history → learner state.
//
// The Adaptive Study Guide uses this to decide what a student needs RIGHT NOW,
// not just what the current page contains.

// ── Raw event types (what gets persisted) ─────────────────────────────────────

export interface ReadingSession {
  bookId: string;
  pageIndex: number;
  startedAt: number;    // Unix ms
  durationMs: number;   // wall-clock time on the page
}

export interface RecallAttempt {
  unitId: string;
  bookId: string;
  pageIndex: number;
  correct: boolean;
  attemptedAt: number;  // Unix ms
  /** ≥ 1: how many consecutive correct answers (reset to 0 on wrong) */
  streak: number;
}

// ── Derived learner state ─────────────────────────────────────────────────────

export type LearnerState =
  | "first-read"       // never visited this page
  | "second-read"      // visited before, no recall yet
  | "active-recall"    // has recall history, mostly correct
  | "needs-review";    // missed recall recently or mastery < 50%

export interface ConceptMastery {
  canonicalType: string;
  totalAttempts: number;
  correctAttempts: number;
  /** 0–100 */
  masteryPct: number;
  lastAttemptAt: number;
  /** Most recently wrong unitId — used to surface the specific weak item */
  lastMissedUnitId?: string;
}

export interface StudentProfile {
  bookId: string;
  /** Pages the student has visited (deduped, sorted ascending) */
  visitedPages: number[];
  /** Pages visited more than once */
  revisitedPages: number[];
  /** Total reading time across all sessions, ms */
  totalReadingMs: number;
  /** Per-concept-type mastery breakdown */
  masteryByType: ConceptMastery[];
  /** UnitIds the student got wrong most recently (last 7 days) */
  recentMisses: string[];
  /** UnitIds mastered (streak ≥ 3, last attempt correct) */
  masteredUnitIds: string[];
  /** 0–100 overall mastery for this book */
  overallMastery: number;
  /** When this profile was last computed */
  computedAt: number;
}

// ── Builder ───────────────────────────────────────────────────────────────────

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const MASTERY_STREAK = 3;

export function buildStudentProfile(
  bookId: string,
  sessions: ReadingSession[],
  recalls: RecallAttempt[],
): StudentProfile {
  const now = Date.now();
  const bookSessions = sessions.filter(s => s.bookId === bookId);
  const bookRecalls  = recalls.filter(r => r.bookId === bookId);

  // Visited pages
  const pageSet = new Set(bookSessions.map(s => s.pageIndex));
  const pageCount = new Map<number, number>();
  for (const s of bookSessions) pageCount.set(s.pageIndex, (pageCount.get(s.pageIndex) ?? 0) + 1);
  const visitedPages    = [...pageSet].sort((a, b) => a - b);
  const revisitedPages  = visitedPages.filter(p => (pageCount.get(p) ?? 0) > 1);
  const totalReadingMs  = bookSessions.reduce((acc, s) => acc + s.durationMs, 0);

  // Per-unit recall state
  const unitLatest = new Map<string, RecallAttempt>();
  for (const r of bookRecalls) {
    const prev = unitLatest.get(r.unitId);
    if (!prev || r.attemptedAt > prev.attemptedAt) unitLatest.set(r.unitId, r);
  }

  const masteredUnitIds: string[] = [];
  const recentMisses:   string[] = [];
  for (const [unitId, r] of unitLatest) {
    if (r.streak >= MASTERY_STREAK && r.correct) masteredUnitIds.push(unitId);
    if (!r.correct && now - r.attemptedAt <= SEVEN_DAYS_MS) recentMisses.push(unitId);
  }

  // Per-type mastery
  const typeMap = new Map<string, { total: number; correct: number; lastAt: number; lastMissed?: string }>();
  for (const r of bookRecalls) {
    // We don't have canonicalType on RecallAttempt directly, but we group by bookId/pageIndex
    // as a proxy. In practice the UI should store canonicalType on the attempt.
    const key = (r as RecallAttempt & { canonicalType?: string }).canonicalType ?? "unknown";
    const prev = typeMap.get(key) ?? { total: 0, correct: 0, lastAt: 0 };
    typeMap.set(key, {
      total:       prev.total + 1,
      correct:     prev.correct + (r.correct ? 1 : 0),
      lastAt:      Math.max(prev.lastAt, r.attemptedAt),
      lastMissed:  !r.correct ? r.unitId : prev.lastMissed,
    });
  }

  const masteryByType: ConceptMastery[] = [...typeMap.entries()].map(([canonicalType, d]) => ({
    canonicalType,
    totalAttempts:   d.total,
    correctAttempts: d.correct,
    masteryPct:      d.total === 0 ? 0 : Math.round((d.correct / d.total) * 100),
    lastAttemptAt:   d.lastAt,
    lastMissedUnitId: d.lastMissed,
  }));

  const overallMastery = masteryByType.length === 0
    ? 0
    : Math.round(masteryByType.reduce((s, t) => s + t.masteryPct, 0) / masteryByType.length);

  return {
    bookId,
    visitedPages,
    revisitedPages,
    totalReadingMs,
    masteryByType,
    recentMisses,
    masteredUnitIds,
    overallMastery,
    computedAt: now,
  };
}

// ── Classify learner state for a given page ───────────────────────────────────

export function classifyLearnerState(
  pageIndex: number,
  profile: StudentProfile,
): LearnerState {
  const hasVisited = profile.visitedPages.includes(pageIndex);
  if (!hasVisited) return "first-read";

  const hasRecall = profile.masteredUnitIds.length > 0 || profile.recentMisses.length > 0;
  if (!hasRecall) return "second-read";

  const hasMisses = profile.recentMisses.length > 0;
  if (hasMisses) return "needs-review";

  return "active-recall";
}
