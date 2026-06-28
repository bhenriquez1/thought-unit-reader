"use client";

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { DAT_SECTIONS } from '@/types/apex-exam';
import { getAllUltraNotes } from '@/lib/notelab/ultraNoteStore';
import { buildExam } from '@/lib/examEngine/examBuilder';
import { builtExamToGeneratedExam } from '@/lib/examEngine/legacyAdapter';
import { DAT_EXAM_PROFILE } from '@/lib/examEngine/profiles/datProfile';
import type { DifficultyLevel } from '@/lib/examEngine/types';
import type { GeneratedExam } from '@/lib/apex/examGenerator';

const DIFFICULTY_OPTIONS: { value: DifficultyLevel; label: string; blurb: string }[] = [
  { value: 'foundation', label: 'Foundation Exam', blurb: 'Concept-by-concept, easy pacing' },
  { value: 'simulation', label: 'DAT Simulation', blurb: 'Timed, mixed, real-DAT pacing' },
  { value: 'mastery', label: 'Mastery Exam', blurb: 'Harder than the DAT, multi-concept, trap-heavy' },
];

interface GeneratorConfig {
  bookId: string;
  sectionIds: string[];
  questionCount: number;
  timeLimit: number;
  difficulty: DifficultyLevel;
  randomize: boolean;
}

