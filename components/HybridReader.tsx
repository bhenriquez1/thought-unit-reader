// components/HybridReader.tsx
import React from 'react';
import SmartPDFViewer from '@/components/SmartPDFViewer';
import ProgressiveView, { ThoughtUnit, ReadingStats } from '@/components/ProgressiveView';
import { Play, Pause } from 'lucide-react';

interface HybridReaderProps {
  fileUrl?: string | null;
  textContent?: string;
  currentPage?: number;
  readingSpeed?: number;
  aiEnabled?: boolean;
  savedNotes?: any[];
}

const HybridReader: React.FC<HybridReaderProps> = ({
  fileUrl = null,
  textContent = '',
  currentPage = 1,
  readingSpeed = 200,
  aiEnabled = true,
  savedNotes = []
}) => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6 bg-gray-800 rounded-lg text-white">
      {/* PDF Panel */}
      <div className="bg-gray-900 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between p-3 border-b border-gray-700">
          <h4 className="text-sm font-semibold">PDF View - Page {currentPage}</h4>
          <div className="text-xs">Zoom / Controls</div>
        </div>
        {fileUrl && (
          <div style={{ height: '60vh' }}>
            <SmartPDFViewer
              fileUrl={fileUrl}
              scale={1.0}
              onWordClick={() => {}}
              showTextOverlay={true}
              textContent={textContent || ''}
              currentPage={currentPage}
              onPageChange={() => {}}
            />
          </div>
        )}
      </div>

      {/* Progressive Panel */}
      <div className="bg-gray-800 p-4 rounded-lg">
        <ProgressiveView fileUrl={fileUrl} textContent={textContent} initialReadingSpeed={readingSpeed} />
      </div>
    </div>
  );
};

export default HybridReader;