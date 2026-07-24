// DAT Apex - Practice Exam Generator Types
// Comprehensive data models for Dental Admission Test practice system

export interface DATSection {
  id: string;
  name: string;
  shortName: string;
  timeLimit: number; // minutes
  questionCount: number;
  description: string;
  topics: string[];
}

export interface DATQuestion {
  id: string;
  sectionId: string;
  topic: string;
  subtopic?: string;
  difficulty: 'easy' | 'medium' | 'hard';
  questionType: 'multiple-choice' | 'quantitative' | 'reading-comprehension';
  
  // Question content
  stem: string;
  options: {
    A: string;
    B: string;
    C: string;
    D: string;
    E?: string; // Some sections have 5 options
  };
  correctAnswer: 'A' | 'B' | 'C' | 'D' | 'E';
  
  // Enhanced explanations
  explanation: string;
  tuExplanation?: string; // Thought-Unit enhanced explanation
  keyTerms: string[];
  relatedConcepts: string[];
  
  // Metadata
  estimatedTime: number; // seconds
  tags: string[];
  source?: string;
  lastUpdated: string;

  // Universal Exam Engine fields — only populated for AI-generated questions
  // (lib/examEngine/legacyAdapter.ts). Optional so static/legacy questions
  // built before the engine existed still satisfy this type.
  whyWrong?: string[];
  trapType?: string;
  engineQuestionType?: string;
  sourceBookId?: string;
  sourcePageNumber?: number;
  /** CanonicalThoughtUnit IDs this question was generated from.
   *  Enables "View Source in Reader" navigation. */
  sourceThoughtUnitIds?: string[];
}

export interface ExamConfiguration {
  id: string;
  name: string;
  description: string;
  
  // Section configuration
  sections: {
    sectionId: string;
    enabled: boolean;
    questionCount: number;
    timeLimit: number; // can override default
    customTopics?: string[]; // filter by specific topics
    difficultyDistribution?: {
      easy: number;
      medium: number;
      hard: number;
    };
  }[];
  
  // Exam settings
  totalTimeLimit: number; // minutes
  allowPause: boolean;
  showTimer: boolean;
  showProgress: boolean;
  randomizeQuestions: boolean;
  randomizeOptions: boolean;
  
  // Review settings
  immediateReview: boolean;
  showExplanations: boolean;
  enableTUExplanations: boolean;
  
  // Proctoring
  strictMode: boolean; // no pause, no back navigation
  autoSubmit: boolean;
  warningThresholds: {
    timeRemaining: number; // minutes
    questionsRemaining: number;
  };
}

export interface ExamAttempt {
  id: string;
  userId: string;
  examConfigId: string;
  
  // Timing
  startTime: string;
  endTime?: string;
  totalTimeSpent: number; // seconds
  
  // Progress
  status: 'in-progress' | 'completed' | 'abandoned' | 'timed-out';
  currentSectionIndex: number;
  currentQuestionIndex: number;
  
  // Responses
  responses: {
    questionId: string;
    selectedAnswer?: 'A' | 'B' | 'C' | 'D' | 'E';
    timeSpent: number; // seconds
    flagged: boolean;
    confidence?: 1 | 2 | 3 | 4 | 5; // optional confidence rating
    timestamp: string;
  }[];
  
  // Section timing
  sectionTimes: {
    sectionId: string;
    startTime: string;
    endTime?: string;
    timeSpent: number;
    questionsAnswered: number;
  }[];
  
  // Autosave data
  lastSaved: string;
  saveVersion: number;
}

export interface ExamResults {
  attemptId: string;
  userId: string;
  examConfigId: string;
  
  // Overall scores
  totalScore: number;
  totalPossible: number;
  percentageScore: number;
  
  // Section breakdown
  sectionScores: {
    sectionId: string;
    score: number;
    possible: number;
    percentage: number;
    timeSpent: number;
    averageTimePerQuestion: number;
  }[];
  
  // Topic analysis
  topicPerformance: {
    topic: string;
    correct: number;
    total: number;
    percentage: number;
    averageTime: number;
    difficulty: {
      easy: { correct: number; total: number };
      medium: { correct: number; total: number };
      hard: { correct: number; total: number };
    };
  }[];
  
