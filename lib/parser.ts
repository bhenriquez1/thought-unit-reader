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

  // Generate clean HTML output similar to Velveteen Rabbit style
  const htmlUnits = units.map((unit) => {
    return `
      <div class="thought-unit mb-4 p-4 bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
        <div class="flex justify-between items-center mb-2">
          <span class="text-xs font-semibold text-blue-600">UNIT ${unit.unitNumber}</span>
          <span class="text-xs text-gray-500">${unit.wordCount} words</span>
        </div>
        <div class="text-gray-800 text-base leading-relaxed font-medium">
          ${unit.text}
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="space-y-4">
      <div class="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-lg border border-blue-200 mb-6">
        <h3 class="font-bold text-blue-800 mb-3 text-lg">📊 Thought Unit Analysis</h3>
        <div class="grid grid-cols-2 gap-4 text-sm">
          <div class="bg-white p-3 rounded shadow-sm">
            <div class="text-gray-600 text-xs uppercase tracking-wide">Total Units</div>
            <div class="text-2xl font-bold text-blue-600">${stats.totalUnits}</div>
          </div>
          <div class="bg-white p-3 rounded shadow-sm">
            <div class="text-gray-600 text-xs uppercase tracking-wide">Avg Words/Unit</div>
            <div class="text-2xl font-bold text-green-600">${stats.averageWordsPerUnit}</div>
          </div>
          <div class="bg-white p-3 rounded shadow-sm">
            <div class="text-gray-600 text-xs uppercase tracking-wide">Total Words</div>
            <div class="text-2xl font-bold text-purple-600">${stats.totalWords}</div>
          </div>
          <div class="bg-white p-3 rounded shadow-sm">
            <div class="text-gray-600 text-xs uppercase tracking-wide">Reading Time</div>
            <div class="text-2xl font-bold text-orange-600">${stats.readingTimeEstimate}m</div>
          </div>
        </div>
      </div>
      
      <div class="space-y-3">
        ${htmlUnits}
      </div>
      
      <div class="text-xs text-gray-500 bg-gray-100 p-3 rounded-lg mt-6">
        <div class="font-semibold mb-1">💡 Reading Guide:</div>
        <div>• Read each unit as a complete thought</div>
        <div>• Pause briefly between units to process</div>
        <div>• Focus on meaning rather than individual words</div>
      </div>
    </div>
  `;
}

export { createThoughtUnits, type ThoughtUnit, type ThoughtUnitStats };