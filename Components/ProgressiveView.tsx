// components/ProgressiveView.tsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Button } from '../components/ui/button';

interface ProgressiveViewProps {
  content: string;
  fontFamily?: string;
  fontSize?: number;
  lineSpacing?: number;
  darkMode?: boolean;
}

/**
 * ProgressiveView component for displaying text in thought units
 * with alternating styling for improved readability for dyslexic users
 */
const ProgressiveView: React.FC<ProgressiveViewProps> = ({
  content = "",
  fontFamily = "Arial, sans-serif",
  fontSize = 18,
  lineSpacing = 1.8,
  darkMode = false,
}) => {
  // Parse content into sentences/thought units
  const sentences = useMemo(() => {
    return content
      .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
      .map(sentence => sentence.trim())
      .filter(Boolean);
  }, [content]);
  
  // State for current position and auto-scroll
  const [currentSentence, setCurrentSentence] = useState(0);
  const [autoScroll, setAutoScroll] = useState(false);
  const [scrollInterval, setScrollInterval] = useState(3000); // 3 seconds per thought unit
  const [alternateColors, setAlternateColors] = useState(true);
  
  // Refs for scrolling
  const containerRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLDivElement>(null);
  
  // Auto-scroll effect
  useEffect(() => {
    if (!autoScroll || sentences.length === 0) return;
    
    const timer = setTimeout(() => {
      if (currentSentence < sentences.length - 1) {
        setCurrentSentence(prev => prev + 1);
      } else {
        setAutoScroll(false);
      }
    }, scrollInterval);
    
    return () => clearTimeout(timer);
  }, [currentSentence, autoScroll, sentences.length, scrollInterval]);
  
  // Scroll into view when current sentence changes
  useEffect(() => {
    if (autoScroll && currentRef.current) {
      currentRef.current.scrollIntoView({ 
        behavior: 'smooth',
        block: 'center'
      });
    }
  }, [currentSentence, autoScroll]);
  
  // Get background class based on index
  const getBackgroundClass = (index: number) => {
    if (!alternateColors) return "bg-gray-50 dark:bg-gray-800";
    
    return index % 2 === 0 
      ? "bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-400" 
      : "bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-400";
  };
  
  // Calculate progress percentage
  const progress = sentences.length > 0 
    ? Math.round((currentSentence / (sentences.length - 1)) * 100) 
    : 0;
  
  // Change scroll speed
  const changeScrollSpeed = (delta: number) => {
    setScrollInterval(prev => Math.max(1000, Math.min(10000, prev + delta)));
  };
  
  // Render speed in seconds
  const renderSpeed = () => {
    return (scrollInterval / 1000).toFixed(1) + 's';
  };
  
  return (
    <div className="flex flex-col w-full max-w-4xl mx-auto p-4">
      {/* Controls Panel */}
      <div className="bg-pink-50 dark:bg-pink-900/20 rounded-lg p-4 mb-6 shadow-sm">
        <h3 className="text-lg font-semibold text-pink-600 dark:text-pink-300 mb-3 flex items-center">
          <span className="mr-2">📑</span> Progressive Reading Controls
        </h3>
        
        <div className="flex flex-wrap gap-3 mb-4">
          <Button 
            onClick={() => setAutoScroll(!autoScroll)}
            className={autoScroll ? "bg-red-500 hover:bg-red-600" : "bg-green-500 hover:bg-green-600"}
          >
            {autoScroll ? '⏸ Stop Auto-Scroll' : '▶ Start Auto-Scroll'}
          </Button>
          
          <Button 
            onClick={() => setCurrentSentence(0)}
            variant="outline"
          >
            ↩ Back to Start
          </Button>
          
          <div className="flex items-center ml-auto gap-2">
            <span className="text-sm">Scroll Speed:</span>
            <Button 
              onClick={() => changeScrollSpeed(500)}
              variant="outline"
              size="sm"
              className="px-2 py-1 h-8"
            >
              Slower
            </Button>
            <span className="text-sm font-medium w-10 text-center">{renderSpeed()}</span>
            <Button 
              onClick={() => changeScrollSpeed(-500)}
              variant="outline"
              size="sm"
              className="px-2 py-1 h-8"
            >
              Faster
            </Button>
          </div>
        </div>
        
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-sm">Font:</span>
            <select 
              value={fontFamily}
              onChange={(e) => {/* Set font family */}}
              className="px-2 py-1 rounded border text-sm"
            >
              <option value="Arial, sans-serif">Arial</option>
              <option value="Verdana, sans-serif">Verdana</option>
              <option value='"Comic Sans MS", cursive'>Comic Sans</option>
              <option value="OpenDyslexic, sans-serif">OpenDyslexic</option>
              <option value="Helvetica, Arial, sans-serif">Helvetica</option>
            </select>
            
            <span className="text-sm ml-3">Size:</span>
            <button 
              onClick={() => {/* Decrease font size */}}
              className="px-2 py-0.5 rounded bg-gray-200 dark:bg-gray-700"
            >
              -
            </button>
            <span className="text-sm">{fontSize}px</span>
            <button 
              onClick={() => {/* Increase font size */}}
              className="px-2 py-0.5 rounded bg-gray-200 dark:bg-gray-700"
            >
              +
            </button>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-sm">Alternate Colors:</span>
            <button 
              onClick={() => setAlternateColors(!alternateColors)}
              className={`w-10 h-5 rounded-full relative ${
                alternateColors ? 'bg-green-500' : 'bg-gray-300'
              }`}
            >
              <span 
                className={`absolute w-4 h-4 rounded-full bg-white top-0.5 transition-all ${
                  alternateColors ? 'left-5' : 'left-1'
                }`}
              />
            </button>
          </div>
        </div>
        
        {/* Progress bar */}
        <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mb-2">
          <div 
            className="h-full bg-pink-400 dark:bg-pink-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        
        <div className="text-center text-sm text-gray-600 dark:text-gray-300">
          Unit {currentSentence + 1} of {sentences.length} ({progress}% complete)
        </div>
      </div>
      
      {/* Reading area */}
      <div 
        ref={containerRef}
        className="bg-white dark:bg-gray-900 rounded-lg p-4 shadow-sm max-h-[60vh] overflow-y-auto"
      >
        {sentences.length > 0 ? (
          sentences.map((sentence, index) => (
            <div 
              key={index}
              ref={index === currentSentence ? currentRef : null}
              className={`p-4 rounded-lg mb-4 transition-all duration-300 ${getBackgroundClass(index)} ${
                index === currentSentence ? 'ring-2 ring-pink-400 dark:ring-pink-500' : ''
              }`}
              style={{ 
                fontFamily,
                fontSize: `${fontSize}px`,
                lineHeight: lineSpacing,
                opacity: autoScroll && index !== currentSentence ? 0.7 : 1
              }}
            >
              {sentence}
            </div>
          ))
        ) : (
          <div className="text-center text-gray-500 dark:text-gray-400 py-10">
            No content to display. Upload a document or paste text to begin.
          </div>
        )}
      </div>
      
      {/* Navigation buttons */}
      <div className="flex justify-between mt-4">
        <Button
          onClick={() => {
            if (currentSentence > 0) {
              setCurrentSentence(prev => prev - 1);
              setAutoScroll(false);
            }
          }}
          variant="outline"
          disabled={currentSentence === 0}
        >
          ◀ Previous
        </Button>
        
        <span className="text-sm self-center">
          {sentences.length > 0 ? `${currentSentence + 1} / ${sentences.length}` : '0 / 0'}
        </span>
        
        <Button
          onClick={() => {
            if (currentSentence < sentences.length - 1) {
              setCurrentSentence(prev => prev + 1);
              setAutoScroll(false);
            }
          }}
          variant="outline"
          disabled={currentSentence >= sentences.length - 1}
        >
          Next ▶
        </Button>
      </div>
    </div>
  );
};

export default ProgressiveView;