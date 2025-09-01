"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { ExamGenerator, type GeneratorOptions } from '@/lib/apex/examGenerator';
import { DAT_SECTIONS } from '@/types/apex-exam';

export default function ExamGeneratorPage() {
  const [options, setOptions] = useState<GeneratorOptions>({
    sections: DAT_SECTIONS.map(s => s.id),
    questionCount: 120,
    timeLimit: 255,
    difficulty: 'mixed',
    mode: 'practice',
    randomize: true
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedExam, setGeneratedExam] = useState<any>(null);

  const handleSectionToggle = (sectionId: string) => {
    setOptions(prev => ({
      ...prev,
      sections: prev.sections?.includes(sectionId)
        ? prev.sections.filter(s => s !== sectionId)
        : [...(prev.sections || []), sectionId]
    }));
  };

  const generateExam = async () => {
    setIsGenerating(true);
    try {
      const examGenerator = await ExamGenerator.fromQuestionBank();
      const exam = examGenerator.generateExam(options);
      setGeneratedExam(exam);
      console.log('Generated exam:', exam);
    } catch (error) {
      console.error('Failed to generate exam:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const startExam = () => {
    if (generatedExam) {
      // Store exam in localStorage for the proctor
      localStorage.setItem('currentExam', JSON.stringify(generatedExam));
      // Navigate to proctor
      window.location.href = '/apex/proctor';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 text-white">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link 
              href="/apex" 
              className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 transition-colors mb-4"
            >
              ← Back to Hub
            </Link>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              ⚡ Create Practice Exam
            </h1>
            <p className="text-gray-300 mt-2">
              Generate a custom DAT practice exam with your preferred sections and difficulty
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Configuration Panel */}
          <div className="lg:col-span-2 space-y-6">
            {/* Exam Mode */}
            <div className="bg-gray-800/50 rounded-lg p-6 border border-gray-700">
              <h3 className="text-xl font-semibold mb-4 text-blue-400">📋 Exam Configuration</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Exam Mode</label>
                  <select
                    value={options.mode}
                    onChange={(e) => setOptions(prev => ({ ...prev, mode: e.target.value as any }))}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="practice">Practice Mode</option>
                    <option value="timed">Timed Practice</option>
                    <option value="full-exam">Full Simulation</option>
                    <option value="quick">Quick Practice</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Difficulty</label>
                  <select
                    value={options.difficulty}
                    onChange={(e) => setOptions(prev => ({ ...prev, difficulty: e.target.value as any }))}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                    <option value="mixed">Mixed (Recommended)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Total Questions</label>
                  <input
                    type="number"
                    min="10"
                    max="280"
                    value={options.questionCount || 120}
                    onChange={(e) => setOptions(prev => ({ ...prev, questionCount: parseInt(e.target.value) }))}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Time Limit (minutes)</label>
                  <input
                    type="number"
                    min="15"
                    max="300"
                    value={options.timeLimit || 120}
                    onChange={(e) => setOptions(prev => ({ ...prev, timeLimit: parseInt(e.target.value) }))}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="mt-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={options.randomize}
                    onChange={(e) => setOptions(prev => ({ ...prev, randomize: e.target.checked }))}
                    className="rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-300">Randomize question order</span>
                </label>
              </div>
            </div>

            {/* Section Selection */}
            <div className="bg-gray-800/50 rounded-lg p-6 border border-gray-700">
              <h3 className="text-xl font-semibold mb-4 text-blue-400">📚 DAT Sections</h3>
              
              <div className="space-y-4">
                {DAT_SECTIONS.map((section) => {
                  const isSelected = options.sections?.includes(section.id) ?? false;
                  
                  const sectionColors = {
                    'survey-natural-sciences': 'from-green-600 to-emerald-600',
                    'perceptual-ability': 'from-blue-600 to-cyan-600',
                    'reading-comprehension': 'from-purple-600 to-violet-600',
                    'quantitative-reasoning': 'from-orange-600 to-red-600'
                  };
                  
                  return (
                    <div key={section.id} className={`p-4 rounded-lg border-2 transition-all ${
                      isSelected 
                        ? 'border-blue-500 bg-blue-500/10' 
                        : 'border-gray-600 bg-gray-700/30'
                    }`}>
                      <div className="flex items-center justify-between mb-3">
                        <label className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleSectionToggle(section.id)}
                            className="rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
                          />
                          <div>
                            <div className="font-medium text-white">{section.name}</div>
                            <div className="text-sm text-gray-400">{section.description}</div>
                          </div>
                        </label>
                        <div className={`px-3 py-1 rounded-full text-xs font-medium bg-gradient-to-r ${sectionColors[section.id as keyof typeof sectionColors]} text-white`}>
                          {section.shortName}
                        </div>
                      </div>
                      
                      {isSelected && (
                        <div className="mt-3 pt-3 border-t border-gray-600">
                          <div className="text-xs text-gray-400">
                            Default: {section.questionCount} questions • {section.timeLimit} minutes
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            Topics: {section.topics.slice(0, 3).join(', ')}{section.topics.length > 3 ? '...' : ''}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Summary & Actions */}
          <div className="space-y-6">
            {/* Exam Summary */}
            <div className="bg-gradient-to-br from-blue-900/50 to-purple-900/50 rounded-lg p-6 border border-blue-500/30">
              <h3 className="text-xl font-semibold mb-4 text-blue-400">📊 Exam Summary</h3>
              
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-300">Selected Sections:</span>
                  <span className="font-medium text-white">{options.sections?.length || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-300">Total Questions:</span>
                  <span className="font-medium text-white">{options.questionCount || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-300">Time Limit:</span>
                  <span className="font-medium text-white">{options.timeLimit || 0} min</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-300">Mode:</span>
                  <span className="font-medium text-white capitalize">{options.mode}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-300">Difficulty:</span>
                  <span className="font-medium text-white capitalize">{options.difficulty}</span>
                </div>
              </div>
            </div>

            {/* Generate Button */}
            <button
              onClick={generateExam}
              disabled={!options.sections?.length || isGenerating}
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white font-semibold py-4 px-6 rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl"
            >
              {isGenerating ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  Generating Exam...
                </div>
              ) : (
                '⚡ Generate Practice Exam'
              )}
            </button>

            {/* Generated Exam Actions */}
            {generatedExam && (
              <div className="bg-green-900/30 rounded-lg p-6 border border-green-500/30">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-2xl">✅</span>
                  <h4 className="text-lg font-semibold text-green-400">Exam Generated!</h4>
                </div>
                <p className="text-green-200 text-sm mb-4">
                  Your custom DAT practice exam is ready with {generatedExam.questions?.length || 0} questions.
                </p>
                <button
                  onClick={startExam}
                  className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold py-3 px-4 rounded-lg transition-all duration-200"
                >
                  🚀 Start Exam
                </button>
              </div>
            )}

            {/* Quick Presets */}
            <div className="bg-gray-800/50 rounded-lg p-6 border border-gray-700">
              <h4 className="text-lg font-semibold mb-3 text-gray-300">⚡ Quick Presets</h4>
              <div className="space-y-2">
                <button
                  onClick={() => setOptions({
                    mode: 'quick',
                    sections: ['survey-natural-sciences'],
                    questionCount: 30,
                    timeLimit: 30,
                    difficulty: 'mixed',
                    randomize: true
                  })}
                  className="w-full text-left px-3 py-2 rounded bg-gray-700 hover:bg-gray-600 transition-colors text-sm"
                >
                  🧪 SNS Quick Practice (30 min)
                </button>
                <button
                  onClick={() => setOptions({
                    mode: 'quick',
                    sections: ['perceptual-ability'],
                    questionCount: 30,
                    timeLimit: 30,
                    difficulty: 'mixed',
                    randomize: true
                  })}
                  className="w-full text-left px-3 py-2 rounded bg-gray-700 hover:bg-gray-600 transition-colors text-sm"
                >
                  🎯 PAT Quick Practice (30 min)
                </button>
                <button
                  onClick={() => setOptions({
                    mode: 'full-exam',
                    sections: DAT_SECTIONS.map(s => s.id),
                    questionCount: 280,
                    timeLimit: 255,
                    difficulty: 'mixed',
                    randomize: true
                  })}
                  className="w-full text-left px-3 py-2 rounded bg-gray-700 hover:bg-gray-600 transition-colors text-sm"
                >
                  🎓 Full DAT Simulation (4h 15min)
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
