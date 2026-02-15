// components/surgeonView2/SyllabusMatchingPanel.tsx
// Syllabus Matching UI: Top 3 candidates with confidence bars
// Accept / Adjust / Teach buttons + manual correction as training data

import React, { useState } from 'react';
import type {
  SyllabusMappingResult,
  MappingCandidate,
  SyllabusItem,
  ConfidenceBand,
} from '@/lib/surgeonEngine/types';

// ============================================================================
// Constants
// ============================================================================

const BAND_STYLES: Record<ConfidenceBand, { color: string; bg: string; label: string }> = {
  AUTO: { color: 'text-green-400', bg: 'bg-green-900/30', label: 'Auto-mapped' },
  REVIEW: { color: 'text-amber-400', bg: 'bg-amber-900/30', label: 'Needs review' },
  SUGGEST: { color: 'text-gray-400', bg: 'bg-gray-800/50', label: 'Suggestion only' },
};

// ============================================================================
// Main Panel
// ============================================================================

interface SyllabusMatchingPanelProps {
  syllabusItems: SyllabusItem[];
  results: Record<string, SyllabusMappingResult>;
  onAccept: (syllabusId: string, candidateIndex: number) => void;
  onReject: (syllabusId: string, candidateIndex: number) => void;
  onTeach: (syllabusId: string, candidateIndex: number, notes?: string) => void;
  onJumpToPage?: (page: number) => void;
}

