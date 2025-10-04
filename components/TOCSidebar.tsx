// components/TOCSidebar.tsx
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
  confidence?: number; // Enhanced TOC confidence score

  // Keep index signature as requested
  [key: string]: unknown;
};

interface Props {
  /** Accept anything (TOCEntry[], outline[], mixed) without type errors */
  toc: unknown[];
  currentPage: number;
  onJumpToPage: (page: number) => void;
  /** Control visibility from parent */
  isVisible?: boolean;
  onToggleVisibility?: () => void;
  /** User ID for localStorage persistence */
  userId?: string;
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

export default function TOCSidebar({ 
  toc, 
  currentPage, 
  onJumpToPage, 
  isVisible = true,
  onToggleVisibility,
  userId = "guest"
}: Props) {
  const [q, setQ] = useState("");
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const { syncToChapter } = useReaderSync();

  // Load collapse state from localStorage
  useEffect(() => {
    try {
      const storageKey = `toc-collapsed-${userId}`;
      const saved = localStorage.getItem(storageKey);
      if (saved !== null) {
        setIsCollapsed(JSON.parse(saved));
      }
    } catch (error) {
      console.warn('Failed to load TOC collapse state:', error);
    }
  }, [userId]);

  // Save collapse state to localStorage
  const toggleCollapsed = () => {
    const newCollapsed = !isCollapsed;
    setIsCollapsed(newCollapsed);
    
    try {
      const storageKey = `toc-collapsed-${userId}`;
      localStorage.setItem(storageKey, JSON.stringify(newCollapsed));
    } catch (error) {
      console.warn('Failed to save TOC collapse state:', error);
    }
  };

  // Auto-collapse on mobile
  useEffect(() => {
    const checkMobile = () => {
      if (window.innerWidth < 768 && !isCollapsed) {
        setIsCollapsed(true);
      }
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [isCollapsed]);

  const flat = useMemo(() => {
    const normalized = normalizeTOC(toc || []);
    console.log('🧭 TOC Debug:', {
      originalToc: toc,
      normalizedFlat: normalized,
      tocLength: toc?.length || 0,
      flatLength: normalized.length
    });
    return normalized;
  }, [toc]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return flat;
    return flat.filter((e) => e.title.toLowerCase().includes(term));
  }, [q, flat]);

  // Fix navigation logic - Remove problematic sync store integration
  const handleJumpToPage = React.useCallback((page: number, title: string) => {
    console.log(`🧭 TOC Navigation: Jumping to page ${page} for "${title}"`);
    
    try {
      // Call the parent callback directly - this should trigger the PDF page change
      if (typeof onJumpToPage === 'function') {
        console.log(`🧭 TOC Navigation: Calling onJumpToPage(${page})`);
        onJumpToPage(page);
        
        // Auto-collapse on mobile after navigation
        if (window.innerWidth < 768) {
          setIsCollapsed(true);
        }
        
        // Optional: Try sync integration without breaking navigation
        try {
          syncToChapter(title);
          console.log(`🧭 Successfully synced to chapter: ${title}`);
        } catch (error) {
          console.warn(`🧭 TOC sync failed (non-critical):`, error);
        }
      } else {
        console.error('🧭 TOC Navigation: onJumpToPage callback not provided!');
      }
      
    } catch (error) {
      console.error(`🧭 TOC Navigation error:`, error);
    }
  }, [onJumpToPage, syncToChapter]);

  const shouldExpand = isHovering && isCollapsed;
  const effectiveWidth = isCollapsed && !shouldExpand ? 80 : 320;

  return (
    <motion.div 
      className="sticky top-0 left-0 h-screen bg-gray-900/95 backdrop-blur-md text-white flex flex-col shadow-2xl border-r border-gray-700 z-30"
      animate={{ width: effectiveWidth }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      {/* Collapsed State - Icon Only */}
      {isCollapsed && !shouldExpand && (
        <div className="p-4 flex flex-col items-center h-full">
          <button
            onClick={toggleCollapsed}
            className="mb-4 p-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors"
            title="Expand Table of Contents"
          >
            <span className="text-lg">📑</span>
          </button>
          
          {/* Vertical progress indicator */}
          <div className="flex-1 w-2 bg-gray-800 rounded-full relative">
            <motion.div
              className="absolute top-0 left-0 w-full bg-yellow-500 rounded-full"
              animate={{ 
                height: flat.length > 0 ? `${Math.min(100, (currentPage / Math.max(...flat.map(f => f.page || 1))) * 100)}%` : "0%" 
              }}
              transition={{ duration: 0.3 }}
            />
          </div>
          
          <div className="mt-4 text-xs text-center text-gray-400">
            p.{currentPage}
          </div>
        </div>
      )}

      {/* Expanded State - Full TOC */}
      {(!isCollapsed || shouldExpand) && (
        <div className="p-4 flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold">📑 Table of Contents</h3>
            <div className="flex items-center gap-2">
              {flat.length > 0 && (
                <div className="text-xs bg-green-500/20 px-2 py-1 rounded text-green-300">
                  {flat.length} entries
                </div>
              )}
              <button
                onClick={toggleCollapsed}
                className="p-1 rounded bg-gray-800 hover:bg-gray-700 transition-colors"
                title="Collapse Table of Contents"
              >
                <span className="text-sm">◀</span>
              </button>
            </div>
          </div>

          {/* Search */}
          <input
            type="text"
            placeholder="Search headings..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full p-3 mb-4 rounded-lg bg-gray-800/80 text-sm outline-none border border-gray-700 focus:border-yellow-500 transition-colors"
          />

          {/* Content */}
          {filtered.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <p className="text-sm text-gray-400 mb-2">
                  {flat.length === 0 ? "No table of contents available" : "No matching headings found"}
                </p>
                {flat.length === 0 && (
                  <p className="text-xs text-gray-500">
                    The PDF may not have embedded bookmarks. Try uploading a different PDF or use page navigation.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              <motion.ul 
                className="space-y-1"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1 }}
              >
                {filtered.map((entry, idx) => {
                  const page = entry.page;
                  const active = typeof page === "number" && page === currentPage;
                  const confidence = (entry as any).confidence || 0.7;

                  return (
                    <motion.li 
                      key={`${entry.title}-${idx}`}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.02 }}
                    >
                      <button
                        onClick={() => {
                          if (page) {
                            handleJumpToPage(page, entry.title);
                          }
                        }}
                        disabled={typeof page !== "number"}
                        className={`
                          w-full text-left cursor-pointer px-3 py-2 rounded-lg text-sm transition-all duration-200
                          hover:bg-gray-700/80 disabled:opacity-50 disabled:cursor-not-allowed
                          ${active ? "bg-yellow-500/20 border-l-4 border-yellow-500 text-yellow-300 font-medium" : "hover:translate-x-1"}
                          ${confidence < 0.5 ? "opacity-75" : ""}
                        `}
                        style={{ paddingLeft: `${entry.level * 12 + 12}px` }}
                        title={typeof page === "number" ? `Go to page ${page}` : "Location unavailable"}
                      >
                        <div className="flex justify-between items-center">
                          <span className="truncate flex-1 leading-relaxed">{entry.title}</span>
                          <div className="flex items-center gap-2">
                            {confidence < 0.6 && (
                              <span className="text-xs opacity-50" title="Low confidence heading">
                                ?
                              </span>
                            )}
                            {typeof page === "number" && (
                              <span className="opacity-60 text-xs shrink-0 bg-gray-800/50 px-2 py-0.5 rounded">
                                p.{page}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    </motion.li>
                  );
                })}
              </motion.ul>
            </div>
          )}

          {/* Footer */}
          <div className="mt-4 pt-3 border-t border-gray-700">
            <div className="flex justify-between items-center text-xs text-gray-400">
              <span>{filtered.length} of {flat.length} headings</span>
              {flat.length > 0 && (
                <span>Page {currentPage}</span>
              )}
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
