// components/Whiteboard/InkLayer.tsx
"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export interface InkStep {
  kind: "path" | "text" | "arrow" | "circle";
  // Path properties
  d?: string;
  // Text properties
  x?: number;
  y?: number;
  text?: string;
  size?: number;
  // Arrow properties
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  // Circle properties
  cx?: number;
  cy?: number;
  r?: number;
  // Common properties
  color?: string;
  width?: number;
  duration?: number;
  delay?: number;
}

interface InkLayerProps {
  steps: InkStep[];
  width?: number;
  height?: number;
  className?: string;
  autoPlay?: boolean;
  onComplete?: () => void;
}

// Hand-drawn style path generator for arrows
function generateHandDrawnArrow(x1: number, y1: number, x2: number, y2: number): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  
  // Add slight curve and wobble for hand-drawn effect
  const midX = (x1 + x2) / 2 + (Math.random() - 0.5) * 10;
  const midY = (y1 + y2) / 2 + (Math.random() - 0.5) * 10;
  
  // Arrow head
  const angle = Math.atan2(dy, dx);
  const headLength = Math.min(20, length * 0.2);
  const headAngle = Math.PI / 6;
  
  const arrowHead1X = x2 - headLength * Math.cos(angle - headAngle);
  const arrowHead1Y = y2 - headLength * Math.sin(angle - headAngle);
  const arrowHead2X = x2 - headLength * Math.cos(angle + headAngle);
  const arrowHead2Y = y2 - headLength * Math.sin(angle + headAngle);
  
  return `M ${x1} ${y1} Q ${midX} ${midY} ${x2} ${y2} M ${x2} ${y2} L ${arrowHead1X} ${arrowHead1Y} M ${x2} ${y2} L ${arrowHead2X} ${arrowHead2Y}`;
}

// Hand-drawn style circle generator
function generateHandDrawnCircle(cx: number, cy: number, r: number): string {
  const points: string[] = [];
  const numPoints = 16;
  
  for (let i = 0; i <= numPoints; i++) {
    const angle = (i / numPoints) * 2 * Math.PI;
    const wobble = (Math.random() - 0.5) * 3; // Add slight irregularity
    const x = cx + (r + wobble) * Math.cos(angle);
    const y = cy + (r + wobble) * Math.sin(angle);
    
    if (i === 0) {
      points.push(`M ${x} ${y}`);
    } else {
      points.push(`L ${x} ${y}`);
    }
  }
  
  points.push('Z'); // Close the path
  return points.join(' ');
}

