// components/courseIntelligence/CourseIntelligenceHeader.tsx
// Course Intelligence Header with controls

import React, { useRef } from 'react';
import type { Exam, SyllabusStatus } from '@/lib/courseIntelligence/types';

interface CourseIntelligenceHeaderProps {
  docTitle: string;
  examModeEnabled: boolean;
  highYieldOnly: boolean;
  explainerModeEnabled: boolean;
  selectedExamId?: string;
  syllabusStatus: SyllabusStatus;
  exams: Exam[];
  lowConfidenceCount: number;
  onExamSelect: (examId: string | undefined) => void;
  onToggleExamMode: () => void;
  onToggleHighYield: () => void;
  onToggleExplainer: () => void;
  onUploadSyllabus: (file: File) => void;
  onOpenMappingReview: () => void;
}

export const CourseIntelligenceHeader: React.FC<CourseIntelligenceHeaderProps> = ({
  docTitle,
  examModeEnabled,
  highYieldOnly,
  explainerModeEnabled,
  selectedExamId,
  syllabusStatus,
  exams,
  lowConfidenceCount,
  onExamSelect,
  onToggleExamMode,
  onToggleHighYield,
  onToggleExplainer,
  onUploadSyllabus,
  onOpenMappingReview,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUploadSyllabus(file);
    }
  };

  const getSyllabusStatusBadge = () => {
    switch (syllabusStatus) {
      case 'none':
        return <span className="text-xs px-2 py-1 bg-gray-700 text-gray-300 rounded">No Syllabus</span>;
      case 'parsing':
        return <span className="text-xs px-2 py-1 bg-blue-700 text-blue-200 rounded animate-pulse">Parsing...</span>;
      case 'mapping':
        return <span className="text-xs px-2 py-1 bg-purple-700 text-purple-200 rounded animate-pulse">Mapping...</span>;
      case 'mapped':
        return <span className="text-xs px-2 py-1 bg-green-700 text-green-200 rounded">Mapped</span>;
      case 'needs_review':
        return <span className="text-xs px-2 py-1 bg-amber-700 text-amber-200 rounded">Needs Review</span>;
      default:
        return <span className="text-xs px-2 py-1 bg-gray-700 text-gray-300 rounded">{syllabusStatus}</span>;
    }
  };

  return (
    <div className="sticky top-0 z-10 bg-gradient-to-r from-teal-900 to-cyan-900 border-b border-gray-700">
      {/* Top row: Title + Status */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🎯</span>
          <div>
            <h1 className="text-lg font-bold text-white">Course Intelligence</h1>
            <p className="text-xs text-gray-300 truncate max-w-xs">{docTitle}</p>
          </div>
          {getSyllabusStatusBadge()}
        </div>

        {/* Quick actions */}
        <div className="flex items-center gap-2">
          {lowConfidenceCount > 0 && (
            <button
              onClick={onOpenMappingReview}
              className="flex items-center gap-1 px-3 py-1.5 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-500 transition-colors"
            >
              <span>⚠️</span>
              <span>{lowConfidenceCount} to review</span>
            </button>
          )}
        </div>
      </div>

      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-2 bg-black/20">
        {/* Exam Selector */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-400">Exam:</label>
          <select
            value={selectedExamId || ''}
            onChange={(e) => onExamSelect(e.target.value || undefined)}
            className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-white"
          >
            <option value="">All Content</option>
            {exams.map((exam) => (
              <option key={exam.id} value={exam.id}>
                {exam.title} {exam.daysUntil <= 7 ? '🔥' : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Toggles */}
        <div className="flex items-center gap-2">
          <ToggleButton
            active={highYieldOnly}
            onClick={onToggleHighYield}
            label="High-Yield Only"
            icon="⭐"
          />
          <ToggleButton
            active={examModeEnabled}
            onClick={onToggleExamMode}
            label="Exam Mode"
            icon="📝"
          />
          <ToggleButton
            active={explainerModeEnabled}
            onClick={onToggleExplainer}
            label="Explainer Mode"
            icon="🎙️"
            highlight
          />
        </div>

        {/* Upload Syllabus */}
        <div className="ml-auto">
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.pdf,.docx"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1 px-3 py-1.5 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-500 transition-colors"
          >
            <span>📄</span>
            <span>Upload Syllabus</span>
          </button>
        </div>
      </div>
    </div>
  );
};

// Toggle Button Component
const ToggleButton: React.FC<{
  active: boolean;
  onClick: () => void;
  label: string;
  icon: string;
  highlight?: boolean;
}> = ({ active, onClick, label, icon, highlight }) => (
  <button
    onClick={onClick}
    className={`
      flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
      ${active
        ? highlight
          ? 'bg-purple-600 text-white'
          : 'bg-teal-600 text-white'
        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
      }
    `}
  >
    <span>{icon}</span>
    <span>{label}</span>
  </button>
);

export default CourseIntelligenceHeader;
