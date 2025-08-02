// components/ui/ProgressiveView.tsx
"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { Button } from "./button";
import { cn } from "../../lib/classnames";

interface ProgressiveViewProps {
  content: string;
  fontFamily?: string;
  fontSize?: number;
  lineSpacing?: number;
  darkMode?: boolean;
}

/**
 * Enhanced ProgressiveView component matching the design shown in the image
 * Features thought-unit highlighting, auto-progression, and reading analytics
 */
const ProgressiveView: React.FC<ProgressiveViewProps> = ({
  content = "",
  fontFamily = "Arial, sans-serif",
  fontSize = 18,
  lineSpacing = 1.8,
  darkMode = false,
}) => {
  // Parse content into individual words for thought-unit reading
  const words = useMemo(() => {
    return content
      .split(/\s+/)
      .map(word => word.trim())
      .filter(Boolean);
  }, [content]);
  
  // State for progressive reading
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [isReading, setIsReading] = useState(false);
  const [wpm, setWpm] = useState(200); // Words per minute
  const [showSettings, setShowSettings] = useState(false);
  
  // Refs for auto-scroll
  const currentWordRef = useRef<HTMLSpanElement>(null);
  
  // Auto-progression effect
  useEffect(() => {
    if (!isReading || words.length === 0) return;
    
    const intervalTime = (60 * 1000) / wpm; // Convert WPM to milliseconds
    
    const timer = setTimeout(() => {
      if (currentWordIndex < words.length - 1) {
        setCurrentWordIndex(prev => prev + 1);
      } else {
        setIsReading(false); // Stop when we reach the end
      }
    }, intervalTime);
    
    return () => clearTimeout(timer);
  }, [currentWordIndex, isReading, words.length, wpm]);
  
  // Auto-scroll to current word
  useEffect(() => {
    if (isReading && currentWordRef.current) {
      currentWordRef.current.scrollIntoView({ 
        behavior: 'smooth',
        block: 'center'
      });
    }
  }, [currentWordIndex, isReading]);
  
  // Calculate progress percentage
  const progress = words.length > 0 
    ? Math.round((currentWordIndex / (words.length - 1)) * 100) 
    : 0;
  
  // Calculate time remaining
  const timeRemaining = useMemo(() => {
    const wordsLeft = words.length - currentWordIndex - 1;
    const secondsLeft = Math.ceil((wordsLeft * 60) / wpm);
    
    if (secondsLeft < 60) return `${secondsLeft}s`;
    
    const minutes = Math.floor(secondsLeft / 60);
    const seconds = secondsLeft % 60;
    return `${minutes}m ${seconds}s`;
  }, [currentWordIndex, words.length, wpm]);
  
  // Control functions
  const toggleReading = () => setIsReading(!isReading);
  const resetReading = () => {
    setCurrentWordIndex(0);
    setIsReading(false);
  };
  
  const adjustWpm = (delta: number) => {
    setWpm(prev => Math.max(50, Math.min(800, prev + delta)));
  };
  
  return (
    <div className="flex flex-col w-full max-w-4xl mx-auto p-6">
      {/* Header with Lightning Icon */}
      <div className={cn(
        "flex items-center mb-6",
        darkMode ? "text-yellow-300" : "text-yellow-600"
      )}>
        <span className="text-2xl mr-3">⚡</span>
        <h2 className="text-2xl font-bold">Hybrid Reading Controls</h2>
      </div>
      
      {/* Control Buttons */}
      <div className="flex gap-3 mb-6">
        <Button 
          onClick={toggleReading}
          className={cn(
            "flex items-center gap-2 px-6 py-3 rounded-lg font-medium",
            isReading 
              ? "bg-red-500 hover:bg-red-600 text-white" 
              : "bg-green-500 hover:bg-green-600 text-white"
          )}
        >
          {isReading ? '⏸ Pause' : '▶ Start'}
        </Button>
        
        <Button 
          onClick={resetReading}
          className="flex items-center gap-2 px-6 py-3 bg-gray-500 hover:bg-gray-600 text-white rounded-lg font-medium"
        >
          🔄 Reset
        </Button>
        
        <Button 
          onClick={() => setShowSettings(!showSettings)}
          className="flex items-center gap-2 px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium"
        >
          ⚙️ Settings
        </Button>
      </div>
      
      {/* Settings Panel */}
      {showSettings && (
        <div className={cn(
          "p-4 rounded-lg mb-6 border",
          darkMode ? "bg-gray-800 border-gray-600" : "bg-gray-50 border-gray-300"
        )}>
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium">Reading Speed:</span>
            <Button 
              onClick={() => adjustWpm(-25)}
              variant="outline"
              size="sm"
            >
              Slower
            </Button>
            <span className="font-medium w-16 text-center">{wpm} WPM</span>
            <Button 
              onClick={() => adjustWpm(25)}
              variant="outline"
              size="sm"
            >
              Faster
            </Button>
          </div>
        </div>
      )}
      
      {/* Stats Grid - Matching the image layout */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {/* Progress */}
        <div className="bg-blue-100 dark:bg-blue-900/30 p-4 rounded-lg text-center">
          <div className="text-3xl font-bold text-blue-600 dark:text-blue-300">
            {progress}%
          </div>
          <div className="text-sm text-blue-600 dark:text-blue-300 font-medium">
            Complete
          </div>
        </div>
        
        {/* Current Word */}
        <div className="bg-green-100 dark:bg-green-900/30 p-4 rounded-lg text-center">
          <div className="text-3xl font-bold text-green-600 dark:text-green-300">
            {currentWordIndex + 1}
          </div>
          <div className="text-sm text-green-600 dark:text-green-300 font-medium">
            Current
          </div>
        </div>
        
        {/* WPM */}
        <div className="bg-purple-100 dark:bg-purple-900/30 p-4 rounded-lg text-center">
          <div className="text-3xl font-bold text-purple-600 dark:text-purple-300">
            {wpm}
          </div>
          <div className="text-sm text-purple-600 dark:text-purple-300 font-medium">
            WPM
          </div>
        </div>
        
        {/* Time Left */}
        <div className="bg-orange-100 dark:bg-orange-900/30 p-4 rounded-lg text-center">
          <div className="text-3xl font-bold text-orange-600 dark:text-orange-300">
            {timeRemaining}
          </div>
          <div className="text-sm text-orange-600 dark:text-orange-300 font-medium">
            Left
          </div>
        </div>
      </div>
      
      {/* Word Counter */}
      <div className="text-center mb-4">
        <span className={cn(
          "text-lg",
          darkMode ? "text-gray-300" : "text-gray-600"
        )}>
          Thought Unit {currentWordIndex + 1} of {words.length}
        </span>
      </div>
      
      {/* Main Reading Area */}
      <div 
        className={cn(
          "p-8 rounded-lg shadow-inner mb-6 min-h-[200px] flex flex-wrap items-center justify-center",
          darkMode ? "bg-gray-900" : "bg-white"
        )}
        style={{ 
          fontFamily,
          fontSize: `${fontSize + 4}px`, // Slightly larger for main reading
          lineHeight: lineSpacing
        }}
      >
        {words.length > 0 ? (
          words.map((word, index) => (
            <span 
              key={index}
              ref={index === currentWordIndex ? currentWordRef : null}
              className={cn(
                "mx-2 my-1 px-3 py-2 rounded-lg transition-all duration-300",
                index === currentWordIndex 
                  ? "bg-yellow-300 text-black font-bold text-xl scale-110 shadow-lg" 
                  : index < currentWordIndex 
                    ? darkMode ? "text-gray-600" : "text-gray-400"
                    : darkMode ? "text-white" : "text-black"
              )}
            >
              {word}
            </span>
          ))
        ) : (
          <div className={cn(
            "text-center",
            darkMode ? "text-gray-400" : "text-gray-500"
          )}>
            No content to display. Upload a document or paste text to begin.
          </div>
        )}
      </div>
      
      {/* Progress Bar */}
      <div className={cn(
        "w-full h-3 rounded-full overflow-hidden mb-4",
        darkMode ? "bg-gray-700" : "bg-gray-200"
      )}>
        <div 
          className="h-full bg-yellow-400 transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
      
      {/* Word Position Counter */}
      <div className="text-center">
        <span className={cn(
          "text-sm",
          darkMode ? "text-gray-400" : "text-gray-500"
        )}>
          Word {currentWordIndex + 1} of {words.length}
        </span>
      </div>
    </div>
  );
};

export default ProgressiveView;