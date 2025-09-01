// DAT Apex Exam Generator
// Core logic for generating practice exams from question banks

import { 
  DATQuestion, 
  ExamConfiguration, 
  DAT_SECTIONS, 
  DEFAULT_EXAM_CONFIGS,
  getQuestionsBySection 
} from '@/types/apex-exam';

export interface GeneratorOptions {
  sections?: string[]; // section IDs to include
  questionCount?: number; // total questions (overrides section defaults)
  timeLimit?: number; // total time in minutes
  difficulty?: 'easy' | 'medium' | 'hard' | 'mixed';
  topics?: string[]; // specific topics to focus on
  excludeTopics?: string[]; // topics to avoid
  randomize?: boolean;
  mode?: 'practice' | 'timed' | 'full-exam' | 'weak-topics' | 'quick';
}

export interface GeneratedExam {
  id: string;
  config: ExamConfiguration;
  questions: DATQuestion[];
  metadata: {
    generatedAt: string;
    totalQuestions: number;
    estimatedTime: number;
    difficultyDistribution: {
      easy: number;
      medium: number;
      hard: number;
    };
    topicCoverage: Record<string, number>;
    sectionBreakdown: Array<{
      sectionId: string;
      questionCount: number;
      timeLimit: number;
    }>;
  };
}

export class ExamGenerator {
  private questionBank: DATQuestion[];

  constructor(questionBank: DATQuestion[]) {
    this.questionBank = questionBank;
  }

  // Load questions from JSON file
  static async fromQuestionBank(questionBankPath?: string): Promise<ExamGenerator> {
    try {
      // In a real implementation, this would load from the file system or API
      // For now, we'll use a mock implementation
      const response = await fetch('/data/apex/questions.json');
      const data = await response.json();
      return new ExamGenerator(data.questions);
    } catch (error) {
      console.error('Failed to load question bank:', error);
      // Return with empty question bank as fallback
      return new ExamGenerator([]);
    }
  }

