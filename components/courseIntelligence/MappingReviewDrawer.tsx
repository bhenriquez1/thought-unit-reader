// components/courseIntelligence/MappingReviewDrawer.tsx
// Drawer for reviewing and manually correcting low-confidence syllabus → TOC mappings

import React, { useState } from 'react';
import type { ObjectiveMapping, TOCEntry } from '@/lib/courseIntelligence/types';

interface MappingReviewDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  mappings: ObjectiveMapping[];
  tocEntries: TOCEntry[];
  onAccept: (mappingId: string) => void;
  onReject: (mappingId: string) => void;
  onSetGold: (mappingId: string, tocId: string) => void;
}

export const MappingReviewDrawer: React.FC<MappingReviewDrawerProps> = ({
  isOpen,
  onClose,
  mappings,
  tocEntries,
  onAccept,
  onReject,
  onSetGold,
}) => {
  const [activeMapping, setActiveMapping] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'needs_review' | 'suggested_review'>('all');

  if (!isOpen) return null;

  // Filter mappings
  const filteredMappings = mappings.filter((m) => {
    if (filterStatus === 'all') return m.status !== 'gold' && m.status !== 'auto_accepted';
    return m.status === filterStatus;
  });

  // Search TOC entries
  const searchResults = searchQuery.length > 1
    ? tocEntries.filter((t) =>
        t.title.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  const activeMappingData = activeMapping
    ? mappings.find((m) => m.id === activeMapping)
    : null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 w-[500px] bg-gray-900 border-l border-gray-700 z-50 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-700 bg-gradient-to-r from-amber-900/50 to-gray-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🔗</span>
              <div>
                <h2 className="font-bold text-white">Mapping Review</h2>
                <p className="text-xs text-gray-300">
                  {filteredMappings.length} mappings need review
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
            >
              <span className="text-gray-400 text-xl">×</span>
            </button>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex border-b border-gray-700">
          {[
            { id: 'all', label: 'All Pending' },
            { id: 'needs_review', label: 'Needs Review' },
            { id: 'suggested_review', label: 'Suggested' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterStatus(tab.id as typeof filterStatus)}
              className={`
                flex-1 py-2 px-3 text-sm font-medium transition-colors
                ${filterStatus === tab.id
                  ? 'text-amber-400 border-b-2 border-amber-400 bg-gray-800/50'
                  : 'text-gray-400 hover:text-gray-300'
                }
              `}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex">
          {/* Mapping List */}
          <div className="w-1/2 border-r border-gray-700 overflow-y-auto">
            {filteredMappings.length > 0 ? (
              <div className="divide-y divide-gray-700">
                {filteredMappings.map((mapping) => (
                  <MappingListItem
                    key={mapping.id}
                    mapping={mapping}
                    isActive={activeMapping === mapping.id}
                    onClick={() => setActiveMapping(mapping.id)}
                    onAccept={() => onAccept(mapping.id)}
                    onReject={() => onReject(mapping.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center p-8">
                <span className="text-4xl mb-3">✅</span>
                <h3 className="text-sm font-medium text-white mb-1">All Clear!</h3>
                <p className="text-xs text-gray-400">
                  No mappings need review.
                </p>
              </div>
            )}
          </div>

          {/* Detail / Search Panel */}
          <div className="w-1/2 flex flex-col">
            {activeMappingData ? (
              <>
                {/* Active Mapping Detail */}
                <div className="p-4 border-b border-gray-700 bg-gray-800/50">
                  <h3 className="text-sm font-semibold text-white mb-2">
                    Syllabus Objective
                  </h3>
                  <p className="text-sm text-gray-300">
                    Objective ID: {activeMappingData.objectiveId}
                  </p>
                  {activeMappingData.reasons.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {activeMappingData.reasons.map((reason, i) => (
                        <span
                          key={i}
                          className="text-xs px-2 py-0.5 bg-gray-700 rounded text-gray-300"
                        >
                          {reason}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Current Match */}
                <div className="p-4 border-b border-gray-700">
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                    Current Match
                  </h3>
                  {activeMappingData.tocId ? (
                    <div className="p-3 bg-gray-800 rounded-lg border border-gray-700">
                      <p className="text-sm text-white">
                        {tocEntries.find((t) => t.id === activeMappingData.tocId)?.title || 'Unknown'}
                      </p>
                      <div className="flex items-center gap-2 mt-2 text-xs">
                        <ConfidenceBadge score={activeMappingData.confidenceScore} />
                        <span className="text-gray-400">
                          Text: {Math.round(activeMappingData.textScore * 100)}% |
                          Struct: {Math.round(activeMappingData.structScore * 100)}%
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 italic">No match found</p>
                  )}
                </div>

                {/* Search for Better Match */}
                <div className="flex-1 overflow-y-auto p-4">
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                    Find Better Match
                  </h3>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search TOC entries..."
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-teal-500"
                  />

                  {searchResults.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {searchResults.slice(0, 10).map((toc) => (
                        <button
                          key={toc.id}
                          onClick={() => {
                            onSetGold(activeMappingData.id, toc.id);
                            setSearchQuery('');
                          }}
                          className="w-full text-left p-3 bg-gray-800 hover:bg-gray-700 rounded-lg border border-gray-700 hover:border-teal-500 transition-colors"
                        >
                          <p className="text-sm text-white">{toc.title}</p>
                          <p className="text-xs text-gray-400 mt-1">
                            {toc.chapterTitle && `${toc.chapterTitle} • `}
                            {toc.pageRange && `p.${toc.pageRange.start}-${toc.pageRange.end}`}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}

                  {searchQuery.length > 1 && searchResults.length === 0 && (
                    <p className="text-sm text-gray-400 mt-3">No matching TOC entries found.</p>
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center p-8">
                <span className="text-4xl mb-3">👈</span>
                <h3 className="text-sm font-medium text-white mb-1">Select a Mapping</h3>
                <p className="text-xs text-gray-400">
                  Click on a mapping to review and correct it.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-700 bg-gray-800 flex items-center justify-between">
          <p className="text-xs text-gray-400">
            Gold mappings improve future matches
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </>
  );
};

// Mapping List Item
const MappingListItem: React.FC<{
  mapping: ObjectiveMapping;
  isActive: boolean;
  onClick: () => void;
  onAccept: () => void;
  onReject: () => void;
}> = ({ mapping, isActive, onClick, onAccept, onReject }) => {
  const statusStyles: Record<string, { bg: string; text: string; label: string }> = {
    needs_review: {
      bg: 'bg-red-900/30',
      text: 'text-red-400',
      label: 'Needs Review',
    },
    suggested_review: {
      bg: 'bg-amber-900/30',
      text: 'text-amber-400',
      label: 'Suggested',
    },
    auto_accepted: {
      bg: 'bg-green-900/30',
      text: 'text-green-400',
      label: 'Auto-Accepted',
    },
    gold: {
      bg: 'bg-purple-900/30',
      text: 'text-purple-400',
      label: 'Gold',
    },
  };

  const style = statusStyles[mapping.status] || statusStyles.needs_review;

  return (
    <div
      className={`
        p-3 cursor-pointer transition-colors
        ${isActive ? 'bg-gray-800' : 'hover:bg-gray-800/50'}
      `}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white truncate">
            {mapping.objectiveId}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-xs ${style.text}`}>{style.label}</span>
            <ConfidenceBadge score={mapping.confidenceScore} compact />
          </div>
        </div>

        <div className="flex items-center gap-1 ml-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAccept();
            }}
            className="p-1 hover:bg-green-900/50 rounded text-green-400"
            title="Accept"
          >
            ✓
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onReject();
            }}
            className="p-1 hover:bg-red-900/50 rounded text-red-400"
            title="Reject"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
};

// Confidence Badge
const ConfidenceBadge: React.FC<{ score: number; compact?: boolean }> = ({
  score,
  compact = false,
}) => {
  const percent = Math.round(score * 100);
  const color =
    score >= 0.72 ? 'text-green-400' :
    score >= 0.55 ? 'text-amber-400' : 'text-red-400';

  if (compact) {
    return <span className={`text-xs ${color}`}>{percent}%</span>;
  }

  return (
    <span className={`text-xs px-2 py-0.5 rounded ${color} bg-gray-700`}>
      {percent}% confidence
    </span>
  );
};

export default MappingReviewDrawer;
