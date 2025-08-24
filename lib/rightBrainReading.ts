/**
 * Right-Brain Reading Techniques Implementation
 * Based on "Reading with the Right Brain" by David Butler
 */

export interface TextPattern {
  type: 'cause-effect' | 'compare-contrast' | 'sequence' | 'problem-solution' | 'description' | 'narrative';
  confidence: number;
  indicators: string[];
  structure: string;
}

export interface VisualMetaphor {
  concept: string;
  metaphor: string;
  imagery: string;
  color: string;
  emotion: string;
}

export interface RightBrainChunkAnalysis {
  // Existing analysis
  coreIdea: string;
  keyTerms: string[];
  visualCues: string[];
  actionWords: string[];
  relationshipWords: string[];
  memoryAnchors: string[];
  complexity: 'simple' | 'moderate' | 'complex';
  hasNumbers: boolean;
  hasFormulas: boolean;
  
  // New right-brain analysis
  textPattern: TextPattern;
  visualMetaphor: VisualMetaphor;
  emotionalTone: 'neutral' | 'positive' | 'negative' | 'exciting' | 'calming';
  cognitiveLoad: 'low' | 'medium' | 'high';
  mindMovieScene: string;
  spatialPosition: 'center' | 'left' | 'right' | 'top' | 'bottom';
  colorCode: string;
  processingTime: number; // recommended time in seconds
}

// Pattern Recognition Functions
export function detectTextPattern(text: string): TextPattern {
  const lowerText = text.toLowerCase();
  
  // Cause-Effect indicators
  const causeEffectIndicators = [
    'because', 'since', 'as a result', 'therefore', 'consequently', 'thus', 'hence',
    'leads to', 'causes', 'results in', 'due to', 'owing to', 'so that'
  ];
  
  // Compare-Contrast indicators
  const compareContrastIndicators = [
    'however', 'but', 'although', 'whereas', 'while', 'on the other hand',
    'in contrast', 'similarly', 'likewise', 'compared to', 'unlike', 'different from'
  ];
  
  // Sequence indicators
  const sequenceIndicators = [
    'first', 'second', 'third', 'next', 'then', 'finally', 'before', 'after',
    'during', 'meanwhile', 'subsequently', 'previously', 'step', 'stage', 'phase'
  ];
  
  // Problem-Solution indicators
  const problemSolutionIndicators = [
    'problem', 'issue', 'challenge', 'difficulty', 'solution', 'answer', 'resolve',
    'solve', 'fix', 'address', 'overcome', 'remedy'
  ];
  
  // Calculate confidence scores
  const causeEffectScore = causeEffectIndicators.filter(indicator => 
    lowerText.includes(indicator)).length;
  const compareContrastScore = compareContrastIndicators.filter(indicator => 
    lowerText.includes(indicator)).length;
  const sequenceScore = sequenceIndicators.filter(indicator => 
    lowerText.includes(indicator)).length;
  const problemSolutionScore = problemSolutionIndicators.filter(indicator => 
    lowerText.includes(indicator)).length;
  
  // Determine dominant pattern
  const scores = [
    { type: 'cause-effect' as const, score: causeEffectScore, indicators: causeEffectIndicators },
    { type: 'compare-contrast' as const, score: compareContrastScore, indicators: compareContrastIndicators },
    { type: 'sequence' as const, score: sequenceScore, indicators: sequenceIndicators },
    { type: 'problem-solution' as const, score: problemSolutionScore, indicators: problemSolutionIndicators }
  ];
  
  const dominantPattern = scores.reduce((max, current) => 
    current.score > max.score ? current : max);
  
  if (dominantPattern.score === 0) {
    // Default to description or narrative
    const hasPersonalPronouns = /\b(i|you|we|they|he|she)\b/i.test(text);
    const hasTimeMarkers = /\b(yesterday|today|tomorrow|once|when)\b/i.test(text);
    
    if (hasPersonalPronouns || hasTimeMarkers) {
      return {
        type: 'narrative',
        confidence: 0.6,
        indicators: ['personal pronouns', 'time markers'],
        structure: 'Story-based presentation with characters and timeline'
      };
    } else {
      return {
        type: 'description',
        confidence: 0.7,
        indicators: ['descriptive language'],
        structure: 'Detailed explanation of concepts or phenomena'
      };
    }
  }
  
  const foundIndicators = dominantPattern.indicators.filter(indicator => 
    lowerText.includes(indicator));
  
  return {
    type: dominantPattern.type,
    confidence: Math.min(dominantPattern.score / 3, 1), // Normalize to 0-1
    indicators: foundIndicators,
    structure: getPatternStructure(dominantPattern.type)
  };
}

