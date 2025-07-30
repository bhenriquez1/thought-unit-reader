import { useEffect, useRef, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader } from "@/components/ui/loader";
import {
  parseBookWithChapters,
  getPdfViewerHTML,
  generateProgressiveReadingHTML,
} from "@/lib/parser";

interface HybridReaderProps {
  file: File;
  scale?: number;
}

export default function HybridReader({ file, scale = 1.5 }: HybridReaderProps) {
  const [htmlContent, setHtmlContent] = useState<JSX.Element | null>(null);
  const [pdfViewer, setPdfViewer] = useState<JSX.Element | null>(null);
  const [loading, setLoading] = useState(true);
  const [filename, setFilename] = useState("");

  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const processFile = async () => {
      setLoading(true);
      try {
        const text = await file.text();
        const name = file.name;
        setFilename(name);

        const { parsedUnits } = await parseBookWithChapters(file);

        const content = parsedUnits.map((chapter, idx) => (
          <div key={`chapter-${idx}`} className="mb-8">
            {chapter.map((unit, uIdx) => (
              <p key={`unit-${uIdx}`} className="text-lg leading-relaxed">
                {unit.map((word, i) => (
                  <span
                    key={i}
                    className={i % 2 === 0 ? "text-black" : "text-gray-500"}
                  >
                    {word}
                  </span>
                ))}
              </p>
            ))}
          </div>
        ));

        setHtmlContent(
          <ScrollArea className="h-full w-full p-4">
            <div
              ref={ref}
              className="prose dark:prose-invert max-w-none"
            >
              {content}
            </div>
          </ScrollArea>
        );

        const viewer = (
          <div
            className="mt-10"
            dangerouslySetInnerHTML={{
              __html: getPdfViewerHTML(name, 1, 10),
            }}
          />
        );
        setPdfViewer(viewer);
      } catch (error) {
        console.error("Failed to load and parse file:", error);
        setHtmlContent(<p className="text-red-500">Error parsing file.</p>);
      } finally {
        setLoading(false);
      }
    };

    processFile();
  }, [file, scale]);

  if (loading) return <Loader label="Processing Hybrid View..." />;

  return (
    <div className="mt-6 flex flex-col gap-8">
      {pdfViewer}
      <hr className="my-4 border-gray-300 dark:border-gray-600" />
      {htmlContent}
    </div>
  );
}