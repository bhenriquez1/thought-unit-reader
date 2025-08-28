/**
 * Thought Unit Extraction System
 * Based on David Butler's "Reading with the Right Brain" approach
 * Identifies complete thoughts and main ideas within text while preserving layout
 */

import { analyzeChunkWithRightBrain, type RightBrainChunkAnalysis, type TextPattern } from './rightBrainReading';

export interface ThoughtUnit {
  id: string;
  text: string;
  startIndex: number;
  endIndex: number;
  isMainIdea: boolean;
  isComplete: boolean;
  confidence: number;
  type: 'topic-sentence' | 'supporting-detail' | 'transition' | 'conclusion' | 'definition' | 'example';
  relationships: {
    parentId?: string;
    childIds: string[];
    relationType: 'supports' | 'elaborates' | 'contrasts' | 'causes' | 'follows';
  };
  visualCues: {
    color: string;
    intensity: number;
    borderStyle: 'solid' | 'dashed' | 'dotted';
  };
  cognitiveMarkers: {
    complexity: 'simple' | 'moderate' | 'complex';
    processingTime: number;
    memoryAnchor?: string;
  };
}

export interface MainIdeaAnalysis {
  primaryIdea: string;
  supportingPoints: string[];
  keyTerms: string[];
  conceptualFramework: string;
  visualMetaphor: string;
  confidence: number;
}

export interface ThoughtUnitBoundary {
  position: number;
  type: 'hard' | 'soft' | 'transition';
  confidence: number;
  markers: string[];
}

// Thought Unit Boundary Detection
export function detectThoughtUnitBoundaries(text: string): ThoughtUnitBoundary[] {
  const boundaries: ThoughtUnitBoundary[] = [];
  
  // Hard boundaries - clear thought separators
  const hardMarkers = [
    /\.\s+(?=[A-Z])/g, // Sentence endings followed by capital letters
    /[!?]\s+(?=[A-Z])/g, // Exclamation/question marks
    /;\s+(?=[A-Z])/g, // Semicolons before capitals
    /\n\s*\n/g, // Paragraph breaks
    /\.\s*\n/g, // Sentence endings with line breaks
  ];
  
  // Soft boundaries - potential thought separators
  const softMarkers = [
    /,\s+(?=however|but|although|while|whereas)/gi,
    /,\s+(?=therefore|thus|consequently|as a result)/gi,
    /:\s+/g, // Colons
    /—\s+/g, // Em dashes
    /\s+—\s+/g, // Spaced em dashes
  ];
  
  // Transition boundaries - connecting thoughts
  const transitionMarkers = [
    /\b(?:furthermore|moreover|additionally|also|besides)\b/gi,
    /\b(?:however|nevertheless|nonetheless|yet|still)\b/gi,
    /\b(?:therefore|thus|consequently|hence|accordingly)\b/gi,
    /\b(?:for example|for instance|specifically|namely)\b/gi,
    /\b(?:in contrast|on the other hand|conversely)\b/gi,
  ];
  
  // Detect hard boundaries
  hardMarkers.forEach(regex => {
    let match;
    while ((match = regex.exec(text)) !== null) {
      boundaries.push({
        position: match.index + match[0].length,
        type: 'hard',
        confidence: 0.9,
        markers: [match[0].trim()]
      });
    }
  });
  
  // Detect soft boundaries
  softMarkers.forEach(regex => {
    let match;
    while ((match = regex.exec(text)) !== null) {
      boundaries.push({
        position: match.index + match[0].length,
        type: 'soft',
        confidence: 0.6,
        markers: [match[0].trim()]
      });
    }
  });
  
  // Detect transition boundaries
  transitionMarkers.forEach(regex => {
    let match;
    while ((match = regex.exec(text)) !== null) {
      boundaries.push({
        position: match.index,
        type: 'transition',
        confidence: 0.7,
        markers: [match[0].trim()]
      });
    }
  });
  
  // Sort by position and remove duplicates
  return boundaries
    .sort((a, b) => a.position - b.position)
    .filter((boundary, index, arr) => 
      index === 0 || Math.abs(boundary.position - arr[index - 1].position) > 5
    );
}

