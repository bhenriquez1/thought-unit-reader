"use client";

import React from "react";

interface ParsedTextProps {
  parsedUnits: string[][];
}

const ParsedText: React.FC<ParsedTextProps> = ({ parsedUnits }) => {
  return (
    <div className="space-y-4 p-4">
      {parsedUnits.map((unit, idx) => (
        <p
          key={idx}
          className="text-base leading-relaxed rounded px-2 py-1 shadow-sm"
        >
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
};

export default ParsedText;