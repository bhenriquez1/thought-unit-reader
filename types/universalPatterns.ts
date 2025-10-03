// Universal Pattern System - Extended from DAT-specific to all subjects
// Comprehensive pattern library for universal learning and analysis

import type { Pattern as BasePattern, PatternRule, PatternMastery, PatternAttempt } from './patterns';

// Extended Pattern interface for universal categories
export interface UniversalPattern extends Omit<BasePattern, 'category'> {
  category: 'organic-chemistry' | 'general-chemistry' | 'biology' | 'dentistry' | 'reading-comprehension' | 
           'analytical-reasoning' | 'scientific-method' | 'business-analysis' | 'learning-patterns';
}

// Universal Pattern Categories
export const UNIVERSAL_PATTERN_CATEGORIES = {
  'organic-chemistry': 'Organic Chemistry',
  'general-chemistry': 'General Chemistry', 
  'biology': 'Biology',
  'dentistry': 'Dentistry',
  'reading-comprehension': 'Reading Comprehension',
  'analytical-reasoning': 'Analytical Reasoning',
  'scientific-method': 'Scientific Method',
  'business-analysis': 'Business Analysis',
  'learning-patterns': 'Learning Patterns'
} as const;

// Advanced Universal Patterns
export const UNIVERSAL_PATTERNS: UniversalPattern[] = [
  // Analytical Reasoning Patterns
  {
    id: 'cause-effect-analysis',
    name: 'Cause-Effect Analysis',
    category: 'analytical-reasoning',
    description: 'Identify causal relationships and their implications',
    rules: [
      { key: 'Identify Cause', description: 'Find the triggering event or condition' },
      { key: 'Trace Effects', description: 'Follow the chain of consequences' },
      { key: 'Validate Connection', description: 'Ensure causation, not just correlation' }
    ],
    examples: [
      'Signal words: because, since, due to, as a result',
      'Effect indicators: therefore, thus, consequently',
      'Multiple causes leading to single effect'
    ],
    commonMistakes: ['Confusing correlation with causation', 'Missing intermediate steps'],
    tags: ['logic', 'reasoning', 'analysis']
  },
  
  {
    id: 'problem-solution-framework',
    name: 'Problem-Solution Framework',
    category: 'analytical-reasoning', 
    description: 'Structure for analyzing problems and evaluating solutions',
    rules: [
      { key: 'Define Problem', description: 'Clearly articulate the issue' },
      { key: 'Generate Solutions', description: 'Brainstorm multiple approaches' },
      { key: 'Evaluate Options', description: 'Assess pros, cons, and feasibility' }
    ],
    examples: [
      'Problem identification: challenge, issue, difficulty',
      'Solution signals: approach, method, strategy',
      'Evaluation criteria: effectiveness, cost, time'
    ],
    commonMistakes: ['Jumping to first solution', 'Not considering constraints'],
    tags: ['problem-solving', 'decision-making', 'evaluation']
  },

  // Reading Comprehension Patterns
  {
    id: 'main-idea-identification',
    name: 'Main Idea Identification',
    category: 'reading-comprehension',
    description: 'Extract the central message or theme from text',
    rules: [
      { key: 'Topic Sentence', description: 'Often found in first or last sentence' },
      { key: 'Supporting Details', description: 'Details that reinforce the main point' },
      { key: 'Author Purpose', description: 'Why did the author write this?' }
    ],
    examples: [
      'Key phrases: the main point, in summary, the key idea',
      'Recurring themes and concepts',
      'Title and headings as clues'
    ],
    commonMistakes: ['Confusing details with main idea', 'Missing implicit themes'],
    tags: ['comprehension', 'reading', 'analysis']
  },

  // Scientific Method Patterns  
  {
    id: 'hypothesis-testing',
    name: 'Hypothesis Testing',
    category: 'scientific-method',
    description: 'Structured approach to testing scientific predictions',
    rules: [
      { key: 'Form Hypothesis', description: 'Make testable prediction' },
      { key: 'Design Experiment', description: 'Control variables and measure outcomes' },
      { key: 'Analyze Results', description: 'Support or reject hypothesis' }
    ],
    examples: [
      'If-then statements as hypotheses',
      'Control vs experimental groups',
      'Statistical significance testing'
    ],
    commonMistakes: ['Unfalsifiable hypotheses', 'Confirmation bias'],
    tags: ['science', 'research', 'methodology']
  },

  // Learning Patterns
  {
    id: 'spaced-repetition',
    name: 'Spaced Repetition Learning',
    category: 'learning-patterns',
    description: 'Optimize memory retention through timed review',
    rules: [
      { key: 'Initial Learning', description: 'First exposure and understanding' },
      { key: 'Increasing Intervals', description: 'Review at expanding time intervals' },
      { key: 'Active Recall', description: 'Test knowledge without looking' }
    ],
    examples: [
      'Review schedule: 1 day, 3 days, 1 week, 2 weeks',
      'Flashcards and self-testing',
      'Difficulty-based interval adjustment'
    ],
    commonMistakes: ['Too frequent review', 'Passive re-reading'],
    tags: ['learning', 'memory', 'retention']
  }
];

// Helper functions
export function getUniversalPatternsByCategory(category: keyof typeof UNIVERSAL_PATTERN_CATEGORIES): UniversalPattern[] {
  return UNIVERSAL_PATTERNS.filter(pattern => pattern.category === category);
}

export function getUniversalPatternById(id: string): UniversalPattern | undefined {
  return UNIVERSAL_PATTERNS.find(pattern => pattern.id === id);
}

export function searchUniversalPatterns(query: string): UniversalPattern[] {
  const lowerQuery = query.toLowerCase();
  return UNIVERSAL_PATTERNS.filter(pattern => 
    pattern.name.toLowerCase().includes(lowerQuery) ||
    pattern.description.toLowerCase().includes(lowerQuery) ||
    pattern.tags.some(tag => tag.includes(lowerQuery))
  );
}

// Pattern keyword mappings for detection
export function getPatternKeywords(patternId: string): string[] {
  const keywordMap: Record<string, string[]> = {
    'cause-effect-analysis': ['because', 'since', 'due to', 'therefore', 'as a result', 'consequently', 'leads to'],
    'problem-solution-framework': ['problem', 'issue', 'challenge', 'solution', 'solve', 'approach', 'method'],
    'main-idea-identification': ['main', 'central', 'key', 'important', 'primary', 'essential', 'point'],
    'hypothesis-testing': ['hypothesis', 'predict', 'test', 'experiment', 'data', 'results', 'conclusion'],
    'spaced-repetition': ['review', 'practice', 'repeat', 'memory', 'recall', 'retention', 'learning'],
    // DAT pattern keywords
    'cardio': ['acid', 'base', 'pka', 'ph', 'acidic', 'basic', 'proton'],
    'sn-e-flow': ['substitution', 'elimination', 'nucleophile', 'sn1', 'sn2', 'e1', 'e2'],
    'q-vs-k': ['equilibrium', 'quotient', 'concentration', 'forward', 'reverse'],
  };
  
  return keywordMap[patternId] || [];
}

// Re-export original types for compatibility
export type { PatternRule, PatternMastery, PatternAttempt };