function getPatternStructure(type: TextPattern['type']): string {
  switch (type) {
    case 'cause-effect':
      return 'Cause → Effect relationship with logical connections';
    case 'compare-contrast':
      return 'Side-by-side comparison highlighting similarities and differences';
    case 'sequence':
      return 'Step-by-step progression through time or process';
    case 'problem-solution':
      return 'Problem identification followed by solution presentation';
    case 'description':
      return 'Detailed explanation of concepts or phenomena';
    case 'narrative':
      return 'Story-based presentation with characters and timeline';
    default:
      return 'General information presentation';
  }
}

// Visual Metaphor Generation
export function generateVisualMetaphor(text: string, coreIdea: string): VisualMetaphor {
  const lowerText = text.toLowerCase();
  const lowerIdea = coreIdea.toLowerCase();
  
  // Science/Biology metaphors
  if (lowerText.includes('cell') || lowerText.includes('organism') || lowerText.includes('biology')) {
    return {
      concept: coreIdea,
      metaphor: 'Living ecosystem',
      imagery: 'Imagine cells as tiny cities with specialized workers and communication networks',
      color: '#4ade80', // Green
      emotion: 'wonder'
    };
  }
  
  // Physics/Chemistry metaphors
  if (lowerText.includes('energy') || lowerText.includes('force') || lowerText.includes('reaction')) {
    return {
      concept: coreIdea,
      metaphor: 'Dynamic dance',
      imagery: 'Picture energy as dancers moving in choreographed patterns across a stage',
      color: '#f59e0b', // Orange
      emotion: 'excitement'
    };
  }
  
  // Mathematical concepts
  if (lowerText.includes('equation') || lowerText.includes('formula') || /\d+/.test(text)) {
    return {
      concept: coreIdea,
      metaphor: 'Puzzle pieces',
      imagery: 'See numbers and variables as puzzle pieces that fit together to reveal a picture',
      color: '#3b82f6', // Blue
      emotion: 'satisfaction'
    };
  }
  
  // Historical events
  if (lowerText.includes('war') || lowerText.includes('revolution') || lowerText.includes('empire')) {
    return {
      concept: coreIdea,
      metaphor: 'Epic movie scene',
      imagery: 'Visualize historical events as dramatic movie scenes with heroes, conflicts, and resolutions',
      color: '#dc2626', // Red
      emotion: 'drama'
    };
  }
  
  // Business/Economics
  if (lowerText.includes('market') || lowerText.includes('economy') || lowerText.includes('business')) {
    return {
      concept: coreIdea,
      metaphor: 'Flowing river system',
      imagery: 'Think of economic forces as rivers flowing, merging, and creating new channels',
      color: '#059669', // Emerald
      emotion: 'flow'
    };
  }
  
  // Default metaphor
  return {
    concept: coreIdea,
    metaphor: 'Story landscape',
    imagery: 'Imagine this concept as a landscape you can walk through and explore',
    color: '#8b5cf6', // Purple
    emotion: 'curiosity'
  };
}

// Mind Movie Scene Generation
export function createMindMovieScene(text: string, pattern: TextPattern): string {
  const coreElements = extractKeyElements(text);
  
  switch (pattern.type) {
    case 'cause-effect':
      return `Scene: Watch as ${coreElements.subject} triggers a chain reaction. First, ${coreElements.cause} sets everything in motion, then like dominoes falling, ${coreElements.effect} unfolds before your eyes.`;
    
    case 'compare-contrast':
      return `Scene: Picture a split screen. On the left, ${coreElements.itemA} with its unique characteristics. On the right, ${coreElements.itemB} showing its distinct features. Notice how they're similar yet different.`;
    
    case 'sequence':
      return `Scene: Follow the journey step by step. Begin at ${coreElements.start}, move through ${coreElements.middle}, and arrive at ${coreElements.end}. Each step builds on the previous one.`;
    
    case 'problem-solution':
      return `Scene: A challenge appears - ${coreElements.problem}. Watch as the solution emerges: ${coreElements.solution}. See the transformation from difficulty to resolution.`;
    
    case 'narrative':
      return `Scene: Enter the story where ${coreElements.characters} navigate through ${coreElements.setting}. Experience their journey and discover what unfolds.`;
    
    default:
      return `Scene: Explore this concept as if you're walking through a detailed landscape. Each detail reveals itself as you move through the information.`;
  }
}

