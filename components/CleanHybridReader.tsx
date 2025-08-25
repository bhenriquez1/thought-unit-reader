"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { ThoughtUnit as BaseThoughtUnit } from "@/types/reading";
import { Document, Page } from "react-pdf";
import { chunkText, stableChunkId } from "@/lib/chunkers";
import { loadUnderstood, markUnderstood } from "@/lib/understoodStore";
import { useReaderSync } from "@/lib/readerSync";
import type { TOCEntry } from "@/lib/tocParser";

type HRUnit = BaseThoughtUnit | string | string[] | { text?: string };

interface CleanHybridReaderProps {
  bookId: string;
  userId: string;
  thoughtUnits: HRUnit[];
  currentThoughtUnit: number;
  
  // PDF Integration - Primary focus
  pdfUrl: string;
  currentPage: number;
  pdfPageCount?: number;
  onPageChange: (page: number) => void;
  
  fontSize: number;
  fontFamily: string;
  lineSpacing: number;
  
  onWordClick: (word: string) => void;
  onTextSelect?: (text: string) => void;
  selBind?: { onMouseUp?: (e: React.MouseEvent) => void };
  
  // TOC Integration for enhanced navigation
  tableOfContents?: TOCEntry[];
  totalPages?: number;
}

function unitToText(u: HRUnit): string {
  if (u == null) return "";
  if (typeof u === "string") return u;
  if (Array.isArray(u)) return u.join(" ");
  const t = (u as any).text;
  return typeof t === "string" ? t : JSON.stringify(u);
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Simple text enhancement utilities
function extractKeyTerms(text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  return words
    .filter(word => 
      word.length > 5 || 
      /^[A-Z]/.test(word) || 
      /\d/.test(word)
    )
    .slice(0, 5);
}

function extractDefinitions(text: string): Array<{term: string, definition: string}> {
  const definitions: Array<{term: string, definition: string}> = [];
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
  
  sentences.forEach(sentence => {
    const definitionPatterns = [
      /(.+?)\s+is\s+(.+)/i,
      /(.+?)\s+means\s+(.+)/i,
      /(.+?)\s+refers to\s+(.+)/i,
      /(.+?)\s+defined as\s+(.+)/i,
    ];
    
    for (const pattern of definitionPatterns) {
      const match = sentence.match(pattern);
      if (match && match[1] && match[2]) {
        definitions.push({
          term: match[1].trim(),
          definition: match[2].trim()
        });
        break;
      }
    }
  });
  
  return definitions.slice(0, 3); // Limit to 3 definitions
}

function createSimpleSummary(text: string): string {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
  if (sentences.length === 0) return text.slice(0, 100) + "...";
  
  // Take first sentence and any sentence with key indicators
  const keySentences = sentences.filter(s => {
    const lower = s.toLowerCase();
    return lower.includes('important') || 
           lower.includes('key') || 
           lower.includes('main') ||
           lower.includes('primary') ||
           lower.includes('significant');
  });
  
  const summary = keySentences.length > 0 ? keySentences[0] : sentences[0];
  return summary.trim();
}

export default function CleanHybridReader({
  bookId,
  userId,
  thoughtUnits,
  currentThoughtUnit,
  pdfUrl,
  currentPage,
  pdfPageCount,
  onPageChange,
  fontSize,
  fontFamily,
  lineSpacing,
  onWordClick,
  onTextSelect,
  selBind,
  tableOfContents = [],
  totalPages,
}: CleanHybridReaderProps) {
  const [pdfScale, setPdfScale] = useState(1.0);
  const [showEnhancements, setShowEnhancements] = useState(true);
  const [highlightedTerm, setHighlightedTerm] = useState<string>("");
  const [understoodMap, setUnderstoodMap] = useState<Record<string, true>>({});
  const [showTOC, setShowTOC] = useState(false);
  const pdfContainerRef = useRef<HTMLDivElement>(null);
  
  // ReaderSync integration for TOC synchronization
  const readerSync = useReaderSync();

  // Initialize ReaderSync with content data
  useEffect(() => {
    if (tableOfContents.length > 0 && totalPages && thoughtUnits.length > 0) {
      readerSync.initializeContent(totalPages, thoughtUnits.length, tableOfContents);
    }
  }, [tableOfContents, totalPages, thoughtUnits.length, readerSync]);

  // Sync current page with ReaderSync
  useEffect(() => {
    if (currentPage !== readerSync.page) {
      readerSync.setPage(currentPage, "hybrid");
    }
  }, [currentPage, readerSync]);

  // Sync current unit with ReaderSync
  useEffect(() => {
    if (currentThoughtUnit !== readerSync.unitIndex) {
      readerSync.setUnitIndex(currentThoughtUnit, "hybrid");
    }
  }, [currentThoughtUnit, readerSync]);

  // Load understood chunks
  useEffect(() => {
    if (!bookId) return;
    loadUnderstood(userId || "guest", bookId)
      .then((m) => setUnderstoodMap(m || {}))
      .catch(() => {});
  }, [userId, bookId]);

  // Empty states
  if (!thoughtUnits?.length) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 italic">
        📂 Please upload a PDF to start Hybrid Reading
      </div>
    );
  }

  const rawUnit = thoughtUnits[currentThoughtUnit - 1];
  if (!rawUnit) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 italic">
        ⏳ Loading content...
      </div>
    );
  }

  const unitText = unitToText(rawUnit);
  
  // Simple text analysis for enhancements
  const keyTerms = useMemo(() => extractKeyTerms(unitText), [unitText]);
  const definitions = useMemo(() => extractDefinitions(unitText), [unitText]);
  const summary = useMemo(() => createSimpleSummary(unitText), [unitText]);
  
  // Simple chunking for context
  const chunks = useMemo(
    () => chunkText(unitText, { mode: "semantic", targetChars: 180 }),
    [unitText]
  );

  // Simple PDF highlighting
  useEffect(() => {
    if (!pdfContainerRef.current || !highlightedTerm || !showEnhancements) return;
    
    // Remove existing highlights
    const existingHighlights = pdfContainerRef.current.querySelectorAll('.pdf-highlight');
    existingHighlights.forEach(el => el.remove());
    
    // Add new highlights
    const walker = document.createTreeWalker(
      pdfContainerRef.current,
      NodeFilter.SHOW_TEXT,
      null
    );

    const textNodes: Text[] = [];
    let node;
    while (node = walker.nextNode()) {
      textNodes.push(node as Text);
    }

    textNodes.forEach(textNode => {
      const text = textNode.textContent || '';
      const regex = new RegExp(`\\b${escapeRegExp(highlightedTerm)}\\b`, 'gi');
      const matches = [...text.matchAll(regex)];

      matches.forEach(match => {
        if (match.index !== undefined) {
          try {
            const range = document.createRange();
            range.setStart(textNode, match.index);
            range.setEnd(textNode, match.index + match[0].length);

            const rect = range.getBoundingClientRect();
            const containerRect = pdfContainerRef.current!.getBoundingClientRect();

            if (rect.width > 0 && rect.height > 0) {
              const highlight = document.createElement('div');
              highlight.className = 'pdf-highlight';
              highlight.style.cssText = `
                position: absolute;
                left: ${rect.left - containerRect.left + pdfContainerRef.current!.scrollLeft}px;
                top: ${rect.top - containerRect.top + pdfContainerRef.current!.scrollTop}px;
                width: ${rect.width}px;
                height: ${rect.height}px;
                background-color: rgba(255, 235, 59, 0.3);
                pointer-events: none;
                z-index: 10;
                border-radius: 2px;
              `;

              pdfContainerRef.current!.appendChild(highlight);
            }
          } catch (e) {
            // Ignore range errors
          }
        }
      });
    });
  }, [highlightedTerm, showEnhancements]);

  const handleMouseUp = () => {
    const selection = window.getSelection()?.toString().trim() || "";
    if (selection) {
      onTextSelect?.(selection);
      setHighlightedTerm(selection);
    }
  };

  // Enhanced chapter detection using ReaderSync
  const currentChapter = readerSync.findNearestChapter(currentPage);
  const currentTOCEntry = tableOfContents.find(toc => toc.pageNumber <= currentPage);

  // Navigation handlers
  const handlePreviousPage = () => {
    const newPage = Math.max(1, currentPage - 1);
    onPageChange(newPage);
    readerSync.setPage(newPage, "hybrid");
  };

  const handleNextPage = () => {
    const newPage = Math.min(pdfPageCount || 999, currentPage + 1);
    onPageChange(newPage);
    readerSync.setPage(newPage, "hybrid");
  };

  const handleChapterJump = (tocEntry: TOCEntry) => {
    onPageChange(tocEntry.pageNumber);
    readerSync.setPage(tocEntry.pageNumber, "toc");
    setShowTOC(false);
  };

  const handlePreviousChapter = () => {
    const currentChapterIndex = tableOfContents.findIndex(toc => toc.pageNumber <= currentPage);
    if (currentChapterIndex > 0) {
      const prevChapter = tableOfContents[currentChapterIndex - 1];
      handleChapterJump(prevChapter);
    }
  };

  const handleNextChapter = () => {
    const currentChapterIndex = tableOfContents.findIndex(toc => toc.pageNumber <= currentPage);
    if (currentChapterIndex >= 0 && currentChapterIndex < tableOfContents.length - 1) {
      const nextChapter = tableOfContents[currentChapterIndex + 1];
      handleChapterJump(nextChapter);
    }
  };

  return (
    <div className="h-full flex bg-gray-900">
      {/* PDF View - Left Side (60%) */}
      <div className="w-3/5 bg-gray-800 border-r border-gray-700 flex flex-col">
        {/* Enhanced PDF Controls with TOC Navigation */}
        <div className="flex items-center justify-between p-3 bg-gray-700 border-b border-gray-600">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold text-blue-400">📄 Hybrid Reader</h4>
            {currentTOCEntry && (
              <span className="text-xs bg-blue-500/20 px-2 py-1 rounded text-blue-300">
                {currentTOCEntry.title}
              </span>
            )}
            {currentChapter && (
              <span className="text-xs bg-green-500/20 px-2 py-1 rounded text-green-300">
                Unit {currentChapter.unitStart}-{currentChapter.unitEnd}
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {/* Chapter Navigation */}
            <button
              onClick={handlePreviousChapter}
              disabled={!tableOfContents.length || tableOfContents.findIndex(toc => toc.pageNumber <= currentPage) <= 0}
              className="text-xs px-2 py-1 bg-purple-600 rounded hover:bg-purple-500 disabled:opacity-50"
              title="Previous Chapter"
            >
              ⏮
            </button>
            
            {/* Page Navigation */}
            <button
              onClick={handlePreviousPage}
              disabled={currentPage <= 1}
              className="text-xs px-3 py-1 bg-gray-600 rounded hover:bg-gray-500 disabled:opacity-50"
            >
              ← Prev
            </button>
            <span className="text-xs bg-gray-600 px-2 py-1 rounded font-mono">
              {currentPage} / {pdfPageCount || '?'}
            </span>
            <button
              onClick={handleNextPage}
              disabled={currentPage >= (pdfPageCount || 999)}
              className="text-xs px-3 py-1 bg-gray-600 rounded hover:bg-gray-500 disabled:opacity-50"
            >
              Next →
            </button>
            
            <button
              onClick={handleNextChapter}
              disabled={!tableOfContents.length || tableOfContents.findIndex(toc => toc.pageNumber <= currentPage) >= tableOfContents.length - 1}
              className="text-xs px-2 py-1 bg-purple-600 rounded hover:bg-purple-500 disabled:opacity-50"
              title="Next Chapter"
            >
              ⏭
            </button>
            
            <div className="w-px h-4 bg-gray-600 mx-2" />
            
            {/* TOC Toggle */}
            <button
              onClick={() => setShowTOC(!showTOC)}
              className={`text-xs px-3 py-1 rounded ${
                showTOC 
                  ? "bg-purple-600 text-white" 
                  : "bg-gray-600 hover:bg-gray-500"
              }`}
              disabled={!tableOfContents.length}
            >
              📑 TOC
            </button>
            
            <div className="w-px h-4 bg-gray-600 mx-2" />
            
            {/* Zoom Controls */}
            <button
              onClick={() => setPdfScale(s => Math.max(0.5, s - 0.1))}
              className="text-xs px-2 py-1 bg-gray-600 rounded hover:bg-gray-500"
            >
              -
            </button>
            <span className="text-xs bg-gray-600 px-2 py-1 rounded font-mono min-w-[3rem] text-center">
              {Math.round(pdfScale * 100)}%
            </span>
            <button
              onClick={() => setPdfScale(s => Math.min(2.0, s + 0.1))}
              className="text-xs px-2 py-1 bg-gray-600 rounded hover:bg-gray-500"
            >
              +
            </button>
            
            <button
              onClick={() => setShowEnhancements(!showEnhancements)}
              className={`text-xs px-3 py-1 rounded ${
                showEnhancements 
                  ? "bg-yellow-600 text-white" 
                  : "bg-gray-600 hover:bg-gray-500"
              }`}
            >
              {showEnhancements ? "Hide" : "Show"} Highlights
            </button>
          </div>
        </div>

        {/* PDF Viewer with TOC Overlay */}
        <div 
          ref={pdfContainerRef}
          className="flex-1 overflow-auto relative bg-white"
          onMouseUp={selBind?.onMouseUp ?? handleMouseUp}
        >
          <Document file={pdfUrl}>
            <Page 
              pageNumber={currentPage} 
              scale={pdfScale}
              renderTextLayer={true}
              renderAnnotationLayer={true}
            />
          </Document>
          
          {/* TOC Overlay */}
          {showTOC && tableOfContents.length > 0 && (
            <div className="absolute top-4 left-4 w-80 max-h-96 bg-gray-800/95 backdrop-blur-sm rounded-lg border border-gray-600 shadow-xl z-20">
              <div className="flex items-center justify-between p-3 border-b border-gray-600">
                <h5 className="text-sm font-semibold text-purple-300">📑 Table of Contents</h5>
                <button
                  onClick={() => setShowTOC(false)}
                  className="text-gray-400 hover:text-white text-lg leading-none"
                >
                  ×
                </button>
              </div>
              <div className="max-h-80 overflow-y-auto p-2">
                {tableOfContents.map((entry, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleChapterJump(entry)}
                    className={`w-full text-left p-2 rounded text-sm transition-colors ${
                      entry.pageNumber === currentPage || 
                      (entry.pageNumber <= currentPage && 
                       (idx === tableOfContents.length - 1 || tableOfContents[idx + 1].pageNumber > currentPage))
                        ? "bg-purple-600/30 text-purple-200 border border-purple-500/50"
                        : "text-gray-300 hover:bg-gray-700/50"
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="truncate pr-2">{entry.title}</span>
                      <span className="text-xs text-gray-400 flex-shrink-0">
                        p.{entry.pageNumber}
                      </span>
                    </div>
                    {entry.subChapters && entry.subChapters.length > 0 && (
                      <div className="ml-3 mt-1 space-y-1">
                        {entry.subChapters.slice(0, 3).map((sub, subIdx) => (
                          <button
                            key={subIdx}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleChapterJump(sub);
                            }}
                            className="block w-full text-left text-xs text-gray-400 hover:text-gray-200 truncate"
                          >
                            • {sub.title} (p.{sub.pageNumber})
                          </button>
                        ))}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Enhancement Panel - Right Side (40%) */}
      <div className="w-2/5 bg-gray-800 flex flex-col">
        {/* Enhancement Header */}
        <div className="flex items-center justify-between p-3 bg-gray-700 border-b border-gray-600">
          <h4 className="text-sm font-semibold text-green-400">✨ Smart Enhancements</h4>
          <div className="text-xs text-gray-400">
            Page {currentPage} Context
          </div>
        </div>

        {/* Enhancement Content */}
        <div 
          className="flex-1 overflow-y-auto p-4 space-y-4"
          style={{ fontSize: `${fontSize}px`, fontFamily, lineHeight: lineSpacing }}
        >
          {/* Page Summary */}
          {summary && (
            <div className="p-3 bg-gray-700/50 rounded-lg border border-gray-600">
              <h5 className="text-sm font-medium text-green-300 mb-2">📝 Page Summary</h5>
              <p className="text-sm text-gray-200 leading-relaxed">{summary}</p>
            </div>
          )}

          {/* Key Terms */}
          {keyTerms.length > 0 && (
            <div className="p-3 bg-gray-700/50 rounded-lg border border-gray-600">
              <h5 className="text-sm font-medium text-blue-300 mb-2">🔑 Key Terms</h5>
              <div className="flex flex-wrap gap-2">
                {keyTerms.map((term, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setHighlightedTerm(term);
                      onWordClick(term);
                    }}
                    className={`px-2 py-1 rounded text-xs transition-colors ${
                      highlightedTerm === term
                        ? "bg-yellow-500 text-black"
                        : "bg-blue-500/20 text-blue-200 hover:bg-blue-500/30"
                    }`}
                  >
                    {term}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Definitions */}
          {definitions.length > 0 && (
            <div className="p-3 bg-gray-700/50 rounded-lg border border-gray-600">
              <h5 className="text-sm font-medium text-purple-300 mb-2">📚 Definitions</h5>
              <div className="space-y-2">
                {definitions.map((def, idx) => (
                  <div key={idx} className="border-l-2 border-purple-400/30 pl-3">
                    <div className="text-sm font-medium text-purple-200">{def.term}</div>
                    <div className="text-xs text-gray-300 mt-1">{def.definition}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Context Chunks */}
          <div className="p-3 bg-gray-700/50 rounded-lg border border-gray-600">
            <h5 className="text-sm font-medium text-orange-300 mb-2">📖 Text Context</h5>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {chunks.map((chunk, idx) => {
                const chunkId = stableChunkId(chunk);
                const isUnderstood = !!understoodMap[chunkId];
                
                return (
                  <div
                    key={idx}
                    className={`p-2 rounded text-xs cursor-pointer transition-colors ${
                      isUnderstood
                        ? "bg-green-500/20 text-green-200 border border-green-500/30"
                        : "bg-gray-600/50 text-gray-300 hover:bg-gray-600/70"
                    }`}
                    onClick={() => {
                      onWordClick(chunk);
                      setHighlightedTerm(chunk.split(' ')[0]); // Highlight first word
                      
                      // Toggle understood
                      const newUnderstoodMap = { ...understoodMap };
                      if (newUnderstoodMap[chunkId]) {
                        delete newUnderstoodMap[chunkId];
                      } else {
                        newUnderstoodMap[chunkId] = true;
                      }
                      setUnderstoodMap(newUnderstoodMap);
                      markUnderstood(userId || "guest", bookId, chunkId).catch(() => {});
                    }}
                  >
                    {chunk}
                    {isUnderstood && <span className="ml-2 text-green-400">✓</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="p-3 bg-gray-700/50 rounded-lg border border-gray-600">
            <h5 className="text-sm font-medium text-yellow-300 mb-2">⚡ Quick Actions</h5>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setHighlightedTerm("")}
                className="px-3 py-2 bg-gray-600 hover:bg-gray-500 rounded text-xs text-white"
              >
                Clear Highlights
              </button>
              <button
                onClick={() => {
                  const allTerms = keyTerms.join(" ");
                  onTextSelect?.(allTerms);
                }}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded text-xs text-white"
              >
                Select Key Terms
              </button>
              <button
                onClick={() => onTextSelect?.(summary)}
                className="px-3 py-2 bg-green-600 hover:bg-green-500 rounded text-xs text-white"
              >
                Copy Summary
              </button>
              <button
                onClick={() => {
                  const defText = definitions.map(d => `${d.term}: ${d.definition}`).join('\n');
                  onTextSelect?.(defText);
                }}
                className="px-3 py-2 bg-purple-600 hover:bg-purple-500 rounded text-xs text-white"
                disabled={definitions.length === 0}
              >
                Copy Definitions
              </button>
            </div>
          </div>

          {/* Enhanced Reading Progress with Chapter Info */}
          <div className="p-3 bg-gray-700/50 rounded-lg border border-gray-600">
            <h5 className="text-sm font-medium text-gray-300 mb-2">📊 Reading Progress</h5>
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-gray-400">
                <span>Page Progress</span>
                <span>{currentPage} / {pdfPageCount || '?'}</span>
              </div>
              <div className="w-full bg-gray-600 rounded-full h-2">
                <div 
                  className="bg-blue-400 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${((currentPage / (pdfPageCount || 1)) * 100)}%` }}
                />
              </div>
              
              {currentChapter && (
                <>
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>Chapter Progress</span>
                    <span>{currentChapter.title}</span>
                  </div>
                  <div className="w-full bg-gray-600 rounded-full h-2">
                    <div 
                      className="bg-purple-400 h-2 rounded-full transition-all duration-300"
                      style={{ 
                        width: `${currentChapter.unitEnd > currentChapter.unitStart 
                          ? ((currentThoughtUnit - currentChapter.unitStart) / (currentChapter.unitEnd - currentChapter.unitStart)) * 100 
                          : 0}%` 
                      }}
                    />
                  </div>
                </>
              )}
              
              <div className="flex justify-between text-xs text-gray-400">
                <span>Chunks Understood</span>
                <span>{Object.keys(understoodMap).length} / {chunks.length}</span>
              </div>
              <div className="w-full bg-gray-600 rounded-full h-2">
                <div 
                  className="bg-green-400 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${chunks.length > 0 ? (Object.keys(understoodMap).length / chunks.length) * 100 : 0}%` }}
                />
              </div>
              
              {/* Sync Status */}
              <div className="flex justify-between text-xs text-gray-500 pt-1 border-t border-gray-600">
                <span>Sync Status</span>
                <span className="text-green-400">
                  {readerSync.lastUpdateSource === "hybrid" ? "✓ Synced" : "⚡ Auto-sync"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
