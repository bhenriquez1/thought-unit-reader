// lib/parser.ts - Clean Thought Unit Parser
interface ThoughtUnit {
  text: string;
  unitNumber: number;
  wordCount: number;
}

interface ThoughtUnitStats {
  totalUnits: number;
  averageWordsPerUnit: number;
  totalWords: number;
  readingTimeEstimate: number;
}

function createThoughtUnits(text: string): ThoughtUnit[] {
  if (!text || text.trim().length === 0) {
    return [];
  }

  // Clean the text but preserve proper spacing and structure
  const cleanText = text
    .replace(/\s+/g, ' ')  // Replace multiple spaces with single space
    .replace(/\n\s*\n/g, '\n')  // Clean up excessive line breaks
    .trim();

  // Split into sentences first to maintain natural breaks
  const sentences = cleanText
    .split(/(?<=[.!?])\s+/)
    .filter(sentence => sentence.trim().length > 3);

  const units: ThoughtUnit[] = [];
  let unitNumber = 1;

  sentences.forEach(sentence => {
    const words = sentence.trim().split(/\s+/);
    
    // If sentence is short enough (7 words or less), keep as single unit
    if (words.length <= 7) {
      units.push({
        text: sentence.trim(),
        unitNumber: unitNumber++,
        wordCount: words.length
      });
    } else {
      // Break longer sentences into meaningful chunks
      let currentChunk: string[] = [];
      let i = 0;
      
      while (i < words.length) {
        currentChunk.push(words[i]);
        
        // Look for natural break points
        const currentWord = words[i].toLowerCase();
        const nextWord = words[i + 1]?.toLowerCase() || '';
        
        // Break at 5-7 words, but prefer natural breaks
        const shouldBreak = 
          currentChunk.length >= 5 && (
            currentChunk.length >= 7 || // Hard limit
            currentWord.match(/[.,:;]/) || // Punctuation
            ['and', 'but', 'or', 'so', 'yet', 'for', 'nor', 'because', 'since', 'when', 'where', 'while', 'although', 'though', 'unless', 'until', 'if'].includes(nextWord) || // Conjunctions
            ['the', 'a', 'an', 'this', 'that', 'these', 'those'].includes(nextWord) // Articles/determiners
          );
        
        if (shouldBreak || i === words.length - 1) {
          units.push({
            text: currentChunk.join(' '),
            unitNumber: unitNumber++,
            wordCount: currentChunk.length
          });
          currentChunk = [];
        }
        
        i++;
      }
    }
  });

  return units;
}

function calculateStats(units: ThoughtUnit[], originalText: string): ThoughtUnitStats {
  const totalWords = originalText.split(/\s+/).length;
  const averageWordsPerUnit = units.reduce((sum, unit) => sum + unit.wordCount, 0) / units.length;
  
  // Reading time estimation: faster with thought units (400 WPM vs normal 250 WPM)
  const readingTimeEstimate = totalWords / 400; // minutes
  
  return {
    totalUnits: units.length,
    averageWordsPerUnit: Math.round(averageWordsPerUnit * 10) / 10,
    totalWords,
    readingTimeEstimate: Math.round(readingTimeEstimate * 10) / 10
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

  // Generate clean HTML output
  const htmlUnits = units.map((unit, index) => {
    const isEven = index % 2 === 0;
    const bgColor = isEven ? 'bg-blue-50' : 'bg-gray-50';
    const borderColor = isEven ? 'border-blue-200' : 'border-gray-200';
    
    return `
      <div class="thought-unit mb-3 p-4 rounded-lg border ${bgColor} ${borderColor} hover:shadow-sm transition-shadow">
        <div class="flex justify-between items-start mb-2">
          <span class="text-xs font-medium text-blue-600">Unit ${unit.unitNumber}</span>
          <span class="text-xs text-gray-500">${unit.wordCount} words</span>
        </div>
        <div class="text-gray-800 leading-relaxed">
          ${unit.text}
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="space-y-4">
      <div class="bg-blue-50 p-4 rounded-lg border border-blue-200">
        <h3 class="font-semibold text-blue-800 mb-3">📊 Thought Unit Analysis</h3>
        <div class="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div class="text-gray-600">Total Units</div>
            <div class="text-xl font-bold text-blue-600">${stats.totalUnits}</div>
          </div>
          <div>
            <div class="text-gray-600">Avg Words/Unit</div>
            <div class="text-xl font-bold text-green-600">${stats.averageWordsPerUnit}</div>
          </div>
          <div>
            <div class="text-gray-600">Total Words</div>
            <div class="text-xl font-bold text-purple-600">${stats.totalWords}</div>
          </div>
          <div>
            <div class="text-gray-600">Reading Time</div>
            <div class="text-xl font-bold text-orange-600">${stats.readingTimeEstimate}m</div>
          </div>
        </div>
      </div>
      
      <div class="space-y-2">
        <h4 class="font-semibold text-gray-800">📖 Thought Units:</h4>
        <div class="max-h-96 overflow-y-auto">
          ${htmlUnits}
        </div>
      </div>
      
      <div class="text-xs text-gray-500 bg-gray-100 p-3 rounded-lg">
        <div class="font-semibold mb-1">💡 Reading Guide:</div>
        <div>• Read each unit as a complete thought</div>
        <div>• Pause briefly between units to process</div>
        <div>• Focus on meaning rather than individual words</div>
      </div>
    </div>
  `;
}

export { createThoughtUnits, type ThoughtUnit, type ThoughtUnitStats };