function extractKeyElements(text: string): any {
  // Simple extraction - in a real implementation, this could use NLP
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
  const firstSentence = sentences[0] || text;
  const words = firstSentence.split(/\s+/).filter(w => w.length > 3);
  
  return {
    subject: words[0] || 'the concept',
    cause: words.slice(0, 3).join(' ') || 'the initial condition',
    effect: words.slice(-3).join(' ') || 'the result',
    itemA: words.slice(0, 2).join(' ') || 'first element',
    itemB: words.slice(-2).join(' ') || 'second element',
    start: words.slice(0, 2).join(' ') || 'the beginning',
    middle: words.slice(Math.floor(words.length/2), Math.floor(words.length/2) + 2).join(' ') || 'the process',
    end: words.slice(-2).join(' ') || 'the conclusion',
    problem: firstSentence.slice(0, 50) + '...',
    solution: sentences[1]?.slice(0, 50) + '...' || 'the resolution',
    characters: words.filter(w => /^[A-Z]/.test(w)).slice(0, 2).join(' and ') || 'the participants',
    setting: words.slice(2, 5).join(' ') || 'the context'
  };
}

// Emotional Tone Detection
export function detectEmotionalTone(text: string): RightBrainChunkAnalysis['emotionalTone'] {
  const lowerText = text.toLowerCase();
  
  const positiveWords = ['success', 'achievement', 'breakthrough', 'discovery', 'innovation', 'growth', 'improvement'];
  const negativeWords = ['problem', 'crisis', 'failure', 'decline', 'conflict', 'difficulty', 'challenge'];
  const excitingWords = ['amazing', 'incredible', 'revolutionary', 'breakthrough', 'dramatic', 'significant'];
  const calmingWords = ['stable', 'steady', 'consistent', 'balanced', 'peaceful', 'gradual'];
  
  const positiveScore = positiveWords.filter(word => lowerText.includes(word)).length;
  const negativeScore = negativeWords.filter(word => lowerText.includes(word)).length;
  const excitingScore = excitingWords.filter(word => lowerText.includes(word)).length;
  const calmingScore = calmingWords.filter(word => lowerText.includes(word)).length;
  
  if (excitingScore > 0) return 'exciting';
  if (calmingScore > 0) return 'calming';
  if (positiveScore > negativeScore) return 'positive';
  if (negativeScore > positiveScore) return 'negative';
  return 'neutral';
}

// Cognitive Load Assessment
export function assessCognitiveLoad(text: string): RightBrainChunkAnalysis['cognitiveLoad'] {
  const wordCount = text.split(/\s+/).length;
  const sentenceCount = text.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
  const avgWordsPerSentence = wordCount / Math.max(sentenceCount, 1);
  
  // Technical terms and complex concepts
  const complexTerms = text.match(/\b[A-Z][a-z]*[A-Z][a-z]*\b/g) || []; // CamelCase terms
  const numbers = text.match(/\d+/g) || [];
  const longWords = text.split(/\s+/).filter(word => word.length > 8);
  
  const complexityScore = 
    (avgWordsPerSentence > 20 ? 2 : avgWordsPerSentence > 15 ? 1 : 0) +
    (complexTerms.length > 3 ? 2 : complexTerms.length > 1 ? 1 : 0) +
    (numbers.length > 5 ? 2 : numbers.length > 2 ? 1 : 0) +
    (longWords.length > 5 ? 2 : longWords.length > 2 ? 1 : 0);
  
  if (complexityScore >= 6) return 'high';
  if (complexityScore >= 3) return 'medium';
  return 'low';
}

// Spatial Positioning for Visual Layout
export function determineSpatialPosition(
  chunkIndex: number, 
  totalChunks: number, 
  pattern: TextPattern
): RightBrainChunkAnalysis['spatialPosition'] {
  switch (pattern.type) {
    case 'cause-effect':
      return chunkIndex < totalChunks / 2 ? 'left' : 'right';
    case 'compare-contrast':
      return chunkIndex % 2 === 0 ? 'left' : 'right';
    case 'sequence':
      if (chunkIndex < totalChunks / 3) return 'top';
      if (chunkIndex < (totalChunks * 2) / 3) return 'center';
      return 'bottom';
    default:
      return 'center';
  }
}

