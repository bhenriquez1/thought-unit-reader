// components/TOCSidebar.tsx
import React, { useMemo, useState } from "react";
import type { TOCEntry as BaseTOCEntry } from "@/lib/tocParser";

// Extend the upstream type without changing the source file
type TOCEntry = BaseTOCEntry & {
  page?: number;
  pageNumber?: number;
  pageIndex?: number;
  level?: number;
  title: string;
};

interface Props {
  toc: TOCEntry[];
  currentPage: number;
  onJumpToPage: (page: number) => void;
}

function getPage(e: TOCEntry): number {
  return e.page ?? e.pageNumber ?? e.pageIndex ?? 1;
}

export default function TOCSidebar({ toc, currentPage, onJumpToPage }: Props) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return toc;
    return toc.filter((e) => e.title?.toLowerCase().includes(term));
  }, [q, toc]);

  return (
    <div className="w-64 bg-gray-900 text-white p-4 overflow-y-auto">
      <h3 className="text-lg font-bold mb-4">📑 Table of Contents</h3>

      <input
        type="text"
        placeholder="Search..."
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="w-full p-2 mb-4 rounded bg-gray-800 text-sm"
      />

      <ul>
        {filtered.map((entry, idx) => {
          const page = getPage(entry);
          return (
            <li key={idx}>
              <button
                onClick={() => onJumpToPage(page)}
                className={
                  "w-full text-left cursor-pointer p-2 rounded hover:bg-gray-700 " +
                  (currentPage === page ? "bg-yellow-500 text-black" : "")
                }
                style={{ paddingLeft: `${(entry.level ?? 0) * 12 + 8}px` }}
              >
                {entry.title}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}