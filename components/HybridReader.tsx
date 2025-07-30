"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import Loader from "@/components/ui/loader";
import { parseBookWithChapters, generateHybridHTML } from "@/lib/parser";

type ViewMode = "hybrid" | "pdf" | "text";

interface HybridReaderProps {
  file: File;
  scale?: number;
}

const DynamicViewer = dynamic(() => import("./ui/Viewer"), {
  ssr: false,
  loading: () => <Loader label="Loading PDF..." />, 
});

export default function HybridReader({ file, scale = 1.5 }: HybridReaderProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("hybrid");
  const [content, setContent] = useState<string>("");
  const [pdfURL, setPdfURL] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const processFile = async () => {
      if (!file) return;
      setLoading(true);
      try {
        const { chapters, parsedUnits } = await parseBookWithChapters(file);
        const html = generateHybridHTML(chapters, parsedUnits);
        setContent(html);

        const blobURL = URL.createObjectURL(file);
        setPdfURL(blobURL);
      } catch (error) {
        console.error("Error parsing hybrid file:", error);
        setContent("<p class='text-red-500'>Failed to load content.</p>");
      } finally {
        setLoading(false);
      }
    };
    processFile();
  }, [file, scale]);

  if (!file) return <p className="text-center text-gray-500">No file provided.</p>;
  if (loading) return <Loader label="Processing Hybrid Reader..." />;

  return (
    <div className="w-full space-y-6 px-4 py-6">
      {/* View Selector */}
      <div className="flex items-center gap-4">
        <Label htmlFor="viewMode">View Mode:</Label>
        <select
          id="viewMode"
          className="border px-3 py-1 rounded"
          value={viewMode}
          onChange={(e) => setViewMode(e.target.value as ViewMode)}
        >
          <option value="hybrid">Hybrid View</option>
          <option value="pdf">PDF Only</option>
          <option value="text">Text Only</option>
        </select>
      </div>

      {/* PDF Only */}
      {viewMode === "pdf" && pdfURL && (
        <DynamicViewer fileUrl={pdfURL} />
      )}

      {/* Text Only */}
      {viewMode === "text" && content && (
        <ScrollArea className="h-[80vh] border p-4 rounded bg-white dark:bg-zinc-900">
          <div
            ref={ref}
            className="prose dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: content }}
          />
        </ScrollArea>
      )}

      {/* Hybrid View */}
      {viewMode === "hybrid" && (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="border rounded overflow-hidden">
            <DynamicViewer fileUrl={pdfURL} />
          </div>
          <ScrollArea className="h-[80vh] border rounded p-4 bg-white dark:bg-zinc-900">
            <div
              ref={ref}
              className="prose dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: content }}
            />
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
