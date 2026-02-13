// components/surgeonView2/InsightOverlay.tsx
// Right overlay: Insight panel (appears on click)
// Shows: Why it matters, Clinical pearl, Trap, Related clusters, Jump-to-source

import React from 'react';
import type { Concept, Relation, PatternCluster, DecisionRule } from '@/lib/relationshipSchema/types';

interface InsightOverlayProps {
  targetType: 'relation' | 'cluster' | 'rule';
  targetId: string;
  relation?: Relation;
  cluster?: PatternCluster;
  rule?: DecisionRule;
  concepts: Record<string, Concept>;
  relations: Record<string, Relation>;
  clusters: Record<string, PatternCluster>;
  onClose: () => void;
  onJumpToPage: (page: number) => void;
}

export const InsightOverlay: React.FC<InsightOverlayProps> = ({
  targetType,
  targetId,
  relation,
  cluster,
  rule,
  concepts,
  relations,
  clusters,
  onClose,
  onJumpToPage,
}) => {
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
      />

      {/* Overlay Panel */}
      <div className="fixed right-0 top-0 bottom-0 w-96 bg-gray-900 border-l border-gray-700 z-50 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="p-4 border-b border-gray-700 bg-gradient-to-r from-purple-900/50 to-gray-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl">💡</span>
              <h2 className="font-bold text-white">
                {targetType === 'relation' && 'Relation Insight'}
                {targetType === 'cluster' && 'Cluster Insight'}
                {targetType === 'rule' && 'Decision Rule'}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
            >
              <span className="text-gray-400 text-xl">×</span>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {targetType === 'relation' && relation && (
            <RelationInsight
              relation={relation}
              concepts={concepts}
              clusters={clusters}
              onJumpToPage={onJumpToPage}
            />
          )}

          {targetType === 'cluster' && cluster && (
            <ClusterInsight
              cluster={cluster}
              concepts={concepts}
              relations={relations}
              onJumpToPage={onJumpToPage}
            />
          )}

          {targetType === 'rule' && rule && (
            <RuleInsight
              rule={rule}
              concepts={concepts}
              onJumpToPage={onJumpToPage}
            />
          )}
        </div>
      </div>
    </>
  );
};

// Relation Insight
const RelationInsight: React.FC<{
  relation: Relation;
  concepts: Record<string, Concept>;
  clusters: Record<string, PatternCluster>;
  onJumpToPage: (page: number) => void;
}> = ({ relation, concepts, clusters, onJumpToPage }) => {
  const subject = concepts[relation.subjId];
  const object = concepts[relation.objId];

  // Find clusters containing this relation
  const relatedClusters = Object.values(clusters).filter(c =>
    c.relationIds.includes(relation.id)
  );

  // Generate "why it matters" based on predicate
  const whyItMatters = generateWhyItMatters(relation, subject, object);
  const clinicalPearl = generateClinicalPearl(relation, subject, object);
  const trap = generateTrap(relation, subject, object);

  return (
    <div className="space-y-6">
      {/* Relation Display */}
      <div className="p-4 bg-gray-800 rounded-lg">
        <div className="flex items-center gap-2 flex-wrap text-lg">
          <span className="text-blue-300">{subject?.label || 'Unknown'}</span>
          <span className="text-gray-400">→</span>
          <span className="text-amber-400 font-mono text-sm">{relation.predicate.replace(/_/g, ' ')}</span>
          <span className="text-gray-400">→</span>
          <span className="text-green-300">{object?.label || 'Unknown'}</span>
        </div>
        <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
          <ConfidenceBadge value={relation.confidence} />
          {relation.modality && <span>({relation.modality})</span>}
        </div>
      </div>

      {/* Why It Matters */}
      <InsightSection title="Why It Matters" icon="🎯" color="teal">
        <p className="text-gray-300">{whyItMatters}</p>
      </InsightSection>

      {/* Clinical Pearl */}
      {clinicalPearl && (
        <InsightSection title="Clinical Pearl" icon="💎" color="purple">
          <p className="text-gray-300">{clinicalPearl}</p>
        </InsightSection>
      )}

      {/* Trap */}
      {trap && (
        <InsightSection title="Common Trap" icon="⚠️" color="red">
          <p className="text-gray-300">{trap}</p>
        </InsightSection>
      )}

      {/* Related Clusters */}
      {relatedClusters.length > 0 && (
        <InsightSection title="Related Clusters" icon="📊" color="blue">
          <div className="space-y-2">
            {relatedClusters.map(c => (
              <div key={c.id} className="p-2 bg-gray-800 rounded text-sm">
                <span className="text-blue-300">{c.title}</span>
                <span className="text-gray-500 ml-2">({c.kind})</span>
              </div>
            ))}
          </div>
        </InsightSection>
      )}

      {/* Evidence / Jump to Source */}
      {relation.evidence.length > 0 && (
        <InsightSection title="Source Evidence" icon="📖" color="gray">
          <div className="space-y-2">
            {relation.evidence.map((ref, idx) => (
              <div key={idx} className="p-2 bg-gray-800 rounded">
                {ref.quote && (
                  <p className="text-xs text-gray-400 italic mb-2">&quot;{ref.quote}&quot;</p>
                )}
                <button
                  onClick={() => onJumpToPage(ref.page)}
                  className="text-sm text-teal-400 hover:text-teal-300 flex items-center gap-1"
                >
                  <span>📄</span>
                  Jump to page {ref.page}
                </button>
              </div>
            ))}
          </div>
        </InsightSection>
      )}
    </div>
  );
};