// Enhanced Main Idea Detection with Precision Focus
export function extractMainIdea(text: string): MainIdeaAnalysis {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 15);
  
  if (sentences.length === 0) {
    return {
      primaryIdea: text.slice(0, 100),
      supportingPoints: [],
      keyTerms: [],
      conceptualFramework: 'Simple statement',
      visualMetaphor: 'Single concept',
      confidence: 0.3
    };
  }
  
  // Enhanced sentence scoring with stricter criteria
  const sentenceScores = sentences.map((sentence, index) => {
    let score = 0;
    const lowerSentence = sentence.toLowerCase();
    const wordCount = sentence.split(/\s+/).length;
    
    // STRICT position scoring - be more selective
    if (index === 0 && wordCount >= 8) score += 4; // First sentence must be substantial
    if (index === sentences.length - 1 && wordCount >= 8) score += 3;
    
    // STRICT length scoring - main ideas should be substantial but not too long
    if (sentence.length >= 60 && sentence.length <= 150) score += 3; // Sweet spot for main ideas
    if (sentence.length > 150) score -= 1; // Penalize overly long sentences
    if (sentence.length < 40) score -= 2; // Penalize short sentences
    
    // HIGH-VALUE main idea indicators (much stricter)
    const strongMainIdeaIndicators = [
      'the main point', 'the key concept', 'the primary purpose', 'the central idea',
      'in essence', 'fundamentally', 'the core principle', 'most importantly'
    ];
    
    strongMainIdeaIndicators.forEach(indicator => {
      if (lowerSentence.includes(indicator)) score += 5; // Higher boost for strong indicators
    });
    
    // MEDIUM-VALUE indicators
    const mediumIndicators = [
      'the main', 'the key', 'the primary', 'the central', 'the fundamental',
      'overall', 'essentially', 'basically', 'the purpose', 'the goal'
    ];
    
    mediumIndicators.forEach(indicator => {
      if (lowerSentence.includes(indicator)) score += 2;
    });
    
    // Abstract concept indicators (more selective)
    const conceptIndicators = [
      'concept', 'principle', 'theory', 'framework', 'approach', 'method'
    ];
    
    conceptIndicators.forEach(indicator => {
      if (lowerSentence.includes(indicator)) score += 1;
    });
    
    // Definition indicators (strong signal for main ideas)
    const definitionPatterns = [
      / is defined as /i, / means that /i, / refers to /i, / can be understood as /i
    ];
    
    definitionPatterns.forEach(pattern => {
      if (pattern.test(sentence)) score += 3;
    });
    
    // PENALTY for supporting detail indicators
    const supportingDetailIndicators = [
      'for example', 'such as', 'including', 'like', 'specifically',
      'in addition', 'furthermore', 'moreover', 'also', 'additionally'
    ];
    
    supportingDetailIndicators.forEach(indicator => {
      if (lowerSentence.includes(indicator)) score -= 2; // Penalize supporting details
    });
    
    // PENALTY for transitional phrases
    const transitionPenalties = [
      'however', 'but', 'although', 'while', 'whereas', 'on the other hand'
    ];
    
    transitionPenalties.forEach(transition => {
      if (lowerSentence.includes(transition)) score -= 1;
    });
    
    return { sentence, score, index, wordCount };
  });
  
  // STRICT FILTERING: Only consider sentences with score >= 4 as potential main ideas
  const viableCandidates = sentenceScores.filter(s => s.score >= 4);
  
  let primarySentence;
  if (viableCandidates.length > 0) {
    // Find the highest scoring viable candidate
    primarySentence = viableCandidates.reduce((max, current) => 
      current.score > max.score ? current : max
    );
  } else {
    // Fallback: use the best available sentence but mark low confidence
    primarySentence = sentenceScores.reduce((max, current) => 
      current.score > max.score ? current : max
    );
    primarySentence.score = Math.max(primarySentence.score, 2); // Ensure minimum score for fallback
  }
  
  // Extract supporting points (exclude the primary sentence and low-scoring sentences)
  const supportingPoints = sentenceScores
    .filter(s => 
      s.index !== primarySentence.index && 
      s.sentence.trim().length > 25 &&
      s.score >= 1 // Only include sentences with some relevance
    )
    .sort((a, b) => b.score - a.score) // Sort by score
    .slice(0, 3) // Limit to top 3 supporting points
    .map(s => s.sentence.trim());
  
  // Extract key terms with better filtering
  const keyTerms = extractKeyTerms(text);
  
  // Determine conceptual framework
  const framework = determineConceptualFramework(text, primarySentence.sentence);
  
  // Generate visual metaphor
  const visualMetaphor = generateThoughtUnitMetaphor(primarySentence.sentence, framework);
  
  // STRICT confidence calculation - much higher threshold for main ideas
  const baseConfidence = Math.min(primarySentence.score / 12, 0.8); // Normalize against higher threshold
  const termBonus = Math.min(keyTerms.length / 30, 0.15); // Smaller bonus from terms
  const structureBonus = sentences.length > 2 ? 0.05 : 0; // Small bonus for structured text
  
  const confidence = Math.min(baseConfidence + termBonus + structureBonus, 1.0);
  
  // If confidence is too low, this might not be a true main idea
  const adjustedConfidence = confidence < 0.6 ? confidence * 0.7 : confidence;
  
  return {
    primaryIdea: primarySentence.sentence.trim(),
    supportingPoints,
    keyTerms,
    conceptualFramework: framework,
    visualMetaphor,
    confidence: adjustedConfidence
  };
}

