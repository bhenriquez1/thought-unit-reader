/**
 * Learning Analytics Dashboard for Universal Pattern Butler Reader
 * Real-time visualization of learning progress, pattern mastery, and adaptive recommendations
 */

"use client";

import React, { useState, useEffect } from 'react';
import type { IntelligentUserModel, ModeRecommendation, LearningPrediction } from '@/lib/adaptiveLearning';

interface LearningAnalyticsDashboardProps {
  userModel: IntelligentUserModel;
  modeRecommendation: ModeRecommendation | null;
  onModeSwitch: (mode: 'exploration' | 'training' | 'butler') => void;
  onComplexityAdjust: (level: number) => void;
}

interface ProgressRingProps {
  value: number; // 0-1
  size?: number;
  strokeWidth?: number;
  color?: string;
  label?: string;
}

function ProgressRing({ value, size = 60, strokeWidth = 6, color = '#3b82f6', label }: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDasharray = `${circumference} ${circumference}`;
  const strokeDashoffset = circumference - value * circumference;

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          className="transform -rotate-90"
          width={size}
          height={size}
        >
          {/* Background circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#e5e7eb"
            strokeWidth={strokeWidth}
            fill="transparent"
          />
          {/* Progress circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="transparent"
            strokeDasharray={strokeDasharray}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-500 ease-in-out"
          />
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs font-bold" style={{ color }}>
            {Math.round(value * 100)}%
          </span>
        </div>
      </div>
      {label && <span className="text-xs text-gray-600 mt-1 text-center">{label}</span>}
    </div>
  );
}

function formatTime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

function formatStreak(days: number): string {
  if (days === 0) return 'Start today!';
  if (days === 1) return '1 day';
  return `${days} days`;
}

export default function LearningAnalyticsDashboard({
  userModel,
  modeRecommendation,
  onModeSwitch,
  onComplexityAdjust
}: LearningAnalyticsDashboardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedTab, setSelectedTab] = useState<'overview' | 'patterns' | 'progress' | 'insights'>('overview');

  // Calculate derived metrics
  const averagePatternMastery = Object.keys(userModel.patternStrengthScores).length > 0
    ? Object.values(userModel.patternStrengthScores).reduce((sum, score) => sum + score, 0) / Object.keys(userModel.patternStrengthScores).length
    : 0;

  const masteredPatternsCount = Object.values(userModel.patternStrengthScores).filter(score => score >= 80).length;
  const totalPatterns = Object.keys(userModel.patternStrengthScores).length;

  const engagementTrend = userModel.engagementTrends.slice(-5);
  const avgCompletionRate = engagementTrend.length > 0
    ? engagementTrend.reduce((sum, trend) => sum + trend.completionRate, 0) / engagementTrend.length
    : 0;

  const learningVelocityTrend = userModel.learningVelocity > 1 ? 'accelerating' : 
                               userModel.learningVelocity > 0.5 ? 'steady' : 'needs focus';

  if (!isExpanded) {
    return (
      <div className="bg-gradient-to-r from-indigo-100 via-purple-100 to-pink-100 border border-indigo-200 rounded-lg p-3">
        <button
          onClick={() => setIsExpanded(true)}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <span className="text-lg">📊</span>
            <div className="text-left">
              <h6 className="text-sm font-semibold text-indigo-800">Learning Analytics</h6>
              <div className="flex items-center gap-4 text-xs text-indigo-600">
                <span>Level: {userModel.experienceLevel}</span>
                <span>Confidence: {Math.round(userModel.confidence * 100)}%</span>
                <span>Streak: {userModel.streakData.currentStreak}d</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {modeRecommendation && modeRecommendation.confidence > 0.7 && (
              <div className="bg-yellow-200 text-yellow-800 px-2 py-1 rounded-full text-xs font-medium">
                💡 Suggestion
              </div>
            )}
            <div className="text-indigo-600">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white border border-indigo-200 rounded-lg shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-gradient-to-r from-indigo-50 to-purple-50 border-b border-indigo-200">
        <div className="flex items-center gap-3">
          <span className="text-xl">📊</span>
          <div>
            <h5 className="text-lg font-bold text-indigo-800">Learning Analytics</h5>
            <p className="text-xs text-indigo-600">Intelligent progress tracking and recommendations</p>
          </div>
        </div>
        
        <button
          onClick={() => setIsExpanded(false)}
          className="text-indigo-600 hover:text-indigo-500 p-1"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-gray-200">
        {[
          { id: 'overview', label: 'Overview', icon: '👁️' },
          { id: 'patterns', label: 'Patterns', icon: '🎯' },
          { id: 'progress', label: 'Progress', icon: '📈' },
          { id: 'insights', label: 'Insights', icon: '💡' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setSelectedTab(tab.id as any)}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              selectedTab === tab.id
                ? 'border-indigo-500 text-indigo-600 bg-indigo-50'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="p-4 max-h-80 overflow-y-auto">
        {/* OVERVIEW TAB */}
        {selectedTab === 'overview' && (
          <div className="space-y-4">
            {/* Key Metrics */}
            <div className="grid grid-cols-4 gap-4">
              <ProgressRing 
                value={userModel.confidence} 
                color="#3b82f6" 
                label="Confidence"
                size={50}
              />
              <ProgressRing 
                value={averagePatternMastery / 100} 
                color="#10b981" 
                label="Mastery"
                size={50}
              />
              <ProgressRing 
                value={userModel.recentSuccessRate} 
                color="#f59e0b" 
                label="Success Rate"
                size={50}
              />
              <ProgressRing 
                value={Math.min(1, userModel.learningVelocity / 2)} 
                color="#8b5cf6" 
                label="Velocity"
                size={50}
              />
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-3">
                <div className="text-xs text-indigo-600 mb-1">Learning Profile</div>
                <div className="text-sm font-semibold text-indigo-800">
                  {userModel.experienceLevel} • {userModel.learningStyle}
                </div>
                <div className="text-xs text-indigo-600 mt-1">
                  Total time: {formatTime(userModel.totalTimeSpent)}
                </div>
              </div>
              
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-3">
                <div className="text-xs text-emerald-600 mb-1">Current Streak</div>
                <div className="text-sm font-semibold text-emerald-800">
                  {formatStreak(userModel.streakData.currentStreak)}
                </div>
                <div className="text-xs text-emerald-600 mt-1">
                  Best: {formatStreak(userModel.streakData.longestStreak)}
                </div>
              </div>
            </div>

            {/* Mode Recommendation */}
            {modeRecommendation && modeRecommendation.confidence > 0.6 && (
              <div className="bg-gradient-to-r from-yellow-50 to-amber-50 border border-yellow-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <h6 className="text-sm font-semibold text-amber-700 flex items-center gap-2">
                    <span>💡</span> Smart Recommendation
                  </h6>
                  <div className="text-xs text-amber-600">
                    {Math.round(modeRecommendation.confidence * 100)}% confidence
                  </div>
                </div>
                
                <p className="text-sm text-amber-800 mb-2">
                  Switch to <strong>{modeRecommendation.recommendedMode}</strong> mode
                </p>
                
                <div className="text-xs text-amber-700 mb-3">
                  {modeRecommendation.reasons.slice(0, 2).map((reason, idx) => (
                    <div key={idx}>• {reason}</div>
                  ))}
                </div>
                
                <button
                  onClick={() => onModeSwitch(modeRecommendation.recommendedMode)}
                  className="w-full px-3 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded text-sm font-medium"
                >
                  Switch to {modeRecommendation.recommendedMode}
                </button>
              </div>
            )}
          </div>
        )}

        {/* PATTERNS TAB */}
        {selectedTab === 'patterns' && (
          <div className="space-y-4">
            {/* Pattern Summary */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <h6 className="text-sm font-semibold text-indigo-700">Pattern Mastery</h6>
                <div className="text-xs text-indigo-600">
                  {masteredPatternsCount}/{totalPatterns} mastered
                </div>
              </div>
              <div className="w-full bg-indigo-200 rounded-full h-2">
                <div 
                  className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${totalPatterns > 0 ? (masteredPatternsCount / totalPatterns) * 100 : 0}%` }}
                />
              </div>
            </div>

            {/* Top Patterns */}
            <div>
              <h6 className="text-sm font-semibold text-gray-700 mb-3">Strongest Patterns</h6>
              <div className="space-y-2">
                {userModel.preferredPatterns.slice(0, 3).map(patternId => {
                  const score = userModel.patternStrengthScores[patternId] || 0;
                  return (
                    <div key={patternId} className="flex items-center justify-between p-2 bg-green-50 border border-green-200 rounded">
                      <div className="text-sm font-medium text-green-700">
                        {patternId.replace('-', ' ')}
                      </div>
                      <div className="text-xs text-green-600">
                        {score}% mastery
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Struggling Patterns */}
            {userModel.strugglingPatterns.length > 0 && (
              <div>
                <h6 className="text-sm font-semibold text-gray-700 mb-3">Focus Areas</h6>
                <div className="space-y-2">
                  {userModel.strugglingPatterns.slice(0, 3).map(patternId => {
                    const score = userModel.patternStrengthScores[patternId] || 0;
                    return (
                      <div key={patternId} className="flex items-center justify-between p-2 bg-red-50 border border-red-200 rounded">
                        <div className="text-sm font-medium text-red-700">
                          {patternId.replace('-', ' ')}
                        </div>
                        <div className="text-xs text-red-600">
                          {score}% mastery
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* PROGRESS TAB */}
        {selectedTab === 'progress' && (
          <div className="space-y-4">
            {/* Learning Velocity */}
            <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <h6 className="text-sm font-semibold text-purple-700">Learning Velocity</h6>
                <div className={`text-xs px-2 py-1 rounded-full ${
                  learningVelocityTrend === 'accelerating' ? 'bg-green-200 text-green-800' :
                  learningVelocityTrend === 'steady' ? 'bg-blue-200 text-blue-800' :
                  'bg-orange-200 text-orange-800'
                }`}>
                  {learningVelocityTrend}
                </div>
              </div>
              <div className="text-xs text-purple-600">
                Current rate: {userModel.learningVelocity.toFixed(2)} improvements/hour
              </div>
            </div>

            {/* Complexity Level Control */}
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="flex items-center justify-between mb-3">
                <h6 className="text-sm font-semibold text-gray-700">Complexity Level</h6>
                <div className="text-xs text-gray-600">
                  {userModel.optimalComplexityLevel}/10
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Simple</span>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={userModel.optimalComplexityLevel}
                  onChange={(e) => onComplexityAdjust(parseInt(e.target.value))}
                  className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
                <span className="text-xs text-gray-500">Complex</span>
              </div>
            </div>

            {/* Recent Activity */}
            {engagementTrend.length > 0 && (
              <div>
                <h6 className="text-sm font-semibold text-gray-700 mb-3">Recent Activity</h6>
                <div className="space-y-2">
                  {engagementTrend.slice(-3).reverse().map((trend, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                      <div className="text-xs text-gray-600">
                        {new Date(trend.timestamp).toLocaleDateString()}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-xs text-gray-700">
                          {Math.round(trend.completionRate * 100)}% completion
                        </div>
                        <div className="text-xs text-gray-600">
                          {Math.round(trend.duration)}m
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* INSIGHTS TAB */}
        {selectedTab === 'insights' && (
          <div className="space-y-4">
            {/* Adaptation History */}
            <div>
              <h6 className="text-sm font-semibold text-gray-700 mb-3">Recent Adaptations</h6>
              <div className="space-y-2">
                {userModel.adaptationHistory.slice(-3).reverse().map((adaptation, idx) => (
                  <div key={idx} className="p-2 bg-indigo-50 border border-indigo-200 rounded text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-indigo-700">
                        {adaptation.type.replace('_', ' ')}
                      </span>
                      <span className="text-indigo-600">
                        {Math.round(adaptation.confidence * 100)}% confidence
                      </span>
                    </div>
                    <div className="text-gray-600">
                      {adaptation.reason}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Learning Style Insights */}
            <div className="bg-gradient-to-r from-teal-50 to-cyan-50 rounded-lg p-3">
              <h6 className="text-sm font-semibold text-teal-700 mb-2">Learning Style Analysis</h6>
              <div className="text-xs text-teal-600 space-y-1">
                <div>• Style: {userModel.learningStyle}</div>
                <div>• Optimal session: {userModel.attentionSpan} minutes</div>
                <div>• Preferred metaphor complexity: {userModel.speechPreferences.metaphorComplexity}</div>
              </div>
            </div>

            {/* Personalization Status */}
            <div className="bg-gradient-to-r from-orange-50 to-red-50 rounded-lg p-3">
              <h6 className="text-sm font-semibold text-orange-700 mb-2">System Personalization</h6>
              <div className="grid grid-cols-2 gap-2">
                <div className="text-center">
                  <div className="text-lg font-bold text-orange-600">
                    {Math.round(userModel.confidence * 100)}%
                  </div>
                  <div className="text-xs text-orange-600">Model Confidence</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-orange-600">
                    {userModel.adaptationHistory.length}
                  </div>
                  <div className="text-xs text-orange-600">Adaptations Made</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
