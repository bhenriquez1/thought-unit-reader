"use client";

import React, { useState, useEffect } from 'react';
import { 
  TUExplanationData, 
  ConceptHighlight, 
  ButlerMetaphor,
  generateTUExplanation 
} from './core';

interface TUTextViewProps {
  text: string;
  explanation?: string;
  enhanced?: boolean;
  className?: string;
  onConceptClick?: (concept: ConceptHighlight) => void;
  onMetaphorClick?: (metaphor: ButlerMetaphor) => void;
}

interface TUTextViewState {
  tuData: TUExplanationData | null;
  loading: boolean;
  error: string | null;
  showMetaphors: boolean;
  showConcepts: boolean;
  selectedConcept: ConceptHighlight | null;
}

export function TUTextView({ 
  text, 
  explanation = "", 
  enhanced = true, 
  className = "",
  onConceptClick,
  onMetaphorClick 
}: TUTextViewProps) {
  const [state, setState] = useState<TUTextViewState>({
    tuData: null,
    loading: false,
    error: null,
    showMetaphors: true,
    showConcepts: true,
    selectedConcept: null
  });

  // Generate TU explanation when text changes
  useEffect(() => {
    if (!text.trim()) return;

    setState(prev => ({ ...prev, loading: true, error: null }));

    generateTUExplanation(text, explanation, enhanced)
      .then(tuData => {
        setState(prev => ({ 
          ...prev, 
          tuData, 
          loading: false 
        }));
      })
      .catch(error => {
        console.error('TU analysis failed:', error);
        setState(prev => ({ 
          ...prev, 
          error: error.message || 'Analysis failed', 
          loading: false 
        }));
      });
  }, [text, explanation, enhanced]);

  const handleConceptClick = (concept: ConceptHighlight) => {
    setState(prev => ({ 
      ...prev, 
      selectedConcept: prev.selectedConcept?.id === concept.id ? null : concept 
    }));
    onConceptClick?.(concept);
  };

  const handleMetaphorClick = (metaphor: ButlerMetaphor) => {
    onMetaphorClick?.(metaphor);
  };

  if (state.loading) {
    return (
      <div className={`tu-text-view loading ${className}`}>
        <div className="flex items-center justify-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">Analyzing with Thought Units...</span>
        </div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className={`tu-text-view error ${className}`}>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <span className="text-red-600 text-sm">⚠️ Analysis Error:</span>
            <span className="ml-2 text-red-700 text-sm">{state.error}</span>
          </div>
          <div className="mt-2">
            <button
              onClick={() => setState(prev => ({ ...prev, error: null, loading: true }))}
              className="text-xs px-3 py-1 bg-red-600 hover:bg-red-500 text-white rounded"
            >
              Retry Analysis
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!state.tuData) {
    return (
      <div className={`tu-text-view empty ${className}`}>
        <div className="text-center p-8 text-gray-500">
          <span className="text-2xl">🧠</span>
          <p className="mt-2 text-sm">No text provided for TU analysis</p>
        </div>
      </div>
    );
  }

  const { tuData } = state;

  return (
    <div className={`tu-text-view ${className}`}>
      {/* Controls */}
      <div className="tu-controls flex items-center justify-between p-3 bg-gradient-to-r from-blue-50 to-purple-50 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">🧠 Thought-Unit View</span>
          <span className={`text-xs px-2 py-1 rounded ${
            tuData.understandingLevel === 'mastery' ? 'bg-green-100 text-green-800' :
            tuData.understandingLevel === 'deep' ? 'bg-blue-100 text-blue-800' :
            'bg-orange-100 text-orange-800'
          }`}>
            {tuData.understandingLevel.toUpperCase()}
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => setState(prev => ({ ...prev, showConcepts: !prev.showConcepts }))}
            className={`text-xs px-2 py-1 rounded ${
              state.showConcepts 
                ? 'bg-purple-600 text-white' 
                : 'bg-gray-200 text-gray-700'
            }`}
          >
            Concepts
          </button>
          <button
            onClick={() => setState(prev => ({ ...prev, showMetaphors: !prev.showMetaphors }))}
            className={`text-xs px-2 py-1 rounded ${
              state.showMetaphors 
                ? 'bg-teal-600 text-white' 
                : 'bg-gray-200 text-gray-700'
            }`}
          >
            Metaphors
          </button>
        </div>
      </div>

      {/* Main Idea */}
      {tuData.mainIdea && (
        <div className="tu-main-idea p-4 bg-gradient-to-r from-amber-50 to-yellow-50 border-b border-amber-200">
          <h3 className="text-sm font-semibold text-amber-800 mb-2">🎯 Main Idea</h3>
          <p className="text-sm text-amber-900 leading-relaxed">{tuData.mainIdea}</p>
        </div>
      )}

      {/* Butler Metaphors */}
      {state.showMetaphors && tuData.butlerMetaphors.length > 0 && (
        <div className="tu-metaphors p-4 bg-gradient-to-r from-teal-50 to-cyan-50 border-b border-teal-200">
          <h3 className="text-sm font-semibold text-teal-800 mb-3">🎭 David Butler Metaphors</h3>
          <div className="space-y-3">
            {tuData.butlerMetaphors.map((metaphor, idx) => (
              <div 
                key={idx}
                className="bg-white border-l-4 border-teal-400 rounded p-3 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => handleMetaphorClick(metaphor)}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">{metaphor.visualCue}</span>
                  <span className="text-xs font-semibold text-teal-600 uppercase">
                    {metaphor.concept}
                  </span>
                </div>
                <div className="text-xs text-gray-600 mb-1">
                  <strong>Think of it as:</strong> {metaphor.metaphor}
                </div>
                <div className="text-xs text-gray-700 italic">
                  {metaphor.explanation}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Supporting Details */}
      {tuData.supportingDetails.length > 0 && (
        <div className="tu-supporting p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-200">
          <h3 className="text-sm font-semibold text-blue-800 mb-3">📋 Supporting Details</h3>
          <ul className="space-y-2">
            {tuData.supportingDetails.map((detail, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="text-blue-500 font-bold text-xs mt-1">•</span>
                <span className="text-sm text-blue-900 leading-relaxed">{detail}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Key Terms */}
      {tuData.keyTerms.length > 0 && (
        <div className="tu-key-terms p-4 bg-gradient-to-r from-green-50 to-emerald-50 border-b border-green-200">
          <h3 className="text-sm font-semibold text-green-800 mb-3">🔑 Key Terms</h3>
          <div className="flex flex-wrap gap-2">
            {tuData.keyTerms.map((term, idx) => (
              <span
                key={idx}
                className="px-3 py-1 bg-green-200 text-green-800 rounded-full text-xs font-medium cursor-pointer hover:bg-green-300 transition-colors"
                onClick={() => {
                  // Could trigger definition lookup or highlight in text
                  console.log('Key term clicked:', term);
                }}
              >
                {term}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Concept Highlights */}
      {state.showConcepts && tuData.conceptHighlights.length > 0 && (
        <div className="tu-concepts p-4 bg-gradient-to-r from-purple-50 to-pink-50 border-b border-purple-200">
          <h3 className="text-sm font-semibold text-purple-800 mb-3">🎨 Concept Highlights</h3>
          <div className="space-y-2">
            {tuData.conceptHighlights.slice(0, 8).map((concept, idx) => (
              <div
                key={concept.id}
                className={`p-2 rounded cursor-pointer transition-all ${
                  state.selectedConcept?.id === concept.id 
                    ? 'ring-2 ring-purple-400 shadow-md' 
                    : 'hover:shadow-sm'
                }`}
                style={{ 
                  backgroundColor: concept.color + '20',
                  borderLeft: `3px solid ${concept.color}`
                }}
                onClick={() => handleConceptClick(concept)}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-purple-700 uppercase">
                    {concept.type.replace('-', ' ')}
                  </span>
                  <div className="flex items-center gap-1">
                    <div 
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: concept.color }}
                    ></div>
                    <span className="text-xs text-gray-500">
                      {Math.round(concept.importance * 100)}%
                    </span>
                  </div>
                </div>
                <p className="text-xs text-gray-700 leading-relaxed">
                  {concept.text.slice(0, 120)}
                  {concept.text.length > 120 ? '...' : ''}
                </p>
                {concept.visualMetaphor && (
                  <div className="mt-1 text-xs text-purple-600 italic">
                    💭 {concept.visualMetaphor}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Visual Metaphors */}
      {tuData.visualMetaphors.length > 0 && (
        <div className="tu-visual-metaphors p-4 bg-gradient-to-r from-orange-50 to-red-50 border-b border-orange-200">
          <h3 className="text-sm font-semibold text-orange-800 mb-3">🌟 Visual Understanding</h3>
          <div className="space-y-2">
            {tuData.visualMetaphors.map((metaphor, idx) => (
              <div key={idx} className="bg-white rounded p-2 border-l-4 border-orange-400">
                <p className="text-sm text-orange-900 italic">{metaphor}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Original Text (Collapsible) */}
      <details className="tu-original-text">
        <summary className="p-3 bg-gray-50 border-b border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors">
          <span className="text-sm font-medium text-gray-700">📄 Original Text</span>
        </summary>
        <div className="p-4 bg-white">
          <pre className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed font-sans">
            {tuData.originalText}
          </pre>
        </div>
      </details>
    </div>
  );
}

// Simplified TU Text View for inline use
export function SimpleTUTextView({ 
  text, 
  explanation = "", 
  className = "" 
}: Pick<TUTextViewProps, 'text' | 'explanation' | 'className'>) {
  const [tuData, setTuData] = useState<TUExplanationData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!text.trim()) return;

    setLoading(true);
    generateTUExplanation(text, explanation, false) // Use basic analysis for speed
      .then(setTuData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [text, explanation]);

  if (loading) {
    return (
      <div className={`simple-tu-view ${className}`}>
        <div className="animate-pulse bg-gray-200 h-4 rounded mb-2"></div>
        <div className="animate-pulse bg-gray-200 h-3 rounded w-3/4"></div>
      </div>
    );
  }

  if (!tuData) return null;

  return (
    <div className={`simple-tu-view ${className}`}>
      {tuData.mainIdea && (
        <div className="mb-2">
          <span className="text-xs font-medium text-amber-700">💡 Main Idea:</span>
          <p className="text-sm text-gray-700 mt-1">{tuData.mainIdea}</p>
        </div>
      )}
      
      {tuData.butlerMetaphors.length > 0 && (
        <div className="mb-2">
          <span className="text-xs font-medium text-teal-700">🎭 Think of it as:</span>
          <p className="text-sm text-gray-700 mt-1 italic">
            {tuData.butlerMetaphors[0].explanation}
          </p>
        </div>
      )}
      
      {tuData.keyTerms.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {tuData.keyTerms.slice(0, 3).map((term, idx) => (
            <span
              key={idx}
              className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs"
            >
              {term}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default TUTextView;
