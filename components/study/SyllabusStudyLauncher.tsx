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
  const recommended = useMemo(() => {
    const items = flatten(toc).filter((n) => n.kind !== "frontmatter");
    return items.sort((a, b) => a.page - b.page)[0] || null;
  }, [toc]);

  if (!recommended) {
    return (
      <div className="rounded-xl border border-white/10 bg-slate-900/70 p-4 text-sm text-slate-300">
        No study topic found yet. Upload a syllabus with recognizable headings.
      </div>
    );
  }

  return (
    <div className="mb-3 rounded-xl border border-blue-400/30 bg-blue-500/10 p-4 text-white">
      <p className="text-xs uppercase tracking-wide text-blue-200">Recommended next topic</p>
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
