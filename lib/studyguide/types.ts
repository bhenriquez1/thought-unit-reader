// lib/studyguide/types.ts

export type StudyGuideMode = 'dat' | 'dental' | 'topstudent' | 'examcram' | 'visual' | 'highyield';

export type ExamGoal = 'dat' | 'mcat' | 'dental-school' | 'medical-school' | 'nursing' | 'biology-exam' | 'custom';

export const EXAM_GOAL_LABELS: Record<ExamGoal, string> = {
  dat:             'DAT',
  mcat:            'MCAT',
  'dental-school': 'Dental School',
  'medical-school':'Medical School',
  nursing:         'Nursing',
  'biology-exam':  'Biology Exam',
  custom:          'Custom',
};

export const DAT_TARGET_SCORES = ['18', '20', '22', '25', '28+'] as const;
export type DatTargetScore = typeof DAT_TARGET_SCORES[number];

export type PriorityLevel = 'High' | 'Medium' | 'Low';

export const STUDY_GUIDE_MODE_LABELS: Record<StudyGuideMode, string> = {
  dat:        'DAT Master Notes',
  dental:     'Dental School Notes',
  topstudent: 'Top Student Notes',
  examcram:   'Exam Cram Mode',
  visual:     'Visual Learner Notes',
  highyield:  'High-Yield Notes',
};

export const STUDY_GUIDE_MODE_DESCRIPTIONS: Record<StudyGuideMode, string> = {
  dat:        'What would a 25 DAT student memorize? Stars, traps, and high-yield facts only.',
  dental:     'Clinical relevance first. Mechanisms, pathways, and board-level traps.',
  topstudent: 'The notebook a top student builds after 2 months of studying.',
  examcram:   'Minimum viable notes. Only what you cannot miss on exam day.',
  visual:     'Mechanism maps, flow diagrams, and Armando-style sketches.',
  highyield:  'Every sentence chosen because it appears on exams. Nothing decorative.',
};

export interface StudyGuideMechanism {
  title: string;
  steps: string[];
}

export interface StudyGuideOutput {
  chapterTitle: string;
  topic: string;
  priority: PriorityLevel;
  mustKnow: string[];
  datFacts: string[];
  mechanisms: StudyGuideMechanism[];
  traps: string[];
  recallQuestions: string[];
  memoryHooks: string[];
  dailyTasks: string[];
}

export interface StudyGuideRecord extends StudyGuideOutput {
  id: string;
  bookId: string;
  mode: StudyGuideMode;
  examGoal?: ExamGoal;
  targetScore?: string;
  sourceLabels: string[];
  createdAt: number;
}

export type StudyGuideSource = {
  label: string;
  text: string;
};
