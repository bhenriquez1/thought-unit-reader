// lib/parser.ts - Final Updated Thought Unit Parser
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

  // Clean the text - normalize spacing and line breaks
  const cleanText = text
    .replace(/\r\n/g, ' ')
    .replace(/\r/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Split into sentences using multiple delimiters
  const sentences = cleanText
    .split(/[.!?]+\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 3 && s.split(/\s+/).length > 1);

  const units: ThoughtUnit[] = [];
  let unitNumber = 1;

  sentences.forEach(sentence => {
    const words = sentence.split(/\s+/).filter(w => w.length > 0);
    
    // Target 3-7 words per unit for optimal reading
    if (words.length <= 7) {
      // Short sentence - keep as single unit
      units.push({
        text: words.join(' '),
        unitNumber: unitNumber++,
        wordCount: words.length
      });
    } else {
      // Longer sentence - break into optimal chunks
      let currentChunk: string[] = [];
      
      for (let i = 0; i < words.length; i++) {
        currentChunk.push(words[i]);
        
        const currentWord = words[i].toLowerCase();
        const nextWord = words[i + 1]?.toLowerCase() || '';
        
        // Natural break conditions
        const hasComma = currentWord.includes(',');
        const hasColon = currentWord.includes(':');
        const hasSemicolon = currentWord.includes(';');
        const isConjunction = ['and', 'but', 'or', 'so', 'yet', 'for', 'nor'].includes(nextWord);
        const isSubordinating = ['because', 'since', 'when', 'where', 'while', 'although', 'though', 'unless', 'until', 'if', 'that', 'which', 'who'].includes(nextWord);
        const isPreposition = ['in', 'on', 'at', 'by', 'for', 'with', 'from', 'to', 'of', 'about'].includes(nextWord);
        
        const shouldBreak = 
          currentChunk.length >= 3 && (
            currentChunk.length >= 7 || // Hard limit
            hasComma || hasColon || hasSemicolon ||
            isConjunction || isSubordinating ||
            (currentChunk.length >= 5 && isPreposition)
          );
        
        if (shouldBreak || i === words.length - 1) {
          units.push({
            text: currentChunk.join(' '),
            unitNumber: unitNumber++,
            wordCount: currentChunk.length
          });
          currentChunk = [];
        }
      }
    }
  });

  return units;
}

function calculateStats(units: ThoughtUnit[], originalText: string): ThoughtUnitStats {
  const totalWords = originalText.split(/\s+/).filter(w => w.length > 0).length;
  const averageWordsPerUnit = units.reduce((sum, unit) => sum + unit.wordCount, 0) / units.length;
  const readingTimeEstimate = totalWords / 400; // WPM for thought unit reading
  
  return {
    totalUnits: units.length,
    averageWordsPerUnit: Math.round(averageWordsPerUnit * 10) / 10,
    totalWords,
    readingTimeEstimate: Math.round(readingTimeEstimate * 10) / 10
  };
}

export function improveBiomedicalParsing(text: string): string {
  if (!text || text.trim().length === 0) {
    return `
      <div class="flex items-center justify-center h-64 text-gray-500">
        <div class="text-center">
          <div class="text-4xl mb-4">📝</div>
          <p class="text-lg">No text content to analyze</p>
        </div>
      </div>
    `;
  }

  const units = createThoughtUnits(text);
  const stats = calculateStats(units, text);
  
  if (units.length === 0) {
    return `
      <div class="flex items-center justify-center h-64 text-gray-500">
        <div class="text-center">
          <div class="text-4xl mb-4">⚠️</div>
          <p class="text-lg">Could not create thought units</p>
          <p class="text-sm mt-2">Please try different text content</p>
        </div>
      </div>
    `;
  }

  // Generate beautiful thought unit cards
  const htmlUnits = units.map((unit) => {
    return `
      <div class="thought-unit-card bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200 mb-4 overflow-hidden">
        <div class="bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-2 border-b border-gray-100">
          <div class="flex justify-between items-center">
            <span class="text-xs font-bold text-blue-700 uppercase tracking-wide">Unit ${unit.unitNumber}</span>
            <span class="text-xs text-gray-600 bg-white px-2 py-1 rounded-full">${unit.wordCount} words</span>
          </div>
        </div>
        <div class="p-4">
          <div class="text-gray-900 text-base leading-relaxed font-medium">
            ${unit.text}
          </div>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="thought-units-container">
      <!-- Stats Overview -->
      <div class="bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 rounded-lg border border-blue-200 p-6 mb-6 shadow-sm">
        <h3 class="text-lg font-bold text-gray-800 mb-4 flex items-center">
          <span class="text-blue-600 mr-2">📊</span>
          Thought Unit Analysis
        </h3>
        <div class="grid grid-cols-2 gap-4">
          <div class="bg-white rounded-lg p-4 text-center shadow-sm">
            <div class="text-2xl font-bold text-blue-600">${stats.totalUnits}</div>
            <div class="text-xs text-gray-600 uppercase tracking-wide">Total Units</div>
          </div>
          <div class="bg-white rounded-lg p-4 text-center shadow-sm">
            <div class="text-2xl font-bold text-green-600">${stats.averageWordsPerUnit}</div>
            <div class="text-xs text-gray-600 uppercase tracking-wide">Avg Words/Unit</div>
          </div>
          <div class="bg-white rounded-lg p-4 text-center shadow-sm">
            <div class="text-2xl font-bold text-purple-600">${stats.totalWords}</div>
            <div class="text-xs text-gray-600 uppercase tracking-wide">Total Words</div>
          </div>
          <div class="bg-white rounded-lg p-4 text-center shadow-sm">
            <div class="text-2xl font-bold text-orange-600">${stats.readingTimeEstimate}m</div>
            <div class="text-xs text-gray-600 uppercase tracking-wide">Reading Time</div>
          </div>
        </div>
      </div>

      <!-- Thought Units -->
      <div class="thought-units-list space-y-0">
        ${htmlUnits}
      </div>

      <!-- Reading Tips -->
      <div class="bg-gray-50 rounded-lg border border-gray-200 p-4 mt-6">
        <h4 class="font-semibold text-gray-800 mb-2 flex items-center">
          <span class="text-yellow-500 mr-2">💡</span>
          Reading Guide
        </h4>
        <div class="text-sm text-gray-600 space-y-1">
          <div>• Read each unit as a complete thought</div>
          <div>• Pause briefly between units to process the meaning</div>
          <div>• Focus on understanding concepts rather than individual words</div>
          <div>• Use the visual breaks to maintain reading rhythm</div>
        </div>
      </div>
    </div>
  `;
}

export { createThoughtUnits, type ThoughtUnit, type ThoughtUnitStats };