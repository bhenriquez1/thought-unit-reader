'use client';

// lib/client-parser.tsx
import React from 'react';

// Parse text to thought units ensuring the result is string[][]
export function parseTextToThoughtUnits(text: string): string[][] {
  if (!text) return [[]];
  
  const sentences = text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/) // sentence boundaries
    .filter((s) => s.length > 0)
    .map((s) => s.trim());

  // Map each sentence to its thought units, creating a string[][]
  return sentences.map((sentence) =>
    sentence.split(/([,;:\-–\(\)\[\]\{\}]|\s+)/).filter(Boolean)
  );
}

// Client-side implementation of generateProgressiveReadingJSX
export function generateProgressiveReadingJSX(text: string): JSX.Element {
  // Handle empty text gracefully
  if (!text || text.trim() === '') {
    return (
      <div className="p-4 border rounded bg-gray-100 dark:bg-gray-800">
        <p className="text-gray-500 dark:text-gray-400">No content available</p>
      </div>
    );
  }

  try {
    const thoughtUnits = parseTextToThoughtUnits(text);
    
    return (
      <div className="space-y-4">
        {thoughtUnits.map((unit, idx) => (
          <p key={idx} className="text-lg font-medium text-black dark:text-white bg-gray-100 dark:bg-gray-800 p-2 rounded shadow">
            {unit.map((word, i) => (
              <span 
                key={i} 
                className={i % 2 === 0 ? "text-black dark:text-white" : "text-gray-500 dark:text-gray-400"}
              >
                {word}
              </span>
            ))}
          </p>
        ))}
      </div>
    );
  } catch (error) {
    console.error("Error generating progressive reading JSX:", error);
    return (
      <div className="p-4 border rounded bg-red-100 dark:bg-red-900">
        <p className="text-red-600 dark:text-red-300">Error processing text</p>
      </div>
    );
  }
}'use client';

// lib/client-parser.tsx
import React from 'react';
import { parseTextToThoughtUnits } from './parser';

// Parse text to thought units ensuring the result is string[][]
export function parseTextToThoughtUnits(text: string): string[][] {
  if (!text) return [[]];
  
  const sentences = text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/) // sentence boundaries
    .filter((s) => s.length > 0)
    .map((s) => s.trim());

  // Map each sentence to its thought units, creating a string[][]
  return sentences.map((sentence) =>
    sentence.split(/([,;:\-–\(\)\[\]\{\}]|\s+)/).filter(Boolean)
  );
}