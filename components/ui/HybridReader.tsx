// components/ui/HybridReader.tsx
import React, { useEffect, useState } from "react";
import { parseBookWithChapters, generateHybridHTML } from "../lib/parser";

interface HybridReaderProps {
  file: File | null;
  currentPage: number;
  onChaptersDetected?: (chapters: string[]) => void;
}

const HybridReader: React.FC<HybridReaderProps> = ({ file, currentPage, onChaptersDetected }) => {
  const [htmlContent, setHtmlContent] = useState<string>("");

  useEffect(() => {
    const readFile = async () => {
      if (!file) return;
      const text = await file.text();
      const { chapters, parsedUnits } = await parseBookWithChapters(text);
      if (onChaptersDetected) onChaptersDetected(chapters);
      const html = generateHybridHTML(chapters, parsedUnits);
      setHtmlContent(html);
    };

    readFile();
  }, [file]);

  return (
    <div className="p-6 overflow-y-auto h-full">
      <div dangerouslySetInnerHTML={{ __html: htmlContent }} />
    </div>
  );
};

export default HybridReader;