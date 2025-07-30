// components/ui/ParsedText.tsx
"use client";

import { useEffect, useState } from "react";

interface ParsedTextProps {
  inputText: string;
}

export default function ParsedText({ inputText }: ParsedTextProps) {
  const [sentences, setSentences] = useState<string[]>([]);

  useEffect(() => {
    const matches = inputText.match(/[^.!?\n]+[.!?\n]/g) || [];
    setSentences(matches.map((s) => s.trim()));
  }, [inputText]);

  return (
    <div className="space-y-2 text-base leading-relaxed">
      {sentences.map((sentence, i) => (
        <p key={i} className={i % 2 === 0 ? "text-white" : "text-gray-400"}>
          {sentence}
        </p>
      ))}
    </div>
  );
}