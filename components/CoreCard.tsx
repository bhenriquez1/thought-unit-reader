"use client";

import React, { useState, useCallback, memo } from 'react';
import type { CoreConcept, CoreExpandResponse } from '@/lib/coreConceptSchema';

// ============================================================================
// Types
// ============================================================================

type Tag = CoreConcept['tags'][number];

interface CoreCardProps {
  concept: CoreConcept;
  docId: string;
  windowText: string;
  isHighlighted?: boolean;
  onSelect?: (concept: CoreConcept) => void;
}

// ============================================================================
// Tag Pill Component
// ============================================================================

const TAG_COLORS: Record<Tag, string> = {
  definition: 'bg-blue-600/30 text-blue-300 border-blue-500/40',
  process:    'bg-green-600/30 text-green-300 border-green-500/40',
  rule:       'bg-orange-600/30 text-orange-300 border-orange-500/40',
  example:    'bg-cyan-600/30 text-cyan-300 border-cyan-500/40',
  pitfall:    'bg-red-600/30 text-red-300 border-red-500/40',
};

const TagPill = memo(function TagPill({ tag }: { tag: Tag }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium border rounded ${TAG_COLORS[tag]}`}>
      {tag}
    </span>
  );
});

// ============================================================================
// Exam Weight Meter
// ============================================================================

const ExamWeightMeter = memo(function ExamWeightMeter({ weight }: { weight: 1 | 2 | 3 | 4 | 5 }) {
  const blocks = Array.from({ length: 5 }, (_, i) => i < weight);
  return (
    <div className="flex items-center gap-0.5" title={`Exam weight: ${weight}/5`}>
      {blocks.map((filled, i) => (
        <div
          key={i}
          className={`w-2 h-3 rounded-sm ${filled ? 'bg-purple-500' : 'bg-gray-700'}`}
        />
      ))}
      <span className="text-[10px] text-gray-500 ml-1">{weight}/5</span>
    </div>
  );
});

// ============================================================================
// Confidence Badge
// ============================================================================

const CONFIDENCE_STYLES: Record<0 | 1 | 2 | 3, { bg: string; label: string }> = {
  0: { bg: 'bg-gray-600/40 text-gray-400', label: 'Low' },
  1: { bg: 'bg-yellow-600/30 text-yellow-400', label: 'Fair' },
  2: { bg: 'bg-blue-600/30 text-blue-300', label: 'Good' },
  3: { bg: 'bg-green-600/30 text-green-300', label: 'High' },
};

const ConfidenceBadge = memo(function ConfidenceBadge({ level }: { level: 0 | 1 | 2 | 3 }) {
  const style = CONFIDENCE_STYLES[level];
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded ${style.bg}`}>
      {style.label}
    </span>
  );
});

// ============================================================================
// Expansion Content (lazy-loaded)
// ============================================================================

interface ExpansionContentProps {
  data: CoreExpandResponse | null;
  loading: boolean;
  error: string | null;
}

