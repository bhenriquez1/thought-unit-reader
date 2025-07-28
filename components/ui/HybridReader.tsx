import { useEffect, useState } from "react";
import { parseBookWithChapters, generateProgressiveReadingHTML, generateHybridHTML } from "../lib/parser";

interface HybridReaderProps {
  file: File;
  chapters?: { title: string; page: number }[];
  currentPage?: number;
  onJumpToPage?: (page: number) => void;
  mode?: "hybrid" | "rightbrain";
}

export default function HybridReader({ file, chapters = [], currentPage = 1, onJumpToPage, mode = "hybrid" }: HybridReaderProps) {
  const [text, setText] = useState("");
  const [html, setHtml] = useState("");

  useEffect(() => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const content = e.target?.result as string;
      setText(content);
      const { chapters, parsedUnits } = await parseBookWithChapters(content);
      const generated = mode === "rightbrain"
        ? generateProgressiveReadingHTML(parsedUnits)
        : generateHybridHTML(chapters, parsedUnits);
      setHtml(generated);
    };

    reader.readAsText(file);
  }, [file, mode]);

  return (
    <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: html }} />
  );
}