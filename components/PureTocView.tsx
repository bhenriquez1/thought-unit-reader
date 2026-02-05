"use client";

// components/PureTocView.tsx
// PURE TOC MODE - TOC tree ONLY
// ❌ No PDF panel
// ❌ No Surgeon View elements
// ❌ No NoteLab
// ✅ Clickable chapters with "Open in Reader" / "Open in Surgeon View"
// ✅ SSR-safe with defensive guards

import React, { useState, useMemo, useEffect } from 'react';
import { useTocStore, type TocItem, type DocumentToc } from '@/lib/stores/tocStore';

interface PureTocViewProps {
  documentId: string;
  documentName: string;
  currentPage: number;
  pdfPageCount: number;
  onOpenInReader: (pageNumber: number) => void;
  onOpenInSurgeon: (pageNumber: number) => void;
}

export default function PureTocView({
  documentId,
  documentName,
  currentPage,
  pdfPageCount,
  onOpenInReader,
  onOpenInSurgeon
}: PureTocViewProps) {
  // SSR guard - ensure we're on client before accessing store
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Store - with defensive access
  const store = useTocStore();
  const getToc = store?.getToc ?? (() => null);
  const setActiveToc = store?.setActiveToc ?? (() => {});
  const addTocItem = store?.addTocItem ?? (() => {});
  const deleteTocItem = store?.deleteTocItem ?? (() => {});

  // Safely get TOC with try-catch
  let toc: DocumentToc | null = null;
  try {
    toc = isClient && documentId ? getToc(documentId) : null;
  } catch (error) {
    console.error('Error loading TOC:', error);
    toc = null;
  }
  
  // Local state
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newPage, setNewPage] = useState('');
  
  // Initialize - with SSR guard
  useEffect(() => {
    if (isClient && documentId) {
      try {
        setActiveToc(documentId);
      } catch (error) {
        console.error('Error setting active TOC:', error);
      }
    }
  }, [isClient, documentId, setActiveToc]);
  
  // Filter items by search
  const filteredItems = useMemo(() => {
    if (!toc?.items) return [];
    if (!searchQuery.trim()) return toc.items;
    
    const query = searchQuery.toLowerCase();
    return toc.items.filter(item =>
      item.title.toLowerCase().includes(query) ||
      String(item.pageNumber).includes(query)
    );
  }, [toc, searchQuery]);
  
  // Find current chapter based on page
  const currentChapter = useMemo(() => {
    if (!toc?.items?.length) return null;
    
    // Find the chapter that contains the current page
    const sorted = [...toc.items].sort((a, b) => b.pageNumber - a.pageNumber);
    return sorted.find(item => item.pageNumber <= currentPage);
  }, [toc, currentPage]);
  
  // Toggle expand/collapse
  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  
  // Add manual TOC item
  const handleAddItem = () => {
    if (!newTitle.trim() || !newPage.trim()) return;
    
    addTocItem(documentId, {
      title: newTitle.trim(),
      pageNumber: parseInt(newPage, 10),
      level: 0
    });
    
    setNewTitle('');
    setNewPage('');
    setShowAddForm(false);
  };
  
  // Render TOC item
  const renderTocItem = (item: TocItem, depth: number = 0) => {
    const isCurrent = currentChapter?.id === item.id;
    const isExpanded = expandedIds.has(item.id);
    const hasChildren = item.children && item.children.length > 0;
    
    return (
      <div key={item.id} className="select-none">
        <div
          className={`group flex items-center gap-2 px-3 py-2 rounded-lg transition-all cursor-pointer
            ${isCurrent 
              ? 'bg-purple-900/50 border border-purple-500/50' 
              : 'hover:bg-gray-800 border border-transparent'
            }`}
          style={{ paddingLeft: `${12 + depth * 16}px` }}
        >
          {/* Expand/Collapse for items with children */}
          {hasChildren ? (
            <button
              onClick={() => toggleExpand(item.id)}
              className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-white"
            >
              {isExpanded ? '▼' : '▶'}
            </button>
          ) : (
            <span className="w-5 h-5 flex items-center justify-center text-gray-600">•</span>
          )}
          
          {/* Title and Page */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className={`text-sm truncate ${isCurrent ? 'text-white font-medium' : 'text-gray-300'}`}>
                {item.title}
              </span>
              <span className="text-xs text-gray-500 shrink-0">
                p. {item.pageNumber}
              </span>
            </div>
          </div>
          
          {/* Action Buttons - Show on hover */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpenInReader(item.pageNumber);
              }}
              className="px-2 py-1 bg-blue-600 hover:bg-blue-500 rounded text-xs font-medium transition-colors"
              title="Open in Reader"
              data-testid={`toc-open-reader-${item.id}`}
            >
              📖 Reader
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpenInSurgeon(item.pageNumber);
              }}
              className="px-2 py-1 bg-purple-600 hover:bg-purple-500 rounded text-xs font-medium transition-colors"
              title="Open in Surgeon View"
              data-testid={`toc-open-surgeon-${item.id}`}
            >
              🔬 Surgeon
            </button>
          </div>
        </div>
        
        {/* Render children if expanded */}
        {hasChildren && isExpanded && (
          <div className="ml-2">
            {item.children!.map(child => renderTocItem(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };
  
  // Loading state for SSR hydration
  if (!isClient) {
    return (
      <div className="h-full flex flex-col bg-gray-900" data-testid="pure-toc-loading">
        <div className="flex items-center justify-between px-4 py-3 bg-gray-800 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            📑 Table of Contents
          </h2>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-gray-400">Loading...</div>
        </div>
      </div>
    );
  }

  // No TOC available
  if (!toc || !toc.items || toc.items.length === 0) {
    return (
      <div className="h-full flex flex-col bg-gray-900" data-testid="pure-toc-empty">
        <div className="flex items-center justify-between px-4 py-3 bg-gray-800 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            📑 Table of Contents
          </h2>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="text-5xl mb-4">📑</div>
          <h3 className="text-xl font-semibold text-white mb-2">No Table of Contents</h3>
          <p className="text-gray-400 mb-6 max-w-md">
            {documentId
              ? "This document doesn't have a table of contents, or it couldn't be extracted."
              : "Upload a PDF to see its table of contents."
            }
          </p>
          
          {/* Manual TOC Entry */}
          {documentId && (
            <div className="w-full max-w-md">
              {showAddForm ? (
                <div className="p-4 bg-gray-800 rounded-lg border border-gray-700">
                  <h4 className="font-medium mb-3 text-white">Add Chapter Manually</h4>
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="Chapter title"
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm text-white focus:outline-none focus:border-purple-500"
                    />
                    <input
                      type="number"
                      value={newPage}
                      onChange={(e) => setNewPage(e.target.value)}
                      placeholder="Page number"
                      min="1"
                      max={pdfPageCount}
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm text-white focus:outline-none focus:border-purple-500"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleAddItem}
                        className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded text-sm font-medium transition-colors"
                      >
                        Add Chapter
                      </button>
                      <button
                        onClick={() => setShowAddForm(false)}
                        className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowAddForm(true)}
                  className="px-6 py-3 bg-purple-600 hover:bg-purple-500 rounded-lg font-medium transition-colors"
                >
                  + Add Chapter Manually
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }
  
  return (
    <div className="h-full flex flex-col bg-gray-900" data-testid="pure-toc-view">
      {/* Header */}
      <div className="px-4 py-3 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            📑 Table of Contents
          </h2>
          <span className="text-xs text-gray-500 bg-gray-700 px-2 py-1 rounded">
            {toc.items.length} chapters • {toc.generatedFrom}
          </span>
        </div>
        
        {/* Search */}
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search chapters..."
            className="w-full px-4 py-2 pl-9 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">🔍</span>
        </div>
      </div>
      
      {/* Current Location Indicator */}
      {currentChapter && (
        <div className="px-4 py-2 bg-purple-900/30 border-b border-purple-800/30">
          <p className="text-xs text-purple-400">
            📍 Current: <span className="text-white font-medium">{currentChapter.title}</span>
            <span className="text-purple-300 ml-2">p. {currentChapter.pageNumber}</span>
          </p>
        </div>
      )}
      
      {/* TOC List */}
      <div className="flex-1 overflow-auto p-3 space-y-1">
        {filteredItems.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>No chapters match "{searchQuery}"</p>
          </div>
        ) : (
          filteredItems.map(item => renderTocItem(item))
        )}
      </div>
      
      {/* Footer - Add Chapter */}
      <div className="px-4 py-3 border-t border-gray-700 bg-gray-800">
        {showAddForm ? (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Chapter title"
                className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm text-white focus:outline-none focus:border-purple-500"
              />
              <input
                type="number"
                value={newPage}
                onChange={(e) => setNewPage(e.target.value)}
                placeholder="Page"
                min="1"
                max={pdfPageCount}
                className="w-20 px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm text-white focus:outline-none focus:border-purple-500"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleAddItem}
                disabled={!newTitle.trim() || !newPage.trim()}
                className="flex-1 px-3 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 rounded text-sm font-medium transition-colors"
              >
                Add
              </button>
              <button
                onClick={() => setShowAddForm(false)}
                className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowAddForm(true)}
            className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors"
          >
            + Add Chapter Manually
          </button>
        )}
      </div>
    </div>
  );
}
