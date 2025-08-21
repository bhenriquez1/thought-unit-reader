import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, BookOpen, MapPin, TrendingUp } from 'lucide-react';

interface PageContextPanelProps {
  currentPage: number;
  totalPages: number;
  chapterTitle?: string;
  sectionTitle?: string;
  previousPageSummary?: string;
  currentPageSummary?: string;
  readingProgress: number;
  onPageChange?: (page: number) => void;
  className?: string;
}

export const PageContextPanel: React.FC<PageContextPanelProps> = ({
  currentPage,
  totalPages,
  chapterTitle,
  sectionTitle,
  previousPageSummary,
  currentPageSummary,
  readingProgress,
  onPageChange,
  className = ''
}) => {
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [previousPage, setPreviousPage] = useState(currentPage);

  useEffect(() => {
    if (currentPage !== previousPage) {
      console.log(`📄 PageContextPanel: Page changed from ${previousPage} to ${currentPage}`);
      setIsTransitioning(true);
      const timer = setTimeout(() => {
        setIsTransitioning(false);
        setPreviousPage(currentPage);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [currentPage, previousPage]);

  const progressPercentage = (currentPage / totalPages) * 100;
  const chapterProgress = readingProgress;

  return (
    <div className={`bg-white/95 backdrop-blur-sm border border-gray-200 rounded-lg shadow-lg p-4 space-y-4 ${className}`}>
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <BookOpen className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-medium text-gray-700">
            Page {currentPage} of {totalPages}
          </span>
        </div>
        <div className="text-xs text-gray-500">
          {Math.round(progressPercentage)}% complete
        </div>
      </div>

      {/* Chapter/Section Info */}
      {(chapterTitle || sectionTitle) && (
        <div className="space-y-1">
          {chapterTitle && (
            <div className="text-sm font-semibold text-gray-800 truncate">
              {chapterTitle}
            </div>
          )}
          {sectionTitle && (
            <div className="text-xs text-gray-600 truncate">
              {sectionTitle}
            </div>
          )}
        </div>
      )}

      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>Reading Progress</span>
          <span>{Math.round(chapterProgress)}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <motion.div
            className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${chapterProgress}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        </div>
      </div>

      {/* Transition Indicator */}
      <AnimatePresence>
        {isTransitioning && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center space-x-2 text-xs text-blue-600 bg-blue-50 p-2 rounded"
          >
            <TrendingUp className="w-3 h-3" />
            <span>Transitioning to page {currentPage}...</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Context Bridge */}
      {previousPageSummary && currentPageSummary && !isTransitioning && (
        <div className="space-y-3 border-t pt-3">
          <div className="flex items-center space-x-2 text-xs font-medium text-gray-700">
            <MapPin className="w-3 h-3" />
            <span>Context Flow</span>
          </div>
          
          <div className="space-y-2">
            {/* Previous Page Context */}
            <motion.div
              initial={{ opacity: 0.7 }}
              animate={{ opacity: 1 }}
              className="text-xs text-gray-600 bg-gray-50 p-2 rounded border-l-2 border-gray-300"
            >
              <div className="font-medium text-gray-700 mb-1">Previous:</div>
              <div className="line-clamp-2">{previousPageSummary}</div>
            </motion.div>

            {/* Connection Arrow */}
            <div className="flex justify-center">
              <motion.div
                animate={{ y: [0, -2, 0] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="text-blue-500"
              >
                <ChevronRight className="w-4 h-4" />
              </motion.div>
            </div>

            {/* Current Page Context */}
            <motion.div
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="text-xs text-gray-700 bg-blue-50 p-2 rounded border-l-2 border-blue-400"
            >
              <div className="font-medium text-blue-700 mb-1">Current:</div>
              <div className="line-clamp-2">{currentPageSummary}</div>
            </motion.div>
          </div>
        </div>
      )}

      {/* Reading Flow Helper */}
      <div className="border-t pt-3">
        <div className="flex items-center justify-between text-xs">
          <button
            onClick={() => onPageChange?.(Math.max(1, currentPage - 1))}
            disabled={currentPage <= 1}
            className="flex items-center space-x-1 text-gray-500 hover:text-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-3 h-3" />
            <span>Previous</span>
          </button>
          
          <div className="flex space-x-1">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const pageNum = Math.max(1, currentPage - 2) + i;
              if (pageNum > totalPages) return null;
              
              return (
                <motion.button
                  key={pageNum}
                  onClick={() => onPageChange?.(pageNum)}
                  className={`w-6 h-6 text-xs rounded ${
                    pageNum === currentPage
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                  } transition-colors`}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                >
                  {pageNum}
                </motion.button>
              );
            })}
          </div>

          <button
            onClick={() => onPageChange?.(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage >= totalPages}
            className="flex items-center space-x-1 text-gray-500 hover:text-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <span>Next</span>
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-2 text-xs border-t pt-3">
        <div className="bg-gray-50 p-2 rounded text-center">
          <div className="font-medium text-gray-700">{totalPages - currentPage}</div>
          <div className="text-gray-500">Pages Left</div>
        </div>
        <div className="bg-blue-50 p-2 rounded text-center">
          <div className="font-medium text-blue-700">{Math.round((currentPage / totalPages) * 100)}%</div>
          <div className="text-blue-600">Complete</div>
        </div>
      </div>
    </div>
  );
};

export default PageContextPanel;
