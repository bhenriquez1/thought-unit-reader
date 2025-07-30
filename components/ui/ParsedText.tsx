"use client";

import React from "react";

export interface ParsedTextProps {
  parsedUnits: string[][];
}

const ParsedText: React.FC<ParsedTextProps> = ({ parsedUnits }) => {
  return (
    <div className="space-y-4">
      {parsedUnits.map((unit, idx) => (
        <p
          key={idx}
          className="text-lg font-medium text-white bg-zinc-800 p-2 rounded shadow"
        >
          {unit.map((phrase, i) => (
            <span
              key={i}
              className={i % 2 === 0 ? "text-white" : "text-gray-400"}
            >
              {phrase}
            </span>
          ))}
        </p>
      ))}
    </div>
  );
};

export default ParsedText;