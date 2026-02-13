// components/cognitiveEngine/ExpertModePanel.tsx
// Expert Mode: Shows only clusters, pearls, decision rules, risk signals
// Removes paragraphs and long explanations - trains pattern recognition like a specialist

import React from 'react';
import type {
  ClinicalInsight,
  DecisionRule,
  ExpertModeConfig,
} from '../../lib/cognitiveEngine/types';
import type { ConceptCluster, Pearl } from '../../lib/surgeonView2/types';

interface ExpertModePanelProps {
  config: ExpertModeConfig;
  clusters: ConceptCluster[];
  pearls: Pearl[];
  insights: ClinicalInsight[];
  decisionRules: DecisionRule[];
  onInsightClick: (insight: ClinicalInsight) => void;
  onRuleClick: (rule: DecisionRule) => void;
  onConfigChange: (config: Partial<ExpertModeConfig>) => void;
}

export const ExpertModePanel: React.FC<ExpertModePanelProps> = ({
  config,
  clusters,
  pearls,
  insights,
  decisionRules,
  onInsightClick,
  onRuleClick,
  onConfigChange,
}) => {
  // Filter insights by priority
  const filteredInsights = insights.filter((insight) => {
    const priorityOrder = { high: 3, medium: 2, low: 1 };
    const minPriorityValue = priorityOrder[config.minPriority];
    const insightPriorityValue = priorityOrder[insight.masteryLevel === 'expert' ? 'high' : insight.masteryLevel === 'proficient' ? 'medium' : 'low'];
    return insightPriorityValue >= minPriorityValue;
  });

  // Filter to high-yield insights
  const highYieldInsights = filteredInsights.filter(
    (i) => i.clinicalPearl || i.riskSignal || i.decisionRule
  );

  // Active decision rules
  const activeRules = decisionRules.filter((r) => r.isActive);

  return (
    <div className="flex flex-col h-full bg-gray-900 text-white">
      {/* Header */}
      <div className="p-4 border-b border-gray-700 bg-gradient-to-r from-purple-900 to-blue-900">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🎯</span>
            <div>
              <h2 className="font-bold text-white">EXPERT MODE</h2>
              <p className="text-xs text-gray-300">Pattern Recognition Training</p>
            </div>
          </div>
          <PriorityFilter
            value={config.minPriority}
            onChange={(minPriority) => onConfigChange({ minPriority })}
          />
        </div>
      </div>

      {/* Toggle Controls */}
      <div className="p-3 bg-gray-800 border-b border-gray-700 flex flex-wrap gap-2">
        <ToggleChip
          label="Clusters"
          icon="📦"
          active={config.showClusters}
          onClick={() => onConfigChange({ showClusters: !config.showClusters })}
        />
        <ToggleChip
          label="Pearls"
          icon="💎"
          active={config.showPearls}
          onClick={() => onConfigChange({ showPearls: !config.showPearls })}
        />
        <ToggleChip
          label="Rules"
          icon="⚡"
          active={config.showDecisionRules}
          onClick={() => onConfigChange({ showDecisionRules: !config.showDecisionRules })}
        />
        <ToggleChip
          label="Risks"
          icon="⚠️"
          active={config.showRiskSignals}
          onClick={() => onConfigChange({ showRiskSignals: !config.showRiskSignals })}
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Clusters Section */}
        {config.showClusters && clusters.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
              <span>📦</span> Concept Clusters
            </h3>
            <div className="space-y-2">
              {clusters.map((cluster) => (
                <ClusterCard key={cluster.id} cluster={cluster} />
              ))}
            </div>
          </section>
        )}

        {/* Pearls Section */}
        {config.showPearls && pearls.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
              <span>💎</span> Clinical Pearls
            </h3>
            <div className="space-y-2">
              {pearls.map((pearl) => (
                <PearlCard key={pearl.id} pearl={pearl} />
              ))}
            </div>
          </section>
        )}

        {/* Decision Rules Section */}
        {config.showDecisionRules && activeRules.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
              <span>⚡</span> Decision Rules
            </h3>
            <div className="space-y-2">
              {activeRules.map((rule) => (
                <RuleCard key={rule.id} rule={rule} onClick={() => onRuleClick(rule)} />
              ))}
            </div>
          </section>
        )}

        {/* Risk Signals Section */}
        {config.showRiskSignals && (
          <section>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
              <span>⚠️</span> Risk Signals
            </h3>
            <div className="space-y-2">
              {highYieldInsights
                .filter((i) => i.riskSignal)
                .map((insight) => (
                  <RiskCard
                    key={insight.id}
                    insight={insight}
                    onClick={() => onInsightClick(insight)}
                  />
                ))}
            </div>
          </section>
        )}

        {/* High-Yield Insights */}
        <section>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
            <span>🎯</span> High-Yield Patterns
          </h3>
          <div className="space-y-2">
            {highYieldInsights.slice(0, 10).map((insight) => (
              <PatternCard
                key={insight.id}
                insight={insight}
                onClick={() => onInsightClick(insight)}
              />
            ))}
          </div>
        </section>

        {/* Empty State */}
        {highYieldInsights.length === 0 && clusters.length === 0 && pearls.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <span className="text-4xl mb-3">🔬</span>
            <h3 className="text-lg font-medium text-white mb-1">No patterns detected</h3>
            <p className="text-sm text-gray-400 max-w-sm">
              Navigate through the document to identify patterns and build your expert knowledge base.
            </p>
          </div>
        )}
      </div>

      {/* Stats Footer */}
      <div className="p-3 bg-gray-800 border-t border-gray-700 flex items-center justify-around text-center">
        <StatBadge value={clusters.length} label="Clusters" />
        <StatBadge value={pearls.length} label="Pearls" />
        <StatBadge value={activeRules.length} label="Rules" />
        <StatBadge value={highYieldInsights.filter((i) => i.riskSignal).length} label="Risks" />
      </div>
    </div>
  );
};