// Extract Key Terms using enhanced analysis
function extractKeyTerms(text: string): string[] {
  const words = text.split(/\s+/).filter(word => word.length > 3);
  const termCounts = new Map<string, number>();
  const keyTerms: string[] = [];
  
  // Count word frequencies
  words.forEach(word => {
    const cleaned = word.replace(/[^\w]/g, '').toLowerCase();
    if (cleaned.length > 3) {
      termCounts.set(cleaned, (termCounts.get(cleaned) || 0) + 1);
    }
  });
  
  // Score terms based on various criteria
  const scoredTerms = Array.from(termCounts.entries()).map(([term, count]) => {
    let score = count;
    
    // Boost capitalized terms (proper nouns, important concepts)
    const originalTerm = words.find(w => w.toLowerCase().includes(term));
    if (originalTerm && /^[A-Z]/.test(originalTerm)) score += 2;
    
    // Boost longer terms (more specific concepts)
    if (term.length > 6) score += 1;
    if (term.length > 10) score += 2;
    
    // Boost technical/academic terms
    if (term.includes('tion') || term.includes('ment') || term.includes('ness')) score += 1;
    
    return { term: originalTerm || term, score };
  });
  
  // Return top scoring terms
  return scoredTerms
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(t => t.term);
}

// Determine Conceptual Framework
function determineConceptualFramework(text: string, primaryIdea: string): string {
  const lowerText = text.toLowerCase();
  const lowerIdea = primaryIdea.toLowerCase();
  
  // Process-based framework
  if (lowerText.includes('process') || lowerText.includes('step') || 
      lowerText.includes('method') || lowerText.includes('procedure')) {
    return 'Process/Method Framework';
  }
  
  // Cause-effect framework
  if (lowerText.includes('because') || lowerText.includes('causes') || 
      lowerText.includes('results in') || lowerText.includes('leads to')) {
    return 'Cause-Effect Framework';
  }
  
  // Compare-contrast framework
  if (lowerText.includes('however') || lowerText.includes('but') || 
      lowerText.includes('unlike') || lowerText.includes('compared to')) {
    return 'Compare-Contrast Framework';
  }
  
  // Problem-solution framework
  if (lowerText.includes('problem') || lowerText.includes('solution') || 
      lowerText.includes('challenge') || lowerText.includes('resolve')) {
    return 'Problem-Solution Framework';
  }
  
  // Definition framework
  if (lowerIdea.includes(' is ') || lowerIdea.includes(' means ') || 
      lowerIdea.includes(' refers to ') || lowerIdea.includes('definition')) {
    return 'Definition Framework';
  }
  
  // Example-based framework
  if (lowerText.includes('example') || lowerText.includes('instance') || 
      lowerText.includes('such as') || lowerText.includes('like')) {
    return 'Example-Based Framework';
  }
  
  return 'Descriptive Framework';
}

// Generate Visual Metaphor for Thought Units
function generateThoughtUnitMetaphor(primaryIdea: string, framework: string): string {
  const lowerIdea = primaryIdea.toLowerCase();
  
  switch (framework) {
    case 'Process/Method Framework':
      return 'A step-by-step journey with clear waypoints and destinations';
    
    case 'Cause-Effect Framework':
      return 'A chain reaction where each link triggers the next movement';
    
    case 'Compare-Contrast Framework':
      return 'Two paths side by side, showing different routes to understanding';
    
    case 'Problem-Solution Framework':
      return 'A locked door with the key that opens new possibilities';
    
    case 'Definition Framework':
      return 'A spotlight illuminating the essential nature of a concept';
    
    case 'Example-Based Framework':
      return 'A gallery of illustrations that bring abstract ideas to life';
    
    default:
      return 'A landscape of interconnected ideas forming a complete picture';
  }
}

