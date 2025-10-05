"use client";

import React, { useState, useRef, useEffect } from 'react';

interface ThoughtDetectionWidgetProps {
  onThoughtDetected?: (thought: string, analysis: any) => void;
  placeholder?: string;
  className?: string;
}

interface ThoughtAnalysis {
  sentiment: 'positive' | 'negative' | 'neutral';
  confidence: number;
  keywords: string[];
  concepts: string[];
  suggestions: string[];
  thoughtType: 'question' | 'insight' | 'confusion' | 'connection' | 'reflection';
}

export default function ThoughtDetectionWidget({
  onThoughtDetected,
  placeholder = "Write your thoughts here... I'll analyze and understand them.",
  className = ""
}: ThoughtDetectionWidgetProps) {
  const [thoughtText, setThoughtText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<ThoughtAnalysis | null>(null);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>();

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [thoughtText]);

  // Analyze thought with debouncing
  useEffect(() => {
    if (thoughtText.trim().length < 10) {
      setAnalysis(null);
      setShowAnalysis(false);
      return;
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(async () => {
      setIsAnalyzing(true);
      try {
        const result = await analyzeThoughtContent(thoughtText);
        setAnalysis(result);
        setShowAnalysis(true);
        onThoughtDetected?.(thoughtText, result);
      } catch (error) {
        console.error('Thought analysis failed:', error);
      } finally {
        setIsAnalyzing(false);
      }
    }, 1000);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [thoughtText, onThoughtDetected]);

  // Local thought analysis function
  const analyzeThoughtContent = async (text: string): Promise<ThoughtAnalysis> => {
    // Simulate AI analysis - in a real app, this would call an AI service
    await new Promise(resolve => setTimeout(resolve, 500));

    // Basic sentiment analysis
    const positiveWords = ['good', 'great', 'amazing', 'excellent', 'understand', 'clear', 'helpful', 'love', 'like', 'wonderful'];
    const negativeWords = ['bad', 'terrible', 'awful', 'confusing', 'difficult', 'hard', 'hate', 'dislike', 'frustrated', 'stuck'];
    const questionWords = ['what', 'why', 'how', 'when', 'where', 'which', 'who'];
    
    const lowerText = text.toLowerCase();
    const words = lowerText.split(/\s+/);
    
    const positiveCount = positiveWords.filter(word => lowerText.includes(word)).length;
    const negativeCount = negativeWords.filter(word => lowerText.includes(word)).length;
    const hasQuestion = questionWords.some(word => lowerText.includes(word)) || text.includes('?');
    
    let sentiment: 'positive' | 'negative' | 'neutral' = 'neutral';
    if (positiveCount > negativeCount) sentiment = 'positive';
    else if (negativeCount > positiveCount) sentiment = 'negative';
    
    // Detect thought type
    let thoughtType: ThoughtAnalysis['thoughtType'] = 'reflection';
    if (hasQuestion) thoughtType = 'question';
    else if (lowerText.includes('i think') || lowerText.includes('i realize')) thoughtType = 'insight';
    else if (lowerText.includes('confused') || lowerText.includes("don't understand")) thoughtType = 'confusion';
    else if (lowerText.includes('connect') || lowerText.includes('relate') || lowerText.includes('similar')) thoughtType = 'connection';
    
    // Extract keywords (simple approach)
    const stopWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could', 'can', 'may', 'might', 'must', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'this', 'that', 'these', 'those'];
    const keywords = words
      .filter(word => word.length > 3 && !stopWords.includes(word))
      .filter((word, index, arr) => arr.indexOf(word) === index)
      .slice(0, 5);
    
    // Generate suggestions based on thought type
    const suggestions = generateSuggestions(thoughtType, sentiment, keywords);
    
    return {
      sentiment,
      confidence: Math.random() * 0.3 + 0.7, // 70-100% confidence
      keywords,
      concepts: keywords.slice(0, 3), // Top concepts
      suggestions,
      thoughtType
    };
  };

  const generateSuggestions = (thoughtType: string, sentiment: string, keywords: string[]): string[] => {
    const suggestions: string[] = [];
    
    switch (thoughtType) {
      case 'question':
        suggestions.push("Try breaking this question into smaller parts");
        suggestions.push("Look for examples in the text");
        suggestions.push("Create a concept map to visualize the answer");
        break;
      case 'confusion':
        suggestions.push("Highlight the specific part that's confusing");
        suggestions.push("Try explaining it in your own words");
        suggestions.push("Look for analogies or examples");
        break;
      case 'insight':
        suggestions.push("Great insight! Try connecting this to other concepts");
        suggestions.push("Consider writing this as a study note");
        suggestions.push("Think about how this applies to other situations");
        break;
      case 'connection':
        suggestions.push("Excellent connection! Draw a diagram showing the relationship");
        suggestions.push("Look for more examples of this pattern");
        suggestions.push("This could be a great study card topic");
        break;
      default:
        suggestions.push("Consider expanding on this thought");
        suggestions.push("How does this connect to what you already know?");
        suggestions.push("What questions does this raise?");
    }
    
    return suggestions.slice(0, 3);
  };

  const getThoughtTypeIcon = (type: string) => {
    switch (type) {
      case 'question': return '❓';
      case 'insight': return '💡';
      case 'confusion': return '🤔';
      case 'connection': return '🔗';
      case 'reflection': return '🧠';
      default: return '💭';
    }
  };

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case 'positive': return 'text-green-600 bg-green-50';
      case 'negative': return 'text-red-600 bg-red-50';
      default: return 'text-blue-600 bg-blue-50';
    }
  };

  return (
    <div className={`thought-detection-widget ${className}`}>
      {/* Input Area */}
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={thoughtText}
          onChange={(e) => setThoughtText(e.target.value)}
          placeholder={placeholder}
          className="w-full min-h-[100px] p-4 border-2 border-gray-300 rounded-lg resize-none focus:border-blue-500 focus:outline-none transition-colors"
          style={{ maxHeight: '300px', overflow: 'auto' }}
        />
        
        {/* Analysis Indicator */}
        {isAnalyzing && (
          <div className="absolute top-2 right-2">
            <div className="flex items-center gap-2 bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm">
              <div className="animate-spin w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>
              Analyzing...
            </div>
          </div>
        )}
        
        {/* Character Count */}
        <div className="absolute bottom-2 right-2 text-xs text-gray-400">
          {thoughtText.length} characters
        </div>
      </div>

      {/* Analysis Results */}
      {showAnalysis && analysis && (
        <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">Thought Analysis</h3>
            <button
              onClick={() => setShowAnalysis(false)}
              className="text-gray-400 hover:text-gray-600 text-sm"
            >
              ✕
            </button>
          </div>
          
          {/* Thought Type and Sentiment */}
          <div className="flex items-center gap-4 mb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">{getThoughtTypeIcon(analysis.thoughtType)}</span>
              <span className="text-sm font-medium text-gray-700 capitalize">
                {analysis.thoughtType}
              </span>
            </div>
            
            <div className={`px-2 py-1 rounded-full text-xs font-medium ${getSentimentColor(analysis.sentiment)}`}>
              {analysis.sentiment} ({Math.round(analysis.confidence * 100)}% confidence)
            </div>
          </div>
          
          {/* Keywords */}
          {analysis.keywords.length > 0 && (
            <div className="mb-3">
              <span className="text-xs font-medium text-gray-600">Key concepts: </span>
              <div className="flex flex-wrap gap-1 mt-1">
                {analysis.keywords.map((keyword, index) => (
                  <span
                    key={index}
                    className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs"
                  >
                    {keyword}
                  </span>
                ))}
              </div>
            </div>
          )}
          
          {/* Suggestions */}
          {analysis.suggestions.length > 0 && (
            <div>
              <span className="text-xs font-medium text-gray-600">Suggestions:</span>
              <ul className="mt-1 space-y-1">
                {analysis.suggestions.map((suggestion, index) => (
                  <li key={index} className="text-xs text-gray-600 flex items-start gap-2">
                    <span className="text-green-500 mt-0.5">•</span>
                    {suggestion}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      
      {/* Quick Actions */}
      {thoughtText.trim() && (
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => setThoughtText('')}
            className="px-3 py-1 text-xs bg-gray-200 hover:bg-gray-300 rounded transition-colors"
          >
            Clear
          </button>
          <button
            onClick={() => {
              if (analysis) {
                // You can implement saving functionality here
                console.log('Saving thought:', { text: thoughtText, analysis });
              }
            }}
            className="px-3 py-1 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
            disabled={!analysis}
          >
            Save Thought
          </button>
        </div>
      )}
    </div>
  );
}
