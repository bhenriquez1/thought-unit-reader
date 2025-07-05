// lib/parser.ts - Right Brain Thought-Unit Parser
interface ThoughtUnit {
  text: string;
  unitType: 'concept' | 'description' | 'action' | 'dialogue' | 'transition' | 'emphasis';
  unitNumber: number;
  wordCount: number;
  isComplete: boolean;
}

interface ChunkingStats {
  totalUnits: number;
  averageWordsPerUnit: number;
  totalWords: number;
  readingTimeEstimate: number; // in minutes
  comprehensionLevel: 'easy' | 'moderate' | 'challenging';
}

// Right Brain chunking patterns based on meaning and natural reading flow
const chunkingPatterns = [
  // Dialogue patterns
  { pattern: /"[^"]*"/g, type: 'dialogue' as const },
  
  // Action sequences (verbs + objects)
  { pattern: /\b(he|she|they|it|the\s+\w+)\s+(was|were|is|are|had|have|will|would|could|should|might|may)\s+[^.!?]{10,40}[.!?]/gi, type: 'action' as const },
  
  // Descriptive phrases (adjectives + nouns)
  { pattern: /\b(a|an|the)\s+[a-z]+\s+(and\s+[a-z]+\s+)*[a-z]+/gi, type: 'description' as const },
  
  // Transitional phrases
  { pattern: /\b(however|therefore|meanwhile|suddenly|then|next|finally|first|second|third|in conclusion|as a result|for example|in fact|moreover|furthermore|nevertheless|consequently)\b[^.!?]*[.!?]/gi, type: 'transition' as const },
  
  // Emphasis patterns (with strong emotional words)
  { pattern: /\b(very|extremely|absolutely|completely|totally|entirely|quite|rather|incredibly|amazing|wonderful|terrible|horrible|beautiful|magnificent)\s+[^.!?]*[.!?]/gi, type: 'emphasis' as const }
];

function determineOptimalChunkSize(text: string): number {
  const words = text.split(/\s+/);
  const totalWords = words.length;
  
  // Right Brain methodology: 3-7 words per chunk for optimal comprehension
  if (totalWords < 50) return 4; // Short texts: smaller chunks
  if (totalWords < 200) return 5; // Medium texts: moderate chunks  
  if (totalWords < 500) return 6; // Longer texts: slightly larger chunks
  return 7; // Very long texts: maximum chunk size
}

function identifyNaturalBreaks(text: string): number[] {
  const breakPoints: number[] = [];
  
  // Natural break indicators
  const breakPatterns = [
    /[.!?]\s+/g,  // Sentence endings
    /[,;]\s+/g,   // Clause separators
    /\s+(and|but|or|yet|so|for|nor)\s+/g, // Conjunctions
    /\s+(when|where|while|because|since|although|though|unless|until|if)\s+/g, // Subordinating conjunctions
    /\s+--\s+/g,  // Dashes
    /\s+\(\s*/g,  // Parentheses
  ];
  
  breakPatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      breakPoints.push(match.index + match[0].length);
    }
  });
  
  return breakPoints.sort((a, b) => a - b);
}

