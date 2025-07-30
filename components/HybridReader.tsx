"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import Loader from "@/components/ui/loader";
import {
  parseBookWithChapters,
  generateHybridHTML,
  generateProgressiveReadingHTML,
  getPdfViewerHTML,
} from "@/lib/parser";

const DynamicViewer = dynamic(() => import("./ui/Viewer"), {
  ssr: false,
  loading: () => <Loader label="Loading PDF..." />,
});

export default function HybridReader() {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<"original" | "progressive" | "hybrid">("original");
  const [progressiveView, setProgressiveView] = useState<JSX.Element | null>(null);
  const [hybridView, setHybridView] = useState<string | null>(null);
  const [pdfURL, setPdfURL] = useState<string>("");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (uploadedFile) {
      setFile(uploadedFile);
      const blobURL = URL.createObjectURL(uploadedFile);
      setPdfURL(blobURL);
    }
  };

  useEffect(() => {
    const loadViews = async () => {
      if (!file) return;

      setLoading(true);
      try {
        const { parsedUnits, chapters } = await parseBookWithChapters(file);
        const rawText = parsedUnits.map((unit) => unit.join(" ")).join("\n");
        setProgressiveView(generateProgressiveReadingHTML(rawText));
        setHybridView(generateHybridHTML(chapters, parsedUnits));
      } catch (error) {
        console.error("Failed to parse file:", error);
        setHybridView("<p class='text-red-500'>Failed to process file.</p>");
      } finally {
        setLoading(false);
      }
    };

    loadViews();
  }, [file]);

  const renderContent = () => {
    if (loading) return <Loader label="Processing your file..." />;
    if (!file) return <p className="text-gray-400">Upload a textbook to get started.</p>;

    switch (viewMode) {
      case "original":
        return (
          <div className="border rounded overflow-hidden">
            <DynamicViewer fileUrl={pdfURL} />
          </div>
        );
      case "progressive":
        return progressiveView;
      case "hybrid":
        return (
          <div className="grid md:grid-cols-2 gap-6">
            <div className="border rounded overflow-hidden">
              <DynamicViewer fileUrl={pdfURL} />
            </div>
            <ScrollArea className="h-[80vh] border rounded p-4 bg-white dark:bg-zinc-900">
              <div
                ref={contentRef}
                className="prose prose-sm sm:prose-base max-w-none dark:prose-invert"
                dangerouslySetInnerHTML={{ __html: hybridView || "" }}
              />
            </ScrollArea>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <main className="p-6 max-w-5xl mx-auto">
      <header className="mb-6 text-center">
        <h1 className="text-4xl font-bold text-pink-500">Thought-Unit Reader</h1>
        <p className="text-sm text-gray-300">Read deeper, faster, and smarter.</p>
      </header>

      <Label className="block mb-2">Upload a file (PDF, DOCX, or TXT):</Label>
      <input
        type="file"
        accept=".pdf,.docx,.txt"
        ref={fileRef}
        className="mb-4"
        onChange={handleFileChange}
      />

      <div className="flex gap-4 mt-2 mb-6">
        <Button onClick={() => setViewMode("original")} variant="secondary">
          Original View
        </Button>
        <Button onClick={() => setViewMode("progressive")} variant="outline">
          Progressive
        </Button>
        <Button onClick={() => setViewMode("hybrid")} variant="default">
          Hybrid View
        </Button>
      </div>

      <section className="mt-4">{renderContent()}</section>
    </main>
  );
}