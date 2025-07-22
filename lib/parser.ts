// lib/enhanced-parser.ts - Enhanced Thought Unit Parser with Chapter Detection
interface ThoughtUnit {
  id: string;
  text: string;
  unitNumber: number;
  wordCount: number;
  chapterId: string;
  globalIndex: number;
}

interface Chapter {
  id: string;
  title: string;
  number: number;
  startIndex: number;
  endIndex: number;
  wordCount: number;
  estimatedReadTime: number;
  units: ThoughtUnit[];
}

interface BookStructure {
  title?: string;
  chapters: Chapter[];
  totalUnits: number;
  totalWords: number;
  estimatedReadTime: number;
}

function detectChapters(text: string): { chapters: Array<{title: string, content: string, startIndex: number}>, remainingText: string } {
  const chapterPatterns = [
    /^(Chapter\s+\d+[:\-\s]*.*)$/gim,
    /^(CHAPTER\s+\d+[:\-\s]*.*)$/gim,
    /^(\d+\.\s+.*)$/gim,
    /^([A-Z][A-Z\s]{10,})$/gim, // ALL CAPS titles
    /^(\*{3,}\s*.+\s*\*{3,})$/gim, // ***Title***
    /^(={3,}\s*.+\s*={3,})$/gim, // ===Title===
  ];

  let chapters: Array<{title: string, content: string, startIndex: number}> = [];
  let detectedBreaks: Array<{index: number, title: string}> = [];

  // Find all potential chapter breaks
  chapterPatterns.forEach(pattern => {
    const matches = Array.from(text.matchAll(pattern));
    matches.forEach(match => {
      if (match.index !== undefined) {
        detectedBreaks.push({
          index: match.index,
          title: match[1].trim()
        });
      }
    });
  });

  // Sort by position and remove duplicates
  detectedBreaks.sort((a, b) => a.index - b.index);
  
  // Remove duplicate or very close breaks (within 100 characters)
  const filteredBreaks = detectedBreaks.filter((item, index) => {
    if (index === 0) return true;
    return item.index - detectedBreaks[index - 1].index > 100;
  });

  if (filteredBreaks.length === 0) {
    // No chapters detected, treat as single chapter
    return {
      chapters: [{
        title: "Introduction",
        content: text,
        startIndex: 0
      }],
      remainingText: ""
    };
  }

  // Create chapters from detected breaks
  for (let i = 0; i < filteredBreaks.length; i++) {
    const currentBreak = filteredBreaks[i];
    const nextBreak = filteredBreaks[i + 1];
    
    const startIndex = currentBreak.index;
    const endIndex = nextBreak ? nextBreak.index : text.length;
    
    const content = text.slice(startIndex, endIndex).trim();
    
    chapters.push({
      title: currentBreak.title,
      content: content,
      startIndex: startIndex
    });
  }

  return { chapters, remainingText: "" };
}

