"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import Loader from "@/components/ui/loader";
import ParsedText from "@/components/ui/ParsedText";
import {
  parseBookWithChapters,
  generateHybridHTML,
  generateProgressiveReadingHTML,
} from "@/lib/parser";

const DynamicViewer = dynamic(() => import("./ui/Viewer"), {
  ssr: false,
  loading: () => <Loader label="Loading PDF..." />,
});

export default function HybridReader() {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pdfURL, setPdfURL] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<"original" | "progressive" | "hybrid">("original");
  const [progressiveText, setProgressiveText] = useState<string | null>(null);
  const [hybridHTML, setHybridHTML] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploaded = e.target.files?.[0];
    if (uploaded) {
      setFile(uploaded);
      setPdfURL(URL.createObjectURL(uploaded));
    }
  };

  useEffect(() => {
    const loadContent = async () => {
      if (!file) return;
      setLoading(true);

      try {
        const { parsedUnits, chapters } = await parseBookWithChapters(file);
        const rawText = parsedUnits.map((unit) => unit.join(" ")).join("\n");
        setProgressiveText(rawText);
        setHybridHTML(generateHybridHTML(chapters, parsedUnits));
      } catch (err) {
        console.error("Error loading views:", err);
        setHybridHTML("<p class='text-red-500'>Failed to process file.</p>");
      } finally {
        setLoading(false);
      }
    };

    loadContent();
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
        return progressiveText ? <ParsedText text={progressiveText} /> : null;
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
                dangerouslySetInnerHTML={{ __html: hybridHTML || "" }}
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