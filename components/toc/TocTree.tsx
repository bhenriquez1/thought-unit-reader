import React, { useMemo, useState } from "react";
import type { TocNode } from "@/lib/readerContracts";

interface TocTreeProps {
  toc: TocNode[];
  activePage: number;
  onJump: (node: TocNode) => void;
  onStudy?: (node: TocNode) => void;
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

export default function TocTree({ toc, activePage, onJump, onStudy }: TocTreeProps) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const normalizedQuery = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!normalizedQuery) return toc;

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

    return filterNodes(toc);
  }, [toc, normalizedQuery]);

  const toggle = (id: string) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/70 p-3">
      <div className="mb-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search chapters, sections, weeks..."
          className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
        />
      </div>

      <div className="max-h-[55vh] overflow-y-auto pr-1">
        {filtered.length === 0 ? (
          <p className="text-sm text-slate-400">No matching TOC entries.</p>
        ) : (
          <ul className="space-y-1">
            {filtered.map((node) => (
              <TocRow
                key={node.id}
                node={node}
                depth={0}
                activePage={activePage}
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
  activePage,
  expanded,
  onToggle,
  onJump,
  onStudy,
}: {
  node: TocNode;
  depth: number;
  activePage: number;
  expanded: Record<string, boolean>;
  onToggle: (id: string) => void;
  onJump: (node: TocNode) => void;
  onStudy?: (node: TocNode) => void;
}) {
  const hasChildren = !!node.children?.length;
  const isOpen = expanded[node.id] ?? depth < 1;
  const isActive = node.page === activePage;

  return (
    <li>
      <div
        className={`group flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm ${
          isActive
            ? "border-indigo-400/60 bg-indigo-500/20 text-white"
            : "border-transparent text-slate-200 hover:border-white/10 hover:bg-white/5"
        }`}
        style={{ marginLeft: `${depth * 14}px` }}
      >
        {hasChildren ? (
          <button
            onClick={() => onToggle(node.id)}
            className="h-5 w-5 rounded border border-white/10 text-xs text-slate-300"
            aria-label={isOpen ? "Collapse" : "Expand"}
          >
            {isOpen ? "−" : "+"}
          </button>
        ) : (
          <span className="inline-block h-5 w-5" />
        )}

        <button onClick={() => onJump(node)} className="flex-1 text-left">
          <span className="font-medium">{node.title}</span>
          <span className="ml-2 text-xs text-slate-400">{KIND_LABEL[node.kind]} · p.{node.page}</span>
          {node.source && (
            <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] ${node.source === "fallback" ? "bg-amber-300/20 text-amber-100" : "bg-emerald-300/20 text-emerald-100"}`}>
              {node.source === "fallback" ? "Fallback structure" : "Auto-detected"}
            </span>
          )}
        </button>

        {onStudy && (
          <button
            onClick={() => onStudy(node)}
            className="rounded bg-blue-600 px-2 py-1 text-xs text-white opacity-80 hover:opacity-100"
          >
            Study
          </button>
        )}
      </div>

      {hasChildren && isOpen && (
        <ul className="mt-1 space-y-1">
          {node.children!.map((child) => (
            <TocRow
              key={child.id}
              node={child}
              depth={depth + 1}
              activePage={activePage}
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