  // Detailed analytics
  analytics: {
    totalTimeSpent: number;
    averageTimePerQuestion: number;
    questionsSkipped: number;
    questionsFlagged: number;
    accuracyByDifficulty: {
      easy: number;
      medium: number;
      hard: number;
    };
    timeDistribution: {
      fast: number; // < 30s
      normal: number; // 30s - 2min
      slow: number; // > 2min
    };
    confidenceAccuracy?: {
      confidence: number;
      accuracy: number;
      count: number;
    }[];
  };
  
  // Mistakes and learning
  mistakes: {
    questionId: string;
    selectedAnswer: string;
    correctAnswer: string;
    topic: string;
    difficulty: string;
    timeSpent: number;
    reviewStatus: 'not-reviewed' | 'reviewed' | 'understood' | 'needs-practice';
    spacedRepetitionDate?: string;
    mistakeType: 'conceptual' | 'calculation' | 'reading' | 'careless' | 'time-pressure';
  }[];
  
  // Generated insights
  insights: {
    strengths: string[];
    weaknesses: string[];
    recommendations: string[];
    studyPlan: {
      topic: string;
      priority: 'high' | 'medium' | 'low';
      estimatedStudyTime: number; // hours
      resources: string[];
    }[];
  };
  
  // Timestamps
  completedAt: string;
  reviewedAt?: string;
}

export interface MistakeLog {
  id: string;
  userId: string;
  questionId: string;
  
  // Mistake details
  selectedAnswer: string;
  correctAnswer: string;
  mistakeType: 'conceptual' | 'calculation' | 'reading' | 'careless' | 'time-pressure';
  
  // Learning tracking
  attempts: {
    attemptId: string;
    timestamp: string;
    correct: boolean;
    timeSpent: number;
    confidence?: number;
  }[];
  
  // Spaced repetition
  spacedRepetitionData: {
    interval: number; // days
    easeFactor: number;
    repetitions: number;
    nextReviewDate: string;
    lastReviewDate?: string;
  };
  
  // Notes and understanding
  userNotes?: string;
  tuNotes?: string; // Thought-Unit generated notes
  understandingLevel: 'not-understood' | 'partially-understood' | 'understood' | 'mastered';
  
  // Metadata
  createdAt: string;
  updatedAt: string;
}

export interface StudySession {
  id: string;
  userId: string;
  type: 'practice' | 'review' | 'mistake-drill' | 'timed-practice';
  
  // Configuration
  focusTopics: string[];
  difficultyLevel?: 'easy' | 'medium' | 'hard';
  questionCount: number;
  timeLimit?: number;
  
  // Progress
  questionsCompleted: number;
  correctAnswers: number;
  timeSpent: number;
  
  // Results
  performance: {
    accuracy: number;
    averageTime: number;
    improvementFromLastSession: number;
  };
  
  // Timestamps
  startedAt: string;
  completedAt?: string;
}

// DAT-specific section definitions
export const DAT_SECTIONS: DATSection[] = [
  {
    id: 'survey-natural-sciences',
    name: 'Survey of Natural Sciences',
    shortName: 'SNS',
    timeLimit: 90,
    questionCount: 100,
    description: 'Biology, General Chemistry, and Organic Chemistry',
    topics: [
      'Cell Biology', 'Genetics', 'Evolution', 'Ecology', 'Anatomy', 'Physiology',
      'Atomic Structure', 'Chemical Bonding', 'Thermodynamics', 'Kinetics', 'Equilibrium',
      'Nomenclature', 'Stereochemistry', 'Reactions', 'Mechanisms', 'Spectroscopy'
    ]
  },
  {
    id: 'perceptual-ability',
    name: 'Perceptual Ability Test',
    shortName: 'PAT',
    timeLimit: 60,
    questionCount: 90,
    description: 'Spatial reasoning and visual perception',
    topics: [
      'Apertures', 'View Recognition', 'Angle Discrimination', 'Paper Folding',
      'Cube Counting', 'Pattern Folding'
    ]
  },
  {
    id: 'reading-comprehension',
    name: 'Reading Comprehension',
    shortName: 'RC',
    timeLimit: 60,
    questionCount: 50,
    description: 'Scientific reading passages and analysis',
    topics: [
      'Main Ideas', 'Supporting Details', 'Inferences', 'Author Intent',
      'Scientific Method', 'Data Interpretation'
    ]
  },
  {
    id: 'quantitative-reasoning',
    name: 'Quantitative Reasoning',
    shortName: 'QR',
    timeLimit: 45,
    questionCount: 40,
    description: 'Mathematical problem solving',
    topics: [
      'Algebra', 'Geometry', 'Trigonometry', 'Statistics', 'Probability',
      'Data Analysis', 'Word Problems'
    ]
  }
];

