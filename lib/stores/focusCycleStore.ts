import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { safeSetItem } from '@/lib/storage/safeStorage';
import { useCurrentLearningContext } from '../context/learningContext';

const quotaSafeStorage = {
  getItem: (key: string) => {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  setItem: (key: string, value: string) => { safeSetItem(key, value); },
  removeItem: (key: string) => {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  },
};

export type FocusPhaseType = 'learn' | 'consolidate' | 'synthesize' | 'review' | 'recall' | 'compare' | 'break';

export type FocusCyclePresetId = 'quick_pass' | 'standard_cycle' | 'deep_mode' | 'exam_review';

export interface FocusPhase {
  id: string;
  label: string;
  type: FocusPhaseType;
  durationMinutes: number;
}

export interface FocusCyclePreset {
  id: FocusCyclePresetId;
  label: string;
  phases: FocusPhase[];
}

export interface FocusPromptPack {
  phaseType: FocusPhaseType;
  title: string;
  prompts: string[];
}

const PRESETS: Record<FocusCyclePresetId, FocusCyclePreset> = {
  quick_pass: {
    id: 'quick_pass',
    label: 'Quick Pass',
    phases: [
      { id: 'quick_learn', label: 'Learn', type: 'learn', durationMinutes: 20 },
      { id: 'quick_recall', label: 'Recall', type: 'recall', durationMinutes: 5 },
      { id: 'quick_break', label: 'Break', type: 'break', durationMinutes: 5 },
    ],
  },
  standard_cycle: {
    id: 'standard_cycle',
    label: 'Standard Cycle',
    phases: [
      { id: 'std_learn', label: 'Learn', type: 'learn', durationMinutes: 30 },
      { id: 'std_consolidate', label: 'Consolidate', type: 'consolidate', durationMinutes: 10 },
      { id: 'std_recall', label: 'Recall', type: 'recall', durationMinutes: 5 },
      { id: 'std_break', label: 'Break', type: 'break', durationMinutes: 5 },
    ],
  },
  deep_mode: {
    id: 'deep_mode',
    label: 'Deep Mode',
    phases: [
      { id: 'deep_learn', label: 'Learn', type: 'learn', durationMinutes: 45 },
      { id: 'deep_synthesize', label: 'Synthesize', type: 'synthesize', durationMinutes: 10 },
      { id: 'deep_recall', label: 'Recall', type: 'recall', durationMinutes: 10 },
      { id: 'deep_break', label: 'Break', type: 'break', durationMinutes: 10 },
    ],
  },
  exam_review: {
    id: 'exam_review',
    label: 'Exam Review',
    phases: [
      { id: 'exam_review_phase', label: 'Review', type: 'review', durationMinutes: 15 },
      { id: 'exam_recall', label: 'Recall', type: 'recall', durationMinutes: 10 },
      { id: 'exam_compare', label: 'Compare', type: 'compare', durationMinutes: 10 },
      { id: 'exam_break', label: 'Break', type: 'break', durationMinutes: 5 },
    ],
  },
};

const phasePromptMap: Record<FocusPhaseType, FocusPromptPack | null> = {
  learn: {
    phaseType: 'learn',
    title: 'Learn block complete',
    prompts: [
      'What is the central idea in this section?',
      'What are the 3 most testable takeaways?',
      'What relationship or contrast matters most here?',
      'Would you like to save this synthesis into NoteLab?',
    ],
  },
  recall: {
    phaseType: 'recall',
    title: 'Recall block complete',
    prompts: [
      'Teach back the core idea in one sentence.',
      'Which connection between concepts is easiest to forget?',
      'What would likely confuse you on an exam?',
      'Run quick recall and compare prompts from your saved notes/cards.',
    ],
  },
  consolidate: null,
  synthesize: null,
  review: null,
  compare: null,
  break: null,
};

const toSeconds = (minutes: number) => minutes * 60;

export interface FocusCycleState {
  timerPreset: FocusCyclePresetId;
  timerPhase: number;
  timerRemainingSeconds: number;
  timerRunning: boolean;
  timerBoundDocumentId: string | null;
  timerBoundPage: number | null;
  timerBoundSectionId: string | null;
  lastPromptPack: FocusPromptPack | null;
  presets: Record<FocusCyclePresetId, FocusCyclePreset>;
  selectPreset: (preset: FocusCyclePresetId) => void;
  bindContext: (ctx: { documentId?: string | null; page?: number | null; sectionId?: string | null }) => void;
  start: () => void;
  pause: () => void;
  reset: () => void;
  skipPhase: () => void;
  tick: () => void;
  clearPromptPack: () => void;
}

export const useFocusCycleStore = create<FocusCycleState>()(
  persist(
    (set, get) => ({
      timerPreset: 'standard_cycle',
      timerPhase: 0,
      timerRemainingSeconds: toSeconds(PRESETS.standard_cycle.phases[0].durationMinutes),
      timerRunning: false,
      timerBoundDocumentId: null,
      timerBoundPage: null,
      timerBoundSectionId: null,
      lastPromptPack: null,
      presets: PRESETS,

      selectPreset: (preset) => {
        const firstPhase = PRESETS[preset].phases[0];
        set({
          timerPreset: preset,
          timerPhase: 0,
          timerRemainingSeconds: toSeconds(firstPhase.durationMinutes),
          timerRunning: false,
          lastPromptPack: null,
        });
      },

      bindContext: ({ documentId, page, sectionId }) => {
        set({
          timerBoundDocumentId: documentId ?? null,
          timerBoundPage: typeof page === 'number' ? page : null,
          timerBoundSectionId: sectionId ?? null,
        });
      },

      start: () => set({ timerRunning: true }),
      pause: () => set({ timerRunning: false }),

      reset: () => {
        const state = get();
        const phase = PRESETS[state.timerPreset].phases[state.timerPhase] ?? PRESETS[state.timerPreset].phases[0];
        set({
          timerRemainingSeconds: toSeconds(phase.durationMinutes),
          timerRunning: false,
          lastPromptPack: null,
        });
      },

      skipPhase: () => {
        const state = get();
        const preset = PRESETS[state.timerPreset];
        const currentPhase = preset.phases[state.timerPhase];
        const nextPhaseIndex = (state.timerPhase + 1) % preset.phases.length;
        const nextPhase = preset.phases[nextPhaseIndex];

        set({
          timerPhase: nextPhaseIndex,
          timerRemainingSeconds: toSeconds(nextPhase.durationMinutes),
          timerRunning: false,
          lastPromptPack: currentPhase ? phasePromptMap[currentPhase.type] : null,
        });
      },

      tick: () => {
        const state = get();
        if (!state.timerRunning) return;

        if (state.timerRemainingSeconds > 1) {
          set({ timerRemainingSeconds: state.timerRemainingSeconds - 1 });
          return;
        }

        const preset = PRESETS[state.timerPreset];
        const currentPhase = preset.phases[state.timerPhase];
        const nextPhaseIndex = (state.timerPhase + 1) % preset.phases.length;
        const nextPhase = preset.phases[nextPhaseIndex];

        set({
          timerPhase: nextPhaseIndex,
          timerRemainingSeconds: toSeconds(nextPhase.durationMinutes),
          timerRunning: false,
          lastPromptPack: currentPhase ? phasePromptMap[currentPhase.type] : null,
        });
      },

      clearPromptPack: () => set({ lastPromptPack: null }),
    }),
    {
      name: 'focus-cycle-store-v1',
      storage: createJSONStorage(() => quotaSafeStorage),
      partialize: (state) => ({
        timerPreset: state.timerPreset,
        timerPhase: state.timerPhase,
        timerRemainingSeconds: state.timerRemainingSeconds,
        // Persist as paused — on reload we correct for elapsed wall-clock time below.
        timerRunning: false,
        timerBoundDocumentId: state.timerBoundDocumentId,
        timerBoundPage: state.timerBoundPage,
        timerBoundSectionId: state.timerBoundSectionId,
        // Wall-clock snapshot so we can subtract elapsed seconds on rehydration.
        _persistedAt: state.timerRunning ? Date.now() : null,
      }),
      onRehydrateStorage: () => (hydratedState) => {
        if (!hydratedState) return;
        const { timerRunning, _persistedAt, timerRemainingSeconds } = hydratedState as any;
        if (timerRunning && typeof _persistedAt === "number") {
          // Correct remaining time for however long the tab was closed.
          const elapsedSeconds = Math.floor((Date.now() - _persistedAt) / 1000);
          const corrected = Math.max(0, timerRemainingSeconds - elapsedSeconds);
          useFocusCycleStore.setState({ timerRemainingSeconds: corrected, timerRunning: corrected > 0 });
        }
      },
    }
  )
);

// Phase 4 One Brain: auto-bind timer context to the current reading position.
// bindContext had zero callers; the CLC subscription activates it so the
// Focus Cycle card always reflects where the user is reading.
if (typeof window !== 'undefined') {
  useCurrentLearningContext.subscribe((state, prev) => {
    if (
      state.documentId !== prev.documentId ||
      state.currentPage !== prev.currentPage
    ) {
      useFocusCycleStore.getState().bindContext({
        documentId: state.documentId,
        page: state.currentPage,
      });
    }
  });
}
