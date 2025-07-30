// components/ParsedText.tsx
import React from "react";

interface ParsedTextProps {
  text: string;
}

const ParsedText: React.FC<ParsedTextProps> = ({ text }) => {
  const lines = text.split("\n");

  return (
    <div className="space-y-2 p-4">
      {lines.map((line, idx) => (
        <p key={idx} className={idx % 2 === 0 ? "text-black" : "text-gray-500"}>
          {line}
        </p>
      ))}
    </div>
  );
};

export default ParsedText;