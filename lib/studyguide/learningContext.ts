// lib/studyguide/learningContext.ts
// Persists the learner's profession and stage selection across sessions.

import type { LearnerProfession, LearnerStage } from './types';

const PROFESSION_KEY = 'study_guide_profession';
const STAGE_KEY      = 'study_guide_learner_stage';

export function getStoredProfession(): LearnerProfession {
  if (typeof window === 'undefined') return 'general';
  try {
    const v = localStorage.getItem(PROFESSION_KEY);
    if (v && ['general','dental-student','dental-resident','medical-student','surgeon','pilot','chemistry-student'].includes(v))
      return v as LearnerProfession;
  } catch { /* ignore */ }
  return 'general';
}

export function setStoredProfession(p: LearnerProfession): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(PROFESSION_KEY, p); } catch { /* ignore */ }
}

export function getStoredLearnerStage(): LearnerStage {
  if (typeof window === 'undefined') return 'student';
  try {
    const v = localStorage.getItem(STAGE_KEY);
    if (v && ['student','resident','professional'].includes(v)) return v as LearnerStage;
  } catch { /* ignore */ }
  return 'student';
}

export function setStoredLearnerStage(s: LearnerStage): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(STAGE_KEY, s); } catch { /* ignore */ }
}
