// components/courseIntelligence/CourseIntelligenceLayout.tsx
// 3-Pane Course Intelligence Layout
// Left: Timeline | Center: Coverage Map | Right: Action Plan

import React, { useState } from 'react';
import { useCourseIntelligenceStore } from '@/lib/courseIntelligence/store';
import CourseIntelligenceHeader from './CourseIntelligenceHeader';
import CourseTimelinePane from './CourseTimelinePane';
import CoverageMapPane from './CoverageMapPane';
import ActionPlanPane from './ActionPlanPane';
import MappingReviewDrawer from './MappingReviewDrawer';

interface CourseIntelligenceLayoutProps {
  documentId: string;
  documentTitle: string;
  tocEntries: any[];
  onJumpToPage: (page: number) => void;
  onStartStudySession: () => void;
  onStartExplainer?: (clusterId: string) => void;
}

export const CourseIntelligenceLayout: React.FC<CourseIntelligenceLayoutProps> = ({
  documentId,
  documentTitle,
  tocEntries,
  onJumpToPage,
  onStartStudySession,
  onStartExplainer,
}) => {
  const {
    syllabusStatus,
    exams,
    selectedExamId,
    examModeEnabled,
    highYieldOnly,
    explainerModeEnabled,
    lowConfidenceMappings,
    coverageGraph,
    studyPlan,
    timeline,
    selectedTimelineItemId,
    setDocument,
    uploadSyllabus,
    runMapping,
    selectExam,
    toggleExamMode,
    toggleHighYieldOnly,
    toggleExplainerMode,
    selectTimelineItem,
    generatePlan,
    lockPlan,
    unlockPlan,
  } = useCourseIntelligenceStore();

  const [showMappingDrawer, setShowMappingDrawer] = useState(false);
  const [syllabusText, setSyllabusText] = useState('');

  // Initialize document on mount
  React.useEffect(() => {
    setDocument(documentId, documentTitle);
  }, [documentId, documentTitle, setDocument]);

  const handleSyllabusUpload = async (text: string) => {
    setSyllabusText(text);
    await uploadSyllabus(text);
    // Run mapping after parsing
    runMapping(tocEntries);
  };

  const handleFileUpload = async (file: File) => {
    const text = await file.text();
    handleSyllabusUpload(text);
  };

  return (
    <div className="flex flex-col h-full bg-gray-900 text-white">
      {/* Header */}
      <CourseIntelligenceHeader
        docTitle={documentTitle}
        examModeEnabled={examModeEnabled}
        highYieldOnly={highYieldOnly}
        explainerModeEnabled={explainerModeEnabled}
        selectedExamId={selectedExamId}
        syllabusStatus={syllabusStatus}
        exams={exams}
        lowConfidenceCount={lowConfidenceMappings.length}
        onExamSelect={selectExam}
        onToggleExamMode={toggleExamMode}
        onToggleHighYield={toggleHighYieldOnly}
        onToggleExplainer={toggleExplainerMode}
        onUploadSyllabus={handleFileUpload}
        onOpenMappingReview={() => setShowMappingDrawer(true)}
      />

      {/* 3-Pane Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Pane: Timeline */}
        <div className="w-72 border-r border-gray-700 overflow-y-auto">
          <CourseTimelinePane
            timeline={timeline}
            exams={exams}
            selectedItemId={selectedTimelineItemId}
            syllabusStatus={syllabusStatus}
            onSelectItem={selectTimelineItem}
            onAddExam={(date) => {
              // Would open add exam modal
              console.log('Add exam for date:', date);
            }}
          />
        </div>

        {/* Center Pane: Coverage Map */}
        <div className="flex-1 border-r border-gray-700 overflow-y-auto">
          <CoverageMapPane
            coverageGraph={coverageGraph}
            highYieldOnly={highYieldOnly}
            selectedExamId={selectedExamId}
            onSelectNode={(nodeId, nodeType) => {
              console.log('Selected node:', nodeId, nodeType);
            }}
            onAddToPlan={(nodeId) => {
              console.log('Add to plan:', nodeId);
            }}
            onExplain={(nodeId) => {
              console.log('Explain:', nodeId);
            }}
            onStudy={(nodeId) => {
              onStartStudySession();
            }}
            onJumpToPage={onJumpToPage}
          />
        </div>

        {/* Right Pane: Action Plan */}
        <div className="w-80 overflow-y-auto">
          <ActionPlanPane
            plan={studyPlan}
            timeBudget={studyPlan?.timeBudget || { total: 60, reading: 30, reasoning: 20, drills: 10 }}
            onStartBlock={(blockId) => {
              useCourseIntelligenceStore.getState().completePlanBlock(blockId);
            }}
            onCompleteBlock={(blockId) => {
              useCourseIntelligenceStore.getState().completePlanBlock(blockId);
            }}
            onSkipBlock={(blockId) => {
              useCourseIntelligenceStore.getState().skipPlanBlock(blockId);
            }}
            onJumpToCluster={(clusterId) => {
              console.log('Jump to cluster:', clusterId);
            }}
            onStartExplainer={(clusterId) => {
              onStartExplainer?.(clusterId);
            }}
            onTimeBudgetChange={(budget) => {
              useCourseIntelligenceStore.getState().updateTimeBudget(budget);
            }}
          />
        </div>
      </div>

      {/* Mapping Review Drawer */}
      <MappingReviewDrawer
        isOpen={showMappingDrawer}
        onClose={() => setShowMappingDrawer(false)}
        mappings={lowConfidenceMappings}
        tocEntries={tocEntries}
        onAccept={(mappingId) => {
          useCourseIntelligenceStore.getState().acceptMapping(mappingId);
        }}
        onReject={(mappingId) => {
          useCourseIntelligenceStore.getState().rejectMapping(mappingId);
        }}
        onSetGold={(mappingId, tocId) => {
          useCourseIntelligenceStore.getState().setGoldMapping(mappingId, tocId, 'user');
        }}
      />
    </div>
  );
};

export default CourseIntelligenceLayout;
