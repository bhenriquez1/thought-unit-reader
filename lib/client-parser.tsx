'use client';

// lib/client-parser.tsx
import React from 'react';
import { parseTextToThoughtUnits } from './parser';

// Client-side implementation of generateProgressiveReadingJSX
export function generateProgressiveReadingJSX(text: string): JSX.Element {
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
}