// Create Thought Units from Text
export function createThoughtUnits(text: string, chunkIndex: number = 0): ThoughtUnit[] {
  const boundaries = detectThoughtUnitBoundaries(text);
  const mainIdeaAnalysis = extractMainIdea(text);
  const rightBrainAnalysis = analyzeChunkWithRightBrain(text, chunkIndex, 1);
  
  const thoughtUnits: ThoughtUnit[] = [];
  let currentStart = 0;
  
  // If no boundaries found, treat entire text as one thought unit
  if (boundaries.length === 0) {
    const unit = createSingleThoughtUnit(
      text, 
      0, 
      text.length, 
      mainIdeaAnalysis, 
      rightBrainAnalysis,
      `thought-unit-${chunkIndex}-0`
    );
    return [unit];
  }
  
  // Create thought units based on boundaries
  boundaries.forEach((boundary, index) => {
    const unitText = text.slice(currentStart, boundary.position).trim();
    
    if (unitText.length > 10) { // Only create units with substantial content
      const unitId = `thought-unit-${chunkIndex}-${index}`;
      const isMainIdea = unitText.includes(mainIdeaAnalysis.primaryIdea.slice(0, 50));
      
      const unit: ThoughtUnit = {
        id: unitId,
        text: unitText,
        startIndex: currentStart,
        endIndex: boundary.position,
        isMainIdea,
        isComplete: boundary.type === 'hard',
        confidence: boundary.confidence,
        type: determineThoughtUnitType(unitText, isMainIdea),
        relationships: {
          childIds: [],
          relationType: 'supports'
        },
        visualCues: generateVisualCues(unitText, isMainIdea, boundary.type),
        cognitiveMarkers: {
          complexity: rightBrainAnalysis.complexity,
          processingTime: calculateThoughtUnitProcessingTime(unitText),
          memoryAnchor: extractMemoryAnchor(unitText)
        }
      };
      
      thoughtUnits.push(unit);
    }
    
    currentStart = boundary.position;
  });
  
  // Handle remaining text after last boundary
  const remainingText = text.slice(currentStart).trim();
  if (remainingText.length > 10) {
    const unitId = `thought-unit-${chunkIndex}-${boundaries.length}`;
    const isMainIdea = remainingText.includes(mainIdeaAnalysis.primaryIdea.slice(0, 50));
    
    const unit: ThoughtUnit = {
      id: unitId,
      text: remainingText,
      startIndex: currentStart,
      endIndex: text.length,
      isMainIdea,
      isComplete: true, // Last unit is typically complete
      confidence: 0.8,
      type: determineThoughtUnitType(remainingText, isMainIdea),
      relationships: {
        childIds: [],
        relationType: 'supports'
      },
      visualCues: generateVisualCues(remainingText, isMainIdea, 'hard'),
      cognitiveMarkers: {
        complexity: rightBrainAnalysis.complexity,
        processingTime: calculateThoughtUnitProcessingTime(remainingText),
        memoryAnchor: extractMemoryAnchor(remainingText)
      }
    };
    
    thoughtUnits.push(unit);
  }
  
  // Establish relationships between thought units
  establishThoughtUnitRelationships(thoughtUnits);
  
  return thoughtUnits;
}

// Helper function to create a single thought unit
function createSingleThoughtUnit(
  text: string, 
  start: number, 
  end: number, 
  mainIdeaAnalysis: MainIdeaAnalysis,
  rightBrainAnalysis: RightBrainChunkAnalysis,
  id: string
): ThoughtUnit {
  const isMainIdea = text.length > 50; // Assume substantial single units contain main ideas
  
  return {
    id,
    text,
    startIndex: start,
    endIndex: end,
    isMainIdea,
    isComplete: true,
    confidence: mainIdeaAnalysis.confidence,
    type: determineThoughtUnitType(text, isMainIdea),
    relationships: {
      childIds: [],
      relationType: 'supports'
    },
    visualCues: generateVisualCues(text, isMainIdea, 'hard'),
    cognitiveMarkers: {
      complexity: rightBrainAnalysis.complexity,
      processingTime: rightBrainAnalysis.processingTime,
      memoryAnchor: rightBrainAnalysis.memoryAnchors[0]
    }
  };
}

// Determine Thought Unit Type
function determineThoughtUnitType(text: string, isMainIdea: boolean): ThoughtUnit['type'] {
  const lowerText = text.toLowerCase();
  
  if (isMainIdea) return 'topic-sentence';
  
  if (lowerText.includes('for example') || lowerText.includes('such as') || 
      lowerText.includes('instance')) {
    return 'example';
  }
  
  if (lowerText.includes(' is ') || lowerText.includes(' means ') || 
      lowerText.includes('definition')) {
    return 'definition';
  }
  
  if (lowerText.includes('however') || lowerText.includes('therefore') || 
      lowerText.includes('furthermore') || lowerText.includes('moreover')) {
    return 'transition';
  }
  
  if (lowerText.includes('conclusion') || lowerText.includes('summary') || 
      lowerText.includes('finally')) {
    return 'conclusion';
  }
  
  return 'supporting-detail';
}

