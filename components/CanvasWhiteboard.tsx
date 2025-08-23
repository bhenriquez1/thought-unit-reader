"use client";

import React, { useRef, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useReaderSync } from "@/lib/readerSync";

interface CanvasWhiteboardProps {
  chapterId?: string;
  className?: string;
}

interface AnimationStep {
  type: 'title' | 'concept' | 'highlight' | 'draw' | 'text';
  content: string;
  x?: number;
  y?: number;
  color?: string;
  duration?: number;
}

export default function CanvasWhiteboard({ 
  chapterId, 
  className = "" 
}: CanvasWhiteboardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [animationSteps, setAnimationSteps] = useState<AnimationStep[]>([]);
  
  const { 
    currentChapterId, 
    getAnimationStep, 
    setAnimationStep, 
    getAnimationScript,
    setCurrentChapter 
  } = useReaderSync();

  // Load animation script for current chapter
  useEffect(() => {
    if (chapterId || currentChapterId) {
      const id = chapterId || currentChapterId;
      if (id) {
        const script = getAnimationScript(id);
        if (script && script.length > 0) {
          setAnimationSteps(script);
          const savedStep = getAnimationStep(id);
          setCurrentStep(savedStep);
        } else {
          // Create default animation steps
          const defaultSteps: AnimationStep[] = [
            { type: 'title', content: 'Chapter Overview', x: 400, y: 100 },
            { type: 'concept', content: 'Key concepts will appear here', x: 400, y: 200 },
            { type: 'highlight', content: 'Important points highlighted', x: 400, y: 300 }
          ];
          setAnimationSteps(defaultSteps);
        }
      }
    }
  }, [chapterId, currentChapterId, getAnimationScript, getAnimationStep]);

  // Canvas drawing functions
  const drawStep = (ctx: CanvasRenderingContext2D, step: AnimationStep, stepIndex: number) => {
    const { type, content, x = 400, y = 200, color = '#ffffff' } = step;
    
    ctx.save();
    
    switch (type) {
      case 'title':
        ctx.font = 'bold 24px Arial';
        ctx.fillStyle = '#fbbf24'; // yellow-400
        ctx.textAlign = 'center';
        ctx.fillText(content, x, y);
        break;
        
      case 'concept':
        ctx.font = '18px Arial';
        ctx.fillStyle = '#60a5fa'; // blue-400
        ctx.textAlign = 'center';
        // Word wrap for long content
        const words = content.split(' ');
        const maxWidth = 600;
        let line = '';
        let lineY = y;
        
        for (let n = 0; n < words.length; n++) {
          const testLine = line + words[n] + ' ';
          const metrics = ctx.measureText(testLine);
          const testWidth = metrics.width;
          
          if (testWidth > maxWidth && n > 0) {
            ctx.fillText(line, x, lineY);
            line = words[n] + ' ';
            lineY += 25;
          } else {
            line = testLine;
          }
        }
        ctx.fillText(line, x, lineY);
        break;
        
      case 'highlight':
        ctx.font = '16px Arial';
        ctx.fillStyle = '#34d399'; // green-400
        ctx.textAlign = 'center';
        ctx.fillText(content, x, y);
        
        // Add highlight box
        const textMetrics = ctx.measureText(content);
        ctx.strokeStyle = '#34d399';
        ctx.lineWidth = 2;
        ctx.strokeRect(x - textMetrics.width/2 - 10, y - 20, textMetrics.width + 20, 30);
        break;
        
      case 'draw':
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, 50, 0, 2 * Math.PI);
        ctx.stroke();
        break;
        
      case 'text':
        ctx.font = '14px Arial';
        ctx.fillStyle = color;
        ctx.textAlign = 'left';
        ctx.fillText(content, x, y);
        break;
    }
    
    ctx.restore();
  };

  // Render current animation state
  const renderCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Clear canvas
    ctx.fillStyle = '#1f2937'; // gray-800
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw steps up to current step
    for (let i = 0; i <= currentStep && i < animationSteps.length; i++) {
      drawStep(ctx, animationSteps[i], i);
    }
    
    // Add step indicator
    ctx.font = '12px Arial';
    ctx.fillStyle = '#9ca3af'; // gray-400
    ctx.textAlign = 'right';
    ctx.fillText(`Step ${currentStep + 1} / ${animationSteps.length}`, canvas.width - 20, 30);
  };

  // Update canvas when step changes
  useEffect(() => {
    renderCanvas();
  }, [currentStep, animationSteps]);

  // Auto-play animation
  useEffect(() => {
    if (!isPlaying || animationSteps.length === 0) return;
    
    const interval = setInterval(() => {
      setCurrentStep(prev => {
        const next = prev + 1;
        if (next >= animationSteps.length) {
          setIsPlaying(false);
          return prev;
        }
        
        // Save progress to sync store
        const id = chapterId || currentChapterId;
        if (id) {
          setAnimationStep(id, next);
        }
        
        return next;
      });
    }, 2000); // 2 seconds per step
    
    return () => clearInterval(interval);
  }, [isPlaying, animationSteps.length, chapterId, currentChapterId, setAnimationStep]);

  const handlePrevStep = () => {
    setCurrentStep(prev => {
      const next = Math.max(0, prev - 1);
      const id = chapterId || currentChapterId;
      if (id) {
        setAnimationStep(id, next);
      }
      return next;
    });
  };

  const handleNextStep = () => {
    setCurrentStep(prev => {
      const next = Math.min(animationSteps.length - 1, prev + 1);
      const id = chapterId || currentChapterId;
      if (id) {
        setAnimationStep(id, next);
      }
      return next;
    });
  };

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handleReset = () => {
    setCurrentStep(0);
    setIsPlaying(false);
    const id = chapterId || currentChapterId;
    if (id) {
      setAnimationStep(id, 0);
    }
  };

  return (
    <div className={`flex flex-col ${className}`}>
      {/* Canvas */}
      <div className="relative bg-gray-800 rounded-lg overflow-hidden border border-gray-700">
        <canvas
          ref={canvasRef}
          width={800}
          height={600}
          className="w-full h-auto max-h-[400px] object-contain"
        />
        
        {/* Chapter info overlay */}
        {(chapterId || currentChapterId) && (
          <div className="absolute top-4 left-4 bg-black/60 text-white px-3 py-2 rounded-lg text-sm">
            <div className="font-medium">
              {chapterId || currentChapterId}
            </div>
            <div className="text-xs opacity-75">
              Chapter Animation
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-3 mt-4 p-3 bg-gray-900/50 rounded-lg">
        <button
          onClick={handlePrevStep}
          disabled={currentStep <= 0}
          className="px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
          title="Previous step"
        >
          ⏮️ Prev
        </button>
        
        <button
          onClick={handlePlayPause}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            isPlaying 
              ? "bg-red-600 hover:bg-red-500" 
              : "bg-green-600 hover:bg-green-500"
          }`}
          title={isPlaying ? "Pause animation" : "Play animation"}
        >
          {isPlaying ? "⏸️ Pause" : "▶️ Play"}
        </button>
        
        <button
          onClick={handleNextStep}
          disabled={currentStep >= animationSteps.length - 1}
          className="px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
          title="Next step"
        >
          Next ⏭️
        </button>
        
        <div className="w-px h-6 bg-gray-600 mx-2" />
        
        <button
          onClick={handleReset}
          className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
          title="Reset to beginning"
        >
          🔄 Reset
        </button>
        
        <div className="text-sm text-gray-400 ml-4">
          Step {currentStep + 1} of {animationSteps.length}
        </div>
      </div>

      {/* Step description */}
      {animationSteps[currentStep] && (
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-3 p-3 bg-gray-800/50 rounded-lg border border-gray-700"
        >
          <div className="text-sm font-medium text-yellow-400 mb-1">
            Current Step: {animationSteps[currentStep].type}
          </div>
          <div className="text-sm text-gray-300">
            {animationSteps[currentStep].content}
          </div>
        </motion.div>
      )}
    </div>
  );
}
