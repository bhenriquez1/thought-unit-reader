import React, { useMemo, useState } from "react";

/**
 * Flexible TOC entry shape so we don't rely on a specific export from tocParser.
 * Supports common keys we've used across versions.
 */
export type TOCEntry = {
  title?: string;     // preferred
  text?: string;      // alt key seen in some parsers
  level?: number;     // nesting level
  depth?: number;     // alt key for level
  page?: number;      // 1-based
  pageNumber?: number;
  pageIndex?: number; // sometimes 0- or 1-based depending on parser
  pageNum?: number;   // alt key
  [key: string]: unknown;
};

interface Props {
  toc: TOCEntry[];
  currentPage: number;
  onJumpToPage: (page: number) => void;
}

function getTitle(e: TOCEntry): string {
  return (e.title ?? e.text ?? "").toString() || "Untitled";
}

function getLevel(e: TOCEntry): number {
  const lvl = e.level ?? e.depth ?? 0;
  const n = Number(lvl);
  return Number.isFinite(n) ? n : 0;
}

function getPage(e: TOCEntry): number {
  // Try a bunch of possible fields
  const raw =
    e.page ??
    e.pageNumber ??
    e.pageIndex ??
    e.pageNum ??
    1;

  let p = Number(raw);
  if (!Number.isFinite(p)) p = 1;

  // Some parsers give 0-based pageIndex; clamp to at least 1.
  if (p < 1) p = p + 1;

  return Math.max(1, Math.floor(p));
}

export default function TOCSidebar({ toc, currentPage, onJumpToPage }: Props) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return toc;
    return toc.filter((e) => getTitle(e).toLowerCase().includes(term));
  }, [q, toc]);

  return (
    <aside className="w-64 bg-gray-900 text-white p-4 overflow-y-auto">
      <h3 className="text-lg font-bold mb-4">📑 Table of Contents</h3>

      <input
        type="text"
        placeholder="Search..."
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="w-full p-2 mb-4 rounded bg-gray-800 text-sm outline-none"
      />

      <ul>
        {filtered.map((entry, idx) => {
          const page = getPage(entry);
          const title = getTitle(entry);
          const level = getLevel(entry);

          return (
            <li key={idx}>
              <button
                onClick={() => onJumpToPage(page)}
                className={
                  "w-full text-left cursor-pointer p-2 rounded hover:bg-gray-700 " +
                  (currentPage === page ? "bg-yellow-500 text-black" : "")
                }
                style={{ paddingLeft: `${level * 12 + 8}px` }}
                title={`Go to page ${page}`}
              >
                {title}
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}