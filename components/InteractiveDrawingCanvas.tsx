"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { enhancedHybridAnalysisEngine } from "@/lib/enhancedHybridAnalysis";

interface DrawingPoint {
  x: number;
  y: number;
  pressure?: number;
}

interface DrawingStroke {
  id: string;
  points: DrawingPoint[];
  color: string;
  width: number;
  tool: string;
}

interface SmartSuggestion {
  type: 'diagram' | 'shape' | 'annotation';
  description: string;
  confidence: number;
  action: () => void;
}

interface InteractiveDrawingCanvasProps {
  width?: number;
  height?: number;
  concept?: string;
  context?: string;
  onDrawingChange?: (strokes: DrawingStroke[]) => void;
  className?: string;
}

export default function InteractiveDrawingCanvas({
  width = 800,
  height = 600,
  concept = '',
  context = '',
  onDrawingChange,
  className = ''
}: InteractiveDrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentTool, setCurrentTool] = useState<'pen' | 'highlighter' | 'eraser' | 'shape'>('pen');
  const [currentColor, setCurrentColor] = useState('#2563eb');
  const [currentWidth, setCurrentWidth] = useState(3);
  const [strokes, setStrokes] = useState<DrawingStroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<DrawingPoint[]>([]);
  const [suggestions, setSuggestions] = useState<SmartSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Drawing state
  const lastPointRef = useRef<DrawingPoint | null>(null);
  const strokeIdRef = useRef(0);

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    canvas.width = width;
    canvas.height = height;

    // Clear and set white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Set drawing properties
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, [width, height]);

  // Generate smart suggestions based on content
  const generateSmartSuggestions = useCallback(async () => {
    if (!concept && !context) return;
    
    setIsAnalyzing(true);
    try {
      const analysisText = `${concept} ${context}`.trim();
      const analysis = await enhancedHybridAnalysisEngine.analyzeText(analysisText);
      
      const newSuggestions: SmartSuggestion[] = [];

      // Suggest diagrams based on main ideas
      if (analysis.enhancedMainIdeaAnalysis?.supportingPoints && analysis.enhancedMainIdeaAnalysis.supportingPoints.length > 0) {
        newSuggestions.push({
          type: 'diagram',
          description: 'Create concept map of main ideas',
          confidence: 0.9,
          action: () => createConceptMap(analysis.enhancedMainIdeaAnalysis.supportingPoints)
        });
      }

      // Suggest flow charts for explanations
      if (analysis.supportAnalysis?.classifications && analysis.supportAnalysis.classifications.length > 0) {
        const explanations = analysis.supportAnalysis.classifications.filter((info: any) => info.type === 'EXPLANATION');
        if (explanations.length > 0) {
          newSuggestions.push({
            type: 'diagram',
            description: 'Create flow chart explanation',
            confidence: 0.8,
            action: () => createFlowChart(explanations)
          });
        }
      }

      // Suggest process diagrams for examples
      if (analysis.supportAnalysis?.classifications && analysis.supportAnalysis.classifications.length > 0) {
        const examples = analysis.supportAnalysis.classifications.filter((info: any) => info.type === 'EXAMPLE');
        if (examples.length > 0) {
          newSuggestions.push({
            type: 'diagram',
            description: 'Create step-by-step process diagram',
            confidence: 0.85,
            action: () => createProcessDiagram(examples)
          });
        }
      }

      setSuggestions(newSuggestions);
      setShowSuggestions(newSuggestions.length > 0);
    } catch (error) {
      console.error('Failed to generate suggestions:', error);
    } finally {
      setIsAnalyzing(false);
    }
  }, [concept, context]);

  // Auto-generate suggestions when content changes
  useEffect(() => {
    if (concept || context) {
      generateSmartSuggestions();
    }
  }, [concept, context, generateSmartSuggestions]);

  // Get point from mouse/touch event
  const getPointFromEvent = (event: MouseEvent | TouchEvent): DrawingPoint => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    let clientX: number, clientY: number;

    if (event instanceof MouseEvent) {
      clientX = event.clientX;
      clientY = event.clientY;
    } else {
      const touch = event.touches[0] || event.changedTouches[0];
      clientX = touch.clientX;
      clientY = touch.clientY;
    }

    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
      pressure: 0.7 // Default pressure
    };
  };

  // Start drawing
  const startDrawing = (point: DrawingPoint) => {
    setIsDrawing(true);
    setCurrentStroke([point]);
    lastPointRef.current = point;
  };

  // Continue drawing
  const continueDrawing = (point: DrawingPoint) => {
    if (!isDrawing || !canvasRef.current) return;

    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    // Draw line segment
    ctx.save();
    ctx.globalCompositeOperation = currentTool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = currentTool === 'highlighter' ? `${currentColor}80` : currentColor;
    ctx.lineWidth = currentTool === 'highlighter' ? currentWidth * 2 : currentWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (lastPointRef.current) {
      ctx.beginPath();
      ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
    }

    ctx.restore();

    setCurrentStroke(prev => [...prev, point]);
    lastPointRef.current = point;
  };

  // End drawing
  const endDrawing = () => {
    if (!isDrawing || currentStroke.length === 0) return;

    const newStroke: DrawingStroke = {
      id: `stroke-${strokeIdRef.current++}`,
      points: [...currentStroke],
      color: currentColor,
      width: currentWidth,
      tool: currentTool
    };

    setStrokes(prev => {
      const updated = [...prev, newStroke];
      onDrawingChange?.(updated);
      return updated;
    });

    setIsDrawing(false);
    setCurrentStroke([]);
    lastPointRef.current = null;
  };

  // Mouse event handlers
  const handleMouseDown = (event: React.MouseEvent) => {
    event.preventDefault();
    startDrawing(getPointFromEvent(event.nativeEvent));
  };

  const handleMouseMove = (event: React.MouseEvent) => {
    if (isDrawing) {
      continueDrawing(getPointFromEvent(event.nativeEvent));
    }
  };

  const handleMouseUp = () => {
    endDrawing();
  };

  // Touch event handlers
  const handleTouchStart = (event: React.TouchEvent) => {
    event.preventDefault();
    startDrawing(getPointFromEvent(event.nativeEvent));
  };

  const handleTouchMove = (event: React.TouchEvent) => {
    event.preventDefault();
    if (isDrawing) {
      continueDrawing(getPointFromEvent(event.nativeEvent));
    }
  };

  const handleTouchEnd = (event: React.TouchEvent) => {
    event.preventDefault();
    endDrawing();
  };

  // Clear canvas
  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    
    setStrokes([]);
    onDrawingChange?.([]);
  };

  // Undo last stroke
  const undoStroke = () => {
    if (strokes.length === 0) return;

    const newStrokes = strokes.slice(0, -1);
    setStrokes(newStrokes);
    onDrawingChange?.(newStrokes);
    redrawCanvas(newStrokes);
  };

  // Redraw all strokes
  const redrawCanvas = (strokesToRedraw: DrawingStroke[] = strokes) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Redraw all strokes
    strokesToRedraw.forEach(stroke => {
      if (stroke.points.length < 2) return;

      ctx.save();
      ctx.strokeStyle = stroke.tool === 'highlighter' ? `${stroke.color}80` : stroke.color;
      ctx.lineWidth = stroke.tool === 'highlighter' ? stroke.width * 2 : stroke.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);

      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }

      ctx.stroke();
      ctx.restore();
    });
  };

  // Smart diagram creation functions
  const createConceptMap = (mainIdeas: any[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.3;

    // Draw central concept
    ctx.save();
    ctx.strokeStyle = '#7c3aed';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(centerX, centerY, 40, 0, 2 * Math.PI);
    ctx.stroke();

    ctx.fillStyle = '#7c3aed';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Main Concept', centerX, centerY);

    // Draw surrounding ideas
    mainIdeas.slice(0, 6).forEach((idea, index) => {
      const angle = (index / mainIdeas.length) * 2 * Math.PI;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);

      // Connection line
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(centerX + 40 * Math.cos(angle), centerY + 40 * Math.sin(angle));
      ctx.lineTo(x - 25 * Math.cos(angle), y - 25 * Math.sin(angle));
      ctx.stroke();

      // Idea circle
      ctx.strokeStyle = '#2563eb';
      ctx.beginPath();
      ctx.arc(x, y, 25, 0, 2 * Math.PI);
      ctx.stroke();

      // Idea text
      ctx.fillStyle = '#2563eb';
      ctx.font = '12px Arial';
      const ideaText = idea.text?.slice(0, 15) || `Idea ${index + 1}`;
      ctx.fillText(ideaText, x, y);
    });

    ctx.restore();
  };

  const createFlowChart = (explanations: any[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const stepWidth = (width - 100) / Math.max(explanations.length, 1);

    explanations.slice(0, 5).forEach((explanation, index) => {
      const x = 50 + index * stepWidth;
      const y = height / 2;

      // Draw process box
      ctx.save();
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y - 30, stepWidth - 20, 60);

      ctx.fillStyle = 'rgba(245, 158, 11, 0.1)';
      ctx.fillRect(x, y - 30, stepWidth - 20, 60);

      // Box text
      ctx.fillStyle = '#f59e0b';
      ctx.font = '12px Arial';
      ctx.textAlign = 'center';
      const text = explanation.content?.slice(0, 20) || `Step ${index + 1}`;
      ctx.fillText(text, x + (stepWidth - 20) / 2, y);

      // Arrow to next step
      if (index < explanations.length - 1) {
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 3;
        
        const arrowStartX = x + stepWidth - 20;
        const arrowEndX = x + stepWidth;
        
        // Arrow line
        ctx.beginPath();
        ctx.moveTo(arrowStartX, y);
        ctx.lineTo(arrowEndX, y);
        ctx.stroke();

        // Arrow head
        ctx.beginPath();
        ctx.moveTo(arrowEndX, y);
        ctx.lineTo(arrowEndX - 8, y - 5);
        ctx.moveTo(arrowEndX, y);
        ctx.lineTo(arrowEndX - 8, y + 5);
        ctx.stroke();
      }

      ctx.restore();
    });
  };

  const createProcessDiagram = (examples: any[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const stepHeight = (height - 100) / Math.max(examples.length, 1);

    examples.slice(0, 4).forEach((example, index) => {
      const x = 100;
      const y = 50 + index * stepHeight;

      // Draw step circle
      ctx.save();
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, 25, 0, 2 * Math.PI);
      ctx.stroke();

      ctx.fillStyle = 'rgba(59, 130, 246, 0.1)';
      ctx.fill();

      // Step number
      ctx.fillStyle = '#3b82f6';
      ctx.font = 'bold 16px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(`${index + 1}`, x, y + 5);

      // Step description
      ctx.fillStyle = '#1f2937';
      ctx.font = '14px Arial';
      ctx.textAlign = 'left';
      const text = example.content?.slice(0, 40) || `Example ${index + 1}`;
      ctx.fillText(text, x + 40, y + 5);

      // Arrow to next step
      if (index < examples.length - 1) {
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y + 25);
        ctx.lineTo(x, y + stepHeight - 25);
        ctx.stroke();

        // Arrow head
        ctx.beginPath();
        ctx.moveTo(x, y + stepHeight - 25);
        ctx.lineTo(x - 5, y + stepHeight - 35);
        ctx.moveTo(x, y + stepHeight - 25);
        ctx.lineTo(x + 5, y + stepHeight - 35);
        ctx.stroke();
      }

      ctx.restore();
    });
  };

  // Tool selection
  const tools = [
    { id: 'pen', icon: '✏️', label: 'Pen' },
    { id: 'highlighter', icon: '🖍️', label: 'Highlighter' },
    { id: 'eraser', icon: '🧽', label: 'Eraser' },
    { id: 'shape', icon: '⭕', label: 'Shapes' }
  ];

  const colors = [
    '#2563eb', // blue
    '#dc2626', // red
    '#16a34a', // green
    '#ca8a04', // yellow
    '#9333ea', // purple
    '#ea580c', // orange
    '#0891b2', // cyan
    '#be185d'  // pink
  ];

  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      {/* Toolbar */}
      <div className="flex items-center gap-4 p-3 bg-gray-900/50 rounded-lg border border-gray-700">
        {/* Tools */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">Tools:</span>
          {tools.map(tool => (
            <button
              key={tool.id}
              onClick={() => setCurrentTool(tool.id as any)}
              className={`px-3 py-2 rounded-lg transition-colors ${
                currentTool === tool.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
              }`}
              title={tool.label}
            >
              {tool.icon}
            </button>
          ))}
        </div>

        <div className="w-px h-6 bg-gray-600" />

        {/* Colors */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">Color:</span>
          <div className="flex gap-1">
            {colors.map(color => (
              <button
                key={color}
                onClick={() => setCurrentColor(color)}
                className={`w-6 h-6 rounded border-2 transition-all ${
                  currentColor === color ? 'border-white scale-110' : 'border-gray-600'
                }`}
                style={{ backgroundColor: color }}
                title={color}
              />
            ))}
          </div>
        </div>

        <div className="w-px h-6 bg-gray-600" />

        {/* Brush size */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">Size:</span>
          <input
            type="range"
            min="1"
            max="20"
            value={currentWidth}
            onChange={(e) => setCurrentWidth(Number(e.target.value))}
            className="w-20 accent-blue-500"
          />
          <span className="text-xs text-gray-400 w-6">{currentWidth}px</span>
        </div>

        <div className="flex-1" />

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={undoStroke}
            disabled={strokes.length === 0}
            className="px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
            title="Undo last stroke"
          >
            ↶ Undo
          </button>
          <button
            onClick={clearCanvas}
            className="px-3 py-2 bg-red-600 hover:bg-red-500 rounded-lg transition-colors"
            title="Clear canvas"
          >
            🗑️ Clear
          </button>
        </div>
      </div>

      {/* Smart Suggestions */}
      <AnimatePresence>
        {showSuggestions && suggestions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-3 bg-gradient-to-r from-purple-900/30 to-blue-900/30 rounded-lg border border-purple-500/30"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-medium text-purple-300">🧠 Smart Suggestions</span>
              {isAnalyzing && (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full"
                />
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((suggestion, index) => (
                <button
                  key={index}
                  onClick={suggestion.action}
                  className="px-3 py-2 bg-purple-600/50 hover:bg-purple-500/50 rounded-lg text-sm transition-colors border border-purple-400/30"
                  title={`Confidence: ${Math.round(suggestion.confidence * 100)}%`}
                >
                  {suggestion.description}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Canvas */}
      <div className="relative bg-white rounded-lg border border-gray-300 shadow-lg overflow-hidden">
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="block cursor-crosshair touch-none"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        />

        {/* Drawing info overlay */}
        <div className="absolute top-3 left-3 bg-black/60 text-white px-3 py-2 rounded-lg text-sm">
          <div className="font-medium">Interactive Drawing</div>
          <div className="text-xs opacity-75">
            {strokes.length} strokes • {currentTool} tool
          </div>
        </div>

        {/* Current tool indicator */}
        <div className="absolute top-3 right-3 bg-black/60 text-white px-3 py-2 rounded-lg text-sm">
          <div className="flex items-center gap-2">
            <div 
              className="w-4 h-4 rounded border border-white/30"
              style={{ backgroundColor: currentColor }}
            />
            <span className="capitalize">{currentTool}</span>
            <span className="text-xs opacity-75">{currentWidth}px</span>
          </div>
        </div>
      </div>

      {/* Drawing stats */}
      <div className="text-xs text-gray-400 text-center">
        {strokes.length > 0 && (
          <span>
            {strokes.length} stroke{strokes.length !== 1 ? 's' : ''} • 
            {strokes.reduce((total, stroke) => total + stroke.points.length, 0)} points drawn
          </span>
        )}
        {strokes.length === 0 && (
          <span>Start drawing to create diagrams and visual explanations</span>
        )}
      </div>
    </div>
  );
}

// Export utility function for easy integration
export const createInteractiveDrawingCanvas = (canvas: HTMLCanvasElement) => {
  return {
    width: canvas.width,
    height: canvas.height,
    element: canvas
  };
};