// Toggle Chip
const ToggleChip: React.FC<{
  label: string;
  icon: string;
  active: boolean;
  onClick: () => void;
}> = ({ label, icon, active, onClick }) => (
  <button
    onClick={onClick}
    className={`
      flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium transition-colors
      ${active
        ? 'bg-purple-600 text-white'
        : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
      }
    `}
  >
    <span>{icon}</span>
    <span>{label}</span>
  </button>
);

// Priority Filter
const PriorityFilter: React.FC<{
  value: ExpertModeConfig['minPriority'];
  onChange: (value: ExpertModeConfig['minPriority']) => void;
}> = ({ value, onChange }) => (
  <div className="flex items-center gap-1">
    {(['low', 'medium', 'high'] as const).map((priority) => (
      <button
        key={priority}
        onClick={() => onChange(priority)}
        className={`
          w-6 h-6 rounded-full text-xs font-bold transition-colors
          ${value === priority
            ? priority === 'high' ? 'bg-red-500 text-white'
            : priority === 'medium' ? 'bg-yellow-500 text-white'
            : 'bg-gray-500 text-white'
            : 'bg-gray-700 text-gray-500 hover:bg-gray-600'
          }
        `}
      >
        {priority[0].toUpperCase()}
      </button>
    ))}
  </div>
);

// Cluster Card
const ClusterCard: React.FC<{ cluster: ConceptCluster }> = ({ cluster }) => (
  <div className="bg-gray-800 rounded-lg p-3 border border-gray-700">
    <div className="flex items-center justify-between">
      <h4 className="font-medium text-white">{cluster.title}</h4>
      <span className="text-xs text-gray-400">
        {cluster.conceptIds.length} concepts
      </span>
    </div>
    {cluster.subtitle && (
      <p className="text-sm text-gray-400 mt-1">{cluster.subtitle}</p>
    )}
  </div>
);

// Pearl Card
const PearlCard: React.FC<{ pearl: Pearl }> = ({ pearl }) => (
  <div className="bg-amber-900/30 rounded-lg p-3 border border-amber-700/50">
    <div className="flex items-start gap-2">
      <span className="text-lg">💎</span>
      <div>
        <p className="text-sm text-amber-100">{pearl.content}</p>
        <div className="flex gap-1 mt-2">
          {pearl.tags.slice(0, 3).map((tag, idx) => (
            <span
              key={idx}
              className="text-xs px-2 py-0.5 bg-amber-900/50 rounded text-amber-300"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  </div>
);

// Rule Card
const RuleCard: React.FC<{ rule: DecisionRule; onClick: () => void }> = ({ rule, onClick }) => (
  <button
    onClick={onClick}
    className="w-full text-left bg-green-900/30 rounded-lg p-3 border border-green-700/50 hover:bg-green-900/50 transition-colors"
  >
    <div className="text-sm space-y-1">
      <div className="flex gap-2">
        <span className="font-semibold text-green-400">IF:</span>
        <span className="text-green-100">{rule.ifCondition.slice(0, 50)}...</span>
      </div>
      <div className="flex gap-2">
        <span className="font-semibold text-green-400">THEN:</span>
        <span className="text-green-100">{rule.thenAction.slice(0, 50)}...</span>
      </div>
    </div>
    <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
      <span>Applied {rule.timesApplied}x</span>
      <span>•</span>
      <span>{Math.round(rule.successRate)}% success</span>
    </div>
  </button>
);

// Risk Card
const RiskCard: React.FC<{ insight: ClinicalInsight; onClick: () => void }> = ({ insight, onClick }) => (
  <button
    onClick={onClick}
    className="w-full text-left bg-red-900/30 rounded-lg p-3 border border-red-700/50 hover:bg-red-900/50 transition-colors"
  >
    <div className="flex items-start gap-2">
      <span className="text-lg">⚠️</span>
      <div>
        <p className="text-sm text-red-100">{insight.riskSignal}</p>
        <p className="text-xs text-red-300 mt-1">Related: {insight.concept}</p>
      </div>
    </div>
  </button>
);

// Pattern Card
const PatternCard: React.FC<{ insight: ClinicalInsight; onClick: () => void }> = ({ insight, onClick }) => (
  <button
    onClick={onClick}
    className="w-full text-left bg-gray-800 rounded-lg p-3 border border-gray-700 hover:border-purple-500 transition-colors"
  >
    <div className="flex items-center justify-between mb-1">
      <span className="text-sm font-medium text-white">{insight.concept}</span>
      <MasteryDots level={insight.masteryLevel} />
    </div>
    {insight.clinicalPearl && (
      <p className="text-xs text-amber-300 mt-1">💎 {insight.clinicalPearl.slice(0, 60)}...</p>
    )}
  </button>
);

// Mastery Dots
const MasteryDots: React.FC<{ level: string }> = ({ level }) => {
  const levels = ['novice', 'developing', 'competent', 'proficient', 'expert'];
  const idx = levels.indexOf(level);

  return (
    <div className="flex gap-0.5">
      {levels.map((_, i) => (
        <div
          key={i}
          className={`w-1.5 h-1.5 rounded-full ${
            i <= idx ? 'bg-purple-400' : 'bg-gray-600'
          }`}
        />
      ))}
    </div>
  );
};

// Stat Badge
const StatBadge: React.FC<{ value: number; label: string }> = ({ value, label }) => (
  <div>
    <div className="text-lg font-bold text-white">{value}</div>
    <div className="text-xs text-gray-400">{label}</div>
  </div>
);

export default ExpertModePanel;
