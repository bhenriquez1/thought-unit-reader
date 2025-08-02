"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button"; // ✅ fixed import path
import { cn } from "@/lib/utils"; // ✅ standard utils location

interface ProgressiveViewProps {
  content: string;
  fontFamily?: string;
  fontSize?: number;
  lineSpacing?: number;
  darkMode?: boolean;
}

const ProgressiveView: React.FC<ProgressiveViewProps> = ({
  content = "",
  fontFamily = "Arial, sans-serif",
  fontSize = 18,
  lineSpacing = 1.8,
  darkMode = false,
}) => {
  const sentences = useMemo(() => {
    return content
      .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
      .map((sentence) => sentence.trim())
      .filter(Boolean);
  }, [content]);

  const [currentSentence, setCurrentSentence] = useState(0);
  const [autoScroll, setAutoScroll] = useState(false);
  const [scrollInterval, setScrollInterval] = useState(3000);
  const [alternateColors, setAlternateColors] = useState(true);

  const containerRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!autoScroll || sentences.length === 0) return;
    const timer = setTimeout(() => {
      if (currentSentence < sentences.length - 1) {
        setCurrentSentence((prev) => prev + 1);
      } else {
        setAutoScroll(false);
      }
    }, scrollInterval);
    return () => clearTimeout(timer);
  }, [currentSentence, autoScroll, sentences.length, scrollInterval]);

  useEffect(() => {
    if (autoScroll && currentRef.current) {
      currentRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [currentSentence, autoScroll]);

  const getBackgroundClass = (index: number) => {
    if (!alternateColors) return "bg-gray-50 dark:bg-gray-800";
    return index % 2 === 0
      ? "bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-400"
      : "bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-400";
  };

  const progress =
    sentences.length > 0
      ? Math.round((currentSentence / (sentences.length - 1)) * 100)
      : 0;

  const changeScrollSpeed = (delta: number) => {
    setScrollInterval((prev) =>
      Math.max(1000, Math.min(10000, prev + delta))
    );
  };

  const renderSpeed = () => {
    return (scrollInterval / 1000).toFixed(1) + "s";
  };

  return (
    <div className="flex flex-col w-full max-w-4xl mx-auto p-4">
      {/* Controls Panel */}
      <div
        className={cn(
          "bg-pink-50 rounded-lg p-4 mb-6 shadow-sm",
          darkMode && "bg-pink-900/20"
        )}
      >
        <h3
          className={cn(
            "text-lg font-semibold mb-3 flex items-center",
            darkMode ? "text-pink-300" : "text-pink-600"
          )}
        >
          <span className="mr-2">📑</span> Progressive Reading Controls
        </h3>

        <div className="flex flex-wrap gap-3 mb-4">
          <Button
            onClick={() => setAutoScroll(!autoScroll)}
            className={
              autoScroll
                ? "bg-red-500 hover:bg-red-600"
                : "bg-green-500 hover:bg-green-600"
            }
          >
            {autoScroll ? "⏸ Stop Auto-Scroll" : "▶ Start Auto-Scroll"}
          </Button>

          <Button onClick={() => setCurrentSentence(0)} variant="outline">
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
            <span className="text-sm font-medium w-10 text-center">
              {renderSpeed()}
            </span>
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

        {/* Progress bar */}
        <div
          className={cn(
            "w-full h-2 rounded-full overflow-hidden mb-2",
            darkMode ? "bg-gray-700" : "bg-gray-200"
          )}
        >
          <div
            className={cn(
              "h-full transition-all duration-300",
              darkMode ? "bg-pink-500" : "bg-pink-400"
            )}
            style={{ width: `${progress}%` }}
          />
        </div>

        <div
          className={cn(
            "text-center text-sm mb-2",
            darkMode ? "text-gray-300" : "text-gray-600"
          )}
        >
          Unit {currentSentence + 1} of {sentences.length} ({progress}%
          complete)
        </div>
      </div>

      {/* Reading area */}
      <div
        ref={containerRef}
        className={cn(
          "rounded-lg p-4 shadow-sm max-h-[60vh] overflow-y-auto",
          darkMode ? "bg-gray-900" : "bg-white"
        )}
      >
        {sentences.length > 0 ? (
          sentences.map((sentence, index) => (
            <div
              key={index}
              ref={index === currentSentence ? currentRef : null}
              className={cn(
                "p-4 rounded-lg mb-4 transition-all duration-300",
                getBackgroundClass(index),
                index === currentSentence &&
                  (darkMode
                    ? "ring-2 ring-pink-500"
                    : "ring-2 ring-pink-400")
              )}
              style={{
                fontFamily,
                fontSize: `${fontSize}px`,
                lineHeight: lineSpacing,
                opacity: autoScroll && index !== currentSentence ? 0.7 : 1,
              }}
            >
              {sentence}
            </div>
          ))
        ) : (
          <div
            className={cn(
              "text-center py-10",
              darkMode ? "text-gray-400" : "text-gray-500"
            )}
          >
            No content to display.
          </div>
        )}
      </div>

      {/* Navigation buttons */}
      <div className="flex justify-between mt-4">
        <Button
          onClick={() => {
            if (currentSentence > 0) {
              setCurrentSentence((prev) => prev - 1);
              setAutoScroll(false);
            }
          }}
          variant="outline"
          disabled={currentSentence === 0}
        >
          ◀ Previous
        </Button>

        <span
          className={cn(
            "text-sm self-center",
            darkMode ? "text-gray-300" : "text-gray-600"
          )}
        >
          {sentences.length > 0
            ? `${currentSentence + 1} / ${sentences.length}`
            : "0 / 0"}
        </span>

        <Button
          onClick={() => {
            if (currentSentence < sentences.length - 1) {
              setCurrentSentence((prev) => prev + 1);
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