// Default exam configurations
export const DEFAULT_EXAM_CONFIGS: Partial<ExamConfiguration>[] = [
  {
    name: 'Full DAT Practice Exam',
    description: 'Complete 4-section DAT simulation with official timing',
    sections: DAT_SECTIONS.map(section => ({
      sectionId: section.id,
      enabled: true,
      questionCount: section.questionCount,
      timeLimit: section.timeLimit
    })),
    totalTimeLimit: 255, // 4 hours 15 minutes
    allowPause: false,
    strictMode: true,
    showTimer: true,
    showProgress: true,
    randomizeQuestions: true,
    immediateReview: false,
    showExplanations: true,
    enableTUExplanations: true
  },
  {
    name: 'Natural Sciences Focus',
    description: 'Extended practice on Biology, General Chemistry, and Organic Chemistry',
    sections: [{
      sectionId: 'survey-natural-sciences',
      enabled: true,
      questionCount: 50,
      timeLimit: 45
    }],
    totalTimeLimit: 45,
    allowPause: true,
    strictMode: false,
    immediateReview: true,
    enableTUExplanations: true
  },
  {
    name: 'Quick Practice - 30 Questions',
    description: 'Mixed topics for quick practice sessions',
    sections: DAT_SECTIONS.map(section => ({
      sectionId: section.id,
      enabled: true,
      questionCount: Math.floor(section.questionCount * 0.3),
      timeLimit: Math.floor(section.timeLimit * 0.3)
    })),
    totalTimeLimit: 75,
    allowPause: true,
    immediateReview: true,
    enableTUExplanations: true
  }
];

// Utility types for UI components
export type ExamPhase = 'setup' | 'in-progress' | 'review' | 'results';
export type NavigationDirection = 'previous' | 'next' | 'jump';
export type TimerState = 'running' | 'paused' | 'warning' | 'expired';

// Export utility functions
export const getQuestionsBySection = (questions: DATQuestion[], sectionId: string): DATQuestion[] => {
  return questions.filter(q => q.sectionId === sectionId);
};

export const calculateSectionScore = (responses: ExamAttempt['responses'], questions: DATQuestion[], sectionId: string): number => {
  const sectionQuestions = getQuestionsBySection(questions, sectionId);
  const sectionResponses = responses.filter(r => 
    sectionQuestions.some(q => q.id === r.questionId)
  );
  
  const correct = sectionResponses.filter(response => {
    const question = sectionQuestions.find(q => q.id === response.questionId);
    return question && response.selectedAnswer === question.correctAnswer;
  }).length;
  
  return sectionResponses.length > 0 ? (correct / sectionResponses.length) * 100 : 0;
};

export const formatTime = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
};

export const getTimeRemaining = (startTime: string, timeLimit: number): number => {
  const start = new Date(startTime).getTime();
  const now = Date.now();
  const elapsed = Math.floor((now - start) / 1000);
  return Math.max(0, (timeLimit * 60) - elapsed);
};

export const isTimeWarning = (timeRemaining: number, totalTime: number): boolean => {
  const warningThreshold = Math.min(300, totalTime * 0.1); // 5 minutes or 10% of total time
  return timeRemaining <= warningThreshold && timeRemaining > 0;
};