export default function InkLayer({
  steps,
  width = 400,
  height = 300,
  className = "",
  autoPlay = true,
  onComplete
}: InkLayerProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(autoPlay);

  // Auto-advance through steps
  useEffect(() => {
    if (!isPlaying || currentStep >= steps.length) {
      if (currentStep >= steps.length && onComplete) {
        onComplete();
      }
      return;
    }

    const step = steps[currentStep];
    const delay = step.delay || 0;
    const duration = step.duration || 1000;

    const timer = setTimeout(() => {
      setCurrentStep(prev => prev + 1);
    }, delay + duration);

    return () => clearTimeout(timer);
  }, [currentStep, isPlaying, steps, onComplete]);

  // Reset when steps change
  useEffect(() => {
    setCurrentStep(0);
    setIsPlaying(autoPlay);
  }, [steps, autoPlay]);

  const visibleSteps = steps.slice(0, currentStep + 1);

  return (
    <div className={`relative ${className}`}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="overflow-visible"
        style={{
          filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.1))",
        }}
      >
        {/* Background */}
        <rect
          width={width}
          height={height}
          fill="rgba(255, 255, 255, 0.95)"
          stroke="rgba(0, 0, 0, 0.1)"
          strokeWidth="1"
          rx="8"
        />

        {/* Render visible steps */}
        <AnimatePresence>
          {visibleSteps.map((step, index) => {
            const stepDelay = step.delay || 0;
            const stepDuration = (step.duration || 1000) / 1000; // Convert to seconds
            const color = step.color || "#2563eb";
            const strokeWidth = step.width || 2;

            if (step.kind === "path" && step.d) {
              return (
                <motion.path
                  key={`path-${index}`}
                  d={step.d}
                  fill="none"
                  stroke={color}
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.1))",
                  }}
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{
                    pathLength: { duration: stepDuration, ease: "easeInOut" },
                    opacity: { duration: 0.2 },
                    delay: stepDelay / 1000,
                  }}
                />
              );
            }

            if (step.kind === "arrow" && step.x1 !== undefined && step.y1 !== undefined && step.x2 !== undefined && step.y2 !== undefined) {
              const arrowPath = generateHandDrawnArrow(step.x1, step.y1, step.x2, step.y2);
              return (
                <motion.path
                  key={`arrow-${index}`}
                  d={arrowPath}
                  fill="none"
                  stroke={color}
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.1))",
                  }}
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{
                    pathLength: { duration: stepDuration, ease: "easeInOut" },
                    opacity: { duration: 0.2 },
                    delay: stepDelay / 1000,
                  }}
                />
              );
            }

            if (step.kind === "circle" && step.cx !== undefined && step.cy !== undefined && step.r !== undefined) {
              const circlePath = generateHandDrawnCircle(step.cx, step.cy, step.r);
              return (
                <motion.path
                  key={`circle-${index}`}
                  d={circlePath}
                  fill="none"
                  stroke={color}
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.1))",
                  }}
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{
                    pathLength: { duration: stepDuration, ease: "easeInOut" },
                    opacity: { duration: 0.2 },
                    delay: stepDelay / 1000,
                  }}
                />
              );
            }

            if (step.kind === "text" && step.text && step.x !== undefined && step.y !== undefined) {
              return (
                <motion.text
                  key={`text-${index}`}
                  x={step.x}
                  y={step.y}
                  fill={color}
                  fontSize={step.size || 14}
                  fontFamily="'Comic Sans MS', cursive, sans-serif"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  style={{
                    filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.1))",
                    userSelect: "none",
                  }}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{
                    duration: 0.3,
                    delay: stepDelay / 1000,
                    ease: "backOut",
                  }}
                >
                  {step.text}
                </motion.text>
              );
            }

            return null;
          })}
        </AnimatePresence>
      </svg>

      {/* Controls */}
      <div className="absolute top-2 right-2 flex gap-2">
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          className="text-xs px-2 py-1 bg-white/80 hover:bg-white rounded shadow-sm border"
          title={isPlaying ? "Pause animation" : "Play animation"}
        >
          {isPlaying ? "⏸️" : "▶️"}
        </button>
        <button
          onClick={() => {
            setCurrentStep(0);
            setIsPlaying(true);
          }}
          className="text-xs px-2 py-1 bg-white/80 hover:bg-white rounded shadow-sm border"
          title="Restart animation"
        >
          🔄
        </button>
      </div>

      {/* Progress indicator */}
      <div className="absolute bottom-2 left-2 right-2">
        <div className="bg-white/80 rounded-full h-1">
          <motion.div
            className="bg-blue-500 h-1 rounded-full"
            initial={{ width: "0%" }}
            animate={{ width: `${(currentStep / Math.max(steps.length - 1, 1)) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>
    </div>
  );
}

// Helper function to create common diagram patterns
export const createDiagramSteps = {
  // Simple cause -> effect arrow
  causeEffect: (cause: string, effect: string): InkStep[] => [
    {
      kind: "text",
      x: 80,
      y: 150,
      text: cause,
      size: 12,
      duration: 500,
    },
    {
      kind: "arrow",
      x1: 140,
      y1: 150,
      x2: 260,
      y2: 150,
      color: "#dc2626",
      width: 2,
      duration: 800,
      delay: 600,
    },
    {
      kind: "text",
      x: 320,
      y: 150,
      text: effect,
      size: 12,
      duration: 500,
      delay: 1500,
    },
  ],

  // Process flow with steps
  processFlow: (steps: string[]): InkStep[] => {
    const result: InkStep[] = [];
    const stepWidth = 300 / Math.max(steps.length - 1, 1);
    
    steps.forEach((step, index) => {
      const x = 50 + index * stepWidth;
      const y = 150;
      
      // Add step box
      result.push({
        kind: "circle",
        cx: x,
        cy: y,
        r: 25,
        color: "#2563eb",
        width: 2,
        duration: 600,
        delay: index * 400,
      });
      
      // Add step text
      result.push({
        kind: "text",
        x,
        y,
        text: step,
        size: 10,
        duration: 300,
        delay: index * 400 + 700,
      });
      
      // Add arrow to next step
      if (index < steps.length - 1) {
        result.push({
          kind: "arrow",
          x1: x + 25,
          y1: y,
          x2: x + stepWidth - 25,
          y2: y,
          color: "#059669",
          width: 2,
          duration: 500,
          delay: index * 400 + 1000,
        });
      }
    });
    
    return result;
  },

  // Simple concept map
  conceptMap: (center: string, concepts: string[]): InkStep[] => {
    const result: InkStep[] = [];
    const centerX = 200;
    const centerY = 150;
    const radius = 80;
    
    // Center concept
    result.push({
      kind: "circle",
      cx: centerX,
      cy: centerY,
      r: 30,
      color: "#7c3aed",
      width: 3,
      duration: 800,
    });
    
    result.push({
      kind: "text",
      x: centerX,
      y: centerY,
      text: center,
      size: 12,
      duration: 400,
      delay: 900,
    });
    
    // Surrounding concepts
    concepts.forEach((concept, index) => {
      const angle = (index / concepts.length) * 2 * Math.PI;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);
      
      // Connection line
      result.push({
        kind: "arrow",
        x1: centerX + 30 * Math.cos(angle),
        y1: centerY + 30 * Math.sin(angle),
        x2: x - 20 * Math.cos(angle),
        y2: y - 20 * Math.sin(angle),
        color: "#059669",
        width: 2,
        duration: 600,
        delay: 1400 + index * 300,
      });
      
      // Concept circle
      result.push({
        kind: "circle",
        cx: x,
        cy: y,
        r: 20,
        color: "#2563eb",
        width: 2,
        duration: 500,
        delay: 1600 + index * 300,
      });
      
      // Concept text
      result.push({
        kind: "text",
        x,
        y,
        text: concept,
        size: 10,
        duration: 300,
        delay: 1800 + index * 300,
      });
    });
    
    return result;
  },
};
