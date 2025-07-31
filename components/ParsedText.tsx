import { useEffect, useState } from "react";

// Import the parser directly - ensure it returns the expected type
function parseTextToUnits(text: string): string[][] {
  if (!text) return [[]];
  
  const sentences = text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/) // Split at sentence boundaries
    .map(sentence => sentence.trim())
    .filter(sentence => sentence.length > 0);
  
  // Group sentences into paragraphs
  const paragraphs: string[][] = [];
  let currentParagraph: string[] = [];
  
  sentences.forEach(sentence => {
    currentParagraph.push(sentence);
    
    // If the sentence ends with a paragraph break, start a new paragraph
    if (sentence.includes("\n\n") || currentParagraph.length > 5) {
      paragraphs.push([...currentParagraph]);
      currentParagraph = [];
    }
  });
  
  // Add any remaining sentences as a paragraph
  if (currentParagraph.length > 0) {
    paragraphs.push(currentParagraph);
  }
  
  // Ensure we return string[][] even if there's only one paragraph
  return paragraphs.length > 0 ? paragraphs : [[]];
}

interface ParsedTextProps {
  inputText?: string;
  parsedUnits?: string[][] | string[];
  extension?: string; // Made optional
}

export default function ParsedText({ inputText, parsedUnits, extension }: ParsedTextProps) {
  const [units, setUnits] = useState<string[][]>([[]]);

  useEffect(() => {
    if (parsedUnits) {
      // Handle both string[][] and string[] inputs
      if (Array.isArray(parsedUnits)) {
        if (parsedUnits.length === 0) {
          setUnits([[]]);
        } else if (Array.isArray(parsedUnits[0])) {
          // It's already string[][]
          setUnits(parsedUnits as string[][]);
        } else {
          // It's string[], convert to string[][]
          setUnits([parsedUnits as string[]]);
        }
      } else {
        // Fallback for unexpected input
        setUnits([[]]);
        console.error("parsedUnits is not an array");
      }
    } else if (inputText) {
      try {
        // Parse text directly using our local implementation
        const result = parseTextToUnits(inputText);
        setUnits(result);
      } catch (error) {
        console.error("Error parsing text to units:", error);
        setUnits([[]]);
      }
    } else {
      // No input provided
      setUnits([[]]);
    }
  }, [inputText, parsedUnits]);

  // Render with careful type checking at each step
  return (
    <div className="prose prose-sm sm:prose-base max-w-none dark:prose-invert">
      {units.map((sentenceGroup, i) => (
        <p key={i} className="mb-4">
          {Array.isArray(sentenceGroup) ? (
            // It's an array of strings, render each phrase
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
            // It's a single string, render it directly
            <span className="text-black dark:text-white">
              {typeof sentenceGroup === 'string' ? sentenceGroup : String(sentenceGroup)}
            </span>
          )}
        </p>
      ))}
    </div>
  );
}