export default function ExamGeneratorPage() {
  const books = useMemo(() => {
    const byId = new Map<string, { bookId: string; bookTitle: string; noteCount: number }>();
    for (const note of getAllUltraNotes()) {
      const existing = byId.get(note.bookId);
      if (existing) {
        existing.noteCount += 1;
      } else {
        byId.set(note.bookId, { bookId: note.bookId, bookTitle: note.bookTitle || note.bookId, noteCount: 1 });
      }
    }
    return Array.from(byId.values()).sort((a, b) => b.noteCount - a.noteCount);
  }, []);

  const [options, setOptions] = useState<GeneratorConfig>({
    bookId: books[0]?.bookId ?? '',
    sectionIds: DAT_SECTIONS.map((s) => s.id),
    questionCount: 40,
    timeLimit: 90,
    difficulty: 'simulation',
    randomize: true,
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedExam, setGeneratedExam] = useState<GeneratedExam | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);

  const selectedBook = books.find((b) => b.bookId === options.bookId) ?? null;

  const handleSectionToggle = (sectionId: string) => {
    setOptions((prev) => ({
      ...prev,
      sectionIds: prev.sectionIds.includes(sectionId)
        ? prev.sectionIds.filter((s) => s !== sectionId)
        : [...prev.sectionIds, sectionId],
    }));
  };

  const generateExam = async () => {
    if (!options.bookId) return;
    setIsGenerating(true);
    setGenerationError(null);
    try {
      const built = await buildExam({
        bookId: options.bookId,
        bookTitle: selectedBook?.bookTitle,
        profile: DAT_EXAM_PROFILE,
        difficulty: options.difficulty,
        questionCount: options.questionCount,
        sectionIds: options.sectionIds,
        randomize: options.randomize,
      });
      if (built.questions.length === 0) {
        setGenerationError('No questions could be generated — this book has no notes in the selected sections yet. Read and synthesize a few pages first.');
        setGeneratedExam(null);
        return;
      }
      const exam = builtExamToGeneratedExam(built, options.timeLimit);
      setGeneratedExam(exam);
      console.log('Generated exam:', exam);
    } catch (error) {
      console.error('Failed to generate exam:', error);
      setGenerationError('Question generation failed — check that an AI key is configured for /api/exam-question-gen.');
    } finally {
      setIsGenerating(false);
    }
  };

  const startExam = () => {
    if (generatedExam) {
      localStorage.setItem('currentExam', JSON.stringify(generatedExam));
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
              AI-generated questions grounded in your own uploaded book — never a copied question bank.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Configuration Panel */}
          <div className="lg:col-span-2 space-y-6">
            {/* Book Picker */}
            <div className="bg-gray-800/50 rounded-lg p-6 border border-gray-700">
              <h3 className="text-xl font-semibold mb-4 text-blue-400">📖 Source Book</h3>
              {books.length === 0 ? (
                <p className="text-sm text-gray-400">
                  No uploaded books with notes yet. Open a book in the Reader and let it synthesize a few pages,
                  then come back here to generate questions grounded in that material.
                </p>
              ) : (
                <select
                  value={options.bookId}
                  onChange={(e) => setOptions((prev) => ({ ...prev, bookId: e.target.value }))}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {books.map((b) => (
                    <option key={b.bookId} value={b.bookId}>
                      {b.bookTitle} ({b.noteCount} page{b.noteCount === 1 ? '' : 's'} synthesized)
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Exam Mode */}
            <div className="bg-gray-800/50 rounded-lg p-6 border border-gray-700">
              <h3 className="text-xl font-semibold mb-4 text-blue-400">📋 Exam Configuration</h3>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-300 mb-2">Exam Mode</label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {DIFFICULTY_OPTIONS.map((d) => (
                    <button
                      key={d.value}
                      onClick={() => setOptions((prev) => ({ ...prev, difficulty: d.value }))}
                      className={`text-left p-3 rounded-lg border-2 transition-all ${
                        options.difficulty === d.value
                          ? 'border-blue-500 bg-blue-500/10'
                          : 'border-gray-600 bg-gray-700/30 hover:border-gray-500'
                      }`}
                    >
                      <div className="font-medium text-white">{d.label}</div>
                      <div className="text-xs text-gray-400 mt-1">{d.blurb}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Total Questions</label>
                  <input
                    type="number"
                    min="5"
                    max="200"
                    value={options.questionCount}
                    onChange={(e) => setOptions((prev) => ({ ...prev, questionCount: parseInt(e.target.value) || 0 }))}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Time Limit (minutes)</label>
                  <input
                    type="number"
                    min="10"
                    max="300"
                    value={options.timeLimit}
                    onChange={(e) => setOptions((prev) => ({ ...prev, timeLimit: parseInt(e.target.value) || 0 }))}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="mt-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={options.randomize}
                    onChange={(e) => setOptions((prev) => ({ ...prev, randomize: e.target.checked }))}
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
                  const isSelected = options.sectionIds.includes(section.id);

                  const sectionColors: Record<string, string> = {
                    'survey-natural-sciences': 'from-green-600 to-emerald-600',
                    'perceptual-ability': 'from-blue-600 to-cyan-600',
                    'reading-comprehension': 'from-purple-600 to-violet-600',
                    'quantitative-reasoning': 'from-orange-600 to-red-600',
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
                        <div className={`px-3 py-1 rounded-full text-xs font-medium bg-gradient-to-r ${sectionColors[section.id] ?? 'from-gray-600 to-gray-700'} text-white`}>
                          {section.shortName}
                        </div>
                      </div>
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
                  <span className="text-gray-300">Source Book:</span>
                  <span className="font-medium text-white truncate max-w-[60%]">{selectedBook?.bookTitle ?? '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-300">Selected Sections:</span>
                  <span className="font-medium text-white">{options.sectionIds.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-300">Total Questions:</span>
                  <span className="font-medium text-white">{options.questionCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-300">Time Limit:</span>
                  <span className="font-medium text-white">{options.timeLimit} min</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-300">Mode:</span>
                  <span className="font-medium text-white">
                    {DIFFICULTY_OPTIONS.find((d) => d.value === options.difficulty)?.label}
                  </span>
                </div>
              </div>
            </div>

            {/* Generate Button */}
            <button
              onClick={generateExam}
              disabled={!options.bookId || !options.sectionIds.length || isGenerating}
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

            {generationError && (
              <div className="bg-red-900/30 rounded-lg p-4 border border-red-500/30 text-sm text-red-200">
                {generationError}
              </div>
            )}

            {/* Generated Exam Actions */}
            {generatedExam && (
              <div className="bg-green-900/30 rounded-lg p-6 border border-green-500/30">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-2xl">✅</span>
                  <h4 className="text-lg font-semibold text-green-400">Exam Generated!</h4>
                </div>
                <p className="text-green-200 text-sm mb-4">
                  Your AI-generated DAT practice exam is ready with {generatedExam.questions?.length || 0} questions.
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
                  onClick={() => setOptions((prev) => ({
                    ...prev,
                    difficulty: 'foundation',
                    sectionIds: DAT_SECTIONS.map((s) => s.id),
                    questionCount: 20,
                    timeLimit: 30,
                  }))}
                  className="w-full text-left px-3 py-2 rounded bg-gray-700 hover:bg-gray-600 transition-colors text-sm"
                >
                  🌱 Foundation Quick Practice (20 questions)
                </button>
                <button
                  onClick={() => setOptions((prev) => ({
                    ...prev,
                    difficulty: 'simulation',
                    sectionIds: DAT_SECTIONS.map((s) => s.id),
                    questionCount: 60,
                    timeLimit: 120,
                  }))}
                  className="w-full text-left px-3 py-2 rounded bg-gray-700 hover:bg-gray-600 transition-colors text-sm"
                >
                  🎯 Full DAT Simulation (60 questions)
                </button>
                <button
                  onClick={() => setOptions((prev) => ({
                    ...prev,
                    difficulty: 'mastery',
                    sectionIds: DAT_SECTIONS.map((s) => s.id),
                    questionCount: 30,
                    timeLimit: 75,
                  }))}
                  className="w-full text-left px-3 py-2 rounded bg-gray-700 hover:bg-gray-600 transition-colors text-sm"
                >
                  🔥 Mastery Drill (30 questions)
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