  // Generate exam based on configuration
  generateExam(options: GeneratorOptions = {}): GeneratedExam {
    const examId = `exam-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Determine exam mode and apply defaults
    const mode = options.mode || 'practice';
    const baseConfig = this.getBaseConfigForMode(mode);
    
    // Build exam configuration
    const config: ExamConfiguration = {
      id: examId,
      name: this.generateExamName(options),
      description: this.generateExamDescription(options),
      sections: this.buildSectionConfig(options, baseConfig),
      totalTimeLimit: options.timeLimit || baseConfig.totalTimeLimit,
      allowPause: baseConfig.allowPause,
      showTimer: baseConfig.showTimer,
      showProgress: baseConfig.showProgress,
      randomizeQuestions: options.randomize ?? baseConfig.randomizeQuestions,
      randomizeOptions: baseConfig.randomizeOptions,
      immediateReview: baseConfig.immediateReview,
      showExplanations: baseConfig.showExplanations,
      enableTUExplanations: baseConfig.enableTUExplanations,
      strictMode: baseConfig.strictMode,
      autoSubmit: baseConfig.autoSubmit,
      warningThresholds: baseConfig.warningThresholds
    };

    // Select questions based on configuration
    const selectedQuestions = this.selectQuestions(config, options);

    // Generate metadata
    const metadata = this.generateMetadata(selectedQuestions, config);

    return {
      id: examId,
      config,
      questions: selectedQuestions,
      metadata
    };
  }

  // Get base configuration for different exam modes
  private getBaseConfigForMode(mode: string): Partial<ExamConfiguration> {
    switch (mode) {
      case 'full-exam':
        return DEFAULT_EXAM_CONFIGS[0]; // Full DAT Practice Exam
      
      case 'quick':
        return DEFAULT_EXAM_CONFIGS[2]; // Quick Practice - 30 Questions
      
      case 'timed':
        return {
          ...DEFAULT_EXAM_CONFIGS[0],
          allowPause: false,
          strictMode: true,
          immediateReview: false
        };
      
      case 'weak-topics':
        return {
          ...DEFAULT_EXAM_CONFIGS[1], // Natural Sciences Focus
          allowPause: true,
          immediateReview: true,
          enableTUExplanations: true
        };
      
      case 'practice':
      default:
        return {
          totalTimeLimit: 60,
          allowPause: true,
          showTimer: true,
          showProgress: true,
          randomizeQuestions: true,
          randomizeOptions: false,
          immediateReview: true,
          showExplanations: true,
          enableTUExplanations: true,
          strictMode: false,
          autoSubmit: false,
          warningThresholds: {
            timeRemaining: 5,
            questionsRemaining: 5
          }
        };
    }
  }

  // Build section configuration based on options
  private buildSectionConfig(
    options: GeneratorOptions, 
    baseConfig: Partial<ExamConfiguration>
  ): ExamConfiguration['sections'] {
    const sectionsToInclude = options.sections || DAT_SECTIONS.map(s => s.id);
    
    return sectionsToInclude.map(sectionId => {
      const section = DAT_SECTIONS.find(s => s.id === sectionId);
      if (!section) {
        throw new Error(`Unknown section: ${sectionId}`);
      }

      // Calculate question count for this section
      let questionCount = section.questionCount;
      if (options.questionCount) {
        // Distribute questions proportionally across sections
        const totalDefaultQuestions = sectionsToInclude.reduce((sum, id) => {
          const s = DAT_SECTIONS.find(s => s.id === id);
          return sum + (s?.questionCount || 0);
        }, 0);
        questionCount = Math.round(
          (section.questionCount / totalDefaultQuestions) * options.questionCount
        );
      }

      return {
        sectionId,
        enabled: true,
        questionCount,
        timeLimit: section.timeLimit,
        customTopics: options.topics,
        difficultyDistribution: this.getDifficultyDistribution(options.difficulty)
      };
    });
  }

  // Get difficulty distribution based on difficulty setting
  private getDifficultyDistribution(difficulty?: string): { easy: number; medium: number; hard: number } | undefined {
    switch (difficulty) {
      case 'easy':
        return { easy: 70, medium: 25, hard: 5 };
      case 'medium':
        return { easy: 20, medium: 60, hard: 20 };
      case 'hard':
        return { easy: 10, medium: 30, hard: 60 };
      case 'mixed':
      default:
        return { easy: 33, medium: 34, hard: 33 };
    }
  }

  // Select questions based on exam configuration
  private selectQuestions(config: ExamConfiguration, options: GeneratorOptions): DATQuestion[] {
    const selectedQuestions: DATQuestion[] = [];

    for (const sectionConfig of config.sections) {
      if (!sectionConfig.enabled) continue;

      // Get all questions for this section
      let sectionQuestions = getQuestionsBySection(this.questionBank, sectionConfig.sectionId);

      // Filter by topics if specified
      if (sectionConfig.customTopics && sectionConfig.customTopics.length > 0) {
        sectionQuestions = sectionQuestions.filter(q => 
          sectionConfig.customTopics!.some(topic => 
            q.topic.toLowerCase().includes(topic.toLowerCase()) ||
            q.subtopic?.toLowerCase().includes(topic.toLowerCase())
          )
        );
      }

      // Filter by excluded topics
      if (options.excludeTopics && options.excludeTopics.length > 0) {
        sectionQuestions = sectionQuestions.filter(q => 
          !options.excludeTopics!.some(topic => 
            q.topic.toLowerCase().includes(topic.toLowerCase()) ||
            q.subtopic?.toLowerCase().includes(topic.toLowerCase())
          )
        );
      }

      // Apply difficulty distribution
      const questions = this.selectQuestionsByDifficulty(
        sectionQuestions,
        sectionConfig.questionCount,
        sectionConfig.difficultyDistribution
      );

      selectedQuestions.push(...questions);
    }

    // Randomize if requested
    if (config.randomizeQuestions) {
      this.shuffleArray(selectedQuestions);
    }

    return selectedQuestions;
  }

  // Select questions based on difficulty distribution
  private selectQuestionsByDifficulty(
    questions: DATQuestion[],
    targetCount: number,
    distribution?: { easy: number; medium: number; hard: number }
  ): DATQuestion[] {
    if (!distribution) {
      // No distribution specified, select randomly
      return this.selectRandomQuestions(questions, targetCount);
    }

    const easyQuestions = questions.filter(q => q.difficulty === 'easy');
    const mediumQuestions = questions.filter(q => q.difficulty === 'medium');
    const hardQuestions = questions.filter(q => q.difficulty === 'hard');

    const easyCount = Math.round((distribution.easy / 100) * targetCount);
    const mediumCount = Math.round((distribution.medium / 100) * targetCount);
    const hardCount = targetCount - easyCount - mediumCount; // Ensure exact count

    const selected: DATQuestion[] = [
      ...this.selectRandomQuestions(easyQuestions, easyCount),
      ...this.selectRandomQuestions(mediumQuestions, mediumCount),
      ...this.selectRandomQuestions(hardQuestions, hardCount)
    ];

    // If we don't have enough questions of a specific difficulty, fill from others
    while (selected.length < targetCount && questions.length > selected.length) {
      const remaining = questions.filter(q => !selected.some(s => s.id === q.id));
      if (remaining.length > 0) {
        selected.push(remaining[Math.floor(Math.random() * remaining.length)]);
      } else {
        break;
      }
    }

    return selected.slice(0, targetCount);
  }

  // Select random questions from array
  private selectRandomQuestions(questions: DATQuestion[], count: number): DATQuestion[] {
    if (questions.length <= count) {
      return [...questions];
    }

    const shuffled = [...questions];
    this.shuffleArray(shuffled);
    return shuffled.slice(0, count);
  }

  // Fisher-Yates shuffle algorithm
  private shuffleArray<T>(array: T[]): void {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }

  // Generate exam name based on options
  private generateExamName(options: GeneratorOptions): string {
    const mode = options.mode || 'practice';
    
    switch (mode) {
      case 'full-exam':
        return 'Full DAT Practice Exam';
      case 'quick':
        return 'Quick Practice Session';
      case 'timed':
        return 'Timed Practice Exam';
      case 'weak-topics':
        return 'Weak Topics Focus';
      default:
        if (options.sections && options.sections.length === 1) {
          const section = DAT_SECTIONS.find(s => s.id === options.sections![0]);
          return `${section?.shortName || 'Section'} Practice`;
        }
        return 'Custom Practice Exam';
    }
  }

  // Generate exam description
  private generateExamDescription(options: GeneratorOptions): string {
    const parts: string[] = [];
    
    if (options.questionCount) {
      parts.push(`${options.questionCount} questions`);
    }
    
    if (options.timeLimit) {
      parts.push(`${options.timeLimit} minutes`);
    }
    
    if (options.difficulty && options.difficulty !== 'mixed') {
      parts.push(`${options.difficulty} difficulty`);
    }
    
    if (options.topics && options.topics.length > 0) {
      parts.push(`focusing on ${options.topics.join(', ')}`);
    }

    return parts.length > 0 
      ? `Practice exam with ${parts.join(', ')}`
      : 'Custom practice exam';
  }

  // Generate exam metadata
  private generateMetadata(questions: DATQuestion[], config: ExamConfiguration): GeneratedExam['metadata'] {
    const difficultyDistribution = {
      easy: questions.filter(q => q.difficulty === 'easy').length,
      medium: questions.filter(q => q.difficulty === 'medium').length,
      hard: questions.filter(q => q.difficulty === 'hard').length
    };

    const topicCoverage: Record<string, number> = {};
    questions.forEach(q => {
      topicCoverage[q.topic] = (topicCoverage[q.topic] || 0) + 1;
    });

    const sectionBreakdown = config.sections.map(sectionConfig => {
      const sectionQuestions = questions.filter(q => q.sectionId === sectionConfig.sectionId);
      return {
        sectionId: sectionConfig.sectionId,
        questionCount: sectionQuestions.length,
        timeLimit: sectionConfig.timeLimit
      };
    });

    const estimatedTime = questions.reduce((sum, q) => sum + q.estimatedTime, 0);

    return {
      generatedAt: new Date().toISOString(),
      totalQuestions: questions.length,
      estimatedTime: Math.round(estimatedTime / 60), // Convert to minutes
      difficultyDistribution,
      topicCoverage,
      sectionBreakdown
    };
  }

  // Get available topics for a section
  getAvailableTopics(sectionId?: string): string[] {
    const questions = sectionId 
      ? getQuestionsBySection(this.questionBank, sectionId)
      : this.questionBank;
    
    const topics = new Set<string>();
    questions.forEach(q => {
      topics.add(q.topic);
      if (q.subtopic) {
        topics.add(q.subtopic);
      }
    });
    
    return Array.from(topics).sort();
  }

  // Get question bank statistics
  getQuestionBankStats(): {
    totalQuestions: number;
    sectionBreakdown: Record<string, number>;
    difficultyBreakdown: Record<string, number>;
    topicBreakdown: Record<string, number>;
  } {
    const sectionBreakdown: Record<string, number> = {};
    const difficultyBreakdown: Record<string, number> = {};
    const topicBreakdown: Record<string, number> = {};

    this.questionBank.forEach(q => {
      sectionBreakdown[q.sectionId] = (sectionBreakdown[q.sectionId] || 0) + 1;
      difficultyBreakdown[q.difficulty] = (difficultyBreakdown[q.difficulty] || 0) + 1;
      topicBreakdown[q.topic] = (topicBreakdown[q.topic] || 0) + 1;
    });

    return {
      totalQuestions: this.questionBank.length,
      sectionBreakdown,
      difficultyBreakdown,
      topicBreakdown
    };
  }
}

// Utility functions for exam generation
export const examGeneratorUtils = {
  // Create quick practice exam
  createQuickPractice: (questionCount: number = 30): GeneratorOptions => ({
    mode: 'quick',
    questionCount,
    timeLimit: Math.round(questionCount * 1.5), // 1.5 minutes per question
    difficulty: 'mixed',
    randomize: true
  }),

  // Create section-specific practice
  createSectionPractice: (sectionId: string, questionCount?: number): GeneratorOptions => ({
    mode: 'practice',
    sections: [sectionId],
    questionCount,
    difficulty: 'mixed',
    randomize: true
  }),

  // Create topic-focused practice
  createTopicPractice: (topics: string[], questionCount: number = 20): GeneratorOptions => ({
    mode: 'practice',
    topics,
    questionCount,
    timeLimit: Math.round(questionCount * 2), // 2 minutes per question for focused practice
    difficulty: 'mixed',
    randomize: true
  }),

  // Create full DAT simulation
  createFullDAT: (): GeneratorOptions => ({
    mode: 'full-exam',
    sections: DAT_SECTIONS.map(s => s.id),
    randomize: true
  }),

  // Create timed practice
  createTimedPractice: (timeLimit: number, sections?: string[]): GeneratorOptions => ({
    mode: 'timed',
    sections,
    timeLimit,
    difficulty: 'mixed',
    randomize: true
  })
};

export default ExamGenerator;
