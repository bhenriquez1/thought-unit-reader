// lib/intelligence/index.ts
export { scoreParagraph } from './scoring';
export type { ScoreResult } from './scoring';
export { detectClinicalReasoning } from './clinicalReasoning';
export type { ClinicalReasoningResult, ClinicalFlowNode, ClinicalFlowNodeType } from './clinicalReasoning';
export { applyMicroPolish, detectAwkwardPhrases } from './polish';
export type { PolishMode, PhraseFlag } from './polish';
export { orientParagraph, PURPOSE_TAG_CONFIG } from './orientation';
export type { OrientationHeader, PurposeTag, PurposeTagConfig } from './orientation';
export { adaptTone, polishAndAdapt, getSectionLabel, TONE_LABELS, TONE_DESCRIPTIONS } from './toneAdapter';
export type { ToneLevel } from './toneAdapter';
