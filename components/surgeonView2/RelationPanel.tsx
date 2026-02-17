// components/surgeonView2/RelationPanel.tsx
// Main panel: Relation list grouped by cluster

import React from 'react';
import type { Concept, Relation, PatternCluster } from '@/lib/relationshipSchema/types';

interface Chain {
  id: string;
  title: string;
  relations: Relation[];
  concepts: Concept[];
}

interface RelationPanelProps {
  relations: Relation[];
  concepts: Record<string, Concept>;
  chains: Chain[];
  selectedRelationId?: string;
  selectedCluster: PatternCluster | null;
  expertMode: boolean;
  onRelationClick: (relation: Relation) => void;
  onJumpToPage: (page: number) => void;
}

export const RelationPanel: React.FC<RelationPanelProps> = ({
  relations,
  concepts,
  chains,
  selectedRelationId,
  selectedCluster,
  expertMode,
  onRelationClick,
  onJumpToPage,
}) => {
  // Minimal empty state - not a developer error message
  if (relations.length === 0) {
    return (
      <div className="p-4">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-2">
          {selectedCluster ? selectedCluster.title : 'Relations'}
        </h2>
        <p className="text-xs text-gray-500 italic">
          {selectedCluster
            ? 'Select another cluster or extract more content.'
            : 'Extract a page to discover concept relationships.'
          }
        </p>
      </div>
    );
  }

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
            {selectedCluster ? selectedCluster.title : 'All Relations'}
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            {relations.length} relation{relations.length !== 1 ? 's' : ''}
            {chains.length > 0 && ` • ${chains.length} chain${chains.length !== 1 ? 's' : ''}`}
          </p>
        </div>
      </div>

      {/* Chains (if any) */}
      {chains.length > 0 && (
        <div className="mb-6">
          <h3 className="text-xs font-semibold text-teal-400 uppercase tracking-wide mb-3">
            Causal/Process Chains
          </h3>
          <div className="space-y-3">
            {chains.map((chain) => (
              <ChainCard
                key={chain.id}
                chain={chain}
                concepts={concepts}
                expertMode={expertMode}
                selectedRelationId={selectedRelationId}
                onRelationClick={onRelationClick}
                onJumpToPage={onJumpToPage}
              />
            ))}
          </div>
        </div>
      )}

      {/* Relations List */}
      <div className="space-y-2">
        {relations.map((relation) => (
          <RelationCard
            key={relation.id}
            relation={relation}
            subject={concepts[relation.subjId]}
            object={concepts[relation.objId]}
            isSelected={selectedRelationId === relation.id}
            expertMode={expertMode}
            onClick={() => onRelationClick(relation)}
            onJumpToPage={onJumpToPage}
          />
        ))}
      </div>
    </div>
  );
};

