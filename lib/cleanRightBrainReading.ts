/**
 * Clean Right-Brain Reading Library
 * Focused utilities for visual/spatial learning without overlap
 */

export interface VisualMetaphor {
  concept: string;
  metaphor: string;
  imagery: string;
  color: string;
  emotion: string;
}

export interface TextPattern {
  type: 'cause-effect' | 'compare-contrast' | 'sequence' | 'problem-solution' | 'description' | 'narrative';
  confidence: number;
  indicators: string[];
  structure: string;
}

export interface MemoryPalaceRoom {
  roomName: string;
  description: string;
  objects: Array<{
    name: string;
    concept: string;
    position: 'center' | 'left wall' | 'right wall' | 'corner' | 'ceiling';
  }>;
}

export interface MindMovieScene {
  setting: string;
  characters: string[];
  action: string;
  emotion: string;
  visualElements: string[];
}

// Core Visual Learning Functions (for VisualRightBrainReader only)
export function generateVisualMetaphor(text: string, coreIdea: string): VisualMetaphor {
  const lowerText = text.toLowerCase();
  
  // Science/Biology metaphors
  if (lowerText.includes('cell') || lowerText.includes('organism') || lowerText.includes('biology')) {
    return {
      concept: coreIdea,
      metaphor: 'Living ecosystem',
      imagery: 'Imagine cells as tiny cities with specialized workers and communication networks',
      color: '#4ade80',
      emotion: 'wonder'
    };
  }
  
  // Physics/Chemistry metaphors
  if (lowerText.includes('energy') || lowerText.includes('force') || lowerText.includes('reaction')) {
    return {
      concept: coreIdea,
      metaphor: 'Dynamic dance',
      imagery: 'Picture energy as dancers moving in choreographed patterns across a stage',
      color: '#f59e0b',
      emotion: 'excitement'
    };
  }
  
  // Mathematical concepts
  if (lowerText.includes('equation') || lowerText.includes('formula') || /\d+/.test(text)) {
    return {
      concept: coreIdea,
      metaphor: 'Puzzle pieces',
      imagery: 'See numbers and variables as puzzle pieces that fit together to reveal a picture',
      color: '#3b82f6',
      emotion: 'satisfaction'
    };
  }
  
  // Historical events
  if (lowerText.includes('war') || lowerText.includes('revolution') || lowerText.includes('empire')) {
    return {
      concept: coreIdea,
      metaphor: 'Epic movie scene',
      imagery: 'Visualize historical events as dramatic movie scenes with heroes, conflicts, and resolutions',
      color: '#dc2626',
      emotion: 'drama'
    };
  }
  
  // Business/Economics
  if (lowerText.includes('market') || lowerText.includes('economy') || lowerText.includes('business')) {
    return {
      concept: coreIdea,
      metaphor: 'Flowing river system',
      imagery: 'Think of economic forces as rivers flowing, merging, and creating new channels',
      color: '#059669',
      emotion: 'flow'
    };
  }
  
  // Default metaphor
  return {
    concept: coreIdea,
    metaphor: 'Story landscape',
    imagery: 'Imagine this concept as a landscape you can walk through and explore',
    color: '#8b5cf6',
    emotion: 'curiosity'
  };
}

