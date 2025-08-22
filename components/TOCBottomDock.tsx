// components/TOCBottomDock.tsx
"use client";

import React, { useMemo, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useReaderSync } from "@/lib/readerSync";

/** Flexible item shape: works with tocParser + SmartPDFViewer onOutline */
type TocLike = {
  // Titles
  title?: string;
  text?: string;

  // Page fields (various sources)
  pageNumber?: number; // preferred, 1-based
  page?: number;
  pageIndex?: number;  // sometimes 0-based
  pageNum?: number;

  // Nesting (PDF outline / legacy tocParser)
  items?: TocLike[];
  subChapters?: TocLike[];

  // Optional level hints (for flat lists)
  level?: number;
  depth?: number;

  // Keep index signature as requested
  [key: string]: unknown;
};

interface TOCBottomDockProps {
  /** Accept anything (TOCEntry[], outline[], mixed) without type errors */
  toc: unknown[];
  currentPage: number;
  onJumpToPage: (page: number) => void;
  /** Control dock height - can be toggled between sizes */
  height?: number;
  onHeightChange?: (height: number) => void;
}

/* -------------------- helpers -------------------- */

function asTocLikeArray(arr: unknown[]): TocLike[] {
  return (Array.isArray(arr) ? arr : []).map((x) => x as TocLike);
}

function getTitleAny(e: TocLike): string {
  return (e.title ?? e.text ?? "").toString() || "Untitled";
}

function getPageAny(e: TocLike): number | undefined {
  // Prefer explicit 1-based numbers
  const preferred =
    e.pageNumber ??
    (typeof e.page === "number" ? e.page : undefined) ??
    (typeof e.pageNum === "number" ? e.pageNum : undefined);

  if (typeof preferred === "number" && Number.isFinite(preferred)) {
    const p = Math.floor(preferred);
    return p >= 1 ? p : 1;
  }

  // Fallback: 0-based pageIndex
  if (typeof e.pageIndex === "number" && Number.isFinite(e.pageIndex)) {
    return Math.max(1, Math.floor(e.pageIndex) + 1);
  }

  return undefined;
}

/** Flatten either a tree (outline) or a flat list with level hints */
function normalizeTOC(inputUnknown: unknown[]): { title: string; page?: number; level: number }[] {
  const input = asTocLikeArray(inputUnknown);
  const out: { title: string; page?: number; level: number }[] = [];

  const hasTree = input.some(
    (n) =>
      (Array.isArray(n.items) && n.items.length > 0) ||
      (Array.isArray(n.subChapters) && n.subChapters.length > 0)
  );

  if (hasTree) {
    const walk = (nodes: TocLike[], level: number) => {
      for (const node of nodes) {
        out.push({
          title: getTitleAny(node),
          page: getPageAny(node),
          level,
        });
        const children = (node.items ?? node.subChapters) ?? [];
        if (children.length > 0) walk(children as TocLike[], level + 1);
      }
    };
    walk(input, 0);
  } else {
    // Flat list with optional level/depth hints
    for (const node of input) {
      const hinted = Number(node.level ?? node.depth ?? 0);
      out.push({
        title: getTitleAny(node),
        page: getPageAny(node),
        level: Number.isFinite(hinted) ? hinted : 0,
      });
    }
  }

  return out;
}

/* -------------------- component -------------------- */

