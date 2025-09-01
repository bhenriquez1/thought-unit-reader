"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  DAT_SECTIONS, 
  DEFAULT_EXAM_CONFIGS, 
  type ExamConfiguration,
  type ExamAttempt,
  type ExamResults 
} from '@/types/apex-exam';
import { 
  percentageToDATScore, 
  formatDATScore, 
  getDATScoreColor,
  getDATScoreLabel 
} from '@/lib/apex/datScoring';

interface DashboardStats {
  totalAttempts: number;
  averageScore: number;
  bestScore: number;
  totalStudyTime: number; // minutes
  weakestTopics: string[];
  strongestTopics: string[];
  recentActivity: {
    date: string;
    type: 'exam' | 'practice' | 'review';
    score?: number;
    duration: number;
  }[];
}

export default function DATApexHub() {
  const [stats, setStats] = useState<DashboardStats>({
    totalAttempts: 0,
    averageScore: 0,
    bestScore: 0,
    totalStudyTime: 0,
    weakestTopics: [],
    strongestTopics: [],
    recentActivity: []
  });

  const [recentAttempts, setRecentAttempts] = useState<ExamAttempt[]>([]);
  const [loading, setLoading] = useState(true);

  // Load user stats and recent attempts
  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        // TODO: Replace with actual API calls
        // For now, using mock data
        const mockStats: DashboardStats = {
          totalAttempts: 12,
          averageScore: 78.5,
          bestScore: 89.2,
          totalStudyTime: 1440, // 24 hours
          weakestTopics: ['Organic Chemistry', 'Perceptual Ability'],
          strongestTopics: ['Biology', 'Reading Comprehension'],
          recentActivity: [
            { date: '2025-01-01', type: 'exam', score: 82.1, duration: 255 },
            { date: '2024-12-30', type: 'practice', score: 76.8, duration: 90 },
            { date: '2024-12-28', type: 'review', duration: 45 },
          ]
        };

        setStats(mockStats);
        setLoading(false);
      } catch (error) {
        console.error('Failed to load dashboard data:', error);
        setLoading(false);
      }
    };

    loadDashboardData();
  }, []);

  const formatTime = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400 mx-auto mb-4"></div>
          <p className="text-blue-200">Loading DAT Apex...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      {/* Header */}
      <header className="bg-black/20 backdrop-blur-sm border-b border-blue-500/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white">
                ⚡ DAT Apex
              </h1>
              <p className="text-blue-200 mt-1">
                Practice Exam Generator for Dental Admission Test
              </p>
            </div>
            
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
              >
                ← Back to Reader
              </Link>
              
              <div className="text-right">
                <div className="text-sm text-blue-200">Best Score</div>
                <div className={`text-xl font-bold ${getDATScoreColor(percentageToDATScore(stats.bestScore))}`}>
                  {formatDATScore(percentageToDATScore(stats.bestScore))}
                </div>
                <div className="text-xs text-gray-400">
                  {getDATScoreLabel(percentageToDATScore(stats.bestScore))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-black/30 backdrop-blur-sm rounded-xl p-6 border border-blue-500/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-200 text-sm">Total Attempts</p>
                <p className="text-2xl font-bold text-white">{stats.totalAttempts}</p>
              </div>
              <div className="text-blue-400 text-2xl">📊</div>
            </div>
          </div>

          <div className="bg-black/30 backdrop-blur-sm rounded-xl p-6 border border-blue-500/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-200 text-sm">Average Score</p>
                <p className={`text-2xl font-bold ${getDATScoreColor(percentageToDATScore(stats.averageScore))}`}>
                  {formatDATScore(percentageToDATScore(stats.averageScore))}
                </p>
                <p className="text-xs text-gray-400">
                  {getDATScoreLabel(percentageToDATScore(stats.averageScore))}
                </p>
              </div>
              <div className="text-green-400 text-2xl">📈</div>
            </div>
          </div>

          <div className="bg-black/30 backdrop-blur-sm rounded-xl p-6 border border-blue-500/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-200 text-sm">Study Time</p>
                <p className="text-2xl font-bold text-white">{formatTime(stats.totalStudyTime)}</p>
              </div>
              <div className="text-purple-400 text-2xl">⏱️</div>
            </div>
          </div>

          <div className="bg-black/30 backdrop-blur-sm rounded-xl p-6 border border-blue-500/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-200 text-sm">Best Score</p>
                <p className={`text-2xl font-bold ${getDATScoreColor(percentageToDATScore(stats.bestScore))}`}>
                  {formatDATScore(percentageToDATScore(stats.bestScore))}
                </p>
                <p className="text-xs text-gray-400">
                  {getDATScoreLabel(percentageToDATScore(stats.bestScore))}
                </p>
              </div>
              <div className="text-yellow-400 text-2xl">🏆</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Actions */}
          <div className="lg:col-span-2 space-y-6">
            {/* Quick Start */}
            <div className="bg-black/30 backdrop-blur-sm rounded-xl p-6 border border-blue-500/20">
              <h2 className="text-xl font-bold text-white mb-4">🚀 Quick Start</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Link
                  href="/apex/generator"
                  className="group bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 rounded-lg p-6 transition-all transform hover:scale-105"
                >
                  <div className="text-white">
                    <div className="text-2xl mb-2">📝</div>
                    <h3 className="text-lg font-semibold mb-2">Create Practice Exam</h3>
                    <p className="text-blue-100 text-sm">
                      Generate a custom DAT practice exam with your preferred sections and difficulty
                    </p>
                  </div>
                </Link>

                <Link
                  href="/apex/proctor?config=full-dat"
                  className="group bg-gradient-to-r from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 rounded-lg p-6 transition-all transform hover:scale-105"
                >
                  <div className="text-white">
                    <div className="text-2xl mb-2">⏰</div>
                    <h3 className="text-lg font-semibold mb-2">Full DAT Simulation</h3>
                    <p className="text-green-100 text-sm">
                      Take a complete 4-hour DAT practice exam with official timing and conditions
                    </p>
                  </div>
                </Link>

                <Link
                  href="/apex/review"
                  className="group bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 rounded-lg p-6 transition-all transform hover:scale-105"
                >
                  <div className="text-white">
                    <div className="text-2xl mb-2">🧠</div>
                    <h3 className="text-lg font-semibold mb-2">Review Mistakes</h3>
                    <p className="text-purple-100 text-sm">
                      Study your previous mistakes with TU-enhanced explanations and spaced repetition
                    </p>
                  </div>
                </Link>

                <Link
                  href="/apex/generator?mode=quick"
                  className="group bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-500 hover:to-orange-600 rounded-lg p-6 transition-all transform hover:scale-105"
                >
                  <div className="text-white">
                    <div className="text-2xl mb-2">⚡</div>
                    <h3 className="text-lg font-semibold mb-2">Quick Practice</h3>
                    <p className="text-orange-100 text-sm">
                      30-question mixed practice session for quick skill building
                    </p>
                  </div>
                </Link>
              </div>
            </div>

            {/* DAT Sections Overview */}
            <div className="bg-black/30 backdrop-blur-sm rounded-xl p-6 border border-blue-500/20">
              <h2 className="text-xl font-bold text-white mb-4">📚 DAT Sections</h2>
              
              <div className="space-y-4">
                {DAT_SECTIONS.map((section) => (
                  <div key={section.id} className="bg-black/20 rounded-lg p-4 border border-gray-600/30">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold text-white">{section.name}</h3>
                      <span className="text-sm text-blue-300">{section.shortName}</span>
                    </div>
                    
                    <p className="text-gray-300 text-sm mb-3">{section.description}</p>
                    
                    <div className="flex items-center justify-between text-sm">
                      <div className="text-gray-400">
                        {section.questionCount} questions • {section.timeLimit} minutes
                      </div>
                      
                      <Link
                        href={`/apex/generator?section=${section.id}`}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs transition-colors"
                      >
                        Practice {section.shortName}
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Performance Overview */}
            <div className="bg-black/30 backdrop-blur-sm rounded-xl p-6 border border-blue-500/20">
              <h2 className="text-lg font-bold text-white mb-4">📊 Performance</h2>
              
              {stats.strongestTopics.length > 0 && (
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-green-400 mb-2">💪 Strengths</h3>
                  <div className="space-y-1">
                    {stats.strongestTopics.map((topic, idx) => (
                      <div key={idx} className="text-sm text-gray-300">{topic}</div>
                    ))}
                  </div>
                </div>
              )}

              {stats.weakestTopics.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-red-400 mb-2">🎯 Focus Areas</h3>
                  <div className="space-y-1">
                    {stats.weakestTopics.map((topic, idx) => (
                      <div key={idx} className="text-sm text-gray-300">{topic}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Recent Activity */}
            <div className="bg-black/30 backdrop-blur-sm rounded-xl p-6 border border-blue-500/20">
              <h2 className="text-lg font-bold text-white mb-4">📅 Recent Activity</h2>
              
              <div className="space-y-3">
                {stats.recentActivity.map((activity, idx) => (
                  <div key={idx} className="flex items-center justify-between py-2 border-b border-gray-600/30 last:border-b-0">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">
                          {activity.type === 'exam' ? '📝' : 
                           activity.type === 'practice' ? '⚡' : '🧠'}
                        </span>
                        <span className="text-sm text-white capitalize">{activity.type}</span>
                      </div>
                      <div className="text-xs text-gray-400">{formatDate(activity.date)}</div>
                    </div>
                    
                    <div className="text-right">
                      {activity.score && (
                        <div className={`text-sm font-semibold ${getDATScoreColor(percentageToDATScore(activity.score))}`}>
                          {formatDATScore(percentageToDATScore(activity.score))}
                        </div>
                      )}
                      <div className="text-xs text-gray-400">
                        {formatTime(activity.duration)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-black/30 backdrop-blur-sm rounded-xl p-6 border border-blue-500/20">
              <h2 className="text-lg font-bold text-white mb-4">⚡ Quick Actions</h2>
              
              <div className="space-y-3">
                <Link
                  href="/apex/review?filter=mistakes"
                  className="block w-full px-4 py-2 bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-200 rounded-lg text-sm transition-colors"
                >
                  📚 Review Recent Mistakes
                </Link>
                
                <Link
                  href="/apex/generator?mode=weak-topics"
                  className="block w-full px-4 py-2 bg-orange-600/20 hover:bg-orange-600/30 border border-orange-500/30 text-orange-200 rounded-lg text-sm transition-colors"
                >
                  🎯 Practice Weak Topics
                </Link>
                
                <Link
                  href="/apex/proctor?config=timed-practice"
                  className="block w-full px-4 py-2 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-200 rounded-lg text-sm transition-colors"
                >
                  ⏱️ Timed Practice Session
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
