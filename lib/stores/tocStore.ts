// lib/stores/tocStore.ts
// TOC Store - Persists Table of Contents per document
// Auto-generates TOC on PDF upload via outline or heuristic parsing

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useCurrentLearningContext } from '../context/learningContext';

export interface TocItem {
  id: string;
  title: string;
  pageNumber: number;
  level: number;  // 0 = top level, 1 = sub-chapter, etc.
  children?: TocItem[];
}

export interface DocumentToc {
  documentId: string;
  documentName: string;
  items: TocItem[];
  generatedFrom: 'outline' | 'heuristic' | 'manual';
  generatedAt: string;
  lastAccessed: string;
}

interface TocState {
  // Stored TOCs by documentId
  tocs: Record<string, DocumentToc>;
  
  // Current active document
  activeDocumentId: string | null;
  
  // Actions
  setActiveToc: (documentId: string) => void;
  getToc: (documentId: string) => DocumentToc | null;
  saveToc: (documentId: string, documentName: string, items: TocItem[], source: 'outline' | 'heuristic' | 'manual') => void;
  addTocItem: (documentId: string, item: Omit<TocItem, 'id'>) => void;
  updateTocItem: (documentId: string, itemId: string, updates: Partial<TocItem>) => void;
  deleteTocItem: (documentId: string, itemId: string) => void;
  clearToc: (documentId: string) => void;
  
  // TOC Generation helpers
  generateFromOutline: (documentId: string, documentName: string, outline: any[]) => TocItem[];
  generateFromHeuristic: (documentId: string, documentName: string, pages: string[], pageCount?: number) => TocItem[];
}

