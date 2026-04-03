import React, { useMemo } from "react";
import type { TocNode } from "@/lib/readerContracts";

interface SyllabusStudyLauncherProps {
  toc: TocNode[];
  onStudyTopic: (topic: TocNode) => void;
}

function flatten(nodes: TocNode[]): TocNode[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children || [])]);
}

export default function SyllabusStudyLauncher({ toc, onStudyTopic }: SyllabusStudyLauncherProps) {
  const { recommended, fallback, sourceLabel } = useMemo(() => {
    const items = flatten(toc).filter((n) => n.kind !== "frontmatter");
    const first = items.sort((a, b) => a.page - b.page)[0] || null;
    return {
      recommended: first,
      fallback: items.length > 0 && items.every((node) => node.source === "fallback"),
      sourceLabel: items.find((node) => node.source)?.source || "syllabus",
    };
  }, [toc]);

  if (!recommended) {
    return (
      <div className="rounded-xl border border-white/10 bg-slate-900/70 p-4 text-sm text-slate-300">
        Parse complete. Waiting for topic structure…
      </div>
    );
  }

  return (
    <div className="mb-3 rounded-xl border border-blue-400/30 bg-blue-500/10 p-4 text-white">
      <div className="flex items-center gap-2">
        <p className="text-xs uppercase tracking-wide text-blue-200">Recommended next topic</p>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${fallback ? "bg-amber-300/20 text-amber-100" : "bg-emerald-300/20 text-emerald-100"}`}>
          {fallback ? "Fallback structure" : `${sourceLabel[0].toUpperCase()}${sourceLabel.slice(1)} extracted`}
        </span>
      </div>
      <h3 className="mt-1 text-lg font-semibold">{recommended.title}</h3>
      <p className="mt-1 text-sm text-blue-100">Page {recommended.page}</p>
      <button
        onClick={() => onStudyTopic(recommended)}
        className="mt-3 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium hover:bg-blue-500"
      >
        Study Now
      </button>
    </div>
  );
}
