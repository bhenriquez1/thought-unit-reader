// Web Worker for NoteLab heavy processing operations
// This worker handles:
// 1. Heavy note analysis and pattern matching
// 2. Flashcard generation
// 3. Note indexing and searching
// 4. Batch operations

interface WorkerRequest {
  id: string;
  type: 'analyzeNote' | 'generateFlashcards' | 'indexNotes' | 'searchNotes' | 'batchProcess';
  payload: any;
}

interface WorkerResponse {
  id: string;
  type: string;
  success: boolean;
  data?: any;
  error?: string;
  progress?: number;
}

// Note analysis functions
function analyzeNoteForPatterns(noteContent: string): {
  suggestedPatterns: string[];
  complexity: 'basic' | 'intermediate' | 'advanced';
  keyTerms: string[];
  studyTips: string[];
} {
  const content = noteContent.toLowerCase();
  const suggestedPatterns: string[] = [];
  let complexity: 'basic' | 'intermediate' | 'advanced' = 'basic';
  const keyTerms: string[] = [];
  const studyTips: string[] = [];

  // Pattern detection keywords
  const patternKeywords = {
    'cardio': ['acid', 'base', 'pka', 'ph', 'acidic', 'basic', 'proton', 'hydrogen'],
    '5q-rule': ['reaction', 'reagent', 'alkene', 'addition', 'product', 'mechanism'],
    'sn-e-flow': ['substitution', 'elimination', 'nucleophile', 'base', 'sn1', 'sn2', 'e1', 'e2'],
    'spectroscopy-anchors': ['ir', 'nmr', 'spectrum', 'peak', 'carbonyl', 'functional group'],
    'eas-directors': ['benzene', 'aromatic', 'substitution', 'ortho', 'para', 'meta'],
    'q-vs-k': ['equilibrium', 'reaction quotient', 'concentration', 'forward', 'reverse'],
    'delta-g-signs': ['spontaneous', 'thermodynamics', 'enthalpy', 'entropy', 'temperature'],
    'gas-laws': ['gas', 'pressure', 'volume', 'temperature', 'ideal gas', 'pv=nrt'],
    'organelle-function': ['cell', 'organelle', 'mitochondria', 'ribosome', 'endoplasmic'],
    'genetics-hardy-weinberg': ['allele', 'frequency', 'population', 'genetics', 'hardy-weinberg'],
    'caries-treatment': ['caries', 'tooth', 'decay', 'restoration', 'dental', 'cavity'],
    'endo-pulp-diagnosis': ['pulp', 'endodontic', 'root canal', 'pain', 'vitality'],
    'cause-effect': ['because', 'therefore', 'thus', 'result', 'caused', 'effect'],
    'compare-contrast': ['however', 'whereas', 'but', 'unlike', 'similar', 'different']
  };

  // Detect patterns
  Object.entries(patternKeywords).forEach(([patternId, keywords]) => {
    const matches = keywords.filter(keyword => content.includes(keyword));
    if (matches.length > 0) {
      suggestedPatterns.push(patternId);
    }
  });

  // Determine complexity
  const technicalTerms = content.match(/\b[a-z]{6,}\b/g) || [];
  const complexSentences = content.split(/[.!?]/).filter(s => s.split(' ').length > 15);
  
  if (technicalTerms.length > 10 || complexSentences.length > 3) {
    complexity = 'advanced';
  } else if (technicalTerms.length > 5 || complexSentences.length > 1) {
    complexity = 'intermediate';
  }

  // Extract key terms
  const words = content.match(/\b[a-z]{4,}\b/g) || [];
  const termFreq = new Map<string, number>();
  
  words.forEach(word => {
    if (!/^(this|that|with|from|they|have|been|will|would|could|should)$/.test(word)) {
      termFreq.set(word, (termFreq.get(word) || 0) + 1);
    }
  });

  const sortedTerms = Array.from(termFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([term]) => term);
  
  keyTerms.push(...sortedTerms);

  // Generate study tips
  studyTips.push(`Focus on understanding: ${keyTerms.slice(0, 3).join(', ')}`);
  
  if (suggestedPatterns.length > 0) {
    studyTips.push(`This content relates to ${suggestedPatterns.length} DAT patterns - great for exam prep!`);
  }
  
  if (complexity === 'advanced') {
    studyTips.push('Break this down into smaller chunks for better retention');
  }

  return {
    suggestedPatterns: suggestedPatterns.slice(0, 3),
    complexity,
    keyTerms,
    studyTips
  };
}

