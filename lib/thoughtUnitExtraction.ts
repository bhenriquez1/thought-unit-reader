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

// Enhanced Main Idea Detection with Advanced Semantic Analysis
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
  
  // Multi-pass analysis for better accuracy
  const sentenceAnalyses = sentences.map((sentence, index) => {
    const analysis = analyzeMainIdeaSentence(sentence, index, sentences);
    return { sentence, index, ...analysis };
  });
  
  // Apply semantic coherence scoring
  const coherenceScores = calculateSemanticCoherence(sentenceAnalyses, text);
  
  // Combine scores with coherence weighting
  const finalScores = sentenceAnalyses.map((analysis, index) => ({
    ...analysis,
    finalScore: analysis.baseScore + (coherenceScores[index] * 0.3),
    confidence: calculateSentenceConfidence(analysis, coherenceScores[index])
  }));
  
  // Select primary idea with enhanced filtering
  const primarySentence = selectPrimaryIdea(finalScores);
  
  // Extract supporting points with relationship analysis
  const supportingPoints = extractSupportingPoints(finalScores, primarySentence.index);
  
  // Enhanced key term extraction with semantic clustering
  const keyTerms = extractEnhancedKeyTerms(text, primarySentence.sentence);
  
  // Determine conceptual framework with pattern recognition
  const framework = determineConceptualFramework(text, primarySentence.sentence);
  
  // Generate contextual visual metaphor
  const visualMetaphor = generateThoughtUnitMetaphor(primarySentence.sentence, framework);
  
  // Advanced confidence calculation with multiple factors
  const confidence = calculateMainIdeaConfidence(primarySentence, supportingPoints, keyTerms, text);
  
  return {
    primaryIdea: primarySentence.sentence.trim(),
    supportingPoints: supportingPoints.map(p => p.sentence.trim()),
    keyTerms,
    conceptualFramework: framework,
    visualMetaphor,
    confidence
  };
}

// Advanced sentence analysis for main idea detection
function analyzeMainIdeaSentence(sentence: string, index: number, allSentences: string[]) {
  let baseScore = 0;
  const lowerSentence = sentence.toLowerCase();
  const wordCount = sentence.split(/\s+/).length;
  const sentenceLength = sentence.length;
  
  // Position-based scoring with context awareness
  const totalSentences = allSentences.length;
  if (index === 0 && wordCount >= 8) {
    baseScore += totalSentences > 3 ? 5 : 3; // Higher weight for first sentence in longer texts
  }
  if (index === totalSentences - 1 && wordCount >= 8) {
    baseScore += 4; // Conclusion sentences often contain main ideas
  }
  
  // Optimal length scoring for main ideas
  if (sentenceLength >= 50 && sentenceLength <= 180) {
    baseScore += 4; // Sweet spot for comprehensive main ideas
  } else if (sentenceLength >= 30 && sentenceLength <= 250) {
    baseScore += 2; // Acceptable range
  } else if (sentenceLength < 30) {
    baseScore -= 3; // Too short for main ideas
  } else if (sentenceLength > 250) {
    baseScore -= 2; // Likely too detailed/complex
  }
  
  // Enhanced main idea indicators with weighted scoring
  const strongIndicators = [
    { pattern: /\b(the main point|the key concept|the primary purpose|the central idea)\b/i, weight: 6 },
    { pattern: /\b(in essence|fundamentally|the core principle|most importantly)\b/i, weight: 5 },
    { pattern: /\b(the main|the key|the primary|the central|the fundamental)\b/i, weight: 3 },
    { pattern: /\b(overall|essentially|basically|the purpose|the goal)\b/i, weight: 2 }
  ];
  
  strongIndicators.forEach(({ pattern, weight }) => {
    if (pattern.test(sentence)) baseScore += weight;
  });
  
  // Academic and conceptual indicators
  const conceptualIndicators = [
    { pattern: /\b(concept|principle|theory|framework|approach|method)\b/i, weight: 2 },
    { pattern: /\b(hypothesis|thesis|argument|proposition)\b/i, weight: 3 },
    { pattern: /\b(research shows|studies indicate|evidence suggests)\b/i, weight: 2 }
  ];
  
  conceptualIndicators.forEach(({ pattern, weight }) => {
    if (pattern.test(sentence)) baseScore += weight;
  });
  
  // Definition patterns (strong main idea signals)
  const definitionPatterns = [
    { pattern: /\bis defined as\b/i, weight: 4 },
    { pattern: /\bmeans that\b/i, weight: 3 },
    { pattern: /\brefers to\b/i, weight: 3 },
    { pattern: /\bcan be understood as\b/i, weight: 3 }
  ];
  
  definitionPatterns.forEach(({ pattern, weight }) => {
    if (pattern.test(sentence)) baseScore += weight;
  });
  
  // Penalties for supporting details and transitions
  const penaltyPatterns = [
    { pattern: /\b(for example|such as|including|like|specifically)\b/i, penalty: 3 },
    { pattern: /\b(in addition|furthermore|moreover|also|additionally)\b/i, penalty: 2 },
    { pattern: /\b(however|but|although|while|whereas|on the other hand)\b/i, penalty: 1 }
  ];
  
  penaltyPatterns.forEach(({ pattern, penalty }) => {
    if (pattern.test(sentence)) baseScore -= penalty;
  });
  
  // Complexity analysis
  const complexity = analyzeComplexity(sentence);
  if (complexity === 'optimal') baseScore += 2;
  else if (complexity === 'too-simple') baseScore -= 2;
  else if (complexity === 'too-complex') baseScore -= 1;
  
  return {
    baseScore,
    wordCount,
    sentenceLength,
    complexity,
    hasStrongIndicators: strongIndicators.some(({ pattern }) => pattern.test(sentence)),
    hasDefinitionPattern: definitionPatterns.some(({ pattern }) => pattern.test(sentence))
  };
}

