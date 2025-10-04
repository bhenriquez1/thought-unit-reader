"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  DAT_PATTERNS, 
  PATTERN_CATEGORIES,
  getPatternsByCategory,
  searchPatterns,
  type Pattern 
} from '@/types/patterns';
import TOCSidebar from '@/components/TOCSidebar';

export default function DATPatternBrowser() {
  const [selectedPattern, setSelectedPattern] = useState<Pattern | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [decisionMode, setDecisionMode] = useState(false);
  const [showTOC, setShowTOC] = useState(false);
  const [bootcampReturn, setBootcampReturn] = useState<{
    isReturn: boolean;
    section: string;
    score?: number;
    duration?: number;
    aiInsights: string[];
    focusMode: boolean;
  } | null>(null);
  
  // Parse URL parameters on client side for static export compatibility
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      
      // Handle standard category parameter
      const categoryParam = urlParams.get('category');
      if (categoryParam) {
        setActiveCategory(categoryParam);
      }
      
      // Handle DAT Bootcamp return parameters
      const protocolReturn = urlParams.get('protocol_return') === 'true';
      const bootcampSession = urlParams.get('bootcamp_session') === 'true';
      
      if (protocolReturn && bootcampSession) {
        const section = urlParams.get('section') || 'unknown';
        const score = urlParams.get('score') ? parseInt(urlParams.get('score')!) : undefined;
        const duration = urlParams.get('duration') ? parseInt(urlParams.get('duration')!) : undefined;
        const focusMode = urlParams.get('focus_mode') === 'true';
        
        // Try to get AI insights from stored protocol return data
        let aiInsights: string[] = [];
        try {
          const protocolData = localStorage.getItem('protocol_return_data');
          if (protocolData) {
            const data = JSON.parse(protocolData);
            aiInsights = data.aiInsights || [];
            // Clean up the stored data
            localStorage.removeItem('protocol_return_data');
          }
        } catch (error) {
          console.warn('Failed to parse protocol return data:', error);
        }
        
        // Generate fallback insights if none found
        if (aiInsights.length === 0) {
          aiInsights = [
            `🎓 Successfully returned from ${section.replace('-', ' ').toUpperCase()} study session`,
            '🧠 Ready to apply learned concepts with pattern decision trees',
            '🎯 Focus on the patterns below to reinforce your learning'
          ];
          if (score) aiInsights.push(`📊 Session performance: ${score}% - Apply these patterns to improve!`);
          if (duration) aiInsights.push(`⏱️ ${duration} minutes of focused study completed`);
        }
        
        setBootcampReturn({
          isReturn: true,
          section,
          score,
          duration,
          aiInsights,
          focusMode
        });
        
        // Auto-enable decision mode for focused learning
        if (focusMode) {
          setDecisionMode(true);
        }
      }
    }
  }, []);

  const filteredPatterns = React.useMemo(() => {
    let patterns = DAT_PATTERNS;
    
    if (activeCategory !== 'all') {
      patterns = getPatternsByCategory(activeCategory as keyof typeof PATTERN_CATEGORIES);
    }
    
    if (searchQuery.trim()) {
      patterns = searchPatterns(searchQuery);
    }
    
    return patterns;
  }, [activeCategory, searchQuery]);

  // Create TOC entries from patterns for navigation
  const patternTOC = React.useMemo(() => {
    return filteredPatterns.map((pattern, index) => ({
      title: pattern.name,
      pageNumber: index + 1,
      text: pattern.description
    }));
  }, [filteredPatterns]);

  const PatternDecisionTree = ({ pattern }: { pattern: Pattern }) => {
    const [currentStep, setCurrentStep] = useState(0);
    const [userPath, setUserPath] = useState<string[]>([]);
    
    const decisionSteps = pattern.rules.map((rule, index) => ({
      question: `Step ${index + 1}: ${rule.key}`,
      description: rule.description,
      example: rule.example,
      options: ['Apply this rule', 'Skip this rule', 'Need more info']
    }));

    const handleDecision = (decision: string) => {
      const newPath = [...userPath, decision];
      setUserPath(newPath);
      
      if (currentStep < decisionSteps.length - 1) {
        setCurrentStep(currentStep + 1);
      } else {
        // Decision complete - show results
        alert(`Decision complete! Your path: ${newPath.join(' → ')}`);
      }
    };

    return (
      <div className="bg-gradient-to-br from-indigo-900/20 to-purple-900/20 rounded-xl p-6 border border-indigo-500/30">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-white">🌳 Decision Tree: {pattern.name}</h3>
          <button
            onClick={() => { setCurrentStep(0); setUserPath([]); }}
            className="px-3 py-1 bg-gray-600 hover:bg-gray-500 text-white rounded text-sm"
          >
            Reset
          </button>
        </div>
        
        {currentStep < decisionSteps.length ? (
          <div>
            <div className="mb-4">
              <div className="text-sm text-indigo-300 mb-2">
                Progress: {currentStep + 1} / {decisionSteps.length}
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div 
                  className="bg-indigo-500 h-2 rounded-full transition-all"
                  style={{ width: `${((currentStep + 1) / decisionSteps.length) * 100}%` }}
                />
              </div>
            </div>
            
            <div className="bg-black/20 rounded-lg p-4 mb-4">
              <h4 className="font-semibold text-white mb-2">{decisionSteps[currentStep].question}</h4>
              <p className="text-gray-300 text-sm mb-3">{decisionSteps[currentStep].description}</p>
              {decisionSteps[currentStep].example && (
                <div className="bg-gray-800/50 rounded p-3 mb-3">
                  <div className="text-xs text-yellow-300 mb-1">Example:</div>
                  <div className="text-sm text-gray-200">{decisionSteps[currentStep].example}</div>
                </div>
              )}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {decisionSteps[currentStep].options.map((option, idx) => (
                <button
                  key={idx}
                  onClick={() => handleDecision(option)}
                  className="px-4 py-3 bg-indigo-600/30 hover:bg-indigo-600/40 border border-indigo-500/30 text-indigo-200 rounded-lg transition-colors text-sm"
                >
                  {option}
                </button>
              ))}
            </div>
            
            {userPath.length > 0 && (
              <div className="mt-4 p-3 bg-gray-800/30 rounded-lg">
                <div className="text-xs text-gray-400 mb-1">Your decision path:</div>
                <div className="text-sm text-gray-300">{userPath.join(' → ')}</div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8">
            <div className="text-4xl mb-4">🎉</div>
            <h4 className="text-lg font-semibold text-green-300 mb-2">Decision Tree Complete!</h4>
            <p className="text-gray-300 text-sm mb-4">
              You've worked through all the decision points for {pattern.name}.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => { setCurrentStep(0); setUserPath([]); }}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg"
              >
                Try Again
              </button>
              <Link
                href={`/apex/generator?pattern=${pattern.id}`}
                className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg"
              >
                Practice Questions
              </Link>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-900 to-slate-900">
      {/* Header */}
      <header className="bg-black/20 backdrop-blur-sm border-b border-indigo-500/20 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/apex"
                className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors text-sm"
              >
                ← DAT Apex
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-white">🎯 Pattern Rules & Decision Making</h1>
                <p className="text-indigo-200 text-sm">Master DAT patterns with interactive decision trees</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowTOC(!showTOC)}
                className="px-3 py-2 bg-indigo-600/30 hover:bg-indigo-600/40 text-indigo-200 rounded-lg border border-indigo-500/30 transition-colors"
              >
                📑 {showTOC ? 'Hide' : 'Show'} Pattern TOC
              </button>
              <button
                onClick={() => setDecisionMode(!decisionMode)}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  decisionMode 
                    ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white' 
                    : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                }`}
              >
                🌳 {decisionMode ? 'Exit' : 'Enter'} Decision Mode
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* TOC Sidebar */}
        {showTOC && (
          <div className="w-80 flex-shrink-0">
            <TOCSidebar
              toc={patternTOC}
              currentPage={selectedPattern ? filteredPatterns.indexOf(selectedPattern) + 1 : 1}
              onJumpToPage={(pageNum) => {
                const pattern = filteredPatterns[pageNum - 1];
                if (pattern) {
                  setSelectedPattern(pattern);
                  setShowTOC(false); // Auto-hide on mobile
                }
              }}
              userId="guest"
            />
          </div>
        )}

        {/* Main Content */}
        <div className="flex-1 p-6">
          {/* AI Learning Insights Banner - Only shown on DAT Bootcamp return */}
          {bootcampReturn?.isReturn && (
            <div className="bg-gradient-to-r from-blue-900/40 to-purple-900/40 backdrop-blur-sm rounded-xl p-6 mb-6 border border-blue-500/30">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="text-2xl">🧠</div>
                  <div>
                    <h2 className="text-xl font-bold text-white">AI Learning Integration Complete</h2>
                    <p className="text-blue-200 text-sm">
                      Welcome back from {bootcampReturn.section.replace('-', ' ').toUpperCase()} study session
                      {bootcampReturn.score && ` • ${bootcampReturn.score}% performance`}
                      {bootcampReturn.duration && ` • ${bootcampReturn.duration}min study time`}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setBootcampReturn(null)}
                  className="px-3 py-1 bg-gray-600/50 hover:bg-gray-600 text-gray-300 rounded text-sm transition-colors"
                >
                  ✕
                </button>
              </div>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                    <span>🤖</span> AI Insights
                  </h3>
                  <div className="space-y-2">
                    {bootcampReturn.aiInsights.map((insight, idx) => (
                      <div key={idx} className="bg-black/20 rounded-lg p-3 border border-blue-500/20">
                        <span className="text-blue-200 text-sm">{insight}</span>
                      </div>
                    ))}
                  </div>
                </div>
                
                <div>
                  <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                    <span>🎯</span> Recommended Actions
                  </h3>
                  <div className="space-y-3">
                    <div className="bg-indigo-600/20 border border-indigo-500/30 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-indigo-200 text-sm">
                          🌳 Practice {bootcampReturn.section.replace('-', ' ').toUpperCase()} patterns with decision trees
                        </span>
                        {!decisionMode && (
                          <button
                            onClick={() => setDecisionMode(true)}
                            className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs"
                          >
                            Enable
                          </button>
                        )}
                      </div>
                    </div>
                    
                    <div className="bg-green-600/20 border border-green-500/30 rounded-lg p-3">
                      <span className="text-green-200 text-sm">
                        📖 Review pattern rules below to reinforce learning
                      </span>
                    </div>
                    
                    {bootcampReturn.score && bootcampReturn.score < 80 && (
                      <div className="bg-yellow-600/20 border border-yellow-500/30 rounded-lg p-3">
                        <span className="text-yellow-200 text-sm">
                          💪 Focus on challenging patterns for improvement
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              {bootcampReturn.focusMode && (
                <div className="mt-4 p-3 bg-purple-600/20 border border-purple-500/30 rounded-lg">
                  <div className="flex items-center gap-2 text-purple-200 text-sm">
                    <span>⚡</span>
                    <span><strong>Focus Mode Active:</strong> Pattern category auto-filtered to {activeCategory.replace('-', ' ').toUpperCase()}. Decision mode enabled for enhanced learning.</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Search and Filter Bar */}
          <div className="bg-black/30 backdrop-blur-sm rounded-xl p-4 mb-6 border border-indigo-500/20">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <input
                  type="text"
                  placeholder="Search patterns..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-600 focus:border-indigo-500 outline-none"
                />
              </div>
              
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-300">Category:</span>
                <select
                  value={activeCategory}
                  onChange={(e) => setActiveCategory(e.target.value)}
                  className="px-3 py-2 bg-gray-800 text-white rounded-lg border border-gray-600"
                >
                  <option value="all">All Categories</option>
                  {Object.entries(PATTERN_CATEGORIES).map(([key, name]) => (
                    <option key={key} value={key}>{name}</option>
                  ))}
                </select>
              </div>
            </div>
            
            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-gray-400">
                Found {filteredPatterns.length} pattern{filteredPatterns.length !== 1 ? 's' : ''}
              </div>
              
              <div className="flex gap-2">
                <Link
                  href="https://datbootcamp.com/pattern-recognition"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1 bg-orange-600/30 hover:bg-orange-600/40 text-orange-200 rounded text-xs border border-orange-500/30"
                >
                  🔗 DAT Bootcamp Patterns
                </Link>
                <Link
                  href="https://datbootcamp.com/practice-exams"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1 bg-red-600/30 hover:bg-red-600/40 text-red-200 rounded text-xs border border-red-500/30"
                >
                  🚀 Practice Exams
                </Link>
              </div>
            </div>
          </div>

          {/* Pattern Content */}
          {selectedPattern ? (
            <div className="space-y-6">
              {/* Pattern Details */}
              <div className="bg-black/30 backdrop-blur-sm rounded-xl p-6 border border-indigo-500/20">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-2xl font-bold text-white">{selectedPattern.name}</h2>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-1 bg-indigo-600/30 text-indigo-200 rounded text-xs border border-indigo-500/30">
                      {PATTERN_CATEGORIES[selectedPattern.category]}
                    </span>
                    <button
                      onClick={() => setSelectedPattern(null)}
                      className="px-3 py-1 bg-gray-600 hover:bg-gray-500 text-white rounded text-sm"
                    >
                      ← Back to List
                    </button>
                  </div>
                </div>
                
                <p className="text-gray-300 mb-6">{selectedPattern.description}</p>
                
                {/* Pattern Rules */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-4">📋 Pattern Rules</h3>
                    <div className="space-y-3">
                      {selectedPattern.rules.map((rule, idx) => (
                        <div key={idx} className="bg-gray-800/50 rounded-lg p-4">
                          <h4 className="font-medium text-yellow-300 mb-2">{rule.key}</h4>
                          <p className="text-gray-300 text-sm mb-2">{rule.description}</p>
                          {rule.example && (
                            <div className="text-xs text-gray-400 bg-gray-900/50 rounded p-2">
                              <span className="text-green-400">Example:</span> {rule.example}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-4">⚠️ Common Mistakes</h3>
                    <div className="space-y-2">
                      {selectedPattern.commonMistakes.map((mistake, idx) => (
                        <div key={idx} className="bg-red-900/20 border border-red-500/30 rounded-lg p-3">
                          <span className="text-red-300 text-sm">• {mistake}</span>
                        </div>
                      ))}
                    </div>
                    
                    <h3 className="text-lg font-semibold text-white mb-4 mt-6">💡 Examples</h3>
                    <div className="space-y-2">
                      {selectedPattern.examples.map((example, idx) => (
                        <div key={idx} className="bg-green-900/20 border border-green-500/30 rounded-lg p-3">
                          <span className="text-green-300 text-sm">{example}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Decision Tree Mode */}
              {decisionMode && <PatternDecisionTree pattern={selectedPattern} />}
              
              {/* Action Buttons */}
              <div className="flex gap-4">
                <Link
                  href={`/apex/generator?pattern=${selectedPattern.id}`}
                  className="px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white rounded-lg font-medium"
                >
                  🎯 Practice This Pattern
                </Link>
                <Link
                  href={`https://datbootcamp.com/pattern/${selectedPattern.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-6 py-3 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white rounded-lg font-medium"
                >
                  🔗 DAT Bootcamp Resources
                </Link>
              </div>
            </div>
          ) : (
            /* Pattern Grid */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredPatterns.map((pattern) => (
                <div key={pattern.id} className="bg-black/30 backdrop-blur-sm rounded-xl p-6 border border-indigo-500/20 hover:border-indigo-400/40 transition-all cursor-pointer group">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-white group-hover:text-indigo-300 transition-colors">
                      {pattern.name}
                    </h3>
                    <span className="px-2 py-1 bg-indigo-600/30 text-indigo-200 rounded text-xs">
                      {pattern.category.split('-').length > 1 ? pattern.category.split('-').map(w => w[0]).join('').toUpperCase() : pattern.category.toUpperCase()}
                    </span>
                  </div>
                  
                  <p className="text-gray-300 text-sm mb-4 line-clamp-2">{pattern.description}</p>
                  
                  <div className="flex flex-wrap gap-1 mb-4">
                    {pattern.tags.slice(0, 3).map((tag) => (
                      <span key={tag} className="px-2 py-1 bg-gray-700/50 text-gray-300 rounded text-xs">
                        {tag}
                      </span>
                    ))}
                    {pattern.tags.length > 3 && (
                      <span className="px-2 py-1 bg-gray-700/50 text-gray-400 rounded text-xs">
                        +{pattern.tags.length - 3} more
                      </span>
                    )}
                  </div>
                  
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSelectedPattern(pattern)}
                      className="flex-1 px-3 py-2 bg-indigo-600/30 hover:bg-indigo-600/40 text-indigo-200 rounded text-sm transition-colors"
                    >
                      📖 Learn Rules
                    </button>
                    <Link
                      href={`/apex/generator?pattern=${pattern.id}`}
                      className="flex-1 text-center px-3 py-2 bg-green-600/30 hover:bg-green-600/40 text-green-200 rounded text-sm transition-colors"
                    >
                      🎯 Practice
                    </Link>
                  </div>
                </div>
              ))}
              
              {filteredPatterns.length === 0 && (
                <div className="col-span-full text-center py-12">
                  <div className="text-4xl mb-4">🔍</div>
                  <h3 className="text-xl font-semibold text-gray-300 mb-2">No patterns found</h3>
                  <p className="text-gray-400">Try adjusting your search or category filter.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