// Generate Visual Cues for Thought Units
function generateVisualCues(text: string, isMainIdea: boolean, boundaryType: string): ThoughtUnit['visualCues'] {
  if (isMainIdea) {
    return {
      color: '#fbbf24', // Amber for main ideas (like David Butler's highlighting)
      intensity: 0.8,
      borderStyle: 'solid'
    };
  }
  
  switch (boundaryType) {
    case 'hard':
      return {
        color: '#60a5fa', // Blue for complete thoughts
        intensity: 0.6,
        borderStyle: 'solid'
      };
    
    case 'soft':
      return {
        color: '#a78bfa', // Purple for connected thoughts
        intensity: 0.4,
        borderStyle: 'dashed'
      };
    
    case 'transition':
      return {
        color: '#34d399', // Green for transitions
        intensity: 0.5,
        borderStyle: 'dotted'
      };
    
    default:
      return {
        color: '#9ca3af', // Gray for supporting details
        intensity: 0.3,
        borderStyle: 'dashed'
      };
  }
}

// Calculate Processing Time for Thought Units
function calculateThoughtUnitProcessingTime(text: string): number {
  const wordCount = text.split(/\s+/).length;
  const baseTime = wordCount / 3; // ~3 words per second for comprehension
  
  // Adjust for complexity
  const complexityMultiplier = text.match(/[A-Z][a-z]*[A-Z]/) ? 1.5 : 1; // Technical terms
  const formulaMultiplier = /[=+\-*/^()]/.test(text) ? 2 : 1; // Mathematical content
  
  return Math.max(2, baseTime * complexityMultiplier * formulaMultiplier);
}

// Extract Memory Anchor
function extractMemoryAnchor(text: string): string | undefined {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
  
  // Look for memorable phrases
  const memorablePatterns = [
    /\b(remember|important|key|crucial|essential|vital)\b/i,
    /\b(always|never|must|should|will)\b/i,
    /\b(first|last|only|main|primary)\b/i
  ];
  
  for (const sentence of sentences) {
    for (const pattern of memorablePatterns) {
      if (pattern.test(sentence)) {
        return sentence.trim().slice(0, 80) + (sentence.length > 80 ? '...' : '');
      }
    }
  }
  
  // Fallback to first substantial sentence
  return sentences[0]?.trim().slice(0, 80) + (sentences[0]?.length > 80 ? '...' : '');
}

// Establish Relationships Between Thought Units
function establishThoughtUnitRelationships(thoughtUnits: ThoughtUnit[]): void {
  thoughtUnits.forEach((unit, index) => {
    // Find main idea unit
    const mainIdeaUnit = thoughtUnits.find(u => u.isMainIdea);
    
    if (mainIdeaUnit && unit.id !== mainIdeaUnit.id) {
      // Supporting details relate to main idea
      if (unit.type === 'supporting-detail' || unit.type === 'example') {
        unit.relationships.parentId = mainIdeaUnit.id;
        unit.relationships.relationType = 'supports';
        mainIdeaUnit.relationships.childIds.push(unit.id);
      }
    }
    
    // Sequential relationships
    if (index > 0) {
      const previousUnit = thoughtUnits[index - 1];
      
      if (unit.type === 'transition') {
        unit.relationships.relationType = 'follows';
      } else if (previousUnit.type === 'topic-sentence' && unit.type === 'supporting-detail') {
        unit.relationships.parentId = previousUnit.id;
        unit.relationships.relationType = 'elaborates';
        previousUnit.relationships.childIds.push(unit.id);
      }
    }
  });
}

// Main export function for integration
export function analyzeTextForThoughtUnits(text: string, chunkIndex: number = 0): {
  thoughtUnits: ThoughtUnit[];
  mainIdeaAnalysis: MainIdeaAnalysis;
  boundaries: ThoughtUnitBoundary[];
} {
  const thoughtUnits = createThoughtUnits(text, chunkIndex);
  const mainIdeaAnalysis = extractMainIdea(text);
  const boundaries = detectThoughtUnitBoundaries(text);
  
  return {
    thoughtUnits,
    mainIdeaAnalysis,
    boundaries
  };
}
