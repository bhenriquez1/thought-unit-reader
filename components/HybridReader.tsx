"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Loader from "@/components/ui/loader";

import {
  parseBookWithChapters,
  getPdfViewerHTML,
} from "@/lib/parser";

const DynamicViewer = dynamic(() => import("./Viewer"), {
  ssr: false,
  loading: () => <Loader label="Loading PDF..." />,
});

type ViewMode = "hybrid" | "pdf" | "text";

interface HybridReaderProps {
  file: File;
  scale?: number;
}

export default function HybridReader({ file, scale = 1.5 }: HybridReaderProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("hybrid");
  const [parsedUnits, setParsedUnits] = useState<string | null>(null);
  const [pdfURL, setPdfURL] = useState<string>("");
  const [filename, setFilename] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const processFile = async () => {
      setLoading(true);
      try {
        const text = await file.text();
        const name = file.name;
        setFilename(name);

        const { parsedUnits } = await parseBookWithChapters(file);

        const html = parsedUnits
          .map(
            (chapter, idx) =>
              `<div class="mb-8">${chapter
                .map(
                  (unit) =>
                    `<p class="text-lg leading-relaxed">${unit
                      .map((word, i) =>
                        `<span class="${i % 2 === 0 ? "text-black" : "text-gray-500"}">${word}</span>`
                      )
                      .join(" ")}</p>`
                )
                .join("")}</div>`
          )
          .join("");

        setParsedUnits(html);

        const blobURL = URL.createObjectURL(file);
        setPdfURL(blobURL);
      } catch (error) {
        console.error("Failed to parse:", error);
        setParsedUnits(`<p class="text-red-500">Error parsing file.</p>`);
      } finally {
        setLoading(false);
      }
    };

    if (file) processFile();
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

      {/* PDF Viewer Only */}
      {viewMode === "pdf" && pdfURL && (
        <DynamicViewer fileUrl={pdfURL} />
      )}

      {/* Text Only */}
      {viewMode === "text" && parsedUnits && (
        <ScrollArea className="h-[80vh] border p-4 rounded bg-white dark:bg-zinc-900">
          <div
            ref={ref}
            className="prose dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: parsedUnits }}
          />
        </ScrollArea>
      )}

      {/* Hybrid */}
      {viewMode === "hybrid" && (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="border rounded overflow-hidden">
            <DynamicViewer fileUrl={pdfURL} />
          </div>
          <ScrollArea className="h-[80vh] border rounded p-4 bg-white dark:bg-zinc-900">
            <div
              ref={ref}
              className="prose dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: parsedUnits }}
            />
          </ScrollArea>
        </div>
      )}
    </div>
  );
}