function generateFlashcardsFromNote(noteContent: string, noteTitle: string): Array<{
  front: string;
  back: string;
  difficulty: 'easy' | 'medium' | 'hard';
  tags: string[];
}> {
  const flashcards: Array<{
    front: string;
    back: string;
    difficulty: 'easy' | 'medium' | 'hard';
    tags: string[];
  }> = [];

  // Extract definition-style content
  const definitionPattern = /(.+?)\s+(?:is|are|means|refers to|defined as)\s+(.+?)(?:\.|$)/gi;
  let match;
  
  while ((match = definitionPattern.exec(noteContent)) !== null) {
    const term = match[1].trim();
    const definition = match[2].trim();
    
    if (term.length < 50 && definition.length < 200) {
      flashcards.push({
        front: `What is ${term}?`,
        back: definition,
        difficulty: definition.length > 100 ? 'hard' : 'medium',
        tags: [noteTitle.toLowerCase().replace(/\s+/g, '-')]
      });
    }
  }

  // Extract key concepts from bullet points or numbered lists
  const listPattern = /(?:•|\d+\.|\-)\s*(.+?)(?:\n|$)/g;
  const listItems: string[] = [];
  
  while ((match = listPattern.exec(noteContent)) !== null) {
    const item = match[1].trim();
    if (item.length > 10 && item.length < 150) {
      listItems.push(item);
    }
  }

  if (listItems.length > 1) {
    flashcards.push({
      front: `List the key points about ${noteTitle}`,
      back: listItems.join('\n• '),
      difficulty: listItems.length > 5 ? 'hard' : 'medium',
      tags: [noteTitle.toLowerCase().replace(/\s+/g, '-'), 'key-points']
    });
  }

  // Generate cloze deletion cards for important sentences
  const sentences = noteContent.split(/[.!?]/).filter(s => s.trim().length > 20);
  const importantSentences = sentences.filter(sentence => 
    /\b(important|key|crucial|essential|remember|note|critical)\b/i.test(sentence) ||
    /\b(because|therefore|thus|result|cause|effect)\b/i.test(sentence)
  );

  importantSentences.slice(0, 3).forEach(sentence => {
    const words = sentence.trim().split(' ');
    if (words.length > 5) {
      // Create cloze deletion by removing key terms
      const keyTermIndex = words.findIndex(word => 
        word.length > 6 && !/^(the|and|but|for|with|from)$/i.test(word)
      );
      
      if (keyTermIndex !== -1) {
        const keyTerm = words[keyTermIndex];
        const clozeText = words.map((word, i) => i === keyTermIndex ? '______' : word).join(' ');
        
        flashcards.push({
          front: `Fill in the blank: ${clozeText}`,
          back: keyTerm,
          difficulty: 'medium',
          tags: [noteTitle.toLowerCase().replace(/\s+/g, '-'), 'cloze']
        });
      }
    }
  });

  return flashcards.slice(0, 5); // Limit to 5 flashcards per note
}

function indexNotesForSearch(notes: Array<{
  id: string;
  title: string;
  content: string;
  patterns?: string[];
  tags?: string[];
}>): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();

  notes.forEach(note => {
    const noteId = note.id;
    const allText = `${note.title} ${note.content} ${(note.patterns || []).join(' ')} ${(note.tags || []).join(' ')}`.toLowerCase();
    
    // Tokenize and index
    const tokens = allText
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(token => token.length > 2)
      .filter(token => !/^(the|and|but|for|with|from|this|that|they|have|been|will|would|could|should)$/.test(token));

    tokens.forEach(token => {
      if (!index.has(token)) {
        index.set(token, new Set());
      }
      index.get(token)!.add(noteId);
    });

    // Index bigrams for better phrase matching
    for (let i = 0; i < tokens.length - 1; i++) {
      const bigram = `${tokens[i]} ${tokens[i + 1]}`;
      if (!index.has(bigram)) {
        index.set(bigram, new Set());
      }
      index.get(bigram)!.add(noteId);
    }
  });

  return index;
}

