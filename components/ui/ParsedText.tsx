// components/ParsedText.tsx

import React from "react";

interface ParsedTextProps {
  inputText: string;
}

const ParsedText: React.FC<ParsedTextProps> = ({ inputText }) => {
  const sentences =
    inputText.match(/[^.?!\n]+[.?!\n]+|[^.?!\n]+$/g) || [];

  return (
    <div className="space-y-2 text-base leading-relaxed">
      {sentences.map((sentence, i) => (
        <p
          key={i}
          className={i % 2 === 0 ? "text-white" : "text-gray-400"}
        >
          {sentence.trim()}
        </p>
      ))}
    </div>
  );
};

export default ParsedText;