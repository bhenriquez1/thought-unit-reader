// components/TOCSidebar.tsx
import React, { useMemo, useState } from "react";

/** Flexible item shape: works with tocParser + SmartPDFViewer onOutline */
type TocLike = {
  // Common titles
  title?: string;
  text?: string;

  // Common page fields
  pageNumber?: number; // preferred, 1-based
  page?: number;
  pageIndex?: number;  // sometimes 0-based
  pageNum?: number;

  // Nesting (from PDF outline)
  items?: TocLike[];

  // Legacy level/depth hints
  level?: number;
  depth?: number;

  [key: string]: unknown;
};

interface Props {
  toc: TocLike[];
  currentPage: number;
  onJumpToPage: (page: number) => void;
}

/* -------------------- helpers -------------------- */

/** Best-effort title */
function getTitleAny(e: TocLike): string {
  return (e.title ?? e.text ?? "").toString() || "Untitled";
}

/** Best-effort page (may be undefined if unresolved) */
function getPageAny(e: TocLike): number | undefined {
  // Prefer explicit 1-based fields
  const preferred =
    e.pageNumber ??
    (typeof e.page === "number" ? e.page : undefined) ??
    (typeof e.pageNum === "number" ? e.pageNum : undefined);

  if (typeof preferred === "number" && Number.isFinite(preferred)) {
    const p = Math.floor(preferred);
    return p >= 1 ? p : 1;
  }

  // Fallback: pageIndex can be 0-based
  if (typeof e.pageIndex === "number" && Number.isFinite(e.pageIndex)) {
    return Math.max(1, Math.floor(e.pageIndex) + 1);
  }

  return undefined;
}

/** Flatten either a tree (outline) or a flat list with level hints */
function normalizeTOC(input: TocLike[]): { title: string; page?: number; level: number }[] {
  const out: { title: string; page?: number; level: number }[] = [];

  const hasTree = input.some((n) => Array.isArray(n.items) && n.items.length > 0);

  if (hasTree) {
    const walk = (nodes: TocLike[], level: number) => {
      for (const node of nodes) {
        out.push({
          title: getTitleAny(node),
          page: getPageAny(node),
          level,
        });
        if (Array.isArray(node.items) && node.items.length > 0) {
          walk(node.items, level + 1);
        }
      }
    };
    walk(input, 0);
  } else {
    // Treat as flat list; use level/depth hints if present
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

export default function TOCSidebar({ toc, currentPage, onJumpToPage }: Props) {
  const [q, setQ] = useState("");

  const flat = useMemo(() => normalizeTOC(toc || []), [toc]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return flat;
    return flat.filter((e) => e.title.toLowerCase().includes(term));
  }, [q, flat]);

  return (
    <aside className="w-64 bg-gray-900 text-white p-4 overflow-y-auto">
      <h3 className="text-lg font-bold mb-4">📑 Table of Contents</h3>

      <input
        type="text"
        placeholder="Search…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="w-full p-2 mb-4 rounded bg-gray-800 text-sm outline-none"
      />

      {filtered.length === 0 ? (
        <p className="text-sm text-gray-400">No headings found.</p>
      ) : (
        <ul>
          {filtered.map((entry, idx) => {
            const page = entry.page;
            const active = typeof page === "number" && page === currentPage;

            return (
              <li key={`${entry.title}-${idx}`}>
                <button
                  onClick={() => page && onJumpToPage(page)}
                  disabled={typeof page !== "number"}
                  className={
                    "w-full text-left cursor-pointer p-2 rounded hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed " +
                    (active ? "bg-yellow-500 text-black" : "")
                  }
                  style={{ paddingLeft: `${entry.level * 12 + 8}px` }}
                  title={typeof page === "number" ? `Go to page ${page}` : "Location unavailable"}
                >
                  {entry.title}
                  {typeof page === "number" && (
                    <span className="opacity-60 text-xs ml-2">p.{page}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}