// Cluster Insight
const ClusterInsight: React.FC<{
  cluster: PatternCluster;
  concepts: Record<string, Concept>;
  relations: Record<string, Relation>;
  onJumpToPage: (page: number) => void;
}> = ({ cluster, concepts, relations, onJumpToPage }) => {
  const clusterRelations = cluster.relationIds
    .map(id => relations[id])
    .filter(Boolean);

  return (
    <div className="space-y-6">
      {/* Cluster Header */}
      <div className="p-4 bg-gray-800 rounded-lg">
        <h3 className="text-lg font-bold text-white">{cluster.title}</h3>
        <div className="flex items-center gap-2 mt-2 text-xs">
          <span className="px-2 py-0.5 bg-purple-900/50 text-purple-300 rounded">
            {cluster.kind}
          </span>
          <span className="text-gray-400">
            {cluster.relationIds.length} relations
          </span>
          <ConfidenceBadge value={cluster.confidence} />
        </div>
      </div>

      {/* Summary */}
      {cluster.summary && (
        <InsightSection title="Summary" icon="📝" color="teal">
          <p className="text-gray-300">{cluster.summary}</p>
        </InsightSection>
      )}

      {/* Relations in Cluster */}
      <InsightSection title="Relations" icon="🔗" color="blue">
        <div className="space-y-2">
          {clusterRelations.map(rel => {
            const subj = concepts[rel.subjId];
            const obj = concepts[rel.objId];
            return (
              <div key={rel.id} className="p-2 bg-gray-800 rounded text-sm">
                <span className="text-blue-300">{subj?.label}</span>
                <span className="text-gray-400 mx-2">→</span>
                <span className="text-amber-400">{rel.predicate.replace(/_/g, ' ')}</span>
                <span className="text-gray-400 mx-2">→</span>
                <span className="text-green-300">{obj?.label}</span>
              </div>
            );
          })}
        </div>
      </InsightSection>

      {/* Jump to Source */}
      {cluster.refs.length > 0 && (
        <InsightSection title="Sources" icon="📖" color="gray">
          <div className="flex flex-wrap gap-2">
            {cluster.refs.slice(0, 5).map((ref, idx) => (
              <button
                key={idx}
                onClick={() => onJumpToPage(ref.page)}
                className="px-2 py-1 bg-gray-800 text-teal-400 hover:text-teal-300 rounded text-sm"
              >
                p.{ref.page}
              </button>
            ))}
          </div>
        </InsightSection>
      )}
    </div>
  );
};

