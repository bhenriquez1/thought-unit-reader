import React, { useState, useEffect, useRef, useMemo } from "react";
import { Button } from "./ui/button"; // Correct relative import for Button
import { cn } from "../lib/classnames"; // Correct relative import for classnames utility

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
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length > 0);
  }, [content]);

  // State for current position and auto-scroll
  const [currentSentence, setCurrentSentence] = useState(0);
  const [autoScroll, setAutoScroll] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      const sentenceElement = containerRef.current.querySelector(
        `[data-index="${currentSentence}"]`
      );
      sentenceElement?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [currentSentence, autoScroll]);

  const handleNextSentence = () => {
    setCurrentSentence((prev) => Math.min(prev + 1, sentences.length - 1));
  };

  const handlePreviousSentence = () => {
    setCurrentSentence((prev) => Math.max(prev - 1, 0));
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "p-4 border rounded-md overflow-y-auto max-h-[80vh]",
        darkMode ? "bg-zinc-900 border-gray-700 text-white" : "bg-white border-gray-300 text-black"
      )}
      style={{
        fontFamily,
        fontSize: `${fontSize}px`,
        lineHeight: lineSpacing,
      }}
    >
      {sentences.map((sentence, index) => (
        <p
          key={index}
          data-index={index}
          className={cn(
            "mb-4 transition-opacity",
            index === currentSentence ? "opacity-100 font-bold" : "opacity-50"
          )}
        >
          {sentence}
        </p>
      ))}

      <div className="flex justify-between mt-4">
        <Button
          variant="outline"
          size="sm"
          onClick={handlePreviousSentence}
          disabled={currentSentence === 0}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleNextSentence}
          disabled={currentSentence === sentences.length - 1}
        >
          Next
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setAutoScroll((prev) => !prev)}
        >
          {autoScroll ? "Stop Auto-Scroll" : "Enable Auto-Scroll"}
        </Button>
      </div>
    </div>
  );
};

export default ProgressiveView;