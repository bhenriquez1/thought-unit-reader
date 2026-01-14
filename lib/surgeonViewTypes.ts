// lib/surgeonViewTypes.ts
// Data structures for Surgeon View PDRM cognitive workflow

export type PDRMTag = 'P' | 'D' | 'R' | 'M';

export type RuleLifecycleState = 'draft' | 'stable' | 'compressed' | 'deprecated';

export interface SourceReference {
  bookId: string;
  bookTitle?: string;
  chapterId?: string;
  chapterTitle?: string;
  thoughtUnitId?: string;
  thoughtUnitIndex?: number;
  pageNumber?: number;
  selectedText: string;
  contextBefore?: string;
  contextAfter?: string;
}

export interface Note {
  id: string;
  content: string;
  source: SourceReference;
  tags: PDRMTag[];
  hyperChunkId?: string; // Links to a hyper-chunk
  createdAt: number;
  updatedAt: number;
  archived: boolean;
}

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  source: SourceReference;
  tags: PDRMTag[];
  hyperChunkId?: string;
  confidence: number; // 0-5 scale
  lastReviewed?: number;
  reviewCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface HyperChunk {
  id: string;
  title: string;
  description: string;
  noteIds: string[];
  flashcardIds: string[];
  tags: PDRMTag[];
  ruleState: RuleLifecycleState;
  crossDomainTags: string[]; // e.g., "gradient-threshold", "necessity-vs-sufficiency"
  createdAt: number;
  updatedAt: number;
  color?: string; // For visual organization
}

export interface PDRMHighlight {
  id: string;
  source: SourceReference;
  tags: PDRMTag[];
  noteId?: string;
  flashcardId?: string;
  hyperChunkId?: string;
  color: string;
  createdAt: number;
}

export interface CompressionSheet {
  id: string;
  title: string;
  chapterId: string;
  hyperChunkIds: string[];
  keyRules: string[];
  visualAnchors: string[];
  createdAt: number;
  updatedAt: number;
}

export interface MetaLearningEntry {
  id: string;
  date: number;
  ruleThatSavedTime?: string;
  trapThatAlmostFooledYou?: string;
  ruleReadyForCompression?: string;
  confidenceAudit: string[]; // 3 rules that now feel boringly obvious
  reflectionNotes: string;
}

// Storage utilities for localStorage
export class SurgeonViewStorage {
  private static readonly STORAGE_PREFIX = 'surgeonView_';

  static saveNotes(bookId: string, notes: Note[]): void {
    try {
      localStorage.setItem(
        `${this.STORAGE_PREFIX}notes_${bookId}`,
        JSON.stringify(notes)
      );
    } catch (error) {
      console.warn('Failed to save notes:', error);
    }
  }

  static loadNotes(bookId: string): Note[] {
    try {
      const data = localStorage.getItem(`${this.STORAGE_PREFIX}notes_${bookId}`);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.warn('Failed to load notes:', error);
      return [];
    }
  }

  static saveFlashcards(bookId: string, flashcards: Flashcard[]): void {
    try {
      localStorage.setItem(
        `${this.STORAGE_PREFIX}flashcards_${bookId}`,
        JSON.stringify(flashcards)
      );
    } catch (error) {
      console.warn('Failed to save flashcards:', error);
    }
  }

  static loadFlashcards(bookId: string): Flashcard[] {
    try {
      const data = localStorage.getItem(`${this.STORAGE_PREFIX}flashcards_${bookId}`);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.warn('Failed to load flashcards:', error);
      return [];
    }
  }

  static saveHyperChunks(bookId: string, chunks: HyperChunk[]): void {
    try {
      localStorage.setItem(
        `${this.STORAGE_PREFIX}hyperchunks_${bookId}`,
        JSON.stringify(chunks)
      );
    } catch (error) {
      console.warn('Failed to save hyper-chunks:', error);
    }
  }

  static loadHyperChunks(bookId: string): HyperChunk[] {
    try {
      const data = localStorage.getItem(`${this.STORAGE_PREFIX}hyperchunks_${bookId}`);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.warn('Failed to load hyper-chunks:', error);
      return [];
    }
  }

  static saveHighlights(bookId: string, highlights: PDRMHighlight[]): void {
    try {
      localStorage.setItem(
        `${this.STORAGE_PREFIX}highlights_${bookId}`,
        JSON.stringify(highlights)
      );
    } catch (error) {
      console.warn('Failed to save highlights:', error);
    }
  }

  static loadHighlights(bookId: string): PDRMHighlight[] {
    try {
      const data = localStorage.getItem(`${this.STORAGE_PREFIX}highlights_${bookId}`);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.warn('Failed to load highlights:', error);
      return [];
    }
  }

  static saveCompressionSheets(bookId: string, sheets: CompressionSheet[]): void {
    try {
      localStorage.setItem(
        `${this.STORAGE_PREFIX}compressionsheets_${bookId}`,
        JSON.stringify(sheets)
      );
    } catch (error) {
      console.warn('Failed to save compression sheets:', error);
    }
  }

  static loadCompressionSheets(bookId: string): CompressionSheet[] {
    try {
      const data = localStorage.getItem(`${this.STORAGE_PREFIX}compressionsheets_${bookId}`);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.warn('Failed to load compression sheets:', error);
      return [];
    }
  }

  static saveMetaLearning(entries: MetaLearningEntry[]): void {
    try {
      localStorage.setItem(
        `${this.STORAGE_PREFIX}metalearning`,
        JSON.stringify(entries)
      );
    } catch (error) {
      console.warn('Failed to save meta-learning entries:', error);
    }
  }

  static loadMetaLearning(): MetaLearningEntry[] {
    try {
      const data = localStorage.getItem(`${this.STORAGE_PREFIX}metalearning`);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.warn('Failed to load meta-learning entries:', error);
      return [];
    }
  }
}