function createThoughtUnitsForChapter(text: string, chapterId: string, startingUnitNumber: number): ThoughtUnit[] {
  if (!text || text.trim().length === 0) {
    return [];
  }

  // Clean the text
  const cleanText = text
    .replace(/\r\n/g, ' ')
    .replace(/\r/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Split into sentences
  const sentences = cleanText
    .split(/[.!?]+\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 3 && s.split(/\s+/).length > 1);

  const units: ThoughtUnit[] = [];
  let unitNumber = startingUnitNumber;
  let globalIndex = 0;

  sentences.forEach(sentence => {
    const words = sentence.split(/\s+/).filter(w => w.length > 0);
    
    if (words.length <= 7) {
      // Short sentence - keep as single unit
      units.push({
        id: `${chapterId}-unit-${unitNumber}`,
        text: words.join(' '),
        unitNumber: unitNumber++,
        wordCount: words.length,
        chapterId,
        globalIndex: globalIndex++
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
        
        const shouldBreak = 
          currentChunk.length >= 3 && (
            currentChunk.length >= 7 || // Hard limit
            hasComma || hasColon || hasSemicolon ||
            isConjunction || isSubordinating
          );
        
        if (shouldBreak || i === words.length - 1) {
          units.push({
            id: `${chapterId}-unit-${unitNumber}`,
            text: currentChunk.join(' '),
            unitNumber: unitNumber++,
            wordCount: currentChunk.length,
            chapterId,
            globalIndex: globalIndex++
          });
          currentChunk = [];
        }
      }
    }
  });

  return units;
}

export function parseBookWithChapters(text: string, bookTitle?: string): BookStructure {
  const { chapters: detectedChapters } = detectChapters(text);
  const chapters: Chapter[] = [];
  let globalUnitNumber = 1;

  detectedChapters.forEach((chapter, index) => {
    const chapterId = `chapter-${index + 1}`;
    const units = createThoughtUnitsForChapter(chapter.content, chapterId, globalUnitNumber);
    
    const wordCount = units.reduce((sum, unit) => sum + unit.wordCount, 0);
    const estimatedReadTime = Math.ceil(wordCount / 200); // 200 WPM for thought units

    chapters.push({
      id: chapterId,
      title: chapter.title,
      number: index + 1,
      startIndex: globalUnitNumber - 1,
      endIndex: globalUnitNumber + units.length - 2,
      wordCount,
      estimatedReadTime,
      units
    });

    globalUnitNumber += units.length;
  });

  const totalWords = chapters.reduce((sum, chapter) => sum + chapter.wordCount, 0);
  const totalUnits = chapters.reduce((sum, chapter) => sum + chapter.units.length, 0);

  return {
    title: bookTitle || "Untitled Book",
    chapters,
    totalUnits,
    totalWords,
    estimatedReadTime: Math.ceil(totalWords / 200)
  };
}

export function generateProgressiveReadingHTML(bookStructure: BookStructure, currentChapterIndex: number = 0): string {
  const currentChapter = bookStructure.chapters[currentChapterIndex];
  
  if (!currentChapter) {
    return `<div class="text-center text-gray-500">Chapter not found</div>`;
  }

  const chapterNavigation = bookStructure.chapters.map((chapter, index) => {
    const isActive = index === currentChapterIndex;
    const isCompleted = index < currentChapterIndex;
    
    return `
      <div class="flex items-center p-2 rounded-lg cursor-pointer transition-all ${
        isActive ? 'bg-blue-100 border-l-4 border-blue-500' : 
        isCompleted ? 'bg-green-50 border-l-4 border-green-400' : 
        'hover:bg-gray-50'
      }" onclick="loadChapter(${index})">
        <div class="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
          isCompleted ? 'bg-green-500 text-white' :
          isActive ? 'bg-blue-500 text-white' :
          'bg-gray-200 text-gray-600'
        }">
          ${isCompleted ? '✓' : chapter.number}
        </div>
        <div class="ml-3 flex-1">
          <div class="text-sm font-medium ${isActive ? 'text-blue-900' : 'text-gray-900'}">
            ${chapter.title}
          </div>
          <div class="text-xs text-gray-500">
            ${chapter.units.length} units • ${chapter.estimatedReadTime}m
          </div>
        </div>
      </div>
    `;
  }).join('');

  const progressiveUnits = currentChapter.units.map((unit, index) => {
    return `
      <div class="thought-unit-progressive mb-6 opacity-30 transition-all duration-500" 
           id="unit-${unit.id}" 
           data-unit-index="${index}">
        <div class="bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">
          <div class="bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-2 border-b border-gray-100">
            <div class="flex justify-between items-center">
              <span class="text-xs font-bold text-blue-700 uppercase tracking-wide">
                Unit ${unit.unitNumber}
              </span>
              <div class="flex items-center space-x-2">
                <span class="text-xs text-gray-600 bg-white px-2 py-1 rounded-full">
                  ${unit.wordCount} words
                </span>
                <div class="w-2 h-2 rounded-full bg-gray-300" id="progress-${unit.id}"></div>
              </div>
            </div>
          </div>
          <div class="p-4">
            <div class="text-gray-900 text-base leading-relaxed font-medium">
              ${unit.text}
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="progressive-reader-container">
      <!-- Book Header -->
      <div class="bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-6 rounded-lg mb-6">
        <h1 class="text-2xl font-bold mb-2">${bookStructure.title}</h1>
        <div class="flex items-center space-x-4 text-sm opacity-90">
          <span>${bookStructure.totalUnits} total units</span>
          <span>•</span>
          <span>${bookStructure.estimatedReadTime}m estimated</span>
          <span>•</span>
          <span>${bookStructure.chapters.length} chapters</span>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <!-- Chapter Navigation -->
        <div class="lg:col-span-1">
          <div class="sticky top-4">
            <h3 class="text-lg font-semibold mb-4 text-gray-800">Chapters</h3>
            <div class="space-y-2 max-h-96 overflow-y-auto">
              ${chapterNavigation}
            </div>
          </div>
        </div>

        <!-- Reading Content -->
        <div class="lg:col-span-3">
          <!-- Chapter Header -->
          <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            <h2 class="text-xl font-bold text-gray-800 mb-2">${currentChapter.title}</h2>
            <div class="flex items-center space-x-4 text-sm text-gray-600">
              <span>${currentChapter.units.length} units</span>
              <span>•</span>
              <span>${currentChapter.estimatedReadTime}m</span>
              <span>•</span>
              <span>Chapter ${currentChapter.number} of ${bookStructure.chapters.length}</span>
            </div>
            
            <!-- Reading Controls -->
            <div class="flex items-center space-x-3 mt-4">
              <button onclick="startProgressiveReading()" 
                      class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                🎯 Start Reading
              </button>
              <button onclick="pauseReading()" 
                      class="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                ⏸️ Pause
              </button>
              <button onclick="resetReading()" 
                      class="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                🔄 Reset
              </button>
              <div class="flex items-center space-x-2">
                <label class="text-sm text-gray-600">Speed:</label>
                <select id="reading-speed" class="text-sm border border-gray-300 rounded px-2 py-1">
                  <option value="3000">Slow (3s)</option>
                  <option value="2000" selected>Normal (2s)</option>
                  <option value="1500">Fast (1.5s)</option>
                  <option value="1000">Very Fast (1s)</option>
                </select>
              </div>
            </div>
          </div>

          <!-- Progress Bar -->
          <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
            <div class="flex justify-between items-center mb-2">
              <span class="text-sm font-medium text-gray-700">Reading Progress</span>
              <span class="text-sm text-gray-600" id="progress-text">0 of ${currentChapter.units.length} units</span>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-2">
              <div class="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                   id="progress-bar" style="width: 0%"></div>
            </div>
          </div>

          <!-- Thought Units -->
          <div id="thought-units-container">
            ${progressiveUnits}
          </div>

          <!-- Chapter Navigation -->
          <div class="flex justify-between items-center mt-8 p-4 bg-gray-50 rounded-lg">
            <button onclick="previousChapter()" 
                    ${currentChapterIndex === 0 ? 'disabled' : ''}
                    class="flex items-center space-x-2 px-4 py-2 bg-gray-600 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed">
              <span>←</span>
              <span>Previous Chapter</span>
            </button>
            
            <span class="text-sm text-gray-600">
              Chapter ${currentChapter.number} of ${bookStructure.chapters.length}
            </span>
            
            <button onclick="nextChapter()" 
                    ${currentChapterIndex === bookStructure.chapters.length - 1 ? 'disabled' : ''}
                    class="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed">
              <span>Next Chapter</span>
              <span>→</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <script>
      let isReading = false;
      let currentUnitIndex = 0;
      let readingInterval = null;
      let currentChapter = ${currentChapterIndex};
      const totalUnits = ${currentChapter.units.length};

      function startProgressiveReading() {
        if (isReading) return;
        
        isReading = true;
        const speed = parseInt(document.getElementById('reading-speed').value);
        
        readingInterval = setInterval(() => {
          if (currentUnitIndex >= totalUnits) {
            pauseReading();
            return;
          }
          
          revealNextUnit();
          currentUnitIndex++;
          updateProgress();
        }, speed);
      }

      function pauseReading() {
        isReading = false;
        if (readingInterval) {
          clearInterval(readingInterval);
          readingInterval = null;
        }
      }

      function resetReading() {
        pauseReading();
        currentUnitIndex = 0;
        
        // Hide all units
        document.querySelectorAll('.thought-unit-progressive').forEach(unit => {
          unit.style.opacity = '0.3';
          unit.style.transform = 'translateY(20px)';
        });
        
        // Reset progress indicators
        document.querySelectorAll('[id^="progress-"]').forEach(indicator => {
          indicator.style.backgroundColor = '#d1d5db';
        });
        
        updateProgress();
      }

      function revealNextUnit() {
        const units = document.querySelectorAll('.thought-unit-progressive');
        if (currentUnitIndex < units.length) {
          const unit = units[currentUnitIndex];
          unit.style.opacity = '1';
          unit.style.transform = 'translateY(0)';
          
          // Update progress indicator
          const progressDot = document.getElementById('progress-' + unit.id.replace('unit-', ''));
          if (progressDot) {
            progressDot.style.backgroundColor = '#10b981';
          }
          
          // Scroll into view
          unit.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }

      function updateProgress() {
        const progressBar = document.getElementById('progress-bar');
        const progressText = document.getElementById('progress-text');
        
        const percentage = (currentUnitIndex / totalUnits) * 100;
        progressBar.style.width = percentage + '%';
        progressText.textContent = currentUnitIndex + ' of ' + totalUnits + ' units';
      }

      function loadChapter(chapterIndex) {
        // This would need to be implemented to reload the page with the new chapter
        window.location.reload(); // Placeholder
      }

      function previousChapter() {
        if (currentChapter > 0) {
          loadChapter(currentChapter - 1);
        }
      }

      function nextChapter() {
        loadChapter(currentChapter + 1);
      }

      // Auto-start reading after 2 seconds
      setTimeout(() => {
        startProgressiveReading();
      }, 2000);
    </script>
  `;
}