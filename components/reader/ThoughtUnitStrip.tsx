// components/reader/ThoughtUnitStrip.tsx
// Left-panel "Thought Unit" strip — visually mirrors the RightPanel's Page Thesis +
// Study Notes cards (Why This Matters / Key Mechanism / Common Confusion / Quick
// Memory) so the reader sees the same conceptual blocks the AI extracted, directly
// above the PDF page they came from.
//
// Bidirectional focus sync: clicking a block here calls onEvidenceFocus(anchor.id),
// the same focusedEvidenceId setter RightPanel's cards use — so selecting a block
// here glows the matching RightPanel card AND the matching PDF highlight, and
// selecting a RightPanel card glows the matching block here.

import type { CurrentPageStudyModel, VisualAnchorSourceField } from "@/lib/insights/currentPageStudyModel";

type ThoughtUnitStripProps = {
  studyModel: CurrentPageStudyModel | null | undefined;
  focusedEvidenceId?: string | null;
  /** Focus + highlight this thought unit in the PDF — mirrors RightPanel's onEvidenceClick(snippet, evidenceId). */
  onEvidenceClick?: (snippet: string, evidenceId?: string) => void;
};

type BlockConfig = {
  field: VisualAnchorSourceField;
  icon: string;
  label: string;
  text: string | null | undefined;
  headingClass: string;
  borderIdle: string;
  borderFocused: string;
  bg: string;
  glowClass: string;
  italic?: boolean;
};

export default function ThoughtUnitStrip({ studyModel, focusedEvidenceId, onEvidenceClick }: ThoughtUnitStripProps) {
  if (!studyModel) return null;

  const findAnchor = (field: VisualAnchorSourceField) =>
    studyModel.visualAnchors?.find((a) => a.sourceField === field) ?? null;

  const blocks: BlockConfig[] = [
    {
      field: "pageThesis",
      icon: "🎯",
      label: "Page Thesis",
      text: studyModel.pageThesis,
      headingClass: "text-amber-300",
      borderIdle: "border-amber-400/15",
      borderFocused: "border-amber-400/60",
      bg: "#0b1830",
      glowClass: "ring-2 ring-amber-300/60 shadow-[0_0_10px_rgba(252,211,77,0.45)]",
    },
    {
      field: "whyThisMatters",
      icon: "💡",
      label: "Why This Matters",
      text: studyModel.studyNotes?.whyThisMatters,
      headingClass: "text-blue-300/70",
      borderIdle: "border-blue-400/15",
      borderFocused: "border-blue-400/60",
      bg: "#0a1828",
      glowClass: "ring-2 ring-blue-300/60 shadow-[0_0_10px_rgba(96,165,250,0.45)]",
    },
    {
      field: "keyMechanism",
      icon: "⚙️",
      label: "Key Mechanism",
      text: studyModel.studyNotes?.keyMechanism,
      headingClass: "text-emerald-300/70",
      borderIdle: "border-emerald-400/15",
      borderFocused: "border-emerald-400/60",
      bg: "#0a1820",
      glowClass: "ring-2 ring-emerald-300/60 shadow-[0_0_10px_rgba(110,231,183,0.45)]",
    },
    {
      field: "commonConfusion",
      icon: "⚠️",
      label: "Common Confusion",
      text: studyModel.studyNotes?.commonConfusion,
      headingClass: "text-red-300/70",
      borderIdle: "border-red-400/15",
      borderFocused: "border-red-400/60",
      bg: "#1a0a0a",
      glowClass: "ring-2 ring-red-300/60 shadow-[0_0_10px_rgba(252,165,165,0.45)]",
    },
    {
      field: "quickMemory",
      icon: "🧠",
      label: "Quick Memory",
      text: studyModel.studyNotes?.quickMemory,
      headingClass: "text-purple-300/70",
      borderIdle: "border-purple-400/15",
      borderFocused: "border-purple-400/60",
      bg: "#150b25",
      glowClass: "ring-2 ring-purple-300/60 shadow-[0_0_10px_rgba(216,180,254,0.45)]",
      italic: true,
    },
  ];

  const visibleBlocks = blocks.filter((b) => !!(b.text && b.text.trim().length > 0));
  if (visibleBlocks.length === 0) return null;

  return (
    <div
      className="flex gap-2 overflow-x-auto px-3 py-2 bg-[#0d1117] border-b border-white/8 shrink-0"
      data-testid="thought-unit-strip"
    >
      {visibleBlocks.map((block) => {
        const anchor = findAnchor(block.field);
        const isFocused = anchor ? focusedEvidenceId === anchor.id : false;
        return (
          <div
            key={block.field}
            className={`shrink-0 w-[220px] rounded-lg border ${isFocused ? block.borderFocused : block.borderIdle} ${isFocused ? block.glowClass : ""} px-2.5 py-2 transition-all`}
            style={{ background: block.bg, cursor: anchor ? "pointer" : undefined }}
            onClick={anchor ? () => onEvidenceClick?.(anchor.exactText, anchor.id) : undefined}
            title={anchor ? "Click to highlight this thought unit in the PDF" : undefined}
            data-testid={`thought-unit-block-${block.field}`}
          >
            <div className={`mb-1 text-[10px] font-bold uppercase tracking-[0.14em] ${block.headingClass}`}>
              {block.icon} {block.label}
            </div>
            <p className={`text-[11px] leading-[1.45] text-white/85 line-clamp-3 ${block.italic ? "italic" : ""}`}>
              {block.text}
            </p>
          </div>
        );
      })}
    </div>
  );
}
