import { useEffect, useState } from "react";
import {
  parseBookWithChapters,
  generateProgressiveReadingHTML,
  generateHybridHTML,
} from "../lib/parser";

interface HybridReaderProps {
  file: File;
  chapters?: { title: string; page: number }[];
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
  const [text, setText] = useState("");
  const [html, setHtml] = useState("");

  useEffect(() => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const content = e.target?.result as string;
      setText(content);

      const { chapters: parsedChapters, parsedUnits } = await parseBookWithChapters(content);

      let generated = "";

      if (mode === "rightbrain") {
        // 🧠 Right Brain Mode: Alternating color units (black/gray) with optional enhancements
        generated = generateProgressiveReadingHTML(parsedUnits);
      } else {
        // 🤝 Hybrid Mode: TOC + Highlighted Units + optional jump logic
        generated = generateHybridHTML(parsedChapters, parsedUnits, currentPage || 1);
      }

      setHtml(generated);
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