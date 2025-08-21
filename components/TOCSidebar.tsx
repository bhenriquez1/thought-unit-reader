// components/TOCSidebar.tsx
import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

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

interface Props {
  /** Accept anything (TOCEntry[], outline[], mixed) without type errors */
  toc: unknown[];
  currentPage: number;
  onJumpToPage: (page: number) => void;
  /** Control visibility from parent */
  isVisible?: boolean;
  onToggleVisibility?: () => void;
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
  isVisible = false, 
  onToggleVisibility 
}: Props) {
  const [q, setQ] = useState("");
  const [internalVisible, setInternalVisible] = useState(false);

  const flat = useMemo(() => normalizeTOC(toc || []), [toc]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return flat;
    return flat.filter((e) => e.title.toLowerCase().includes(term));
  }, [q, flat]);

  const visible = isVisible !== undefined ? isVisible : internalVisible;
  const toggleVisibility = onToggleVisibility || (() => setInternalVisible(!internalVisible));

  return (
    <>
      {/* Floating Toggle Button */}
      <motion.button
        onClick={toggleVisibility}
        className="fixed top-20 left-4 z-[60] bg-gray-900/95 hover:bg-gray-800 text-white p-3 rounded-full shadow-xl backdrop-blur-sm border border-gray-600 hover:border-yellow-400 transition-all"
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        title="Toggle Table of Contents"
        style={{ 
          boxShadow: '0 4px 20px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.1)' 
        }}
      >
        <motion.div
          animate={{ rotate: visible ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-lg"
        >
          📑
        </motion.div>
      </motion.button>

      {/* Sliding TOC Panel */}
      <AnimatePresence>
        {visible && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={toggleVisibility}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
            />

            {/* TOC Panel */}
            <motion.aside
              initial={{ x: -320, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -320, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed top-0 left-0 w-80 h-full bg-gray-900/95 backdrop-blur-md text-white p-4 z-50 flex flex-col shadow-2xl border-r border-gray-700"
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold">📑 Table of Contents</h3>
                <button
                  onClick={toggleVisibility}
                  className="text-gray-400 hover:text-white transition-colors p-1 rounded"
                >
                  ✕
                </button>
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
                  <p className="text-sm text-gray-400 text-center">
                    {flat.length === 0 ? "No table of contents available" : "No matching headings found"}
                  </p>
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
                                onJumpToPage(page);
                                toggleVisibility(); // Auto-close after navigation
                              }
                            }}
                            disabled={typeof page !== "number"}
                            className={`
                              w-full text-left cursor-pointer px-3 py-2 rounded-lg text-sm transition-all duration-200
                              hover:bg-gray-700/80 disabled:opacity-50 disabled:cursor-not-allowed
                              ${active ? "bg-yellow-500/20 border-l-4 border-yellow-500 text-yellow-300 font-medium" : "hover:translate-x-1"}
                            `}
                            style={{ paddingLeft: `${entry.level * 12 + 12}px` }}
                            title={typeof page === "number" ? `Go to page ${page}` : "Location unavailable"}
                          >
                            <div className="flex justify-between items-center">
                              <span className="truncate flex-1 leading-relaxed">{entry.title}</span>
                              {typeof page === "number" && (
                                <span className="opacity-60 text-xs ml-3 shrink-0 bg-gray-800/50 px-2 py-0.5 rounded">
                                  p.{page}
                                </span>
                              )}
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
                <p className="text-xs text-gray-400 text-center">
                  {filtered.length} of {flat.length} headings
                </p>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
