// components/ui/ParsedText.tsx

import React from "react";

export interface ParsedTextProps {
  text: string;
}

const ParsedText: React.FC<ParsedTextProps> = ({ text }) => {
  return (
    <div className="whitespace-pre-wrap text-sm font-medium leading-relaxed">
      {text}
    </div>
  );
};

export default ParsedText;