export function createMindMovieScene(text: string, pattern: TextPattern): MindMovieScene {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
  const firstSentence = sentences[0] || text;
  const words = firstSentence.split(/\s+/).filter(w => w.length > 3);
  
  const characters = words.filter(w => /^[A-Z]/.test(w)).slice(0, 2);
  const visualElements = words.filter(w => 
    ['diagram', 'figure', 'chart', 'graph', 'image', 'illustration', 'color', 'shape'].includes(w.toLowerCase())
  );
  
  let setting = "a conceptual space";
  let action = "concepts interact and transform";
  let emotion = "curiosity";
  
  switch (pattern.type) {
    case 'cause-effect':
      setting = "a chain reaction laboratory";
      action = "one element triggers cascading changes throughout the system";
      emotion = "anticipation";
      break;
    case 'compare-contrast':
      setting = "a split-screen theater";
      action = "two different worlds showcase their unique characteristics side by side";
      emotion = "discovery";
      break;
    case 'sequence':
      setting = "a flowing timeline pathway";
      action = "events unfold step by step, each building on the previous";
      emotion = "progression";
      break;
    case 'problem-solution':
      setting = "a transformation chamber";
      action = "challenges morph into solutions through creative problem-solving";
      emotion = "triumph";
      break;
    case 'narrative':
      setting = "a story world";
      action = "characters navigate through their journey of discovery";
      emotion = "engagement";
      break;
    default:
      setting = "an exploration landscape";
      action = "ideas reveal themselves as you journey through the information";
      emotion = "wonder";
  }
  
  return {
    setting,
    characters: characters.length > 0 ? characters : ['the learner', 'the concept'],
    action,
    emotion,
    visualElements
  };
}

export function generateMemoryPalaceRoom(
  keyTerms: string[], 
  coreIdea: string, 
  roomIndex: number
): MemoryPalaceRoom {
  const roomTypes = [
    "Ancient Library", "Alchemist's Kitchen", "Secret Garden", "Inventor's Workshop", 
    "Stargazer's Observatory", "Artist's Studio", "Mad Scientist's Laboratory", 
    "Grand Theater", "Natural History Museum", "Gothic Cathedral"
  ];
  
  const roomName = roomTypes[roomIndex % roomTypes.length];
  
  const objectTypes = ["Glowing Orb", "Ancient Tome", "Mystical Tool", "Living Sculpture", "Floating Device"];
  const positions: Array<'center' | 'left wall' | 'right wall' | 'corner' | 'ceiling'> = 
    ['center', 'left wall', 'right wall', 'corner', 'ceiling'];
  
  const objects = keyTerms.slice(0, 5).map((term, idx) => ({
    name: `${term} ${objectTypes[idx % objectTypes.length]}`,
    concept: term,
    position: positions[idx % positions.length]
  }));
  
  return {
    roomName,
    description: `Enter the ${roomName}. Here, the essence of "${coreIdea}" comes alive through carefully placed memory anchors.`,
    objects
  };
}

// Spatial positioning for visual layouts
export function calculateSpatialPosition(
  index: number, 
  total: number, 
  layoutType: 'circular' | 'grid' | 'spiral' | 'organic' = 'circular'
): { x: number; y: number; angle?: number } {
  const centerX = 400;
  const centerY = 300;
  
  switch (layoutType) {
    case 'circular':
      const angle = (index / total) * 2 * Math.PI;
      const radius = 200 + (index % 3) * 50;
      return {
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius,
        angle: angle * (180 / Math.PI)
      };
      
    case 'grid':
      const cols = Math.ceil(Math.sqrt(total));
      const row = Math.floor(index / cols);
      const col = index % cols;
      return {
        x: centerX + (col - cols/2) * 150,
        y: centerY + (row - Math.ceil(total/cols)/2) * 120
      };
      
    case 'spiral':
      const spiralAngle = index * 0.5;
      const spiralRadius = 50 + index * 15;
      return {
        x: centerX + Math.cos(spiralAngle) * spiralRadius,
        y: centerY + Math.sin(spiralAngle) * spiralRadius,
        angle: spiralAngle * (180 / Math.PI)
      };
      
    case 'organic':
      // Pseudo-random but deterministic positioning
      const seed = index * 2654435761; // Large prime for distribution
      const normalizedSeed = (seed % 1000) / 1000;
      const organicAngle = normalizedSeed * 2 * Math.PI;
      const organicRadius = 150 + (normalizedSeed * 100);
      return {
        x: centerX + Math.cos(organicAngle) * organicRadius,
        y: centerY + Math.sin(organicAngle) * organicRadius,
        angle: organicAngle * (180 / Math.PI)
      };
      
    default:
      return { x: centerX, y: centerY };
  }
}