// Helper to generate unique IDs
const generateId = () => `toc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// Parse PDF outline to TocItem array
function parseOutlineToToc(outline: any[], level: number = 0): TocItem[] {
  if (!outline || !Array.isArray(outline)) return [];
  
  return outline.map((item, idx) => {
    const tocItem: TocItem = {
      id: generateId(),
      title: item.title || `Item ${idx + 1}`,
      pageNumber: typeof item.dest === 'number' ? item.dest + 1 : (item.pageNumber || 1),
      level,
    };
    
    if (item.items && item.items.length > 0) {
      tocItem.children = parseOutlineToToc(item.items, level + 1);
    }
    
    return tocItem;
  });
}

// Clean and truncate TOC title - ensures short, readable titles
function cleanTocTitle(title: string): string {
  // Remove excessive dots, tabs, spaces
  let cleaned = title.replace(/\.{2,}/g, '').replace(/\t+/g, ' ').replace(/\s+/g, ' ').trim();

  // Remove trailing page numbers
  cleaned = cleaned.replace(/\s+\d+\s*$/, '').trim();

  // Truncate to max 80 chars with ellipsis
  if (cleaned.length > 80) {
    cleaned = cleaned.substring(0, 77).trim() + '...';
  }

  return cleaned;
}

// Check if text looks like a paragraph (not a heading)
function isParagraphText(text: string): boolean {
  // Paragraphs tend to:
  // - Be longer than 100 chars
  // - Have multiple sentences (periods followed by capital letters)
  // - Start with lowercase or articles
  // - Have many commas
  if (text.length > 120) return true;
  if ((text.match(/\. [A-Z]/g) || []).length >= 2) return true;
  if ((text.match(/,/g) || []).length >= 3) return true;
  if (/^(the|a|an|this|that|it|in|on|at|for|with|to)\s/i.test(text)) return true;

  return false;
}

// Heuristic TOC extraction from page text
function extractTocFromPages(pages: string[]): TocItem[] {
  const items: TocItem[] = [];

  // Common TOC patterns (ordered by specificity)
  const patterns = [
    // "Chapter 1: Title .............. 15"
    /^(Chapter|Section|Part|Unit)\s*(\d+)[:\.\s]+(.+?)\s*\.{2,}\s*(\d+)/i,
    // "Chapter 1: Title" without page number
    /^(Chapter|Section|Part|Unit)\s*(\d+)[:\.\s]+(.+)/i,
    // "1. Title ........... 15"
    /^(\d+)[\.)\s]+(.{3,60}?)\s*\.{2,}\s*(\d+)/,
    // "Title ... 15" (TOC format)
    /^([A-Z][^\.]{3,60}?)\s*\.{2,}\s*(\d+)$/,
    // "INTRODUCTION 1" or "PREFACE 5"
    /^([A-Z][A-Z\s]{2,40})\s+(\d+)$/,
    // "I. Title" or "IV. Title" (Roman numerals)
    /^([IVXLC]+)\.\s+(.{3,60})/,
  ];

  // Only scan first 30 pages for TOC
  const scanPages = pages.slice(0, 30);

  scanPages.forEach((pageText, pageIdx) => {
    const lines = pageText.split('\n').filter(l => l.trim());

    lines.forEach(line => {
      const trimmed = line.trim();

      // Skip empty or very short lines
      if (trimmed.length < 3) return;

      // Skip paragraph-like text
      if (isParagraphText(trimmed)) return;

      for (const pattern of patterns) {
        const match = trimmed.match(pattern);
        if (match) {
          let title: string;
          let pageNumber: number;

          if (match.length === 5) {
            // Chapter pattern with page number
            title = `${match[1]} ${match[2]}: ${match[3].trim()}`;
            pageNumber = parseInt(match[4], 10);
          } else if (match.length === 4) {
            // Chapter pattern without page number OR numbered pattern with page
            if (/chapter|section|part|unit/i.test(match[1])) {
              title = `${match[1]} ${match[2]}: ${match[3].trim()}`;
              pageNumber = pageIdx + 1; // Use current page as estimate
            } else {
              title = `${match[1]}. ${match[2].trim()}`;
              pageNumber = parseInt(match[3], 10);
            }
          } else if (match.length === 3) {
            // Simple pattern or Roman numerals
            if (/^[IVXLC]+$/.test(match[1])) {
              title = `${match[1]}. ${match[2].trim()}`;
              pageNumber = pageIdx + 1;
            } else {
              title = match[1].trim();
              pageNumber = parseInt(match[2], 10);
            }
          } else {
            continue;
          }

          // Clean and validate title
          title = cleanTocTitle(title);

          // Validate
          if (pageNumber > 0 && pageNumber < 9999 && title.length >= 3 && title.length <= 100) {
            // Check for duplicates
            if (!items.find(i => i.title === title)) {
              items.push({
                id: generateId(),
                title,
                pageNumber,
                level: /chapter|part/i.test(title) ? 0 : 1
              });
            }
          }
          break;
        }
      }
    });
  });

  // Sort by page number
  items.sort((a, b) => a.pageNumber - b.pageNumber);

  return items;
}

// Generate fallback page-range TOC when no structure is detected
function generatePageRangeToc(pageCount: number, chunkSize: number = 10): TocItem[] {
  if (!pageCount || pageCount < 1) return [];

  const items: TocItem[] = [];
  const numRanges = Math.ceil(pageCount / chunkSize);

  for (let i = 0; i < numRanges; i++) {
    const startPage = i * chunkSize + 1;
    const endPage = Math.min((i + 1) * chunkSize, pageCount);

    items.push({
      id: generateId(),
      title: `Pages ${startPage}–${endPage}`,
      pageNumber: startPage,
      level: 0
    });
  }

  return items;
}

const quotaSafeStorage = typeof window === 'undefined'
  ? { getItem: () => null as string | null, setItem: () => {}, removeItem: () => {} }
  : {
      getItem: (name: string): string | null => {
        try { return localStorage.getItem(name); } catch { return null; }
      },
      setItem: (name: string, value: string): void => {
        try {
          localStorage.setItem(name, value);
        } catch (e) {
          if (
            e instanceof DOMException &&
            (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22)
          ) {
            console.warn('[WARN toc-store quota skipped]', { valueLength: value.length });
          }
        }
      },
      removeItem: (name: string): void => {
        try { localStorage.removeItem(name); } catch { /* ignore */ }
      },
    };

export const useTocStore = create<TocState>()(
  persist(
    (set, get) => ({
      tocs: {},
      activeDocumentId: null,
      
      setActiveToc: (documentId: string) => {
        set({ activeDocumentId: documentId });
        
        // Update lastAccessed
        const toc = get().tocs[documentId];
        if (toc) {
          set((state) => ({
            tocs: {
              ...state.tocs,
              [documentId]: {
                ...toc,
                lastAccessed: new Date().toISOString()
              }
            }
          }));
        }
      },
      
      getToc: (documentId: string) => {
        return get().tocs[documentId] || null;
      },
      
      saveToc: (documentId: string, documentName: string, items: TocItem[], source: 'outline' | 'heuristic' | 'manual') => {
        const now = new Date().toISOString();
        
        set((state) => ({
          tocs: {
            ...state.tocs,
            [documentId]: {
              documentId,
              documentName,
              items,
              generatedFrom: source,
              generatedAt: now,
              lastAccessed: now
            }
          },
          activeDocumentId: documentId
        }));
        
        console.log(`📑 TOC saved for ${documentName}: ${items.length} items (${source})`);
      },
      
      addTocItem: (documentId: string, item: Omit<TocItem, 'id'>) => {
        const toc = get().tocs[documentId];
        if (!toc) return;
        
        const newItem: TocItem = {
          ...item,
          id: generateId()
        };
        
        set((state) => ({
          tocs: {
            ...state.tocs,
            [documentId]: {
              ...toc,
              items: [...toc.items, newItem].sort((a, b) => a.pageNumber - b.pageNumber),
              generatedFrom: 'manual',
              lastAccessed: new Date().toISOString()
            }
          }
        }));
      },
      
      updateTocItem: (documentId: string, itemId: string, updates: Partial<TocItem>) => {
        const toc = get().tocs[documentId];
        if (!toc) return;
        
        set((state) => ({
          tocs: {
            ...state.tocs,
            [documentId]: {
              ...toc,
              items: toc.items.map(item => 
                item.id === itemId ? { ...item, ...updates } : item
              ),
              lastAccessed: new Date().toISOString()
            }
          }
        }));
      },
      
      deleteTocItem: (documentId: string, itemId: string) => {
        const toc = get().tocs[documentId];
        if (!toc) return;
        
        set((state) => ({
          tocs: {
            ...state.tocs,
            [documentId]: {
              ...toc,
              items: toc.items.filter(item => item.id !== itemId),
              lastAccessed: new Date().toISOString()
            }
          }
        }));
      },
      
      clearToc: (documentId: string) => {
        set((state) => {
          const { [documentId]: _, ...rest } = state.tocs;
          return { tocs: rest };
        });
      },
      
      // Generate TOC from PDF outline
      generateFromOutline: (documentId: string, documentName: string, outline: any[]) => {
        const items = parseOutlineToToc(outline);
        
        if (items.length > 0) {
          get().saveToc(documentId, documentName, items, 'outline');
        }
        
        return items;
      },
      
      // Generate TOC from heuristic page scanning
      generateFromHeuristic: (documentId: string, documentName: string, pages: string[], pageCount?: number) => {
        let items = extractTocFromPages(pages);

        // If no items found, generate fallback page-range TOC
        if (items.length === 0 && pageCount && pageCount > 0) {
          console.log(`📑 No TOC detected, generating page-range fallback for ${pageCount} pages`);
          items = generatePageRangeToc(pageCount);
        }

        if (items.length > 0) {
          get().saveToc(documentId, documentName, items, 'heuristic');
        }

        return items;
      }
    }),
    {
      name: 'toc-store',
      storage: createJSONStorage(() => quotaSafeStorage),
      partialize: (state) => {
        const sorted = Object.entries(state.tocs)
          .sort(([, a], [, b]) =>
            new Date(b.lastAccessed).getTime() - new Date(a.lastAccessed).getTime()
          )
          .slice(0, 10)
          .map(([id, doc]) => [id, { ...doc, items: doc.items.slice(0, 500) }] as const);
        return { tocs: Object.fromEntries(sorted) };
      },
      skipHydration: typeof window === 'undefined',
      onRehydrateStorage: () => (_state: TocState | undefined, error: unknown) => {
        if (error) {
          console.warn('[WARN toc-store] rehydration failed, clearing', error);
          try { localStorage.removeItem('toc-store'); } catch { /* ignore */ }
        }
      },
    }
  )
);

/** Returns true when a stored TOC is synthetic / low-quality and should be
 *  replaced if a better extraction becomes available. Detects: single-item
 *  tables, all items on page 1, all "Section N" titles, all "Pages N–M"
 *  page-range titles, and all-identical titles. */
export function isTocLowQuality(toc: DocumentToc): boolean {
  const items = toc.items;
  if (items.length <= 1) return true;
  if (items.every((it) => it.pageNumber <= 1)) return true;
  if (items.every((it) => /^section\s+\d+$/i.test(it.title.trim()))) return true;
  if (items.every((it) => /^pages?\s+\d+[–—-]\d+$/i.test(it.title.trim()))) return true;
  const unique = new Set(items.map((it) => it.title.trim().toLowerCase()));
  if (unique.size === 1) return true;
  return false;
}

// Phase 5 One Brain: auto-track active document in TOC store via CLC.
if (typeof window !== 'undefined') {
  useCurrentLearningContext.subscribe((state, prev) => {
    if (state.documentId !== prev.documentId && state.documentId) {
      useTocStore.getState().setActiveToc(state.documentId);
    }
  });
}

export default useTocStore;