// Chain Card
const ChainCard: React.FC<{
  chain: Chain;
  concepts: Record<string, Concept>;
  expertMode: boolean;
  selectedRelationId?: string;
  onRelationClick: (relation: Relation) => void;
  onJumpToPage: (page: number) => void;
}> = ({ chain, concepts, expertMode, selectedRelationId, onRelationClick, onJumpToPage }) => {
  return (
    <div className="p-3 bg-gradient-to-r from-teal-900/30 to-gray-800 rounded-lg border border-teal-700/50">
      <h4 className="text-sm font-medium text-teal-300 mb-2 flex items-center gap-2">
        <span>🔗</span>
        {chain.title}
      </h4>

      {/* Chain visualization */}
      <div className="flex flex-wrap items-center gap-1 text-sm">
        {chain.relations.map((rel, idx) => {
          const subj = concepts[rel.subjId];
          const obj = concepts[rel.objId];
          return (
            <React.Fragment key={rel.id}>
              {idx === 0 && (
                <ConceptBadge concept={subj} onClick={() => onRelationClick(rel)} />
              )}
              <span className="text-gray-400 px-1">→</span>
              <PredicateBadge predicate={rel.predicate} />
              <span className="text-gray-400 px-1">→</span>
              <ConceptBadge concept={obj} onClick={() => onRelationClick(rel)} />
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

// Relation Card
const RelationCard: React.FC<{
  relation: Relation;
  subject?: Concept;
  object?: Concept;
  isSelected: boolean;
  expertMode: boolean;
  onClick: () => void;
  onJumpToPage: (page: number) => void;
}> = ({ relation, subject, object, isSelected, expertMode, onClick, onJumpToPage }) => {
  const page = relation.evidence[0]?.page;
  const quote = relation.evidence[0]?.quote;

  return (
    <div
      className={`
        p-3 rounded-lg cursor-pointer transition-all border
        ${isSelected
          ? 'bg-teal-900/30 border-teal-500'
          : 'bg-gray-800/50 border-gray-700 hover:border-gray-600'
        }
      `}
      onClick={onClick}
    >
      {/* Triple: Subject → Predicate → Object */}
      <div className="flex items-center gap-2 flex-wrap">
        <ConceptBadge concept={subject} />
        <PredicateBadge predicate={relation.predicate} />
        <ConceptBadge concept={object} />

        {/* Confidence */}
        <ConfidenceDot value={relation.confidence} />
      </div>

      {/* Evidence quote (hidden in expert mode) */}
      {!expertMode && quote && (
        <p className="text-xs text-gray-400 mt-2 italic line-clamp-2">
          &quot;{quote}&quot;
        </p>
      )}

      {/* Footer: Page anchor & modality */}
      <div className="flex items-center gap-2 mt-2 text-xs">
        {page !== undefined && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onJumpToPage(page);
            }}
            className="px-2 py-0.5 bg-teal-900/40 text-teal-400 hover:text-teal-300 hover:bg-teal-900/60 rounded transition-colors flex items-center gap-1"
          >
            <span>📄</span>
            <span>p.{page}</span>
          </button>
        )}
        {relation.modality && (
          <span className="text-gray-500 italic">{relation.modality}</span>
        )}
        {relation.evidence[0]?.spanHash && (
          <span className="text-gray-600 text-[10px] font-mono">
            #{relation.evidence[0].spanHash.slice(-6)}
          </span>
        )}
      </div>
    </div>
  );
};

// Concept Badge
const ConceptBadge: React.FC<{ concept?: Concept; onClick?: () => void }> = ({ concept, onClick }) => {
  if (!concept) return <span className="text-gray-500">?</span>;

  const typeColors: Record<string, string> = {
    entity: 'bg-blue-900/50 text-blue-300 border-blue-700',
    process: 'bg-green-900/50 text-green-300 border-green-700',
    finding: 'bg-purple-900/50 text-purple-300 border-purple-700',
    risk: 'bg-red-900/50 text-red-300 border-red-700',
    tool: 'bg-amber-900/50 text-amber-300 border-amber-700',
    definition: 'bg-gray-700 text-gray-300 border-gray-600',
  };

  const color = typeColors[concept.type] || typeColors.definition;

  return (
    <span
      className={`px-2 py-0.5 rounded text-sm font-medium border ${color} ${onClick ? 'cursor-pointer hover:opacity-80' : ''}`}
      onClick={onClick}
    >
      {concept.label}
    </span>
  );
};

// Predicate Badge
const PredicateBadge: React.FC<{ predicate: string }> = ({ predicate }) => {
  // Format predicate for display
  const display = predicate.replace(/_/g, ' ');

  return (
    <span className="px-2 py-0.5 bg-gray-700 text-gray-300 rounded text-xs font-mono">
      {display}
    </span>
  );
};

// Confidence Dot
const ConfidenceDot: React.FC<{ value: number }> = ({ value }) => {
  const percent = Math.round(value * 100);
  const color = percent >= 80 ? 'bg-green-500' : percent >= 60 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <span
      className={`w-2 h-2 rounded-full ${color} ml-auto`}
      title={`${percent}% confidence`}
    />
  );
};

export default RelationPanel;
