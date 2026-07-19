// lib/stores/apexEngineStore.ts
// DAT Apex Engine Store — central state for scoring, patterns, sessions, questions
// Follows the same Zustand + localStorage persist pattern as pdrmStore.ts

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  ApexSection,
  DatApexState,
  DatProjection,
  GeneratedQuestion,
  MistakeRecord,
  MissReason,
  PatternReadiness,
  PracticeScore,
  StudySession,
  TrapRecord,
  UserPattern,
  UserQuestionAttempt,
} from "@/lib/apex/datApexTypes";
import {
  buildAiInsights,
  buildDatProjection,
  computeNextDifficulty,
  recommendNextAction,
  updatePatternReadiness,
} from "@/lib/apex/apexScoringEngine";

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

export type AdaptiveDifficulty = 'easy' | 'medium' | 'hard' | 'mixed';

interface ApexEngineActions {
  // Sessions
  startSession: (
    mode: StudySession["mode"],
    section: StudySession["section"],
  ) => string;
  endSession: (
    sessionId: string,
    result: Pick<StudySession, "correct" | "total" | "patternsTouched" | "trapsTriggered">,
  ) => void;

  // Scores
  recordScore: (score: Omit<PracticeScore, "id" | "createdAt">) => void;

  // Patterns
  upsertPattern: (pattern: Omit<UserPattern, "updatedAt">) => void;
  recordPatternAttempt: (
    patternId: string,
    correct: boolean,
    timeSeconds: number,
  ) => void;

  // Mistakes
  addMistake: (mistake: Omit<MistakeRecord, "id" | "createdAt">) => void;

  // Traps
  triggerTrap: (
    section: ApexSection,
    trapType: string,
    description: string,
    patternId?: string,
  ) => void;

  // Question bank
  saveGeneratedQuestion: (q: Omit<GeneratedQuestion, "id" | "createdAt">) => string;
  recordAttempt: (
    attempt: Omit<UserQuestionAttempt, "id" | "createdAt">,
  ) => void;

  // Engine recalculation (call after any significant change)
  recalculate: () => void;

  // Projection override (external set)
  setProjection: (p: DatProjection) => void;
}

