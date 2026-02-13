// components/cognitiveEngine/ClinicalIQDashboard.tsx
// Clinical IQ Progress Dashboard
// Tracks pattern recognition, reasoning quality, decision rules, exam success

import React from 'react';
import type { ClinicalIQProfile, MasteryLevel, WeakCluster } from '../../lib/cognitiveEngine/types';

interface ClinicalIQDashboardProps {
  profile: ClinicalIQProfile;
  onWeakClusterClick: (cluster: WeakCluster) => void;
}

export const ClinicalIQDashboard: React.FC<ClinicalIQDashboardProps> = ({
  profile,
  onWeakClusterClick,
}) => {
  return (
    <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-xl p-6 space-y-6">
      {/* Header with Clinical IQ Score */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Clinical IQ</h2>
          <p className="text-sm text-gray-500">Your cognitive performance metrics</p>
        </div>
        <div className="text-center">
          <div className="text-4xl font-bold text-purple-600">
            {profile.clinicalIQScore}
          </div>
          <div className="text-xs text-gray-500 uppercase tracking-wide">IQ Score</div>
        </div>
      </div>

      {/* Expert Thinking Level */}
      <div className="bg-white rounded-lg p-4 border border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-gray-700">Expert Thinking Level</span>
          <MasteryBadgeLarge level={profile.expertThinkingLevel} />
        </div>
        <MasteryProgressBar level={profile.expertThinkingLevel} />
      </div>

      {/* Skill Metrics Grid */}
      <div className="grid grid-cols-2 gap-3">
        <SkillMetricCard
          label="Pattern Recognition"
          score={profile.patternRecognition.score}
          trend={profile.patternRecognition.trend}
          icon="🔍"
        />
        <SkillMetricCard
          label="Reasoning Quality"
          score={profile.reasoningQuality.score}
          trend={profile.reasoningQuality.trend}
          icon="🧠"
        />
        <SkillMetricCard
          label="Decision Rules"
          score={profile.decisionRuleUsage.score}
          trend={profile.decisionRuleUsage.trend}
          icon="⚡"
        />
        <SkillMetricCard
          label="Exam Application"
          score={profile.examApplicationSuccess.score}
          trend={profile.examApplicationSuccess.trend}
          icon="📝"
        />
      </div>

      {/* Stats Row */}
      <div className="flex items-center justify-around py-3 bg-white rounded-lg border border-gray-200">
        <StatItem
          value={profile.totalPatternsRecognized}
          label="Patterns"
          icon="🔬"
        />
        <div className="w-px h-8 bg-gray-200" />
        <StatItem
          value={profile.totalDecisionRulesCreated}
          label="Rules"
          icon="📋"
        />
        <div className="w-px h-8 bg-gray-200" />
        <StatItem
          value={profile.progressHistory.length}
          label="Sessions"
          icon="📊"
        />
      </div>

      {/* Weak Clusters Alert */}
      {profile.weakClusters.length > 0 && (
        <div className="bg-red-50 rounded-lg border border-red-200 p-4">
          <h3 className="text-sm font-semibold text-red-700 mb-2 flex items-center gap-1">
            <span>⚠️</span> Weak Cluster Alerts
          </h3>
          <div className="space-y-2">
            {profile.weakClusters.map((cluster) => (
              <button
                key={cluster.clusterId}
                onClick={() => onWeakClusterClick(cluster)}
                className="w-full text-left p-2 bg-white rounded border border-red-100 hover:border-red-300 transition-colors"
              >
                <div className="font-medium text-gray-900 text-sm">
                  {cluster.clusterName}
                </div>
                <div className="text-xs text-gray-500">
                  Weakness: {cluster.weakness} • {cluster.recommendedAction}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Motivational Message */}
      <MotivationalMessage profile={profile} />
    </div>
  );
};

// Skill Metric Card
const SkillMetricCard: React.FC<{
  label: string;
  score: number;
  trend: 'improving' | 'stable' | 'declining';
  icon: string;
}> = ({ label, score, trend, icon }) => {
  const trendColors = {
    improving: 'text-green-500',
    stable: 'text-gray-400',
    declining: 'text-red-500',
  };

  const trendIcons = {
    improving: '↑',
    stable: '→',
    declining: '↓',
  };

  return (
    <div className="bg-white rounded-lg p-3 border border-gray-200">
      <div className="flex items-center justify-between mb-2">
        <span className="text-lg">{icon}</span>
        <span className={`text-sm font-medium ${trendColors[trend]}`}>
          {trendIcons[trend]}
        </span>
      </div>
      <div className="text-2xl font-bold text-gray-900">{score}</div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            score >= 70 ? 'bg-green-500' : score >= 40 ? 'bg-yellow-500' : 'bg-red-500'
          }`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
};

// Stat Item
const StatItem: React.FC<{
  value: number;
  label: string;
  icon: string;
}> = ({ value, label, icon }) => (
  <div className="text-center">
    <div className="text-lg mb-0.5">{icon}</div>
    <div className="text-xl font-bold text-gray-900">{value}</div>
    <div className="text-xs text-gray-500">{label}</div>
  </div>
);

// Mastery Badge Large
const MasteryBadgeLarge: React.FC<{ level: MasteryLevel }> = ({ level }) => {
  const config: Record<MasteryLevel, { bg: string; text: string; label: string }> = {
    novice: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Novice' },
    developing: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Developing' },
    competent: { bg: 'bg-green-100', text: 'text-green-700', label: 'Competent' },
    proficient: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Proficient' },
    expert: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Expert' },
  };

  const c = config[level];

  return (
    <span className={`px-3 py-1 rounded-full text-sm font-semibold ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
};

// Mastery Progress Bar
const MasteryProgressBar: React.FC<{ level: MasteryLevel }> = ({ level }) => {
  const levels: MasteryLevel[] = ['novice', 'developing', 'competent', 'proficient', 'expert'];
  const currentIndex = levels.indexOf(level);

  return (
    <div className="flex items-center gap-1">
      {levels.map((l, idx) => (
        <div key={l} className="flex-1 flex flex-col items-center">
          <div
            className={`w-full h-2 rounded-full ${
              idx <= currentIndex
                ? idx === currentIndex
                  ? 'bg-purple-500'
                  : 'bg-purple-300'
                : 'bg-gray-200'
            }`}
          />
          <span className="text-xs text-gray-400 mt-1 capitalize hidden sm:block">
            {l.slice(0, 3)}
          </span>
        </div>
      ))}
    </div>
  );
};

// Motivational Message
const MotivationalMessage: React.FC<{ profile: ClinicalIQProfile }> = ({ profile }) => {
  const getMessage = () => {
    if (profile.clinicalIQScore >= 150) {
      return { emoji: '🌟', message: 'You think like a clinician!' };
    }
    if (profile.clinicalIQScore >= 120) {
      return { emoji: '🚀', message: 'Your clinical reasoning is advancing rapidly!' };
    }
    if (profile.reasoningQuality.trend === 'improving') {
      return { emoji: '📈', message: 'Great progress! Keep building those reasoning skills.' };
    }
    if (profile.totalPatternsRecognized > 50) {
      return { emoji: '🔬', message: 'Strong pattern recognition! Focus on application next.' };
    }
    return { emoji: '💪', message: 'Every insight builds expertise. Keep going!' };
  };

  const { emoji, message } = getMessage();

  return (
    <div className="text-center py-3 px-4 bg-gradient-to-r from-purple-100 to-blue-100 rounded-lg">
      <span className="text-2xl mr-2">{emoji}</span>
      <span className="text-sm font-medium text-gray-800">{message}</span>
    </div>
  );
};

export default ClinicalIQDashboard;