// Calculate semantic coherence between sentences
function calculateSemanticCoherence(sentenceAnalyses: any[], fullText: string): number[] {
  const coherenceScores = sentenceAnalyses.map((analysis, index) => {
    let coherenceScore = 0;
    const sentence = analysis.sentence.toLowerCase();
    
    // Check thematic consistency with full text
    const textWords = fullText.toLowerCase().split(/\s+/);
    const sentenceWords = sentence.split(/\s+/);
    
    // Calculate word overlap with full text (excluding common words)
    const commonWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those']);
    
    const meaningfulSentenceWords = sentenceWords.filter(word => 
      word.length > 3 && !commonWords.has(word)
    );
    
    const overlapCount = meaningfulSentenceWords.filter(word => 
      textWords.includes(word)
    ).length;
    
    const overlapRatio = meaningfulSentenceWords.length > 0 ? 
      overlapCount / meaningfulSentenceWords.length : 0;
    
    coherenceScore += overlapRatio * 3;
    
    // Check for topic consistency with other high-scoring sentences
    const otherHighScoringSentences = sentenceAnalyses.filter((other, otherIndex) => 
      otherIndex !== index && other.baseScore >= 3
    );
    
    if (otherHighScoringSentences.length > 0) {
      const topicConsistency = calculateTopicConsistency(sentence, otherHighScoringSentences);
      coherenceScore += topicConsistency * 2;
    }
    
    return Math.min(coherenceScore, 5); // Cap coherence score
  });
  
  return coherenceScores;
}

// Calculate topic consistency between sentences
function calculateTopicConsistency(sentence: string, otherSentences: any[]): number {
  const sentenceWords = new Set(sentence.toLowerCase().split(/\s+/).filter(w => w.length > 4));
  
  let totalConsistency = 0;
  otherSentences.forEach(other => {
    const otherWords = new Set(other.sentence.toLowerCase().split(/\s+/).filter(w => w.length > 4));
    const intersection = new Set([...sentenceWords].filter(x => otherWords.has(x)));
    const union = new Set([...sentenceWords, ...otherWords]);
    
    const jaccardSimilarity = union.size > 0 ? intersection.size / union.size : 0;
    totalConsistency += jaccardSimilarity;
  });
  
  return otherSentences.length > 0 ? totalConsistency / otherSentences.length : 0;
}

// Calculate confidence for individual sentences
function calculateSentenceConfidence(analysis: any, coherenceScore: number): number {
  let confidence = 0;
  
  // Base score contribution (normalized)
  confidence += Math.min(analysis.baseScore / 15, 0.6);
  
  // Coherence contribution
  confidence += Math.min(coherenceScore / 5, 0.3);
  
  // Bonus for strong indicators
  if (analysis.hasStrongIndicators) confidence += 0.1;
  if (analysis.hasDefinitionPattern) confidence += 0.1;
  
  // Penalty for suboptimal characteristics
  if (analysis.complexity === 'too-simple') confidence -= 0.1;
  if (analysis.complexity === 'too-complex') confidence -= 0.05;
  
  return Math.max(0, Math.min(1, confidence));
}

// Select the primary idea with enhanced logic
function selectPrimaryIdea(scoredSentences: any[]) {
  // Filter viable candidates (higher threshold)
  const viableCandidates = scoredSentences.filter(s => s.finalScore >= 5 && s.confidence >= 0.5);
  
  if (viableCandidates.length > 0) {
    // Select based on combined score and confidence
    return viableCandidates.reduce((best, current) => {
      const bestCombined = best.finalScore * 0.7 + best.confidence * 0.3;
      const currentCombined = current.finalScore * 0.7 + current.confidence * 0.3;
      return currentCombined > bestCombined ? current : best;
    });
  }
  
  // Fallback to best available sentence
  const fallback = scoredSentences.reduce((best, current) => 
    current.finalScore > best.finalScore ? current : best
  );
  
  // Mark as low confidence fallback
  fallback.confidence = Math.min(fallback.confidence, 0.4);
  return fallback;
}

