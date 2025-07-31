import { useEffect, useState } from "react";
import { parseTextToUnits } from "@/lib/parser";

interface ParsedTextProps {
  inputText?: string;
  parsedUnits?: string[][];
  extension?: string; // Made optional
}

export default function ParsedText({ inputText, parsedUnits, extension }: ParsedTextProps) {
  const [units, setUnits] = useState<string[][]>([]);

  useEffect(() => {
    if (parsedUnits && parsedUnits.length > 0) {
      setUnits(parsedUnits);
    } else if (inputText) {
      const result = parseTextToUnits(inputText);
      setUnits(result);
    }
  }, [inputText, parsedUnits]);

  return (
    <div className="prose prose-sm sm:prose-base max-w-none dark:prose-invert">
      {units.map((sentenceGroup, i) => (
        <p key={i} className="mb-4">
          {sentenceGroup.map((phrase, j) => (
            <span
              key={j}
              className={`mr-1 ${
                j % 2 === 0 ? "text-black dark:text-white" : "text-gray-500 dark:text-gray-400"
              }`}
            >
              {phrase}
            </span>
          ))}
        </p>
      ))}
    </div>
  );
}