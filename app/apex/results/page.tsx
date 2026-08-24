"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { calculateSectionScore, formatTime, DAT_SECTIONS } from '@/types/apex-exam';
import type { ExamAttempt, DATQuestion } from '@/types/apex-exam';
import type { GeneratedExam } from '@/lib/apex/examGenerator';
import TUExplainModal from '@/components/apex/TUExplainModal';
import { mistakeLogger } from '@/lib/apex/mistakeLogger';
import { buildWeaknessReport } from '@/lib/examEngine/weaknessAnalytics';
import { buildStudyRecommendation } from '@/lib/examEngine/recommendationEngine';
import { DAT_EXAM_PROFILE, DAT_EXAM_PROFILE_ID } from '@/lib/examEngine/profiles/datProfile';
import { CUSTOM_EXAM_PROFILE, CUSTOM_EXAM_PROFILE_ID } from '@/lib/examEngine/profiles/customProfile';
import { legacyToDifficulty } from '@/lib/examEngine/legacyAdapter';
import type { QuestionAttempt, QuestionType, StudyRecommendation } from '@/lib/examEngine/types';
import type { ExamProfile } from '@/lib/examEngine/types';

// P0 fix — every attempt used to be scored, persisted, and analyzed as if it
// were DAT (DAT_SECTIONS for section breakdown, DAT_EXAM_PROFILE_ID for the
// weakness report), regardless of which profile actually generated the exam.
// A Custom Exam attempt's questions carry sectionId "general", which never
// matches any of the 4 DAT_SECTIONS entries, so its section-score table came
// back silently empty and its weakness report was thresholded using DAT's
// numbers. Resolve the real profile from the exam's own questions instead.
function resolveExamProfile(examProfileId: string | undefined): ExamProfile {
  return examProfileId === CUSTOM_EXAM_PROFILE_ID ? CUSTOM_EXAM_PROFILE : DAT_EXAM_PROFILE;
}
import { useTocStore } from '@/lib/stores/tocStore';
import { chapterForPage } from '@/lib/apex/bookCatalogue';
import { getCurrentApexUserId } from '@/lib/apex/currentApexUserId';
import { writeViewSourceLink } from '@/lib/canonical/viewSourceLink';

const DEV = process.env.NODE_ENV === "development";

const ANSWER_LETTERS = ['A', 'B', 'C', 'D', 'E'];

function buildEngineAttempts(exam: GeneratedExam, attempt: ExamAttempt): QuestionAttempt[] {
  return exam.questions.map((q) => {
    const response = attempt.responses.find((r) => r.questionId === q.id);
    return {
      id: `${attempt.id}-${q.id}`,
      questionId: q.id,
      examProfileId: q.examProfileId ?? DAT_EXAM_PROFILE_ID,
      bookId: q.sourceBookId ?? 'unknown',
      examAttemptId: attempt.id,
      section: q.sectionId,
      topic: q.topic,
      difficulty: legacyToDifficulty(q.difficulty),
      questionType: (q.engineQuestionType as QuestionType) ?? 'application',
      correct: !!response && response.selectedAnswer === q.correctAnswer,
      selectedIndex: response?.selectedAnswer ? ANSWER_LETTERS.indexOf(response.selectedAnswer) : -1,
      timeSeconds: response?.timeSpent ?? 0,
      trapTriggered: q.trapType,
      createdAt: response?.timestamp ?? attempt.startTime,
    };
  });
}

interface ExamResults {
  attempt: ExamAttempt;
  exam: GeneratedExam;
  examProfileId: string;
  totalScore: number;
  percentageScore: number;
  sectionScores: {
    sectionId: string;
    sectionName: string;
    score: number;
    total: number;
    percentage: number;
  }[];
  topicPerformance: {
    topic: string;
    correct: number;
    total: number;
    percentage: number;
  }[];
  difficultyBreakdown: {
    easy: { correct: number; total: number; percentage: number };
    medium: { correct: number; total: number; percentage: number };
    hard: { correct: number; total: number; percentage: number };
  };
  timeAnalysis: {
    totalTime: number;
    averageTimePerQuestion: number;
    questionsAnswered: number;
    questionsSkipped: number;
    questionsFlagged: number;
  };
}