// Extract supporting points with relationship analysis
function extractSupportingPoints(scoredSentences: any[], primaryIndex: number) {
  return scoredSentences
    .filter(s => 
      s.index !== primaryIndex && 
      s.sentence.trim().length > 25 &&
      s.finalScore >= 2 &&
      s.confidence >= 0.3
    )
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, 3);
}

// Enhanced key term extraction with semantic clustering
function extractEnhancedKeyTerms(text: string, primaryIdea: string): string[] {
  const words = text.split(/\s+/).filter(word => word.length > 3);
  const primaryWords = primaryIdea.split(/\s+/).filter(word => word.length > 3);
  
  // Create term frequency map
  const termFreq = new Map<string, number>();
  const termPositions = new Map<string, number[]>();
  
  words.forEach((word, index) => {
    const cleaned = word.replace(/[^\w]/g, '').toLowerCase();
    if (cleaned.length > 3) {
      termFreq.set(cleaned, (termFreq.get(cleaned) || 0) + 1);
      if (!termPositions.has(cleaned)) termPositions.set(cleaned, []);
      termPositions.get(cleaned)!.push(index);
    }
  });
  
  // Score terms based on multiple factors
  const scoredTerms = Array.from(termFreq.entries()).map(([term, freq]) => {
    let score = freq;
    
    // Boost terms that appear in primary idea
    const inPrimary = primaryWords.some(w => w.toLowerCase().includes(term) || term.includes(w.toLowerCase()));
    if (inPrimary) score += 5;
    
    // Boost capitalized terms (proper nouns, important concepts)
    const originalTerm = words.find(w => w.toLowerCase().includes(term));
    if (originalTerm && /^[A-Z]/.test(originalTerm)) score += 3;
    
    // Boost longer terms (more specific concepts)
    if (term.length > 6) score += 2;
    if (term.length > 10) score += 3;
    
    // Boost technical/academic terms
    if (term.match(/(tion|ment|ness|ism|ity|ology|graphy)$/)) score += 2;
    
    // Boost terms with good distribution (not clustered)
    const positions = termPositions.get(term) || [];
    if (positions.length > 1) {
      const distribution = calculateDistribution(positions, words.length);
      score += distribution * 2;
    }
    
    return { term: originalTerm || term, score, frequency: freq };
  });
  
  // Return top scoring terms with diversity
  return scoredTerms
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .filter(t => t.score >= 2) // Minimum relevance threshold
    .map(t => t.term);
}

// Calculate term distribution across text
function calculateDistribution(positions: number[], textLength: number): number {
  if (positions.length <= 1) return 0;
  
  const segments = 5; // Divide text into 5 segments
  const segmentSize = textLength / segments;
  const segmentCounts = new Array(segments).fill(0);
  
  positions.forEach(pos => {
    const segment = Math.min(Math.floor(pos / segmentSize), segments - 1);
    segmentCounts[segment]++;
  });
  
  const nonEmptySegments = segmentCounts.filter(count => count > 0).length;
  return nonEmptySegments / segments; // Return distribution ratio
}

// Analyze sentence complexity
function analyzeComplexity(sentence: string): 'too-simple' | 'optimal' | 'too-complex' {
  const wordCount = sentence.split(/\s+/).length;
  const avgWordLength = sentence.replace(/[^\w\s]/g, '').split(/\s+/).reduce((sum, word) => sum + word.length, 0) / wordCount;
  const clauseCount = (sentence.match(/[,;:]/g) || []).length + 1;
  
  // Calculate complexity score
  const complexityScore = (wordCount * 0.3) + (avgWordLength * 2) + (clauseCount * 1.5);
  
  if (complexityScore < 15) return 'too-simple';
  if (complexityScore > 45) return 'too-complex';
  return 'optimal';
}

// Advanced confidence calculation for main ideas
function calculateMainIdeaConfidence(primarySentence: any, supportingPoints: any[], keyTerms: string[], fullText: string): number {
  let confidence = 0;
  
  // Base confidence from sentence analysis
  confidence += primarySentence.confidence * 0.5;
  
  // Boost from supporting evidence
  const supportingEvidence = supportingPoints.length / 3; // Normalize to 0-1
  confidence += supportingEvidence * 0.2;
  
  // Boost from key term density
  const keyTermDensity = Math.min(keyTerms.length / 10, 1); // Normalize to 0-1
  confidence += keyTermDensity * 0.15;
  
  // Boost from text structure
  const sentences = fullText.split(/[.!?]+/).filter(s => s.trim().length > 15);
  const structureBonus = sentences.length > 3 ? 0.1 : 0.05;
  confidence += structureBonus;
  
  // Penalty for very short or very long texts
  if (fullText.length < 100) confidence *= 0.8;
  if (fullText.length > 2000) confidence *= 0.9;
  
  // Final confidence adjustment
  return Math.max(0.1, Math.min(1.0, confidence));
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