type ApexEngineStore = DatApexState & { adaptiveDifficulty: AdaptiveDifficulty } & ApexEngineActions;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function uid(): string {
  return `apex_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function now(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Book-scoped persistence
// ---------------------------------------------------------------------------
// sessions/scores/questionBank are per-book (a student's DAT practice on one
// uploaded book shouldn't mix question history with another); patterns/
// patternReadiness/traps stay global so skill mastery (e.g. "equilibrium")
// keeps accumulating across every uploaded book. Both slices live under
// separate localStorage keys so they can have independent lifecycles even
// though Zustand persist only sees a single logical store.

const APEX_GLOBAL_KEY = "apex-engine-global-v1";
const GLOBAL_FIELDS = ["patterns", "patternReadiness", "traps", "projection", "currentRecommendation", "insights"] as const;
const BOOK_FIELDS = ["sessions", "scores", "questionBank"] as const;

let activeApexBookId = "global";

function apexBookKey(bookId: string): string {
  return `apex-engine-book-v1::${bookId}`;
}

function pick<T extends Record<string, unknown>>(obj: T, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = obj[k];
  return out;
}

const rawBookScopedStorage = {
  getItem(_name: string): string | null {
    const globalRaw = localStorage.getItem(APEX_GLOBAL_KEY);
    const bookRaw = localStorage.getItem(apexBookKey(activeApexBookId));
    if (!globalRaw && !bookRaw) return null;
    const globalParsed = globalRaw ? JSON.parse(globalRaw) : { state: {}, version: 0 };
    const bookParsed = bookRaw ? JSON.parse(bookRaw) : { state: {}, version: 0 };
    return JSON.stringify({
      state: { ...globalParsed.state, ...bookParsed.state },
      version: bookParsed.version ?? globalParsed.version ?? 0,
    });
  },
  setItem(_name: string, value: string): void {
    const parsed = JSON.parse(value);
    const state = parsed.state ?? {};
    localStorage.setItem(APEX_GLOBAL_KEY, JSON.stringify({ state: pick(state, GLOBAL_FIELDS), version: parsed.version }));
    localStorage.setItem(apexBookKey(activeApexBookId), JSON.stringify({ state: pick(state, BOOK_FIELDS), version: parsed.version }));
  },
  removeItem(_name: string): void {
    localStorage.removeItem(apexBookKey(activeApexBookId));
  },
};

/** Switches which uploaded book's sessions/scores/questionBank are active,
 *  then rehydrates the store from that book's localStorage slice. Global
 *  pattern-mastery data is unaffected. */
export function setActiveApexBook(bookId: string): void {
  activeApexBookId = bookId && bookId.trim() ? bookId : "global";
  void useApexEngineStore.persist.rehydrate();
}

export function getActiveApexBook(): string {
  return activeApexBookId;
}

function masteryLevel(timesSeen: number, timesCorrect: number): UserPattern["masteryLevel"] {
  if (timesSeen === 0) return "unseen";
  const r = timesCorrect / timesSeen;
  if (r >= 0.9 && timesSeen >= 5) return "mastered";
  if (r >= 0.75) return "strong";
  if (r >= 0.5) return "unstable";
  return "learning";
}

// ---------------------------------------------------------------------------
// Seed patterns — loaded from DAT_PATTERNS so the dashboard has data on day 1
// ---------------------------------------------------------------------------

import { DAT_PATTERN_MODULES } from "@/lib/apex/datApex.seed";

// Seed from DAT_PATTERN_MODULES — single source of truth shared with the generator and Learn tab.
// IDs here MUST match the ids in DAT_PATTERN_MODULES so recordPatternAttempt finds the right row.
function buildSeedPatterns(): UserPattern[] {
  return DAT_PATTERN_MODULES.map((m) => ({
    id: m.id,
    section: m.section,
    name: m.name,
    trigger: m.pattern,
    decisionRule: m.decisionRule,
    commonTrap: m.trap,
    masteryLevel: "unseen" as const,
    readiness: 0,
    timesSeen: 0,
    timesCorrect: 0,
    timesMissed: 0,
    avgTimeSeconds: 0,
    updatedAt: now(),
  }));
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useApexEngineStore = create<ApexEngineStore>()(
  persist(
    (set, get) => ({
      // Initial state
      sessions: [],
      scores: [],
      patterns: [] as UserPattern[],
      patternReadiness: [],
      mistakes: [],
      traps: [],
      questionBank: { questions: [], attempts: [] },
      projection: null,
      currentRecommendation: null,
      adaptiveDifficulty: 'mixed' as AdaptiveDifficulty,
      insights: [
        "Complete a practice session to unlock personalised insights.",
        "Start with Pattern Drill to build recognition speed.",
      ],

      // ------------------------------------------------------------------ //
      // Sessions
      // ------------------------------------------------------------------ //

      startSession: (mode, section) => {
        const id = uid();
        const session: StudySession = {
          id,
          mode,
          section,
          startedAt: now(),
          durationSeconds: 0,
          questionsSeen: 0,
          correct: 0,
          total: 0,
          patternsTouched: [],
          trapsTriggered: [],
        };
        set((s) => ({ sessions: [session, ...s.sessions].slice(0, 200) }));
        return id;
      },

      endSession: (sessionId, result) => {
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id === sessionId
              ? {
                  ...sess,
                  ...result,
                  endedAt: now(),
                  durationSeconds: Math.round(
                    (Date.now() - new Date(sess.startedAt).getTime()) / 1000,
                  ),
                }
              : sess,
          ),
        }));
        get().recalculate();
      },

      // ------------------------------------------------------------------ //
      // Scores
      // ------------------------------------------------------------------ //

      recordScore: (score) => {
        const entry: PracticeScore = { ...score, id: uid(), createdAt: now() };
        set((s) => ({ scores: [entry, ...s.scores].slice(0, 500) }));
        get().recalculate();
      },

      // ------------------------------------------------------------------ //
      // Patterns
      // ------------------------------------------------------------------ //

      upsertPattern: (pattern) => {
        set((s) => {
          const existing = s.patterns.find((p) => p.id === pattern.id);
          if (existing) {
            return {
              patterns: s.patterns.map((p) =>
                p.id === pattern.id ? { ...p, ...pattern, updatedAt: now() } : p,
              ),
            };
          }
          return {
            patterns: [{ ...pattern, updatedAt: now() }, ...s.patterns],
          };
        });
        get().recalculate();
      },

      recordPatternAttempt: (patternId, correct, timeSeconds) => {
        set((s) => {
          const updated = s.patterns.map((p) => {
            if (p.id !== patternId) return p;
            const timesSeen = p.timesSeen + 1;
            const timesCorrect = p.timesCorrect + (correct ? 1 : 0);
            const timesMissed = p.timesMissed + (correct ? 0 : 1);
            const avgTimeSeconds = p.avgTimeSeconds
              ? Math.round((p.avgTimeSeconds * p.timesSeen + timeSeconds) / timesSeen)
              : timeSeconds;
            return {
              ...p,
              timesSeen,
              timesCorrect,
              timesMissed,
              avgTimeSeconds,
              readiness: Math.round((timesCorrect / timesSeen) * 100),
              masteryLevel: masteryLevel(timesSeen, timesCorrect),
              updatedAt: now(),
            };
          });
          return { patterns: updated };
        });
      },

      // ------------------------------------------------------------------ //
      // Mistakes
      // ------------------------------------------------------------------ //

      addMistake: (mistake) => {
        const entry: MistakeRecord = { ...mistake, id: uid(), createdAt: now() };
        set((s) => ({ mistakes: [entry, ...s.mistakes].slice(0, 1000) }));
      },

      // ------------------------------------------------------------------ //
      // Traps
      // ------------------------------------------------------------------ //

      triggerTrap: (section, trapType, description, patternId) => {
        set((s) => {
          const existing = s.traps.find(
            (t) => t.section === section && t.trapType === trapType,
          );
          if (existing) {
            return {
              traps: s.traps.map((t) =>
                t.id === existing.id
                  ? { ...t, timesTriggered: t.timesTriggered + 1, lastTriggeredAt: now() }
                  : t,
              ),
            };
          }
          const entry: TrapRecord = {
            id: uid(),
            patternId,
            section,
            trapType,
            description,
            timesTriggered: 1,
            lastTriggeredAt: now(),
            severity: "medium",
          };
          return { traps: [entry, ...s.traps] };
        });
      },

      // ------------------------------------------------------------------ //
      // Question bank
      // ------------------------------------------------------------------ //

      saveGeneratedQuestion: (q) => {
        const id = uid();
        const question: GeneratedQuestion = { ...q, id, createdAt: now() };
        set((s) => ({
          questionBank: {
            ...s.questionBank,
            questions: [question, ...s.questionBank.questions].slice(0, 2000),
          },
        }));
        return id;
      },

      recordAttempt: (attempt) => {
        const entry: UserQuestionAttempt = {
          ...attempt,
          id: uid(),
          createdAt: now(),
        };
        set((s) => ({
          questionBank: {
            ...s.questionBank,
            attempts: [entry, ...s.questionBank.attempts].slice(0, 5000),
          },
        }));
        // Update pattern readiness
        get().recordPatternAttempt(attempt.patternId, attempt.correct, attempt.timeSeconds);
        if (!attempt.correct && attempt.trapTriggered) {
          get().triggerTrap(attempt.section as ApexSection, attempt.trapTriggered, attempt.trapTriggered, attempt.patternId);
        }
      },

      // ------------------------------------------------------------------ //
      // Recalculate projection + insights
      // ------------------------------------------------------------------ //

      recalculate: () => {
        const s = get();
        // Pass per-pattern recent attempt times so the speed metric uses real data.
        const readiness: PatternReadiness[] = s.patterns.map((p) => {
          const recentTimes = s.questionBank.attempts
            .filter(a => a.patternId === p.id)
            .slice(0, 20)
            .map(a => a.timeSeconds);
          return updatePatternReadiness(p, [], recentTimes);
        });
        const projection = buildDatProjection(s.sessions, s.scores, readiness, s.traps);
        const insights = buildAiInsights(s.mistakes, readiness, projection);
        const currentRecommendation = recommendNextAction(projection, readiness, s.traps);

        // Derive adaptive difficulty from recent session performance.
        let adaptiveDifficulty: AdaptiveDifficulty = 'mixed';
        if (s.sessions.length >= 2) {
          const recent = s.sessions.slice(0, 10);
          const recentAccuracy = recent.reduce(
            (sum, sess) => sum + (sess.total > 0 ? (sess.correct / sess.total) * 100 : 50), 0,
          ) / recent.length;
          const recentAvgTime = recent.reduce(
            (sum, sess) => sum + (sess.total > 0 ? sess.durationSeconds / sess.total : 70), 0,
          ) / recent.length;
          const avgTrapResistance = readiness.length
            ? readiness.reduce((sum, r) => sum + r.trapResistance, 0) / readiness.length
            : 50;
          const level = computeNextDifficulty(5, recentAccuracy, recentAvgTime, avgTrapResistance, false);
          adaptiveDifficulty = level <= 3 ? 'easy' : level <= 6 ? 'medium' : 'hard';
        }

        set({ patternReadiness: readiness, projection, insights, currentRecommendation, adaptiveDifficulty });
      },

      setProjection: (p) => set({ projection: p }),
    }),
    {
      name: "apex-engine-v2",
      storage: createJSONStorage(() => {
        if (typeof window === "undefined") {
          return {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
          };
        }
        return rawBookScopedStorage;
      }),
      partialize: (s) => ({
        sessions: s.sessions,
        scores: s.scores,
        patterns: s.patterns,
        patternReadiness: s.patternReadiness,
        mistakes: s.mistakes,
        traps: s.traps,
        questionBank: s.questionBank,
        projection: s.projection,
        currentRecommendation: s.currentRecommendation,
        adaptiveDifficulty: s.adaptiveDifficulty,
        insights: s.insights,
      }),
      skipHydration: typeof window === "undefined",
      // Seed pattern modules when localStorage has no prior pattern data so
      // the dashboard shows meaningful content on first visit without
      // triggering a server/client hydration mismatch (server always starts
      // with [] ; client seeding happens post-mount via rehydrate callback).
      onRehydrateStorage: () => (state) => {
        if (state && state.patterns.length === 0) {
          state.patterns = buildSeedPatterns();
        }
      },
    },
  ),
);