function createThoughtUnits(text: string): ThoughtUnit[] {
  if (!text || text.trim().length === 0) {
    return [];
  }

  const cleanText = text.replace(/\s+/g, ' ').trim();
  const words = cleanText.split(/\s+/);
  const optimalChunkSize = determineOptimalChunkSize(cleanText);
  const naturalBreaks = identifyNaturalBreaks(cleanText);
  
  const units: ThoughtUnit[] = [];
  let currentPosition = 0;
  let unitNumber = 1;
  
  while (currentPosition < cleanText.length) {
    let chunkEnd = currentPosition;
    let chunkWords = 0;
    let bestBreakPoint = -1;
    
    // Find the optimal chunk end point
    while (chunkWords < optimalChunkSize * 2 && chunkEnd < cleanText.length) {
      // Look for next word boundary
      const nextSpace = cleanText.indexOf(' ', chunkEnd + 1);
      if (nextSpace === -1) {
        chunkEnd = cleanText.length;
        break;
      }
      
      chunkEnd = nextSpace;
      chunkWords++;
      
      // Check if we hit our target chunk size
      if (chunkWords >= optimalChunkSize) {
        // Look for a natural break point within reasonable range
        const searchEnd = Math.min(chunkEnd + 50, cleanText.length);
        for (const breakPoint of naturalBreaks) {
          if (breakPoint > chunkEnd && breakPoint <= searchEnd) {
            bestBreakPoint = breakPoint;
            break;
          }
        }
        
        if (bestBreakPoint !== -1) {
          chunkEnd = bestBreakPoint;
          break;
        }
      }
      
      // Hard limit: don't exceed 2x optimal chunk size
      if (chunkWords >= optimalChunkSize * 2) {
        break;
      }
    }
    
    // Extract the chunk text
    const chunkText = cleanText.slice(currentPosition, chunkEnd).trim();
    
    if (chunkText.length === 0) {
      break;
    }
    
    // Determine unit type based on content
    let unitType: ThoughtUnit['unitType'] = 'concept';
    
    if (chunkText.includes('"')) {
      unitType = 'dialogue';
    } else if (/\b(was|were|is|are|had|have|will|would|could|should|went|came|said|told|looked|saw|heard|felt|thought|knew|found|made|took|gave|put|got|left|right|up|down|in|out|on|off)\b/i.test(chunkText)) {
      unitType = 'action';
    } else if (/\b(beautiful|ugly|big|small|tall|short|fat|thin|old|young|new|ancient|modern|bright|dark|loud|quiet|soft|hard|smooth|rough|hot|cold|warm|cool)\b/i.test(chunkText)) {
      unitType = 'description';
    } else if (/\b(however|therefore|meanwhile|suddenly|then|next|finally|first|second|third|in conclusion|as a result|for example|in fact|moreover|furthermore|nevertheless|consequently)\b/i.test(chunkText)) {
      unitType = 'transition';
    } else if (/\b(very|extremely|absolutely|completely|totally|entirely|quite|rather|incredibly|amazing|wonderful|terrible|horrible|magnificent)\b/i.test(chunkText)) {
      unitType = 'emphasis';
    }
    
    // Check if unit feels complete (ends with punctuation or natural break)
    const isComplete = /[.!?]$/.test(chunkText) || naturalBreaks.includes(chunkEnd);
    
    units.push({
      text: chunkText,
      unitType,
      unitNumber,
      wordCount: chunkText.split(/\s+/).length,
      isComplete
    });
    
    currentPosition = chunkEnd;
    unitNumber++;
    
    // Skip whitespace
    while (currentPosition < cleanText.length && /\s/.test(cleanText[currentPosition])) {
      currentPosition++;
    }
  }
  
  return units;
}

function calculateStats(units: ThoughtUnit[], originalText: string): ChunkingStats {
  const totalWords = originalText.split(/\s+/).length;
  const averageWordsPerUnit = units.reduce((sum, unit) => sum + unit.wordCount, 0) / units.length;
  
  // Reading time estimation (Right Brain method: faster comprehension)
  // Traditional: 200-250 WPM, Right Brain method: 300-500 WPM
  const readingTimeEstimate = totalWords / 400; // minutes
  
  // Comprehension level based on chunk complexity
  let comprehensionLevel: ChunkingStats['comprehensionLevel'] = 'easy';
  if (averageWordsPerUnit > 8) {
    comprehensionLevel = 'challenging';
  } else if (averageWordsPerUnit > 5) {
    comprehensionLevel = 'moderate';
  }
  
  return {
    totalUnits: units.length,
    averageWordsPerUnit: Math.round(averageWordsPerUnit * 10) / 10,
    totalWords,
    readingTimeEstimate: Math.round(readingTimeEstimate * 10) / 10,
    comprehensionLevel
  };
}

