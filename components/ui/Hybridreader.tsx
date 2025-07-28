import { useEffect, useState } from "react";
import {
  parseBookWithChapters,
  generateProgressiveReadingHTML,
  generateHybridHTML,
} from "../lib/parser";

interface Chapter {
  title: string;
  page: number;
}

interface HybridReaderProps {
  file: File;
  chapters?: Chapter[];
  currentPage?: number;
  onJumpToPage?: (page: number) => void;
  mode?: "hybrid" | "rightbrain";
}

export default function HybridReader({
  file,
  chapters = [],
  currentPage = 1,
  onJumpToPage,
  mode = "hybrid",
}: HybridReaderProps) {
  const [html, setHtml] = useState("");

  useEffect(() => {
    if (!file) return;

    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;

        const { chapters: parsedChapters, parsedUnits } =
          await parseBookWithChapters(content);

        let generatedHtml = "";

        if (mode === "rightbrain") {
          // 🧠 Right Brain Mode: Alternating colors (black/gray)
          generatedHtml = generateProgressiveReadingHTML(parsedUnits);
        } else {
          // 🤝 Hybrid Mode: TOC + Units
          generatedHtml = generateHybridHTML(
            parsedChapters ?? chapters,
            parsedUnits,
            currentPage
          );
        }

        setHtml(generatedHtml);
      } catch (error) {
        console.error("Error parsing file:", error);
        setHtml("<p>Error parsing the file.</p>");
      }
    };

    reader.readAsText(file);
  }, [file, mode, currentPage]);

  return (
    <div
      className="prose max-w-none dark:prose-invert p-4"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}