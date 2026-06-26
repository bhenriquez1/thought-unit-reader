// components/notelab/NoteCardGrid.tsx
// Adaptive Expert Notebook — renders a page's AI-curated noteCards as a dynamic
// multi-column card grid (replaces the old fixed vertical section stack for any
// note that has noteCards populated; see UltraNotesList.tsx's three-way branch).

import React, { useEffect, useRef, useState } from "react";
import type { NoteCard } from "@/lib/insights/synthesizeTeachingOutput";
import type { UltraNote } from "@/lib/notelab/ultraNoteStore";
import { NOTE_CARD_STYLE } from "@/lib/notelab/noteCardStyle";
import { tierGlowStyle } from "@/lib/insights/tierStyle";
import { renderStars } from "@/lib/insights/importanceTiers";
import CardDiagramPreview from "@/components/notelab/CardDiagramPreview";

export interface NoteCardGridProps {
  noteCards: NoteCard[];
  note: UltraNote;
  onNavigateToPage?: (pageNumber: number) => void;
  onGenerateCard?: (note: UltraNote, card: NoteCard) => void;
  onOpenWhiteboard?: (note: UltraNote, card: NoteCard) => void;
  onExplainCard?: (note: UltraNote, card: NoteCard) => void;
  /** Verbatim text of a LeftPanel/NoteLab-rail thought unit the user just clicked
   *  — the card whose sourceAnchorHints overlaps it gets a focus ring + scrolls into view. */
  focusedAnchorText?: string | null;
}

// Cards are linked back to LeftPanel anchors only loosely (sourceAnchorHints are
// short verbatim phrases the AI copied from the anchor's exactText), so this is a
// best-effort match, not an exact id-based lookup.
function cardMatchesAnchorText(card: NoteCard, anchorText: string): boolean {
  const hints = card.sourceAnchorHints ?? [];
  if (!hints.length) return false;
  const haystack = anchorText.toLowerCase();
  return hints.some((h) => !!h && haystack.includes(h.toLowerCase()));
}

export default function NoteCardGrid({
  noteCards,
  note,
  onNavigateToPage,
  onGenerateCard,
  onOpenWhiteboard,
  onExplainCard,
  focusedAnchorText,
}: NoteCardGridProps) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const focusedCardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (focusedAnchorText) focusedCardRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focusedAnchorText]);

  return (
    <div
      style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "10px" }}
    >
      {noteCards.map((card, i) => {
        const key = `${card.type}-${i}`;
        const style = NOTE_CARD_STYLE[card.type] ?? NOTE_CARD_STYLE.other;
        const tier = tierGlowStyle(card.priorityTier, style.glowColor);
        const hovered = hoveredKey === key;
        const stars = Math.min(5, Math.max(1, card.priorityTier ?? 3));
        const anchorFocused = !!focusedAnchorText && cardMatchesAnchorText(card, focusedAnchorText);

        return (
          <div
            key={key}
            ref={anchorFocused ? focusedCardRef : undefined}
            onMouseEnter={() => setHoveredKey(key)}
            onMouseLeave={() => setHoveredKey((k) => (k === key ? null : k))}
            style={{
              gridColumn: card.span === "2" ? "span 2" : "span 1",
              position: "relative",
              borderRadius: "10px",
              padding: "10px 12px",
              background: "rgba(17,24,39,0.6)",
              boxShadow: anchorFocused ? "0 0 0 3px rgba(252,211,77,0.25)" : tier.boxShadow,
              border: anchorFocused ? "1px solid rgba(252,211,77,0.7)" : tier.border,
              transition: "border-color 0.3s, box-shadow 0.3s",
            }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span style={{ fontSize: 14 }}>{style.icon}</span>
                <span
                  className="text-xs font-semibold uppercase tracking-wide truncate"
                  style={{ color: style.accent }}
                >
                  {card.title || style.label}
                </span>
              </div>
              <span className="text-[10px] text-amber-300 shrink-0" title={`Priority ${stars}/5`}>
                {renderStars(stars)}
              </span>
            </div>

            <p className="mt-1.5 text-sm text-gray-200 whitespace-pre-wrap">{card.body}</p>

            {card.visual && card.visual.nodes.length > 0 && (
              <div className="mt-2">
                <CardDiagramPreview
                  visual={card.visual}
                  onClick={() => onOpenWhiteboard?.(note, card)}
                />
              </div>
            )}

            <div
              className="mt-2 flex flex-wrap gap-1.5 text-[11px] transition-opacity"
              style={{ opacity: hovered ? 1 : 0, pointerEvents: hovered ? "auto" : "none" }}
            >
              {onNavigateToPage && (
                <button
                  type="button"
                  onClick={() => onNavigateToPage(note.pageNumber)}
                  className="px-2 py-0.5 rounded bg-gray-700/80 text-gray-200 hover:bg-gray-600"
                >
                  📍 Go to page
                </button>
              )}
              {onGenerateCard && (
                <button
                  type="button"
                  onClick={() => onGenerateCard(note, card)}
                  className="px-2 py-0.5 rounded bg-teal-700/80 text-white hover:bg-teal-600"
                >
                  🗂 Generate Card
                </button>
              )}
              {onOpenWhiteboard && (
                <button
                  type="button"
                  onClick={() => onOpenWhiteboard(note, card)}
                  className="px-2 py-0.5 rounded bg-indigo-700/80 text-white hover:bg-indigo-600"
                >
                  🖊 Whiteboard
                </button>
              )}
              {onExplainCard && (
                <button
                  type="button"
                  onClick={() => onExplainCard(note, card)}
                  className="px-2 py-0.5 rounded bg-blue-700/80 text-white hover:bg-blue-600"
                >
                  💬 Explain
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
