// components/TOCSidebar.tsx
import React, { useMemo, useState } from "react";

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

export default function TOCSidebar({ toc, currentPage, onJumpToPage }: Props) {
  const [q, setQ] = useState("");

  const flat = useMemo(() => normalizeTOC(toc || []), [toc]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return flat;
    return flat.filter((e) => e.title.toLowerCase().includes(term));
  }, [q, flat]);

  return (
    <aside className="w-72 bg-gray-900 text-white p-3 h-full flex flex-col">
      <h3 className="text-sm font-bold mb-3">📑 Table of Contents</h3>

      <input
        type="text"
        placeholder="Search…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="w-full p-2 mb-3 rounded bg-gray-800 text-xs outline-none"
      />

      {filtered.length === 0 ? (
        <p className="text-xs text-gray-400">No headings found.</p>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <ul className="space-y-1">
            {filtered.map((entry, idx) => {
              const page = entry.page;
              const active = typeof page === "number" && page === currentPage;

              return (
                <li key={`${entry.title}-${idx}`}>
                  <button
                    onClick={() => page && onJumpToPage(page)}
                    disabled={typeof page !== "number"}
                    className={`
                      w-full text-left cursor-pointer px-2 py-1.5 rounded text-xs transition-colors
                      hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed
                      ${active ? "bg-yellow-500 text-black font-medium" : ""}
                    `}
                    style={{ paddingLeft: `${entry.level * 8 + 8}px` }}
                    title={typeof page === "number" ? `Go to page ${page}` : "Location unavailable"}
                  >
                    <div className="flex justify-between items-center">
                      <span className="truncate flex-1 leading-tight">{entry.title}</span>
                      {typeof page === "number" && (
                        <span className="opacity-60 text-[10px] ml-2 shrink-0">p.{page}</span>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </aside>
  );
}