// Color Coding System
export function getSemanticColor(
  text: string, 
  pattern: TextPattern, 
  emotionalTone: RightBrainChunkAnalysis['emotionalTone']
): string {
  // Base color on content type
  let baseColor = '#8b5cf6'; // Default purple
  
  if (text.toLowerCase().includes('definition') || text.toLowerCase().includes('means')) {
    baseColor = '#3b82f6'; // Blue for definitions
  } else if (pattern.type === 'cause-effect') {
    baseColor = '#f59e0b'; // Orange for cause-effect
  } else if (pattern.type === 'compare-contrast') {
    baseColor = '#10b981'; // Green for comparisons
  } else if (pattern.type === 'sequence') {
    baseColor = '#6366f1'; // Indigo for sequences
  } else if (pattern.type === 'problem-solution') {
    baseColor = '#ef4444'; // Red for problems, transitioning to green for solutions
  }
  
  // Modify based on emotional tone
  switch (emotionalTone) {
    case 'positive':
      return baseColor.replace('#', '#4ade80'); // Green tint
    case 'negative':
      return baseColor.replace('#', '#ef4444'); // Red tint
    case 'exciting':
      return baseColor.replace('#', '#f59e0b'); // Orange tint
    case 'calming':
      return baseColor.replace('#', '#06b6d4'); // Cyan tint
    default:
      return baseColor;
  }
}

// Processing Time Calculation
export function calculateProcessingTime(
  cognitiveLoad: RightBrainChunkAnalysis['cognitiveLoad'],
  wordCount: number
): number {
  const baseTime = Math.max(3, wordCount / 50); // Base reading time
  
  switch (cognitiveLoad) {
    case 'high':
      return baseTime * 2.5; // Extra time for complex concepts
    case 'medium':
      return baseTime * 1.5;
    case 'low':
      return baseTime;
    default:
      return baseTime;
  }
}

// Main Analysis Function
export function analyzeChunkWithRightBrain(
  text: string, 
  chunkIndex: number, 
  totalChunks: number
): RightBrainChunkAnalysis {
  // Existing analysis (simplified version)
  const words = text.split(/\s+/).filter(Boolean);
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 5);
  
  const keyTerms = words.filter(w => 
    w.length > 5 || /^[A-Z]/.test(w) || /\d/.test(w)
  ).slice(0, 4);
  
  const coreIdea = sentences[0] || text.slice(0, 100);
  
  // New right-brain analysis
  const textPattern = detectTextPattern(text);
  const visualMetaphor = generateVisualMetaphor(text, coreIdea);
  const emotionalTone = detectEmotionalTone(text);
  const cognitiveLoad = assessCognitiveLoad(text);
  const mindMovieScene = createMindMovieScene(text, textPattern);
  const spatialPosition = determineSpatialPosition(chunkIndex, totalChunks, textPattern);
  const colorCode = getSemanticColor(text, textPattern, emotionalTone);
  const processingTime = calculateProcessingTime(cognitiveLoad, words.length);
  
  return {
    // Existing analysis
    coreIdea,
    keyTerms,
    visualCues: words.filter(w => 
      ['diagram', 'figure', 'chart', 'graph', 'image', 'illustration'].includes(w.toLowerCase())
    ),
    actionWords: words.filter(w => 
      ['process', 'method', 'step', 'procedure'].includes(w.toLowerCase())
    ),
    relationshipWords: words.filter(w =>
      ['because', 'therefore', 'however', 'although'].includes(w.toLowerCase())
    ),
    memoryAnchors: sentences.filter(s => {
      const lower = s.toLowerCase();
      return lower.includes('important') || lower.includes('key') || lower.includes('remember');
    }),
    complexity: sentences.length > 3 ? 'complex' : sentences.length > 1 ? 'moderate' : 'simple',
    hasNumbers: /\d/.test(text),
    hasFormulas: /[=+\-*/^(){}[\]]/.test(text),
    
    // New right-brain analysis
    textPattern,
    visualMetaphor,
    emotionalTone,
    cognitiveLoad,
    mindMovieScene,
    spatialPosition,
    colorCode,
    processingTime
  };
}
