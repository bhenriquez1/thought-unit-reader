// components/courseIntelligence/CourseTimelinePane.tsx
// Left Pane: Course Timeline (Weeks/Modules/Exams)

import React from 'react';
import type { TimelineItem, Exam, SyllabusStatus } from '@/lib/courseIntelligence/types';

interface CourseTimelinePaneProps {
  timeline: TimelineItem[];
  exams: Exam[];
  selectedItemId?: string;
  syllabusStatus: SyllabusStatus;
  onSelectItem: (itemId: string) => void;
  onAddExam: (date: string) => void;
}

export const CourseTimelinePane: React.FC<CourseTimelinePaneProps> = ({
  timeline,
  exams,
  selectedItemId,
  syllabusStatus,
  onSelectItem,
  onAddExam,
}) => {
  const noSyllabus = syllabusStatus === 'none';

  return (
    <div className="flex flex-col h-full bg-gray-850">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <span>📅</span> Course Timeline
        </h2>
        {noSyllabus && (
          <p className="text-xs text-gray-400 mt-1">
            Upload a syllabus to see your schedule
          </p>
        )}
      </div>

      {/* Timeline Filter Tabs */}
      <div className="flex items-center gap-1 p-2 border-b border-gray-700">
        <FilterTab label="All" active />
        <FilterTab label="Exams" />
        <FilterTab label="Weeks" />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {noSyllabus ? (
          <NoSyllabusState onAddExam={onAddExam} />
        ) : timeline.length > 0 ? (
          timeline.map((item) => (
            <TimelineItemCard
              key={item.id}
              item={item}
              isSelected={selectedItemId === item.id}
              onClick={() => onSelectItem(item.id)}
            />
          ))
        ) : exams.length > 0 ? (
          exams.map((exam) => (
            <ExamCard
              key={exam.id}
              exam={exam}
              isSelected={selectedItemId === exam.id}
              onClick={() => onSelectItem(exam.id)}
            />
          ))
        ) : (
          <EmptyState onAddExam={onAddExam} />
        )}
      </div>

      {/* Add Exam Button */}
      <div className="p-3 border-t border-gray-700">
        <button
          onClick={() => onAddExam(new Date().toISOString())}
          className="w-full flex items-center justify-center gap-2 py-2 bg-gray-700 text-gray-300 rounded-lg text-sm hover:bg-gray-600 transition-colors"
        >
          <span>+</span>
          <span>Add Exam Date</span>
        </button>
      </div>
    </div>
  );
};

// Filter Tab
const FilterTab: React.FC<{ label: string; active?: boolean }> = ({ label, active }) => (
  <button
    className={`
      px-3 py-1 rounded text-xs font-medium transition-colors
      ${active ? 'bg-teal-600 text-white' : 'text-gray-400 hover:text-white'}
    `}
  >
    {label}
  </button>
);

// Timeline Item Card
const TimelineItemCard: React.FC<{
  item: TimelineItem;
  isSelected: boolean;
  onClick: () => void;
}> = ({ item, isSelected, onClick }) => {
  const typeStyles: Record<string, { bg: string; icon: string }> = {
    week: { bg: 'bg-blue-900/30 border-blue-700/50', icon: '📚' },
    exam: { bg: 'bg-red-900/30 border-red-700/50', icon: '📝' },
    deliverable: { bg: 'bg-amber-900/30 border-amber-700/50', icon: '📋' },
    today: { bg: 'bg-green-900/30 border-green-700/50', icon: '🎯' },
  };

  const style = typeStyles[item.type] || typeStyles.week;

  return (
    <button
      onClick={onClick}
      className={`
        w-full text-left p-3 rounded-lg border transition-all
        ${style.bg}
        ${isSelected ? 'ring-2 ring-teal-500' : 'hover:border-gray-500'}
      `}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span>{style.icon}</span>
          <span className="font-medium text-white text-sm">{item.title}</span>
        </div>
        {item.isOverdue && (
          <span className="text-xs px-1.5 py-0.5 bg-red-600 rounded">Overdue</span>
        )}
        {item.isCurrent && (
          <span className="text-xs px-1.5 py-0.5 bg-green-600 rounded">Current</span>
        )}
      </div>

      {item.dateRange && (
        <p className="text-xs text-gray-400 mt-1">
          {item.dateRange.start} - {item.dateRange.end}
        </p>
      )}

      {/* Progress bar */}
      <div className="mt-2">
        <div className="flex justify-between text-xs text-gray-400 mb-1">
          <span>Progress</span>
          <span>{item.progressPercent}%</span>
        </div>
        <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-teal-500 transition-all"
            style={{ width: `${item.progressPercent}%` }}
          />
        </div>
      </div>
    </button>
  );
};

// Exam Card
const ExamCard: React.FC<{
  exam: Exam;
  isSelected: boolean;
  onClick: () => void;
}> = ({ exam, isSelected, onClick }) => (
  <button
    onClick={onClick}
    className={`
      w-full text-left p-3 rounded-lg border bg-red-900/30 border-red-700/50 transition-all
      ${isSelected ? 'ring-2 ring-teal-500' : 'hover:border-red-500'}
    `}
  >
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span>📝</span>
        <span className="font-medium text-white text-sm">{exam.title}</span>
      </div>
      {exam.daysUntil <= 7 && exam.daysUntil > 0 && (
        <span className="text-xs px-1.5 py-0.5 bg-red-600 rounded animate-pulse">
          {exam.daysUntil}d
        </span>
      )}
    </div>
    {exam.date && (
      <p className="text-xs text-gray-400 mt-1">{exam.date}</p>
    )}
  </button>
);

// No Syllabus State
const NoSyllabusState: React.FC<{ onAddExam: (date: string) => void }> = ({ onAddExam }) => (
  <div className="flex flex-col items-center justify-center py-8 text-center">
    <span className="text-4xl mb-3">📄</span>
    <h3 className="text-sm font-medium text-white mb-1">No Syllabus Uploaded</h3>
    <p className="text-xs text-gray-400 mb-4 px-4">
      Upload your syllabus to automatically create a study schedule
    </p>
    <button
      onClick={() => onAddExam(new Date().toISOString())}
      className="text-xs text-teal-400 hover:text-teal-300"
    >
      Or manually add exam dates →
    </button>
  </div>
);

// Empty State
const EmptyState: React.FC<{ onAddExam: (date: string) => void }> = ({ onAddExam }) => (
  <div className="flex flex-col items-center justify-center py-8 text-center">
    <span className="text-4xl mb-3">📅</span>
    <h3 className="text-sm font-medium text-white mb-1">No Schedule Yet</h3>
    <p className="text-xs text-gray-400 mb-4">
      Add exam dates to start planning
    </p>
  </div>
);

export default CourseTimelinePane;
