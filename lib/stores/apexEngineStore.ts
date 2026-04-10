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
  recommendNextAction,
  updatePatternReadiness,
} from "@/lib/apex/apexScoringEngine";

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

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

type ApexEngineStore = DatApexState & ApexEngineActions;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function uid(): string {
  return `apex_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function now(): string {
  return new Date().toISOString();
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
      patterns: typeof window !== "undefined" ? buildSeedPatterns() : [],
      patternReadiness: [],
      mistakes: [],
      traps: [],
      questionBank: { questions: [], attempts: [] },
      projection: null,
      currentRecommendation: null,
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
        const readiness: PatternReadiness[] = s.patterns.map((p) =>
          updatePatternReadiness(p, [], []),
        );
        const projection = buildDatProjection(s.sessions, s.scores, readiness, s.traps);
        const insights = buildAiInsights(s.mistakes, readiness, projection);
        const currentRecommendation = recommendNextAction(projection, readiness, s.traps);
        set({ patternReadiness: readiness, projection, insights, currentRecommendation });
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
        return localStorage;
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
        insights: s.insights,
      }),
      skipHydration: typeof window === "undefined",
    },
  ),
);
