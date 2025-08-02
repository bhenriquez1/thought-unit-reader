// components/HybridReader.tsx - PERFORMANCE OPTIMIZED
"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { cn } from "../lib/classnames";
import { Button } from "./ui/button";
import Loader from "./ui/loader";

interface HybridReaderProps {
  inputText?: string;
  darkMode?: boolean;
  fontFamily?: string;
  fontSize?: number;
  lineSpacing?: number;
}

/**
 * Performance-optimized HybridReader with Progressive Reading Controls
 */
export default function HybridReader({ 
  inputText,
  darkMode = false,
  fontFamily = "Arial, sans-serif",
  fontSize = 18,
  lineSpacing = 1.8
}: HybridReaderProps) {
  const currentWordRef = useRef<HTMLSpanElement | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Progressive reading state
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [isReading, setIsReading] = useState(false);
  const [wpm, setWpm] = useState(200);

  // Memoize words to prevent recalculation
  const words = useMemo(() => {
    if (!inputText) return [];
    return inputText
      .split(/\s+/)
      .map(word => word.trim())
      .filter(Boolean);
  }, [inputText]);

  // Memoize calculations
  const progress = useMemo(() => {
    if (words.length === 0) return 0;
    return Math.round((currentWordIndex / Math.max(1, words.length - 1)) * 100);
  }, [currentWordIndex, words.length]);

  const timeRemaining = useMemo(() => {
    const wordsLeft = Math.max(0, words.length - currentWordIndex - 1);
    const secondsLeft = Math.ceil((wordsLeft * 60) / wpm);
    
    if (secondsLeft < 60) return `${secondsLeft}s`;
    
    const minutes = Math.floor(secondsLeft / 60);
    const seconds = secondsLeft % 60;
    return `${minutes}m ${seconds}s`;
  }, [currentWordIndex, words.length, wpm]);

  // FIXED: Progressive reading auto-advance with proper cleanup
  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    
    if (!isReading || words.length === 0) return;
    
    const intervalTime = (60 * 1000) / wpm;
    
    timerRef.current = setTimeout(() => {
      if (currentWordIndex < words.length - 1) {
        setCurrentWordIndex(prev => prev + 1);
      } else {
        setIsReading(false);
      }
    }, intervalTime);
    
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [currentWordIndex, isReading, words.length, wpm]);

  // Auto-scroll to current word with throttling
  useEffect(() => {
    if (isReading && currentWordRef.current) {
      const scrollTimer = setTimeout(() => {
        currentWordRef.current?.scrollIntoView({ 
          behavior: 'smooth',
          block: 'center'
        });
      }, 100);
      
      return () => clearTimeout(scrollTimer);
    }
  }, [currentWordIndex, isReading]);

  // Memoized control functions
  const toggleReading = useCallback(() => {
    setIsReading(prev => !prev);
  }, []);
  
  const resetReading = useCallback(() => {
    setCurrentWordIndex(0);
    setIsReading(false);
  }, []);
  
  const adjustWpm = useCallback((delta: number) => {
    setWpm(prev => Math.max(50, Math.min(800, prev + delta)));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  // Early return if no content
  if (!inputText || words.length === 0) {
    return (
      <div className="text-center py-8">
        <p className={cn(
          "text-lg",
          darkMode ? "text-gray-400" : "text-gray-600"
        )}>
          No text content available for hybrid reading.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Progressive Reading Interface */}
      <div className={cn(
        "p-6 rounded-lg mb-6",
        darkMode ? "bg-gray-800" : "bg-pink-50"
      )}>
        {/* Header */}
        <div className={cn(
          "flex items-center mb-4",
          darkMode ? "text-yellow-300" : "text-yellow-600"
        )}>
          <span className="text-xl mr-3">⚡</span>
          <h3 className="text-lg font-semibold">Hybrid Reading Controls</h3>
        </div>
        
        {/* Control Buttons */}
        <div className="flex gap-3 mb-4">
          <Button 
            onClick={toggleReading}
            className={isReading ? "bg-red-500 hover:bg-red-600" : "bg-green-500 hover:bg-green-600"}
          >
            {isReading ? '⏸ Pause' : '▶ Start'}
          </Button>
          
          <Button 
            onClick={resetReading}
            variant="outline"
          >
            🔄 Reset
          </Button>
          
          <div className="flex items-center ml-auto gap-2">
            <span className="text-sm">Speed:</span>
            <Button 
              onClick={() => adjustWpm(-25)}
              variant="outline"
              size="sm"
            >
              -
            </Button>
            <span className="text-sm w-16 text-center">{wpm} WPM</span>
            <Button 
              onClick={() => adjustWpm(25)}
              variant="outline"
              size="sm"
            >
              +
            </Button>
          </div>
        </div>
        
        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className={cn(
            "p-3 rounded text-center",
            darkMode ? "bg-blue-900/30" : "bg-blue-100"
          )}>
            <div className={cn(
              "text-xl font-bold",
              darkMode ? "text-blue-300" : "text-blue-600"
            )}>
              {progress}%
            </div>
            <div className={cn(
              "text-xs",
              darkMode ? "text-blue-300" : "text-blue-600"
            )}>
              Complete
            </div>
          </div>
          
          <div className={cn(
            "p-3 rounded text-center",
            darkMode ? "bg-green-900/30" : "bg-green-100"
          )}>
            <div className={cn(
              "text-xl font-bold",
              darkMode ? "text-green-300" : "text-green-600"
            )}>
              {currentWordIndex + 1}
            </div>
            <div className={cn(
              "text-xs",
              darkMode ? "text-green-300" : "text-green-600"
            )}>
              Current
            </div>
          </div>
          
          <div className={cn(
            "p-3 rounded text-center",
            darkMode ? "bg-purple-900/30" : "bg-purple-100"
          )}>
            <div className={cn(
              "text-xl font-bold",
              darkMode ? "text-purple-300" : "text-purple-600"
            )}>
              {wpm}
            </div>
            <div className={cn(
              "text-xs",
              darkMode ? "text-purple-300" : "text-purple-600"
            )}>
              WPM
            </div>
          </div>
          
          <div className={cn(
            "p-3 rounded text-center",
            darkMode ? "bg-orange-900/30" : "bg-orange-100"
          )}>
            <div className={cn(
              "text-xl font-bold",
              darkMode ? "text-orange-300" : "text-orange-600"
            )}>
              {timeRemaining}
            </div>
            <div className={cn(
              "text-xs",
              darkMode ? "text-orange-300" : "text-orange-600"
            )}>
              Left
            </div>
          </div>
        </div>
        
        {/* Progress Bar */}
        <div className={cn(
          "w-full h-2 rounded-full overflow-hidden",
          darkMode ? "bg-gray-700" : "bg-gray-200"
        )}>
          <div 
            className="h-full bg-yellow-400 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Progressive Reading Area - OPTIMIZED */}
      <div 
        className={cn(
          "p-6 rounded-lg shadow-inner mb-4 min-h-[200px] flex flex-wrap items-center justify-center",
          darkMode ? "bg-gray-900" : "bg-white"
        )}
        style={{ 
          fontFamily,
          fontSize: `${fontSize + 2}px`,
          lineHeight: lineSpacing
        }}
      >
        {words.map((word, index) => {
          // Performance optimization: only render words near current position
          const isVisible = Math.abs(index - currentWordIndex) <= 30;
          
          if (!isVisible && index !== currentWordIndex) {
            return null;
          }
          
          return (
            <span 
              key={index}
              ref={index === currentWordIndex ? currentWordRef : null}
              className={cn(
                "mx-1 my-1 px-2 py-1 rounded transition-all duration-300",
                index === currentWordIndex 
                  ? "bg-yellow-300 text-black font-bold scale-110 shadow" 
                  : index < currentWordIndex 
                    ? darkMode ? "text-gray-500" : "text-gray-400"
                    : darkMode ? "text-white" : "text-black"
              )}
            >
              {word}
            </span>
          );
        })}
      </div>
      
      {/* Word Counter */}
      <div className="text-center mb-4">
        <span className={cn(
          "text-sm",
          darkMode ? "text-gray-300" : "text-gray-600"
        )}>
          Thought Unit {currentWordIndex + 1} of {words.length}
        </span>
      </div>
    </div>
  );
}