const ExpansionContent = memo(function ExpansionContent({ data, loading, error }: ExpansionContentProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 text-xs text-gray-400 animate-pulse">
        <span>Loading details...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-2 text-xs text-red-400">Failed to load: {error}</div>
    );
  }

  if (!data) return null;

  const { expansions, flashcards } = data;

  return (
    <div className="space-y-3">
      {/* Procedure Steps */}
      {expansions.procedure && expansions.procedure.length > 0 && (
        <div>
          <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">Procedure</div>
          <ol className="list-decimal list-inside space-y-1">
            {expansions.procedure.map((step, i) => (
              <li key={i} className="text-xs text-gray-300 leading-relaxed">{step}</li>
            ))}
          </ol>
        </div>
      )}

      {/* Examples */}
      {expansions.examples && expansions.examples.length > 0 && (
        <div>
          <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">Examples</div>
          {expansions.examples.map((ex, i) => (
            <div key={i} className="text-xs text-cyan-300/80 pl-2 border-l-2 border-cyan-500/30 mb-1">
              {ex}
            </div>
          ))}
        </div>
      )}

      {/* Pitfalls */}
      {expansions.pitfalls && expansions.pitfalls.length > 0 && (
        <div>
          <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">Pitfalls</div>
          {expansions.pitfalls.map((pit, i) => (
            <div key={i} className="text-xs text-red-300/80 pl-2 border-l-2 border-red-500/30 mb-1">
              {pit}
            </div>
          ))}
        </div>
      )}

      {/* Flashcards */}
      {flashcards.length > 0 && (
        <div>
          <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">Flashcards</div>
          {flashcards.map((fc, i) => (
            <div key={i} className="p-2 bg-gray-800/80 rounded border border-gray-700/50 mb-1">
              <div className="text-xs text-purple-300 font-medium">Q: {fc.q}</div>
              <div className="text-xs text-gray-300 mt-1">A: {fc.a}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

// ============================================================================
// Main CoreCard Component
// ============================================================================

export const CoreCard = memo(function CoreCard({
  concept,
  docId,
  windowText,
  isHighlighted = false,
  onSelect,
}: CoreCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [expansion, setExpansion] = useState<CoreExpandResponse | null>(null);
  const [expandLoading, setExpandLoading] = useState(false);
  const [expandError, setExpandError] = useState<string | null>(null);

  const handleClick = useCallback(() => {
    onSelect?.(concept);
  }, [concept, onSelect]);

  const handleExpand = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    const willExpand = !isExpanded;
    setIsExpanded(willExpand);

    // Lazy-load expansion data on first expand
    if (willExpand && !expansion && !expandLoading) {
      setExpandLoading(true);
      setExpandError(null);
      try {
        const res = await fetch('/api/core/expand', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            docId,
            conceptId: concept.id,
            conceptLabel: concept.label,
            windowText,
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: CoreExpandResponse = await res.json();
        setExpansion(data);
      } catch (err) {
        setExpandError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setExpandLoading(false);
      }
    }
  }, [isExpanded, expansion, expandLoading, docId, concept.id, concept.label, windowText]);

  return (
    <div
      className={`
        relative p-3 rounded-lg border transition-all duration-200 cursor-pointer
        ${isHighlighted
          ? 'bg-purple-900/30 border-purple-500/50 shadow-lg shadow-purple-500/10'
          : 'bg-gray-800/50 border-gray-700/50 hover:border-gray-600/50 hover:bg-gray-800/70'
        }
      `}
      onClick={handleClick}
    >
      {/* Header: Tags + Confidence + ExamWeight */}
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1">
          {concept.tags.map((tag) => (
            <TagPill key={tag} tag={tag} />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <ConfidenceBadge level={concept.confidence} />
          <ExamWeightMeter weight={concept.examWeight} />
        </div>
      </div>

      {/* Label */}
      <h3 className="text-sm font-semibold text-white mb-1">{concept.label}</h3>

      {/* One-liner */}
      <p className="text-xs text-gray-300 leading-relaxed">{concept.oneLiner}</p>

      {/* Expand/Collapse toggle */}
      <div className="mt-2 flex items-center justify-between">
        <button
          onClick={handleExpand}
          className="text-[10px] text-purple-400 hover:text-purple-300 transition-colors"
        >
          {isExpanded ? 'Collapse' : 'Expand details'}
        </button>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-gray-700/50 space-y-3">
          {/* Anchor Quotes */}
          {concept.anchors.length > 0 && (
            <div>
              <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">Source</div>
              {concept.anchors.map((anchor, i) => (
                <div key={i} className="text-xs text-gray-400 italic pl-2 border-l-2 border-gray-600/50 mb-1">
                  "{anchor.quote}"
                  <span className="text-[10px] text-gray-600 ml-1 not-italic">
                    p.{anchor.locator.page}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Lazy-loaded expansions */}
          <ExpansionContent data={expansion} loading={expandLoading} error={expandError} />
        </div>
      )}
    </div>
  );
});

// ============================================================================
// CoreCard List Component
// ============================================================================

interface CoreCardListProps {
  concepts: CoreConcept[];
  docId: string;
  windowText: string;
  highlightedId?: string | null;
  onSelectConcept?: (concept: CoreConcept) => void;
  emptyMessage?: string;
}

export const CoreCardList = memo(function CoreCardList({
  concepts,
  docId,
  windowText,
  highlightedId,
  onSelectConcept,
  emptyMessage = 'No concepts extracted for this view.',
}: CoreCardListProps) {
  if (concepts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="text-4xl mb-3">⚡</div>
        <p className="text-sm text-gray-400">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {concepts.map((concept) => (
        <CoreCard
          key={concept.id}
          concept={concept}
          docId={docId}
          windowText={windowText}
          isHighlighted={concept.id === highlightedId}
          onSelect={onSelectConcept}
        />
      ))}
    </div>
  );
});

// ============================================================================
// Stats Display
// ============================================================================

interface CoreStatsProps {
  conceptCount: number;
  maxConcepts: number;
  extractionTimeMs?: number;
}

export const CoreStats = memo(function CoreStats({ conceptCount, maxConcepts, extractionTimeMs }: CoreStatsProps) {
  return (
    <div className="flex items-center gap-4 px-3 py-2 bg-gray-800/30 rounded-lg text-xs text-gray-400">
      <span>
        <strong className="text-gray-300">{conceptCount}</strong>/{maxConcepts} concepts
      </span>
      {extractionTimeMs !== undefined && (
        <span className="ml-auto text-gray-500">
          {extractionTimeMs.toFixed(0)}ms
        </span>
      )}
    </div>
  );
});

export default CoreCard;
