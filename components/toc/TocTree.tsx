import React, { useEffect, useMemo, useState } from "react";
import type { TocNode } from "@/lib/readerContracts";
import { normalizeDisplayTitle } from "@/lib/learningHub/titleNormalizer";

interface TocTreeProps {
  toc: TocNode[];
  activePage: number;
  onJump: (node: TocNode) => void;
  onStudy?: (node: TocNode) => void;
  /** Passed to persist expand state across remounts */
  bookId?: string;
}

const KIND_LABEL: Record<TocNode["kind"], string> = {
  chapter: "Chapter",
  section: "Section",
  subsection: "Subsection",
  week: "Week",
  assignment: "Assignment",
  exam: "Exam",
  deadline: "Deadline",
  policy: "Policy",
  objective: "Objective",
  topic: "Topic",
  frontmatter: "Frontmatter",
};

const STORAGE_KEY = (bookId: string) => `avrrio:v1:toc-expanded:${bookId}`;

/** Find the node id whose page is the largest value ≤ activePage (active chapter). */
function findActiveId(nodes: TocNode[], activePage: number): string | null {
  let bestId: string | null = null;
  let bestPage = -1;

  const walk = (list: TocNode[]) => {
    for (const n of list) {
      if (n.page <= activePage && n.page > bestPage) {
        bestPage = n.page;
        bestId = n.id;
      }
      if (n.children?.length) walk(n.children);
    }
  };
  walk(nodes);
  return bestId;
}

/** Collect the ids of all ancestors of the target node. */
function ancestorIds(nodes: TocNode[], targetId: string, acc: string[] = []): string[] {
  for (const n of nodes) {
    if (n.id === targetId) return acc;
    if (n.children?.length) {
      const found = ancestorIds(n.children, targetId, [...acc, n.id]);
      if (found.length > acc.length) return found;
    }
  }
  return [];
}

/** Remove duplicate titles at the same level (e.g. heuristic TOC duplicate entries). */
function dedup(nodes: TocNode[]): TocNode[] {
  const seen = new Set<string>();
  return nodes
    .filter((n) => {
      const key = `${n.title.trim().toLowerCase()}:${n.page}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((n) => ({ ...n, children: n.children?.length ? dedup(n.children) : n.children }));
}

export default function TocTree({ toc, activePage, onJump, onStudy, bookId }: TocTreeProps) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    if (!bookId || typeof window === "undefined") return {};
    try {
      const raw = localStorage.getItem(STORAGE_KEY(bookId));
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  });

  const normalizedQuery = query.trim().toLowerCase();

  const dedupedToc = useMemo(() => dedup(toc), [toc]);

  const filtered = useMemo(() => {
    if (!normalizedQuery) return dedupedToc;

    const filterNodes = (nodes: TocNode[]): TocNode[] => {
      const out: TocNode[] = [];
      for (const node of nodes) {
        const childMatches = filterNodes(node.children || []);
        const selfMatch = `${node.title} ${node.kind}`.toLowerCase().includes(normalizedQuery);
        if (selfMatch || childMatches.length) {
          out.push({ ...node, children: childMatches });
        }
      }
      return out;
    };

    return filterNodes(dedupedToc);
  }, [dedupedToc, normalizedQuery]);

  const activeId = useMemo(() => findActiveId(dedupedToc, activePage), [dedupedToc, activePage]);

  // Auto-expand ancestors of active node on initial mount and when activePage changes
  useEffect(() => {
    if (!activeId) return;
    const ancestors = ancestorIds(dedupedToc, activeId);
    if (!ancestors.length) return;
    setExpanded((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const id of ancestors) {
        if (!next[id]) { next[id] = true; changed = true; }
      }
      return changed ? next : prev;
    });
  }, [activeId, dedupedToc]);

  // Persist expand state to localStorage
  useEffect(() => {
    if (!bookId || typeof window === "undefined") return;
    try {
      localStorage.setItem(STORAGE_KEY(bookId), JSON.stringify(expanded));
    } catch {
      // quota — ignore
    }
  }, [bookId, expanded]);

  const toggle = (id: string) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/70 p-3">
      <div className="mb-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search chapters, sections…"
          className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50"
        />
      </div>

      <div className="max-h-[55vh] overflow-y-auto pr-1">
        {filtered.length === 0 ? (
          <p className="text-xs text-slate-400 py-4 text-center">
            {normalizedQuery ? "No matching chapters." : "No TOC available."}
          </p>
        ) : (
          <ul className="space-y-0.5">
            {filtered.map((node) => (
              <TocRow
                key={node.id}
                node={node}
                depth={0}
                activeId={activeId}
                expanded={expanded}
                onToggle={toggle}
                onJump={onJump}
                onStudy={onStudy}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function TocRow({
  node,
  depth,
  activeId,
  expanded,
  onToggle,
  onJump,
  onStudy,
}: {
  node: TocNode;
  depth: number;
  activeId: string | null;
  expanded: Record<string, boolean>;
  onToggle: (id: string) => void;
  onJump: (node: TocNode) => void;
  onStudy?: (node: TocNode) => void;
}) {
  const hasChildren = !!node.children?.length;
  const isOpen = expanded[node.id] ?? depth < 1;
  const isActive = node.id === activeId;

  return (
    <li>
      <div
        className={`group flex items-center gap-1.5 rounded-lg border px-2 py-1.5 transition-colors ${
          isActive
            ? "border-indigo-400/60 bg-indigo-500/20 text-white"
            : "border-transparent text-slate-300 hover:border-white/10 hover:bg-white/5"
        }`}
        style={{ marginLeft: `${depth * 12}px` }}
      >
        {hasChildren ? (
          <button
            onClick={() => onToggle(node.id)}
            className="h-4 w-4 rounded border border-white/10 text-[10px] text-slate-400 flex items-center justify-center shrink-0 hover:bg-white/10"
            aria-label={isOpen ? "Collapse" : "Expand"}
          >
            {isOpen ? "−" : "+"}
          </button>
        ) : (
          <span className="inline-block h-4 w-4 shrink-0" />
        )}

        <button onClick={() => onJump(node)} className="flex-1 text-left min-w-0">
          <span className={`text-xs font-medium leading-snug ${isActive ? "text-white" : "text-slate-200"}`}>
            {normalizeDisplayTitle(node.title, { source: "toc" }).cleanedTitle}
          </span>
          <span className="ml-2 text-[10px] text-slate-500">
            {KIND_LABEL[node.kind]} · p.{node.page}
          </span>
          {node.source === "fallback" && (
            <span className="ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] bg-amber-300/15 text-amber-300">
              Estimated
            </span>
          )}
        </button>

        {onStudy && (
          <button
            onClick={() => onStudy(node)}
            className="rounded-md bg-indigo-600/50 px-2 py-0.5 text-[10px] text-white opacity-70 hover:opacity-100 transition-opacity shrink-0"
          >
            Study
          </button>
        )}
      </div>

      {hasChildren && isOpen && (
        <ul className="mt-0.5 space-y-0.5">
          {node.children!.map((child) => (
            <TocRow
              key={child.id}
              node={child}
              depth={depth + 1}
              activeId={activeId}
              expanded={expanded}
              onToggle={onToggle}
              onJump={onJump}
              onStudy={onStudy}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