export default function TOCBottomDock({ 
  toc, 
  currentPage, 
  onJumpToPage,
  height = 220,
  onHeightChange
}: TOCBottomDockProps) {
  const [q, setQ] = useState("");
  const [isExpanded, setIsExpanded] = useState(true);
  const [showMode, setShowMode] = useState<"contextual" | "full">("contextual");
  const { findNearestChapter, syncToChapter } = useReaderSync();

  // Auto-hide on small screens when left TOC is visible
  const [shouldAutoHide, setShouldAutoHide] = useState(false);
  
  useEffect(() => {
    const checkScreenSize = () => {
      setShouldAutoHide(window.innerWidth < 1024); // Hide on screens smaller than lg
    };
    
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  const flat = useMemo(() => {
    const normalized = normalizeTOC(toc || []);
    console.log('🧭 Bottom TOC Debug:', {
      originalToc: toc,
      normalizedFlat: normalized,
      tocLength: toc?.length || 0,
      flatLength: normalized.length
    });
    return normalized;
  }, [toc]);

  // Find current chapter and nearby entries for contextual mode
  const contextualEntries = useMemo(() => {
    if (showMode === "full") return flat;
    
    const currentChapter = findNearestChapter(currentPage);
    if (!currentChapter) return flat.slice(0, 6); // Show first 6 if no chapter found
    
    // Find current chapter in flat list
    const currentIndex = flat.findIndex(entry => 
      entry.title.toLowerCase().includes(currentChapter.title.toLowerCase()) ||
      currentChapter.title.toLowerCase().includes(entry.title.toLowerCase())
    );
    
    if (currentIndex === -1) return flat.slice(0, 6);
    
    // Show current chapter + 2 before + 3 after (contextual window)
    const start = Math.max(0, currentIndex - 2);
    const end = Math.min(flat.length, currentIndex + 4);
    
    return flat.slice(start, end);
  }, [flat, currentPage, findNearestChapter, showMode]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const sourceEntries = showMode === "contextual" ? contextualEntries : flat;
    if (!term) return sourceEntries;
    return sourceEntries.filter((e) => e.title.toLowerCase().includes(term));
  }, [q, contextualEntries, flat, showMode]);

  // Enhanced navigation with sync integration
  const handleJumpToPage = (page: number, title: string) => {
    console.log(`🧭 Bottom TOC Navigation: Jumping to page ${page} for "${title}"`);
    onJumpToPage(page);
    syncToChapter(title);
  };

  const toggleHeight = () => {
    const newHeight = height === 160 ? 280 : 160;
    onHeightChange?.(newHeight);
  };

  return (
    <motion.div 
      className="fixed bottom-0 left-0 right-0 bg-gray-900/95 backdrop-blur-md text-white shadow-2xl border-t border-gray-700 z-40"
      style={{ height: `${height}px` }}
      initial={{ y: height }}
      animate={{ y: isExpanded ? 0 : height - 40 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
    >
      {/* Header with controls */}
      <div className="flex items-center justify-between p-3 border-b border-gray-700 bg-gray-800/50">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-gray-400 hover:text-white transition-colors p-1 rounded"
            title={isExpanded ? "Minimize TOC" : "Expand TOC"}
          >
            {isExpanded ? "⬇️" : "⬆️"}
          </button>
          <h3 className="text-sm font-bold">📑 Table of Contents</h3>
          <div className="text-xs bg-blue-500/20 px-2 py-1 rounded text-blue-300">
            Always Visible
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onHeightChange && (
            <button
              onClick={toggleHeight}
              className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded transition-colors"
              title={`Switch to ${height === 160 ? '280px' : '160px'} height`}
            >
              📌 {height}px
            </button>
          )}
          <span className="text-xs opacity-75">
            Page {currentPage}
          </span>
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            className="flex flex-col h-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* Search */}
            <div className="p-3 border-b border-gray-700">
              <input
                type="text"
                placeholder="Search headings..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="w-full p-2 rounded-lg bg-gray-800/80 text-sm outline-none border border-gray-700 focus:border-yellow-500 transition-colors"
              />
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-3">
              {filtered.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-sm text-gray-400 text-center">
                    {flat.length === 0 ? "No table of contents available" : "No matching headings found"}
                  </p>
                </div>
              ) : (
                <motion.div 
                  className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.1 }}
                >
                  {filtered.map((entry, idx) => {
                    const page = entry.page;
                    const active = typeof page === "number" && page === currentPage;

                    return (
                      <motion.button
                        key={`${entry.title}-${idx}`}
                        onClick={() => {
                          if (page) {
                            console.log(`🧭 Bottom TOC Navigation: Jumping to page ${page} for "${entry.title}"`);
                            onJumpToPage(page);
                          }
                        }}
                        disabled={typeof page !== "number"}
                        className={`
                          text-left cursor-pointer px-3 py-2 rounded-lg text-sm transition-all duration-200
                          hover:bg-gray-700/80 disabled:opacity-50 disabled:cursor-not-allowed
                          ${active ? "bg-yellow-500/20 border border-yellow-500 text-yellow-300 font-medium" : "hover:translate-y-[-1px] hover:shadow-md"}
                        `}
                        style={{ paddingLeft: `${entry.level * 8 + 12}px` }}
                        title={typeof page === "number" ? `Go to page ${page}` : "Location unavailable"}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.01 }}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <div className="flex justify-between items-center">
                          <span className="truncate flex-1 leading-relaxed">{entry.title}</span>
                          {typeof page === "number" && (
                            <span className="opacity-60 text-xs ml-2 shrink-0 bg-gray-800/50 px-2 py-0.5 rounded">
                              p.{page}
                            </span>
                          )}
                        </div>
                      </motion.button>
                    );
                  })}
                </motion.div>
              )}
            </div>

            {/* Footer */}
            <div className="p-2 border-t border-gray-700 bg-gray-800/30">
              <p className="text-xs text-gray-400 text-center">
                {filtered.length} of {flat.length} headings • Click to navigate
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