// Color coding for concepts
export function generateConceptColor(
  text: string, 
  pattern: TextPattern, 
  index: number
): string {
  // Base colors on content type and pattern
  const patternColors = {
    'cause-effect': ['#f59e0b', '#ea580c', '#dc2626'], // Orange to red
    'compare-contrast': ['#10b981', '#059669', '#047857'], // Green shades
    'sequence': ['#6366f1', '#4f46e5', '#4338ca'], // Indigo shades
    'problem-solution': ['#ef4444', '#dc2626', '#b91c1c'], // Red shades
    'description': ['#8b5cf6', '#7c3aed', '#6d28d9'], // Purple shades
    'narrative': ['#ec4899', '#db2777', '#be185d'] // Pink shades
  };
  
  const colors = patternColors[pattern.type] || patternColors.description;
  return colors[index % colors.length];
}

// Connection detection between concepts
export function findConceptConnections(
  chunks: string[], 
  keyTermsArray: string[][]
): Array<{ from: number; to: number; strength: number; sharedTerms: string[] }> {
  const connections: Array<{ from: number; to: number; strength: number; sharedTerms: string[] }> = [];
  
  for (let i = 0; i < chunks.length; i++) {
    for (let j = i + 1; j < chunks.length; j++) {
      const termsA = keyTermsArray[i] || [];
      const termsB = keyTermsArray[j] || [];
      
      const sharedTerms = termsA.filter(termA => 
        termsB.some(termB => 
          termA.toLowerCase().includes(termB.toLowerCase()) ||
          termB.toLowerCase().includes(termA.toLowerCase()) ||
          termA.toLowerCase() === termB.toLowerCase()
        )
      );
      
      if (sharedTerms.length > 0) {
        const strength = sharedTerms.length / Math.max(termsA.length, termsB.length);
        connections.push({
          from: i,
          to: j,
          strength,
          sharedTerms
        });
      }
    }
  }
  
  return connections.sort((a, b) => b.strength - a.strength);
}

// Animation timing for visual transitions
export function calculateOptimalTiming(
  textLength: number, 
  complexity: 'simple' | 'moderate' | 'complex'
): number {
  const baseTime = Math.max(2000, textLength * 50); // 50ms per character minimum
  
  const complexityMultipliers = {
    simple: 1.0,
    moderate: 1.5,
    complex: 2.0
  };
  
  return baseTime * complexityMultipliers[complexity];
}

// Export simplified analysis function for visual components only
export function analyzeForVisualLearning(
  text: string, 
  index: number, 
  total: number
): {
  coreIdea: string;
  keyTerms: string[];
  visualMetaphor: VisualMetaphor;
  mindMovieScene: MindMovieScene;
  spatialPosition: { x: number; y: number; angle?: number };
  conceptColor: string;
  complexity: 'simple' | 'moderate' | 'complex';
  optimalTiming: number;
} {
  // Extract core idea (first meaningful sentence)
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
  const coreIdea = sentences[0]?.trim() || text.slice(0, 100);
  
  // Extract key terms
  const words = text.split(/\s+/).filter(Boolean);
  const keyTerms = words
    .filter(word => word.length > 5 || /^[A-Z]/.test(word) || /\d/.test(word))
    .slice(0, 4);
  
  // Determine complexity
  const complexity: 'simple' | 'moderate' | 'complex' = 
    sentences.length > 3 ? 'complex' : 
    sentences.length > 1 ? 'moderate' : 'simple';
  
  // Simple pattern detection for visual purposes
  const pattern: TextPattern = {
    type: 'description', // Simplified for visual components
    confidence: 0.7,
    indicators: [],
    structure: 'Visual concept presentation'
  };
  
  return {
    coreIdea,
    keyTerms,
    visualMetaphor: generateVisualMetaphor(text, coreIdea),
    mindMovieScene: createMindMovieScene(text, pattern),
    spatialPosition: calculateSpatialPosition(index, total, 'circular'),
    conceptColor: generateConceptColor(text, pattern, index),
    complexity,
    optimalTiming: calculateOptimalTiming(text.length, complexity)
  };
}