function searchNotesWithIndex(
  query: string,
  index: Map<string, Set<string>>,
  notes: Array<{ id: string; title: string; content: string; }>
): Array<{ id: string; score: number; title: string; snippet: string; }> {
  const queryTokens = query
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(token => token.length > 2);

  const scoreMap = new Map<string, number>();

  // Score notes based on token matches
  queryTokens.forEach(token => {
    // Direct token matches
    if (index.has(token)) {
      index.get(token)!.forEach(noteId => {
        scoreMap.set(noteId, (scoreMap.get(noteId) || 0) + 1);
      });
    }

    // Partial matches
    for (const [indexToken, noteIds] of index.entries()) {
      if (indexToken.includes(token) || token.includes(indexToken)) {
        noteIds.forEach(noteId => {
          scoreMap.set(noteId, (scoreMap.get(noteId) || 0) + 0.5);
        });
      }
    }
  });

  // Create results with snippets
  const results = Array.from(scoreMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([noteId, score]) => {
      const note = notes.find(n => n.id === noteId);
      if (!note) return null;

      // Generate snippet
      const content = note.content.toLowerCase();
      const firstToken = queryTokens[0];
      const tokenIndex = content.indexOf(firstToken);
      
      let snippet = '';
      if (tokenIndex !== -1) {
        const start = Math.max(0, tokenIndex - 50);
        const end = Math.min(content.length, tokenIndex + 100);
        snippet = note.content.slice(start, end).trim();
        if (start > 0) snippet = '...' + snippet;
        if (end < content.length) snippet = snippet + '...';
      } else {
        snippet = note.content.slice(0, 100).trim() + '...';
      }

      return {
        id: noteId,
        score,
        title: note.title,
        snippet
      };
    })
    .filter(Boolean) as Array<{ id: string; score: number; title: string; snippet: string; }>;

  return results;
}

// Main worker message handler
self.onmessage = function(event: MessageEvent<WorkerRequest>) {
  const { id, type, payload } = event.data;

  try {
    switch (type) {
      case 'analyzeNote':
        const analysis = analyzeNoteForPatterns(payload.content);
        self.postMessage({
          id,
          type,
          success: true,
          data: analysis
        } as WorkerResponse);
        break;

      case 'generateFlashcards':
        const flashcards = generateFlashcardsFromNote(payload.content, payload.title);
        self.postMessage({
          id,
          type,
          success: true,
          data: flashcards
        } as WorkerResponse);
        break;

      case 'indexNotes':
        const index = indexNotesForSearch(payload.notes);
        // Convert Map to plain object for serialization
        const indexObj = Object.fromEntries(
          Array.from(index.entries()).map(([key, set]) => [key, Array.from(set)])
        );
        self.postMessage({
          id,
          type,
          success: true,
          data: indexObj
        } as WorkerResponse);
        break;

      case 'searchNotes':
        // Convert index back to Map
        const searchIndex = new Map(
          Object.entries(payload.index).map(([key, arr]) => [key, new Set(arr as string[])])
        );
        const searchResults = searchNotesWithIndex(payload.query, searchIndex, payload.notes);
        self.postMessage({
          id,
          type,
          success: true,
          data: searchResults
        } as WorkerResponse);
        break;

      case 'batchProcess':
        // Process multiple notes in batches to avoid blocking
        const { notes, batchSize = 5 } = payload;
        const results: any[] = [];
        
        // Process notes in chunks with timeouts to prevent blocking
        const processChunk = (startIndex: number) => {
          const endIndex = Math.min(startIndex + batchSize, notes.length);
          const batch = notes.slice(startIndex, endIndex);
          
          batch.forEach((note: any) => {
            const analysis = analyzeNoteForPatterns(note.content);
            const flashcards = generateFlashcardsFromNote(note.content, note.title);
            
            results.push({
              noteId: note.id,
              analysis,
              flashcards
            });
          });

          // Send progress update
          self.postMessage({
            id,
            type,
            success: true,
            progress: Math.round((endIndex / notes.length) * 100),
            data: null
          } as WorkerResponse);

          // Continue with next chunk if there are more notes
          if (endIndex < notes.length) {
            setTimeout(() => processChunk(endIndex), 10);
          } else {
            // Send final results
            self.postMessage({
              id,
              type,
              success: true,
              progress: 100,
              data: results
            } as WorkerResponse);
          }
        };

        // Start processing
        processChunk(0);
        break;

      default:
        throw new Error(`Unknown worker request type: ${type}`);
    }
  } catch (error) {
    self.postMessage({
      id,
      type,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown worker error'
    } as WorkerResponse);
  }
};

export {};