export const SyllabusMatchingPanel: React.FC<SyllabusMatchingPanelProps> = ({
  syllabusItems,
  results,
  onAccept,
  onReject,
  onTeach,
  onJumpToPage,
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (syllabusItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <span className="text-3xl mb-2">📋</span>
        <p className="text-sm text-gray-400">No syllabus loaded</p>
        <p className="text-xs text-gray-500 mt-1">Upload a syllabus to start matching</p>
      </div>
    );
  }

  // Separate items by status
  const needsReview = syllabusItems.filter(item => {
    const result = results[item.syllabusId];
    return result?.needsReview;
  });

  const mapped = syllabusItems.filter(item => {
    const result = results[item.syllabusId];
    return result && !result.needsReview && result.chosen;
  });

  const unmapped = syllabusItems.filter(item => !results[item.syllabusId]);

  return (
    <div className="p-3 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          Syllabus Mapping
        </h3>
        <div className="flex items-center gap-2 text-[10px] text-gray-500">
          <span className="text-green-400">{mapped.length} mapped</span>
          <span className="text-amber-400">{needsReview.length} review</span>
          <span className="text-gray-500">{unmapped.length} pending</span>
        </div>
      </div>

      {/* Needs Review Section */}
      {needsReview.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-amber-400 text-xs">⚠️</span>
            <span className="text-xs font-medium text-amber-400">Needs Review ({needsReview.length})</span>
          </div>
          <div className="space-y-2">
            {needsReview.map(item => (
              <SyllabusMatchCard
                key={item.syllabusId}
                item={item}
                result={results[item.syllabusId]}
                isExpanded={expandedId === item.syllabusId}
                onToggle={() => setExpandedId(expandedId === item.syllabusId ? null : item.syllabusId)}
                onAccept={(idx) => onAccept(item.syllabusId, idx)}
                onReject={(idx) => onReject(item.syllabusId, idx)}
                onTeach={(idx, notes) => onTeach(item.syllabusId, idx, notes)}
                onJumpToPage={onJumpToPage}
              />
            ))}
          </div>
        </div>
      )}

      {/* Mapped Section (collapsible) */}
      {mapped.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-green-400 text-xs">✓</span>
            <span className="text-xs font-medium text-green-400">Mapped ({mapped.length})</span>
          </div>
          <div className="space-y-1">
            {mapped.map(item => {
              const result = results[item.syllabusId];
              return (
                <div
                  key={item.syllabusId}
                  className="flex items-center gap-2 px-2 py-1.5 bg-gray-800/30 rounded text-xs"
                >
                  <span className="text-green-500">✓</span>
                  <span className="text-gray-300 flex-1 truncate">{item.title}</span>
                  {result?.chosen?.debug?.matchedHeading && (
                    <span className="text-gray-500 truncate max-w-[120px]">
                      → {result.chosen.debug.matchedHeading}
                    </span>
                  )}
                  <ConfidenceBar confidence={result?.chosen?.confidence || 0} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Match Card (for review items)
// ============================================================================

interface SyllabusMatchCardProps {
  item: SyllabusItem;
  result: SyllabusMappingResult;
  isExpanded: boolean;
  onToggle: () => void;
  onAccept: (candidateIndex: number) => void;
  onReject: (candidateIndex: number) => void;
  onTeach: (candidateIndex: number, notes?: string) => void;
  onJumpToPage?: (page: number) => void;
}

const SyllabusMatchCard: React.FC<SyllabusMatchCardProps> = ({
  item,
  result,
  isExpanded,
  onToggle,
  onAccept,
  onReject,
  onTeach,
  onJumpToPage,
}) => {
  const [teachNotes, setTeachNotes] = useState('');

  return (
    <div className="bg-gray-800/50 rounded-lg border border-gray-700">
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
      >
        <span className="text-sm">📋</span>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-white truncate">{item.title}</h4>
          {item.weekIndex !== undefined && (
            <span className="text-[10px] text-gray-500">Week {item.weekIndex}</span>
          )}
        </div>
        <span className="text-xs text-gray-500">
          {result.candidates.length} candidate{result.candidates.length !== 1 ? 's' : ''}
        </span>
        <span className="text-xs text-gray-500">{isExpanded ? '▾' : '▸'}</span>
      </button>

      {/* Expanded: Candidate List */}
      {isExpanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-gray-700 pt-2">
          {result.candidates.map((candidate, idx) => (
            <CandidateRow
              key={idx}
              candidate={candidate}
              index={idx}
              isChosen={result.chosen === candidate}
              onAccept={() => onAccept(idx)}
              onReject={() => onReject(idx)}
              onTeach={() => onTeach(idx, teachNotes || undefined)}
              onJumpToPage={onJumpToPage}
            />
          ))}

          {/* Teach input */}
          <div className="mt-2 flex items-center gap-2">
            <input
              type="text"
              placeholder="Notes (optional)"
              value={teachNotes}
              onChange={(e) => setTeachNotes(e.target.value)}
              className="flex-1 text-xs bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white placeholder-gray-600 focus:border-teal-500 focus:outline-none"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Candidate Row
// ============================================================================

interface CandidateRowProps {
  candidate: MappingCandidate;
  index: number;
  isChosen: boolean;
  onAccept: () => void;
  onReject: () => void;
  onTeach: () => void;
  onJumpToPage?: (page: number) => void;
}

const CandidateRow: React.FC<CandidateRowProps> = ({
  candidate,
  index,
  isChosen,
  onAccept,
  onReject,
  onTeach,
  onJumpToPage,
}) => {
  const bandStyle = BAND_STYLES[candidate.band];

  return (
    <div
      className={`p-2 rounded border ${
        isChosen ? 'border-green-600 bg-green-900/20' : 'border-gray-700 bg-gray-900/30'
      }`}
    >
      {/* Heading + Confidence */}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs text-gray-500 font-mono">#{index + 1}</span>
        <span className="text-xs text-white flex-1 truncate">
          {candidate.debug?.matchedHeading || candidate.tocId || 'Unknown section'}
        </span>
        <ConfidenceBar confidence={candidate.confidence} />
      </div>

      {/* Band badge */}
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${bandStyle.bg} ${bandStyle.color}`}>
          {bandStyle.label}
        </span>
        {/* Reason codes */}
        {candidate.reasonCodes.slice(0, 3).map((code, i) => (
          <span key={i} className="text-[10px] text-gray-600">
            {code.replace(/_/g, ' ').toLowerCase()}
          </span>
        ))}
      </div>

      {/* Page range */}
      {candidate.pageRange && onJumpToPage && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onJumpToPage(candidate.pageRange!.start);
          }}
          className="text-[10px] text-teal-400 hover:text-teal-300 mb-1.5"
        >
          pp. {candidate.pageRange.start}–{candidate.pageRange.end}
        </button>
      )}

      {/* Debug scores (compact) */}
      {candidate.debug && (
        <div className="flex gap-3 text-[10px] text-gray-600 mb-1.5">
          {candidate.debug.semanticScore !== undefined && (
            <span>sem: {(candidate.debug.semanticScore * 100).toFixed(0)}%</span>
          )}
          {candidate.debug.headingScore !== undefined && (
            <span>hd: {(candidate.debug.headingScore * 100).toFixed(0)}%</span>
          )}
          {candidate.debug.keywordScore !== undefined && (
            <span>kw: {(candidate.debug.keywordScore * 100).toFixed(0)}%</span>
          )}
          {candidate.debug.pageDensity !== undefined && candidate.debug.pageDensity > 0 && (
            <span>pg: {(candidate.debug.pageDensity * 100).toFixed(0)}%</span>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={(e) => { e.stopPropagation(); onAccept(); }}
          className="text-[10px] px-2 py-1 bg-green-800 hover:bg-green-700 text-green-200 rounded transition-colors"
        >
          Accept
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onTeach(); }}
          className="text-[10px] px-2 py-1 bg-teal-800 hover:bg-teal-700 text-teal-200 rounded transition-colors"
        >
          Teach
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onReject(); }}
          className="text-[10px] px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
        >
          Reject
        </button>
      </div>
    </div>
  );
};

// ============================================================================
// Confidence Bar
// ============================================================================

const ConfidenceBar: React.FC<{ confidence: number }> = ({ confidence }) => {
  const pct = Math.round(confidence * 100);
  const color = pct >= 78 ? 'bg-green-500' : pct >= 60 ? 'bg-amber-500' : 'bg-gray-500';

  return (
    <div className="flex items-center gap-1">
      <div className="w-10 h-1.5 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] text-gray-500 w-6 text-right">{pct}%</span>
    </div>
  );
};

export default SyllabusMatchingPanel;