export function improveBiomedicalParsing(text: string): string {
  if (!text || text.trim().length === 0) {
    return '<div class="text-gray-500 italic p-4">No text content to analyze</div>';
  }

  const units = createThoughtUnits(text);
  const stats = calculateStats(units, text);
  
  if (units.length === 0) {
    return '<div class="text-gray-500 italic p-4">Could not create thought units from this text</div>';
  }

  // Generate HTML output with Right Brain visual styling
  const unitTypeColors = {
    concept: '#3B82F6',      // Blue - main ideas
    description: '#10B981',   // Green - descriptive content  
    action: '#EF4444',       // Red - action sequences
    dialogue: '#8B5CF6',     // Purple - spoken words
    transition: '#F59E0B',   // Amber - connecting phrases
    emphasis: '#EC4899'      // Pink - emphasized content
  };

  const htmlUnits = units.map((unit, index) => {
    const backgroundColor = unitTypeColors[unit.unitType];
    const isEvenUnit = index % 2 === 0;
    const spacing = isEvenUnit ? 'mr-2 mb-2' : 'ml-2 mb-2';
    const completeness = unit.isComplete ? '✓' : '⋯';
    
    return `
      <div class="thought-unit ${spacing} inline-block p-3 rounded-lg shadow-sm border-l-4 transition-all hover:shadow-md cursor-pointer"
           style="background-color: ${backgroundColor}15; border-left-color: ${backgroundColor};"
           title="${unit.unitType.toUpperCase()}: ${unit.wordCount} words ${completeness}">
        <div class="text-sm font-medium" style="color: ${backgroundColor};">
          Unit ${unit.unitNumber} • ${unit.unitType}
        </div>
        <div class="text-gray-800 leading-relaxed mt-1">
          ${unit.text}
        </div>
        <div class="text-xs text-gray-500 mt-1">
          ${unit.wordCount} words ${completeness}
        </div>
      </div>
    `;
  }).join('');

  // Create legend for unit types
  const legend = Object.entries(unitTypeColors).map(([type, color]) => {
    const count = units.filter(u => u.unitType === type).length;
    return `
      <span class="inline-flex items-center px-3 py-1 rounded-full text-white text-xs font-medium mr-2 mb-2"
            style="background-color: ${color};">
        ${type} (${count})
      </span>
    `;
  }).join('');

  return `
    <div class="space-y-6">
      <div class="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-xl border border-blue-200">
        <h3 class="font-bold text-blue-800 mb-4 flex items-center">
          🧠 Right Brain Thought-Unit Analysis
        </h3>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
          <div class="bg-white p-3 rounded-lg shadow-sm">
            <div class="font-semibold text-gray-700">Thought Units</div>
            <div class="text-xl font-bold text-blue-600">${stats.totalUnits}</div>
          </div>
          <div class="bg-white p-3 rounded-lg shadow-sm">
            <div class="font-semibold text-gray-700">Avg Words/Unit</div>
            <div class="text-xl font-bold text-green-600">${stats.averageWordsPerUnit}</div>
          </div>
          <div class="bg-white p-3 rounded-lg shadow-sm">
            <div class="font-semibold text-gray-700">Reading Time</div>
            <div class="text-xl font-bold text-purple-600">${stats.readingTimeEstimate}m</div>
          </div>
          <div class="bg-white p-3 rounded-lg shadow-sm">
            <div class="font-semibold text-gray-700">Complexity</div>
            <div class="text-xl font-bold text-orange-600">${stats.comprehensionLevel}</div>
          </div>
        </div>
      </div>
      
      <div class="bg-gray-50 p-4 rounded-xl border">
        <h4 class="font-semibold text-gray-700 mb-3">
          🏷️ Thought Unit Types:
        </h4>
        <div class="flex flex-wrap">
          ${legend}
        </div>
      </div>
      
      <div class="prose max-w-none">
        <h4 class="font-semibold text-gray-800 mb-4">
          📖 Right Brain Reading Format:
        </h4>
        <div class="bg-white p-6 rounded-lg border shadow-sm">
          ${htmlUnits}
        </div>
      </div>
      
      <div class="text-xs text-gray-500 bg-gray-100 p-3 rounded-lg">
        <div class="font-semibold mb-2">💡 Right Brain Reading Guide:</div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div><strong>Chunking:</strong> Text broken into meaningful thought units</div>
          <div><strong>Preservation:</strong> Original content completely intact</div>
          <div><strong>Speed Reading:</strong> Optimized for faster comprehension</div>
          <div><strong>Visual Flow:</strong> Units alternate for easier eye tracking</div>
        </div>
      </div>
    </div>
  `;
}

export { createThoughtUnits, type ThoughtUnit, type ChunkingStats };