export default function ExamResultsPage() {
  const router = useRouter();
  const [results, setResults] = useState<ExamResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'sections' | 'chapters' | 'topics' | 'review'>('overview');
  const tocs = useTocStore((s) => s.tocs);
  const [tuModalOpen, setTuModalOpen] = useState(false);
  const [selectedQuestion, setSelectedQuestion] = useState<DATQuestion | null>(null);
  const [selectedUserAnswer, setSelectedUserAnswer] = useState<string | undefined>(undefined);
  const [recommendation, setRecommendation] = useState<StudyRecommendation | null>(null);
  const [recommendationError, setRecommendationError] = useState<string | null>(null);

  function handleViewSource(question: DATQuestion) {
    if (!question.sourceBookId || !question.sourcePageNumber) return;
    writeViewSourceLink({
      documentId: question.sourceBookId,
      pageNumber: question.sourcePageNumber,
      unitIds: question.sourceThoughtUnitIds,
      quote: question.stem.slice(0, 180),
      bookTitle: question.sourceBookId,
    });
    router.push('/');
  }

  useEffect(() => {
    const loadResults = () => {
      try {
        const examResultsData = localStorage.getItem('examResults');

        if (!examResultsData) {
          setLoading(false);
          return;
        }

        // Proctor embeds the exam in examResults (_exam) after clearing currentExam,
        // so we always have the questions available even after submit clears localStorage.
        const parsed = JSON.parse(examResultsData);
        const attempt: ExamAttempt = parsed;
        let exam: GeneratedExam | null = null;

        // Priority: embedded exam → currentExam fallback (resume flow)
        if (parsed._exam) {
          exam = parsed._exam as GeneratedExam;
        } else {
          const examData = localStorage.getItem('currentExam');
          if (examData) exam = JSON.parse(examData);
        }

        if (!exam) {
          setLoading(false);
          return;
        }

        // Calculate results
        const totalQuestions = exam.questions.length;
        const correctAnswers = attempt.responses.filter(response => {
          const question = exam!.questions.find(q => q.id === response.questionId);
          return question && response.selectedAnswer === question.correctAnswer;
        }).length;

        const totalScore = correctAnswers;
        const percentageScore = Math.round((correctAnswers / totalQuestions) * 100);

        // Resolve the profile that actually generated this exam from its own
        // questions, rather than assuming DAT — see resolveExamProfile above.
        const examProfileId = exam.questions.find(q => q.examProfileId)?.examProfileId ?? DAT_EXAM_PROFILE_ID;
        const activeProfile = resolveExamProfile(examProfileId);
        const profileSections = activeProfile.id === DAT_EXAM_PROFILE_ID ? DAT_SECTIONS : activeProfile.sections;

        // Section scores
        const sectionScores = profileSections.map(section => {
          const sectionQuestions = exam!.questions.filter(q => q.sectionId === section.id);
          const sectionResponses = attempt.responses.filter(r => 
            sectionQuestions.some(q => q.id === r.questionId)
          );
          const sectionCorrect = sectionResponses.filter(response => {
            const question = sectionQuestions.find(q => q.id === response.questionId);
            return question && response.selectedAnswer === question.correctAnswer;
          }).length;

          return {
            sectionId: section.id,
            sectionName: section.name,
            score: sectionCorrect,
            total: sectionQuestions.length,
            percentage: sectionQuestions.length > 0 ? Math.round((sectionCorrect / sectionQuestions.length) * 100) : 0
          };
        }).filter(section => section.total > 0);

        // Topic performance
        const topicMap = new Map<string, { correct: number; total: number }>();
        exam.questions.forEach(question => {
          const response = attempt.responses.find(r => r.questionId === question.id);
          const isCorrect = response?.selectedAnswer === question.correctAnswer;
          
          const current = topicMap.get(question.topic) || { correct: 0, total: 0 };
          topicMap.set(question.topic, {
            correct: current.correct + (isCorrect ? 1 : 0),
            total: current.total + 1
          });
        });

        const topicPerformance = Array.from(topicMap.entries()).map(([topic, stats]) => ({
          topic,
          correct: stats.correct,
          total: stats.total,
          percentage: Math.round((stats.correct / stats.total) * 100)
        })).sort((a, b) => b.percentage - a.percentage);

        // Difficulty breakdown
        const difficultyMap = new Map<string, { correct: number; total: number }>();
        exam.questions.forEach(question => {
          const response = attempt.responses.find(r => r.questionId === question.id);
          const isCorrect = response?.selectedAnswer === question.correctAnswer;
          
          const current = difficultyMap.get(question.difficulty) || { correct: 0, total: 0 };
          difficultyMap.set(question.difficulty, {
            correct: current.correct + (isCorrect ? 1 : 0),
            total: current.total + 1
          });
        });

        const difficultyBreakdown = {
          easy: {
            ...(difficultyMap.get('easy') || { correct: 0, total: 0 }),
            percentage: 0
          },
          medium: {
            ...(difficultyMap.get('medium') || { correct: 0, total: 0 }),
            percentage: 0
          },
          hard: {
            ...(difficultyMap.get('hard') || { correct: 0, total: 0 }),
            percentage: 0
          }
        };

        // Add percentages
        Object.keys(difficultyBreakdown).forEach(key => {
          const stats = difficultyBreakdown[key as keyof typeof difficultyBreakdown];
          stats.percentage = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
        });

        // Time analysis
        const startTime = new Date(attempt.startTime).getTime();
        const endTime = new Date(attempt.endTime || new Date().toISOString()).getTime();
        const totalTime = Math.round((endTime - startTime) / 1000); // seconds
        const questionsAnswered = attempt.responses.filter(r => r.selectedAnswer).length;
        const questionsFlagged = attempt.responses.filter(r => r.flagged).length;

        const timeAnalysis = {
          totalTime,
          averageTimePerQuestion: questionsAnswered > 0 ? Math.round(totalTime / questionsAnswered) : 0,
          questionsAnswered,
          questionsSkipped: totalQuestions - questionsAnswered,
          questionsFlagged
        };

        setResults({
          attempt,
          exam,
          examProfileId,
          totalScore,
          percentageScore,
          sectionScores,
          topicPerformance,
          difficultyBreakdown,
          timeAnalysis
        });

        // Log mistakes for spaced repetition
        try {
          const userId = getCurrentApexUserId();
          mistakeLogger.logMistakesFromAttempt(userId, attempt, exam.questions);
        } catch (mistakeError) {
          DEV && console.error('Failed to log mistakes:', mistakeError);
        }

      } catch (error) {
        DEV && console.error('Failed to load results:', error);
      } finally {
        setLoading(false);
      }
    };

    loadResults();
  }, []);

  useEffect(() => {
    if (!results) return;
    const bookId = results.exam.questions.find((q) => q.sourceBookId)?.sourceBookId;
    if (!bookId) return;

    const activeProfile = resolveExamProfile(results.examProfileId);
    const attempts = buildEngineAttempts(results.exam, results.attempt);
    const report = buildWeaknessReport(bookId, activeProfile.id, attempts, activeProfile.weaknessAnalytics);

    let cancelled = false;
    buildStudyRecommendation(report, activeProfile, bookId)
      .then((rec) => {
        if (!cancelled) setRecommendation(rec);
      })
      .catch((error) => {
        DEV && console.error('Failed to build study recommendation:', error);
        if (!cancelled) setRecommendationError('Could not build a study recommendation for this attempt.');
      });
    return () => {
      cancelled = true;
    };
  }, [results]);

  const exportResults = (format: 'json' | 'csv') => {
    if (!results) return;

    if (format === 'json') {
      const dataStr = JSON.stringify(results, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `dat-apex-results-${new Date().toISOString().split('T')[0]}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } else if (format === 'csv') {
      const csvData = [
        ['Section', 'Score', 'Total', 'Percentage'],
        ...results.sectionScores.map(s => [s.sectionName, s.score.toString(), s.total.toString(), `${s.percentage}%`]),
        [],
        ['Topic', 'Correct', 'Total', 'Percentage'],
        ...results.topicPerformance.map(t => [t.topic, t.correct.toString(), t.total.toString(), `${t.percentage}%`]),
        [],
        ['Overall Score', results.totalScore.toString(), results.exam.questions.length.toString(), `${results.percentageScore}%`]
      ];
      
      const csvContent = csvData.map(row => row.join(',')).join('\n');
      const dataBlob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `dat-apex-results-${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleTUExplain = (question: DATQuestion, userAnswer?: string) => {
    setSelectedQuestion(question);
    setSelectedUserAnswer(userAnswer);
    setTuModalOpen(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400 mx-auto mb-4"></div>
          <h1 className="text-xl font-semibold">Loading Results...</h1>
        </div>
      </div>
    );
  }

  if (!results) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">📊</div>
          <h1 className="text-2xl font-bold mb-4">No Results Found</h1>
          <p className="text-gray-300 mb-6">Complete an exam to see your results here.</p>
          <Link 
            href="/apex/generator" 
            className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg font-semibold transition-colors"
          >
            Take Practice Exam
          </Link>
        </div>
      </div>
    );
  }

  const getScoreColor = (percentage: number) => {
    if (percentage >= 80) return 'text-green-400';
    if (percentage >= 70) return 'text-yellow-400';
    if (percentage >= 60) return 'text-orange-400';
    return 'text-red-400';
  };

  const getScoreBg = (percentage: number) => {
    if (percentage >= 80) return 'bg-green-600';
    if (percentage >= 70) return 'bg-yellow-600';
    if (percentage >= 60) return 'bg-orange-600';
    return 'bg-red-600';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 text-white">
      {/* Header */}
      <div className="bg-gray-800/90 border-b border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-blue-400">📊 Avrrio TestLab Results</h1>
            <p className="text-gray-300 text-sm mt-1">
              Completed: {new Date(results.attempt.endTime || '').toLocaleString()}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-2xl font-bold">
                <span className={getScoreColor(results.percentageScore)}>
                  {results.percentageScore}%
                </span>
              </div>
              <div className="text-sm text-gray-400">
                {results.totalScore} / {results.exam.questions.length}
              </div>
            </div>
            <Link
              href="/apex"
              className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg font-semibold transition-colors"
            >
              Back to Hub
            </Link>
          </div>
        </div>
      </div>

      {/* Setup-flow resequencing: close the "review weaknesses -> regenerate
          targeted practice" loop explicitly instead of leaving both as
          something the student has to discover on their own via "Back to Hub". */}
      <div className="bg-gray-800/50 border-b border-gray-700 px-6 py-3">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center gap-3">
          <span className="text-sm text-gray-400">Next:</span>
          <Link
            href="/apex?tab=mistakes"
            className="text-sm px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium transition-colors"
          >
            🔍 Review Weaknesses
          </Link>
          <Link
            href="/apex?tab=today"
            className="text-sm px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 rounded-lg font-medium transition-colors"
          >
            🎯 Practice Weak Areas
          </Link>
        </div>
      </div>

      <div className="p-6">
        <div className="max-w-6xl mx-auto">
          {/* Tab Navigation */}
          <div className="flex flex-wrap gap-1 mb-6 bg-gray-800/50 rounded-lg p-1">
            {[
              { id: 'overview', label: '📊 Overview' },
              { id: 'sections', label: '📚 Sections' },
              { id: 'chapters', label: '📑 Chapters' },
              { id: 'topics', label: '🎯 Topics' },
              { id: 'review', label: '🔍 Review' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`flex-1 px-3 py-2 rounded-lg font-semibold transition-all text-sm ${
                  activeTab === tab.id
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Diagnostic & Study Recommendation */}
              {recommendation && (
                <div className="bg-gradient-to-br from-purple-900/40 to-blue-900/40 rounded-lg p-6 border border-purple-500/30">
                  <h3 className="text-xl font-semibold mb-3 text-purple-300">🧭 Diagnostic & Next Steps</h3>
                  <p className="text-gray-200 text-sm mb-4 whitespace-pre-line">{recommendation.narrative}</p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-black/20 rounded-lg p-4">
                      <div className="text-xs font-semibold text-gray-400 uppercase mb-2">Weakest Topics</div>
                      {recommendation.weakestTopics.length > 0 ? (
                        <ul className="space-y-1 text-sm text-red-200">
                          {recommendation.weakestTopics.map((topic) => (
                            <li key={topic}>• {topic}</li>
                          ))}
                        </ul>
                      ) : (
                        <div className="text-sm text-gray-400">No clear weak spots yet — keep practicing.</div>
                      )}
                    </div>

                    <div className="bg-black/20 rounded-lg p-4">
                      <div className="text-xs font-semibold text-gray-400 uppercase mb-2">Highest-Return Topic</div>
                      <div className="text-sm text-yellow-200">
                        {recommendation.highestReturnTopic ?? 'Not enough data yet'}
                      </div>
                      <div className="text-xs font-semibold text-gray-400 uppercase mt-3 mb-1">Next Exam Mode</div>
                      <div className="text-sm text-blue-200 capitalize">{recommendation.nextExamMode}</div>
                    </div>
                  </div>

                  {recommendation.readerPages.length > 0 && (
                    <div className="mt-4 bg-black/20 rounded-lg p-4">
                      <div className="text-xs font-semibold text-gray-400 uppercase mb-2">Review in the Reader</div>
                      <ul className="space-y-1 text-sm text-gray-200">
                        {recommendation.readerPages.map((rp, i) => (
                          <li key={i}>📖 {rp.topic} — page {rp.pageNumber}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {recommendation.recallSetId && (
                    <div className="mt-4 text-sm text-gray-300">
                      🎯 A weak-topic review set has been built — open <span className="font-semibold text-indigo-300">Recall Lab</span> in the Reader to study it.
                    </div>
                  )}

                  {recommendation.podcastDeepLink && (
                    <div className="mt-2 text-sm text-gray-300">
                      🎧 Cram this in Podcast Lab — open page {recommendation.podcastDeepLink.pageNumber} in the Reader and start a page-review podcast.
                    </div>
                  )}
                </div>
              )}

              {recommendationError && (
                <div className="bg-red-900/20 rounded-lg p-4 border border-red-500/30 text-sm text-red-200">
                  {recommendationError}
                </div>
              )}

              {/* Score Summary */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-gray-800/50 rounded-lg p-6 text-center">
                  <div className="text-3xl font-bold mb-2">
                    <span className={getScoreColor(results.percentageScore)}>
                      {results.percentageScore}%
                    </span>
                  </div>
                  <div className="text-gray-400">Overall Score</div>
                  <div className="text-sm text-gray-500 mt-1">
                    {results.totalScore} / {results.exam.questions.length}
                  </div>
                </div>

                <div className="bg-gray-800/50 rounded-lg p-6 text-center">
                  <div className="text-3xl font-bold mb-2 text-blue-400">
                    {formatTime(results.timeAnalysis.totalTime)}
                  </div>
                  <div className="text-gray-400">Total Time</div>
                  <div className="text-sm text-gray-500 mt-1">
                    Avg: {formatTime(results.timeAnalysis.averageTimePerQuestion)}/q
                  </div>
                </div>

                <div className="bg-gray-800/50 rounded-lg p-6 text-center">
                  <div className="text-3xl font-bold mb-2 text-green-400">
                    {results.timeAnalysis.questionsAnswered}
                  </div>
                  <div className="text-gray-400">Answered</div>
                  <div className="text-sm text-gray-500 mt-1">
                    {results.timeAnalysis.questionsSkipped} skipped
                  </div>
                </div>

                <div className="bg-gray-800/50 rounded-lg p-6 text-center">
                  <div className="text-3xl font-bold mb-2 text-yellow-400">
                    {results.timeAnalysis.questionsFlagged}
                  </div>
                  <div className="text-gray-400">Flagged</div>
                  <div className="text-sm text-gray-500 mt-1">
                    For review
                  </div>
                </div>
              </div>

              {/* Difficulty Breakdown */}
              <div className="bg-gray-800/50 rounded-lg p-6">
                <h3 className="text-xl font-semibold mb-4 text-blue-400">📈 Performance by Difficulty</h3>
                <div className="grid grid-cols-3 gap-4">
                  {Object.entries(results.difficultyBreakdown).map(([difficulty, stats]) => (
                    <div key={difficulty} className="text-center">
                      <div className="text-lg font-semibold capitalize mb-2">{difficulty}</div>
                      <div className="relative w-full bg-gray-700 rounded-full h-4 mb-2">
                        <div 
                          className={`h-4 rounded-full ${getScoreBg((stats as any).percentage)}`}
                          style={{ width: `${(stats as any).percentage}%` }}
                        ></div>
                      </div>
                      <div className="text-sm">
                        <span className={getScoreColor((stats as any).percentage)}>
                          {(stats as any).percentage}%
                        </span>
                        <span className="text-gray-400 ml-2">
                          ({stats.correct}/{stats.total})
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Export Options */}
              <div className="bg-gray-800/50 rounded-lg p-6">
                <h3 className="text-xl font-semibold mb-4 text-blue-400">📤 Export Results</h3>
                <div className="flex gap-4">
                  <button
                    onClick={() => exportResults('json')}
                    className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg font-semibold transition-colors"
                  >
                    📄 Export JSON
                  </button>
                  <button
                    onClick={() => exportResults('csv')}
                    className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg font-semibold transition-colors"
                  >
                    📊 Export CSV
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Sections Tab */}
          {activeTab === 'sections' && (
            <div className="space-y-4">
              <h3 className="text-xl font-semibold text-blue-400">📚 Section Performance</h3>
              {results.sectionScores.map(section => (
                <div key={section.sectionId} className="bg-gray-800/50 rounded-lg p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-lg font-semibold">{section.sectionName}</h4>
                    <div className="text-right">
                      <div className={`text-xl font-bold ${getScoreColor(section.percentage)}`}>
                        {section.percentage}%
                      </div>
                      <div className="text-sm text-gray-400">
                        {section.score} / {section.total}
                      </div>
                    </div>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-3">
                    <div 
                      className={`h-3 rounded-full ${getScoreBg(section.percentage)}`}
                      style={{ width: `${section.percentage}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Chapters Tab */}
          {activeTab === 'chapters' && (() => {
            const bookId = results.exam.questions.find((q) => q.sourceBookId)?.sourceBookId ?? '';
            const toc = tocs[bookId] ?? null;
            const tocItems = toc?.items ?? [];

            const chapterMap = new Map<string, { correct: number; total: number; pages: number[] }>();
            for (const question of results.exam.questions) {
              const page = question.sourcePageNumber ?? 0;
              const chapterTitle = tocItems.length > 0
                ? chapterForPage(page, tocItems)
                : page > 0
                ? `Page ${page}`
                : 'Unknown Chapter';
              const response = results.attempt.responses.find((r) => r.questionId === question.id);
              const isCorrect = response?.selectedAnswer === question.correctAnswer;
              const entry = chapterMap.get(chapterTitle) ?? { correct: 0, total: 0, pages: [] };
              entry.total += 1;
              if (isCorrect) entry.correct += 1;
              if (page > 0 && !entry.pages.includes(page)) entry.pages.push(page);
              chapterMap.set(chapterTitle, entry);
            }

            const chapterRows = Array.from(chapterMap.entries())
              .map(([title, stats]) => ({
                title,
                ...stats,
                percentage: stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0,
                pageRange: stats.pages.length > 0
                  ? `p.${Math.min(...stats.pages)}–${Math.max(...stats.pages)}`
                  : '',
              }))
              .sort((a, b) => a.percentage - b.percentage);

            return (
              <div className="space-y-4">
                <h3 className="text-xl font-semibold text-blue-400">📑 Chapter Breakdown</h3>
                {chapterRows.length === 0 ? (
                  <p className="text-sm text-gray-400">
                    No chapter data — questions were not tagged with source pages.
                  </p>
                ) : (
                  chapterRows.map((ch) => (
                    <div key={ch.title} className="bg-gray-800/50 rounded-lg p-5">
                      <div className="flex items-start justify-between mb-3 gap-3">
                        <div>
                          <h4 className="font-semibold text-white text-sm">{ch.title}</h4>
                          {ch.pageRange && (
                            <div className="text-xs text-gray-500 mt-0.5">{ch.pageRange}</div>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <div className={`text-xl font-bold ${getScoreColor(ch.percentage)}`}>
                            {ch.percentage}%
                          </div>
                          <div className="text-xs text-gray-400">
                            {ch.correct} / {ch.total}
                          </div>
                        </div>
                      </div>
                      <div className="w-full bg-gray-700 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${getScoreBg(ch.percentage)}`}
                          style={{ width: `${ch.percentage}%` }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            );
          })()}

          {/* Topics Tab */}
          {activeTab === 'topics' && (
            <div className="space-y-4">
              <h3 className="text-xl font-semibold text-blue-400">🎯 Topic Performance</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {results.topicPerformance.map(topic => (
                  <div key={topic.topic} className="bg-gray-800/50 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold">{topic.topic}</h4>
                      <span className={`font-bold ${getScoreColor(topic.percentage)}`}>
                        {topic.percentage}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-2 mb-1">
                      <div 
                        className={`h-2 rounded-full ${getScoreBg(topic.percentage)}`}
                        style={{ width: `${topic.percentage}%` }}
                      ></div>
                    </div>
                    <div className="text-xs text-gray-400">
                      {topic.correct} / {topic.total} correct
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Review Tab */}
          {activeTab === 'review' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold text-blue-400">🔍 Question Review</h3>
                <div className="text-sm text-gray-400">
                  {results.exam.questions.length} questions total
                </div>
              </div>
              
              <div className="space-y-3">
                {results.exam.questions.map((question, index) => {
                  const response = results.attempt.responses.find(r => r.questionId === question.id);
                  const isCorrect = response?.selectedAnswer === question.correctAnswer;
                  const wasAnswered = !!response?.selectedAnswer;
                  const wasFlagged = response?.flagged || false;
                  
                  return (
                    <div key={question.id} className="bg-gray-800/50 rounded-lg p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <span className="bg-blue-600 text-white px-2 py-1 rounded text-sm font-semibold">
                            Q{index + 1}
                          </span>
                          <span className="text-sm text-gray-400">
                            {question.topic} • {question.difficulty}
                          </span>
                          {wasFlagged && (
                            <span className="bg-yellow-600 text-white px-2 py-1 rounded text-xs">
                              🚩 Flagged
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {wasAnswered ? (
                            <span className={`px-2 py-1 rounded text-sm font-semibold ${
                              isCorrect ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                            }`}>
                              {isCorrect ? '✓ Correct' : '✗ Incorrect'}
                            </span>
                          ) : (
                            <span className="px-2 py-1 rounded text-sm font-semibold bg-gray-600 text-white">
                              Skipped
                            </span>
                          )}
                        </div>
                      </div>
                      
                      <div className="text-sm mb-3 text-gray-300">
                        {question.stem}
                      </div>
                      
                      <div className="grid grid-cols-1 gap-2 text-sm">
                        {Object.entries(question.options).map(([key, value]) => {
                          const isUserAnswer = response?.selectedAnswer === key;
                          const isCorrectAnswer = question.correctAnswer === key;
                          
                          return (
                            <div 
                              key={key}
                              className={`p-2 rounded ${
                                isCorrectAnswer 
                                  ? 'bg-green-600/20 border border-green-500' 
                                  : isUserAnswer 
                                  ? 'bg-red-600/20 border border-red-500'
                                  : 'bg-gray-700/30'
                              }`}
                            >
                              <span className="font-semibold text-blue-400 mr-2">{key}.</span>
                              <span>{value}</span>
                              {isCorrectAnswer && (
                                <span className="ml-2 text-green-400 font-semibold">✓</span>
                              )}
                              {isUserAnswer && !isCorrectAnswer && (
                                <span className="ml-2 text-red-400 font-semibold">✗</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      
                      {/* View Source + Explain buttons */}
                      <div className="mt-3 flex items-center gap-2 flex-wrap">
                        {question.sourceBookId && question.sourcePageNumber && (
                          <button
                            onClick={() => handleViewSource(question)}
                            className="px-2 py-1 bg-teal-700 hover:bg-teal-600 text-white rounded text-xs font-semibold transition-colors flex items-center gap-1"
                            title={`Jump to page ${question.sourcePageNumber} in the Reader`}
                          >
                            📖 View Source · p.{question.sourcePageNumber}
                          </button>
                        )}
                        <button
                          onClick={() => handleTUExplain(question, response?.selectedAnswer)}
                          className="px-2 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded text-xs font-semibold transition-colors"
                        >
                          🧠 Explain in TU
                        </button>
                      </div>

                      {question.explanation && (
                        <div className="mt-2 p-3 bg-blue-900/20 rounded border border-blue-500/30">
                          <div className="text-xs font-semibold text-blue-400 mb-1">Explanation:</div>
                          <div className="text-sm text-blue-200">{question.explanation}</div>
                        </div>
                      )}

                      {question.trapType && (
                        <div className="mt-2 p-3 bg-orange-900/20 rounded border border-orange-500/30">
                          <div className="text-xs font-semibold text-orange-400 mb-1">⚠️ Common Trap: {question.trapType}</div>
                        </div>
                      )}

                      {question.whyWrong && question.whyWrong.some(Boolean) && (
                        <div className="mt-2 p-3 bg-gray-900/30 rounded border border-gray-600/40">
                          <div className="text-xs font-semibold text-gray-400 mb-2">Why each option is wrong:</div>
                          <div className="space-y-1 text-sm text-gray-300">
                            {Object.keys(question.options).map((key, i) => {
                              if (key === question.correctAnswer) return null;
                              const why = question.whyWrong?.[i];
                              if (!why) return null;
                              return (
                                <div key={key}>
                                  <span className="font-semibold text-blue-400">{key}.</span> {why}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      
                      {!question.explanation && (
                        <div className="mt-1 p-2 bg-gray-900/20 rounded border border-gray-500/30">
                          <div className="text-xs text-gray-400">No standard explanation — use 🧠 Explain in TU above to generate one.</div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* TU Explanation Modal */}
      {selectedQuestion && (
        <TUExplainModal
          question={selectedQuestion}
          userAnswer={selectedUserAnswer}
          isOpen={tuModalOpen}
          onClose={() => {
            setTuModalOpen(false);
            setSelectedQuestion(null);
            setSelectedUserAnswer(undefined);
          }}
        />
      )}
    </div>
  );
}
