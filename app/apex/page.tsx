"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  DAT_SECTIONS
} from '@/types/apex-exam';
import { 
  DAT_PATTERNS, 
  PATTERN_CATEGORIES,
  getPatternsByCategory,
  type Pattern 
} from '@/types/patterns';
import { protocolHandler, generateBootcampReturnUrl, isProtocolSupported } from '@/lib/protocolHandler';
import { EnhancedBootcampLink, BootcampPracticeLink } from '@/components/LearningAwareBootcampLink';

interface LearningStats {
  totalStudyTime: number; // minutes
  patternsLearned: number;
  bootcampSessions: number;
  weeklyProgress: number; // percentage increase
  currentStreak: number; // days
  aiInsights: string[];
  focusAreas: string[];
  strengths: string[];
  recentSessions: {
    date: string;
    source: 'thought-unit' | 'datbootcamp' | 'patterns';
    duration: number;
    topic?: string;
    progress?: number;
  }[];
}

export default function DATLearningHub() {
  const [stats, setStats] = useState<LearningStats>({
    totalStudyTime: 0,
    patternsLearned: 0,
    bootcampSessions: 0,
    weeklyProgress: 0,
    currentStreak: 0,
    aiInsights: [],
    focusAreas: [],
    strengths: [],
    recentSessions: []
  });

  const [protocolStatus, setProtocolStatus] = useState({
    supported: false,
    registered: false
  });
  
  const [loading, setLoading] = useState(true);

  // Load learning stats and initialize protocol handler
  useEffect(() => {
    const loadLearningData = async () => {
      try {
        // Initialize protocol handler
        setProtocolStatus({
          supported: isProtocolSupported(),
          registered: protocolHandler.getRegistrationStatus()
        });

        // Load bootcamp progress from localStorage
        const bootcampData = JSON.parse(localStorage.getItem('bootcamp_progress') || '[]');
        
        // Calculate learning stats
        const mockStats: LearningStats = {
          totalStudyTime: 2760, // 46 hours
          patternsLearned: 8,
          bootcampSessions: bootcampData.length,
          weeklyProgress: 23.5,
          currentStreak: 5,
          aiInsights: [
            'Focus more on PAT spatial reasoning patterns',
            'Strong progress in Organic Chemistry CARDIO method',
            'Consider more practice with quantitative reasoning'
          ],
          focusAreas: ['PAT (Perceptual Ability)', 'Quantitative Reasoning'],
          strengths: ['Organic Chemistry', 'Biology Patterns'],
          recentSessions: [
            { date: '2025-01-01', source: 'datbootcamp', duration: 45, topic: 'QR Practice', progress: 85 },
            { date: '2024-12-31', source: 'patterns', duration: 30, topic: 'CARDIO Method' },
            { date: '2024-12-30', source: 'thought-unit', duration: 60, topic: 'Biology Study' },
            ...bootcampData.slice(-3).map((item: any) => ({
              date: item.timestamp,
              source: 'datbootcamp' as const,
              duration: Math.round(item.timeSpent / 60),
              topic: item.section,
              progress: item.score
            }))
          ]
        };

        setStats(mockStats);
        setLoading(false);
      } catch (error) {
        console.error('Failed to load learning data:', error);
        setLoading(false);
      }
    };

    loadLearningData();
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
          <p className="text-blue-200">Loading DAT Learning Hub...</p>
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
                🧠 DAT Learning Hub
              </h1>
              <p className="text-blue-200 mt-1">
                AI-Powered Learning with DAT Bootcamp Integration
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
                <div className="text-sm text-blue-200">Current Streak</div>
                <div className="text-xl font-bold text-green-400">
                  {stats.currentStreak} days
                </div>
                <div className="text-xs text-gray-400">
                  Keep it up!
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
                <p className="text-blue-200 text-sm">Study Time</p>
                <p className="text-2xl font-bold text-white">{formatTime(stats.totalStudyTime)}</p>
              </div>
              <div className="text-purple-400 text-2xl">⏱️</div>
            </div>
          </div>

          <div className="bg-black/30 backdrop-blur-sm rounded-xl p-6 border border-blue-500/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-200 text-sm">Patterns Learned</p>
                <p className="text-2xl font-bold text-green-400">{stats.patternsLearned}</p>
              </div>
              <div className="text-green-400 text-2xl">🧠</div>
            </div>
          </div>

          <div className="bg-black/30 backdrop-blur-sm rounded-xl p-6 border border-blue-500/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-200 text-sm">Bootcamp Sessions</p>
                <p className="text-2xl font-bold text-orange-400">{stats.bootcampSessions}</p>
              </div>
              <div className="text-orange-400 text-2xl">🚀</div>
            </div>
          </div>

          <div className="bg-black/30 backdrop-blur-sm rounded-xl p-6 border border-blue-500/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-200 text-sm">Weekly Progress</p>
                <p className="text-2xl font-bold text-blue-400">+{stats.weeklyProgress}%</p>
              </div>
              <div className="text-blue-400 text-2xl">📈</div>
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

            {/* Pattern Rules & Decision Making System */}
            <div className="bg-black/30 backdrop-blur-sm rounded-xl p-6 border border-blue-500/20">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-white">🎯 Pattern Rules & Decision Making</h2>
                <div className="flex items-center gap-2">
                  <span className="text-xs bg-gradient-to-r from-orange-500/20 to-red-500/20 text-orange-300 px-2 py-1 rounded border border-orange-500/30">
                    NEW: DAT Bootcamp Integration
                  </span>
                </div>
              </div>
              
              <p className="text-gray-300 text-sm mb-6">
                Master the 14 high-yield DAT patterns with systematic decision trees and practice from DAT Bootcamp resources.
              </p>

              {/* Pattern Categories Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {Object.entries(PATTERN_CATEGORIES).map(([categoryKey, categoryName]) => {
                  const categoryPatterns = getPatternsByCategory(categoryKey as keyof typeof PATTERN_CATEGORIES);
                  const categoryColors = {
                    'organic-chemistry': 'from-green-600/20 to-emerald-600/20 border-green-500/30',
                    'general-chemistry': 'from-blue-600/20 to-cyan-600/20 border-blue-500/30',
                    'biology': 'from-purple-600/20 to-violet-600/20 border-purple-500/30',
                    'pat': 'from-yellow-600/20 to-orange-600/20 border-yellow-500/30',
                    'reading-comprehension': 'from-pink-600/20 to-rose-600/20 border-pink-500/30'
                  };
                  
                  return (
                    <div key={categoryKey} className={`bg-gradient-to-br ${categoryColors[categoryKey as keyof typeof categoryColors]} rounded-lg p-4 border`}>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold text-white">{categoryName}</h3>
                        <span className="text-xs bg-white/10 px-2 py-1 rounded text-gray-300">
                          {categoryPatterns.length} patterns
                        </span>
                      </div>
                      
                      <div className="space-y-2 mb-4">
                        {categoryPatterns.slice(0, 2).map((pattern) => (
                          <div key={pattern.id} className="text-sm">
                            <span className="text-white font-medium">• {pattern.name}</span>
                            <p className="text-gray-300 text-xs mt-1">{pattern.description}</p>
                          </div>
                        ))}
                        {categoryPatterns.length > 2 && (
                          <div className="text-xs text-gray-400">
                            +{categoryPatterns.length - 2} more patterns
                          </div>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/apex/patterns?category=${categoryKey}`}
                          className="flex-1 text-center px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded text-xs transition-colors"
                        >
                          Study Patterns
                        </Link>
                        <EnhancedBootcampLink
                          section={categoryKey}
                          category={categoryName}
                          className="flex-1 text-center px-3 py-2 bg-orange-600/30 hover:bg-orange-600/40 text-orange-200 rounded text-xs transition-colors border border-orange-500/30"
                        >
                          🔗 DAT Bootcamp
                        </EnhancedBootcampLink>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* High-Yield Pattern Spotlight */}
              <div className="bg-gradient-to-r from-yellow-600/10 to-orange-600/10 rounded-lg p-4 border border-yellow-500/30 mb-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">⭐</span>
                  <h3 className="font-semibold text-yellow-300">High-Yield Pattern Spotlight</h3>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {DAT_PATTERNS.filter(p => p.tags.includes('high-yield')).slice(0, 3).map((pattern) => (
                    <div key={pattern.id} className="bg-black/20 rounded-lg p-3 border border-gray-600/30">
                      <h4 className="font-medium text-white mb-2">{pattern.name}</h4>
                      <p className="text-xs text-gray-300 mb-3">{pattern.description}</p>
                      <div className="flex gap-2">
                        <Link
                          href={`/apex/patterns/${pattern.id}`}
                          className="text-xs px-2 py-1 bg-blue-600/30 text-blue-200 rounded hover:bg-blue-600/40 transition-colors"
                        >
                          Learn Rules
                        </Link>
                        <Link
                          href={`/apex/generator?pattern=${pattern.id}`}
                          className="text-xs px-2 py-1 bg-green-600/30 text-green-200 rounded hover:bg-green-600/40 transition-colors"
                        >
                          Practice
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quick Pattern Tools */}
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/apex/patterns/decision-tree"
                  className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-lg text-sm font-medium transition-all"
                >
                  🌳 Interactive Decision Trees
                </Link>
                <Link
                  href="/apex/patterns/flashcards"
                  className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-lg text-sm font-medium transition-all"
                >
                  🃏 Pattern Flashcards
                </Link>
                <Link
                  href="/apex/generator?mode=pattern-focused"
                  className="px-4 py-2 bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white rounded-lg text-sm font-medium transition-all"
                >
                  🎯 Pattern-Focused Practice
                </Link>
                <BootcampPracticeLink className="px-4 py-2 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white rounded-lg text-sm font-medium transition-all">
                  🚀 DAT Bootcamp Exams
                </BootcampPracticeLink>
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
              
              {stats.strengths.length > 0 && (
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-green-400 mb-2">💪 Strengths</h3>
                  <div className="space-y-1">
                    {stats.strengths.map((topic, idx) => (
                      <div key={idx} className="text-sm text-gray-300">{topic}</div>
                    ))}
                  </div>
                </div>
              )}

              {stats.focusAreas.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-red-400 mb-2">🎯 Focus Areas</h3>
                  <div className="space-y-1">
                    {stats.focusAreas.map((topic, idx) => (
                      <div key={idx} className="text-sm text-gray-300">{topic}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Recent Learning Sessions */}
            <div className="bg-black/30 backdrop-blur-sm rounded-xl p-6 border border-blue-500/20">
              <h2 className="text-lg font-bold text-white mb-4">📅 Recent Sessions</h2>
              
              <div className="space-y-3">
                {stats.recentSessions.map((session, idx) => (
                  <div key={idx} className="flex items-center justify-between py-2 border-b border-gray-600/30 last:border-b-0">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">
                          {session.source === 'datbootcamp' ? '🚀' : 
                           session.source === 'patterns' ? '🧠' : '📚'}
                        </span>
                        <span className="text-sm text-white capitalize">
                          {session.source === 'datbootcamp' ? 'DAT Bootcamp' : 
                           session.source === 'patterns' ? 'Patterns' : 'Thought Unit'}
                        </span>
                      </div>
                      <div className="text-xs text-gray-400">
                        {formatDate(session.date)} {session.topic && `• ${session.topic}`}
                      </div>
                    </div>
                    
                    <div className="text-right">
                      {session.progress && (
                        <div className="text-sm font-semibold text-green-400">
                          {session.progress}%
                        </div>
                      )}
                      <div className="text-xs text-gray-400">
                        {formatTime(session.duration)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* AI Learning Insights */}
            <div className="bg-black/30 backdrop-blur-sm rounded-xl p-6 border border-blue-500/20">
              <h2 className="text-lg font-bold text-white mb-4">🤖 AI Insights</h2>
              
              <div className="space-y-3">
                {stats.aiInsights.map((insight, idx) => (
                  <div key={idx} className="flex items-start gap-3 p-3 bg-blue-600/10 rounded-lg border border-blue-500/20">
                    <span className="text-blue-400 text-sm">💡</span>
                    <p className="text-sm text-gray-300 flex-1">{insight}</p>
                  </div>
                ))}
              </div>

              {/* Protocol Status */}
              <div className="mt-4 pt-4 border-t border-gray-600/30">
                <div className="text-xs text-gray-400 mb-2">DAT Bootcamp Integration</div>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${protocolStatus.supported ? 'bg-green-400' : 'bg-red-400'}`}></div>
                  <span className="text-xs text-gray-300">
                    {protocolStatus.supported ? 'Protocol Supported' : 'Protocol Not Supported'}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <div className={`w-2 h-2 rounded-full ${protocolStatus.registered ? 'bg-green-400' : 'bg-yellow-400'}`}></div>
                  <span className="text-xs text-gray-300">
                    {protocolStatus.registered ? 'Deep Linking Active' : 'Registration Pending'}
                  </span>
                </div>
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