// Rule Insight
const RuleInsight: React.FC<{
  rule: DecisionRule;
  concepts: Record<string, Concept>;
  onJumpToPage: (page: number) => void;
}> = ({ rule, concepts, onJumpToPage }) => {
  return (
    <div className="space-y-6">
      {/* IF → THEN → CONFIRM */}
      <div className="space-y-3">
        <div className="p-3 bg-blue-900/30 rounded-lg border border-blue-700/50">
          <span className="text-xs font-bold text-blue-400 uppercase">IF</span>
          <p className="text-gray-300 mt-1">{rule.if.text}</p>
        </div>

        <div className="p-3 bg-green-900/30 rounded-lg border border-green-700/50">
          <span className="text-xs font-bold text-green-400 uppercase">THEN</span>
          <p className="text-gray-300 mt-1">{rule.then.text}</p>
        </div>

        <div className="p-3 bg-purple-900/30 rounded-lg border border-purple-700/50">
          <span className="text-xs font-bold text-purple-400 uppercase">CONFIRM</span>
          <p className="text-gray-300 mt-1">{rule.confirm.text}</p>
        </div>
      </div>

      {/* Tags */}
      {rule.tags && rule.tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {rule.tags.map(tag => (
            <span
              key={tag}
              className={`px-2 py-0.5 rounded text-xs font-medium ${getTagStyle(tag)}`}
            >
              {tag.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
      )}

      {/* Source */}
      {rule.refs.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {rule.refs.map((ref, idx) => (
            <button
              key={idx}
              onClick={() => onJumpToPage(ref.page)}
              className="px-2 py-1 bg-gray-800 text-teal-400 hover:text-teal-300 rounded text-sm"
            >
              p.{ref.page}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// Helper Components
const InsightSection: React.FC<{
  title: string;
  icon: string;
  color: string;
  children: React.ReactNode;
}> = ({ title, icon, color, children }) => {
  const colors: Record<string, string> = {
    teal: 'border-teal-700',
    purple: 'border-purple-700',
    red: 'border-red-700',
    blue: 'border-blue-700',
    gray: 'border-gray-700',
  };

  return (
    <div className={`border-l-2 ${colors[color] || colors.gray} pl-3`}>
      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
        <span>{icon}</span>
        {title}
      </h4>
      {children}
    </div>
  );
};

const ConfidenceBadge: React.FC<{ value: number }> = ({ value }) => {
  const percent = Math.round(value * 100);
  const color = percent >= 80 ? 'text-green-400' : percent >= 60 ? 'text-amber-400' : 'text-red-400';
  return <span className={`${color}`}>{percent}%</span>;
};

// Tag styles
function getTagStyle(tag: string): string {
  const styles: Record<string, string> = {
    'DAT': 'bg-blue-900/50 text-blue-300',
    'high_yield': 'bg-amber-900/50 text-amber-300',
    'trap': 'bg-red-900/50 text-red-300',
    'clinical_pearl': 'bg-purple-900/50 text-purple-300',
    'first_line': 'bg-green-900/50 text-green-300',
    'contraindicated': 'bg-red-900/50 text-red-300',
  };
  return styles[tag] || 'bg-gray-700 text-gray-300';
}

// Content generators (simplified - could be AI-enhanced)
function generateWhyItMatters(relation: Relation, subject?: Concept, object?: Concept): string {
  const subj = subject?.label || 'The subject';
  const obj = object?.label || 'the result';
  const pred = relation.predicate.replace(/_/g, ' ');

  const templates: Record<string, string> = {
    'causes': `Understanding that ${subj} ${pred} ${obj} helps predict outcomes and guide treatment decisions.`,
    'prevents': `Knowing that ${subj} ${pred} ${obj} is key for preventive care and risk management.`,
    'suggests': `Recognizing that ${subj} ${pred} ${obj} aids in differential diagnosis.`,
    'differentiates_into': `The differentiation pathway from ${subj} to ${obj} is fundamental to understanding tissue development.`,
    'treats': `${subj} treating ${obj} is clinically actionable information.`,
  };

  return templates[relation.predicate] ||
    `This relationship between ${subj} and ${obj} (${pred}) is clinically relevant for understanding the underlying mechanisms.`;
}

function generateClinicalPearl(relation: Relation, subject?: Concept, object?: Concept): string | null {
  // Only generate for certain predicates
  if (['treats', 'prevents', 'suggests', 'confirms'].includes(relation.predicate)) {
    const subj = subject?.label || 'This factor';
    return `Remember: ${subj} is a key indicator. When you see it, always consider its implications.`;
  }
  return null;
}

function generateTrap(relation: Relation, subject?: Concept, object?: Concept): string | null {
  if (['contraindicates', 'complicates'].includes(relation.predicate)) {
    const subj = subject?.label || 'This factor';
    const obj = object?.label || 'the outcome';
    return `Don't overlook ${subj} when considering ${obj}. Missing this connection is a common mistake.`;
  }
  return null;
}

export default InsightOverlay;
