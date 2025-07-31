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
      // Direct assignment of string[][] to string[][]
      setUnits(parsedUnits);
    } else if (inputText) {
      try {
        // Ensure parseTextToUnits returns string[][] not string[]
        const result = parseTextToUnits(inputText);
        // Wrap the result in an array if it's not already a string[][]
        if (Array.isArray(result) && result.length > 0 && Array.isArray(result[0])) {
          setUnits(result);
        } else if (Array.isArray(result)) {
          // If result is a string[], wrap it in another array to make it string[][]
          setUnits([result]);
        } else {
          // Fallback to empty array
          setUnits([]);
          console.error("parseTextToUnits returned unexpected format");
        }
      } catch (error) {
        console.error("Error parsing text to units:", error);
        setUnits([]);
      }
    }
  }, [inputText, parsedUnits]);

  return (
    <div className="prose prose-sm sm:prose-base max-w-none dark:prose-invert">
      {units.map((sentenceGroup, i) => (
        <p key={i} className="mb-4">
          {Array.isArray(sentenceGroup) ? (
            sentenceGroup.map((phrase, j) => (
              <span
                key={j}
                className={`mr-1 ${
                  j % 2 === 0 ? "text-black dark:text-white" : "text-gray-500 dark:text-gray-400"
                }`}
              >
                {phrase}
              </span>
            ))
          ) : (
            <span className="text-black dark:text-white">{String(sentenceGroup)}</span>
          )}
        </p>
      ))}
    </div>
  );
}