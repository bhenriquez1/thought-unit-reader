"use client";

import React, { useState, useEffect } from 'react';
import { generateButlerMetaphors, generateTUExplanation } from '@/lib/tu/core';
import { TUTextView } from '@/lib/tu/tuTextView';
import type { DATQuestion } from '@/types/apex-exam';

interface TUExplainModalProps {
  question: DATQuestion;
  userAnswer?: string;
  isOpen: boolean;
  onClose: () => void;
}

interface TUExplanation {
  conceptAnalysis: string;
  butlerMetaphor: string;
  memoryAnchor: string;
  commonMistakes: string[];
  studyTips: string[];
  relatedConcepts: string[];
}

export default function TUExplainModal({ question, userAnswer, isOpen, onClose }: TUExplainModalProps) {
  const [tuExplanation, setTuExplanation] = useState<TUExplanation | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'explanation' | 'metaphor' | 'memory' | 'mistakes'>('explanation');

  useEffect(() => {
    if (isOpen && question) {
      generateTUExplanation();
    }
  }, [isOpen, question]);

  const generateTUExplanation = async () => {
    setLoading(true);
    try {
      // Generate Butler-style metaphor for the concept
      const conceptText = `${question.stem} The correct answer is ${question.correctAnswer}: ${question.options[question.correctAnswer]}. ${question.explanation || ''}`;
      const butlerMetaphors = generateButlerMetaphors(conceptText);
      const butlerMetaphor = butlerMetaphors.length > 0 ? butlerMetaphors[0].explanation : 'Unable to generate metaphor at this time.';

      // Analyze the question for TU explanation
      const tuExplanation: TUExplanation = {
        conceptAnalysis: generateConceptAnalysis(question, userAnswer),
        butlerMetaphor,
        memoryAnchor: generateMemoryAnchor(question),
        commonMistakes: generateCommonMistakes(question, userAnswer),
        studyTips: generateStudyTips(question),
        relatedConcepts: generateRelatedConcepts(question)
      };

      setTuExplanation(tuExplanation);
    } catch (error) {
      console.error('Failed to generate TU explanation:', error);
      // Fallback to basic explanation
      setTuExplanation({
        conceptAnalysis: question.explanation || 'No explanation available.',
        butlerMetaphor: 'Unable to generate metaphor at this time.',
        memoryAnchor: `Remember: ${question.topic} - ${question.correctAnswer}`,
        commonMistakes: ['Review the question stem carefully', 'Consider all answer choices'],
        studyTips: [`Focus on ${question.topic}`, `Practice ${question.difficulty} level questions`],
        relatedConcepts: [question.topic]
      });
    } finally {
      setLoading(false);
    }
  };

  const generateConceptAnalysis = (question: DATQuestion, userAnswer?: string): string => {
    const isCorrect = userAnswer === question.correctAnswer;
    const analysis: string[] = [];

    analysis.push(`**Question Analysis:**`);
    analysis.push(`This ${question.difficulty} level question tests your understanding of ${question.topic}.`);
    
    if (question.explanation) {
      analysis.push(`\n**Core Concept:**`);
      analysis.push(question.explanation);
    }

    if (userAnswer) {
      analysis.push(`\n**Your Response:**`);
      if (isCorrect) {
        analysis.push(`✅ Correct! You selected ${userAnswer}, which demonstrates good understanding of ${question.topic}.`);
      } else {
        analysis.push(`❌ You selected ${userAnswer}, but the correct answer is ${question.correctAnswer}.`);
        analysis.push(`Let's break down why ${question.correctAnswer} is correct:`);
        analysis.push(question.options[question.correctAnswer] || '');
      }
    }

    return analysis.join('\n');
  };

  const generateMemoryAnchor = (question: DATQuestion): string => {
    const anchors = {
      'Biology': `🧬 Bio-Anchor: Connect this to living systems and biological processes`,
      'General Chemistry': `⚗️ Chem-Anchor: Think about molecular interactions and chemical properties`,
      'Organic Chemistry': `🔗 Organic-Anchor: Focus on carbon-based structures and reactions`,
      'Perceptual Ability': `👁️ Visual-Anchor: Practice spatial reasoning and pattern recognition`,
      'Reading Comprehension': `📖 Reading-Anchor: Identify main ideas and supporting details`,
      'Quantitative Reasoning': `🔢 Math-Anchor: Break down the problem step-by-step`
    };

    const topicAnchor = Object.keys(anchors).find(key => question.topic.includes(key));
    const baseAnchor = topicAnchor ? anchors[topicAnchor as keyof typeof anchors] : `🎯 Study-Anchor: Focus on ${question.topic}`;

    return `${baseAnchor}\n\n**Memory Technique:**\nCreate a mental image linking "${question.topic}" with the correct answer "${question.correctAnswer}". The more vivid and unusual the connection, the better you'll remember it.`;
  };

  const generateCommonMistakes = (question: DATQuestion, userAnswer?: string): string[] => {
    const mistakes: string[] = [];

    if (userAnswer && userAnswer !== question.correctAnswer) {
      mistakes.push(`Selected ${userAnswer} instead of ${question.correctAnswer} - review the key differences`);
    }

    // Topic-specific common mistakes
    if (question.topic.includes('Chemistry')) {
      mistakes.push('Confusing molecular formulas or reaction mechanisms');
      mistakes.push('Not balancing chemical equations properly');
      mistakes.push('Mixing up oxidation and reduction processes');
    } else if (question.topic.includes('Biology')) {
      mistakes.push('Confusing similar biological processes or structures');
      mistakes.push('Not understanding the relationship between form and function');
      mistakes.push('Mixing up different levels of biological organization');
    } else if (question.topic.includes('Perceptual')) {
      mistakes.push('Rushing through spatial reasoning problems');
      mistakes.push('Not systematically checking all possible orientations');
      mistakes.push('Confusing 2D and 3D spatial relationships');
    } else if (question.topic.includes('Reading')) {
      mistakes.push('Not identifying the main idea before answering');
      mistakes.push('Choosing answers not supported by the passage');
      mistakes.push('Overthinking or adding outside knowledge');
    } else if (question.topic.includes('Quantitative')) {
      mistakes.push('Calculation errors or unit conversion mistakes');
      mistakes.push('Not reading the question carefully for what is being asked');
      mistakes.push('Choosing the first reasonable-looking answer without checking');
    }

    // Difficulty-specific mistakes
    if (question.difficulty === 'hard') {
      mistakes.push('Getting overwhelmed by complex wording - break it down step by step');
      mistakes.push('Second-guessing correct instincts due to question complexity');
    }

    return mistakes.slice(0, 4); // Limit to 4 most relevant mistakes
  };

  const generateStudyTips = (question: DATQuestion): string[] => {
    const tips: string[] = [];

    // Topic-specific study tips
    if (question.topic.includes('Chemistry')) {
      tips.push('Create concept maps linking related chemical processes');
      tips.push('Practice drawing molecular structures and mechanisms');
      tips.push('Use flashcards for chemical formulas and reactions');
    } else if (question.topic.includes('Biology')) {
      tips.push('Draw diagrams to visualize biological processes');
      tips.push('Create timelines for biological sequences and cycles');
      tips.push('Use mnemonics for complex biological terminology');
    } else if (question.topic.includes('Perceptual')) {
      tips.push('Practice with 3D visualization apps and tools');
      tips.push('Work on spatial reasoning puzzles daily');
      tips.push('Time yourself to improve speed and accuracy');
    } else if (question.topic.includes('Reading')) {
      tips.push('Practice active reading with scientific passages');
      tips.push('Summarize main points in your own words');
      tips.push('Look for signal words that indicate relationships');
    } else if (question.topic.includes('Quantitative')) {
      tips.push('Review fundamental math concepts regularly');
      tips.push('Practice estimation to check your calculations');
      tips.push('Work through problems step-by-step, showing all work');
    }

    // Difficulty-specific tips
    if (question.difficulty === 'easy') {
      tips.push('Build confidence with consistent practice of fundamentals');
    } else if (question.difficulty === 'medium') {
      tips.push('Focus on connecting concepts across different topics');
    } else if (question.difficulty === 'hard') {
      tips.push('Break complex problems into smaller, manageable parts');
      tips.push('Practice under timed conditions to build stamina');
    }

    return tips.slice(0, 4); // Limit to 4 most actionable tips
  };

  const generateRelatedConcepts = (question: DATQuestion): string[] => {
    const concepts = [question.topic];

    // Add related concepts based on topic
    if (question.topic.includes('Biology')) {
      concepts.push('Cell Biology', 'Genetics', 'Physiology', 'Evolution');
    } else if (question.topic.includes('Chemistry')) {
      concepts.push('Atomic Structure', 'Chemical Bonding', 'Thermodynamics', 'Kinetics');
    } else if (question.topic.includes('Perceptual')) {
      concepts.push('Spatial Reasoning', 'Pattern Recognition', '3D Visualization', 'Geometric Relationships');
    } else if (question.topic.includes('Reading')) {
      concepts.push('Main Ideas', 'Supporting Details', 'Inference', 'Author Intent');
    } else if (question.topic.includes('Quantitative')) {
      concepts.push('Algebra', 'Geometry', 'Statistics', 'Data Analysis');
    }

    return [...new Set(concepts)].slice(0, 6); // Remove duplicates and limit to 6
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-gradient-to-br from-gray-900 to-blue-900 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden border border-blue-500/30">
        {/* Header */}
        <div className="bg-black/30 px-6 py-4 border-b border-blue-500/20">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-blue-400">🧠 TU Enhanced Explanation</h2>
              <p className="text-sm text-gray-300 mt-1">
                {question.topic} • {question.difficulty} • Question Analysis
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white text-2xl font-bold"
            >
              ×
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="bg-black/20 px-6 py-2 border-b border-gray-700/50">
          <div className="flex gap-1">
            {[
              { id: 'explanation', label: '📝 Analysis', icon: '📝' },
              { id: 'metaphor', label: '🎭 Butler Metaphor', icon: '🎭' },
              { id: 'memory', label: '🧠 Memory Anchor', icon: '🧠' },
              { id: 'mistakes', label: '⚠️ Common Mistakes', icon: '⚠️' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3 py-1 rounded text-sm font-semibold transition-all ${
                  activeTab === tab.id
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400 mx-auto mb-4"></div>
              <p className="text-blue-200">Generating TU explanation...</p>
            </div>
          ) : tuExplanation ? (
            <div className="space-y-6">
              {/* Question Context */}
              <div className="bg-black/20 rounded-lg p-4 border border-gray-600/30">
                <h3 className="font-semibold text-white mb-2">Question:</h3>
                <p className="text-gray-300 text-sm mb-3">{question.stem}</p>
                <div className="grid grid-cols-1 gap-1 text-sm">
                  {Object.entries(question.options).map(([key, value]) => (
                    <div 
                      key={key}
                      className={`p-2 rounded ${
                        key === question.correctAnswer 
                          ? 'bg-green-600/20 border border-green-500/50' 
                          : key === userAnswer && userAnswer !== question.correctAnswer
                          ? 'bg-red-600/20 border border-red-500/50'
                          : 'bg-gray-700/20'
                      }`}
                    >
                      <span className="font-semibold text-blue-400 mr-2">{key}.</span>
                      <span className="text-gray-300">{value}</span>
                      {key === question.correctAnswer && (
                        <span className="ml-2 text-green-400 font-semibold">✓ Correct</span>
                      )}
                      {key === userAnswer && userAnswer !== question.correctAnswer && (
                        <span className="ml-2 text-red-400 font-semibold">✗ Your Answer</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Tab Content */}
              {activeTab === 'explanation' && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-blue-400">📝 Detailed Analysis</h3>
                  <div className="bg-black/20 rounded-lg p-4 border border-blue-500/20">
                    <TUTextView text={tuExplanation.conceptAnalysis} />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-black/20 rounded-lg p-4 border border-purple-500/20">
                      <h4 className="font-semibold text-purple-400 mb-2">🎯 Study Tips</h4>
                      <ul className="space-y-1 text-sm text-gray-300">
                        {tuExplanation.studyTips.map((tip, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="text-purple-400 mt-1">•</span>
                            <span>{tip}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    
                    <div className="bg-black/20 rounded-lg p-4 border border-green-500/20">
                      <h4 className="font-semibold text-green-400 mb-2">🔗 Related Concepts</h4>
                      <div className="flex flex-wrap gap-2">
                        {tuExplanation.relatedConcepts.map((concept, idx) => (
                          <span 
                            key={idx}
                            className="px-2 py-1 bg-green-600/20 text-green-300 rounded text-xs border border-green-500/30"
                          >
                            {concept}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'metaphor' && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-blue-400">🎭 Butler-Style Metaphor</h3>
                  <div className="bg-black/20 rounded-lg p-4 border border-yellow-500/20">
                    <div className="flex items-start gap-3 mb-3">
                      <div className="text-2xl">🎭</div>
                      <div>
                        <h4 className="font-semibold text-yellow-400">David Butler's Teaching Style</h4>
                        <p className="text-xs text-gray-400">Making complex concepts memorable through vivid metaphors</p>
                      </div>
                    </div>
                    <TUTextView text={tuExplanation.butlerMetaphor} />
                  </div>
                </div>
              )}

              {activeTab === 'memory' && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-blue-400">🧠 Memory Anchor</h3>
                  <div className="bg-black/20 rounded-lg p-4 border border-indigo-500/20">
                    <TUTextView text={tuExplanation.memoryAnchor} />
                  </div>
                  
                  <div className="bg-indigo-900/20 rounded-lg p-4 border border-indigo-500/30">
                    <h4 className="font-semibold text-indigo-400 mb-2">💡 Memory Technique Tips</h4>
                    <ul className="space-y-2 text-sm text-gray-300">
                      <li className="flex items-start gap-2">
                        <span className="text-indigo-400">🎨</span>
                        <span><strong>Visualization:</strong> Create a mental image of the concept</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-indigo-400">🔗</span>
                        <span><strong>Association:</strong> Link to something you already know well</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-indigo-400">📝</span>
                        <span><strong>Repetition:</strong> Review this anchor in 1 day, 3 days, then 1 week</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-indigo-400">🎯</span>
                        <span><strong>Application:</strong> Use this concept in practice problems</span>
                      </li>
                    </ul>
                  </div>
                </div>
              )}

              {activeTab === 'mistakes' && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-blue-400">⚠️ Common Mistakes & Prevention</h3>
                  <div className="space-y-3">
                    {tuExplanation.commonMistakes.map((mistake, idx) => (
                      <div key={idx} className="bg-red-900/20 rounded-lg p-4 border border-red-500/30">
                        <div className="flex items-start gap-3">
                          <span className="text-red-400 text-lg">⚠️</span>
                          <div>
                            <p className="text-red-200 font-medium">{mistake}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <div className="bg-green-900/20 rounded-lg p-4 border border-green-500/30">
                    <h4 className="font-semibold text-green-400 mb-2">✅ Prevention Strategy</h4>
                    <p className="text-sm text-green-200">
                      Before answering similar questions, pause and recall this TU explanation. 
                      Ask yourself: "What would David Butler's metaphor remind me about this concept?" 
                      This mental check can prevent rushing into common traps.
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">❌</div>
              <h3 className="text-xl font-semibold text-red-400 mb-2">Failed to Generate Explanation</h3>
              <p className="text-gray-400">Please try again or check your connection.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-black/30 px-6 py-4 border-t border-blue-500/20">
          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-400">
              TU Enhanced Learning • Powered by David Butler's Teaching Methods
            </div>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-semibold transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
