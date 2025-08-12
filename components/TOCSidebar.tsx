// components/TOCSidebar.tsx
import React, { useMemo, useState } from "react";
import type { TOCEntry as BaseTOCEntry } from "@/lib/tocParser";

interface Props {
  toc: BaseTOCEntry[];
  currentPage: number;
  onJumpToPage: (page: number) => void;
}

function getTitle(e: BaseTOCEntry): string {
  const any = e as any;
  return (e.title ?? any.text ?? "").toString() || "Untitled";
}

function getLevel(e: BaseTOCEntry): number {
  const any = e as any;
  const lvl = any.level ?? any.depth ?? 0;
  const n = Number(lvl);
  return Number.isFinite(n) ? n : 0;
}

function getPage(e: BaseTOCEntry): number {
  const any = e as any;
  const raw = any.page ?? e.pageNumber ?? any.pageIndex ?? any.pageNum ?? 1;

  let p = Number(raw);
  if (!Number.isFinite(p)) p = 1;
  // some parsers provide 0-based pageIndex
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