// lib/stores/tocStore.ts
// TOC Store - Persists Table of Contents per document
// Auto-generates TOC on PDF upload via outline or heuristic parsing

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

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
  generateFromHeuristic: (documentId: string, documentName: string, pages: string[]) => TocItem[];
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

// Heuristic TOC extraction from page text
function extractTocFromPages(pages: string[]): TocItem[] {
  const items: TocItem[] = [];
  
  // Common TOC patterns
  const patterns = [
    // "Chapter 1: Title .............. 15"
    /^(Chapter|Section|Part|Unit)\s*(\d+)[:\.\s]+(.+?)\s*\.{2,}\s*(\d+)/i,
    // "1. Title ........... 15"
    /^(\d+)[\.)\s]+(.+?)\s*\.{2,}\s*(\d+)/,
    // "Title ... 15" (simpler)
    /^([A-Z][^\.]+?)\s*\.{2,}\s*(\d+)$/,
    // "INTRODUCTION 1"
    /^([A-Z][A-Z\s]+)\s+(\d+)$/,
  ];
  
  // Only scan first 30 pages for TOC
  const scanPages = pages.slice(0, 30);
  
  scanPages.forEach((pageText, pageIdx) => {
    const lines = pageText.split('\n').filter(l => l.trim());
    
    lines.forEach(line => {
      const trimmed = line.trim();
      
      for (const pattern of patterns) {
        const match = trimmed.match(pattern);
        if (match) {
          let title: string;
          let pageNumber: number;
          
          if (match.length === 5) {
            // Chapter pattern
            title = `${match[1]} ${match[2]}: ${match[3].trim()}`;
            pageNumber = parseInt(match[4], 10);
          } else if (match.length === 4) {
            // Numbered pattern
            title = `${match[1]}. ${match[2].trim()}`;
            pageNumber = parseInt(match[3], 10);
          } else if (match.length === 3) {
            // Simple pattern
            title = match[1].trim();
            pageNumber = parseInt(match[2], 10);
          } else {
            continue;
          }
          
          // Validate page number
          if (pageNumber > 0 && pageNumber < 9999 && title.length > 2) {
            // Check for duplicates
            if (!items.find(i => i.title === title && i.pageNumber === pageNumber)) {
              items.push({
                id: generateId(),
                title,
                pageNumber,
                level: title.toLowerCase().includes('chapter') ? 0 : 1
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
      generateFromHeuristic: (documentId: string, documentName: string, pages: string[]) => {
        const items = extractTocFromPages(pages);
        
        if (items.length > 0) {
          get().saveToc(documentId, documentName, items, 'heuristic');
        }
        
        return items;
      }
    }),
    {
      name: 'toc-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        tocs: state.tocs
      })
    }
  )
);

export default useTocStore;
